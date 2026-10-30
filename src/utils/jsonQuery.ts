/**
 * Small JSONPath evaluator for interactive querying.
 *
 * Supported:
 *   $                     root
 *   .key  ['key']  ["k"]  child member
 *   [0]  [-1]             array index (negative counts from end)
 *   .*  [*]               all children
 *   ..key  ..*  ..[0]     recursive descent
 *   [0,2]  ['a','b']      unions
 *   [1:5]  [::2]  [-3:]   slices
 *   [?(@.price > 10 && @.tags)]   filters: == != < <= > >= =~ /re/flags, && || !, parentheses
 *
 * jq-style shorthand is accepted too: `.items[].id` becomes `$.items[*].id`.
 */

export type Segment = string | number;

export interface QueryMatch {
  path: Segment[];
  value: unknown;
}

export class QueryError extends Error {
  constructor(
    message: string,
    public readonly position: number
  ) {
    super(message);
    this.name = "QueryError";
  }
}

type Selector =
  | { type: "child"; key: Segment }
  | { type: "wildcard" }
  | { type: "union"; keys: Segment[] }
  | { type: "slice"; start: number | null; end: number | null; step: number }
  | { type: "filter"; expr: Expr };

type Step = { recursive: boolean; selector: Selector };

type Expr =
  | { type: "path"; segments: Segment[] }
  | { type: "literal"; value: unknown }
  | { type: "regex"; re: RegExp }
  | { type: "not"; expr: Expr }
  | { type: "binary"; op: string; left: Expr; right: Expr };

const IDENT_CHAR = /[^.[\]\s()=!<>&|,'"]/;

export function normalizeQuery(query: string): string {
  let q = query.trim();
  if (q.startsWith(".")) q = `$${q === "." ? "" : q}`;
  return q.replace(/\[\]/g, "[*]");
}

/* ------------------------------------------------------------------ parser */

function readQuoted(s: string, i: number): { value: string; next: number } {
  const quote = s[i];
  let out = "";
  let j = i + 1;
  while (j < s.length && s[j] !== quote) {
    if (s[j] === "\\" && j + 1 < s.length) {
      j++;
    }
    out += s[j];
    j++;
  }
  if (s[j] !== quote) throw new QueryError("Unterminated string", i);
  return { value: out, next: j + 1 };
}

function readIdent(s: string, i: number): { value: string; next: number } {
  let j = i;
  while (j < s.length && IDENT_CHAR.test(s[j])) j++;
  if (j === i) throw new QueryError("Expected a property name", i);
  return { value: s.slice(i, j), next: j };
}

function findClosing(s: string, i: number, open: string, close: string): number {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === "'" || c === '"') {
      j = readQuoted(s, j).next - 1;
    } else if (c === "/" && open === "(") {
      // skip regex literal if it looks like one (after an =~ operator)
      const before = s.slice(0, j).trimEnd();
      if (before.endsWith("=~")) {
        let k = j + 1;
        while (k < s.length && s[k] !== "/") {
          if (s[k] === "\\") k++;
          k++;
        }
        j = k;
      }
    } else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return j;
    }
  }
  throw new QueryError(`Missing '${close}'`, i);
}

