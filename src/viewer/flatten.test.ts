import { describe, expect, it } from "bun:test";
import { allContainerKeys, defaultExpanded, flattenTree, pathKey } from "./flatten";

describe("flattenTree", () => {
  const doc = { b: [1, 2], a: { c: true } };

  it("renders only the root when collapsed", () => {
    const rows = flattenTree(doc, new Set(), false);
    expect(rows.map((r) => r.type)).toEqual(["collapsed"]);
  });

  it("emits open, leaf and close rows for expanded containers", () => {
    const rows = flattenTree(doc, defaultExpanded(doc), false);
    expect(rows.map((r) => `${r.type}:${r.name ?? "$"}`)).toEqual([
      "open:$",
      "open:b",
      "leaf:0",
      "leaf:1",
      "close:b",
      "open:a",
      "leaf:c",
      "close:a",
      "close:$"
    ]);
    expect(rows[3].isLast).toBe(true);
    expect(rows[2].isLast).toBe(false);
  });

  it("sorts object keys when requested", () => {
    const rows = flattenTree(doc, new Set([pathKey(["$"])]), true);
    expect(rows.slice(1, 3).map((r) => r.name)).toEqual(["a", "b"]);
  });

  it("collects all container keys", () => {
    expect(allContainerKeys(doc).size).toBe(3);
  });
});
