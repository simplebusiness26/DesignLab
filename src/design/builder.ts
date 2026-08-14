/**
 * Candidate builder.
 *
 * Drives one design brief from an empty worktree to a verified, committed
 * branch. The escalation ladder is the interesting part:
 *
 *   Sonnet implements → gates run → Sonnet retries with the failure output →
 *   (only if it fails again) Opus diagnoses → Sonnet applies the diagnosis
 *
 * Opus is never invoked speculatively, and never for a first failure. Retry
 * and escalation ceilings are hard limits, so a pathological design cannot
 * consume unbounded budget.
 */

import { relative } from 'node:path';

import type { AgentResponse, AgentRunner } from '../agents/types.js';
import {
  BUILDER_SYSTEM_PROMPT,
  REVIEWER_SYSTEM_PROMPT,
  renderBriefContext,
  renderContractContext,
  renderManifestContext,
} from '../agents/prompts.js';
import type { Limits } from '../config/config.js';
import type { Logger } from '../core/logger.js';
import { nullLogger } from '../core/logger.js';
import {
  builderReportSchema,
  escalationVerdictSchema,
  type AppManifest,
  type BuilderReport,
  type Candidate,
  type DesignBrief,
  type FunctionalityContract,
  type GateResult,
} from '../core/schemas.js';
import type { GitClient } from '../git/git-client.js';
import type { WorktreeLease } from '../git/worktree-manager.js';
import type { ProtectionChecker } from '../protection/checker.js';
import { buildFailureFeedback, didAllRequiredGatesPass, runGates, type GateCommands } from '../testing/gates.js';

export interface BuildCandidateOptions {
  runner: AgentRunner;
  brief: DesignBrief;
  lease: WorktreeLease;
  manifest: AppManifest;
  contract: FunctionalityContract;
  checker: ProtectionChecker;
  git: GitClient;
  commands: GateCommands;
  limits: Limits;
  logger?: Logger;
  /** Records the builder transcript for later inspection. */
  onTranscript?: (filename: string, contents: string) => Promise<void>;
}

export interface BuildCandidateResult {
  status: Candidate['status'];
  gates: GateResult[];
  protection: Candidate['protection'];
  headSha: string | null;
  filesChanged: number;
  attempts: number;
  escalations: number;
  report: BuilderReport | null;
  failure: string | null;
}

