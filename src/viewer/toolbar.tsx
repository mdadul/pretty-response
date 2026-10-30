import type { FC, KeyboardEvent, ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";

export type SchemaKind = "json-schema" | "ts" | "zod" | "pydantic" | "yup" | "joi";
export type ViewMode = "tree" | "table";
export type InputMode = "search" | "query";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? "⌘" : "Ctrl";

const Menu: FC<{ label: ReactNode; title: string; children: (close: () => void) => ReactNode }> = ({ label, title, children }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="pj-btn" title={title} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden className="opacity-60">
          <path d="M1.5 3.5 5 7l3.5-3.5z" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="pj-menu absolute right-0 z-30 mt-1 w-60">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};

const MenuItem: FC<{ onClick: () => void; close: () => void; hint?: string; children: ReactNode; disabled?: boolean }> = ({
  onClick,
  close,
  hint,
  children,
  disabled
}) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    className="pj-menu-item disabled:opacity-40"
    onClick={() => {
      onClick();
      close();
    }}
  >
    <span>{children}</span>
    {hint && <span className="pj-subtle text-[10px]">{hint}</span>}
  </button>
);

const MenuLabel: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="pj-subtle px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider">{children}</div>
);

const IconBtn: FC<{ title: string; onClick: () => void; pressed?: boolean; disabled?: boolean; children: ReactNode }> = ({
  title,
  onClick,
  pressed,
  disabled,
  children
}) => (
  <button
    type="button"
    className="pj-btn !w-7 !justify-center !px-0"
    onClick={onClick}
    title={title}
    aria-label={title}
    aria-pressed={pressed}
    disabled={disabled}
  >
    {children}
  </button>
);

