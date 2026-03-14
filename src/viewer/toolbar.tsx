import type { ThemeId } from "../utils/storage";
import type { FC, KeyboardEvent, RefObject } from "react";
import { useState } from "react";

export interface ToolbarProps {
  theme: ThemeId;
  availableThemes: { id: ThemeId; label: string }[];
  selectedPath: string | null;
  selectedPathBreadcrumbs: string[];
  fontScale: number;
  searchQuery: string;
  searchMatchCount: number | null;
  searchCurrentIndex: number | null;
  searchInputRef: RefObject<HTMLInputElement>;
  searchDisabled?: boolean;
  pinnedPaths: string[];
  isCurrentPathPinned: boolean;
  onThemeChange: (theme: ThemeId) => void;
  onCopy: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onPinCurrentPath: () => void;
  onSelectPinnedPath: (path: string) => void;
  onBreadcrumbClick: (index: number) => void;
  onSearchChange: (query: string) => void;
  onSearchNext: () => void;
  onSearchPrev: () => void;
  onIncreaseFont: () => void;
  onDecreaseFont: () => void;
  onCopyJsonSchema: () => void;
  onCopyTypescriptTypes: () => void;
  onCopyZodSchema: () => void;
  onCopyPydanticModel: () => void;
  onCopyYupSchema: () => void;
  onCopyJoiSchema: () => void;
}

