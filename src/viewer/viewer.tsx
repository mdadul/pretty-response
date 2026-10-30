import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import "../styles/tailwind.css";
import { MOD, Toolbar, type InputMode, type QueryStatus, type SchemaKind, type ViewMode } from "./toolbar";
import { TreeView, type TreeViewHandle } from "./treeView";
import { TableView } from "./tableView";
import { Inspector } from "./inspector";
import { getAtPath, type Segment } from "./flatten";
import { estimateNodeCount, parseJson, getStats } from "../utils/jsonFormatter";
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences, type UserPreferences } from "../utils/storage";
import { parseJsonPath, toJsonPath } from "../utils/jsonPath";
import { buildIntermediateSchema, inferJsonKind } from "../utils/jsonTypes";
import { toJsonSchema, toPydantic, toTypescript, toZod, toYup, toJoi } from "../utils/schemaGenerator";
import { runQuery, type QueryMatch } from "../utils/jsonQuery";
import { isTabular, toCsv } from "../utils/csv";
import { copyTextToClipboard } from "../utils/clipboard";

interface InitPayload {
  text: string;
  url: string;
  contentType?: string | null;
}

declare global {
  interface Window {
    __PRETTY_JSON_INIT__?: InitPayload;
  }
}

interface ParseFailure {
  message: string;
  line: number;
  column: number;
}

const MAX_DROP_BYTES = 50 * 1024 * 1024;

const SCHEMA_LABELS: Record<SchemaKind, string> = {
  "json-schema": "JSON Schema",
  ts: "TypeScript types",
  zod: "Zod schema",
  pydantic: "Pydantic model",
  yup: "Yup schema",
  joi: "Joi schema"
};

/* ------------------------------------------------------------------- hooks */

const useInitPayload = (): InitPayload | null => {
  const [payload, setPayload] = useState<InitPayload | null>(null);
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "PRETTY_JSON_INIT") setPayload(event.data.payload as InitPayload);
    };
    window.addEventListener("message", handler);
    if (window.__PRETTY_JSON_INIT__) setPayload(window.__PRETTY_JSON_INIT__);
    return () => window.removeEventListener("message", handler);
  }, []);
  return payload;
};

function useDebounced<T>(value: T, ms: number): [T, (v: T) => void] {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return [debounced, setDebounced];
}

/* ----------------------------------------------------------------- helpers */

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function generateSchema(kind: SchemaKind, schema: ReturnType<typeof buildIntermediateSchema>): string {
  switch (kind) {
    case "json-schema":
      return toJsonSchema(schema);
    case "ts":
      return toTypescript(schema, "Root");
    case "zod":
      return toZod(schema, "RootSchema");
    case "pydantic":
      return toPydantic(schema, "RootModel");
    case "yup":
      return toYup(schema, "RootSchema");
    case "joi":
      return toJoi(schema, "rootSchema");
  }
}

