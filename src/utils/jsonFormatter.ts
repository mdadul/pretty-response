import * as jsonc from "jsonc-parser";

export interface JsonParseSuccess {
  kind: "success";
  value: unknown;
  text: string;
}

export interface JsonParseError {
  kind: "error";
  error: {
    message: string;
    line: number;
    column: number;
    offset: number;
    length: number;
  };
  text: string;
}

export type JsonParseResult = JsonParseSuccess | JsonParseError;

export function parseJson(text: string): JsonParseResult {
  const errors: jsonc.ParseError[] = [];
  const node = jsonc.parseTree(text, errors, { allowTrailingComma: true });

  if (!node && errors.length > 0) {
    const err = errors[0];
    const errorOffset = err.offset;
    const before = text.slice(0, errorOffset);
    const lines = before.split(/\r?\n/);
    const line = lines.length;
    const lastLine = lines[lines.length - 1] ?? "";
    const column = lastLine.length + 1;
    return {
      kind: "error",
      error: {
        message: jsonc.printParseErrorCode(err.error),
        line,
        column,
        offset: errorOffset,
        length: err.length
      },
      text
    };
  }

  const value = node ? jsonc.getNodeValue(node) : jsonc.parse(text);
  return { kind: "success", value, text };
}

export function formatJson(text: string): string {
  const result = parseJson(text);
  if (result.kind === "error") {
    throw new Error(result.error.message);
  }
  return JSON.stringify(result.value, null, 2);
}

export function minifyJson(text: string): string {
  const result = parseJson(text);
  if (result.kind === "error") {
    throw new Error(result.error.message);
  }
  return JSON.stringify(result.value);
}

export function getStats(text: string): { bytes: number; lines: number } {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text).byteLength;
  const lines = text.split(/\r?\n/).length;
  return { bytes, lines };
}

export function estimateNodeCount(
  value: unknown,
  cap = 200000
): { count: number; truncated: boolean } {
  let count = 0;
  const stack: unknown[] = [value];

  while (stack.length > 0) {
    const current = stack.pop();
    count += 1;
    if (count >= cap) {
      return { count: cap, truncated: true };
    }

    if (current !== null && typeof current === "object") {
      if (Array.isArray(current)) {
        for (let i = 0; i < current.length; i += 1) {
          stack.push(current[i]);
        }
      } else {
        for (const key of Object.keys(current as Record<string, unknown>)) {
          stack.push((current as Record<string, unknown>)[key]);
        }
      }
    }
  }

  return { count, truncated: false };
}


