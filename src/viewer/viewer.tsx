import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import "../styles/tailwind.css";
import { Toolbar } from "./toolbar";
import { TreeView, type TreeViewHandle } from "./treeView";
import { estimateNodeCount, parseJson, getStats } from "../utils/jsonFormatter";
import { loadPreferences, savePreferences, type ThemeId, type UserPreferences, type HostPreset } from "../utils/storage";
import { themes } from "./theme";
import { parseJsonPath, toJsonPath } from "../utils/jsonPath";
import { buildIntermediateSchema } from "../utils/jsonTypes";
import { toJsonSchema, toPydantic, toTypescript, toZod, toYup, toJoi } from "../utils/schemaGenerator";
import { copyTextToClipboard } from "../utils/clipboard";

interface InitPayload {
  text: string;
  url: string;
  contentType?: string | null;
  navigation?: {
    transferSize?: number;
    encodedBodySize?: number;
    decodedBodySize?: number;
  };
}

declare global {
  interface Window {
    __PRETTY_JSON_INIT__?: InitPayload;
  }
}

const useInitPayload = (): InitPayload | null => {
  const [payload, setPayload] = useState<InitPayload | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "PRETTY_JSON_INIT") {
        setPayload(event.data.payload as InitPayload);
      }
    };
    window.addEventListener("message", handler);
    if (window.__PRETTY_JSON_INIT__) {
      setPayload(window.__PRETTY_JSON_INIT__);
    }
    return () => window.removeEventListener("message", handler);
  }, []);

  return payload;
};

