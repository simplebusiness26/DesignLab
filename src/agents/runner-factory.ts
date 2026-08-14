/**
 * Agent runner construction and usage accounting.
 *
 * `LedgeredRunner` wraps any runner and appends one usage record per
 * invocation, which is what makes "which model did what, and how often" an
 * answerable question rather than a guess. It is also the single place where
 * an agent invocation can be blocked or budgeted.
 */

import type { z } from 'zod';

import type { DesignLabConfig } from '../config/config.js';
import { DesignLabError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { nullLogger } from '../core/logger.js';
import type { Store } from '../core/store.js';
import { ClaudeCodeRunner } from './claude-code-runner.js';
import { MockAgentRunner } from './mock-runner.js';
import type { AgentRequest, AgentResponse, AgentRole, AgentRunner } from './types.js';

export function createAgentRunner(
  config: DesignLabConfig,
  options: { logger?: Logger; forceMock?: boolean } = {},
): AgentRunner {
  if (options.forceMock || config.agentRunner === 'mock') {
    return new MockAgentRunner();
  }
  return new ClaudeCodeRunner({
    models: {
      lead: config.models.lead,
      builder: config.models.builder,
      reviewer: config.models.reviewer,
    },
    bin: config.claudeBin,
    permissionMode: config.claudePermissionMode,
    ...(options.logger ? { logger: options.logger } : {}),
    defaultTimeoutMs: config.limits.leadTimeoutMs,
  });
}

export interface LedgeredRunnerOptions {
  store: Store;
  logger?: Logger;
  /** Stamped onto every usage record. */
  context?: { projectId?: string; round?: number | null };
}

export class LedgeredRunner implements AgentRunner {
  readonly name: string;

  private readonly inner: AgentRunner;
  private readonly store: Store;
  private readonly logger: Logger;
  private readonly context: { projectId?: string; round?: number | null };

  constructor(inner: AgentRunner, options: LedgeredRunnerOptions) {
    this.inner = inner;
    this.name = inner.name;
    this.store = options.store;
    this.logger = (options.logger ?? nullLogger).child({ scope: 'agent' });
    this.context = options.context ?? {};
  }

  modelFor(role: AgentRole): string {
    return this.inner.modelFor(role);
  }

  isAvailable(): Promise<boolean> {
    return this.inner.isAvailable();
  }

  async run<TSchema extends z.ZodTypeAny>(
    request: AgentRequest<TSchema>,
  ): Promise<AgentResponse<z.infer<TSchema>>> {
    const response = await this.inner.run(request);

    await this.store
      .recordUsage({
        ts: new Date().toISOString(),
        projectId: request.ledger?.projectId ?? this.context.projectId ?? '',
        round: request.ledger?.round ?? this.context.round ?? null,
        slot: request.ledger?.slot ?? null,
        role: request.role,
        model: response.model,
        operation: request.operation,
        durationMs: response.durationMs,
        ok: response.ok,
        costUsd: response.usage.costUsd,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        numTurns: response.usage.numTurns,
        cacheHit: false,
        notes: response.error ?? '',
      })
      .catch((error: unknown) => {
        // The ledger is observability, never a reason to fail a round.
        this.logger.debug('usage ledger write failed', { error: String(error) });
      });

    return response;
  }
}

/** Records a cache hit — work that a model did not have to redo. */
export async function recordCacheHit(
  store: Store,
  details: { projectId: string; operation: string; notes?: string },
): Promise<void> {
  await store
    .recordUsage({
      ts: new Date().toISOString(),
      projectId: details.projectId,
      round: null,
      slot: null,
      role: 'none',
      model: 'none',
      operation: details.operation,
      durationMs: 0,
      ok: true,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      numTurns: 0,
      cacheHit: true,
      notes: details.notes ?? '',
    })
    .catch(() => {});
}

/** Fails fast with an actionable message when the backend is unusable. */
export async function assertRunnerAvailable(runner: AgentRunner, config: DesignLabConfig): Promise<void> {
  if (await runner.isAvailable()) return;
  throw new DesignLabError('AGENT_UNAVAILABLE', `Agent backend "${runner.name}" is not available`, {
    details: { runner: runner.name, bin: config.claudeBin },
    hint:
      'Install the Claude Code CLI and authenticate it (`claude auth`), set DESIGNLAB_CLAUDE_BIN, ' +
      'or run with --dry-run to use the deterministic runner.',
  });
}
