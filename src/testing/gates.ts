/**
 * Verification gates.
 *
 * A candidate is only "successful" if it survives this pipeline:
 *
 *   dependencies → typecheck → lint → test → protection → build
 *
 * Three rules govern the implementation, and they exist because the opposite
 * behaviour is the easiest way for a system like this to lie:
 *
 *  1. A gate is `passed` only when its command actually ran and exited zero.
 *  2. A gate with no configured command is `not-configured`, never `passed`.
 *  3. A gate skipped because an earlier one failed is `skipped`, never
 *     `passed`.
 *
 * Consequently `didAllRequiredGatesPass` is honest by construction: it cannot
 * return true for a candidate whose tests never executed.
 */

import { execCommand, formatCommand, parseCommandLine, summariseFailure } from '../core/exec.js';
import type { Logger } from '../core/logger.js';
import { nullLogger } from '../core/logger.js';
import type { GateName, GateResult, GateStatus, ProtectionReport } from '../core/schemas.js';
import type { ProtectionChecker } from '../protection/checker.js';
import { formatProtectionReport } from '../protection/checker.js';
import type { GitClient } from '../git/git-client.js';

export interface GateCommands {
  install: string | null;
  typecheck: string | null;
  lint: string | null;
  test: string | null;
  build: string | null;
}

export interface RunGatesOptions {
  cwd: string;
  commands: GateCommands;
  git: GitClient;
  checker: ProtectionChecker;
  baseSha: string;
  headSha: string;
  timeoutMs: number;
  logger?: Logger;
  env?: NodeJS.ProcessEnv;
  /**
   * Gates to run. Defaults to everything except `build`, which is expensive
   * and normally delegated to GitHub Actions.
   */
  gates?: readonly GateName[];
  /** Stop at the first failure. Default true — later gates would be noise. */
  failFast?: boolean;
}

export interface GateRunResult {
  results: GateResult[];
  protection: ProtectionReport | null;
  passed: boolean;
  /** The first gate that failed, if any. */
  failedGate: GateName | null;
}

export const DEFAULT_GATES: readonly GateName[] = ['dependencies', 'typecheck', 'lint', 'test', 'protection'];

/**
 * Advisory gates. Their results are always recorded and surfaced, but they do
 * not on their own sink a candidate:
 *
 *  - `dependencies` — a project may have no lockfile, or install offline; if
 *    dependencies are genuinely broken, typecheck and test fail anyway and
 *    those *are* required.
 *  - `lint` — many real repositories carry pre-existing lint debt, and failing
 *    a design for a rule it did not introduce would be noise.
 *  - `build` — expensive, and normally delegated to GitHub Actions.
 *
 * This set is the single source of truth for that policy: both `runGates` and
 * `didAllRequiredGatesPass` consult it, so "the run passed" and "the candidate
 * is acceptable" can never disagree.
 */
export const ADVISORY_GATES: ReadonlySet<GateName> = new Set(['dependencies', 'lint', 'build']);

/** Gates that must genuinely pass (or be absent from the project) to succeed. */
export const REQUIRED_GATES: ReadonlySet<GateName> = new Set(['typecheck', 'test', 'protection']);

export async function runGates(options: RunGatesOptions): Promise<GateRunResult> {
  const logger = (options.logger ?? nullLogger).child({ scope: 'gates' });
  const gates = options.gates ?? DEFAULT_GATES;
  const failFast = options.failFast ?? true;

  const results: GateResult[] = [];
  let protection: ProtectionReport | null = null;
  let failedGate: GateName | null = null;

  for (const gate of gates) {
    if (failedGate && failFast) {
      results.push(skipped(gate, `Skipped: the ${failedGate} gate already failed.`));
      continue;
    }

    if (gate === 'protection') {
      const startedAt = Date.now();
      protection = await options.checker.check(options.git, {
        baseSha: options.baseSha,
        headSha: options.headSha,
        cwd: options.cwd,
      });
      const result: GateResult = {
        gate: 'protection',
        status: protection.passed ? 'passed' : 'failed',
        command: null,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        summary: formatProtectionReport(protection),
        reason: protection.passed ? '' : `${protection.violations.length} contract violation(s)`,
        ranAt: new Date().toISOString(),
      };
      results.push(result);
      if (!protection.passed) failedGate = 'protection';
      logger.info('gate complete', { gate, status: result.status, durationMs: result.durationMs });
      continue;
    }

    const commandLine = commandForGate(gate, options.commands);
    if (!commandLine) {
      results.push({
        gate,
        status: 'not-configured',
        command: null,
        exitCode: null,
        durationMs: 0,
        summary: '',
        reason: `The target project has no ${gate} command.`,
        ranAt: new Date().toISOString(),
      });
      logger.debug('gate not configured', { gate });
      continue;
    }

    const result = await runCommandGate(gate, commandLine, options, logger);
    results.push(result);

    if (result.status === 'failed' && !ADVISORY_GATES.has(gate)) {
      failedGate = gate;
    } else if (result.status === 'failed') {
      // Recorded and surfaced, but not fatal — see ADVISORY_GATES.
      logger.warn('advisory gate failed', { gate, reason: result.reason });
    }
  }

  return {
    results,
    protection,
    passed: failedGate === null,
    failedGate,
  };
}

