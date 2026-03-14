import type {
  IntermediateArraySchema,
  IntermediateObjectSchema,
  IntermediatePrimitiveSchema,
  IntermediateSchema,
  IntermediateUnionSchema
} from "./jsonTypes";

function indent(level: number): string {
  return "  ".repeat(level);
}

export function toJsonSchema(root: IntermediateSchema): string {
  const schema = buildJsonSchema(root);
  return JSON.stringify(
    {
      $schema: "http://json-schema.org/draft-07/schema#",
      ...schema
    },
    null,
    2
  );
}

function buildJsonSchema(schema: IntermediateSchema): Record<string, unknown> {
  switch (schema.kind) {
    case "string":
    case "number":
    case "boolean":
      return { type: schema.kind };
    case "null":
      return { type: "null" };
    case "unknown":
      return {};
    case "array": {
      const s = schema as IntermediateArraySchema;
      return {
        type: "array",
        items: buildJsonSchema(s.item)
      };
    }
    case "object": {
      const s = schema as IntermediateObjectSchema;
      const properties: Record<string, unknown> = {};
      for (const [key, propSchema] of Object.entries(s.properties)) {
        properties[key] = buildJsonSchema(propSchema);
      }
      const result: Record<string, unknown> = {
        type: "object",
        properties
      };
      if (s.required.length > 0) {
        result.required = s.required.slice().sort();
      }
      return result;
    }
    case "union": {
      const s = schema as IntermediateUnionSchema;
      return {
        anyOf: s.variants.map((v) => buildJsonSchema(v))
      };
    }
    default:
      return {};
  }
}

export function toTypescript(root: IntermediateSchema, rootName = "Root"): string {
  const lines: string[] = [];
  lines.push(`export type ${rootName} = ${tsTypeForSchema(root, 0)};`);
  return lines.join("\n");
}

function tsTypeForSchema(schema: IntermediateSchema, level: number): string {
  switch (schema.kind) {
    case "string":
    case "number":
    case "boolean":
      return schema.kind;
    case "null":
      return "null";
    case "unknown":
      return "unknown";
    case "array": {
      const s = schema as IntermediateArraySchema;
      return `${tsTypeForSchema(s.item, level)}[]`;
    }
    case "object": {
      const s = schema as IntermediateObjectSchema;
      const entries = Object.entries(s.properties);
      if (entries.length === 0) {
        return "{ [key: string]: unknown }";
      }
      const fields = entries.map(([key, value]) => {
        const optional = s.required.includes(key) ? "" : "?";
        return `${indent(level + 1)}${JSON.stringify(key)}${optional}: ${tsTypeForSchema(value, level + 1)};`;
      });
      return `{\n${fields.join("\n")}\n${indent(level)}}`;
    }
    case "union": {
      const s = schema as IntermediateUnionSchema;
      return s.variants.map((v) => tsTypeForSchema(v, level)).join(" | ");
    }
    default:
      return "unknown";
  }
}

export function toZod(root: IntermediateSchema, rootName = "RootSchema"): string {
  const lines: string[] = [`import { z } from "zod";`, "", `export const ${rootName} = ${zodForSchema(root, 0)};`];
  return lines.join("\n");
}

function zodForSchema(schema: IntermediateSchema, level: number): string {
  switch (schema.kind) {
    case "string":
      return "z.string()";
    case "number":
      return "z.number()";
    case "boolean":
      return "z.boolean()";
    case "null":
      return "z.null()";
    case "unknown":
      return "z.unknown()";
    case "array": {
      const s = schema as IntermediateArraySchema;
      return `z.array(${zodForSchema(s.item, level)})`;
    }
    case "object": {
      const s = schema as IntermediateObjectSchema;
      const entries = Object.entries(s.properties);
      if (entries.length === 0) return "z.record(z.unknown())";
      const fields = entries.map(([key, value]) => {
        const required = s.required.includes(key);
        const inner = zodForSchema(value, level + 1);
        const expr = required ? inner : `${inner}.optional()`;
        return `${indent(level + 1)}${JSON.stringify(key)}: ${expr}`;
      });
      return `z.object({\n${fields.join(",\n")}\n${indent(level)}})`;
    }
    case "union": {
      const s = schema as IntermediateUnionSchema;
      const variants = s.variants.map((v) => zodForSchema(v, level));
      return `z.union([${variants.join(", ")}])`;
    }
    default:
      return "z.unknown()";
  }
}

export function toYup(root: IntermediateSchema, rootName = "RootSchema"): string {
  const lines: string[] = [`import * as yup from "yup";`, "", `export const ${rootName} = ${yupForSchema(root, 0)};`];
  return lines.join("\n");
}

