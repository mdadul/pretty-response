import type { FC, MouseEvent } from "react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";

interface TreeNodeProps {
  path: (string | number)[];
  name: string | null;
  value: unknown;
  depth: number;
  onSelectPath?: (path: (string | number)[]) => void;
  searchQuery?: string;
  matchPaths?: Set<string>;
}

const INDENT_PX = 14;

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

const TreeNode: FC<TreeNodeProps> = ({ path, name, value, depth, onSelectPath, searchQuery, matchPaths }) => {
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
    const entries = isArray ? (value as unknown[]) : Object.entries(value as Record<string, unknown>);
    return (
      <details
        className="group"
        open={depth < 2 || !!hasMatchInSubtree}
        aria-label={name ?? "root node"}
        data-path={pathKey(path)}
      >
        <summary className="cursor-pointer select-none" style={{ paddingLeft: depth * INDENT_PX }}>
          {name !== null && <span className="font-mono pj-key">{name}</span>}
          <span className="text-slate-400">{isArray ? " [ ]" : " { }"}</span>
          <span className="ml-1 text-slate-500">({entries.length})</span>
        </summary>
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
                />
              ))}
        </div>
      </details>
    );
  }

  return (
    <div
      className={`cursor-pointer hover:bg-slate-800 ${matches ? "bg-amber-900/40" : ""}`}
      style={{ paddingLeft: depth * INDENT_PX }}
      aria-label={name ? `${name} value` : "value"}
      data-search-match={matches ? "true" : undefined}
      data-path={pathKey(path)}
      onClick={handleClick}
    >
      {name !== null && <span className="mr-1 font-mono pj-key">{name}:</span>}
      <span className={`font-mono pj-value pj-${valueKind}`}>{valueText}</span>
    </div>
  );
};

export interface TreeViewProps {
  value: unknown;
  onSelectPath?: (path: (string | number)[]) => void;
  searchQuery?: string;
  fontScale?: number;
}

export interface TreeViewHandle {
  scrollToMatchIndex: (index: number) => void;
  scrollToPath: (path: (string | number)[]) => void;
}

export const TreeView = forwardRef<TreeViewHandle, TreeViewProps>(function TreeView(
  { value, onSelectPath, searchQuery, fontScale = 1 },
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
      className="h-full overflow-auto p-2 font-mono"
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
      />
    </div>
  );
});

