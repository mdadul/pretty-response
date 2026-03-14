import type { FC, MouseEvent } from "react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { inferJsonKind } from "../utils/jsonTypes";
import { copyTextToClipboard } from "../utils/clipboard";

interface TreeNodeProps {
  path: (string | number)[];
  name: string | null;
  value: unknown;
  depth: number;
  onSelectPath?: (path: (string | number)[]) => void;
  searchQuery?: string;
  matchPaths?: Set<string>;
  safeMode?: boolean;
}

const INDENT_PX = 18;

function safeValueText(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }

  const t = typeof value;
  if (t === "string") {
    return JSON.stringify(value);
  }
  if (t === "number" || t === "boolean" || t === "bigint") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    try {
      // Fallback that doesn't invoke user-defined Symbol.toPrimitive
      return Object.prototype.toString.call(value);
    } catch {
      return "[unprintable]";
    }
  }
}

const pathKey = (p: (string | number)[]) => p.join(".");

const CopyIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const TreeNode: FC<TreeNodeProps> = ({ path, name, value, depth, onSelectPath, searchQuery, matchPaths, safeMode }) => {
  const [forceExpandHugeBranch, setForceExpandHugeBranch] = useState(false);
  const [copied, setCopied] = useState(false);
  const isObject = value !== null && typeof value === "object" && !Array.isArray(value);
  const isArray = Array.isArray(value);
  const label = name !== null ? String(name) : "";
  const valueText = safeValueText(value);
  let valueKind: "string" | "number" | "boolean" | "null" | "other" = "other";
  if (value === null) {
    valueKind = "null";
  } else {
    switch (typeof value) {
      case "string":
        valueKind = "string";
        break;
      case "number":
      case "bigint":
        valueKind = "number";
        break;
      case "boolean":
        valueKind = "boolean";
        break;
      default:
        valueKind = "other";
    }
  }
  const matches =
    searchQuery && searchQuery.trim().length > 0
      ? label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        valueText.toLowerCase().includes(searchQuery.toLowerCase())
      : false;

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onSelectPath) return;
    event.stopPropagation();
    onSelectPath(path);
  };

  const key = pathKey(path);
  const hasMatchInSubtree =
    matchPaths &&
    (matchPaths.has(key) || [...matchPaths].some((m) => m.startsWith(key + ".")));

  if (isObject || isArray) {
    const SAFE_MODE_MAX_CHILDREN = 500;
    const SAFE_MODE_MAX_AUTO_DEPTH = 6;

    const collection = isArray ? (value as unknown[]) : (value as Record<string, unknown>);
    const collectionSize = isArray
      ? (collection as unknown[]).length
      : Object.keys(collection as Record<string, unknown>).length;

    const isHugeBranch =
      !!safeMode && (collectionSize > SAFE_MODE_MAX_CHILDREN || depth >= SAFE_MODE_MAX_AUTO_DEPTH);
    const showChildren = !isHugeBranch || forceExpandHugeBranch;

    const entries = isArray ? (collection as unknown[]) : Object.entries(collection as Record<string, unknown>);
    return (
      <details
        className="pj-details"
        open={showChildren && (depth < 2 || !!hasMatchInSubtree)}
        aria-label={name ?? "root node"}
        data-path={pathKey(path)}
      >
        <summary className="group/summary flex cursor-pointer select-none items-center gap-2 rounded py-1 pr-2 transition-colors hover:bg-slate-800/60 [&::-webkit-details-marker]:hidden" style={{ paddingLeft: depth * INDENT_PX + 4 }}>
          <span className="pj-toggle shrink-0 text-slate-500 transition-transform duration-150" aria-hidden>▶</span>
          {name !== null && <span className="font-mono pj-key">{name}</span>}
          <span className="text-slate-500">{isArray ? "[]" : "{}"}</span>
          <span className="text-slate-500 text-[11px]">({entries.length})</span>
          <span className="pj-type-badge rounded bg-slate-700/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
            {isArray ? "array" : "object"}
          </span>
          <button
            type="button"
            className="shrink-0 rounded p-1 text-slate-500 opacity-0 transition-[opacity,color] hover:text-slate-200 group-hover/summary:opacity-100"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const toCopy = name !== null ? JSON.stringify({ [name]: value }) : JSON.stringify(value);
              const ok = await copyTextToClipboard(toCopy);
              if (ok) {
                setCopied(true);
              }
            }}
            title="Copy key and value"
            aria-label="Copy key and value"
          >
            {copied ? <CheckIcon className="text-emerald-400" /> : <CopyIcon />}
          </button>
          {safeMode && isHugeBranch && !forceExpandHugeBranch && (
            <span className="ml-2 rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] text-amber-200">
              Safe mode: large subtree hidden
            </span>
          )}
        </summary>
        {showChildren && (
          <div>
            {isArray
              ? (entries as unknown[]).map((child, idx) => (
                  <TreeNode
                    key={`${path.join(".")}[${idx}]`}
                    path={[...path, idx]}
                    name={String(idx)}
                    value={child}
                    depth={depth + 1}
                    onSelectPath={onSelectPath}
                    searchQuery={searchQuery}
                    matchPaths={matchPaths}
                    safeMode={safeMode}
                  />
                ))
              : (entries as [string, unknown][]).map(([k, child]) => (
                  <TreeNode
                    key={`${path.join(".")}.${k}`}
                    path={[...path, k]}
                    name={k}
                    value={child}
                    depth={depth + 1}
                    onSelectPath={onSelectPath}
                    searchQuery={searchQuery}
                    matchPaths={matchPaths}
                    safeMode={safeMode}
                  />
                ))}
          </div>
        )}
        {safeMode && isHugeBranch && !forceExpandHugeBranch && (
          <div className="px-4 pb-1 pt-0.5 text-[11px] text-amber-200/90">
            This branch has {collectionSize.toLocaleString()} items.{" "}
            <button
              type="button"
              className="underline decoration-amber-300 decoration-dotted underline-offset-2 hover:text-amber-100"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setForceExpandHugeBranch(true);
              }}
            >
              Load children (may be slow)
            </button>
          </div>
        )}
      </details>
    );
  }

  const copyPayload =
    name !== null
      ? JSON.stringify({ [name]: value })
      : value === null || value === undefined
        ? String(value)
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);

  return (
    <div
      className={`group flex cursor-pointer items-center gap-2 rounded py-1 pr-2 transition-colors ${matches ? "bg-amber-900/30 ring-1 ring-amber-600/40" : "hover:bg-slate-800/60"}`}
      style={{ paddingLeft: depth * INDENT_PX + 4 }}
      aria-label={name ? `${name} value` : "value"}
      data-search-match={matches ? "true" : undefined}
      data-path={pathKey(path)}
      onClick={handleClick}
    >
      {name !== null && <span className="shrink-0 font-mono pj-key">{name}:</span>}
      <span className={`min-w-0 truncate font-mono pj-value pj-${valueKind}`} title={valueText}>{valueText}</span>
      <span className="pj-type-badge shrink-0 rounded bg-slate-700/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
        {inferJsonKind(value)}
      </span>
      <button
        type="button"
        className="shrink-0 rounded p-1 text-slate-500 opacity-0 transition-[opacity,color] hover:text-slate-200 group-hover:opacity-100"
        onClick={async (event) => {
          event.stopPropagation();
          const ok = await copyTextToClipboard(copyPayload);
          if (ok) {
            setCopied(true);
          }
        }}
        title="Copy key and value"
        aria-label="Copy key and value"
      >
        {copied ? <CheckIcon className="text-emerald-400" /> : <CopyIcon />}
      </button>
    </div>
  );
};

