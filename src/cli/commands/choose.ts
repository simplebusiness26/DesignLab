/**
 * `designlab choose <round> <candidate> --feedback "…"`
 *
 * Records a winner, appends to lineage, and produces the plan for the next
 * generation. The plan is persisted, so the following `designlab round` picks
 * it up automatically and starts from the winner's branch.
 */

import { DesignLabError } from '../../core/errors.js';
import { normaliseSlot, parseRoundRef, shortSha, type CandidateSlot } from '../../core/ids.js';
import {
  appendLineage,
  chooseWinner,
  parseFeedbackReferences,
  planNextGeneration,
} from '../../lineage/evolution.js';
import type { NextGenerationPlan, Round } from '../../core/schemas.js';
import type { CliContext } from '../context.js';
import { resolveProjectId, resolveTarget } from '../context.js';

export interface ChooseOptions {
  roundRef: string;
  candidateRef: string;
  feedback?: string | undefined;
  repo?: string | undefined;
  /** Record the winner but skip next-generation planning. */
  noPlan?: boolean;
  /** Designs to plan for the next round. */
  designs?: number | undefined;
}

export interface ChooseResult {
  round: Round;
  winner: CandidateSlot;
  plan: NextGenerationPlan | null;
  borrowings: Array<{ slot: CandidateSlot; subject: string }>;
}

export async function runChoose(context: CliContext, options: ChooseOptions): Promise<ChooseResult> {
  const logger = context.logger.child({ scope: 'choose' });

  const roundNumber = parseRoundRef(options.roundRef);
  if (roundNumber === null) {
    throw new DesignLabError('ROUND_NOT_FOUND', `"${options.roundRef}" is not a valid round reference`, {
      hint: 'Use a round number such as 1, or an id such as r001.',
    });
  }

  let winner: CandidateSlot;
  try {
    winner = normaliseSlot(options.candidateRef);
  } catch (error) {
    throw new DesignLabError('CANDIDATE_NOT_FOUND', `"${options.candidateRef}" is not a valid candidate`, {
      cause: error,
      hint: 'Candidates are identified by letter: A, B, C, …',
    });
  }

  const projectId = await resolveProjectId(context, options.repo);
  const round = await context.store.requireRound(projectId, roundNumber);
  const feedback = options.feedback ?? '';

  const chosen = chooseWinner({ round, winner, feedback });
  const updatedRound = await context.store.writeRound(chosen.round);

  const lineage = await context.store.readLineage(projectId);
  await context.store.writeLineage(appendLineage(lineage, chosen.lineageEntry));

  logger.info('winner recorded', {
    round: roundNumber,
    winner,
    branch: chosen.winnerCandidate.branch,
    headSha: chosen.winnerCandidate.headSha ? shortSha(chosen.winnerCandidate.headSha) : null,
  });

  const references = parseFeedbackReferences(
    feedback,
    round.candidates.map((candidate) => candidate.slot),
  );

  if (options.noPlan) {
    return { round: updatedRound, winner, plan: null, borrowings: references.borrowings };
  }

  const briefs = await context.store.readBriefs(projectId, roundNumber);
  const target = await resolveTarget({ context, repo: options.repo, refresh: false });
  const runner = context.createRunner({ projectId, round: roundNumber });

  const plan = await planNextGeneration({
    runner,
    round: updatedRound,
    winner,
    winnerBranch: chosen.winnerCandidate.branch,
    feedback,
    briefs,
    lineage: await context.store.readLineage(projectId),
    repoDir: target.repoDir,
    designCount: options.designs ?? Math.max(2, round.candidates.length),
    timeoutMs: context.config.limits.leadTimeoutMs,
    logger,
  });

  await context.store.writeNextGenerationPlan(plan);
  logger.info('next-generation plan saved', { nextRound: plan.round, directions: plan.directions.length });

  return { round: updatedRound, winner, plan, borrowings: references.borrowings };
}

export function formatChooseResult(result: ChooseResult): string {
  const winnerCandidate = result.round.candidates.find((candidate) => candidate.slot === result.winner);

  const lines = [
    `Round ${result.round.round}: candidate ${result.winner} (${winnerCandidate?.name ?? 'unknown'}) is the winner.`,
    '',
    `  branch: ${winnerCandidate?.branch ?? 'unknown'}`,
    `  commit: ${winnerCandidate?.headSha ? shortSha(winnerCandidate.headSha) : 'unknown'}`,
  ];

  if (result.round.feedback) {
    lines.push('', `  feedback: ${result.round.feedback}`);
  }

  if (result.borrowings.length > 0) {
    lines.push(
      '',
      'Borrowings parsed from your feedback:',
      ...result.borrowings.map((borrowing) => `  - ${borrowing.subject} from candidate ${borrowing.slot}`),
    );
  }

  if (!result.plan) {
    lines.push('', 'Next-generation planning was skipped.');
    return lines.join('\n');
  }

  lines.push(
    '',
    `Plan for round ${result.plan.round} (starting from ${result.plan.parentBranch}):`,
    '',
    result.plan.reasoning,
    '',
  );

  for (const direction of result.plan.directions) {
    lines.push(
      `  ${direction.name}  [${direction.riskLevel}]`,
      `    ${direction.thesis}`,
      `    relation: ${direction.relation}` +
        (direction.borrowsFrom.length > 0 ? `  borrows from ${direction.borrowsFrom.join(', ')}` : ''),
    );
  }

  lines.push('', `Next: designlab round --designs ${result.plan.directions.length}`);
  return lines.join('\n');
}
