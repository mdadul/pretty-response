import { describe, expect, it } from "bun:test";
import { QueryError, normalizeQuery, runQuery } from "./jsonQuery";

const doc = {
  store: {
    book: [
      { title: "A", price: 8, tags: ["x"], author: "Nigel" },
      { title: "B", price: 12, author: "Evelyn" },
      { title: "C", price: 22, tags: [], author: "Herman" }
    ],
    bicycle: { color: "red", price: 19 }
  },
  "weird key": 1
};

const values = (q: string) => runQuery(doc, q).matches.map((m) => m.value);
const paths = (q: string) => runQuery(doc, q).matches.map((m) => m.path);

describe("runQuery", () => {
  it("selects children and indexes", () => {
    expect(values("$.store.book[0].title")).toEqual(["A"]);
    expect(values("$.store.book[-1].title")).toEqual(["C"]);
    expect(values('$["weird key"]')).toEqual([1]);
    expect(paths("$.store.book[1]")).toEqual([["$", "store", "book", 1]]);
  });

  it("supports wildcards, unions and slices", () => {
    expect(values("$.store.book[*].title")).toEqual(["A", "B", "C"]);
    expect(values("$.store.book[0,2].title")).toEqual(["A", "C"]);
    expect(values("$.store.book[1:].title")).toEqual(["B", "C"]);
    expect(values("$.store.book[::-1].title")).toEqual(["C", "B", "A"]);
    expect(values("$.store.bicycle.*")).toEqual(["red", 19]);
  });

  it("supports recursive descent", () => {
    expect(values("$..price")).toEqual([8, 12, 22, 19]);
    expect(values("$..book[0].author")).toEqual(["Nigel"]);
  });

  it("supports filters", () => {
    expect(values("$.store.book[?(@.price > 10)].title")).toEqual(["B", "C"]);
    expect(values("$.store.book[?(@.tags)].title")).toEqual(["A", "C"]);
    expect(values("$.store.book[?(!@.tags)].title")).toEqual(["B"]);
    expect(values("$.store.book[?(@.price < 20 && @.author == 'Evelyn')].title")).toEqual(["B"]);
    expect(values("$.store.book[?(@.author =~ /^h/i || @.price == 8)].title")).toEqual(["A", "C"]);
    expect(values("$..[?(@.color == 'red')].price")).toEqual([19]);
  });

  it("accepts jq-style shorthand", () => {
    expect(normalizeQuery(".store.book[].title")).toBe("$.store.book[*].title");
    expect(values(".store.book[].title")).toEqual(["A", "B", "C"]);
    expect(values(".")).toEqual([doc]);
  });

  it("returns empty for missing members and throws on bad syntax", () => {
    expect(values("$.nope.deeper")).toEqual([]);
    expect(() => runQuery(doc, "$.store[")).toThrow(QueryError);
    expect(() => runQuery(doc, "store")).toThrow(QueryError);
    expect(() => runQuery(doc, "$.store.book[?(@.price >)]")).toThrow(QueryError);
  });

  it("truncates large result sets", () => {
    const big = Array.from({ length: 50 }, (_, i) => i);
    const r = runQuery(big, "$[*]", 10);
    expect(r.matches).toHaveLength(10);
    expect(r.truncated).toBe(true);
  });
});
