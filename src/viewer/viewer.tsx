import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import "../styles/tailwind.css";
import { Toolbar } from "./toolbar";
import { TreeView, type TreeViewHandle } from "./treeView";
import { parseJson, getStats } from "../utils/jsonFormatter";
import { loadPreferences, savePreferences, type ThemeId, type UserPreferences } from "../utils/storage";
import { themes } from "./theme";
import { parseJsonPath, toJsonPath } from "../utils/jsonPath";

interface InitPayload {
  text: string;
  url: string;
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
  const [fontScale, setFontScale] = useState<number>(1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const treeViewRef = useRef<TreeViewHandle>(null);
  const searchMatchIndexRef = useRef(0);

  useEffect(() => {
    loadPreferences().then((p) => {
      setPrefs(p);
      setFontScale(p.fontScale ?? 1);
      setPinnedPaths(p.pinnedPaths ?? []);
    });
  }, []);

  useEffect(() => {
    if (!init) return;
    setRawText(init.text);
    const result = parseJson(init.text);
    if (result.kind === "success") {
      setParsed(result.value);
      setParseError(null);
    } else {
      setParsed(null);
      setParseError(`${result.error.message} at ${result.error.line}:${result.error.column}`);
    }
  }, [init]);

  const stats = useMemo(() => getStats(rawText), [rawText]);

  const searchMatchCount = useMemo(() => {
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
  }, [parsed, searchQuery]);

  useEffect(() => {
    searchMatchIndexRef.current = 0;
  }, [searchQuery]);

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
    searchMatchIndexRef.current += 1;
    treeViewRef.current?.scrollToMatchIndex(searchMatchIndexRef.current);
  };

  const handleSearchPrev = () => {
    searchMatchIndexRef.current -= 1;
    treeViewRef.current?.scrollToMatchIndex(searchMatchIndexRef.current);
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
    } catch (error) {
      console.error("Copy failed", error);
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
    try {
      const textarea = document.createElement("textarea");
      textarea.value = pathStr;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    } catch {
      // ignore clipboard errors
    }
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
        onBreadcrumbClick={(index) => {
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
        searchInputRef={searchInputRef}
        onThemeChange={(t) => handlePreferencesChange({ theme: t })}
        onCopy={handleCopy}
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
              searchQuery={searchQuery}
              fontScale={fontScale}
            />
          </div>
        </div>
      </main>

      <footer
        className="flex items-center justify-between border-t border-slate-800 bg-slate-950 px-3 py-1 text-xs text-slate-400"
        aria-label="Pretty JSON status bar"
      >
        <span>
          Size: {(stats.bytes / 1024).toFixed(1)} KB · Lines: {stats.lines}
        </span>
        <span className="truncate">
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

