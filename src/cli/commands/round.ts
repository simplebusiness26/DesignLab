/**
 * `designlab round`
 *
 * Runs one complete design generation. Reads the cached manifest and contract,
 * determines the base commit (the winner's branch when evolving from a
 * previous round), and hands off to the orchestrator.
 */

import { writeText } from '../../core/fsx.js';
import { join } from 'node:path';

import { DesignLabError } from '../../core/errors.js';
import { MAX_DESIGNS_PER_ROUND, shortSha } from '../../core/ids.js';
import { runRound, type RunRoundResult } from '../../core/orchestrator.js';
import { describeBuildStatus } from '../../builds/build-tracker.js';
import { assertRunnerAvailable } from '../../agents/runner-factory.js';
import type { CliContext } from '../context.js';
import { resolveTarget } from '../context.js';

export interface RoundOptions {
  repo?: string | undefined;
  base?: string | undefined;
  designs?: number | undefined;
  diversity?: 'low' | 'medium' | 'high' | undefined;
  /** Do not push branches even if configuration allows it. */
  noPush?: boolean;
  /** Write the generated Actions workflow into the target's worktrees. */
  writeWorkflow?: boolean;
}

export async function runRoundCommand(context: CliContext, options: RoundOptions): Promise<RunRoundResult> {
  const logger = context.logger.child({ scope: 'round' });

  const designCount = options.designs ?? 4;
  if (!Number.isInteger(designCount) || designCount < 1 || designCount > MAX_DESIGNS_PER_ROUND) {
    throw new DesignLabError('CONFIG_INVALID', `--designs must be between 1 and ${MAX_DESIGNS_PER_ROUND}`, {
      details: { designs: options.designs },
    });
  }

  const target = await resolveTarget({ context, repo: options.repo, branch: options.base, refresh: true });

  const manifest = await context.store.requireManifest(target.projectId);
  const contract = await context.store.requireContract(target.projectId);
  const lineage = await context.store.readLineage(target.projectId);

  if (contract.manifestSha !== manifest.sha) {
    logger.warn('the contract was generated from a different commit than the manifest', {
      contractSha: shortSha(contract.manifestSha),
      manifestSha: shortSha(manifest.sha),
    });
  }

  const roundNumber = await context.store.nextRoundNumber(target.projectId);

  // Evolution: when the previous round has a winner, this round starts from
  // the winner's branch, so design work compounds across generations.
  const previousRound = roundNumber > 1 ? await context.store.readRound(target.projectId, roundNumber - 1) : null;
  const nextGenerationPlan =
    roundNumber > 1 ? await context.store.readNextGenerationPlan(target.projectId, roundNumber - 1) : null;

  let baseBranch = target.branch;
  let baseSha = target.sha;
  let parentRound: number | null = null;
  let parentSlot: RunRoundResult['round']['parentSlot'] = null;

  if (previousRound?.winner && nextGenerationPlan) {
    const winnerCandidate = previousRound.candidates.find(
      (candidate) => candidate.slot === previousRound.winner,
    );
    if (winnerCandidate?.headSha) {
      baseBranch = winnerCandidate.branch;
      baseSha = winnerCandidate.headSha;
      parentRound = previousRound.round;
      parentSlot = previousRound.winner;
      logger.info('evolving from the previous winner', {
        parentRound,
        parentSlot,
        baseBranch,
        baseSha: shortSha(baseSha),
      });
    } else {
      logger.warn('previous winner has no commit; starting from the base branch instead', {
        parentRound: previousRound.round,
      });
    }
  }

  const runner = context.createRunner({ projectId: target.projectId, round: roundNumber });
  if (!context.dryRun) {
    await assertRunnerAvailable(runner, context.config);
  }

  logger.info('starting design round', {
    round: roundNumber,
    designs: designCount,
    baseBranch,
    baseSha: shortSha(baseSha),
    dryRun: context.dryRun,
  });

  const result = await runRound({
    config: context.config,
    store: context.store,
    paths: context.paths,
    runner,
    manifest,
    contract,
    lineage,
    repoDir: target.repoDir,
    baseBranch,
    baseSha,
    designCount,
    diversityTarget: options.diversity ?? 'high',
    roundNumber,
    parentRound,
    parentSlot,
    nextGenerationPlan,
    dryRun: context.dryRun,
    ...(options.noPush !== undefined ? { noPush: options.noPush } : {}),
    logger,
  });

  // The generated workflow is written into each candidate worktree only when
  // explicitly requested: it is a change to the target repository, and the
  // operator should opt into that rather than discover it in a diff.
  if (options.writeWorkflow && result.workflow.strategy === 'generated' && result.workflow.content) {
    for (const candidate of result.round.candidates) {
      if (!candidate.worktreePath || !result.workflow.path) continue;
      await writeText(join(candidate.worktreePath, result.workflow.path), result.workflow.content);
    }
    logger.info('build workflow written into candidate worktrees', { path: result.workflow.path });
  }

  return result;
}

export function formatRoundResult(result: RunRoundResult, dryRun: boolean): string {
  const { round, workflow } = result;

  const lines = [
    `Round ${round.round} complete${dryRun ? ' (dry run — no model calls, no pushes)' : ''}.`,
    '',
    `  base:      ${round.baseBranch} @ ${shortSha(round.baseSha)}`,
    `  strategy:  ${round.strategy || '(none recorded)'}`,
    `  diversity: ${result.diversityScore.toFixed(3)}${result.belowDiversityTarget ? '  ⚠ below target' : ''}`,
    '',
    'Candidates:',
  ];

  for (const candidate of round.candidates) {
    const gates = candidate.gates
      .map((gate) => `${gate.gate}:${gate.status === 'passed' ? 'ok' : gate.status}`)
      .join(' ');
    const review = candidate.review ? ` review:${candidate.review.verdict}` : '';
    lines.push(
      `  ${candidate.slot}  ${candidate.name}`,
      `      branch:  ${candidate.branch}`,
      `      status:  ${candidate.status}${review}`,
      `      changed: ${candidate.filesChanged} file(s), ${candidate.attempts} attempt(s)` +
        (candidate.escalations > 0 ? `, ${candidate.escalations} escalation(s)` : ''),
      gates ? `      gates:   ${gates}` : '',
      `      build:   ${describeBuildStatus(candidate.build.status)}` +
        (candidate.build.artifactName ? ` → ${candidate.build.artifactName}` : ''),
      candidate.failure ? `      failure: ${candidate.failure.split('\n')[0]}` : '',
    );
  }

  lines.push(
    '',
    `Build pipeline: ${workflow.strategy} — ${workflow.reason}`,
  );

  if (workflow.requirements.length > 0) {
    lines.push('', 'Before APKs can build you must:', ...workflow.requirements.map((item) => `  - ${item}`));
  }

  const ready = round.candidates.filter(
    (candidate) => candidate.status === 'ready' || candidate.status === 'pushed',
  );

  lines.push(
    '',
    ready.length > 0
      ? `Next: review the ${ready.length} successful design(s), then: designlab choose ${round.round} <SLOT> --feedback '…'`
      : 'No candidate reached a successful state. Inspect the failures above, then re-run.',
  );

  return lines.filter((line) => line !== '').join('\n');
}
