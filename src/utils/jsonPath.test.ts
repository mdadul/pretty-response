import { describe, expect, it } from "bun:test";
import { parseJsonPath, toJsonPath } from "./jsonPath";

describe("toJsonPath and parseJsonPath", () => {
  it("round-trips simple object path", () => {
    const segments: (string | number)[] = ["$", "user", "name"];
    const path = toJsonPath(segments);
    expect(path).toBe("$.user.name");
    const parsed = parseJsonPath(path);
    expect(parsed).toEqual(segments);
  });

  it("round-trips array index path", () => {
    const segments: (string | number)[] = ["$", "items", 0, "id"];
    const path = toJsonPath(segments);
    expect(path).toBe('$.items[0].id');
    const parsed = parseJsonPath(path);
    expect(parsed).toEqual(segments);
  });

  it("handles keys requiring quoting", () => {
    const segments: (string | number)[] = ["$", 'weird key', "inner.key"];
    const path = toJsonPath(segments);
    expect(path).toBe('$["weird key"]["inner.key"]');
    const parsed = parseJsonPath(path);
    expect(parsed).toEqual(segments);
  });

  it("returns null for invalid path strings", () => {
    expect(parseJsonPath("")).toBeNull();
    expect(parseJsonPath("user.name")).toBeNull();
    expect(parseJsonPath("$.foo[")).toBeNull();
  });
});

