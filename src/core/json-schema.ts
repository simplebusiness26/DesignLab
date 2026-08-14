/**
 * Zod → JSON Schema conversion for structured model output.
 *
 * The Claude CLI's `--json-schema` flag expects a self-contained schema, so
 * definitions are inlined rather than referenced via `$ref`, and `$schema` is
 * stripped. `additionalProperties: false` is applied throughout: an agent that
 * invents extra fields should fail validation loudly rather than have the
 * extra data silently dropped.
 */

import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export type JsonSchema = Record<string, unknown>;

export function toJsonSchema(schema: z.ZodTypeAny, name?: string): JsonSchema {
  const converted = zodToJsonSchema(schema, {
    $refStrategy: 'none',
    target: 'jsonSchema7',
    ...(name ? { name } : {}),
  }) as JsonSchema;

  delete converted['$schema'];
  return closeObjects(converted) as JsonSchema;
}

function closeObjects(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(closeObjects);
  if (!node || typeof node !== 'object') return node;

  const record = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = closeObjects(value);
  }
  if (out['type'] === 'object' && out['additionalProperties'] === undefined) {
    out['additionalProperties'] = false;
  }
  return out;
}

/** Pretty-printed schema, used when writing `.designlab/schemas/*.json`. */
export function renderSchema(schema: z.ZodTypeAny, name: string): string {
  return `${JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', ...toJsonSchema(schema, name) }, null, 2)}\n`;
}