export async function buildCandidate(options: BuildCandidateOptions): Promise<BuildCandidateResult> {
  const logger = (options.logger ?? nullLogger).child({
    scope: 'builder',
    round: options.brief.round,
    slot: options.brief.slot,
  });

  const worktreeGit = options.git.withCwd(options.lease.path);
  let attempts = 0;
  let escalations = 0;
  let report: BuilderReport | null = null;
  let lastFailure: string | null = null;
  let escalationGuidance: string | null = null;

  while (attempts < options.limits.builderAttempts) {
    attempts += 1;
    const isRetry = attempts > 1;

    const prompt: string = isRetry
      ? buildRetryPrompt(options, lastFailure ?? '', escalationGuidance)
      : buildImplementPrompt(options);

    // The explicit annotation short-circuits inference through the runner's
    // generic, which TypeScript otherwise reports as circular here.
    const response: AgentResponse<BuilderReport> = await options.runner.run({
      role: 'builder',
      operation: isRetry ? 'revise-design' : 'implement-design',
      prompt,
      systemPrompt: BUILDER_SYSTEM_PROMPT,
      cwd: options.lease.path,
      outputSchema: builderReportSchema,
      toolPolicy: {
        allowed: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
        denied: ['WebFetch', 'WebSearch'],
      },
      timeoutMs: options.limits.builderTimeoutMs,
      ...(options.limits.maxBudgetUsdPerAgent !== null
        ? { maxBudgetUsd: options.limits.maxBudgetUsdPerAgent }
        : {}),
      ledger: {
        projectId: options.brief.projectId,
        round: options.brief.round,
        slot: options.brief.slot,
      },
    });

    await options.onTranscript?.(`attempt-${attempts}.json`, JSON.stringify(
      { operation: response.operation, ok: response.ok, error: response.error, data: response.data },
      null,
      2,
    ));

    if (!response.ok) {
      lastFailure = `The builder agent failed: ${response.error ?? 'unknown error'}`;
      logger.warn('builder invocation failed', { attempt: attempts, error: response.error });
      continue;
    }

    report = response.data ?? report;

    // Commit whatever the builder produced. Committing before gating means the
    // protection check runs against a real commit range, and a failed candidate
    // still leaves an inspectable branch.
    await worktreeGit.stageAll();
    const committed = await worktreeGit.commit(
      `design(${options.brief.slot.toLowerCase()}): ${options.brief.name}\n\n${options.brief.thesis}\n\nDesignLab round ${options.brief.round}, attempt ${attempts}.`,
    );

    const headSha = committed ?? (await worktreeGit.headSha());
    const changes = await options.git.changedFiles(options.lease.baseSha, headSha, options.lease.path);

    if (changes.length === 0) {
      lastFailure = 'The builder produced no changes at all. The design brief must result in visible code changes.';
      logger.warn('builder produced no changes', { attempt: attempts });
      continue;
    }

    const gateRun = await runGates({
      cwd: options.lease.path,
      commands: options.commands,
      git: options.git,
      checker: options.checker,
      baseSha: options.lease.baseSha,
      headSha,
      timeoutMs: options.limits.gateTimeoutMs,
      logger,
    });

    if (gateRun.passed && didAllRequiredGatesPass(gateRun.results)) {
      logger.info('candidate passed all gates', { attempt: attempts, filesChanged: changes.length });
      return {
        status: 'review-pending',
        gates: gateRun.results,
        protection: gateRun.protection,
        headSha,
        filesChanged: changes.length,
        attempts,
        escalations,
        report,
        failure: null,
      };
    }

    lastFailure = buildFailureFeedback(gateRun.results) || `The ${gateRun.failedGate ?? 'verification'} gate failed.`;
    logger.warn('candidate failed gates', { attempt: attempts, failedGate: gateRun.failedGate });

    const isLastAttempt = attempts >= options.limits.builderAttempts;

    // Escalate only when a retry has already been spent and one remains.
    const shouldEscalate =
      !isLastAttempt &&
      attempts >= 2 &&
      escalations < options.limits.escalations &&
      gateRun.failedGate !== 'protection';

    if (shouldEscalate) {
      escalations += 1;
      logger.info('escalating to the engineering reviewer', { attempt: attempts, escalation: escalations });
      escalationGuidance = await escalate(options, {
        failure: lastFailure,
        headSha,
        logger,
      });
    } else {
      escalationGuidance = null;
    }

    if (isLastAttempt) {
      return {
        status: gateRun.failedGate === 'protection' ? 'rejected' : 'gates-failed',
        gates: gateRun.results,
        protection: gateRun.protection,
        headSha,
        filesChanged: changes.length,
        attempts,
        escalations,
        report,
        failure: summariseFailureForCandidate(gateRun.failedGate, lastFailure),
      };
    }
  }

  return {
    status: 'failed',
    gates: [],
    protection: null,
    headSha: null,
    filesChanged: 0,
    attempts,
    escalations,
    report,
    failure: lastFailure ?? 'The builder did not produce a usable implementation.',
  };
}

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