function downloadText(text: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function baseFileName(source: string | null): string {
  if (!source) return "data";
  try {
    const last = new URL(source).pathname.split("/").filter(Boolean).pop();
    if (last) return last.replace(/\.json$/i, "");
  } catch {
    if (!source.includes("/")) return source.replace(/\.json$/i, "");
  }
  return "data";
}

/* ------------------------------------------------------------------ pieces */

const Breadcrumbs: React.FC<{ path: Segment[]; onNavigate: (p: Segment[]) => void }> = ({ path, onNavigate }) => (
  <nav className="flex min-w-0 flex-1 items-center overflow-hidden font-mono" aria-label="Selected path">
    {path.map((seg, i) => (
      <React.Fragment key={i}>
        {i > 0 && typeof seg !== "number" && <span className="pj-subtle">.</span>}
        <button
          type="button"
          className="pj-btn !h-5 max-w-[12rem] shrink-0 truncate !px-1 font-mono !text-[11px]"
          style={i === path.length - 1 ? { color: "var(--pj-fg)" } : undefined}
          onClick={() => onNavigate(path.slice(0, i + 1))}
        >
          {i === 0 ? "$" : typeof seg === "number" ? `[${seg}]` : seg}
        </button>
      </React.Fragment>
    ))}
  </nav>
);

const PinsMenu: React.FC<{ pinned: string[]; onSelect: (p: string) => void; onRemove: (p: string) => void }> = ({ pinned, onSelect, onRemove }) => {
  const [open, setOpen] = useState(false);
  if (!pinned.length) return null;
  return (
    <div className="relative shrink-0">
      <button type="button" className="pj-btn !h-5 !text-[11px]" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        ★ {pinned.length}
      </button>
      {open && (
        <div className="pj-menu absolute bottom-full right-0 z-30 mb-1 max-h-72 w-80 overflow-auto" onMouseLeave={() => setOpen(false)}>
          {pinned.map((p) => (
            <div key={p} className="pj-menu-item !py-1">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left font-mono"
                onClick={() => {
                  onSelect(p);
                  setOpen(false);
                }}
              >
                {p}
              </button>
              <button type="button" className="pj-icon-btn" onClick={() => onRemove(p)} aria-label={`Unpin ${p}`}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ErrorPanel: React.FC<{ error: ParseFailure; text: string }> = ({ error, text }) => {
  const lines = text.split(/\r?\n/);
  const start = Math.max(0, error.line - 3);
  const snippet = lines.slice(start, error.line + 2);
  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-3xl rounded-lg border p-5" style={{ borderColor: "var(--pj-danger)", background: "var(--pj-surface)" }}>
        <div className="text-sm font-semibold" style={{ color: "var(--pj-danger)" }}>
          Invalid JSON
        </div>
        <p className="mt-1 text-sm">
          {error.message} at line {error.line}, column {error.column}
        </p>
        <pre className="pj-code mt-4 overflow-auto !text-xs">
          {snippet.map((l, i) => {
            const n = start + i + 1;
            const isErr = n === error.line;
            return (
              <div key={n}>
                <span className="pj-subtle inline-block w-10 select-none pr-3 text-right">{n}</span>
                <span style={isErr ? { color: "var(--pj-danger)" } : undefined}>{l.slice(0, 300)}</span>
                {isErr && (
                  <div style={{ color: "var(--pj-danger)" }}>
                    <span className="inline-block w-10" />
                    {" ".repeat(Math.max(0, Math.min(error.column - 1, 300)))}^
                  </div>
                )}
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
};

const SHORTCUTS: [string, string][] = [
  [`${MOD} F`, "Search keys and values"],
  [`${MOD} K`, "JSONPath / jq query"],
  ["Enter / ⇧ Enter", "Next / previous match"],
  ["↑ ↓ PgUp PgDn", "Move selection"],
  ["← →", "Collapse / expand (Alt: subtree)"],
  ["Enter / Space", "Toggle node"],
  [`${MOD} C`, "Copy selected value"],
  ["Alt click", "Expand / collapse whole subtree"],
  ["E / C", "Expand / collapse all"],
  ["S", "Sort keys A→Z"],
  ["T", "Tree / table view"],
  ["I", "Toggle inspector"],
  ["D", "Toggle dark mode"],
  [`${MOD} ⇧ C`, "Copy formatted JSON"],
  [`${MOD} S`, "Download JSON"],
  [`${MOD} + / −`, "Font size"],
  ["Esc", "Clear input / selection"]
];

const QUERY_EXAMPLES: [string, string][] = [
  ["$.items[*].id", "every id in items"],
  ["$..name", "all name fields, any depth"],
  ["$.items[?(@.price > 10)]", "filter by condition"],
  ["$.items[?(@.tag =~ /beta/i)]", "regex match"],
  ["$.items[-1]", "last element"],
  [".items[].id", "jq-style shorthand"]
];

const HelpDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]" onClick={onClose} role="dialog" aria-modal aria-label="Keyboard shortcuts">
    <div className="pj-menu grid w-full max-w-3xl gap-6 !p-5 md:grid-cols-2" onClick={(e) => e.stopPropagation()}>
      <div>
        <h2 className="mb-3 text-sm font-semibold">Keyboard shortcuts</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          {SHORTCUTS.map(([k, d]) => (
            <React.Fragment key={k}>
              <dt>
                <span className="pj-kbd !px-1.5">{k}</span>
              </dt>
              <dd className="pj-muted">{d}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Query examples</h2>
          <button type="button" className="pj-icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <dl className="space-y-2">
          {QUERY_EXAMPLES.map(([q, d]) => (
            <div key={q}>
              <dt className="font-mono" style={{ color: "var(--pj-key)" }}>
                {q}
              </dt>
              <dd className="pj-subtle">{d}</dd>
            </div>
          ))}
        </dl>
        <p className="pj-subtle mt-4">Drop a .json file anywhere to open it.</p>
      </div>
    </div>
  </div>
);

/* --------------------------------------------------------------------- app */

const ViewerApp: React.FC = () => {
  const init = useInitPayload();
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<unknown>(undefined);
  const [parseError, setParseError] = useState<ParseFailure | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [nodeInfo, setNodeInfo] = useState<{ count: number; truncated: boolean } | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);

  const [selection, setSelection] = useState<Segment[] | null>(null);
  const [reveal, setReveal] = useState<{ path: Segment[]; n: number } | null>(null);
  const [view, setView] = useState<ViewMode>("tree");

  const [inputMode, setInputMode] = useState<InputMode>("search");
  const [searchInput, setSearchInput] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [searchQuery, setSearchQuery] = useDebounced(searchInput, 150);
  const [queryText, setQueryText] = useDebounced(queryInput, 200);
  const [matches, setMatches] = useState<Segment[][]>([]);
  const [matchesCapped, setMatchesCapped] = useState(false);
  const [matchIndex, setMatchIndex] = useState<number | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const treeRef = useRef<TreeViewHandle>(null);
  const toastTimer = useRef<number | null>(null);
  const schemaCache = useRef<{ value: unknown; schema: ReturnType<typeof buildIntermediateSchema> } | null>(null);

  const hasData = parsed !== undefined && !parseError;
  const dark = prefs.theme === "dark";
  const fontScale = prefs.fontScale ?? 1;
  const pinned = prefs.pinnedPaths ?? [];
  const sortKeys = prefs.sortKeys ?? false;
  const inspectorOpen = prefs.inspector ?? true;

  useEffect(() => {
    void loadPreferences().then(setPrefs);
  }, []);

  const updatePrefs = useCallback((next: Partial<UserPreferences>) => {
    setPrefs((prev) => {
      const merged = { ...prev, ...next };
      void savePreferences(merged);
      return merged;
    });
  }, []);

  const loadText = useCallback((text: string, src: string | null) => {
    setRawText(text);
    setSource(src);
    setSelection(null);
    setView("tree");
    schemaCache.current = null;
    const result = parseJson(text);
    if (result.kind === "success") {
      setParsed(result.value);
      setParseError(null);
      setNodeInfo(estimateNodeCount(result.value));
    } else {
      setParsed(undefined);
      setParseError({ message: result.error.message, line: result.error.line, column: result.error.column });
      setNodeInfo(null);
    }
  }, []);

  useEffect(() => {
    if (init) loadText(init.text, init.url);
  }, [init, loadText]);

  useEffect(() => {
    document.title = source ? `${source.replace(/^https?:\/\//, "")} · Pretty JSON` : "Pretty JSON";
  }, [source]);

  useEffect(() => {
    if (hasData) requestAnimationFrame(() => treeRef.current?.focus());
  }, [hasData, parsed]);

  const stats = useMemo(() => getStats(rawText), [rawText]);

  /* --- toast / copy --- */
  const showToast = useCallback((message: string) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    []
  );
  const copy = useCallback(
    async (text: string, msg: string) => {
      showToast((await copyTextToClipboard(text)) ? msg : "Copy failed");
    },
    [showToast]
  );

  /* --- query --- */
  const queryResult = useMemo((): (QueryStatus & { matches: QueryMatch[] }) | null => {
    if (!hasData || !queryText.trim()) return null;
    try {
      const r = runQuery(parsed, queryText);
      return { matches: r.matches, count: r.matches.length, truncated: r.truncated, error: null };
    } catch (e) {
      return { matches: [], count: 0, truncated: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [hasData, parsed, queryText]);

  const queryActive = inputMode === "query" && !!queryResult && !queryResult.error;

  const { resultsValue, resultPaths } = useMemo(() => {
    const map = new Map<string, Segment[]>();
    const obj: Record<string, unknown> = {};
    if (queryActive && queryResult) {
      for (const m of queryResult.matches) {
        const k = toJsonPath(m.path);
        if (!map.has(k)) {
          map.set(k, m.path);
          obj[k] = m.value;
        }
      }
    }
    return { resultsValue: obj, resultPaths: map };
  }, [queryActive, queryResult]);

  const treeValue = queryActive ? resultsValue : parsed;

  /** Selection in document coordinates (maps query-result rows back to the source). */
  const realPath = useMemo((): Segment[] | null => {
    if (!selection) return null;
    if (!queryActive) return selection;
    if (selection.length < 2) return null;
    const base = resultPaths.get(String(selection[1]));
    return base ? [...base, ...selection.slice(2)] : null;
  }, [selection, queryActive, resultPaths]);

  const selectedValue = selection && hasData ? getAtPath(treeValue, selection) : undefined;

  const exitQuery = useCallback(() => {
    setQueryInput("");
    setQueryText("");
    setInputMode("search");
  }, [setQueryText]);

  const navigateTo = useCallback(
    (p: Segment[]) => {
      if (queryActive) exitQuery();
      setView("tree");
      setSelection(p);
      setReveal((r) => ({ path: p, n: (r?.n ?? 0) + 1 }));
    },
    [queryActive, exitQuery]
  );

  /* --- search navigation --- */
  const onMatchesChange = useCallback((m: Segment[][], capped: boolean) => {
    setMatches(m);
    setMatchesCapped(capped);
    setMatchIndex(m.length ? 0 : null);
  }, []);
  const stepMatch = (dir: 1 | -1) => {
    if (!matches.length) return;
    setMatchIndex((i) => ((((i ?? 0) + dir) % matches.length) + matches.length) % matches.length);
  };
  useEffect(() => {
    if (matchIndex !== null && matches[matchIndex]) setSelection(matches[matchIndex]);
  }, [matchIndex, matches]);

  /* --- table --- */
  const tableSource = useMemo(() => {
    if (!hasData) return null;
    if (queryActive && queryResult) {
      const vals = queryResult.matches.map((m) => m.value);
      if (isTabular(vals)) return { items: vals, rowPaths: queryResult.matches.map((m) => m.path), title: queryText.trim() };
    }
    const from = realPath ?? ["$"];
    for (let i = from.length; i >= 1; i--) {
      const sub = from.slice(0, i);
      const v = getAtPath(parsed, sub);
      if (isTabular(v)) return { items: v, rowPaths: v.map((_, j) => [...sub, j]), title: toJsonPath(sub) };
    }
    return null;
  }, [hasData, queryActive, queryResult, queryText, realPath, parsed]);

  const effectiveView: ViewMode = view === "table" && tableSource ? "table" : "tree";

  /* --- actions --- */
  const prettyText = useMemo(() => (hasData ? JSON.stringify(parsed, null, 2) : ""), [hasData, parsed]);

  const download = useCallback(() => {
    if (!hasData) return;
    const name = `${baseFileName(source)}.json`;
    downloadText(prettyText, name, "application/json");
    showToast(`Downloaded ${name}`);
  }, [hasData, prettyText, source, showToast]);

  const copySchema = useCallback(
    (kind: SchemaKind) => {
      if (!hasData) return;
      if (!schemaCache.current || schemaCache.current.value !== parsed) {
        schemaCache.current = { value: parsed, schema: buildIntermediateSchema(parsed) };
      }
      void copy(generateSchema(kind, schemaCache.current.schema), `Copied ${SCHEMA_LABELS[kind]}`);
    },
    [hasData, parsed, copy]
  );

  const togglePin = () => {
    if (!realPath) return;
    const s = toJsonPath(realPath);
    updatePrefs({ pinnedPaths: pinned.includes(s) ? pinned.filter((x) => x !== s) : [...pinned, s] });
  };

  const changeFont = (delta: number) =>
    updatePrefs({ fontScale: Math.min(1.8, Math.max(0.7, Math.round((fontScale + delta) * 10) / 10)) });

  const focusInput = (mode: InputMode) => {
    setInputMode(mode);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  /* --- global shortcuts --- */
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    const target = e.target as HTMLElement;
    const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
    const key = e.key.toLowerCase();
    if (mod && key === "f") {
      e.preventDefault();
      focusInput("search");
    } else if (mod && key === "k") {
      e.preventDefault();
      focusInput("query");
    } else if (mod && key === "s") {
      e.preventDefault();
      download();
    } else if (mod && e.shiftKey && key === "c") {
      e.preventDefault();
      if (hasData) void copy(prettyText, "Copied formatted JSON");
    } else if (mod && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      changeFont(0.1);
    } else if (mod && e.key === "-") {
      e.preventDefault();
      changeFont(-0.1);
    } else if (e.key === "Escape") {
      if (helpOpen) setHelpOpen(false);
      else if (typing) return;
      else if (inputMode === "query" && queryInput) exitQuery();
      else if (searchInput) setSearchInput("");
      else setSelection(null);
    } else if (!typing && !mod && !e.altKey) {
      switch (e.key) {
        case "/":
          e.preventDefault();
          focusInput(inputMode);
          break;
        case "?":
          setHelpOpen((o) => !o);
          break;
        case "e":
          setView("tree");
          treeRef.current?.expandAll();
          break;
        case "c":
          setView("tree");
          treeRef.current?.collapseAll();
          break;
        case "s":
          updatePrefs({ sortKeys: !sortKeys });
          break;
        case "i":
          updatePrefs({ inspector: !inspectorOpen });
          break;
        case "d":
          updatePrefs({ theme: dark ? "light" : "dark" });
          break;
        case "t":
          setView(effectiveView === "table" || !tableSource ? "tree" : "table");
          break;
      }
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  /* --- drag and drop --- */
  const handleDrop: React.DragEventHandler = (event) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (file.size > MAX_DROP_BYTES) {
      showToast("File too large (max 50 MB)");
      return;
    }
    exitQuery();
    setSearchInput("");
    void file.text().then((t) => loadText(t, file.name));
  };

  const rootKind = hasData ? inferJsonKind(parsed) : null;
  const rootSize =
    hasData && parsed !== null && typeof parsed === "object"
      ? Array.isArray(parsed)
        ? `${parsed.length.toLocaleString()} items`
        : `${Object.keys(parsed).length.toLocaleString()} keys`
      : null;
  const nodesLabel = nodeInfo ? `${nodeInfo.truncated ? "200k+" : nodeInfo.count.toLocaleString()}` : null;

  const queryBanner = inputMode === "query" && queryInput.trim() && queryResult && (
    <div
      className="pj-border flex h-8 shrink-0 items-center gap-2 border-b px-3 text-xs"
      style={
        queryResult.error
          ? { background: "color-mix(in srgb, var(--pj-danger) 8%, transparent)", color: "var(--pj-danger)" }
          : { background: "color-mix(in srgb, var(--pj-accent) 6%, transparent)" }
      }
    >
      {queryResult.error ? (
        <span className="truncate">Query error: {queryResult.error}</span>
      ) : (
        <>
          <span className="font-medium">
            {queryResult.count.toLocaleString()}
            {queryResult.truncated ? "+" : ""} {queryResult.count === 1 ? "result" : "results"}
          </span>
          <span className="pj-muted min-w-0 truncate font-mono">{queryText}</span>
          <span className="ml-auto" />
          <button
            type="button"
            className="pj-btn !h-6"
            onClick={() => void copy(JSON.stringify(queryResult.matches.map((m) => m.value), null, 2), "Copied results")}
          >
            Copy results
          </button>
          <button
            type="button"
            className="pj-btn !h-6"
            onClick={() => void copy(JSON.stringify(Object.fromEntries(queryResult.matches.map((m) => [toJsonPath(m.path), m.value])), null, 2), "Copied results with paths")}
          >
            Copy with paths
          </button>
          <button type="button" className="pj-btn !h-6" onClick={exitQuery}>
            Close
          </button>
        </>
      )}
    </div>
  );

  return (
    <div
      className={`pj-root ${dark ? "pj-dark" : ""} relative flex h-full flex-col`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <Toolbar
        hasData={hasData}
        dark={dark}
        onToggleDark={() => updatePrefs({ theme: dark ? "light" : "dark" })}
        view={effectiveView}
        onViewChange={setView}
        tableAvailable={!!tableSource}
        sortKeys={sortKeys}
        onToggleSortKeys={() => updatePrefs({ sortKeys: !sortKeys })}
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => updatePrefs({ inspector: !inspectorOpen })}
        inputMode={inputMode}
        onInputModeChange={(m) => {
          setInputMode(m);
          setSelection(null);
        }}
        inputRef={inputRef}
        searchQuery={searchInput}
        onSearchChange={setSearchInput}
        searchMatchCount={matches.length}
        searchCapped={matchesCapped}
        searchCurrentIndex={matchIndex}
        onSearchNext={() => stepMatch(1)}
        onSearchPrev={() => stepMatch(-1)}
        queryText={queryInput}
        onQueryChange={(q) => {
          setQueryInput(q);
          setSelection(null);
          if (!q) setQueryText("");
        }}
        queryStatus={queryResult}
        onCopyFormatted={() => void copy(prettyText, "Copied formatted JSON")}
        onCopyMinified={() => void copy(JSON.stringify(parsed), "Copied minified JSON")}
        onDownload={download}
        onCopySchema={copySchema}
        onExpandAll={() => treeRef.current?.expandAll()}
        onCollapseAll={() => treeRef.current?.collapseAll()}
        onShowHelp={() => setHelpOpen(true)}
      />

      {queryBanner}

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1" aria-label="Pretty JSON main area">
          {!init && !rawText ? (
            <div className="pj-muted flex h-full flex-col items-center justify-center gap-2 text-sm">
              <span className="font-mono text-2xl" style={{ color: "var(--pj-accent)" }}>
                {"{ }"}
              </span>
              <span>Waiting for JSON…</span>
              <span className="pj-subtle text-xs">Or drop a .json file here</span>
            </div>
          ) : parseError ? (
            <ErrorPanel error={parseError} text={rawText} />
          ) : effectiveView === "table" && tableSource ? (
            <TableView
              items={tableSource.items}
              rowPaths={tableSource.rowPaths}
              title={tableSource.title}
              fontScale={fontScale}
              onOpenCell={navigateTo}
              onCopyCsv={(cols) => void copy(toCsv(tableSource.items, cols), "Copied CSV")}
              onExportCsv={(cols) => {
                const name = `${baseFileName(source)}.csv`;
                downloadText(toCsv(tableSource.items, cols), name, "text/csv");
                showToast(`Downloaded ${name}`);
              }}
            />
          ) : hasData ? (
            <TreeView
              ref={treeRef}
              value={treeValue}
              sortKeys={sortKeys}
              selectedPath={selection}
              onSelectPath={setSelection}
              searchQuery={inputMode === "search" ? searchQuery : ""}
              activeMatchIndex={matchIndex}
              onMatchesChange={onMatchesChange}
              reveal={reveal}
              fontScale={fontScale}
              onCopied={showToast}
            />
          ) : null}
        </main>

        {inspectorOpen && hasData && (
          <Inspector
            path={realPath ?? (selection && queryActive ? selection : null)}
            value={selectedValue}
            docSummary={{ kind: rootKind ?? "", size: rootSize, bytes: stats.bytes, nodes: nodesLabel }}
            isPinned={realPath ? pinned.includes(toJsonPath(realPath)) : false}
            onTogglePin={togglePin}
            onCopy={(t, m) => void copy(t, m)}
            onClose={() => updatePrefs({ inspector: false })}
            onJumpToSource={queryActive && realPath ? () => navigateTo(realPath) : undefined}
          />
        )}
      </div>

      <footer className="pj-bar pj-muted flex h-7 shrink-0 items-center gap-3 border-t pl-1 pr-3 text-[11px] tabular-nums" aria-label="Status bar">
        {realPath ? (
          <Breadcrumbs path={realPath} onNavigate={navigateTo} />
        ) : (
          <span className="pj-subtle min-w-0 flex-1 truncate pl-2" title={source ?? undefined}>
            {source}
          </span>
        )}
        <PinsMenu
          pinned={pinned}
          onSelect={(s) => {
            const p = parseJsonPath(s);
            if (p) navigateTo(p);
          }}
          onRemove={(s) => updatePrefs({ pinnedPaths: pinned.filter((x) => x !== s) })}
        />
        <div className="flex shrink-0 items-center gap-3">
          {parseError ? (
            <span style={{ color: "var(--pj-danger)" }}>
              ● {parseError.message} · Ln {parseError.line}, Col {parseError.column}
            </span>
          ) : hasData ? (
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--pj-success)" }} />
              Valid
            </span>
          ) : null}
          {rootSize && <span>{rootSize}</span>}
          {nodesLabel && <span>{nodesLabel} nodes</span>}
          <span>{formatBytes(stats.bytes)}</span>
        </div>
      </footer>

      {dragging && (
        <div
          className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded-xl border-2 border-dashed text-sm font-medium"
          style={{ borderColor: "var(--pj-accent)", background: "color-mix(in srgb, var(--pj-bg) 85%, transparent)", color: "var(--pj-accent)" }}
        >
          Drop JSON file to open
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-10 right-4 z-50" role="status" aria-live="polite">
          <div className="pj-menu !px-3 !py-2 font-medium">{toast}</div>
        </div>
      )}

      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
    </div>
  );
};

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ViewerApp />
    </React.StrictMode>
  );
}
