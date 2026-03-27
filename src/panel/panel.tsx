import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import "../styles/tailwind.css";
import { TreeView } from "../viewer/treeView";
import { parseJson } from "../utils/jsonFormatter";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Header { name: string; value: string }

interface NetworkRequest {
  id: string;
  method: string;
  url: string;
  pathname: string;
  status: number;
  statusText: string;
  mimeType: string;
  contentTypeLabel: string;
  duration: number;
  size: number;
  requestHeaders: Header[];
  responseHeaders: Header[];
  requestBody: string | null;
  responseBody: string | null;
  isJson: boolean;
  timestamp: number;
}

type TabId = "headers" | "payload" | "response" | "pretty";

type PaneOrientation = "vertical" | "horizontal";

const LAYOUT_STORAGE_KEY = "pj-devtools-panel-layout";
const MIN_SPLIT_V = 96;
const MIN_SPLIT_H = 200;
const NARROW_BREAKPOINT = 520;

function readStoredLayout(): { orientation: PaneOrientation; split: number } {
  try {
    const raw = sessionStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return { orientation: "horizontal", split: 300 };
    const p = JSON.parse(raw) as { orientation?: PaneOrientation; split?: number };
    if (p.orientation !== "vertical" && p.orientation !== "horizontal") {
      return { orientation: "horizontal", split: 300 };
    }
    return {
      orientation: p.orientation,
      split: typeof p.split === "number" && p.split > 0 ? p.split : 300,
    };
  } catch {
    return { orientation: "horizontal", split: 300 };
  }
}

function writeStoredLayout(orientation: PaneOrientation, split: number) {
  try {
    sessionStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ orientation, split }));
  } catch {
    /* ignore */
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

let idCounter = 0;

function extractPathname(url: string): string {
  try { const u = new URL(url); return u.pathname + u.search; }
  catch { return url; }
}

function contentTypeLabel(mimeType: string): string {
  if (mimeType.includes("json"))       return "JSON";
  if (mimeType.includes("html"))       return "HTML";
  if (mimeType.includes("javascript")) return "JS";
  if (mimeType.includes("css"))        return "CSS";
  if (mimeType.startsWith("image/"))   return "IMG";
  if (mimeType.includes("xml"))        return "XML";
  if (mimeType.includes("text/plain")) return "TEXT";
  const slash = mimeType.indexOf("/");
  return slash !== -1 ? mimeType.slice(slash + 1).split(";")[0].toUpperCase().slice(0, 6) : "—";
}

function isJsonMime(mimeType: string): boolean {
  return mimeType.includes("json");
}

function methodBg(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":    return "bg-sky-500/20 text-sky-300 ring-sky-500/30";
    case "POST":   return "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30";
    case "PUT":    return "bg-amber-500/20 text-amber-300 ring-amber-500/30";
    case "PATCH":  return "bg-violet-500/20 text-violet-300 ring-violet-500/30";
    case "DELETE": return "bg-rose-500/20 text-rose-300 ring-rose-500/30";
    default:       return "bg-slate-700/50 text-slate-400 ring-slate-600/30";
  }
}

function statusDot(status: number): string {
  if (status >= 500) return "bg-rose-500";
  if (status >= 400) return "bg-amber-400";
  if (status >= 300) return "bg-sky-400";
  if (status >= 200) return "bg-emerald-500";
  return "bg-slate-500";
}

function statusText(status: number): string {
  if (status >= 500) return "text-rose-400";
  if (status >= 400) return "text-amber-400";
  if (status >= 300) return "text-sky-300";
  if (status >= 200) return "text-emerald-400";
  return "text-slate-400";
}

