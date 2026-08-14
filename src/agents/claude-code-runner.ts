/**
 * Claude Code CLI agent runner.
 *
 * Drives the locally installed `claude` binary in non-interactive mode. This
 * is the officially supported headless surface, which matters more than it
 * sounds: it means DesignLab does not embed a bespoke API client, inherits the
 * operator's existing authentication, and gets structured output for free via
 * `--json-schema`.
 *
 * Flags used (all present in Claude Code 2.x `--help`):
 *   -p / --print                non-interactive
 *   --model <alias|id>          role → model mapping
 *   --output-format json        single JSON result envelope
 *   --json-schema <schema>      enforced structured output
 *   --append-system-prompt      role instructions and boundaries
 *   --allowedTools/--disallowedTools   tool policy
 *   --permission-mode           unattended operation
 *   --max-budget-usd            per-invocation spend ceiling
 *
 * The runner tolerates envelope drift: it reads the documented fields when
 * present and falls back to treating stdout as raw text otherwise, so a CLI
 * upgrade degrades output fidelity rather than breaking the pipeline.
 */

import type { z } from 'zod';

import { execCommand } from '../core/exec.js';
import type { Logger } from '../core/logger.js';
import { nullLogger } from '../core/logger.js';
import { toJsonSchema } from '../core/json-schema.js';
import type { AgentRequest, AgentResponse, AgentRole, AgentRunner, AgentUsage } from './types.js';
import { failedResponse } from './types.js';

export interface ClaudeCodeRunnerOptions {
  /** Model alias or full id per role. */
  models: Record<AgentRole, string>;
  /** Executable name or path. */
  bin?: string;
  logger?: Logger;
  defaultTimeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  /**
   * Permission mode for unattended runs. `bypassPermissions` is the only mode
   * that never blocks on a prompt; DesignLab confines the blast radius with
   * per-agent worktrees and tool policies instead.
   */
  permissionMode?: 'bypassPermissions' | 'acceptEdits' | 'dontAsk' | 'default';
}

interface ClaudeJsonEnvelope {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: unknown;
  session_id?: string;
  total_cost_usd?: number;
  num_turns?: number;
  usage?: { input_tokens?: number; output_tokens?: number };
  structured_output?: unknown;
}

export class ClaudeCodeRunner implements AgentRunner {
  readonly name = 'claude-code';

  private readonly models: Record<AgentRole, string>;
  private readonly bin: string;
  private readonly logger: Logger;
  private readonly defaultTimeoutMs: number;
  private readonly env: NodeJS.ProcessEnv;
  private readonly permissionMode: string;
  private availability: boolean | null = null;

  constructor(options: ClaudeCodeRunnerOptions) {
    this.models = options.models;
    this.bin = options.bin ?? 'claude';
    this.logger = (options.logger ?? nullLogger).child({ scope: 'agent:claude-code' });
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 20 * 60 * 1000;
    this.env = options.env ?? process.env;
    this.permissionMode = options.permissionMode ?? 'bypassPermissions';
  }

  modelFor(role: AgentRole): string {
    return this.models[role];
  }

  async isAvailable(): Promise<boolean> {
    if (this.availability !== null) return this.availability;
    try {
      const result = await execCommand(this.bin, ['--version'], { timeoutMs: 30_000, env: this.env });
      this.availability = result.ok;
    } catch {
      this.availability = false;
    }
    return this.availability;
  }

