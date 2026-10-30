import type { FC, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { toJqPath, toJsAccessor, toJsonPath, toPythonAccessor } from "../utils/jsonPath";
import { inferJsonKind } from "../utils/jsonTypes";
import { getInsights } from "../utils/valueInsights";
import { copyTextToClipboard } from "../utils/clipboard";
import { isContainer, sizeOf, type Segment } from "./flatten";

const MAX_VALUE_CHARS = 20000;
const MAX_SIZE_MEASURE = 5_000_000;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function depthOf(value: unknown, limit = 64): number {
  if (!isContainer(value)) return 0;
  let max = 0;
  const stack: [unknown, number][] = [[value, 1]];
  let visited = 0;
  while (stack.length && visited < 200000) {
    const [v, d] = stack.pop()!;
    visited++;
    if (d > max) max = d;
    if (d >= limit) continue;
    if (isContainer(v)) for (const c of Object.values(v)) if (isContainer(c)) stack.push([c, d + 1]);
  }
  return max;
}

const Section: FC<{ title: string; children: ReactNode; action?: ReactNode }> = ({ title, children, action }) => (
  <section className="pj-border border-b px-3 py-2.5">
    <div className="mb-1.5 flex items-center justify-between">
      <h3 className="pj-subtle text-[10px] font-semibold uppercase tracking-wider">{title}</h3>
      {action}
    </div>
    {children}
  </section>
);

const CopyRow: FC<{ label: string; text: string; onCopy: (t: string, m: string) => void }> = ({ label, text, onCopy }) => (
  <button
    type="button"
    className="pj-copy-row group flex w-full items-center gap-2 rounded px-1.5 py-1 text-left"
    onClick={() => onCopy(text, `Copied ${label}`)}
    title={`Copy ${label}`}
  >
    <span className="pj-subtle w-10 shrink-0 text-[10px]">{label}</span>
    <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{text}</span>
    <span className="pj-subtle text-[10px] opacity-0 group-hover:opacity-100">copy</span>
  </button>
);

const Stat: FC<{ label: string; value: ReactNode }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-2 py-0.5">
    <span className="pj-subtle">{label}</span>
    <span className="font-mono tabular-nums">{value}</span>
  </div>
);

export interface InspectorProps {
  path: Segment[] | null;
  value: unknown;
  docSummary: { kind: string; size: string | null; bytes: number; nodes: string | null };
  isPinned: boolean;
  onTogglePin: () => void;
  onCopy: (text: string, msg: string) => void;
  onClose: () => void;
  /** Shown when the selection lives inside query results. */
  onJumpToSource?: () => void;
}

