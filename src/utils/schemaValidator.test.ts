import { describe, expect, it } from "bun:test";
import { validateAgainstSchema } from "./schemaValidator";

describe("validateAgainstSchema", () => {
  it("always returns valid=true in extension context", () => {
    const result = validateAgainstSchema({ foo: "bar" }, { type: "object" });
    expect(result.valid).toBe(true);
    expect(result.errors).toBeNull();
  });
});

