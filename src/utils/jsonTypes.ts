export type JsonPrimitiveKind = "string" | "number" | "boolean" | "null";

export type JsonValueKind = JsonPrimitiveKind | "object" | "array" | "unknown";

export function inferJsonKind(value: unknown): JsonValueKind {
  if (value === null) return "null";
  if (value === undefined) return "unknown";
  const t = typeof value;
  if (t === "string") return "string";
  if (t === "number" || t === "bigint") return "number";
  if (t === "boolean") return "boolean";
  if (Array.isArray(value)) return "array";
  if (t === "object") return "object";
  return "unknown";
}

export interface IntermediatePrimitiveSchema {
  kind: JsonPrimitiveKind | "unknown";
}

export interface IntermediateArraySchema {
  kind: "array";
  item: IntermediateSchema;
}

export interface IntermediateObjectSchema {
  kind: "object";
  properties: Record<string, IntermediateSchema>;
  required: string[];
}

export interface IntermediateUnionSchema {
  kind: "union";
  variants: IntermediateSchema[];
}

export type IntermediateSchema =
  | IntermediatePrimitiveSchema
  | IntermediateArraySchema
  | IntermediateObjectSchema
  | IntermediateUnionSchema;

export function buildIntermediateSchema(value: unknown): IntermediateSchema {
  const kind = inferJsonKind(value);

  if (kind === "array") {
    const arr = value as unknown[];
    if (arr.length === 0) {
      return { kind: "array", item: { kind: "unknown" } };
    }
    const itemSchemas = arr.map((item) => buildIntermediateSchema(item));
    const first = itemSchemas[0];
    const allSame = itemSchemas.every((s) => isSchemaEqual(s, first));
    const item =
      allSame || itemSchemas.length === 1
        ? first
        : ({
            kind: "union",
            variants: mergeUnionVariants(itemSchemas)
          } satisfies IntermediateUnionSchema);
    return { kind: "array", item };
  }

  if (kind === "object") {
    const obj = value as Record<string, unknown>;
    const properties: Record<string, IntermediateSchema> = {};
    const required: string[] = [];
    for (const [key, v] of Object.entries(obj)) {
      properties[key] = buildIntermediateSchema(v);
      required.push(key);
    }
    return { kind: "object", properties, required };
  }

  if (kind === "string" || kind === "number" || kind === "boolean" || kind === "null") {
    return { kind };
  }

  return { kind: "unknown" };
}

function isSchemaEqual(a: IntermediateSchema, b: IntermediateSchema): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "string":
    case "number":
    case "boolean":
    case "null":
    case "unknown":
      return true;
    case "array":
      return (b as IntermediateArraySchema).kind === "array" && isSchemaEqual(a.item, (b as IntermediateArraySchema).item);
    case "object": {
      const bo = b as IntermediateObjectSchema;
      const keysA = Object.keys(a.properties);
      const keysB = Object.keys(bo.properties);
      if (keysA.length !== keysB.length) return false;
      for (const key of keysA) {
        if (!(key in bo.properties)) return false;
        if (!isSchemaEqual(a.properties[key], bo.properties[key])) return false;
      }
      if (a.required.length !== bo.required.length) return false;
      const reqA = [...a.required].sort();
      const reqB = [...bo.required].sort();
      return reqA.every((k, i) => k === reqB[i]);
    }
    case "union": {
      const bu = b as IntermediateUnionSchema;
      if (a.variants.length !== bu.variants.length) return false;
      return a.variants.every((variant, index) => isSchemaEqual(variant, bu.variants[index]));
    }
    default:
      return false;
  }
}

function mergeUnionVariants(schemas: IntermediateSchema[]): IntermediateSchema[] {
  const result: IntermediateSchema[] = [];
  for (const schema of schemas) {
    if (schema.kind === "union") {
      for (const inner of schema.variants) {
        pushIfNotPresent(result, inner);
      }
    } else {
      pushIfNotPresent(result, schema);
    }
  }
  return result;
}

function pushIfNotPresent(list: IntermediateSchema[], schema: IntermediateSchema): void {
  if (!list.some((existing) => isSchemaEqual(existing, schema))) {
    list.push(schema);
  }
}