export const Inspector: FC<InspectorProps> = ({ path, value, docSummary, isPinned, onTogglePin, onCopy, onClose, onJumpToSource }) => {
  const [expandedValue, setExpandedValue] = useState(false);
  const has = path !== null;
  useEffect(() => setExpandedValue(false), [value]);
  const kind = has ? inferJsonKind(value) : null;

  const valueText = useMemo(() => {
    if (!has) return "";
    try {
      return typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "undefined";
    } catch {
      return String(value);
    }
  }, [has, value]);

  const bytes = useMemo(() => {
    if (!has || valueText.length > MAX_SIZE_MEASURE) return null;
    return new TextEncoder().encode(typeof value === "string" ? JSON.stringify(value) : valueText).byteLength;
  }, [has, value, valueText]);

  const depth = useMemo(() => (has ? depthOf(value) : 0), [has, value]);
  const insights = useMemo(() => (has ? getInsights(value) : []), [has, value]);
  const shownValue = expandedValue ? valueText : valueText.slice(0, MAX_VALUE_CHARS);

  return (
    <aside className="pj-bar pj-border flex h-full w-[320px] shrink-0 flex-col border-l text-xs" aria-label="Inspector">
      <div className="pj-border flex h-9 shrink-0 items-center gap-2 border-b pl-3 pr-1">
        <span className="font-semibold">Inspector</span>
        {kind && <span className={`pj-chip pj-type-${kind}`}>{kind}</span>}
        <span className="ml-auto" />
        {has && (
          <button type="button" className="pj-btn !h-6 !w-6 !justify-center !px-0" aria-pressed={isPinned} onClick={onTogglePin} title={isPinned ? "Unpin" : "Pin path"}>
            {isPinned ? "★" : "☆"}
          </button>
        )}
        <button type="button" className="pj-btn !h-6 !w-6 !justify-center !px-0" onClick={onClose} title="Close inspector (I)" aria-label="Close inspector">
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {!has ? (
          <>
            <Section title="Document">
              <Stat label="Type" value={docSummary.kind} />
              {docSummary.size && <Stat label="Size" value={docSummary.size} />}
              {docSummary.nodes && <Stat label="Nodes" value={docSummary.nodes} />}
              <Stat label="Bytes" value={formatBytes(docSummary.bytes)} />
            </Section>
            <div className="pj-subtle px-3 py-4 leading-relaxed">
              Select a node to see its paths, size, and decoded values (dates, JWTs, base64, embedded JSON).
              <div className="mt-3 space-y-1">
                <div>
                  <span className="pj-kbd">↑</span> <span className="pj-kbd">↓</span> move · <span className="pj-kbd">←</span>{" "}
                  <span className="pj-kbd">→</span> fold
                </div>
                <div>
                  <span className="pj-kbd">Alt</span> + click expands a whole subtree
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {onJumpToSource && (
              <div className="px-3 pt-2.5">
                <button type="button" className="pj-btn pj-btn-primary w-full !justify-center" onClick={onJumpToSource}>
                  Show in document
                </button>
              </div>
            )}
            <Section title="Path">
              <div className="-mx-1.5">
                <CopyRow label="Path" text={toJsonPath(path)} onCopy={onCopy} />
                <CopyRow label="JS" text={toJsAccessor(path)} onCopy={onCopy} />
                <CopyRow label="Python" text={toPythonAccessor(path)} onCopy={onCopy} />
                <CopyRow label="jq" text={toJqPath(path)} onCopy={onCopy} />
              </div>
            </Section>

            <Section title="Details">
              <Stat label="Type" value={kind} />
              {isContainer(value) && <Stat label={Array.isArray(value) ? "Items" : "Keys"} value={sizeOf(value).toLocaleString()} />}
              {isContainer(value) && <Stat label="Depth" value={depth} />}
              {typeof value === "string" && <Stat label="Length" value={value.length.toLocaleString()} />}
              {bytes !== null && <Stat label="Size" value={formatBytes(bytes)} />}
            </Section>

            {insights.length > 0 && (
              <Section title="Decoded">
                <div className="space-y-2">
                  {insights.map((ins, i) => (
                    <div key={i}>
                      <div className="mb-0.5 flex items-center justify-between">
                        <span className="pj-muted font-medium">{ins.label}</span>
                        <button
                          type="button"
                          className="pj-subtle text-[10px] hover:underline"
                          onClick={() => onCopy(ins.json !== undefined ? JSON.stringify(ins.json, null, 2) : ins.text, `Copied ${ins.label}`)}
                        >
                          copy
                        </button>
                      </div>
                      {ins.json !== undefined ? (
                        <pre className="pj-code max-h-48 overflow-auto">{JSON.stringify(ins.json, null, 2)}</pre>
                      ) : (
                        <div className="break-words font-mono text-[11px]">{ins.text}</div>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <Section
              title="Value"
              action={
                <button type="button" className="pj-subtle text-[10px] hover:underline" onClick={() => onCopy(valueText, "Copied value")}>
                  copy
                </button>
              }
            >
              <pre className="pj-code max-h-[50vh] overflow-auto whitespace-pre-wrap break-all">{shownValue}</pre>
              {valueText.length > MAX_VALUE_CHARS && !expandedValue && (
                <button type="button" className="pj-btn mt-1" onClick={() => setExpandedValue(true)}>
                  Show all ({formatBytes(valueText.length)})
                </button>
              )}
            </Section>
          </>
        )}
      </div>
    </aside>
  );
};