function parseBracket(s: string, i: number): { selector: Selector; next: number } {
  // s[i] === "["
  let j = i + 1;
  while (s[j] === " ") j++;
  if (s[j] === "*") {
    j++;
    while (s[j] === " ") j++;
    if (s[j] !== "]") throw new QueryError("Expected ']'", j);
    return { selector: { type: "wildcard" }, next: j + 1 };
  }
  if (s[j] === "?") {
    j++;
    while (s[j] === " ") j++;
    let exprSrc: string;
    let after: number;
    if (s[j] === "(") {
      const close = findClosing(s, j, "(", ")");
      exprSrc = s.slice(j + 1, close);
      after = close + 1;
    } else {
      const close = findClosing(s, i, "[", "]");
      exprSrc = s.slice(j, close);
      after = close;
    }
    while (s[after] === " ") after++;
    if (s[after] !== "]") throw new QueryError("Expected ']' after filter", after);
    return { selector: { type: "filter", expr: parseExpr(exprSrc, j) }, next: after + 1 };
  }

  const close = findClosing(s, i, "[", "]");
  const body = s.slice(i + 1, close).trim();
  if (!body) throw new QueryError("Empty brackets", i);

  if (/^-?\d*\s*:\s*-?\d*(\s*:\s*-?\d*)?$/.test(body)) {
    const [a, b, c] = body.split(":").map((x) => x.trim());
    const num = (x: string | undefined) => (x === undefined || x === "" ? null : Number(x));
    const step = num(c) ?? 1;
    if (step === 0) throw new QueryError("Slice step cannot be 0", i);
    return { selector: { type: "slice", start: num(a), end: num(b), step }, next: close + 1 };
  }

  const keys: Segment[] = [];
  let k = 0;
  while (k < body.length) {
    while (body[k] === " ") k++;
    if (body[k] === "'" || body[k] === '"') {
      const q = readQuoted(body, k);
      keys.push(q.value);
      k = q.next;
    } else {
      const m = /^-?\d+/.exec(body.slice(k));
      if (!m) throw new QueryError(`Unexpected '${body[k]}' in brackets`, i + 1 + k);
      keys.push(Number(m[0]));
      k += m[0].length;
    }
    while (body[k] === " ") k++;
    if (k < body.length) {
      if (body[k] !== ",") throw new QueryError("Expected ',' or ']'", i + 1 + k);
      k++;
    }
  }
  return {
    selector: keys.length === 1 ? { type: "child", key: keys[0] } : { type: "union", keys },
    next: close + 1
  };
}

export function compileQuery(query: string): Step[] {
  const s = normalizeQuery(query);
  if (!s.startsWith("$")) throw new QueryError("Query must start with '$' or '.'", 0);
  const steps: Step[] = [];
  let i = 1;
  while (i < s.length) {
    const c = s[i];
    if (c === " ") {
      i++;
      continue;
    }
    if (c === "." && s[i + 1] === ".") {
      i += 2;
      if (s[i] === "[") {
        const b = parseBracket(s, i);
        steps.push({ recursive: true, selector: b.selector });
        i = b.next;
      } else if (s[i] === "*") {
        steps.push({ recursive: true, selector: { type: "wildcard" } });
        i++;
      } else {
        const id = readIdent(s, i);
        steps.push({ recursive: true, selector: { type: "child", key: id.value } });
        i = id.next;
      }
    } else if (c === ".") {
      i++;
      if (s[i] === "*") {
        steps.push({ recursive: false, selector: { type: "wildcard" } });
        i++;
      } else if (s[i] === "[") {
        // tolerate `.["key"]` (jq style)
        continue;
      } else if (s[i] === '"' || s[i] === "'") {
        const q = readQuoted(s, i);
        steps.push({ recursive: false, selector: { type: "child", key: q.value } });
        i = q.next;
      } else {
        const id = readIdent(s, i);
        steps.push({ recursive: false, selector: { type: "child", key: id.value } });
        i = id.next;
      }
    } else if (c === "[") {
      const b = parseBracket(s, i);
      steps.push({ recursive: false, selector: b.selector });
      i = b.next;
    } else {
      throw new QueryError(`Unexpected '${c}'`, i);
    }
  }
  return steps;
}

/* ------------------------------------------------------- filter expressions */

type Tok = { t: "path"; v: Segment[] } | { t: "lit"; v: unknown } | { t: "re"; v: RegExp } | { t: "op"; v: string };

