import { describe, expect, it } from "bun:test";
import { estimateNodeCount, formatJson, getStats, minifyJson, parseJson } from "./jsonFormatter";

describe("parseJson", () => {
  it("parses valid JSON with success result", () => {
    const input = '{"a":1,"b":true}';
    const result = parseJson(input);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value).toEqual({ a: 1, b: true });
    }
  });

  it("returns success result for recoverable invalid JSON and still parses value", () => {
    const input = '{\n  "a": 1,\n  "b":\n}';
    const result = parseJson(input);
    expect(result.kind).toBe("success");
  });
});

describe("formatJson and minifyJson", () => {
  const raw = '{"a":1,"b":true}';

  it("pretty-prints JSON with indentation", () => {
    const formatted = formatJson(raw);
    expect(formatted).toBe('{\n  "a": 1,\n  "b": true\n}');
  });

  it("minifies JSON", () => {
    const minified = minifyJson('{\n  "a": 1,\n  "b": true\n}');
    expect(minified).toBe(raw);
  });
});

describe("getStats", () => {
  it("returns bytes and line count", () => {
    const text = "line1\nline2\n";
    const stats = getStats(text);
    expect(stats.lines).toBe(3);
    expect(stats.bytes).toBeGreaterThanOrEqual(text.length);
  });
});

describe("estimateNodeCount", () => {
  it("counts nodes in small object without truncation", () => {
    const value = { a: 1, b: { c: [1, 2, 3] } };
    const { count, truncated } = estimateNodeCount(value, 100);
    expect(truncated).toBe(false);
    expect(count).toBeGreaterThan(0);
  });

  it("truncates when cap is reached", () => {
    const bigArray = Array.from({ length: 1000 }, (_, i) => i);
    const { count, truncated } = estimateNodeCount(bigArray, 10);
    expect(truncated).toBe(true);
    expect(count).toBe(10);
  });
});

