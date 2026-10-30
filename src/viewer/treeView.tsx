import type { FC, KeyboardEvent as ReactKeyboardEvent, MouseEvent, ReactNode } from "react";
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { copyTextToClipboard } from "../utils/clipboard";
import { toJsonPath } from "../utils/jsonPath";
import {
  allContainerKeys,
  ancestorKeys,
  defaultExpanded,
  entriesOf,
  flattenTree,
  isContainer,
  pathKey,
  type Row,
  type Segment
} from "./flatten";

const URL_RE = /^https?:\/\/[^\s"]+$/i;
const COLOR_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const MAX_MATCHES = 10000;
const AUTO_EXPAND_MATCHES = 1000;
const OVERSCAN = 12;

/* ----------------------------------------------------------------- helpers */

function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: ReactNode[] = [];
  let i = 0;
  let idx = lower.indexOf(q);
  while (idx !== -1) {
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark key={idx} className="pj-hl">
        {text.slice(idx, idx + q.length)}
      </mark>
    );
    i = idx + q.length;
    idx = lower.indexOf(q, i);
  }
  if (i < text.length) parts.push(text.slice(i));
  return parts.length ? parts : text;
}

function primitiveKind(v: unknown): "string" | "number" | "boolean" | "null" {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return "string";
  if (typeof v === "number" || typeof v === "bigint") return "number";
  return "boolean";
}

function primitiveText(v: unknown): string {
  return typeof v === "string" ? JSON.stringify(v) : String(v);
}

function preview(value: object, max = 80): string {
  const parts: string[] = [];
  let len = 0;
  const isArr = Array.isArray(value);
  for (const [k, item] of entriesOf(value, false)) {
    const v = isContainer(item) ? (Array.isArray(item) ? "[…]" : "{…}") : primitiveText(item);
    const s = isArr ? v : `${k}: ${v}`;
    len += s.length + 2;
    if (len > max) {
      parts.push("…");
      break;
    }
    parts.push(s);
  }
  return parts.join(", ");
}

/* -------------------------------------------------------------------- rows */

