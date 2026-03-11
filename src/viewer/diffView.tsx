import type { FC } from "react";

export interface Snapshot {
  id: string;
  createdAt: number;
  text: string;
  label: string;
}

export interface DiffViewProps {
  current: string;
  baseSnapshot: Snapshot | null;
  snapshots: Snapshot[];
  onSelectBase: (id: string) => void;
}

export const DiffView: FC<DiffViewProps> = ({ current, baseSnapshot, snapshots, onSelectBase }) => {
  return (
    <div className="flex h-full text-xs text-slate-100">
      <aside className="flex w-56 flex-col border-r border-slate-800 bg-slate-950 p-2">
        <div className="mb-2 font-semibold">History</div>
        <ul className="flex-1 space-y-1 overflow-auto">
          {snapshots.map((snap) => (
            <li key={snap.id}>
              <button
                type="button"
                className={`w-full rounded px-2 py-1 text-left ${
                  baseSnapshot?.id === snap.id ? "bg-slate-700" : "bg-slate-900 hover:bg-slate-800"
                }`}
                onClick={() => onSelectBase(snap.id)}
              >
                <div className="truncate text-[11px]">{snap.label}</div>
                <div className="text-[10px] text-slate-400">
                  {new Date(snap.createdAt).toLocaleTimeString()}
                </div>
              </button>
            </li>
          ))}
          {snapshots.length === 0 && <li className="text-[11px] text-slate-500">No snapshots yet</li>}
        </ul>
      </aside>
      <div className="flex-1 overflow-auto">
        <pre className="h-full w-full overflow-auto bg-slate-950 p-2 text-[11px] leading-snug">
          <code>
            {baseSnapshot
              ? sideBySideLines(baseSnapshot.text, current).map((line, idx) => (
                  <div key={idx} className={line.className}>
                    {line.text}
                  </div>
                ))
              : current}
          </code>
        </pre>
      </div>
    </div>
  );
};

function sideBySideLines(a: string, b: string): { text: string; className: string }[] {
  const aLines = a.split(/\r?\n/);
  const bLines = b.split(/\r?\n/);
  const max = Math.max(aLines.length, bLines.length);
  const rows: { text: string; className: string }[] = [];
  for (let i = 0; i < max; i += 1) {
    const left = aLines[i] ?? "";
    const right = bLines[i] ?? "";
    const changed = left !== right;
    const text = `${pad(left, 60)} | ${right}`;
    rows.push({
      text,
      className: changed ? "bg-slate-900 text-amber-200" : "text-slate-300"
    });
  }
  return rows;
}

function pad(value: string, width: number): string {
  if (value.length >= width) return value.slice(0, width);
  return value + " ".repeat(width - value.length);
}