function yupForSchema(schema: IntermediateSchema, level: number): string {
  switch (schema.kind) {
    case "string":
      return "yup.string()";
    case "number":
      return "yup.number()";
    case "boolean":
      return "yup.boolean()";
    case "null":
      return "yup.mixed().nullable()";
    case "unknown":
      return "yup.mixed()";
    case "array": {
      const s = schema as IntermediateArraySchema;
      return `yup.array(${yupForSchema(s.item, level)})`;
    }
    case "object": {
      const s = schema as IntermediateObjectSchema;
      const entries = Object.entries(s.properties);
      if (entries.length === 0) return "yup.object().noUnknown()";
      const fields = entries.map(([key, value]) => {
        const required = s.required.includes(key);
        const inner = yupForSchema(value, level + 1);
        const expr = required ? inner + ".required()" : inner;
        return `${indent(level + 1)}${JSON.stringify(key)}: ${expr}`;
      });
      return `yup.object({\n${fields.join(",\n")}\n${indent(level)}})`;
    }
    case "union": {
      const s = schema as IntermediateUnionSchema;
      const variants = s.variants.map((v) => yupForSchema(v, level));
      return `yup.mixed().oneOf([${variants.join(", ")}])`;
    }
    default:
      return "yup.mixed()";
  }
}

export function toPydantic(root: IntermediateSchema, rootName = "RootModel"): string {
  const imports = `from __future__ import annotations\nfrom typing import Any, List, Optional, Union\nfrom pydantic import BaseModel\n`;
  const body = pydanticForSchema(root, rootName, 0);
  return `${imports}\n\n${body}`;
}

function pydanticForSchema(schema: IntermediateSchema, rootName: string, level: number): string {
  switch (schema.kind) {
    case "object": {
      const s = schema as IntermediateObjectSchema;
      const lines: string[] = [];
      lines.push(`class ${rootName}(BaseModel):`);
      const entries = Object.entries(s.properties);
      if (entries.length === 0) {
        lines.push(`${indent(1)}pass`);
        return lines.join("\n");
      }
      for (const [key, value] of entries) {
        const required = s.required.includes(key);
        const typeAnn = pyTypeForSchema(value, level + 1);
        const line = required
          ? `${indent(1)}${toPythonIdentifier(key)}: ${typeAnn}`
          : `${indent(1)}${toPythonIdentifier(key)}: Optional[${typeAnn}] = None`;
        lines.push(line);
      }
      return lines.join("\n");
    }
    default: {
      const ann = pyTypeForSchema(schema, level);
      return `class ${rootName}(BaseModel):\n${indent(1)}value: ${ann}`;
    }
  }
}

export function toJoi(root: IntermediateSchema, rootName = "rootSchema"): string {
  const lines: string[] = [`import Joi from "joi";`, "", `export const ${rootName} = ${joiForSchema(root, 0)};`];
  return lines.join("\n");
}

function joiForSchema(schema: IntermediateSchema, level: number): string {
  switch (schema.kind) {
    case "string":
      return "Joi.string()";
    case "number":
      return "Joi.number()";
    case "boolean":
      return "Joi.boolean()";
    case "null":
      return "Joi.any().allow(null)";
    case "unknown":
      return "Joi.any()";
    case "array": {
      const s = schema as IntermediateArraySchema;
      return `Joi.array().items(${joiForSchema(s.item, level)})`;
    }
    case "object": {
      const s = schema as IntermediateObjectSchema;
      const entries = Object.entries(s.properties);
      if (entries.length === 0) return "Joi.object().unknown(false)";
      const fields = entries.map(([key, value]) => {
        const required = s.required.includes(key);
        const inner = joiForSchema(value, level + 1);
        const expr = required ? inner + ".required()" : inner;
        return `${indent(level + 1)}${JSON.stringify(key)}: ${expr}`;
      });
      return `Joi.object({\n${fields.join(",\n")}\n${indent(level)}})`;
    }
    case "union": {
      const s = schema as IntermediateUnionSchema;
      const variants = s.variants.map((v) => joiForSchema(v, level));
      return `Joi.alternatives().try(${variants.join(", ")})`;
    }
    default:
      return "Joi.any()";
  }
}

function toPythonIdentifier(key: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return key;
  return `field_${Buffer.from(key).toString("hex")}`;
}

function pyTypeForSchema(schema: IntermediateSchema, _level: number): string {
  switch (schema.kind) {
    case "string":
      return "str";
    case "number":
      return "float";
    case "boolean":
      return "bool";
    case "null":
      return "None";
    case "unknown":
      return "Any";
    case "array": {
      const s = schema as IntermediateArraySchema;
      return `List[${pyTypeForSchema(s.item, _level + 1)}]`;
    }
    case "object":
      return "dict";
    case "union": {
      const s = schema as IntermediateUnionSchema;
      const types = s.variants.map((v) => pyTypeForSchema(v, _level + 1));
      return `Union[${types.join(", ")}]`;
    }
    default:
      return "Any";
  }
}

