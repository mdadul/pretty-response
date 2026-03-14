import { describe, expect, it } from "bun:test";
import { buildIntermediateSchema } from "./jsonTypes";
import {
  toJsonSchema,
  toTypescript,
  toZod,
  toYup,
  toJoi,
  toPydantic
} from "./schemaGenerator";

const sampleObject = {
  id: 123,
  name: "Alice",
  active: true,
  tags: ["a", "b"],
  meta: {
    score: 10
  }
};

describe("schema generators", () => {
  const schema = buildIntermediateSchema(sampleObject);

  it("generates valid JSON Schema shape", () => {
    const json = toJsonSchema(schema);
    const parsed = JSON.parse(json);

    expect(parsed.type).toBe("object");
    expect(parsed.properties.id.type).toBe("number");
    expect(parsed.properties.name.type).toBe("string");
    expect(parsed.properties.active.type).toBe("boolean");
    expect(parsed.properties.tags.type).toBe("array");
    expect(parsed.required).toEqual(expect.arrayContaining(["id", "name", "active", "tags", "meta"]));
  });

  it("generates TypeScript types", () => {
    const ts = toTypescript(schema, "Root");
    expect(ts).toContain("export type Root");
    expect(ts).toContain('"id": number;');
    expect(ts).toContain('"name": string;');
    expect(ts).toContain('"active": boolean;');
  });

  it("generates Zod schema", () => {
    const zod = toZod(schema, "RootSchema");
    expect(zod).toContain('import { z } from "zod";');
    expect(zod).toContain('export const RootSchema');
    expect(zod).toContain('z.object({');
    expect(zod).toContain('"id": z.number()');
  });

  it("generates Yup schema", () => {
    const yup = toYup(schema, "RootSchema");
    expect(yup).toContain('import * as yup from "yup";');
    expect(yup).toContain("export const RootSchema");
    expect(yup).toContain("yup.object({");
    expect(yup).toContain('"id": yup.number().required()');
  });

  it("generates Joi schema", () => {
    const joi = toJoi(schema, "rootSchema");
    expect(joi).toContain('import Joi from "joi";');
    expect(joi).toContain("export const rootSchema");
    expect(joi).toContain("Joi.object({");
    expect(joi).toContain('"id": Joi.number().required()');
  });

  it("generates Pydantic model", () => {
    const py = toPydantic(schema, "RootModel");
    expect(py).toContain("from pydantic import BaseModel");
    expect(py).toContain("class RootModel(BaseModel):");
    expect(py).toContain("id: float");
    expect(py).toContain("name: str");
  });
});