const Icon: FC<{ d: string }> = ({ d }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const COPY_D = "M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1";
const CHECK_D = "M20 6 9 17l-5-5";
const PATH_D = "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7";

const RowActions: FC<{ path: Segment[]; value: unknown; onCopied: (m: string) => void }> = ({ path, value, onCopied }) => {
  const [done, setDone] = useState<"v" | "p" | null>(null);
  const run = async (e: MouseEvent, kind: "v" | "p") => {
    e.stopPropagation();
    const p = toJsonPath(path);
    const text = kind === "p" ? p : typeof value === "string" ? value : JSON.stringify(value, null, 2);
    if (await copyTextToClipboard(text)) {
      setDone(kind);
      onCopied(kind === "p" ? `Copied ${p}` : "Copied value");
      window.setTimeout(() => setDone(null), 1200);
    }
  };
  return (
    <span className="pj-actions">
      <button type="button" tabIndex={-1} className="pj-icon-btn" title="Copy path" aria-label="Copy path" onClick={(e) => run(e, "p")}>
        <Icon d={done === "p" ? CHECK_D : PATH_D} />
      </button>
      <button type="button" tabIndex={-1} className="pj-icon-btn" title="Copy value" aria-label="Copy value" onClick={(e) => run(e, "v")}>
        <Icon d={done === "v" ? CHECK_D : COPY_D} />
      </button>
    </span>
  );
};

const KeyLabel: FC<{ name: Segment | null; query: string }> = ({ name, query }) => {
  if (name === null) return null;
  return (
    <>
      {typeof name === "number" ? (
        <span className="pj-index">{name}</span>
      ) : (
        <span className="pj-key whitespace-pre">
          <span className="pj-punct">"</span>
          {highlight(name, query)}
          <span className="pj-punct">"</span>
        </span>
      )}
      <span className="pj-punct">:</span>
    </>
  );
};

const PrimitiveValue: FC<{ value: unknown; query: string }> = ({ value, query }) => {
  const kind = primitiveKind(value);
  const text = primitiveText(value);
  if (kind === "string") {
    const s = value as string;
    if (URL_RE.test(s)) {
      return (
        <a
          className="pj-string pj-link min-w-0 truncate"
          href={s}
          target="_blank"
          rel="noreferrer noopener"
          title={`${s}\n${navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+click to open`}
          onClick={(e) => {
            if (!(e.metaKey || e.ctrlKey)) e.preventDefault();
          }}
        >
          {highlight(text, query)}
        </a>
      );
    }
    return (
      <span className="pj-string inline-flex min-w-0 items-center gap-1.5" title={s.length > 60 ? s.slice(0, 2000) : undefined}>
        {COLOR_RE.test(s) && <span className="pj-swatch" style={{ background: s }} />}
        <span className="truncate whitespace-pre">{highlight(text, query)}</span>
      </span>
    );
  }
  return <span className={`pj-${kind} shrink-0`}>{highlight(text, query)}</span>;
};

interface RowViewProps {
  row: Row;
  indent: number;
  height: number;
  query: string;
  isMatch: boolean;
  isActive: boolean;
  isSelected: boolean;
  onRowClick: (row: Row, e: MouseEvent) => void;
  onToggle: (row: Row, e: MouseEvent) => void;
  onCopied: (m: string) => void;
}

const RowView: FC<RowViewProps> = memo(function RowView({
  row,
  indent,
  height,
  query,
  isMatch,
  isActive,
  isSelected,
  onRowClick,
  onToggle,
  onCopied
}) {
  const guides = row.depth > 0 && (
    <span
      className="h-full shrink-0 self-stretch"
      style={{
        width: row.depth * indent,
        // cancel the row's flex gap so every chevron starts at depth * indent
        marginRight: -6,
        // one guide per level, centered under the parent's 16px chevron
        backgroundImage: `repeating-linear-gradient(to right, transparent 0 7px, var(--pj-guide) 7px 8px, transparent 8px ${indent}px)`
      }}
    />
  );
  const comma = row.isLast ? null : <span className="pj-punct">,</span>;
  const [openCh, closeCh] = row.isArray ? ["[", "]"] : ["{", "}"];
  const className = `pj-row ${isActive ? "pj-active-match" : ""}`;
  const common = {
    className,
    style: { height },
    "data-search-match": isMatch ? "true" : undefined,
    "data-selected": isSelected ? "true" : undefined,
    role: "treeitem",
    "aria-level": row.depth + 1,
    "aria-selected": isSelected,
    onClick: (e: MouseEvent) => onRowClick(row, e)
  };

  if (row.type === "close") {
    return (
      <div {...common} aria-expanded={undefined} role="none">
        {guides}
        <span className="w-4 shrink-0" />
        <span className="pj-punct">
          {closeCh}
          {comma}
        </span>
      </div>
    );
  }

  if (row.type === "leaf") {
    return (
      <div {...common}>
        {guides}
        <span className="w-4 shrink-0" />
        <KeyLabel name={row.name} query={query} />
        <span className="flex min-w-0 items-center">
          <PrimitiveValue value={row.value} query={query} />
          {comma}
        </span>
        <RowActions path={row.path} value={row.value} onCopied={onCopied} />
      </div>
    );
  }

  const open = row.type === "open";
  return (
    <div {...common} aria-expanded={open} onDoubleClick={(e) => onToggle(row, e)}>
      {guides}
      <button
        type="button"
        tabIndex={-1}
        className="pj-toggle"
        style={open ? { transform: "rotate(90deg)" } : undefined}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(row, e);
        }}
        aria-label={open ? "Collapse" : "Expand"}
        title="Toggle (Alt+click: whole subtree)"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
          <path d="M3 1.5 7.5 5 3 8.5z" />
        </svg>
      </button>
      <KeyLabel name={row.name} query={query} />
      <span className="pj-punct">{openCh}</span>
      {!open && (
        <>
          {row.size > 0 && <span className="pj-preview min-w-0 truncate whitespace-pre">{preview(row.value as object)}</span>}
          <span className="pj-punct shrink-0">
            {closeCh}
            {comma}
          </span>
        </>
      )}
      <span className="pj-chip shrink-0">
        {row.size} {row.isArray ? (row.size === 1 ? "item" : "items") : row.size === 1 ? "key" : "keys"}
      </span>
      <RowActions path={row.path} value={row.value} onCopied={onCopied} />
    </div>
  );
});

/* -------------------------------------------------------------------- tree */

export interface TreeViewProps {
  value: unknown;
  sortKeys: boolean;
  selectedPath: Segment[] | null;
  onSelectPath: (path: Segment[] | null) => void;
  searchQuery: string;
  activeMatchIndex: number | null;
  onMatchesChange: (paths: Segment[][], capped: boolean) => void;
  reveal: { path: Segment[]; n: number } | null;
  fontScale?: number;
  onCopied: (msg: string) => void;
}

export interface TreeViewHandle {
  expandAll: () => void;
  collapseAll: () => void;
  focus: () => void;
}