export interface TreeViewProps {
  value: unknown;
  onSelectPath?: (path: (string | number)[]) => void;
  searchQuery?: string;
  fontScale?: number;
  safeMode?: boolean;
}

export interface TreeViewHandle {
  scrollToMatchIndex: (index: number) => void;
  scrollToPath: (path: (string | number)[]) => void;
}

export const TreeView = forwardRef<TreeViewHandle, TreeViewProps>(function TreeView(
  { value, onSelectPath, searchQuery, fontScale = 1, safeMode = false },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);

  const matchPaths = useMemo(() => {
    const q = searchQuery?.trim().toLowerCase();
    if (!q) return undefined;
    const set = new Set<string>();
    const walk = (val: unknown, path: (string | number)[]): void => {
      const name = path[path.length - 1];
      const label = name !== undefined ? String(name) : "";
      const valueText =
        val === null || val === undefined
          ? String(val)
          : typeof val === "object"
            ? JSON.stringify(val)
            : String(val);
      if (label.toLowerCase().includes(q) || valueText.toLowerCase().includes(q)) {
        set.add(pathKey(path));
      }
      if (val !== null && typeof val === "object" && !Array.isArray(val)) {
        for (const [k, v] of Object.entries(val)) walk(v, [...path, k]);
      } else if (Array.isArray(val)) {
        val.forEach((v, i) => walk(v, [...path, i]));
      }
    };
    walk(value, ["$"]);
    return set;
  }, [value, searchQuery]);

  useEffect(() => {
    if (!searchQuery?.trim() || !matchPaths?.size) return;
    const first = containerRef.current?.querySelector("[data-search-match]");
    if (first) {
      first.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
  }, [searchQuery, matchPaths]);

  useImperativeHandle(ref, () => ({
    scrollToMatchIndex(index: number) {
      const matches = containerRef.current?.querySelectorAll("[data-search-match]");
      if (!matches?.length) return;
      const i = ((index % matches.length) + matches.length) % matches.length;
      matches[i]?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    },
    scrollToPath(path: (string | number)[]) {
      const key = pathKey(path);
      const target = containerRef.current?.querySelector<HTMLElement>(`[data-path="${key}"]`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      }
    }
  }));

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto px-3 py-3 font-mono leading-relaxed"
      style={{ fontSize: `${fontScale * 12}px` }}
      aria-label="JSON tree view"
    >
      <TreeNode
        path={["$"]}
        name={null}
        value={value}
        depth={0}
        onSelectPath={onSelectPath}
        searchQuery={searchQuery}
        matchPaths={matchPaths}
        safeMode={safeMode}
      />
    </div>
  );
});

