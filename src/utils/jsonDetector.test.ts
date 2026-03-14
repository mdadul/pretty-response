import { describe, expect, it } from "bun:test";
import { detectJsonFromHeaders, detectJsonFromText } from "./jsonDetector";

describe("detectJsonFromHeaders", () => {
  it("detects JSON for application/json", () => {
    const res = detectJsonFromHeaders("application/json; charset=utf-8");
    expect(res.isJson).toBe(true);
    expect(res.reason).toBe("content-type");
  });

  it("detects JSON for text/json", () => {
    const res = detectJsonFromHeaders("text/json");
    expect(res.isJson).toBe(true);
  });

  it("returns false for non-JSON content type", () => {
    const res = detectJsonFromHeaders("text/html");
    expect(res.isJson).toBe(false);
  });

  it("returns false for null header", () => {
    const res = detectJsonFromHeaders(null);
    expect(res.isJson).toBe(false);
  });
});

describe("detectJsonFromText", () => {
  it("returns false for empty text", () => {
    const res = detectJsonFromText("");
    expect(res.isJson).toBe(false);
  });

  it("returns false for non-JSON-looking text", () => {
    const res = detectJsonFromText("hello world");
    expect(res.isJson).toBe(false);
  });

  it("detects valid JSON object", () => {
    const res = detectJsonFromText('{"a":1}');
    expect(res.isJson).toBe(true);
    expect(res.reason).toBe("heuristic-body");
  });

  it("detects valid JSON array", () => {
    const res = detectJsonFromText('[1,2,3]');
    expect(res.isJson).toBe(true);
  });

  it("returns false when JSON.parse throws", () => {
    const res = detectJsonFromText('{"a": }');
    expect(res.isJson).toBe(false);
  });
});

