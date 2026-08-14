/**
 * Round orchestrator.
 *
 * Runs a complete design generation:
 *
 *   plan (Fable) → isolate (git worktrees) → implement (Sonnet, in parallel)
 *   → gate (deterministic) → review (Fable) → revise → push → build
 *
 * Concurrency is bounded by config, and every candidate is fully independent:
 * one candidate failing never aborts its siblings, because a round that
 * returns three good designs is far more useful than one that returns none.
 */

import type { DesignLabConfig } from '../config/config.js';
import type { AgentRunner } from '../agents/types.js';
import { buildCandidate } from '../design/builder.js';
import { planRound } from '../design/planner.js';
import { interpretReference, type ReferencePack } from '../design/reference.js';
import { defaultCaptureAdapter, type ScreenCaptureAdapter } from '../design/capture.js';
import { buildRevisionPrompt, reviewCandidate } from '../design/reviewer.js';
import {
  notRequestedBuild,
  pendingBuild,
  unsupportedBuild,
} from '../builds/build-tracker.js';
import { planWorkflow, type WorkflowPlan } from '../builds/workflow-generator.js';
import { extractForeignRegistryPrefixes } from '../builds/lockfile-registry.js';
import { applyCandidateIdentity, PLUMBING_COMMIT_MARKER } from '../builds/candidate-identity.js';
import { GitClient } from '../git/git-client.js';
import { assertPushSafe, WorktreeManager, type WorktreeLease } from '../git/worktree-manager.js';
import { ProtectionChecker } from '../protection/checker.js';
import { BUILDER_SYSTEM_PROMPT } from '../agents/prompts.js';
import { builderReportSchema } from './schemas.js';
import { apkArtifactName, designBranchName, worktreeDirName } from './ids.js';
import type { Logger } from './logger.js';
import { nullLogger } from './logger.js';
import type { DesignLabPaths } from './paths.js';
import type { Store } from './store.js';
import { didAllRequiredGatesPass, runGates, type GateCommands } from '../testing/gates.js';
import { readTextBounded, writeText } from './fsx.js';
import { join } from 'node:path';
import type {
  AppManifest,
  Candidate,
  DesignBrief,
  FunctionalityContract,
  Lineage,
  NextGenerationPlan,
  Round,
} from './schemas.js';

export interface RunRoundOptions {
  config: DesignLabConfig;
  store: Store;
  paths: DesignLabPaths;
  runner: AgentRunner;
  manifest: AppManifest;
  contract: FunctionalityContract;
  lineage: Lineage;
  /** Primary clone of the target repository. */
  repoDir: string;
  baseBranch: string;
  baseSha: string;
  designCount: number;
  diversityTarget: 'low' | 'medium' | 'high';
  roundNumber: number;
  parentRound?: number | null;
  parentSlot?: Candidate['slot'] | null;
  nextGenerationPlan?: NextGenerationPlan | null;
  dryRun: boolean;
  /** Skip pushing branches even when config allows it. */
  noPush?: boolean;
  /** Commit the generated workflow onto candidate branches even without pushing. */
  writeWorkflow?: boolean;
  /** User-supplied reference mockups that become the slot-A candidate. */
  reference?: ReferencePack | null;
  /** Screen capture adapter; the default honestly reports "unsupported". */
  captureAdapter?: ScreenCaptureAdapter;
  logger?: Logger;
}

export interface RunRoundResult {
  round: Round;
  briefs: DesignBrief[];
  workflow: WorkflowPlan;
  diversityScore: number;
  belowDiversityTarget: boolean;
}