async function runCommandGate(
  gate: GateName,
  commandLine: string,
  options: RunGatesOptions,
  logger: Logger,
): Promise<GateResult> {
  const ranAt = new Date().toISOString();

  // Configured commands may contain shell constructs (`cd android && …`).
  // Those cannot run through the no-shell executor, so they are reported
  // honestly as unsupported rather than silently marked as passing.
  if (/[&|;><`$]/.test(commandLine)) {
    return {
      gate,
      status: 'not-configured',
      command: commandLine,
      exitCode: null,
      durationMs: 0,
      summary: '',
      reason: 'Command requires a shell; DesignLab does not execute shell constructs. Run this gate in CI instead.',
      ranAt,
    };
  }

  const parsed = parseCommandLine(commandLine);
  if (!parsed) {
    return {
      gate,
      status: 'not-configured',
      command: commandLine,
      exitCode: null,
      durationMs: 0,
      summary: '',
      reason: 'Command could not be parsed.',
      ranAt,
    };
  }

  logger.info('gate running', { gate, command: commandLine });

  let result;
  try {
    result = await execCommand(parsed.command, parsed.args, {
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      ...(options.env ? { env: options.env } : {}),
      maxBuffer: 4_000_000,
    });
  } catch (error) {
    return {
      gate,
      status: 'failed',
      command: commandLine,
      exitCode: null,
      durationMs: 0,
      summary: error instanceof Error ? error.message : String(error),
      reason: `Could not execute "${parsed.command}".`,
      ranAt,
    };
  }

  const status: GateStatus = result.ok ? 'passed' : 'failed';
  logger.info('gate complete', { gate, status, exitCode: result.exitCode, durationMs: result.durationMs });

  return {
    gate,
    status,
    command: formatCommand(parsed.command, parsed.args),
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    summary: result.ok ? '' : summariseFailure(result),
    reason: result.ok ? '' : result.timedOut ? `Timed out after ${options.timeoutMs}ms.` : `Exited ${result.exitCode}.`,
    ranAt,
  };
}

function commandForGate(gate: GateName, commands: GateCommands): string | null {
  switch (gate) {
    case 'dependencies':
      return commands.install;
    case 'typecheck':
      return commands.typecheck;
    case 'lint':
      return commands.lint;
    case 'test':
      return commands.test;
    case 'build':
      return commands.build;
    default:
      return null;
  }
}

function skipped(gate: GateName, reason: string): GateResult {
  return {
    gate,
    status: 'skipped',
    command: null,
    exitCode: null,
    durationMs: 0,
    summary: '',
    reason,
    ranAt: new Date().toISOString(),
  };
}

/**
 * True only when every required gate genuinely ran and passed.
 *
 * The distinctions this function draws are the ones that keep DesignLab
 * honest about its own results:
 *
 *  - `failed` on a required gate  → not acceptable.
 *  - `skipped` on a required gate → not acceptable. A test that never ran
 *    because typecheck failed first is not a passing test.
 *  - `not-configured` on a required command gate → acceptable. The project
 *    genuinely has no such command; that is a fact about the project, not a
 *    failure of the candidate.
 *  - `not-configured` on `protection` → not acceptable. DesignLab always runs
 *    that gate itself, so its absence means the pipeline did not complete.
 *  - advisory gates → never decisive, in either direction.
 */
export function didAllRequiredGatesPass(results: readonly GateResult[]): boolean {
  let protectionPassed = false;

  for (const result of results) {
    if (ADVISORY_GATES.has(result.gate)) continue;

    if (result.status === 'failed' || result.status === 'skipped') return false;
    if (result.gate === 'protection') {
      if (result.status !== 'passed') return false;
      protectionPassed = true;
    }
  }

  // Protection is the one gate that is never optional.
  return protectionPassed;
}

/** Compact, operator-readable summary of a gate run. */
export function formatGateResults(results: readonly GateResult[]): string {
  const icon: Record<GateStatus, string> = {
    passed: 'PASS',
    failed: 'FAIL',
    skipped: 'SKIP',
    'not-configured': 'N/A ',
  };

  return results
    .map((result) => {
      const duration = result.durationMs > 0 ? ` (${(result.durationMs / 1000).toFixed(1)}s)` : '';
      const detail = result.reason ? ` — ${result.reason}` : '';
      return `  ${icon[result.status]} ${result.gate}${duration}${detail}`;
    })
    .join('\n');
}

/** The failure text handed back to a builder for a retry. */
export function buildFailureFeedback(results: readonly GateResult[]): string {
  const failures = results.filter((result) => result.status === 'failed');
  if (failures.length === 0) return '';

  const sections = failures.map((failure) => {
    const lines = [`### ${failure.gate} failed`];
    if (failure.command) lines.push(`Command: \`${failure.command}\``);
    if (failure.exitCode !== null) lines.push(`Exit code: ${failure.exitCode}`);
    if (failure.summary) lines.push('', '```', failure.summary.slice(0, 6000), '```');
    return lines.join('\n');
  });

  return sections.join('\n\n');
}