const Svg: FC<{ children: ReactNode }> = ({ children }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

export interface QueryStatus {
  count: number;
  truncated: boolean;
  error: string | null;
}

export interface ToolbarProps {
  hasData: boolean;
  dark: boolean;
  onToggleDark: () => void;

  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  tableAvailable: boolean;

  sortKeys: boolean;
  onToggleSortKeys: () => void;
  inspectorOpen: boolean;
  onToggleInspector: () => void;

  inputMode: InputMode;
  onInputModeChange: (m: InputMode) => void;
  inputRef: RefObject<HTMLInputElement>;

  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchMatchCount: number;
  searchCapped: boolean;
  searchCurrentIndex: number | null;
  onSearchNext: () => void;
  onSearchPrev: () => void;

  queryText: string;
  onQueryChange: (q: string) => void;
  queryStatus: QueryStatus | null;

  onCopyFormatted: () => void;
  onCopyMinified: () => void;
  onDownload: () => void;
  onCopySchema: (kind: SchemaKind) => void;

  onExpandAll: () => void;
  onCollapseAll: () => void;
  onShowHelp: () => void;
}

export const Toolbar: FC<ToolbarProps> = (p) => {
  const isQuery = p.inputMode === "query";
  const text = isQuery ? p.queryText : p.searchQuery;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (isQuery) p.onQueryChange("");
      else p.onSearchChange("");
      e.currentTarget.blur();
    } else if (e.key === "Enter" && !isQuery) {
      e.preventDefault();
      if (e.shiftKey) p.onSearchPrev();
      else p.onSearchNext();
    } else if (e.key === "Tab" && !e.shiftKey && !text) {
      e.preventDefault();
      p.onInputModeChange(isQuery ? "search" : "query");
    }
  };

  let status: ReactNode = null;
  if (isQuery && p.queryText.trim() && p.queryStatus) {
    status = p.queryStatus.error ? (
      <span className="px-1.5 text-[10px]" style={{ color: "var(--pj-danger)" }} title={p.queryStatus.error}>
        error
      </span>
    ) : (
      <span className="pj-muted px-1.5 text-[10px] tabular-nums">
        {p.queryStatus.count.toLocaleString()}
        {p.queryStatus.truncated ? "+" : ""} {p.queryStatus.count === 1 ? "result" : "results"}
      </span>
    );
  } else if (!isQuery && p.searchQuery.trim()) {
    status = (
      <>
        <span
          className={`min-w-[4ch] px-1 text-right text-[10px] tabular-nums ${p.searchMatchCount ? "pj-muted" : ""}`}
          style={p.searchMatchCount ? undefined : { color: "var(--pj-danger)" }}
          aria-live="polite"
        >
          {p.searchMatchCount
            ? `${(p.searchCurrentIndex ?? 0) + 1}/${p.searchMatchCount.toLocaleString()}${p.searchCapped ? "+" : ""}`
            : "0 results"}
        </span>
        <button type="button" className="pj-icon-btn" onClick={p.onSearchPrev} disabled={!p.searchMatchCount} aria-label="Previous match" title="Previous (Shift+Enter)">
          ↑
        </button>
        <button type="button" className="pj-icon-btn" onClick={p.onSearchNext} disabled={!p.searchMatchCount} aria-label="Next match" title="Next (Enter)">
          ↓
        </button>
      </>
    );
  }

  return (
    <header className="pj-bar relative z-20 flex h-10 shrink-0 items-center gap-1 border-b px-2 text-xs" aria-label="Pretty JSON toolbar">
      <div className="flex shrink-0 items-center gap-1.5 pl-1 pr-1.5">
        <span
          className="flex h-5 w-5 items-center justify-center rounded font-mono text-[10px] font-bold"
          style={{ background: "var(--pj-accent)", color: "var(--pj-accent-fg)" }}
        >
          {"{}"}
        </span>
        <span className="text-[13px] font-semibold tracking-tight">Pretty JSON</span>
      </div>
      <span className="pj-sep" />

      <div className="pj-group" role="tablist" aria-label="View">
        <button type="button" role="tab" aria-selected={p.view === "tree"} className="pj-tab" onClick={() => p.onViewChange("tree")} title="Tree view (T)">
          Tree
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={p.view === "table"}
          className="pj-tab disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => p.onViewChange("table")}
          disabled={!p.tableAvailable}
          title={p.tableAvailable ? "Table view (T)" : "Select an array of objects to view it as a table"}
        >
          Table
        </button>
      </div>

      {p.view === "tree" && (
        <div className="flex items-center">
          <button type="button" className="pj-btn" onClick={p.onExpandAll} disabled={!p.hasData} title="Expand all (E)">
            Expand
          </button>
          <button type="button" className="pj-btn" onClick={p.onCollapseAll} disabled={!p.hasData} title="Collapse all (C)">
            Collapse
          </button>
          <button type="button" className="pj-btn" aria-pressed={p.sortKeys} onClick={p.onToggleSortKeys} title="Sort object keys A→Z (S)">
            A→Z
          </button>
        </div>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <div className="pj-field h-7 overflow-hidden" style={isQuery && p.queryStatus?.error && p.queryText.trim() ? { borderColor: "var(--pj-danger)" } : undefined}>
          <div className="pj-border flex h-full items-center border-r">
            <button
              type="button"
              className="pj-mode-btn"
              aria-pressed={!isQuery}
              onClick={() => {
                p.onInputModeChange("search");
                p.inputRef.current?.focus();
              }}
              title={`Text search (${MOD} F)`}
              aria-label="Text search mode"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
            <button
              type="button"
              className="pj-mode-btn !pl-0"
              aria-pressed={isQuery}
              onClick={() => {
                p.onInputModeChange("query");
                p.inputRef.current?.focus();
              }}
              title={`JSONPath / jq query (${MOD} K)`}
              aria-label="Query mode"
            >
              $.
            </button>
          </div>
          <input
            ref={p.inputRef}
            type="text"
            role="searchbox"
            placeholder={isQuery ? "$.items[?(@.price > 10)].name" : "Search keys & values"}
            value={text}
            className={`pj-input w-64 border-0 bg-transparent pl-2 pr-1 text-xs focus:outline-none ${isQuery ? "font-mono" : ""}`}
            onChange={(e) => (isQuery ? p.onQueryChange(e.target.value) : p.onSearchChange(e.target.value))}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
            disabled={!p.hasData}
            aria-label={isQuery ? "JSONPath query" : "Search JSON"}
          />
          <div className="flex items-center pr-0.5">
            {status}
            {text ? (
              <button
                type="button"
                className="pj-icon-btn"
                onClick={() => (isQuery ? p.onQueryChange("") : p.onSearchChange(""))}
                aria-label="Clear"
                title="Clear (Esc)"
              >
                ✕
              </button>
            ) : (
              <span className="pj-kbd mr-1">{isQuery ? `${MOD} K` : `${MOD} F`}</span>
            )}
          </div>
        </div>

        <Menu label="Export" title="Copy & export">
          {(close) => (
            <>
              <MenuLabel>JSON</MenuLabel>
              <MenuItem close={close} onClick={p.onCopyFormatted} disabled={!p.hasData} hint={`${MOD} ⇧ C`}>
                Copy formatted
              </MenuItem>
              <MenuItem close={close} onClick={p.onCopyMinified} disabled={!p.hasData}>
                Copy minified
              </MenuItem>
              <MenuItem close={close} onClick={p.onDownload} disabled={!p.hasData} hint={`${MOD} S`}>
                Download .json
              </MenuItem>
              <div className="pj-border my-1 border-t" />
              <MenuLabel>Generate types</MenuLabel>
              <MenuItem close={close} onClick={() => p.onCopySchema("ts")} disabled={!p.hasData}>TypeScript</MenuItem>
              <MenuItem close={close} onClick={() => p.onCopySchema("json-schema")} disabled={!p.hasData}>JSON Schema</MenuItem>
              <MenuItem close={close} onClick={() => p.onCopySchema("zod")} disabled={!p.hasData}>Zod</MenuItem>
              <MenuItem close={close} onClick={() => p.onCopySchema("pydantic")} disabled={!p.hasData}>Pydantic</MenuItem>
              <MenuItem close={close} onClick={() => p.onCopySchema("yup")} disabled={!p.hasData}>Yup</MenuItem>
              <MenuItem close={close} onClick={() => p.onCopySchema("joi")} disabled={!p.hasData}>Joi</MenuItem>
            </>
          )}
        </Menu>

        <span className="pj-sep" />
        <IconBtn title="Toggle inspector (I)" onClick={p.onToggleInspector} pressed={p.inspectorOpen}>
          <Svg>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M15 4v16" />
          </Svg>
        </IconBtn>
        <IconBtn title={`Switch to ${p.dark ? "light" : "dark"} mode (D)`} onClick={p.onToggleDark}>
          <Svg>
            {p.dark ? (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </>
            ) : (
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            )}
          </Svg>
        </IconBtn>
        <IconBtn title="Keyboard shortcuts (?)" onClick={p.onShowHelp}>
          <span className="text-[13px] font-semibold">?</span>
        </IconBtn>
      </div>
    </header>
  );
};