function fmtSize(bytes: number): string {
  if (bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDuration(ms: number): string {
  if (ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ─── App ─────────────────────────────────────────────────────────────────────

const PanelApp: React.FC = () => {
  const stored = useRef(readStoredLayout());
  const [requests, setRequests] = useState<NetworkRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("response");
  const [filter, setFilter] = useState("");
  const [recording, setRecording] = useState(true);
  const [paneOrientation, setPaneOrientation] = useState<PaneOrientation>(stored.current.orientation);
  const [splitSize, setSplitSize] = useState(stored.current.split);
  const [containerSize, setContainerSize] = useState({ w: 640, h: 400 });

  const recordingRef = useRef(true);
  const isDragging = useRef(false);
  const dragStartCoord = useRef(0);
  const dragStartSplit = useRef(stored.current.split);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => { recordingRef.current = recording; }, [recording]);

  useEffect(() => {
    writeStoredLayout(paneOrientation, splitSize);
  }, [paneOrientation, splitSize]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setContainerSize({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const effectiveOrientation: PaneOrientation =
    paneOrientation === "horizontal" && containerSize.w < NARROW_BREAKPOINT ? "vertical" : paneOrientation;

  const maxSplitVertical = Math.max(MIN_SPLIT_V + 80, containerSize.h - 140);
  const maxSplitHorizontal = Math.max(MIN_SPLIT_H + 80, Math.floor(containerSize.w * 0.72));

  useEffect(() => {
    setSplitSize((s) => {
      if (effectiveOrientation === "vertical") {
        return Math.min(Math.max(s, MIN_SPLIT_V), maxSplitVertical);
      }
      return Math.min(Math.max(s, MIN_SPLIT_H), maxSplitHorizontal);
    });
  }, [effectiveOrientation, maxSplitVertical, maxSplitHorizontal]);

  // Network listener
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.devtools?.network) return;

    const listener = (entry: chrome.devtools.network.Request) => {
      if (!recordingRef.current) return;
      const req = entry.request;
      const res = entry.response;
      const mimeType = res.content.mimeType ?? "";
      const capturedId = String(++idCounter);

      entry.getContent((body) => {
        const captured: NetworkRequest = {
          id: capturedId,
          method: req.method,
          url: req.url,
          pathname: extractPathname(req.url),
          status: res.status,
          statusText: res.statusText,
          mimeType,
          contentTypeLabel: contentTypeLabel(mimeType),
          duration: entry.time,
          size: res.content.size ?? 0,
          requestHeaders: (req.headers ?? []) as Header[],
          responseHeaders: (res.headers ?? []) as Header[],
          requestBody: req.postData?.text ?? null,
          responseBody: body || null,
          isJson: isJsonMime(mimeType),
          timestamp: Date.now(),
        };
        setRequests((prev) => {
          const next = [...prev, captured];
          return next.length > 1000 ? next.slice(-1000) : next;
        });
      });
    };

    chrome.devtools.network.onRequestFinished.addListener(listener);
    return () => chrome.devtools.network.onRequestFinished.removeListener(listener);
  }, []);

  const onResizeDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      dragStartCoord.current = effectiveOrientation === "vertical" ? e.clientY : e.clientX;
      dragStartSplit.current = splitSize;
      document.body.style.cursor = effectiveOrientation === "vertical" ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";
    },
    [effectiveOrientation, splitSize]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      if (effectiveOrientation === "vertical") {
        const delta = e.clientY - dragStartCoord.current;
        const next = Math.min(
          maxSplitVertical,
          Math.max(MIN_SPLIT_V, dragStartSplit.current + delta)
        );
        setSplitSize(next);
      } else {
        const delta = e.clientX - dragStartCoord.current;
        const next = Math.min(
          maxSplitHorizontal,
          Math.max(MIN_SPLIT_H, dragStartSplit.current + delta)
        );
        setSplitSize(next);
      }
    };
    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [effectiveOrientation, maxSplitVertical, maxSplitHorizontal]);

  const filtered = filter
    ? requests.filter(
        (r) =>
          r.url.toLowerCase().includes(filter.toLowerCase()) ||
          r.method.toLowerCase().includes(filter.toLowerCase()) ||
          String(r.status).includes(filter)
      )
    : requests;

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  const handleSelect = useCallback((req: NetworkRequest) => {
    setSelectedId(req.id);
    if (req.isJson) setActiveTab("pretty");
    else if (req.requestBody) setActiveTab("payload");
    else setActiveTab("response");
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!filtered.length) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const idx = filtered.findIndex((r) => r.id === selectedId);
      const next =
        e.key === "ArrowDown"
          ? Math.min(idx + 1, filtered.length - 1)
          : Math.max(idx - 1, 0);
      if (filtered[next]) handleSelect(filtered[next]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, selectedId, handleSelect]);

  const handleClear = () => { setRequests([]); setSelectedId(null); };

  const listPaneStyle: React.CSSProperties =
    effectiveOrientation === "vertical"
      ? { height: splitSize, minHeight: MIN_SPLIT_V, maxHeight: maxSplitVertical }
      : { width: splitSize, minWidth: MIN_SPLIT_H, maxWidth: maxSplitHorizontal };

  return (
    <div className="theme-dark flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#1e1e1e] font-sans text-[13px] leading-snug text-[#e8e8e8] antialiased">

      {/* ── Toolbar (Postman-style) ─────────────────────────── */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#3c3c3c] bg-[#252526] px-3 py-2.5 shadow-sm">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            title={recording ? "Pause recording" : "Resume recording"}
            onClick={() => setRecording((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              recording
                ? "bg-[#3c1f26] text-[#ff6b7a] ring-1 ring-[#ff6b7a]/35 hover:bg-[#4a252e]"
                : "bg-[#3c3c3c] text-[#b5b5b5] ring-1 ring-[#555] hover:bg-[#454545] hover:text-[#e0e0e0]"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${recording ? "animate-pulse bg-[#ff4757]" : "bg-[#888]"}`}
              aria-hidden
            />
            {recording ? "Recording" : "Paused"}
          </button>

          <button
            type="button"
            onClick={handleClear}
            title="Clear log"
            className="rounded-md px-3 py-1.5 text-xs font-medium text-[#b5b5b5] ring-1 ring-[#454545] transition-colors hover:bg-[#3c3c3c] hover:text-[#fff]"
          >
            Clear
          </button>
        </div>

        <div className="hidden h-5 w-px bg-[#454545] sm:block" aria-hidden />

        {/* Pane layout */}
        <div
          className="flex rounded-md bg-[#2d2d2d] p-0.5 ring-1 ring-[#454545]"
          role="group"
          aria-label="Pane layout"
        >
          <button
            type="button"
            title="Side-by-side (list | details)"
            onClick={() => setPaneOrientation("horizontal")}
            className={`rounded px-2 py-1.5 transition-colors ${
              paneOrientation === "horizontal"
                ? "bg-[#ff6c37]/20 text-[#ff9f7a] shadow-sm"
                : "text-[#888] hover:bg-[#383838] hover:text-[#ccc]"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="3" y="4" width="8" height="16" rx="1" />
              <rect x="13" y="4" width="8" height="16" rx="1" />
            </svg>
          </button>
          <button
            type="button"
            title="Stacked (list above details)"
            onClick={() => setPaneOrientation("vertical")}
            className={`rounded px-2 py-1.5 transition-colors ${
              paneOrientation === "vertical"
                ? "bg-[#ff6c37]/20 text-[#ff9f7a] shadow-sm"
                : "text-[#888] hover:bg-[#383838] hover:text-[#ccc]"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="4" y="3" width="16" height="8" rx="1" />
              <rect x="4" y="13" width="16" height="8" rx="1" />
            </svg>
          </button>
        </div>

        <div className="relative min-w-[140px] flex-1 basis-[min(100%,12rem)]">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#737373]"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            placeholder="Search URL, method, status…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-md border border-[#454545] bg-[#1e1e1e] py-2 pl-9 pr-9 text-xs text-[#e8e8e8] placeholder:text-[#737373] focus:border-[#ff6c37]/50 focus:outline-none focus:ring-1 focus:ring-[#ff6c37]/40"
          />
          {filter ? (
            <button
              type="button"
              onClick={() => setFilter("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#737373] hover:bg-[#3c3c3c] hover:text-[#e0e0e0]"
              aria-label="Clear search"
            >
              <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <path d="M1 1l8 8M9 1L1 9" />
              </svg>
            </button>
          ) : null}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {paneOrientation === "horizontal" && effectiveOrientation === "vertical" ? (
            <span className="hidden text-[10px] text-[#737373] sm:inline" title="Panel is too narrow for side-by-side">
              Stacked (narrow)
            </span>
          ) : null}
          <span className="tabular-nums text-xs text-[#737373]">
            {filtered.length} {filtered.length === 1 ? "req" : "reqs"}
          </span>
        </div>
      </header>

      {/* ── Body: resizable panes ─────────────────────────────── */}
      <div
        ref={bodyRef}
        className={`flex min-h-0 min-w-0 flex-1 overflow-hidden ${
          effectiveOrientation === "vertical" ? "flex-col" : "flex-row"
        }`}
      >
        {/* Request list */}
        <aside
          className={`flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden border-[#3c3c3c] bg-[#252526] ${
            effectiveOrientation === "vertical" ? "border-b" : "border-r"
          }`}
          style={listPaneStyle}
        >
          <div className="grid shrink-0 grid-cols-[minmax(0,10px)_minmax(52px,72px)_minmax(0,1fr)_52px_56px_52px] items-center gap-x-3 gap-y-0 border-b border-[#3c3c3c] px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
            <span aria-hidden className="block w-2.5" />
            <span>Method</span>
            <span className="min-w-0">Name / URL</span>
            <span className="text-center">Type</span>
            <span className="text-right">Time</span>
            <span className="text-right">Size</span>
          </div>

          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain" tabIndex={0}>
            {filtered.length === 0 ? (
              <EmptyList recording={recording} />
            ) : (
              filtered.map((req) => (
                <RequestRow
                  key={req.id}
                  req={req}
                  isSelected={selectedId === req.id}
                  onSelect={handleSelect}
                />
              ))
            )}
          </div>
        </aside>

        {/* Resize handle */}
        <div
          role="separator"
          aria-orientation={effectiveOrientation === "vertical" ? "horizontal" : "vertical"}
          aria-label="Resize panes"
          tabIndex={0}
          onMouseDown={onResizeDragStart}
          onKeyDown={(e) => {
            const step = 12;
            if (e.key === "ArrowLeft" && effectiveOrientation === "horizontal") {
              e.preventDefault();
              setSplitSize((s) => Math.max(MIN_SPLIT_H, s - step));
            }
            if (e.key === "ArrowRight" && effectiveOrientation === "horizontal") {
              e.preventDefault();
              setSplitSize((s) => Math.min(maxSplitHorizontal, s + step));
            }
            if (e.key === "ArrowUp" && effectiveOrientation === "vertical") {
              e.preventDefault();
              setSplitSize((s) => Math.max(MIN_SPLIT_V, s - step));
            }
            if (e.key === "ArrowDown" && effectiveOrientation === "vertical") {
              e.preventDefault();
              setSplitSize((s) => Math.min(maxSplitVertical, s + step));
            }
          }}
          className={`group z-10 flex shrink-0 select-none items-center justify-center bg-[#2d2d2d] transition-colors hover:bg-[#ff6c37]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6c37]/50 ${
            effectiveOrientation === "vertical"
              ? "h-2 cursor-row-resize border-y border-[#3c3c3c]"
              : "w-2 cursor-col-resize border-x border-[#3c3c3c]"
          }`}
        >
          <span
            className={`rounded-full bg-[#555] transition-colors group-hover:bg-[#ff6c37]/80 group-focus-visible:bg-[#ff6c37] ${
              effectiveOrientation === "vertical" ? "h-0.5 w-10" : "h-10 w-0.5"
            }`}
          />
        </div>

        {/* Detail */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#1e1e1e]">
          {selected ? (
            <RequestDetail request={selected} activeTab={activeTab} onTabChange={setActiveTab} />
          ) : (
            <EmptyDetail hasRequests={filtered.length > 0} />
          )}
        </main>
      </div>
    </div>
  );
};

// ─── Request row ─────────────────────────────────────────────────────────────

const RequestRow: React.FC<{
  req: NetworkRequest;
  isSelected: boolean;
  onSelect: (r: NetworkRequest) => void;
}> = ({ req, isSelected, onSelect }) => {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSelected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [isSelected]);

  return (
    <div
      ref={rowRef}
      onClick={() => onSelect(req)}
      className={`grid cursor-pointer grid-cols-[minmax(0,10px)_minmax(52px,72px)_minmax(0,1fr)_52px_56px_52px] items-center gap-x-3 border-l-[3px] px-3 py-2.5 text-xs transition-colors ${
        isSelected
          ? "border-l-[#ff6c37] bg-[#ff6c37]/[0.08]"
          : req.status >= 400
          ? "border-l-transparent bg-[#ff4757]/[0.06] hover:bg-[#ffffff]/[0.04]"
          : "border-l-transparent hover:bg-[#ffffff]/[0.04]"
      }`}
    >
      <span className={`mx-auto h-2 w-2 shrink-0 rounded-full ${statusDot(req.status)}`} title={`HTTP ${req.status}`} />

      <span className={`w-fit max-w-full shrink-0 truncate rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${methodBg(req.method)}`}>
        {req.method}
      </span>

      <span className="min-w-0 truncate font-mono text-[12px] text-[#d4d4d4]" title={req.url}>
        {req.pathname}
      </span>

      <span className="truncate text-center text-[10px] font-medium text-[#8a8a8a]">{req.contentTypeLabel}</span>

      <span className="text-right tabular-nums text-[#a3a3a3]">{fmtDuration(req.duration)}</span>

      <span className="text-right tabular-nums text-[#737373]">{fmtSize(req.size)}</span>
    </div>
  );
};

// ─── Request detail ───────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: "headers", label: "Headers" },
  { id: "payload", label: "Payload" },
  { id: "response", label: "Response" },
  { id: "pretty", label: "Pretty" },
];

const RequestDetail: React.FC<{
  request: NetworkRequest;
  activeTab: TabId;
  onTabChange: (t: TabId) => void;
}> = ({ request, activeTab, onTabChange }) => {
  const parsedJson = (() => {
    if (!request.responseBody) return null;
    const r = parseJson(request.responseBody);
    return r.kind === "success" ? r.value : null;
  })();

  const tabDisabled = (id: TabId) => {
    if (id === "payload") return !request.requestBody;
    if (id === "pretty")  return parsedJson === null;
    return false;
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#3c3c3c] bg-[#252526] px-4 py-3">
        <span className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 ${methodBg(request.method)}`}>
          {request.method}
        </span>
        <span className={`shrink-0 rounded-md bg-[#2d2d2d] px-2 py-1 text-xs font-semibold tabular-nums ring-1 ring-[#454545] ${statusText(request.status)}`}>
          {request.status} {request.statusText}
        </span>
        <span className="min-w-0 flex-1 basis-[min(100%,12rem)] break-all font-mono text-xs leading-relaxed text-[#a3a3a3]" title={request.url}>
          {request.url}
        </span>
        <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs tabular-nums text-[#737373]">
          <span title="Duration">{fmtDuration(request.duration)}</span>
          <span className="hidden h-3 w-px bg-[#454545] sm:inline" aria-hidden />
          <span title="Size">{fmtSize(request.size)}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-stretch gap-0 border-b border-[#3c3c3c] bg-[#1e1e1e] px-2">
        {TABS.map((tab) => {
          const disabled = tabDisabled(tab.id);
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onTabChange(tab.id)}
              className={`relative px-4 py-3 text-xs font-semibold transition-colors ${
                active
                  ? "text-[#ff9f7a] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#ff6c37]"
                  : disabled
                  ? "cursor-not-allowed text-[#555]"
                  : "text-[#8a8a8a] hover:text-[#d4d4d4]"
              }`}
            >
              {tab.label}
              {tab.id === "headers" ? (
                <span
                  className={`ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    active ? "bg-[#ff6c37]/25 text-[#ffb89a]" : "bg-[#3c3c3c] text-[#8a8a8a]"
                  }`}
                >
                  {request.requestHeaders.length + request.responseHeaders.length}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#1e1e1e]">
        {activeTab === "headers"  && <HeadersTab request={request} />}
        {activeTab === "payload"  && <PayloadTab request={request} parsedJson={null} />}
        {activeTab === "response" && <RawBodyTab body={request.responseBody} />}
        {activeTab === "pretty"   && (
          parsedJson !== null
            ? (
              <div className="min-h-0 min-w-0">
                <TreeView value={parsedJson} fontScale={0.9} />
              </div>
            )
            : <Placeholder icon="⚠" text="Response is not valid JSON" sub="Switch to the Response tab to see the raw body" />
        )}
      </div>
    </div>
  );
};

// ─── Headers tab ─────────────────────────────────────────────────────────────

const HeadersTab: React.FC<{ request: NetworkRequest }> = ({ request }) => (
  <div className="p-4 sm:p-5 space-y-6">
    <HeaderSection
      title="General"
      headers={[
        { name: "URL", value: request.url },
        { name: "Method", value: request.method },
        { name: "Status", value: `${request.status} ${request.statusText}` },
        { name: "Duration", value: fmtDuration(request.duration) },
        { name: "Response size", value: fmtSize(request.size) },
        { name: "Content type", value: request.mimeType || "—" },
      ]}
    />
    {request.responseHeaders.length > 0 && (
      <HeaderSection title={`Response headers (${request.responseHeaders.length})`} headers={request.responseHeaders} />
    )}
    {request.requestHeaders.length > 0 && (
      <HeaderSection title={`Request headers (${request.requestHeaders.length})`} headers={request.requestHeaders} />
    )}
  </div>
);

const HeaderSection: React.FC<{ title: string; headers: Header[] }> = ({ title, headers }) => (
  <div>
    <div className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-[#737373]">{title}</div>
    <div className="overflow-hidden rounded-lg border border-[#3c3c3c] bg-[#252526]">
      {headers.map((h, i) => (
        <div
          key={i}
          className={`grid gap-3 px-3 py-2.5 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4 ${i > 0 ? "border-t border-[#3c3c3c]" : ""}`}
        >
          <span className="min-w-0 truncate text-xs font-semibold text-[#ff9f7a]" title={h.name}>
            {h.name}
          </span>
          <span className="min-w-0 break-all font-mono text-xs text-[#d4d4d4]">{h.value}</span>
        </div>
      ))}
    </div>
  </div>
);

// ─── Payload tab ─────────────────────────────────────────────────────────────

const PayloadTab: React.FC<{ request: NetworkRequest; parsedJson: unknown }> = ({ request }) => {
  if (!request.requestBody) return <Placeholder icon="📭" text="No request body" sub="This request was sent without a body" />;

  const parsed = (() => { try { return JSON.parse(request.requestBody); } catch { return null; } })();

  if (parsed !== null) {
    return (
      <div className="min-h-0 min-w-0">
        <TreeView value={parsed} fontScale={0.9} />
      </div>
    );
  }

  return (
    <pre className="p-4 font-mono text-xs leading-relaxed text-[#d4d4d4] whitespace-pre-wrap break-all sm:p-5">
      {request.requestBody}
    </pre>
  );
};

// ─── Response tab ─────────────────────────────────────────────────────────────

const RawBodyTab: React.FC<{ body: string | null }> = ({ body }) => {
  if (!body) return <Placeholder icon="📭" text="No response body" sub="The server returned an empty response" />;
  return (
    <pre className="p-4 font-mono text-xs leading-relaxed text-[#d4d4d4] whitespace-pre-wrap break-all sm:p-5">
      {body}
    </pre>
  );
};

// ─── Empty states ─────────────────────────────────────────────────────────────

const EmptyList: React.FC<{ recording: boolean }> = ({ recording }) => (
  <div className="flex h-full min-h-[8rem] flex-col items-center justify-center gap-3 px-4 text-[#737373]">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <p className="max-w-[16rem] text-center text-xs leading-relaxed">
      {recording ? "Reload or navigate to capture network requests." : "Recording is paused — resume to capture traffic."}
    </p>
  </div>
);

const EmptyDetail: React.FC<{ hasRequests: boolean }> = ({ hasRequests }) => (
  <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-[#737373]">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 9h6M9 12h6M9 15h4" strokeLinecap="round" />
    </svg>
    <p className="max-w-[18rem] text-center text-xs leading-relaxed">
      {hasRequests ? "Choose a request from the list to view headers, body, and pretty JSON." : "No requests yet — open the Network tab and reload if needed."}
    </p>
  </div>
);

const Placeholder: React.FC<{ icon: string; text: string; sub: string }> = ({ icon, text, sub }) => (
  <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2 px-4 py-8">
    <span className="text-2xl opacity-40 grayscale">{icon}</span>
    <span className="text-sm font-medium text-[#a3a3a3]">{text}</span>
    <span className="max-w-sm text-center text-xs text-[#737373]">{sub}</span>
  </div>
);

// ─── Mount ────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <PanelApp />
    </React.StrictMode>
  );
}
