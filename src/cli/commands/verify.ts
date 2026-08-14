/**
 * `designlab verify <round> <candidate>`
 *
 * Re-runs the verification gates for an existing candidate and persists the
 * honest result. Verification only: it never pushes, never edits the design,
 * and never invents state — the candidate becomes `ready` only when every
 * required gate genuinely passed in this run, and `rejected` (with the
 * failing gates recorded) otherwise.
 *
 * This exists for the lead-review loop: a round can reject a candidate at
 * the protection gate for touching RESTRICTED paths, the lead reviews those
 * diffs and records per-file `approvedExceptions` in designlab.config.json
 * (synced into the contract), and this command re-derives the candidate's
 * status from a fresh gate run against the updated contract. A candidate
 * that was already pushed is not demoted retroactively; its gate results are
 * simply refreshed.
 */

import { join } from 'node:path';

import { DesignLabError } from '../../core/errors.js';
import { normaliseSlot, parseRoundRef, type CandidateSlot } from '../../core/ids.js';
import type { GateResult } from '../../core/schemas.js';
import { GitClient } from '../../git/git-client.js';
import { ProtectionChecker } from '../../protection/checker.js';
import { didAllRequiredGatesPass, formatGateResults, runGates } from '../../testing/gates.js';
import type { CliContext } from '../context.js';
import { resolveProjectId } from '../context.js';

export interface VerifyOptions {
  roundRef: string;
  candidateRef: string;
  repo?: string | undefined;
}

export interface VerifyCommandResult {
  round: number;
  slot: CandidateSlot;
  branch: string;
  status: string;
  gates: GateResult[];
}

export async function runVerify(context: CliContext, options: VerifyOptions): Promise<VerifyCommandResult> {
  const roundNumber = parseRoundRef(options.roundRef);
  if (roundNumber === null) {
    throw new DesignLabError('ROUND_NOT_FOUND', `"${options.roundRef}" is not a valid round reference`, {
      hint: 'Use a round number such as 1, or an id such as r001.',
    });
  }
  const slot = normaliseSlot(options.candidateRef);

  const projectId = await resolveProjectId(context, options.repo);
  const round = await context.store.requireRound(projectId, roundNumber);
  const candidate = round.candidates.find((entry) => entry.slot === slot);
  if (!candidate) {
    throw new DesignLabError('CANDIDATE_NOT_FOUND', `Round ${roundNumber} has no candidate ${slot}`, {
      hint: `Available: ${round.candidates.map((entry) => entry.slot).join(', ') || 'none'}.`,
    });
  }

  const contract = await context.store.requireContract(projectId);
  const manifest = await context.store.requireManifest(projectId);

  const worktree = join(
    context.paths.worktreesDir(projectId),
    candidate.branch.replace(`${context.config.branchPrefix}/`, ''),
  );

  const checker = new ProtectionChecker(contract, context.config.protection);
  const git = new GitClient({ cwd: worktree, logger: context.logger });

  if ((await git.tryRevParse('HEAD')) === null) {
    throw new DesignLabError('GIT_FAILED', `Candidate worktree is not usable: ${worktree}`, {
      hint: 'The worktree may have been cleaned; re-run the round.',
    });
  }

  if (!candidate.headSha) {
    throw new DesignLabError('GIT_FAILED', `Candidate ${slot} has no recorded design head to verify`, {
      hint: 'The builder never committed; re-run the round.',
    });
  }

  const gateRun = await runGates({
    cwd: worktree,
    commands: {
      install: manifest.commands.install,
      typecheck: manifest.commands.typecheck,
      lint: manifest.commands.lint,
      test: manifest.commands.test,
      build: null,
    },
    git,
    checker,
    baseSha: round.baseSha,
    headSha: candidate.headSha,
    timeoutMs: context.config.limits.gateTimeoutMs,
    logger: context.logger,
  });

  candidate.gates = gateRun.results;
  candidate.protection = gateRun.protection ?? candidate.protection;

  const passed = gateRun.passed && didAllRequiredGatesPass(gateRun.results);
  if (candidate.status !== 'pushed') {
    if (passed) {
      candidate.status = 'ready';
      candidate.failure = null;
    } else {
      candidate.status = 'rejected';
      candidate.failure = `Verification failed at gate: ${gateRun.failedGate ?? 'unknown'}.`;
    }
  }

  await context.store.writeRound(round);

  return {
    round: roundNumber,
    slot,
    branch: candidate.branch,
    status: candidate.status,
    gates: gateRun.results,
  };
}

export function formatVerifyResult(result: VerifyCommandResult): string {
  return [
    `Round ${result.round} candidate ${result.slot} (${result.branch})`,
    '',
    formatGateResults(result.gates),
    '',
    `Status: ${result.status}`,
  ].join('\n');
}