async function escalate(
  options: BuildCandidateOptions,
  context: { failure: string; headSha: string; logger: Logger },
): Promise<string | null> {
  const diff = await options.git
    .diffStat(options.lease.baseSha, context.headSha, options.lease.path)
    .catch(() => '');

  const response = await options.runner.run({
    role: 'reviewer',
    operation: 'escalate-failure',
    prompt: [
      'A UI builder has failed twice to get a design implementation through verification.',
      'Diagnose the actual root cause and return precise instructions for the smallest correct fix.',
      '',
      '## The design being implemented',
      '',
      renderBriefContext(options.brief),
      '',
      '## What must not change',
      '',
      renderContractContext(options.contract),
      '',
      '## Change summary',
      '',
      '```',
      diff.slice(0, 4000) || '(no diff available)',
      '```',
      '',
      '## Verification failure',
      '',
      context.failure.slice(0, 8000),
      '',
      'Read the relevant files before concluding. Do not modify anything — return a diagnosis only.',
    ].join('\n'),
    systemPrompt: REVIEWER_SYSTEM_PROMPT,
    cwd: options.lease.path,
    outputSchema: escalationVerdictSchema,
    toolPolicy: { allowed: ['Read', 'Glob', 'Grep', 'Bash'], denied: ['Edit', 'Write', 'NotebookEdit'] },
    timeoutMs: options.limits.leadTimeoutMs,
    ...(options.limits.maxBudgetUsdPerAgent !== null
      ? { maxBudgetUsd: options.limits.maxBudgetUsdPerAgent }
      : {}),
    ledger: { projectId: options.brief.projectId, round: options.brief.round, slot: options.brief.slot },
  });

  await options.onTranscript?.('escalation.json', JSON.stringify(
    { ok: response.ok, error: response.error, data: response.data },
    null,
    2,
  ));

  if (!response.ok || !response.data) {
    context.logger.warn('escalation produced no verdict', { error: response.error });
    return null;
  }

  const verdict = response.data;
  if (!verdict.recoverable) {
    context.logger.warn('reviewer judged the failure unrecoverable', { diagnosis: verdict.diagnosis });
  }

  return [
    '## Engineering review of your previous failure',
    '',
    `Diagnosis: ${verdict.diagnosis}`,
    verdict.rootCause ? `Root cause: ${verdict.rootCause}` : '',
    verdict.suspectPaths.length > 0 ? `Files to inspect: ${verdict.suspectPaths.join(', ')}` : '',
    '',
    'Apply exactly these instructions:',
    ...verdict.instructions.map((instruction, index) => `${index + 1}. ${instruction}`),
    verdict.riskNotes ? `\nRisk note: ${verdict.riskNotes}` : '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

/**
 * The builder's context is deliberately narrow: its brief, the contract, the
 * app manifest, and its commands. It never receives the other candidates'
 * briefs, the round strategy, or the orchestrator's conversation — that
 * context would cost tokens and invite cross-contamination between designs.
 */
function buildImplementPrompt(options: BuildCandidateOptions): string {
  const { brief, manifest, contract, lease, commands } = options;

  return [
    `Implement design ${brief.slot} for round ${brief.round} of a UI experiment.`,
    '',
    `You are working in an isolated Git worktree at ${lease.path}, on branch \`${lease.branch}\`, ` +
      `which starts from commit ${lease.baseSha.slice(0, 8)}. Everything you change must be inside that directory.`,
    '',
    '## Your design brief',
    '',
    renderBriefContext(brief),
    '',
    '## The application you are redesigning',
    '',
    renderManifestContext(manifest, { detailed: true }),
    '',
    '## Functionality contract — non-negotiable',
    '',
    renderContractContext(contract),
    '',
    '## How your work will be judged',
    '',
    'After you finish, DesignLab runs these checks automatically:',
    `- typecheck: ${commands.typecheck ?? '(not configured)'}`,
    `- lint: ${commands.lint ?? '(not configured)'}`,
    `- test: ${commands.test ?? '(not configured)'}`,
    '- a deterministic Git diff against the functionality contract',
    '',
    'Run those commands yourself before you finish, and fix anything you broke. ' +
      'A change that touches a PROTECTED path fails automatically, no matter how good the design is.',
    '',
    '## What to do',
    '',
    '1. Read the existing screens, components and theme files first.',
    '2. Implement every directive in the brief, visibly and concretely.',
    '3. Keep behaviour identical: same data, same flows, same outcomes.',
    '4. Run the verification commands and fix ordinary failures.',
    '5. Leave your changes uncommitted — DesignLab commits them for you.',
    '',
    'Then return JSON matching the schema, reporting honestly what you did and anything you could not do.',
  ].join('\n');
}

function buildRetryPrompt(
  options: BuildCandidateOptions,
  failure: string,
  escalationGuidance: string | null,
): string {
  const sections = [
    `Your implementation of design ${options.brief.slot} did not pass verification. Fix it.`,
    '',
    '## What failed',
    '',
    failure.slice(0, 10_000),
  ];

  if (escalationGuidance) {
    sections.push('', escalationGuidance);
  }

  sections.push(
    '',
    '## Reminders',
    '',
    '- Fix the cause, not the symptom. Do not delete, skip or weaken a test.',
    '- Do not touch PROTECTED paths.',
    '- Keep the design brief intact; you are correcting an implementation, not redesigning.',
    '',
    '## The brief you are implementing',
    '',
    renderBriefContext(options.brief),
    '',
    'Re-run the verification commands before you finish, then return JSON matching the schema.',
  );

  return sections.join('\n');
}

function summariseFailureForCandidate(failedGate: string | null, failure: string): string {
  const head = failedGate ? `The ${failedGate} gate failed.` : 'Verification failed.';
  const detail = failure.split('\n').slice(0, 12).join('\n');
  return `${head}\n${detail}`.slice(0, 4000);
}

/** Repository-relative path, for logging a worker's scope. */
export function relativeToWorktree(lease: WorktreeLease, path: string): string {
  return relative(lease.path, path) || '.';
}