export async function runRound(options: RunRoundOptions): Promise<RunRoundResult> {
  const logger = (options.logger ?? nullLogger).child({ scope: 'round', round: options.roundNumber });
  const git = new GitClient({ cwd: options.repoDir, logger });

  const worktrees = new WorktreeManager({
    git,
    worktreesRoot: options.paths.worktreesDir(options.manifest.projectId),
    logger,
    protectedBranches: [options.baseBranch, 'main', 'master'],
  });

  // ---- 1. Plan -----------------------------------------------------------

  logger.info('planning design directions', {
    designs: options.designCount,
    diversity: options.diversityTarget,
  });

  // A reference pack becomes the slot-A candidate before Fable plans its
  // explorations, so the explorations can be steered — and scored — away
  // from the position the reference already occupies.
  let referenceBrief: DesignBrief | null = null;
  if (options.reference) {
    referenceBrief = await interpretReference({
      runner: options.runner,
      pack: options.reference,
      manifest: options.manifest,
      contract: options.contract,
      repoDir: options.repoDir,
      round: options.roundNumber,
      timeoutMs: options.config.limits.leadTimeoutMs,
      logger,
    });
    logger.info('reference candidate interpreted', {
      slot: 'A',
      slug: referenceBrief.slug,
      images: referenceBrief.referenceImages.length,
    });
  }

  const planResult = await planRound({
    runner: options.runner,
    manifest: options.manifest,
    contract: options.contract,
    repoDir: options.repoDir,
    round: options.roundNumber,
    designCount: options.designCount,
    diversityTarget: options.diversityTarget,
    minDiversityScore: options.config.limits.minDiversityScore,
    maxRetries: options.config.limits.diversityRetries,
    timeoutMs: options.config.limits.leadTimeoutMs,
    logger,
    nextGenerationPlan: options.nextGenerationPlan ?? null,
    lineage: options.lineage,
    referenceBrief,
    semanticJudge: options.config.design.semanticDiversityJudge,
  });

  // From here on, the reference candidate is one more brief in the round —
  // same worktree, same builder, same gates, same review.
  const allBriefs: DesignBrief[] = [...(referenceBrief ? [referenceBrief] : []), ...planResult.briefs];

  for (const brief of allBriefs) {
    await options.store.writeBrief(brief);
  }

  logger.info('design directions planned', {
    designs: allBriefs.map((brief) => `${brief.slot}:${brief.slug}${brief.origin === 'REFERENCE_IMAGE' ? ' (reference)' : ''}`).join(' '),
    diversity: planResult.diversity.score,
    attempts: planResult.attempts,
  });

  // ---- 2. Build the round record ----------------------------------------

  // Lockfiles written inside sandboxed IDEs can pin tarballs to a mirror
  // that exists nowhere else; detect that here (deterministic file read) so
  // the generated workflow can repair it in CI without touching the
  // protected lockfile.
  const lockText = await readTextBounded(join(options.repoDir, 'package-lock.json'), 16 * 1024 * 1024);
  const lockfileForeignRegistries = lockText ? extractForeignRegistryPrefixes(lockText) : [];
  if (lockfileForeignRegistries.length > 0) {
    logger.warn('lockfile pins tarballs to foreign registry hosts; CI will normalise them', {
      prefixes: lockfileForeignRegistries.join(' '),
    });
  }

  const workflow = planWorkflow({
    manifest: options.manifest,
    branchPrefix: options.config.branchPrefix,
    reuseExisting: options.config.build.reuseExistingWorkflow,
    generate: options.config.build.generateWorkflow,
    workflowPath: options.config.build.workflowPath,
    variant: options.config.build.variant,
    lockfileForeignRegistries,
  });

  /*
   * `candidates` is the single mutable source of truth for the rest of the
   * round, and persisting must never replace it. Builders run concurrently
   * and hold references into this array; rebinding it to a freshly validated
   * copy returned by the store would orphan a builder mid-flight and silently
   * discard its result. `persist()` therefore writes a snapshot and leaves the
   * working array alone.
   */
  const candidates: Candidate[] = allBriefs.map((brief) =>
    initialCandidate(brief, options.baseSha, options.config.branchPrefix),
  );

  const roundMeta = {
    schemaVersion: 1 as const,
    projectId: options.manifest.projectId,
    round: options.roundNumber,
    parentRound: options.parentRound ?? null,
    parentSlot: options.parentSlot ?? null,
    baseBranch: options.baseBranch,
    baseSha: options.baseSha,
    manifestSha: options.manifest.sha,
    strategy: planResult.plan.strategy,
    diversityTarget: options.diversityTarget,
    diversityScore: planResult.diversity.score,
    winner: null,
    feedback: null,
    dryRun: options.dryRun,
    createdAt: new Date().toISOString(),
  };

  let roundStatus: Round['status'] = 'planned';
  const persist = async (): Promise<Round> =>
    options.store.writeRound({
      ...roundMeta,
      status: roundStatus,
      candidates,
      updatedAt: new Date().toISOString(),
    });

  await persist();

  // ---- 3. Create isolated worktrees --------------------------------------

  await worktrees.reconcile();
  const leases = new Map<string, WorktreeLease>();

  for (const candidate of candidates) {
    const brief = allBriefs.find((entry) => entry.slot === candidate.slot);
    if (!brief) continue;
    const lease = await worktrees.create({
      name: worktreeDirName(options.roundNumber, candidate.slot, brief.slug),
      branch: candidate.branch,
      baseSha: options.baseSha,
      force: true,
    });
    leases.set(candidate.slot, lease);
    candidate.worktreePath = lease.path;
    candidate.status = 'worktree-ready';
  }

  roundStatus = 'implementing';
  await persist();

  // Every candidate starts from the same commit; verify rather than assume.
  const distinctBases = new Set([...leases.values()].map((lease) => lease.baseSha));
  if (distinctBases.size > 1) {
    logger.error('candidates do not share a base commit', { bases: [...distinctBases] });
  }

  // ---- 4. Implement in parallel ------------------------------------------

  const checker = new ProtectionChecker(options.contract, options.config.protection);
  const commands: GateCommands = {
    install: options.manifest.commands.install,
    typecheck: options.manifest.commands.typecheck,
    lint: options.manifest.commands.lint,
    test: options.manifest.commands.test,
    build: options.manifest.commands.build,
  };

  await mapWithConcurrency(candidates, options.config.limits.concurrency, async (candidate) => {
    const brief = allBriefs.find((entry) => entry.slot === candidate.slot);
    const lease = leases.get(candidate.slot);
    if (!brief || !lease) {
      candidate.status = 'failed';
      candidate.failure = 'No worktree was created for this candidate.';
      return;
    }

    try {
      await worktrees.verifyLease(lease);
      candidate.status = 'implementing';

      const result = await buildCandidate({
        runner: options.runner,
        brief,
        lease,
        manifest: options.manifest,
        contract: options.contract,
        checker,
        git,
        commands,
        limits: options.config.limits,
        logger,
        onTranscript: async (filename, contents) => {
          await options.store.writeCandidateLog(
            options.manifest.projectId,
            options.roundNumber,
            candidate.slot,
            filename,
            contents,
          );
        },
      });

      candidate.status = result.status;
      candidate.gates = result.gates;
      candidate.protection = result.protection;
      candidate.headSha = result.headSha;
      candidate.filesChanged = result.filesChanged;
      candidate.attempts = result.attempts;
      candidate.escalations = result.escalations;
      candidate.failure = result.failure;
      candidate.updatedAt = new Date().toISOString();
    } catch (error) {
      candidate.status = 'failed';
      candidate.failure = error instanceof Error ? error.message : String(error);
      candidate.updatedAt = new Date().toISOString();
      logger.errorFrom('candidate failed with an unexpected error', error, { slot: candidate.slot });
    }

    // Persist after every candidate so a crash mid-round loses at most one.
    await persist();
  });

  // ---- 5. Design review ---------------------------------------------------

  roundStatus = 'reviewing';
  await persist();

  const captureAdapter = options.captureAdapter ?? defaultCaptureAdapter;

  for (const candidate of candidates) {
    if (candidate.status !== 'review-pending') continue;

    const brief = allBriefs.find((entry) => entry.slot === candidate.slot);
    const lease = leases.get(candidate.slot);
    if (!brief || !lease || !candidate.headSha) continue;

    // Capture renders when an adapter supports the stack; record the honest
    // outcome either way so "review saw no screenshots" is a stated fact.
    if (captureAdapter.supports(options.manifest)) {
      const capture = await captureAdapter
        .capture({
          lease,
          manifest: options.manifest,
          targetScreens: brief.targetScreens,
          outputDir: options.paths.candidateLogDir(options.manifest.projectId, options.roundNumber, candidate.slot),
        })
        .catch((error: unknown) => ({
          status: 'failed' as const,
          images: [],
          reason: error instanceof Error ? error.message : String(error),
        }));
      candidate.captures = capture.images;
      candidate.captureStatus = capture.status;
    } else {
      candidate.captures = [];
      candidate.captureStatus = 'unsupported';
    }

    const review = await reviewCandidate({
      runner: options.runner,
      brief,
      worktreePath: lease.path,
      baseSha: options.baseSha,
      headSha: candidate.headSha,
      git,
      siblingBriefs: allBriefs,
      captures: candidate.captures,
      timeoutMs: options.config.limits.leadTimeoutMs,
      maxBudgetUsd: options.config.limits.maxBudgetUsdPerAgent,
      logger,
    });

    candidate.review = review;

    if (!review) {
      // A missing review is not a rejection; the engineering gates already
      // passed, so the candidate is usable and the gap is recorded.
      candidate.status = 'ready';
      candidate.failure = null;
      continue;
    }

    if (review.verdict === 'accept') {
      candidate.status = 'ready';
      continue;
    }

    if (review.verdict === 'reject') {
      candidate.status = 'rejected';
      candidate.failure = `Design review rejected this candidate: ${review.summary}`;
      continue;
    }

    // "revise" — return the candidate to its own builder with corrections.
    candidate.status = 'revising';
    await persist();

    const revised = await reviseCandidate({
      runner: options.runner,
      brief,
      lease,
      git,
      checker,
      commands,
      config: options.config,
      review,
      logger,
    });

    candidate.attempts += 1;
    candidate.gates = revised.gates.length > 0 ? revised.gates : candidate.gates;
    candidate.protection = revised.protection ?? candidate.protection;
    candidate.headSha = revised.headSha ?? candidate.headSha;
    candidate.filesChanged = revised.filesChanged || candidate.filesChanged;

    if (revised.passed) {
      candidate.status = 'ready';
      candidate.failure = null;
    } else {
      candidate.status = 'gates-failed';
      candidate.failure = revised.failure ?? 'The revision did not pass verification.';
    }
  }

  await persist();

  // ---- 6. Push and set up builds -----------------------------------------

  const shouldPush = options.config.build.pushBranches && !options.dryRun && !options.noPush;

  for (const candidate of candidates) {
    if (candidate.status !== 'ready') {
      candidate.build = notRequestedBuild(`Candidate status is "${candidate.status}"; no build was requested.`);
      continue;
    }

    const brief = allBriefs.find((entry) => entry.slot === candidate.slot);
    const lease = leases.get(candidate.slot);
    const artifactName = brief
      ? apkArtifactName({
          appSlug: options.manifest.appSlug,
          round: options.roundNumber,
          slot: candidate.slot,
          slug: brief.slug,
        })
      : null;

    // ---- Engine commits: build workflow, then candidate identity ---------
    //
    // Both are appended AFTER gates and review, so verification always ran
    // against pure design content, and both carry a commit-subject marker so
    // `merge-check` can prove they were dropped before a merge. Order
    // matters for neither, but they must precede the push: GitHub Actions
    // only runs workflow files that exist on the pushed ref.

    const shouldCarryWorkflow =
      (shouldPush || options.writeWorkflow === true) &&
      workflow.strategy === 'generated' &&
      workflow.content !== null &&
      workflow.path !== null &&
      options.config.build.commitWorkflowToCandidates;

    if (shouldCarryWorkflow && lease && workflow.path && workflow.content) {
      const worktreeGit = git.withCwd(lease.path);
      await writeText(join(lease.path, workflow.path), workflow.content);
      await worktreeGit.stageAll();
      const workflowCommit = await worktreeGit.commit(
        `designlab: add build workflow ${PLUMBING_COMMIT_MARKER}\n\n` +
          'Builds one APK per design branch. Temporary DesignLab plumbing: drop before merging ' +
          'the winning design; `designlab merge-check` enforces that.',
      );
      if (workflowCommit) {
        logger.info('build workflow committed to candidate branch', {
          slot: candidate.slot,
          path: workflow.path,
        });
      }
    }

    if (options.config.build.candidateIdentity === 'suffix' && lease && !options.dryRun) {
      candidate.identity = await applyCandidateIdentity({
        git,
        lease,
        manifest: options.manifest,
        slot: candidate.slot,
        allowRisky: options.config.build.allowRiskyIdentity,
      });
      if (candidate.identity.applied) {
        logger.info('candidate identity applied', {
          slot: candidate.slot,
          suffix: candidate.identity.applicationIdSuffix,
        });
      } else {
        logger.warn('candidate identity not applied', {
          slot: candidate.slot,
          reason: candidate.identity.reason,
        });
      }
    }

    if (!shouldPush) {
      candidate.build = notRequestedBuild(
        options.dryRun
          ? 'Dry run: the branch was not pushed, so no build was triggered.'
          : 'Pushing is disabled, so no build was triggered.',
      );
      continue;
    }

    if (workflow.strategy === 'unsupported') {
      candidate.build = unsupportedBuild(workflow.reason);
    }

    try {
      assertPushSafe(candidate.branch, [options.baseBranch, 'main', 'master'], options.config.branchPrefix);
      const pushResult = await git.push(options.config.build.remote, candidate.branch, {
        ...(lease ? { cwd: lease.path } : {}),
      });

      if (pushResult.ok) {
        candidate.pushed = true;
        candidate.status = 'pushed';
        // Record the exact commit that went to the remote: engine commits
        // sit above headSha, and build tracking must match runs against the
        // pushed tip, not the design head.
        candidate.pushedSha = lease ? await git.withCwd(lease.path).headSha() : candidate.headSha;
        if (workflow.strategy !== 'unsupported') {
          candidate.build = pendingBuild({
            workflowPath: workflow.path,
            artifactName: artifactName ?? 'unknown.apk',
            variant: workflow.variant,
            notes: `Pushed to ${options.config.build.remote}. Waiting for GitHub Actions.`,
          });
        }
        logger.info('design branch pushed', { slot: candidate.slot, branch: candidate.branch });
      } else {
        candidate.build = notRequestedBuild(
          `Push failed (exit ${pushResult.exitCode}); no build was triggered.`,
        );
        logger.warn('push failed', {
          slot: candidate.slot,
          branch: candidate.branch,
          exitCode: pushResult.exitCode,
        });
      }
    } catch (error) {
      candidate.build = notRequestedBuild(
        `Push refused: ${error instanceof Error ? error.message : String(error)}`,
      );
      logger.errorFrom('push refused', error, { slot: candidate.slot });
    }
  }

  roundStatus = 'complete';
  const round = await persist();

  logger.info('round complete', {
    ready: candidates.filter((candidate) => candidate.status === 'ready' || candidate.status === 'pushed').length,
    total: candidates.length,
  });

  return {
    round,
    briefs: allBriefs,
    workflow,
    diversityScore: planResult.diversity.score,
    belowDiversityTarget: planResult.belowTarget,
  };
}

