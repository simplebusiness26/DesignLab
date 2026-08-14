/**
 * DesignLab configuration.
 *
 * Config resolution order (later wins):
 *   built-in defaults → designlab.config.json → environment → CLI flags
 *
 * The config file is the place a project pins model choices, retry ceilings,
 * and — importantly — project-specific protection overrides, so that
 * functional boundaries are policy rather than prompt text.
 */

import { z } from 'zod';

import { DesignLabError } from '../core/errors.js';
import { readJson, writeJson } from '../core/fsx.js';
import { CONFIG_FILENAME, DEFAULT_WORKSPACE_DIRNAME } from '../core/paths.js';
import { LOG_LEVELS } from '../core/logger.js';
import { protectionLevelSchema } from '../core/schemas.js';

/**
 * Model aliases understood by the Claude Code CLI. DesignLab stores aliases
 * rather than pinned model IDs so that a CLI upgrade picks up newer models
 * without a config migration; an explicit full model ID also works.
 */
export const modelRoleSchema = z.object({
  /** Strategy, design generation, review, evolution planning. */
  lead: z.string().default('fable'),
  /** Routine implementation work inside a worktree. */
  builder: z.string().default('sonnet'),
  /** Escalation reviewer for genuinely hard engineering failures. */
  reviewer: z.string().default('opus'),
});
export type ModelRoles = z.infer<typeof modelRoleSchema>;

export const limitsSchema = z.object({
  /** Implementation attempts per candidate before it is marked failed. */
  builderAttempts: z.number().int().min(1).max(6).default(2),
  /** Opus escalations allowed per candidate. */
  escalations: z.number().int().min(0).max(3).default(1),
  /** Candidates implemented concurrently. */
  concurrency: z.number().int().min(1).max(8).default(2),
  /** Wall-clock ceiling for one builder invocation. */
  builderTimeoutMs: z.number().int().min(60_000).max(4 * 60 * 60 * 1000).default(45 * 60 * 1000),
  /** Wall-clock ceiling for a lead/reviewer invocation. */
  leadTimeoutMs: z.number().int().min(30_000).max(60 * 60 * 1000).default(15 * 60 * 1000),
  /** Ceiling for a single verification-gate command. */
  gateTimeoutMs: z.number().int().min(30_000).max(2 * 60 * 60 * 1000).default(20 * 60 * 1000),
  /** Optional per-agent-invocation spend cap, passed to the Claude CLI. */
  maxBudgetUsdPerAgent: z.number().positive().nullable().default(null),
  /** Minimum acceptable diversity score for a generated round plan. */
  minDiversityScore: z.number().min(0).max(1).default(0.55),
  /** Re-planning attempts when the diversity score is too low. */
  diversityRetries: z.number().int().min(0).max(3).default(1),
});
export type Limits = z.infer<typeof limitsSchema>;

export const protectionConfigSchema = z.object({
  /** Project-specific rules, appended after built-ins so they take priority. */
  rules: z
    .array(
      z.object({
        pattern: z.string().min(1),
        level: protectionLevelSchema,
        reason: z.string().min(1).default('project override'),
      }),
    )
    .default([]),
  /** Paths a design may modify despite a protecting rule. */
  approvedExceptions: z
    .array(z.object({ pattern: z.string().min(1), reason: z.string().min(1) }))
    .default([]),
  /** Fail a candidate when it touches paths that match no rule. */
  failOnUnknown: z.boolean().default(false),
  /** Fail a candidate when it touches RESTRICTED paths. */
  failOnRestricted: z.boolean().default(true),
  /** Hard ceiling on changed files; a runaway rewrite is a red flag. */
  maxChangedFiles: z.number().int().min(1).max(5000).default(400),
});
export type ProtectionConfig = z.infer<typeof protectionConfigSchema>;

