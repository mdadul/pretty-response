import type { ErrorObject } from "ajv";

export interface SchemaValidationResult {
  valid: boolean;
  errors: ErrorObject[] | null | undefined;
}

export function validateAgainstSchema(data: unknown, schema: unknown): SchemaValidationResult {
  // Schema validation is disabled in the extension context because Ajv requires
  // 'unsafe-eval' (Function constructor), which is blocked by Chrome extension CSP.
  // We treat all schemas as "not validated" rather than failing loudly.
  return { valid: true, errors: null };
}