function tokenizeExpr(src: string, offset: number): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") {
      i++;
    } else if (c === "@") {
      i++;
      const segs: Segment[] = [];
      while (i < src.length) {
        if (src[i] === "." && src[i + 1] !== ".") {
          const id = readIdent(src, i + 1);
          segs.push(id.value);
          i = id.next;
        } else if (src[i] === "[") {
          const close = findClosing(src, i, "[", "]");
          const body = src.slice(i + 1, close).trim();
          if (body.startsWith("'") || body.startsWith('"')) segs.push(readQuoted(body, 0).value);
          else if (/^-?\d+$/.test(body)) segs.push(Number(body));
          else throw new QueryError("Unsupported selector in filter", offset + i);
          i = close + 1;
        } else break;
      }
      toks.push({ t: "path", v: segs });
    } else if (c === "'" || c === '"') {
      const q = readQuoted(src, i);
      toks.push({ t: "lit", v: q.value });
      i = q.next;
    } else if (c === "/" && toks.length && toks[toks.length - 1].t === "op" && (toks[toks.length - 1] as { v: string }).v === "=~") {
      let j = i + 1;
      let body = "";
      while (j < src.length && src[j] !== "/") {
        if (src[j] === "\\" && j + 1 < src.length) {
          body += src[j] + src[j + 1];
          j += 2;
          continue;
        }
        body += src[j];
        j++;
      }
      if (src[j] !== "/") throw new QueryError("Unterminated regex", offset + i);
      j++;
      let flags = "";
      while (j < src.length && /[gimsuy]/.test(src[j])) flags += src[j++];
      try {
        toks.push({ t: "re", v: new RegExp(body, flags.replace("g", "")) });
      } catch {
        throw new QueryError("Invalid regex", offset + i);
      }
      i = j;
    } else if (/[-\d]/.test(c) && /^-?\d/.test(src.slice(i))) {
      const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(src.slice(i))!;
      toks.push({ t: "lit", v: Number(m[0]) });
      i += m[0].length;
    } else if (/[a-z]/i.test(c)) {
      const m = /^[a-z]+/i.exec(src.slice(i))!;
      const w = m[0];
      if (w === "true") toks.push({ t: "lit", v: true });
      else if (w === "false") toks.push({ t: "lit", v: false });
      else if (w === "null") toks.push({ t: "lit", v: null });
      else throw new QueryError(`Unknown word '${w}'`, offset + i);
      i += w.length;
    } else {
      const two = src.slice(i, i + 2);
      if (["==", "!=", "<=", ">=", "&&", "||", "=~"].includes(two)) {
        toks.push({ t: "op", v: two });
        i += 2;
      } else if ("<>!()".includes(c)) {
        toks.push({ t: "op", v: c });
        i++;
      } else if (c === "=") {
        toks.push({ t: "op", v: "==" });
        i++;
      } else {
        throw new QueryError(`Unexpected '${c}' in filter`, offset + i);
      }
    }
  }
  return toks;
}

function parseExpr(src: string, offset: number): Expr {
  const toks = tokenizeExpr(src, offset);
  let p = 0;
  const peekOp = (v: string) => toks[p]?.t === "op" && (toks[p] as { v: string }).v === v;

  const primary = (): Expr => {
    const tok = toks[p];
    if (!tok) throw new QueryError("Incomplete filter expression", offset + src.length);
    if (tok.t === "op" && tok.v === "(") {
      p++;
      const e = or();
      if (!peekOp(")")) throw new QueryError("Missing ')'", offset + src.length);
      p++;
      return e;
    }
    if (tok.t === "op" && tok.v === "!") {
      p++;
      return { type: "not", expr: primary() };
    }
    p++;
    if (tok.t === "path") return { type: "path", segments: tok.v };
    if (tok.t === "lit") return { type: "literal", value: tok.v };
    if (tok.t === "re") return { type: "regex", re: tok.v };
    throw new QueryError(`Unexpected '${tok.v}'`, offset);
  };
  const comparison = (): Expr => {
    const left = primary();
    const tok = toks[p];
    if (tok?.t === "op" && ["==", "!=", "<", "<=", ">", ">=", "=~"].includes(tok.v)) {
      p++;
      return { type: "binary", op: tok.v, left, right: primary() };
    }
    return left;
  };
  const and = (): Expr => {
    let left = comparison();
    while (peekOp("&&")) {
      p++;
      left = { type: "binary", op: "&&", left, right: comparison() };
    }
    return left;
  };
  const or = (): Expr => {
    let left = and();
    while (peekOp("||")) {
      p++;
      left = { type: "binary", op: "||", left, right: and() };
    }
    return left;
  };
  const e = or();
  if (p < toks.length) throw new QueryError("Unexpected trailing tokens in filter", offset);
  return e;
}

function getChild(value: unknown, key: Segment): unknown {
  if (Array.isArray(value)) {
    if (typeof key !== "number") return key === "length" ? value.length : undefined;
    return value[key < 0 ? value.length + key : key];
  }
  if (value !== null && typeof value === "object") {
    return Object.prototype.hasOwnProperty.call(value, key) ? (value as Record<string, unknown>)[String(key)] : undefined;
  }
  if (typeof value === "string" && key === "length") return value.length;
  return undefined;
}

function truthy(v: unknown): boolean {
  return v !== undefined && v !== null && v !== false;
}