export const Toolbar: FC<ToolbarProps> = ({
  theme,
  availableThemes,
  selectedPath,
  selectedPathBreadcrumbs,
  fontScale,
  searchQuery,
  searchMatchCount,
  searchCurrentIndex,
  searchInputRef,
  searchDisabled = false,
  pinnedPaths,
  isCurrentPathPinned,
  onThemeChange,
  onCopy,
  onExpandAll,
  onCollapseAll,
  onPinCurrentPath,
  onSelectPinnedPath,
  onBreadcrumbClick,
  onSearchChange,
  onSearchNext,
  onSearchPrev,
  onIncreaseFont,
  onDecreaseFont,
  onCopyJsonSchema,
  onCopyTypescriptTypes,
  onCopyZodSchema,
  onCopyPydanticModel,
  onCopyYupSchema,
  onCopyJoiSchema
}) => {
  const [schemaMenuOpen, setSchemaMenuOpen] = useState(false);
  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.currentTarget.blur();
      onSearchChange("");
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) onSearchPrev();
      else onSearchNext();
    }
  };

  return (
    <header
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-700/70 bg-slate-900/98 px-4 py-2.5 text-sm shadow-sm backdrop-blur-sm"
      aria-label="Pretty JSON toolbar"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="shrink-0 text-base font-semibold tracking-tight text-slate-100">Pretty JSON</span>
        <span className="h-5 w-px shrink-0 bg-slate-600/80" aria-hidden />
        <div className="flex min-w-0 items-center gap-2">
          <nav
            className="flex min-w-0 items-center gap-1.5 text-xs text-slate-400"
            aria-label="Selected JSON path breadcrumbs"
          >
            {selectedPathBreadcrumbs.length > 0 ? (
              <>
                {selectedPathBreadcrumbs.map((label, index) => (
                  <div key={`${label}-${index}`} className="flex items-center gap-1 min-w-0">
                    {index > 0 && (
                      <span className="text-slate-600" aria-hidden>
                        ›
                      </span>
                    )}
                    <button
                      type="button"
                      className="max-w-[9rem] truncate rounded-md px-1.5 py-0.5 text-[11px] text-slate-300 transition-colors hover:bg-slate-800/80 hover:text-slate-50"
                      onClick={() => onBreadcrumbClick(index)}
                      title={selectedPath ?? undefined}
                    >
                      {label}
                    </button>
                  </div>
                ))}
              </>
            ) : (
              <span className="min-w-0 truncate font-mono text-xs text-slate-500">
                Click a node to copy path
              </span>
            )}
          </nav>
          <button
            type="button"
            className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] transition-colors ${
              selectedPath
                ? isCurrentPathPinned
                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-600 text-slate-300 hover:border-slate-500 hover:bg-slate-800/80 hover:text-slate-50"
                : "cursor-not-allowed border-slate-700 text-slate-600"
            }`}
            disabled={!selectedPath}
            onClick={onPinCurrentPath}
            title={isCurrentPathPinned ? "Already pinned" : "Pin current path"}
          >
            Pin
          </button>
          {pinnedPaths.length > 0 && (
            <select
              className="hidden sm:block max-w-[12rem] shrink-0 truncate rounded-md border border-slate-700/70 bg-slate-800/50 px-1.5 py-0.5 text-[11px] text-slate-300 transition-colors hover:border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
              onChange={(e) => {
                const value = e.target.value;
                if (!value) return;
                onSelectPinnedPath(value);
                // Reset to placeholder so selection can be re-used
                e.currentTarget.selectedIndex = 0;
              }}
              defaultValue=""
              aria-label="Pinned JSON paths"
            >
              <option value="" disabled>
                Pins
              </option>
              {pinnedPaths.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2" aria-label="Viewer actions">
        <div className="flex items-center rounded-lg border border-slate-700/60 bg-slate-800/50 shadow-inner">
          <button
            type="button"
            className="rounded-l-lg border-r border-slate-700/60 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700/70 hover:text-slate-100"
            onClick={onCopy}
            title="Copy JSON"
          >
            Copy
          </button>
            <div className="relative">
              <button
                type="button"
                className="flex cursor-pointer items-center gap-1 border-r border-slate-700/60 px-2 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-700/70 hover:text-slate-100"
                aria-label="Copy schema"
                onClick={() => setSchemaMenuOpen((open) => !open)}
              >
                Schema
                <span className="text-slate-500" aria-hidden>▾</span>
              </button>
              {schemaMenuOpen && (
                <div className="absolute right-0 z-20 mt-1.5 w-52 rounded-lg border border-slate-700/80 bg-slate-900/98 py-1 text-xs text-slate-100 shadow-xl ring-1 ring-slate-700/50">
                  <button
                    type="button"
                    className="flex w-full items-center px-3 py-2 text-left transition-colors hover:bg-slate-800/90"
                    onClick={() => {
                      onCopyJsonSchema();
                      setSchemaMenuOpen(false);
                    }}
                  >
                    JSON Schema (Ajv)
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center px-3 py-2 text-left transition-colors hover:bg-slate-800/90"
                    onClick={() => {
                      onCopyTypescriptTypes();
                      setSchemaMenuOpen(false);
                    }}
                  >
                    TypeScript types
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center px-3 py-2 text-left transition-colors hover:bg-slate-800/90"
                    onClick={() => {
                      onCopyZodSchema();
                      setSchemaMenuOpen(false);
                    }}
                  >
                    Zod schema
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center px-3 py-2 text-left transition-colors hover:bg-slate-800/90"
                    onClick={() => {
                      onCopyPydanticModel();
                      setSchemaMenuOpen(false);
                    }}
                  >
                    Pydantic model
                  </button>
                  <div className="my-1 h-px bg-slate-700/70" />
                  <button
                    type="button"
                    className="flex w-full items-center px-3 py-2 text-left transition-colors hover:bg-slate-800/90"
                    onClick={() => {
                      onCopyYupSchema();
                      setSchemaMenuOpen(false);
                    }}
                  >
                    Yup schema
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center px-3 py-2 text-left transition-colors hover:bg-slate-800/90"
                    onClick={() => {
                      onCopyJoiSchema();
                      setSchemaMenuOpen(false);
                    }}
                  >
                    Joi schema
                  </button>
                </div>
              )}
            </div>
          <button
            type="button"
            className="border-r border-slate-700/60 px-2 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-700/70 hover:text-slate-200"
            onClick={onExpandAll}
            title="Expand all nodes"
          >
            Expand
          </button>
          <button
            type="button"
            className="rounded-r-lg px-2 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-700/70 hover:text-slate-200"
            onClick={onCollapseAll}
            title="Collapse all nodes"
          >
            Collapse
          </button>
        </div>

        <div className="flex items-center overflow-hidden rounded-lg border border-slate-700/60 bg-slate-800/50 shadow-inner">
          <div className="relative flex shrink-0">
            <input
              ref={searchInputRef}
              type="text"
              role="searchbox"
              placeholder="Search (Ctrl+F)"
              value={searchQuery}
              className="w-40 rounded-l-lg border-0 bg-transparent py-1.5 pl-2.5 pr-7 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-0"
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              spellCheck={false}
              autoComplete="off"
              disabled={searchDisabled}
              aria-label="Search JSON"
            />
            {searchQuery && (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-600/50 hover:text-slate-200"
                onClick={() => onSearchChange("")}
                aria-label="Clear search"
                title="Clear (Esc)"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <path d="M2 2l8 8M10 2L2 10" />
                </svg>
              </button>
            )}
          </div>
          {searchQuery.trim() && searchMatchCount !== null && (
            <>
              <span className="h-4 w-px shrink-0 bg-slate-600/80" aria-hidden />
              {searchMatchCount > 0 ? (
                <div className="flex items-center gap-0.5 pr-2">
                  <button
                    type="button"
                    className="rounded px-0.5 py-0.5 text-slate-500 transition-colors hover:bg-slate-600/50 hover:text-slate-200"
                    onClick={onSearchPrev}
                    aria-label="Previous match"
                    title="Previous (Shift+Enter)"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="rounded px-0.5 py-0.5 text-slate-500 transition-colors hover:bg-slate-600/50 hover:text-slate-200"
                    onClick={onSearchNext}
                    aria-label="Next match"
                    title="Next (Enter)"
                  >
                    ↓
                  </button>
                  <span
                    className="ml-1 min-w-[3.5ch] text-right text-[10px] tabular-nums text-slate-400"
                    aria-label={
                      searchCurrentIndex !== null
                        ? `Match ${searchCurrentIndex + 1} of ${searchMatchCount}`
                        : `${searchMatchCount} matches`
                    }
                  >
                    {searchCurrentIndex !== null ? `${searchCurrentIndex + 1}/${searchMatchCount}` : searchMatchCount}
                  </span>
                </div>
              ) : (
                <span className="pr-2 text-[10px] tabular-nums text-amber-500/90">No matches</span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center overflow-hidden rounded-lg border border-slate-700/60 bg-slate-800/50 shadow-inner">
          <button
            type="button"
            className="rounded-l-lg border-r border-slate-700/60 px-1.5 py-1 text-[10px] text-slate-400 transition-colors hover:bg-slate-700/70 hover:text-slate-100"
            onClick={onDecreaseFont}
            aria-label="Decrease font size"
            title="Smaller"
          >
            A−
          </button>
          <button
            type="button"
            className="rounded-r-lg px-1.5 py-1 text-[10px] text-slate-400 transition-colors hover:bg-slate-700/70 hover:text-slate-100"
            onClick={onIncreaseFont}
            aria-label="Increase font size"
            title="Larger"
          >
            A+
          </button>
        </div>

        <label className="flex items-center gap-1.5" aria-label="Theme">
          <select
            className="rounded-lg border border-slate-700/60 bg-slate-800/50 px-2 py-1.5 text-xs text-slate-200 shadow-inner transition-colors hover:border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
            value={theme}
            onChange={(e) => onThemeChange(e.target.value as ThemeId)}
          >
            {availableThemes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
};

