function cell(value: unknown): string {
  if (value === undefined) return "";
  const s = value !== null && typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Union of keys across rows (in first-seen order), sampling up to `sample` rows. */
export function collectColumns(rows: unknown[], sample = 2000): string[] {
  const seen = new Set<string>();
  for (const row of rows.slice(0, sample)) {
    if (row !== null && typeof row === "object" && !Array.isArray(row)) {
      for (const k of Object.keys(row)) seen.add(k);
    }
  }
  return [...seen];
}

export function isTabular(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const sample = value.slice(0, 200);
  const objects = sample.filter((v) => v !== null && typeof v === "object" && !Array.isArray(v)).length;
  return objects / sample.length >= 0.5;
}

export function toCsv(rows: unknown[], columns: string[]): string {
  const lines = [columns.map(cell).join(",")];
  for (const row of rows) {
    const obj = row !== null && typeof row === "object" && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
    lines.push(columns.map((c) => cell(obj[c])).join(","));
  }
  return lines.join("\n");
}