function evalExpr(e: Expr, current: unknown): unknown {
  switch (e.type) {
    case "path":
      return e.segments.reduce<unknown>((acc, seg) => getChild(acc, seg), current);
    case "literal":
      return e.value;
    case "regex":
      return e.re;
    case "not":
      return !truthy(evalExpr(e.expr, current));
    case "binary": {
      if (e.op === "&&") return truthy(evalExpr(e.left, current)) && truthy(evalExpr(e.right, current));
      if (e.op === "||") return truthy(evalExpr(e.left, current)) || truthy(evalExpr(e.right, current));
      const l = evalExpr(e.left, current);
      const r = evalExpr(e.right, current);
      switch (e.op) {
        case "==":
          return l === r;
        case "!=":
          return l !== r;
        case "=~":
          return typeof l === "string" && r instanceof RegExp && r.test(l);
        default: {
          const comparable =
            (typeof l === "number" && typeof r === "number") || (typeof l === "string" && typeof r === "string");
          if (!comparable) return false;
          const a = l as number | string;
          const b = r as number | string;
          if (e.op === "<") return a < b;
          if (e.op === "<=") return a <= b;
          if (e.op === ">") return a > b;
          return a >= b;
        }
      }
    }
  }
}

/* --------------------------------------------------------------- evaluator */

function children(node: QueryMatch): QueryMatch[] {
  const { value, path } = node;
  if (Array.isArray(value)) return value.map((v, i) => ({ path: [...path, i], value: v }));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).map(([k, v]) => ({ path: [...path, k], value: v }));
  }
  return [];
}

function descendantsAndSelf(node: QueryMatch, out: QueryMatch[]): void {
  out.push(node);
  for (const c of children(node)) descendantsAndSelf(c, out);
}

function applySelector(node: QueryMatch, sel: Selector, out: QueryMatch[]): void {
  const { value, path } = node;
  switch (sel.type) {
    case "child": {
      const keys = [sel.key];
      applyKeys(value, path, keys, out);
      break;
    }
    case "union":
      applyKeys(value, path, sel.keys, out);
      break;
    case "wildcard":
      out.push(...children(node));
      break;
    case "slice": {
      if (!Array.isArray(value)) break;
      const len = value.length;
      const norm = (n: number) => (n < 0 ? Math.max(len + n, 0) : Math.min(n, len));
      if (sel.step > 0) {
        const start = sel.start === null ? 0 : norm(sel.start);
        const end = sel.end === null ? len : norm(sel.end);
        for (let i = start; i < end; i += sel.step) out.push({ path: [...path, i], value: value[i] });
      } else {
        const start = sel.start === null ? len - 1 : Math.min(norm(sel.start), len - 1);
        const end = sel.end === null ? -1 : norm(sel.end);
        for (let i = start; i > end; i += sel.step) out.push({ path: [...path, i], value: value[i] });
      }
      break;
    }
    case "filter":
      for (const c of children(node)) {
        if (truthy(evalExpr(sel.expr, c.value))) out.push(c);
      }
      break;
  }
}

function applyKeys(value: unknown, path: Segment[], keys: Segment[], out: QueryMatch[]): void {
  for (const key of keys) {
    if (Array.isArray(value)) {
      if (typeof key !== "number") continue;
      const idx = key < 0 ? value.length + key : key;
      if (idx >= 0 && idx < value.length) out.push({ path: [...path, idx], value: value[idx] });
    } else if (value !== null && typeof value === "object") {
      const k = String(key);
      if (Object.prototype.hasOwnProperty.call(value, k)) {
        out.push({ path: [...path, k], value: (value as Record<string, unknown>)[k] });
      }
    }
  }
}

export interface QueryResult {
  matches: QueryMatch[];
  truncated: boolean;
}

export function runQuery(root: unknown, query: string, limit = 5000): QueryResult {
  const steps = compileQuery(query);
  let current: QueryMatch[] = [{ path: ["$"], value: root }];
  for (const step of steps) {
    const next: QueryMatch[] = [];
    for (const node of current) {
      if (step.recursive) {
        const all: QueryMatch[] = [];
        descendantsAndSelf(node, all);
        for (const d of all) applySelector(d, step.selector, next);
      } else {
        applySelector(node, step.selector, next);
      }
    }
    current = next;
  }
  const truncated = current.length > limit;
  return { matches: truncated ? current.slice(0, limit) : current, truncated };
}
