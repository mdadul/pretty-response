import { describe, expect, it } from "bun:test";
import {
  buildIntermediateSchema,
  inferJsonKind,
  type IntermediateArraySchema,
  type IntermediateObjectSchema,
  type IntermediateUnionSchema
} from "./jsonTypes";

describe("inferJsonKind", () => {
  it("classifies primitives correctly", () => {
    expect(inferJsonKind("hello")).toBe("string");
    expect(inferJsonKind(42)).toBe("number");
    expect(inferJsonKind(true)).toBe("boolean");
    expect(inferJsonKind(null)).toBe("null");
    expect(inferJsonKind(undefined)).toBe("unknown");
  });

  it("classifies arrays and objects", () => {
    expect(inferJsonKind([1, 2, 3])).toBe("array");
    expect(inferJsonKind({ a: 1 })).toBe("object");
  });
});

describe("buildIntermediateSchema", () => {
  it("builds primitive schemas", () => {
    expect(buildIntermediateSchema("x")).toEqual({ kind: "string" });
    expect(buildIntermediateSchema(1)).toEqual({ kind: "number" });
    expect(buildIntermediateSchema(true)).toEqual({ kind: "boolean" });
    expect(buildIntermediateSchema(null)).toEqual({ kind: "null" });
  });

  it("builds object schema with required properties", () => {
    const schema = buildIntermediateSchema({ a: 1, b: "x" }) as IntermediateObjectSchema;
    expect(schema.kind).toBe("object");
    expect(Object.keys(schema.properties)).toEqual(["a", "b"]);
    expect(schema.required.sort()).toEqual(["a", "b"]);
  });

  it("builds array schema with homogeneous item type", () => {
    const schema = buildIntermediateSchema([1, 2, 3]) as IntermediateArraySchema;
    expect(schema.kind).toBe("array");
    expect(schema.item).toEqual({ kind: "number" });
  });

  it("builds array schema with union item type for heterogeneous arrays", () => {
    const schema = buildIntermediateSchema([1, "two"]) as IntermediateArraySchema;
    expect(schema.kind).toBe("array");
    const item = schema.item as IntermediateUnionSchema;
    expect(item.kind).toBe("union");
    expect(item.variants).toEqual(expect.arrayContaining([{ kind: "number" }, { kind: "string" }]));
  });

  it("returns unknown for unsupported values", () => {
    const sym = Symbol("x");
    expect(buildIntermediateSchema(sym as unknown)).toEqual({ kind: "unknown" });
  });
});

