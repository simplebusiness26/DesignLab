import { describe, expect, it } from 'vitest';

import { extractJson, resolvePermissionMode } from '../../src/agents/claude-code-runner.js';
import { toJsonSchema } from '../../src/core/json-schema.js';
import { designPlanSchema, builderReportSchema, designReviewSchema } from '../../src/core/schemas.js';

describe('resolvePermissionMode', () => {
  it('prefers bypassPermissions when not running as root', () => {
    expect(resolvePermissionMode('auto', false)).toBe('bypassPermissions');
  });

  it('falls back to dontAsk under root, which the CLI refuses bypass for', () => {
    // Containers and CI images commonly run as root; bypassPermissions there
    // makes the CLI exit before doing any work.
    expect(resolvePermissionMode('auto', true)).toBe('dontAsk');
  });

  it('honours an explicit mode regardless of privilege', () => {
    expect(resolvePermissionMode('acceptEdits', true)).toBe('acceptEdits');
    expect(resolvePermissionMode('bypassPermissions', true)).toBe('bypassPermissions');
    expect(resolvePermissionMode('dontAsk', false)).toBe('dontAsk');
  });
});

describe('extractJson', () => {
  it('parses a bare object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses a fenced json block', () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```\n')).toEqual({ a: 1 });
  });

  it('parses an unlabelled fenced block', () => {
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('recovers an object embedded in prose', () => {
    expect(extractJson('I decided on {"a":1} for the reasons above.')).toEqual({ a: 1 });
  });

  it('returns undefined when there is nothing to parse', () => {
    expect(extractJson('no json here')).toBeUndefined();
    expect(extractJson('')).toBeUndefined();
  });
});

describe('toJsonSchema', () => {
  it('produces a self-contained schema with no $ref or $schema', () => {
    const schema = JSON.stringify(toJsonSchema(designPlanSchema));
    expect(schema).not.toContain('"$ref"');
    expect(schema).not.toContain('"$schema"');
  });

  it('closes objects so an agent cannot smuggle in extra fields', () => {
    const schema = toJsonSchema(builderReportSchema) as Record<string, unknown>;
    expect(schema['type']).toBe('object');
    expect(schema['additionalProperties']).toBe(false);
  });

  it('preserves the required fields the orchestrator depends on', () => {
    const plan = toJsonSchema(designPlanSchema) as { required?: string[] };
    expect(plan.required).toContain('strategy');
    expect(plan.required).toContain('designs');

    const review = toJsonSchema(designReviewSchema) as { required?: string[] };
    expect(review.required).toContain('verdict');
    expect(review.required).toContain('summary');
  });

  it('carries the thirteen diversity dimensions through to the model contract', () => {
    const schema = JSON.stringify(toJsonSchema(designPlanSchema));
    for (const dimension of ['informationHierarchy', 'navigationPresentation', 'density', 'interactionModel']) {
      expect(schema).toContain(dimension);
    }
  });
});
