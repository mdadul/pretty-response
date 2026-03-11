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
    const pos = jsonc.getPosition(text, err.offset);
    return {
      kind: "error",
      error: {
        message: jsonc.printParseErrorCode(err.error),
        line: pos.line + 1,
        column: pos.character + 1,
        offset: err.offset,
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

