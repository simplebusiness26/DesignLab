/**
 * `designlab status`
 *
 * Reports what actually exists: inspected commit, contract size, every round,
 * every candidate, honest gate and build state, and usage totals.
 *
 * When `--refresh` is passed and a GitHub token is available, build state is
 * re-read from the Actions API. Without that, statuses are reported as last
 * recorded rather than optimistically advanced.
 */

import { describeBuildStatus, GitHubActionsClient, parseGitHubRepo, refreshBuildStatus } from '../../builds/build-tracker.js';
import { shortSha } from '../../core/ids.js';
import { overallScore } from '../../design/reviewer.js';
import type { AppManifest, FunctionalityContract, Round, UsageEvent } from '../../core/schemas.js';
import type { CliContext } from '../context.js';
import { resolveProjectId } from '../context.js';

export interface StatusOptions {
  repo?: string | undefined;
  round?: number | undefined;
  /** Re-read build state from the GitHub Actions API. */
  refresh?: boolean;
}

export interface StatusResult {
  projectId: string;
  manifest: AppManifest | null;
  contract: FunctionalityContract | null;
  rounds: Round[];
  usage: UsageSummary;
  buildRefreshError: string | null;
}

export interface UsageSummary {
  totalCalls: number;
  byRole: Record<string, number>;
  byModel: Record<string, number>;
  cacheHits: number;
  totalCostUsd: number | null;
  failures: number;
}

export async function runStatus(context: CliContext, options: StatusOptions): Promise<StatusResult> {
  const projectId = await resolveProjectId(context, options.repo);

  const manifest = await context.store.readLatestManifest(projectId);
  const contract = await context.store.readContract(projectId);

  const roundNumbers = options.round
    ? [options.round]
    : await context.store.listRoundNumbers(projectId);

  const rounds: Round[] = [];
  for (const number of roundNumbers) {
    const round = await context.store.readRound(projectId, number);
    if (round) rounds.push(round);
  }

  let buildRefreshError: string | null = null;

  if (options.refresh && manifest) {
    const repoRef = parseGitHubRepo(manifest.repoUrl);
    const token = process.env['GITHUB_TOKEN'] ?? process.env['GH_TOKEN'];

    if (!repoRef) {
      buildRefreshError = 'The target repository is not on GitHub, so Actions build state cannot be read.';
    } else if (!token) {
      buildRefreshError = 'No GITHUB_TOKEN in the environment, so Actions build state cannot be read.';
    } else {
      const client = new GitHubActionsClient(token);
      for (const round of rounds) {
        let changed = false;
        for (const candidate of round.candidates) {
          if (!candidate.pushed) continue;
          const updated = await refreshBuildStatus({
            client,
            repo: repoRef,
            branch: candidate.branch,
            // Engine commits (workflow, identity) sit above the design head;
            // the run GitHub reports is for the pushed tip.
            headSha: candidate.pushedSha ?? candidate.headSha,
            current: candidate.build,
            releaseSigned: context.config.build.releaseSigned,
            logger: context.logger,
          });
          if (updated.status !== candidate.build.status || updated.artifactUrl !== candidate.build.artifactUrl) {
            changed = true;
          }
          candidate.build = updated;
        }
        if (changed) await context.store.writeRound(round);
      }
    }
  }

  return {
    projectId,
    manifest,
    contract,
    rounds,
    usage: summariseUsage(await context.store.readUsage(), projectId),
    buildRefreshError,
  };
}