export const buildConfigSchema = z.object({
  /** Generate a GitHub Actions workflow when the target lacks one. */
  generateWorkflow: z.boolean().default(true),
  /** Reuse an existing Android workflow when one is detected. */
  reuseExistingWorkflow: z.boolean().default(true),
  /** Workflow path DesignLab writes when it generates one. */
  workflowPath: z.string().default('.github/workflows/designlab-android.yml'),
  /** Push successful design branches to the target remote. */
  pushBranches: z.boolean().default(true),
  /** Git remote used for pushes. */
  remote: z.string().default('origin'),
});
export type BuildConfig = z.infer<typeof buildConfigSchema>;

export const configSchema = z.object({
  $schema: z.string().optional(),
  /** Workspace root; relative paths resolve against the config file's dir. */
  workspaceDir: z.string().default(DEFAULT_WORKSPACE_DIRNAME),
  /** Default target repository (URL or local path). */
  repo: z.string().nullable().default(null),
  /** Default base branch on the target repository. */
  branch: z.string().default('main'),
  /** Git branch prefix for design candidates. */
  branchPrefix: z.string().default('design'),
  models: modelRoleSchema.default({}),
  limits: limitsSchema.default({}),
  protection: protectionConfigSchema.default({}),
  build: buildConfigSchema.default({}),
  /** Agent backend. "mock" runs the full pipeline with no model calls. */
  agentRunner: z.enum(['claude-code', 'mock']).default('claude-code'),
  /** Path/name of the Claude Code executable. */
  claudeBin: z.string().default('claude'),
  /** Enrich the deterministic manifest with an AI pass. */
  aiManifestEnrichment: z.boolean().default(true),
  logLevel: z.enum(LOG_LEVELS).default('info'),
  logFormat: z.enum(['human', 'json']).default('human'),
});

export type DesignLabConfig = z.infer<typeof configSchema>;

export function defaultConfig(): DesignLabConfig {
  return configSchema.parse({});
}

/** Parses and validates a raw config object, reporting precise field errors. */
export function parseConfig(raw: unknown, source: string): DesignLabConfig {
  const result = configSchema.safeParse(raw ?? {});
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new DesignLabError('CONFIG_INVALID', `Invalid configuration in ${source}:\n${issues}`, {
      details: { source, issues: result.error.issues },
      hint: `Fix ${CONFIG_FILENAME} or delete it and re-run "designlab init".`,
    });
  }
  return result.data;
}

/** Reads config from disk. Returns defaults when the file is absent. */
export async function loadConfigFile(configPath: string): Promise<{
  config: DesignLabConfig;
  exists: boolean;
}> {
  const raw = await readJson<unknown>(configPath);
  if (raw === null) return { config: defaultConfig(), exists: false };
  return { config: parseConfig(raw, configPath), exists: true };
}

export async function writeConfigFile(configPath: string, config: DesignLabConfig): Promise<void> {
  await writeJson(configPath, config);
}

/** Environment overrides, applied after the config file. */
export function applyEnvOverrides(
  config: DesignLabConfig,
  env: NodeJS.ProcessEnv = process.env,
): DesignLabConfig {
  const next: DesignLabConfig = { ...config };
  const level = env['DESIGNLAB_LOG_LEVEL'];
  if (level && (LOG_LEVELS as readonly string[]).includes(level)) {
    next.logLevel = level as DesignLabConfig['logLevel'];
  }
  const bin = env['DESIGNLAB_CLAUDE_BIN'];
  if (bin) next.claudeBin = bin;
  const runner = env['DESIGNLAB_AGENT_RUNNER'];
  if (runner === 'mock' || runner === 'claude-code') next.agentRunner = runner;
  return next;
}

/** Shallow-merges CLI flag overrides onto a config. */
export function applyOverrides(
  config: DesignLabConfig,
  overrides: Partial<DesignLabConfig>,
): DesignLabConfig {
  return {
    ...config,
    ...stripUndefined(overrides),
    models: { ...config.models, ...stripUndefined(overrides.models ?? {}) },
    limits: { ...config.limits, ...stripUndefined(overrides.limits ?? {}) },
    protection: { ...config.protection, ...stripUndefined(overrides.protection ?? {}) },
    build: { ...config.build, ...stripUndefined(overrides.build ?? {}) },
  };
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry;
  }
  return out as Partial<T>;
}
