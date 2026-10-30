export type Segment = string | number;

export type RowType = "leaf" | "open" | "collapsed" | "close";

export interface Row {
  id: string;
  key: string;
  path: Segment[];
  depth: number;
  name: Segment | null;
  value: unknown;
  type: RowType;
  isLast: boolean;
  isArray: boolean;
  size: number;
}

export const pathKey = (p: Segment[]): string => p.map(String).join("\u0000");

export function isContainer(v: unknown): v is object {
  return v !== null && typeof v === "object";
}

export function entriesOf(value: object, sortKeys: boolean): [Segment, unknown][] {
  if (Array.isArray(value)) return value.map((v, i) => [i, v]);
  const e = Object.entries(value);
  if (sortKeys) e.sort(([a], [b]) => a.localeCompare(b));
  return e;
}

export function sizeOf(value: object): number {
  return Array.isArray(value) ? value.length : Object.keys(value).length;
}

/** Flattens the visible part of the tree into rows for a virtualized list. */
export function flattenTree(root: unknown, expanded: Set<string>, sortKeys: boolean): Row[] {
  const rows: Row[] = [];
  const visit = (value: unknown, path: Segment[], name: Segment | null, depth: number, isLast: boolean) => {
    const key = pathKey(path);
    if (!isContainer(value)) {
      rows.push({ id: key, key, path, depth, name, value, type: "leaf", isLast, isArray: false, size: 0 });
      return;
    }
    const isArray = Array.isArray(value);
    const size = sizeOf(value);
    const open = expanded.has(key) && size > 0;
    rows.push({ id: key, key, path, depth, name, value, type: open ? "open" : "collapsed", isLast, isArray, size });
    if (!open) return;
    const entries = entriesOf(value, sortKeys);
    for (let i = 0; i < entries.length; i++) {
      const [k, v] = entries[i];
      visit(v, [...path, k], k, depth + 1, i === entries.length - 1);
    }
    rows.push({ id: `${key}\u0001`, key, path, depth, name, value, type: "close", isLast, isArray, size });
  };
  visit(root, ["$"], null, 0, true);
  return rows;
}

/** Keys of every container in the document (for "expand all"). */
export function allContainerKeys(root: unknown, maxDepth = Infinity): Set<string> {
  const out = new Set<string>();
  const visit = (value: unknown, path: Segment[], depth: number) => {
    if (!isContainer(value) || depth > maxDepth) return;
    out.add(pathKey(path));
    for (const [k, v] of entriesOf(value, false)) visit(v, [...path, k], depth + 1);
  };
  visit(root, ["$"], 0);
  return out;
}

export function ancestorKeys(path: Segment[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < path.length; i++) out.push(pathKey(path.slice(0, i)));
  return out;
}

export function defaultExpanded(root: unknown): Set<string> {
  const set = new Set<string>([pathKey(["$"])]);
  if (isContainer(root) && sizeOf(root) <= 50) {
    for (const [k, v] of entriesOf(root, false)) if (isContainer(v)) set.add(pathKey(["$", k]));
  }
  return set;
}

export function getAtPath(root: unknown, path: Segment[]): unknown {
  let cur = root;
  for (const seg of path.slice(1)) {
    if (!isContainer(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[seg as string];
  }
  return cur;
}