// ---------------------------------------------------------------------------
// Revision pass
// ---------------------------------------------------------------------------

async function reviseCandidate(options: {
  runner: AgentRunner;
  brief: DesignBrief;
  lease: WorktreeLease;
  git: GitClient;
  checker: ProtectionChecker;
  commands: GateCommands;
  config: DesignLabConfig;
  review: NonNullable<Candidate['review']>;
  logger: Logger;
}): Promise<{
  passed: boolean;
  gates: Candidate['gates'];
  protection: Candidate['protection'];
  headSha: string | null;
  filesChanged: number;
  failure: string | null;
}> {
  const worktreeGit = options.git.withCwd(options.lease.path);

  const response = await options.runner.run({
    role: 'builder',
    operation: 'revise-design',
    prompt: buildRevisionPrompt(options.review, options.brief),
    systemPrompt: BUILDER_SYSTEM_PROMPT,
    cwd: options.lease.path,
    outputSchema: builderReportSchema,
    toolPolicy: { allowed: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'], denied: ['WebFetch', 'WebSearch'] },
    timeoutMs: options.config.limits.builderTimeoutMs,
    ...(options.config.limits.maxBudgetUsdPerAgent !== null
      ? { maxBudgetUsd: options.config.limits.maxBudgetUsdPerAgent }
      : {}),
    ledger: {
      projectId: options.brief.projectId,
      round: options.brief.round,
      slot: options.brief.slot,
    },
  });

  if (!response.ok) {
    return {
      passed: false,
      gates: [],
      protection: null,
      headSha: null,
      filesChanged: 0,
      failure: `The revision agent failed: ${response.error ?? 'unknown error'}`,
    };
  }

  await worktreeGit.stageAll();
  const committed = await worktreeGit.commit(
    `design(${options.brief.slot.toLowerCase()}): revise ${options.brief.name}\n\nApplied design review corrections.`,
  );
  const headSha = committed ?? (await worktreeGit.headSha());

  const gateRun = await runGates({
    cwd: options.lease.path,
    commands: options.commands,
    git: options.git,
    checker: options.checker,
    baseSha: options.lease.baseSha,
    headSha,
    timeoutMs: options.config.limits.gateTimeoutMs,
    logger: options.logger,
  });

  const changes = await options.git.changedFiles(options.lease.baseSha, headSha, options.lease.path);

  return {
    passed: gateRun.passed && didAllRequiredGatesPass(gateRun.results),
    gates: gateRun.results,
    protection: gateRun.protection,
    headSha,
    filesChanged: changes.length,
    failure: gateRun.passed ? null : `The ${gateRun.failedGate ?? 'verification'} gate failed after revision.`,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initialCandidate(brief: DesignBrief, baseSha: string, branchPrefix: string): Candidate {
  return {
    slot: brief.slot,
    slug: brief.slug,
    name: brief.name,
    origin: brief.origin,
    status: 'planned',
    identity: null,
    captures: [],
    captureStatus: 'skipped',
    branch: designBranchName({
      prefix: branchPrefix,
      round: brief.round,
      slot: brief.slot,
      slug: brief.slug,
    }),
    worktreePath: null,
    baseSha,
    headSha: null,
    pushedSha: null,
    pushed: false,
    attempts: 0,
    escalations: 0,
    gates: [],
    protection: null,
    review: null,
    build: notRequestedBuild('Candidate has not been implemented yet.'),
    failure: null,
    filesChanged: 0,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Bounded-concurrency map. Rejections are contained per item so one failing
 * candidate cannot abort the round.
 */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;

  const runners = Array.from({ length: limit }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      await worker(item, index);
    }
  });

  await Promise.all(runners);
}