export const TreeView = forwardRef<TreeViewHandle, TreeViewProps>(function TreeView(
  { value, sortKeys, selectedPath, onSelectPath, searchQuery, activeMatchIndex, onMatchesChange, reveal, fontScale = 1, onCopied },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => defaultExpanded(value));
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);
  const pendingScrollKey = useRef<string | null>(null);
  // Bumped on every reveal so the scroll effect runs even when nothing new expands.
  const [scrollNonce, setScrollNonce] = useState(0);

  const fontPx = Math.round(fontScale * 13);
  const rowH = Math.round(fontPx * 1.65);
  const indent = Math.round(fontPx * 1.25);

  // Reset folding when a new document arrives.
  const lastValue = useRef(value);
  useLayoutEffect(() => {
    if (lastValue.current === value) return;
    lastValue.current = value;
    setExpanded(defaultExpanded(value));
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [value]);

  const rows = useMemo(() => flattenTree(value, expanded, sortKeys), [value, expanded, sortKeys]);
  const indexByKey = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => {
      if (r.type !== "close") m.set(r.key, i);
    });
    return m;
  }, [rows]);

  /* --- search --- */
  const query = searchQuery.trim();
  const { matches, capped } = useMemo(() => {
    const list: Segment[][] = [];
    if (!query) return { matches: list, capped: false };
    const q = query.toLowerCase();
    let stop = false;
    const walk = (val: unknown, path: Segment[]) => {
      if (stop) return;
      const last = path[path.length - 1];
      const keyHit = path.length > 1 && typeof last === "string" && last.toLowerCase().includes(q);
      const valHit = !isContainer(val) && primitiveText(val).toLowerCase().includes(q);
      if (keyHit || valHit) {
        list.push(path);
        if (list.length >= MAX_MATCHES) {
          stop = true;
          return;
        }
      }
      if (isContainer(val)) for (const [k, v] of entriesOf(val, sortKeys)) walk(v, [...path, k]);
    };
    walk(value, ["$"]);
    return { matches: list, capped: stop };
  }, [value, query, sortKeys]);

  useEffect(() => onMatchesChange(matches, capped), [matches, capped, onMatchesChange]);

  const matchKeys = useMemo(() => new Set(matches.map(pathKey)), [matches]);

  useEffect(() => {
    if (!matches.length || matches.length > AUTO_EXPAND_MATCHES) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const m of matches) for (const a of ancestorKeys(m)) next.add(a);
      return next;
    });
  }, [matches]);

  const activeKey = activeMatchIndex !== null && matches[activeMatchIndex] ? pathKey(matches[activeMatchIndex]) : null;
  const selectedKey = selectedPath ? pathKey(selectedPath) : null;

  /* --- scrolling --- */
  const scrollToIndex = useCallback(
    (idx: number, mode: "center" | "nearest") => {
      const el = containerRef.current;
      if (!el || idx < 0) return;
      const top = idx * rowH;
      if (mode === "center") {
        el.scrollTop = Math.max(0, top - el.clientHeight / 2 + rowH / 2);
      } else if (top < el.scrollTop) {
        el.scrollTop = top;
      } else if (top + rowH > el.scrollTop + el.clientHeight) {
        el.scrollTop = top + rowH - el.clientHeight;
      }
    },
    [rowH]
  );

  const revealPath = useCallback((path: Segment[]) => {
    setExpanded((prev) => {
      const anc = ancestorKeys(path);
      if (anc.every((a) => prev.has(a))) return prev;
      const next = new Set(prev);
      anc.forEach((a) => next.add(a));
      return next;
    });
    pendingScrollKey.current = pathKey(path);
    setScrollNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (activeMatchIndex !== null && matches[activeMatchIndex]) revealPath(matches[activeMatchIndex]);
  }, [activeMatchIndex, matches, revealPath]);

  useEffect(() => {
    if (reveal) {
      revealPath(reveal.path);
      containerRef.current?.focus({ preventScroll: true });
    }
  }, [reveal, revealPath]);

  useLayoutEffect(() => {
    const k = pendingScrollKey.current;
    if (!k) return;
    const idx = indexByKey.get(k);
    if (idx !== undefined) {
      scrollToIndex(idx, "center");
      pendingScrollKey.current = null;
    }
  }, [indexByKey, scrollToIndex, scrollNonce]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    setViewportH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  /* --- expand/collapse --- */
  const toggle = useCallback(
    (row: Row, subtree: boolean) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        const open = prev.has(row.key);
        if (subtree) {
          const keys = allContainerKeys(row.value);
          for (const k of keys) {
            // keys are relative to the subtree root ("$"-prefixed); rebase them
            const rel = k.split("\u0000").slice(1);
            const full = row.path.map(String).concat(rel).join("\u0000");
            if (open) next.delete(full);
            else next.add(full);
          }
        } else if (open) next.delete(row.key);
        else next.add(row.key);
        return next;
      });
    },
    []
  );

  const onToggle = useCallback(
    (row: Row, e: MouseEvent) => {
      e.preventDefault();
      toggle(row, e.altKey);
      onSelectPath(row.path);
    },
    [toggle, onSelectPath]
  );

  const onRowClick = useCallback(
    (row: Row, e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("a")) return;
      if (e.altKey && row.type !== "leaf") {
        toggle(row, true);
      }
      onSelectPath(row.path);
      containerRef.current?.focus({ preventScroll: true });
    },
    [onSelectPath, toggle]
  );

  useImperativeHandle(ref, () => ({
    expandAll: () => setExpanded(allContainerKeys(value)),
    collapseAll: () => setExpanded(new Set([pathKey(["$"])])),
    focus: () => containerRef.current?.focus()
  }));

  /* --- keyboard --- */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const curIdx = selectedKey !== null ? indexByKey.get(selectedKey) ?? -1 : -1;
    const cur = curIdx >= 0 ? rows[curIdx] : null;
    const select = (idx: number) => {
      let i = Math.max(0, Math.min(rows.length - 1, idx));
      const dir = idx >= curIdx ? 1 : -1;
      while (rows[i] && rows[i].type === "close") i += dir;
      if (!rows[i]) {
        i = Math.max(0, Math.min(rows.length - 1, idx));
        while (rows[i] && rows[i].type === "close") i -= dir;
      }
      if (!rows[i]) return;
      onSelectPath(rows[i].path);
      scrollToIndex(i, "nearest");
    };
    const page = Math.max(1, Math.floor(viewportH / rowH) - 1);
    const mod = e.metaKey || e.ctrlKey;

    switch (e.key) {
      case "ArrowDown":
        select(curIdx + 1);
        break;
      case "ArrowUp":
        select(curIdx < 0 ? 0 : curIdx - 1);
        break;
      case "PageDown":
        select(curIdx + page);
        break;
      case "PageUp":
        select(curIdx - page);
        break;
      case "Home":
        select(0);
        break;
      case "End":
        select(rows.length - 1);
        break;
      case "ArrowRight":
        if (!cur) select(0);
        else if (cur.type === "collapsed") toggle(cur, e.altKey);
        else if (cur.type === "open") select(curIdx + 1);
        else return;
        break;
      case "ArrowLeft":
        if (!cur) return;
        if (cur.type === "open") toggle(cur, e.altKey);
        else if (cur.path.length > 1) {
          const parent = cur.path.slice(0, -1);
          onSelectPath(parent);
          const pi = indexByKey.get(pathKey(parent));
          if (pi !== undefined) scrollToIndex(pi, "nearest");
        } else return;
        break;
      case "Enter":
      case " ":
        if (cur && cur.type !== "leaf") toggle(cur, e.altKey);
        else return;
        break;
      case "c":
        if (!mod || !cur || window.getSelection()?.toString()) return;
        void copyTextToClipboard(typeof cur.value === "string" ? cur.value : JSON.stringify(cur.value, null, 2)).then(
          (ok) => ok && onCopied("Copied value")
        );
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  /* --- render window --- */
  const start = Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewportH) / rowH) + OVERSCAN);
  const visible = rows.slice(start, end);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="tree"
      aria-label="JSON tree"
      className="pj-tree h-full overflow-auto font-mono outline-none"
      style={{ fontSize: fontPx }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      onKeyDown={onKeyDown}
    >
      <div style={{ height: rows.length * rowH + 16, position: "relative", minWidth: "100%" }}>
        <div style={{ position: "absolute", top: start * rowH + 8, left: 0, right: 0 }} className="px-2">
          {visible.map((row) => (
            <RowView
              key={row.id}
              row={row}
              indent={indent}
              height={rowH}
              query={query}
              isMatch={row.type !== "close" && matchKeys.has(row.key)}
              isActive={row.type !== "close" && activeKey === row.key}
              isSelected={row.type !== "close" && selectedKey === row.key}
              onRowClick={onRowClick}
              onToggle={onToggle}
              onCopied={onCopied}
            />
          ))}
        </div>
      </div>
    </div>
  );
});