  async run<TSchema extends z.ZodTypeAny>(
    request: AgentRequest<TSchema>,
  ): Promise<AgentResponse<z.infer<TSchema>>> {
    const model = this.modelFor(request.role);
    const args = this.buildArgs(request, model);
    const startedAt = Date.now();

    this.logger.info('agent dispatch', {
      role: request.role,
      model,
      operation: request.operation,
      cwd: request.cwd,
    });

    let result;
    try {
      result = await execCommand(this.bin, args, {
        cwd: request.cwd,
        env: this.env,
        timeoutMs: request.timeoutMs ?? this.defaultTimeoutMs,
        // The prompt goes on stdin so it is never visible in a process list.
        input: request.prompt,
        maxBuffer: 8_000_000,
      });
    } catch (error) {
      return failedResponse(
        request,
        model,
        `Could not execute "${this.bin}": ${error instanceof Error ? error.message : String(error)}`,
        Date.now() - startedAt,
      );
    }

    const durationMs = Date.now() - startedAt;

    if (!result.ok) {
      const detail = result.timedOut
        ? `timed out after ${durationMs}ms`
        : `exited ${result.exitCode}: ${(result.stderr || result.stdout).slice(-1500).trim()}`;
      this.logger.warn('agent failed', { role: request.role, operation: request.operation, detail });
      return failedResponse(request, model, detail, durationMs);
    }

    const envelope = parseEnvelope(result.stdout);
    const text = extractText(envelope, result.stdout);
    const usage = extractUsage(envelope);
    const sessionId = envelope?.session_id ?? null;

    if (envelope?.is_error === true) {
      return {
        ...failedResponse(request, model, text || 'agent reported an error', durationMs),
        text,
        usage,
        sessionId,
      };
    }

    if (!request.outputSchema) {
      return {
        ok: true,
        role: request.role,
        model,
        operation: request.operation,
        text,
        data: null,
        usage,
        durationMs,
        error: null,
        sessionId,
      };
    }

    const candidate = envelope?.structured_output ?? extractJson(text);
    if (candidate === undefined) {
      return {
        ...failedResponse(request, model, 'agent returned no parseable JSON payload', durationMs),
        text,
        usage,
        sessionId,
      };
    }

    const parsed = request.outputSchema.safeParse(candidate);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ');
      return {
        ...failedResponse(request, model, `agent output failed schema validation: ${issues}`, durationMs),
        text,
        usage,
        sessionId,
      };
    }

    return {
      ok: true,
      role: request.role,
      model,
      operation: request.operation,
      text,
      data: parsed.data as z.infer<TSchema>,
      usage,
      durationMs,
      error: null,
      sessionId,
    };
  }

  private buildArgs(request: AgentRequest, model: string): string[] {
    const args = ['--print', '--model', model, '--output-format', 'json'];

    args.push('--permission-mode', this.permissionMode);

    if (request.systemPrompt) {
      args.push('--append-system-prompt', request.systemPrompt);
    }

    if (request.outputSchema) {
      args.push('--json-schema', JSON.stringify(toJsonSchema(request.outputSchema)));
    }

    const allowed = request.toolPolicy?.allowed;
    if (allowed && allowed.length > 0) args.push('--allowedTools', ...allowed);

    const denied = request.toolPolicy?.denied;
    if (denied && denied.length > 0) args.push('--disallowedTools', ...denied);

    const budget = request.maxBudgetUsd;
    if (budget && budget > 0) args.push('--max-budget-usd', String(budget));

    return args;
  }
}

function parseEnvelope(stdout: string): ClaudeJsonEnvelope | null {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      // stream-json style array: the final result object wins.
      const last = [...parsed].reverse().find((entry) => isEnvelope(entry) && entry.type === 'result');
      return isEnvelope(last) ? last : null;
    }
    return isEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isEnvelope(value: unknown): value is ClaudeJsonEnvelope {
  return typeof value === 'object' && value !== null;
}

function extractText(envelope: ClaudeJsonEnvelope | null, stdout: string): string {
  if (!envelope) return stdout.trim();
  const { result } = envelope;
  if (typeof result === 'string') return result;
  if (result !== undefined && result !== null) return JSON.stringify(result);
  return stdout.trim();
}

function extractUsage(envelope: ClaudeJsonEnvelope | null): AgentUsage {
  return {
    costUsd: typeof envelope?.total_cost_usd === 'number' ? envelope.total_cost_usd : null,
    inputTokens: typeof envelope?.usage?.input_tokens === 'number' ? envelope.usage.input_tokens : null,
    outputTokens: typeof envelope?.usage?.output_tokens === 'number' ? envelope.usage.output_tokens : null,
    numTurns: typeof envelope?.num_turns === 'number' ? envelope.num_turns : null,
  };
}

/**
 * Recovers a JSON object from assistant text. Handles a bare object, a fenced
 * ```json block, and an object embedded in prose. Structured output normally
 * makes this unnecessary, but it keeps older CLI builds working.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const direct = tryParse(trimmed);
  if (direct !== undefined) return direct;

  const fenced = /```(?:json)?\s*\n([\s\S]*?)\n?```/i.exec(trimmed);
  if (fenced?.[1]) {
    const parsed = tryParse(fenced[1].trim());
    if (parsed !== undefined) return parsed;
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const parsed = tryParse(trimmed.slice(start, end + 1));
    if (parsed !== undefined) return parsed;
  }

  return undefined;
}

function tryParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
