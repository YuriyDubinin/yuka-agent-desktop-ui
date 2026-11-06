// A small validator for the JSON Schema subset used by tool arguments:
// type, enum, properties, required, additionalProperties, items. No dependencies.
// Error texts are written for the model, so it can fix its call.

import type { JsonSchema } from '../../shared/protocol';

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function matchesType(expected: NonNullable<JsonSchema['type']>, value: unknown): boolean {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  return actual === expected;
}

/** Returns the list of problems; empty means valid. */
export function validate(schema: JsonSchema, value: unknown, path = 'arguments'): string[] {
  const errors: string[] = [];

  if (schema.type && !matchesType(schema.type, value)) {
    errors.push(`${path}: ожидается ${schema.type}, получено ${typeOf(value)}`);
    return errors;
  }

  if (schema.enum && !schema.enum.some((option) => option === value)) {
    errors.push(
      `${path}: допустимые значения — ${schema.enum.map((o) => JSON.stringify(o)).join(', ')}`,
    );
  }

  if (typeOf(value) === 'object') {
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in object)) errors.push(`${path}.${key}: обязательное поле`);
    }
    for (const [key, child] of Object.entries(object)) {
      const childSchema = schema.properties?.[key];
      if (childSchema) {
        errors.push(...validate(childSchema, child, `${path}.${key}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}.${key}: лишнее поле`);
      }
    }
  }

  if (typeOf(value) === 'array' && schema.items) {
    (value as unknown[]).forEach((item, index) => {
      errors.push(...validate(schema.items as JsonSchema, item, `${path}[${index}]`));
    });
  }

  return errors;
}
