/**
 * `designlab merge-check <round> <slot>`
 *
 * Verifies that a candidate branch is ready to become the real application:
 * temporary engine commits (identity overlay, build workflow) are peelable
 * from the tip, the design content re-passes the Functionality Contract
 * against the *current* base branch, and the merge would be conflict-free.
 *
 * It never merges. Merging is a human decision, and this command's output
 * ends with the exact commands for it.
 */

import { DesignLabError } from '../../core/errors.js';
import { normaliseSlot, parseRoundRef, shortSha, type CandidateSlot } from '../../core/ids.js';
import { checkMergeReadiness, type MergeReadinessResult } from '../../builds/merge-readiness.js';
import { formatProtectionReport } from '../../protection/checker.js';
import type { CliContext } from '../context.js';
import { resolveProjectId, resolveTarget } from '../context.js';

export interface MergeCheckOptions {
  roundRef: string;
  candidateRef: string;
  repo?: string | undefined;
  /** Merge target; defaults to the round's base branch. */
  base?: string | undefined;
}

export interface MergeCheckCommandResult {
  round: number;
  slot: CandidateSlot;
  branch: string;
  readiness: MergeReadinessResult;
}

export async function runMergeCheck(
  context: CliContext,
  options: MergeCheckOptions,
): Promise<MergeCheckCommandResult> {
  const roundNumber = parseRoundRef(options.roundRef);
  if (roundNumber === null) {
    throw new DesignLabError('ROUND_NOT_FOUND', `"${options.roundRef}" is not a valid round reference`, {
      hint: 'Use a round number such as 1, or an id such as r001.',
    });
  }
  const slot = normaliseSlot(options.candidateRef);

  const projectId = await resolveProjectId(context, options.repo);
  const round = await context.store.requireRound(projectId, roundNumber);
  const contract = await context.store.requireContract(projectId);

  const candidate = round.candidates.find((entry) => entry.slot === slot);
  if (!candidate) {
    throw new DesignLabError('CANDIDATE_NOT_FOUND', `Round ${roundNumber} has no candidate ${slot}`, {
      hint: `Available: ${round.candidates.map((entry) => entry.slot).join(', ') || 'none'}.`,
    });
  }

  // Fetch so the check runs against today's base branch, not a stale clone.
  const target = await resolveTarget({ context, repo: options.repo, refresh: true });

  const baseBranch = options.base ?? round.baseBranch;
  const baseRef =
    (await target.git.tryRevParse(`refs/remotes/origin/${baseBranch}`)) !== null
      ? `refs/remotes/origin/${baseBranch}`
      : baseBranch;

  if ((await target.git.tryRevParse(candidate.branch)) === null) {
    throw new DesignLabError('GIT_FAILED', `Candidate branch "${candidate.branch}" is not present locally`, {
      hint: 'Re-run the round, or fetch the branch into the workspace clone.',
    });
  }

  const readiness = await checkMergeReadiness({
    git: target.git,
    contract,
    protectionConfig: context.config.protection,
    candidateRef: candidate.branch,
    baseRef,
  });

  return { round: roundNumber, slot, branch: candidate.branch, readiness };
}

export function formatMergeCheckResult(result: MergeCheckCommandResult): string {
  const { readiness } = result;

  const lines = [
    readiness.ready
      ? `MERGE_READY — round ${result.round} candidate ${result.slot} (${result.branch})`
      : `NOT_MERGE_READY — round ${result.round} candidate ${result.slot} (${result.branch})`,
    '',
    `  merge target:   ${shortSha(readiness.baseSha)}`,
    `  design content: ${shortSha(readiness.designHeadSha)}`,
  ];

  if (readiness.engineCommits.length > 0) {
    lines.push('', '  Temporary engine commits at the tip (excluded from the merge):');
    for (const commit of readiness.engineCommits) {
      lines.push(`    ${shortSha(commit.sha)}  ${commit.subject}`);
    }
  } else {
    lines.push('', '  No temporary engine commits on this branch.');
  }

  lines.push('', `  ${formatProtectionReport(readiness.protection).split('\n')[0] ?? ''}`);

  if (readiness.conflicts.checked) {
    lines.push(
      readiness.conflicts.clean
        ? '  Merge is conflict-free against the current base.'
        : `  Merge would CONFLICT in: ${readiness.conflicts.files.join(', ')}`,
    );
  } else {
    lines.push(`  Conflict check skipped: ${readiness.conflicts.reason}`);
  }

  if (!readiness.ready) {
    lines.push('', 'Blockers:', ...readiness.blockers.map((blocker) => `  - ${blocker}`));
  } else {
    lines.push('', 'To merge (human decision — DesignLab never merges):', ...readiness.instructions.map((line) => `  ${line}`));
  }

  return lines.join('\n');
}