export function summariseUsage(events: readonly UsageEvent[], projectId?: string): UsageSummary {
  const scoped = projectId ? events.filter((event) => event.projectId === projectId || !event.projectId) : events;

  const byRole: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  let cacheHits = 0;
  let failures = 0;
  let cost = 0;
  let sawCost = false;

  for (const event of scoped) {
    if (event.cacheHit) {
      cacheHits += 1;
      continue;
    }
    byRole[event.role] = (byRole[event.role] ?? 0) + 1;
    byModel[event.model] = (byModel[event.model] ?? 0) + 1;
    if (!event.ok) failures += 1;
    if (typeof event.costUsd === 'number') {
      cost += event.costUsd;
      sawCost = true;
    }
  }

  return {
    totalCalls: scoped.filter((event) => !event.cacheHit).length,
    byRole,
    byModel,
    cacheHits,
    totalCostUsd: sawCost ? Math.round(cost * 10_000) / 10_000 : null,
    failures,
  };
}

export function formatStatus(result: StatusResult): string {
  const lines: string[] = [];

  if (!result.manifest) {
    return `No manifest for project ${result.projectId}. Run "designlab inspect --repo <url>" first.`;
  }

  const manifest = result.manifest;
  lines.push(
    `${manifest.appName}  (${result.projectId})`,
    `  repo:     ${manifest.repoUrl}`,
    `  analysed: ${manifest.branch} @ ${shortSha(manifest.sha)} (${manifest.analysisMode})`,
    `  contract: ${result.contract ? `${result.contract.rules.length} rules, ${result.contract.invariants.length} invariants` : 'MISSING — re-run inspect'}`,
    '',
  );

  if (result.rounds.length === 0) {
    lines.push('No rounds yet. Run "designlab round --designs 4".');
    return lines.join('\n');
  }

  for (const round of result.rounds) {
    const winner = round.winner ? `  winner: ${round.winner}` : '';
    lines.push(
      `Round ${round.round}  [${round.status}]${round.dryRun ? ' (dry run)' : ''}${winner}`,
      `  base:      ${round.baseBranch} @ ${shortSha(round.baseSha)}` +
        (round.parentRound ? `  ← evolved from round ${round.parentRound}${round.parentSlot ?? ''}` : ''),
      `  diversity: ${round.diversityScore !== null ? round.diversityScore.toFixed(3) : 'n/a'}`,
    );

    for (const candidate of round.candidates) {
      const marker = round.winner === candidate.slot ? '★' : ' ';
      const score = candidate.review ? ` score=${overallScore(candidate.review).toFixed(1)}` : '';
      lines.push(
        `   ${marker} ${candidate.slot}  ${candidate.name.padEnd(24).slice(0, 24)}  ${candidate.status.padEnd(15)}` +
          `${describeBuildStatus(candidate.build.status)}${score}`,
      );
      lines.push(`        ${candidate.branch}`);
      if (candidate.build.artifactUrl) {
        lines.push(`        artifact: ${candidate.build.artifactName}`);
      }
      if (candidate.build.status === 'BUILD_SUCCESS') {
        lines.push(`        install:  ${candidate.build.installability}`);
      }
      if (candidate.build.workflowRunUrl) {
        lines.push(`        run:      ${candidate.build.workflowRunUrl}`);
      }
      if (candidate.failure) {
        lines.push(`        failure:  ${candidate.failure.split('\n')[0]}`);
      }
    }

    if (round.feedback) lines.push(`  feedback:  ${round.feedback}`);
    lines.push('');
  }

  const usage = result.usage;
  lines.push(
    'Usage:',
    `  agent calls: ${usage.totalCalls}${usage.failures > 0 ? ` (${usage.failures} failed)` : ''}`,
    `  by role:     ${formatCounts(usage.byRole)}`,
    `  by model:    ${formatCounts(usage.byModel)}`,
    `  cache hits:  ${usage.cacheHits}`,
    usage.totalCostUsd !== null ? `  cost:        $${usage.totalCostUsd.toFixed(4)}` : '  cost:        not reported by the backend',
  );

  if (result.buildRefreshError) {
    lines.push('', `Build refresh skipped: ${result.buildRefreshError}`);
  }

  return lines.join('\n');
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length > 0 ? entries.map(([key, value]) => `${key}=${value}`).join(' ') : '(none)';
}
