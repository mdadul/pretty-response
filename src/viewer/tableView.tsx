import type { FC } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { collectColumns } from "../utils/csv";
import { isContainer, type Segment } from "./flatten";

const OVERSCAN = 10;
const INDEX_COL = "#";

type SortState = { col: string; dir: 1 | -1 } | null;

function cellKind(v: unknown): string {
  if (v === undefined) return "pj-subtle";
  if (v === null) return "pj-null";
  if (typeof v === "string") return "pj-string";
  if (typeof v === "number") return "pj-number";
  if (typeof v === "boolean") return "pj-boolean";
  return "pj-preview";
}

function cellText(v: unknown): string {
  if (v === undefined) return "";
  if (Array.isArray(v)) return `[${v.length}]`;
  if (isContainer(v)) return `{${Object.keys(v).length}}`;
  return String(v);
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(cellText(a)).localeCompare(String(cellText(b)), undefined, { numeric: true });
}

export interface TableViewProps {
  items: unknown[];
  rowPaths: Segment[][];
  title: string;
  fontScale: number;
  onOpenCell: (path: Segment[]) => void;
  onExportCsv: (columns: string[]) => void;
  onCopyCsv: (columns: string[]) => void;
}

export const TableView: FC<TableViewProps> = ({ items, rowPaths, title, fontScale, onOpenCell, onExportCsv, onCopyCsv }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);
  const [sort, setSort] = useState<SortState>(null);
  const [filter, setFilter] = useState("");

  const fontPx = Math.round(fontScale * 12.5);
  const rowH = Math.round(fontPx * 2.2);

  const isObjRow = (v: unknown) => isContainer(v) && !Array.isArray(v);
  const columns = useMemo(() => {
    const cols = collectColumns(items);
    return items.some((v) => !isObjRow(v)) ? ["(value)", ...cols] : cols;
  }, [items]);

  const get = (item: unknown, col: string): unknown =>
    col === "(value)" ? (isObjRow(item) ? undefined : item) : isObjRow(item) ? (item as Record<string, unknown>)[col] : undefined;

  const order = useMemo(() => {
    let idx = items.map((_, i) => i);
    const q = filter.trim().toLowerCase();
    if (q) {
      idx = idx.filter((i) => {
        const it = items[i];
        return columns.some((c) => cellText(get(it, c)).toLowerCase().includes(q));
      });
    }
    if (sort) {
      idx.sort((a, b) =>
        sort.col === INDEX_COL ? (a - b) * sort.dir : compare(get(items[a], sort.col), get(items[b], sort.col)) * sort.dir
      );
    }
    return idx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sort, filter, columns]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setSort(null);
    setFilter("");
    if (ref.current) ref.current.scrollTop = 0;
  }, [items]);

  const start = Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN);
  const end = Math.min(order.length, Math.ceil((scrollTop + viewportH) / rowH) + OVERSCAN);

  const toggleSort = (col: string) =>
    setSort((s) => (!s || s.col !== col ? { col, dir: 1 } : s.dir === 1 ? { col, dir: -1 } : null));

  const arrow = (col: string) => (sort?.col === col ? (sort.dir === 1 ? " ↑" : " ↓") : "");

  return (
    <div className="flex h-full flex-col">
      <div className="pj-bar pj-border flex h-9 shrink-0 items-center gap-2 border-b px-3 text-xs">
        <span className="min-w-0 truncate font-mono">{title}</span>
        <span className="pj-chip shrink-0">
          {order.length !== items.length ? `${order.length.toLocaleString()} of ` : ""}
          {items.length.toLocaleString()} rows · {columns.length} cols
        </span>
        <div className="pj-field ml-auto h-6">
          <input
            className="pj-input w-44 border-0 bg-transparent px-2 text-xs focus:outline-none"
            placeholder="Filter rows"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            spellCheck={false}
          />
        </div>
        <button type="button" className="pj-btn !h-6" onClick={() => onCopyCsv(columns)}>
          Copy CSV
        </button>
        <button type="button" className="pj-btn !h-6" onClick={() => onExportCsv(columns)}>
          Download CSV
        </button>
      </div>
      <div ref={ref} className="min-h-0 flex-1 overflow-auto" onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} style={{ fontSize: fontPx }}>
        <table className="pj-table border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="pj-th w-14 text-right" onClick={() => toggleSort(INDEX_COL)}>
                #{arrow(INDEX_COL)}
              </th>
              {columns.map((c) => (
                <th key={c} className="pj-th" onClick={() => toggleSort(c)} title={`Sort by ${c}`}>
                  {c}
                  {arrow(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {start > 0 && (
              <tr style={{ height: start * rowH }}>
                <td colSpan={columns.length + 1} />
              </tr>
            )}
            {order.slice(start, end).map((i) => (
              <tr key={i} className="pj-tr" style={{ height: rowH }}>
                <td className="pj-td pj-subtle text-right tabular-nums">{i}</td>
                {columns.map((c) => {
                  const v = get(items[i], c);
                  return (
                    <td
                      key={c}
                      className={`pj-td font-mono ${cellKind(v)}`}
                      title={typeof v === "string" && v.length > 40 ? v.slice(0, 1000) : undefined}
                      onClick={() => onOpenCell(c === "(value)" ? rowPaths[i] : [...rowPaths[i], c])}
                    >
                      {cellText(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {end < order.length && (
              <tr style={{ height: (order.length - end) * rowH }}>
                <td colSpan={columns.length + 1} />
              </tr>
            )}
          </tbody>
        </table>
        {order.length === 0 && <div className="pj-subtle p-6 text-center">No rows match “{filter}”</div>}
      </div>
    </div>
  );
};