const ViewerApp: React.FC = () => {
  const init = useInitPayload();
  const [rawText, setRawText] = useState<string>("");
  const [parsed, setParsed] = useState<unknown | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedPathSegments, setSelectedPathSegments] = useState<(string | number)[] | null>(null);
  const [pinnedPaths, setPinnedPaths] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchCurrentIndex, setSearchCurrentIndex] = useState<number | null>(null);
  const [fontScale, setFontScale] = useState<number>(1);
  const [nodeCount, setNodeCount] = useState<number | null>(null);
  const [nodeCountTruncated, setNodeCountTruncated] = useState(false);
  const [manualSafeMode, setManualSafeMode] = useState<boolean | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const treeViewRef = useRef<TreeViewHandle>(null);
  const searchMatchIndexRef = useRef(0);
  const toastTimeoutRef = useRef<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const schemaCacheRef = useRef<{ text: string; schema: ReturnType<typeof buildIntermediateSchema> } | null>(null);

  useEffect(() => {
    loadPreferences().then((p) => {
      setPrefs(p);
      setFontScale(p.fontScale ?? 1);
      setPinnedPaths(p.pinnedPaths ?? []);
    });
  }, []);

  useEffect(
    () => () => {
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!init) return;
    setRawText(init.text);
    const result = parseJson(init.text);
    if (result.kind === "success") {
      setParsed(result.value);
      setParseError(null);
      const { count, truncated } = estimateNodeCount(result.value);
      setNodeCount(count);
      setNodeCountTruncated(truncated);
    } else {
      setParsed(null);
      setParseError(`${result.error.message} at ${result.error.line}:${result.error.column}`);
      setNodeCount(null);
      setNodeCountTruncated(false);
    }
    schemaCacheRef.current = null;
  }, [init]);

  const stats = useMemo(() => getStats(rawText), [rawText]);

  const isHugeBySize = stats.bytes > 10 * 1024 * 1024;
  const isHugeByNodes =
    nodeCount !== null ? nodeCount > 50000 || (nodeCountTruncated && nodeCount >= 200000) : false;
  const autoSafeMode = isHugeBySize || isHugeByNodes;
  const safeModeEnabled = manualSafeMode !== null ? manualSafeMode : autoSafeMode;
  const searchDisabled = safeModeEnabled && (isHugeBySize || isHugeByNodes);

  const searchMatchCount = useMemo(() => {
    if (searchDisabled) return null;
    const q = searchQuery.trim().toLowerCase();
    if (!q || !parsed) return null;
    let count = 0;
    const walk = (val: unknown, key: string | null): void => {
      const label = key ?? "";
      const valueText =
        val === null || val === undefined
          ? String(val)
          : typeof val === "object"
            ? JSON.stringify(val)
            : String(val);
      if (label.toLowerCase().includes(q) || valueText.toLowerCase().includes(q)) count++;
      if (val !== null && typeof val === "object" && !Array.isArray(val)) {
        for (const [k, v] of Object.entries(val)) walk(v, k);
      } else if (Array.isArray(val)) {
        val.forEach((v, i) => walk(v, String(i)));
      }
    };
    walk(parsed, null);
    return count;
  }, [parsed, searchQuery, searchDisabled]);

  useEffect(() => {
    // Reset index whenever the query changes or match count updates
    if (searchDisabled || !searchQuery.trim() || !searchMatchCount || searchMatchCount <= 0) {
      searchMatchIndexRef.current = 0;
      setSearchCurrentIndex(null);
      return;
    }
    searchMatchIndexRef.current = 0;
    setSearchCurrentIndex(0);
    // Scroll to the first match so users immediately see a result
    treeViewRef.current?.scrollToMatchIndex(0);
  }, [searchQuery, searchMatchCount]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSearchNext = () => {
    if (!searchMatchCount || searchMatchCount <= 0) return;
    const nextRaw = searchMatchIndexRef.current + 1;
    const wrapped = ((nextRaw % searchMatchCount) + searchMatchCount) % searchMatchCount;
    searchMatchIndexRef.current = wrapped;
    setSearchCurrentIndex(wrapped);
    treeViewRef.current?.scrollToMatchIndex(wrapped);
  };

  const handleSearchPrev = () => {
    if (!searchMatchCount || searchMatchCount <= 0) return;
    const prevRaw = searchMatchIndexRef.current - 1;
    const wrapped = ((prevRaw % searchMatchCount) + searchMatchCount) % searchMatchCount;
    searchMatchIndexRef.current = wrapped;
    setSearchCurrentIndex(wrapped);
    treeViewRef.current?.scrollToMatchIndex(wrapped);
  };

  const handlePreferencesChange = (next: Partial<UserPreferences>) => {
    setPrefs((prev) => {
      const merged = {
        ...(prev ?? { theme: "dark", viewMode: "code" as const, fontScale: 1, pinnedPaths: [] }),
        ...next
      };
      void savePreferences(merged);
      return merged;
    });
  };

  const showToast = (message: string) => {
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    setToast(message);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 1600);
  };

  const themeId: ThemeId = prefs?.theme ?? "dark";

  const handlePinCurrentPath = () => {
    if (!selectedPath) return;
    setPinnedPaths((prev) => {
      if (prev.includes(selectedPath)) return prev;
      const next = [...prev, selectedPath];
      handlePreferencesChange({ pinnedPaths: next });
      return next;
    });
  };

  const handleSelectPinnedPath = (pathStr: string) => {
    const segments = parseJsonPath(pathStr);
    if (!segments) return;
    setSelectedPath(pathStr);
    setSelectedPathSegments(segments);
    treeViewRef.current?.scrollToPath(segments);
  };

  const handleCopy = () => {
    try {
      const text = rawText;
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(textarea);
      }
      showToast("Copied JSON to clipboard");
    } catch (error) {
      console.error("Copy failed", error);
    }
  };

  const ensureSchema = () => {
    if (!parsed) return null;
    if (schemaCacheRef.current && schemaCacheRef.current.text === rawText) {
      return schemaCacheRef.current.schema;
    }
    const schema = buildIntermediateSchema(parsed);
    schemaCacheRef.current = { text: rawText, schema };
    return schema;
  };

  const handleCopySchema = async (kind: "json-schema" | "ts" | "zod" | "pydantic" | "yup" | "joi") => {
    const schema = ensureSchema();
    if (!schema) return;
    let text: string;
    switch (kind) {
      case "json-schema":
        text = toJsonSchema(schema);
        break;
      case "ts":
        text = toTypescript(schema, "Root");
        break;
      case "zod":
        text = toZod(schema, "RootSchema");
        break;
      case "pydantic":
        text = toPydantic(schema, "RootModel");
        break;
      case "yup":
        text = toYup(schema, "RootSchema");
        break;
      case "joi":
        text = toJoi(schema, "rootSchema");
        break;
    }
    const ok = await copyTextToClipboard(text);
    if (ok) {
      showToast(
        kind === "json-schema"
          ? "Copied JSON Schema"
          : kind === "ts"
            ? "Copied TypeScript types"
            : kind === "zod"
              ? "Copied Zod schema"
              : kind === "pydantic"
                ? "Copied Pydantic model"
                : kind === "yup"
                  ? "Copied Yup schema"
                  : "Copied Joi schema"
      );
    }
  };

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setParseError("File too large (max 20MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setRawText(text);
      const result = parseJson(text);
      if (result.kind === "success") {
        setParsed(result.value);
        setParseError(null);
      } else {
        setParsed(null);
        setParseError(`${result.error.message} at ${result.error.line}:${result.error.column}`);
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
  };

  const handleSelectTreePath = (segments: (string | number)[]) => {
    const pathStr = toJsonPath(segments);
    setSelectedPath(pathStr);
    setSelectedPathSegments(segments);
  };

  const handleExpandAll = () => {
    const container = document.querySelector('[aria-label="JSON tree view"]');
    if (!container) return;
    const details = container.querySelectorAll("details");
    details.forEach((d) => {
      (d as HTMLDetailsElement).open = true;
    });
  };

  const handleCollapseAll = () => {
    const container = document.querySelector('[aria-label="JSON tree view"]');
    if (!container) return;
    const details = container.querySelectorAll("details");
    details.forEach((d) => {
      (d as HTMLDetailsElement).open = false;
    });
  };

  const currentThemeDef = themes.find((t) => t.id === themeId) ?? themes[1];

  const breadcrumbSegments = selectedPathSegments ?? null;
  const breadcrumbLabels =
    breadcrumbSegments?.map((seg, index) => {
      if (index === 0) return "$";
      if (typeof seg === "number") return `[${seg}]`;
      return String(seg);
    }) ?? [];

  const isCurrentPathPinned = selectedPath ? pinnedPaths.includes(selectedPath) : false;

  return (
    <div className={`${currentThemeDef.rootClass} flex h-full flex-col`}>
      <Toolbar
        theme={themeId}
        availableThemes={themes.map((t) => ({ id: t.id, label: t.label }))}
        selectedPath={selectedPath}
        selectedPathBreadcrumbs={breadcrumbLabels}
        onBreadcrumbClick={(index: number) => {
          if (!breadcrumbSegments) return;
          const targetPath = breadcrumbSegments.slice(0, index + 1);
          treeViewRef.current?.scrollToPath(targetPath);
        }}
        pinnedPaths={pinnedPaths}
        onPinCurrentPath={handlePinCurrentPath}
        onSelectPinnedPath={handleSelectPinnedPath}
        isCurrentPathPinned={isCurrentPathPinned}
        fontScale={fontScale}
        searchQuery={searchQuery}
        searchMatchCount={searchMatchCount}
        searchCurrentIndex={searchCurrentIndex}
        searchInputRef={searchInputRef}
        searchDisabled={searchDisabled}
        onThemeChange={(t) => handlePreferencesChange({ theme: t })}
        onCopy={handleCopy}
        onCopyJsonSchema={() => void handleCopySchema("json-schema")}
        onCopyTypescriptTypes={() => void handleCopySchema("ts")}
        onCopyZodSchema={() => void handleCopySchema("zod")}
        onCopyPydanticModel={() => void handleCopySchema("pydantic")}
        onCopyYupSchema={() => void handleCopySchema("yup")}
        onCopyJoiSchema={() => void handleCopySchema("joi")}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
        onSearchChange={setSearchQuery}
        onSearchNext={handleSearchNext}
        onSearchPrev={handleSearchPrev}
        onIncreaseFont={() => {
          setFontScale((prev) => {
            const next = Math.min(1.6, Math.round((prev + 0.1) * 10) / 10);
            handlePreferencesChange({ fontScale: next });
            return next;
          });
        }}
        onDecreaseFont={() => {
          setFontScale((prev) => {
            const next = Math.max(0.7, Math.round((prev - 0.1) * 10) / 10);
            handlePreferencesChange({ fontScale: next });
            return next;
          });
        }}
      />

      {autoSafeMode && (
        <div
          className="flex items-center justify-between gap-2 border-b border-amber-600/50 bg-amber-950/60 px-4 py-2 text-[11px] text-amber-100"
          aria-label="Safe mode notice"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Large JSON detected</span>
            <span className="text-amber-200/90">
              {isHugeBySize && `Size ${(stats.bytes / (1024 * 1024)).toFixed(1)} MB`}
              {isHugeBySize && isHugeByNodes && " · "}
              {isHugeByNodes && nodeCount !== null && `~${nodeCount.toLocaleString()} nodes`}
            </span>
            {nodeCountTruncated && <span className="text-amber-300/90">(approximate)</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-amber-200/90">Safe mode {safeModeEnabled ? "on" : "off"}</span>
            <button
              type="button"
              className="rounded-md border border-amber-500/70 px-2 py-1 text-[11px] text-amber-50 transition-colors hover:bg-amber-600/50"
              onClick={() => setManualSafeMode(!safeModeEnabled)}
            >
              {safeModeEnabled ? "Turn off" : "Turn on"}
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-hidden" aria-label="Pretty JSON main area">
        <div
          className="flex h-full"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <div className="flex-1 overflow-hidden">
            <TreeView
              ref={treeViewRef}
              value={parsed ?? {}}
              onSelectPath={handleSelectTreePath}
              searchQuery={searchDisabled ? "" : searchQuery}
              fontScale={fontScale}
              safeMode={safeModeEnabled}
            />
          </div>
        </div>
      </main>

      {toast && (
        <div className="pointer-events-none fixed bottom-5 right-5 z-50">
          <div className="pointer-events-auto rounded-lg bg-slate-800 px-4 py-2.5 text-xs font-medium text-slate-100 shadow-xl ring-1 ring-slate-600/50">
            {toast}
          </div>
        </div>
      )}

      <footer
        className="flex items-center justify-between border-t border-slate-800/80 bg-slate-900/80 px-4 py-2 text-xs text-slate-400"
        aria-label="Pretty JSON status bar"
      >
        <span className="tabular-nums">
          Size: {(stats.bytes / 1024).toFixed(1)} KB · Lines: {stats.lines}
        </span>
        <span className="truncate pl-4">
          {parseError ? <span className="text-rose-400">Error: {parseError}</span> : init?.url}
        </span>
      </footer>
    </div>
  );
};

const rootEl = document.getElementById("root");
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <ViewerApp />
    </React.StrictMode>
  );
}

