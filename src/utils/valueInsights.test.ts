import { describe, expect, it } from "bun:test";
import { getInsights, timestampFromNumber } from "./valueInsights";
import { collectColumns, isTabular, toCsv } from "./csv";

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

describe("getInsights", () => {
  it("detects unix timestamps in seconds and ms", () => {
    expect(timestampFromNumber(1700000000)?.unit).toBe("s");
    expect(timestampFromNumber(1700000000000)?.unit).toBe("ms");
    expect(timestampFromNumber(42)).toBeNull();
    expect(getInsights(1700000000)[0].text).toContain("2023-11-14T22:13:20.000Z");
  });

  it("detects ISO dates", () => {
    expect(getInsights("2024-01-02T03:04:05Z")[0].label).toBe("Date");
  });

  it("decodes JWTs", () => {
    const token = `${b64url({ alg: "HS256" })}.${b64url({ sub: "1", exp: 1 })}.signature`;
    const ins = getInsights(token);
    expect(ins.map((i) => i.label)).toEqual(["JWT header", "JWT payload", "JWT expired"]);
    expect(ins[1].json).toEqual({ sub: "1", exp: 1 });
  });

  it("detects embedded JSON, URLs and base64", () => {
    expect(getInsights('{"a":1}')[0].json).toEqual({ a: 1 });
    expect(getInsights("https://x.dev/p?q=1")[1].json).toEqual({ q: "1" });
    expect(getInsights(btoa("hello world, this is base64"))[0].text).toBe("hello world, this is base64");
    expect(getInsights("just text")).toEqual([]);
  });
});

describe("csv", () => {
  const rows = [{ a: 1, b: "x,y" }, { a: 2, c: { d: 1 } }];
  it("collects columns and detects tabular arrays", () => {
    expect(collectColumns(rows)).toEqual(["a", "b", "c"]);
    expect(isTabular(rows)).toBe(true);
    expect(isTabular([1, 2])).toBe(false);
    expect(isTabular({})).toBe(false);
  });
  it("escapes values", () => {
    expect(toCsv(rows, ["a", "b", "c"])).toBe('a,b,c\n1,"x,y",\n2,,"{""d"":1}"');
  });
});
