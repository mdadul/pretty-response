/**
 * Detects useful interpretations of a JSON value (timestamps, JWTs, base64,
 * embedded JSON, URLs, ...) for the inspector panel.
 */

export interface Insight {
  label: string;
  text: string;
  /** Pretty-printed structured content (decoded JWT, embedded JSON). */
  json?: unknown;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})+(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const JWT = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*$/;

const SEC_MIN = 946684800; // 2000-01-01
const SEC_MAX = 4102444800; // 2100-01-01

export function relativeTime(date: Date, now: Date = new Date()): string {
  const diffSec = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1]
  ];
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, secs] of units) {
    if (abs >= secs || unit === "second") return rtf.format(Math.round(diffSec / secs), unit);
  }
  return "";
}

function dateInsight(label: string, date: Date): Insight {
  return { label, text: `${date.toISOString()} · ${date.toLocaleString()} · ${relativeTime(date)}` };
}

function decodeBase64Url(part: string): string | null {
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function isMostlyPrintable(s: string): boolean {
  if (!s.length) return false;
  let printable = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127)) printable++;
  }
  return printable / s.length > 0.95;
}

function tryParseJson(s: string): unknown | undefined {
  const t = s.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

export function timestampFromNumber(n: number): { date: Date; unit: "s" | "ms" } | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= SEC_MIN && n <= SEC_MAX) return { date: new Date(n * 1000), unit: "s" };
  if (n >= SEC_MIN * 1000 && n <= SEC_MAX * 1000) return { date: new Date(n), unit: "ms" };
  return null;
}

export function getInsights(value: unknown): Insight[] {
  const out: Insight[] = [];

  if (typeof value === "number") {
    const ts = timestampFromNumber(value);
    if (ts) out.push(dateInsight(ts.unit === "s" ? "Unix time (s)" : "Unix time (ms)", ts.date));
    return out;
  }

  if (typeof value !== "string" || value.length === 0) return out;
  const s = value.trim();

  if (ISO_DATE.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) out.push(dateInsight("Date", d));
  } else if (/^\d{10}(\d{3})?$/.test(s)) {
    const ts = timestampFromNumber(Number(s));
    if (ts) out.push(dateInsight(ts.unit === "s" ? "Unix time (s)" : "Unix time (ms)", ts.date));
  }

  if (JWT.test(s)) {
    const [h, p] = s.split(".");
    const header = decodeBase64Url(h);
    const payload = decodeBase64Url(p);
    const headerJson = header ? tryParseJson(header) : undefined;
    const payloadJson = payload ? tryParseJson(payload) : undefined;
    if (headerJson && payloadJson) {
      out.push({ label: "JWT header", text: "", json: headerJson });
      out.push({ label: "JWT payload", text: "", json: payloadJson });
      const exp = (payloadJson as Record<string, unknown>).exp;
      if (typeof exp === "number") {
        const d = new Date(exp * 1000);
        out.push({ label: d.getTime() < Date.now() ? "JWT expired" : "JWT expires", text: `${d.toISOString()} · ${relativeTime(d)}` });
      }
      return out;
    }
  }

  const embedded = tryParseJson(s);
  if (embedded !== undefined) {
    out.push({ label: "Embedded JSON", text: "", json: embedded });
    return out;
  }

  try {
    const url = new URL(s);
    if (url.protocol === "http:" || url.protocol === "https:") {
      out.push({ label: "URL", text: `${url.host}${url.pathname}` });
      const params = [...url.searchParams.entries()];
      if (params.length) out.push({ label: "Query params", text: "", json: Object.fromEntries(params) });
      return out;
    }
  } catch {
    // not a URL
  }

  if (UUID.test(s)) out.push({ label: "UUID", text: `version ${s[14]}` });
  else if (EMAIL.test(s)) out.push({ label: "Email", text: s });
  else if (HEX_COLOR.test(s)) out.push({ label: "Color", text: s });
  else if (s.length >= 16 && BASE64.test(s)) {
    const decoded = decodeBase64Url(s);
    if (decoded && isMostlyPrintable(decoded)) {
      const json = tryParseJson(decoded);
      out.push(json !== undefined ? { label: "Base64 → JSON", text: "", json } : { label: "Base64 decoded", text: decoded.slice(0, 2000) });
    }
  }

  return out;
}
