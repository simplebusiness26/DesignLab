/**
 * Agent runner contract.
 *
 * DesignLab talks to models through this interface only. Two implementations
 * exist: one that drives the locally installed Claude Code CLI, and one that
 * returns deterministic fixtures so the entire pipeline — worktrees, gates,
 * protection, lineage — can be exercised in tests and in `--dry-run` without
 * spending a token.
 */

import type { z } from 'zod';

/**
 * Role, not model. Config maps roles onto models, so the orchestration code
 * never hard-codes a model name and the escalation policy stays legible.
 */
export type AgentRole =
  | 'lead' // Fable: strategy, design generation, review, evolution
  | 'builder' // Sonnet: routine implementation inside a worktree
  | 'reviewer'; // Opus: escalation for genuinely difficult failures

export interface AgentToolPolicy {
  /** Tools the agent may use. Empty means "runner default". */
  allowed?: readonly string[];
  /** Tools explicitly denied, applied after `allowed`. */
  denied?: readonly string[];
}

export interface AgentRequest<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  role: AgentRole;
  /** Short operation name; recorded in the usage ledger. */
  operation: string;
  /** The task itself. */
  prompt: string;
  /** Appended to the agent's system prompt: role, boundaries, house rules. */
  systemPrompt?: string;
  /** Working directory. For builders this is their assigned worktree. */
  cwd: string;
  /**
   * When present, the runner requires the model to emit JSON matching this
   * schema, and the result is validated before it is returned.
   */
  outputSchema?: TSchema;
  toolPolicy?: AgentToolPolicy;
  timeoutMs?: number;
  /** Per-invocation spend ceiling, when the backend supports one. */
  maxBudgetUsd?: number | null;
  /** Context for the usage ledger. */
  ledger?: { projectId?: string; round?: number | null; slot?: string | null };
}

export interface AgentUsage {
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  numTurns: number | null;
}

export interface AgentResponse<T = unknown> {
  ok: boolean;
  role: AgentRole;
  model: string;
  operation: string;
  /** Raw assistant text. Always present, even when `data` is populated. */
  text: string;
  /** Parsed, schema-validated output when `outputSchema` was supplied. */
  data: T | null;
  usage: AgentUsage;
  durationMs: number;
  /** Failure explanation when `ok` is false. */
  error: string | null;
  /** Backend session identifier, useful for resuming or auditing. */
  sessionId: string | null;
}

export interface AgentRunner {
  /** Human-readable backend name, e.g. "claude-code" or "mock". */
  readonly name: string;
  /** Resolves the concrete model used for a role. */
  modelFor(role: AgentRole): string;
  /** True when the backend is usable in this environment. */
  isAvailable(): Promise<boolean>;
  run<TSchema extends z.ZodTypeAny>(
    request: AgentRequest<TSchema>,
  ): Promise<AgentResponse<z.infer<TSchema>>>;
}

/** Convenience constructor for a failed response. */
export function failedResponse(
  request: AgentRequest,
  model: string,
  error: string,
  durationMs = 0,
): AgentResponse<never> {
  return {
    ok: false,
    role: request.role,
    model,
    operation: request.operation,
    text: '',
    data: null,
    usage: { costUsd: null, inputTokens: null, outputTokens: null, numTurns: null },
    durationMs,
    error,
    sessionId: null,
  };
}
