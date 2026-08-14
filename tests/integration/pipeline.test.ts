/**
 * End-to-end pipeline test.
 *
 * This drives the *production* orchestrator over a real Git repository with
 * real worktrees, real verification commands and real diffs. Only the model
 * calls are substituted, by the deterministic runner — which is the same
 * substitution `--dry-run` makes.
 *
 * The flow under test is the V1 acceptance flow:
 *
 *   inspect → manifest → contract → round → isolated branches → builders →
 *   protection gate → test gate → review → round status → choose winner →
 *   next-generation plan
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MockAgentRunner } from '../../src/agents/mock-runner.js';
import { defaultConfig, type DesignLabConfig } from '../../src/config/config.js';
import { removeDir } from '../../src/core/fsx.js';
import { createPaths, type DesignLabPaths } from '../../src/core/paths.js';
import { Store } from '../../src/core/store.js';
import { runRound } from '../../src/core/orchestrator.js';
import { inspectRepository } from '../../src/analysis/inspector.js';
import { buildContract } from '../../src/protection/contract.js';
import { ProtectionChecker } from '../../src/protection/checker.js';
import { GitClient } from '../../src/git/git-client.js';
import { WorktreeManager } from '../../src/git/worktree-manager.js';
import { runGates, didAllRequiredGatesPass } from '../../src/testing/gates.js';
import {
  appendLineage,
  chooseWinner,
  planNextGeneration,
  parseFeedbackReferences,
} from '../../src/lineage/evolution.js';
import { planWorkflow } from '../../src/builds/workflow-generator.js';
import type { AppManifest, FunctionalityContract, Round } from '../../src/core/schemas.js';
import { createFixtureRepo, makeTempDir, RN_APP_FILES, type FixtureRepo } from '../helpers/fixture-repo.js';

const PROJECT = 'test-fieldnotes-e2e0001';

interface Harness {
  repo: FixtureRepo;
  workspaceRoot: string;
  paths: DesignLabPaths;
  store: Store;
  config: DesignLabConfig;
  manifest: AppManifest;
  contract: FunctionalityContract;
  cleanup(): Promise<void>;
}

async function setUp(configOverrides: Partial<DesignLabConfig> = {}): Promise<Harness> {
  const repo = await createFixtureRepo(RN_APP_FILES);
  const workspaceRoot = await makeTempDir('designlab-e2e-');
  const paths = createPaths(workspaceRoot, join(workspaceRoot, '.designlab'));
  const store = new Store(paths);

  const base = defaultConfig();
  const config: DesignLabConfig = {
    ...base,
    ...configOverrides,
    limits: { ...base.limits, concurrency: 2, builderAttempts: 2, ...configOverrides.limits },
    build: { ...base.build, pushBranches: false, ...configOverrides.build },
    protection: { ...base.protection, ...configOverrides.protection },
  };

  const { manifest: inspected } = await inspectRepository({
    repoDir: repo.path,
    projectId: PROJECT,
    repoUrl: 'https://github.com/test/fieldnotes',
    branch: repo.branch,
    sha: repo.headSha,
    aiEnrichment: false,
  });

  const manifest = await store.writeManifest(inspected);
  const contract = await store.writeContract(
    buildContract({ manifest, config: config.protection }),
  );

  return {
    repo,
    workspaceRoot,
    paths,
    store,
    config,
    manifest,
    contract,
    cleanup: async () => {
      // Remove worktrees before the repo, so git does not leave stale metadata.
      const git = new GitClient({ cwd: repo.path });
      const manager = new WorktreeManager({ git, worktreesRoot: paths.worktreesDir(PROJECT) });
      await manager.cleanAll({ force: true }).catch(() => {});
      await removeDir(workspaceRoot);
      await repo.cleanup();
    },
  };
}

async function executeRound(
  harness: Harness,
  options: { designs?: number; runner?: MockAgentRunner } = {},
): Promise<Awaited<ReturnType<typeof runRound>>> {
  const runner = options.runner ?? new MockAgentRunner();

  return runRound({
    config: harness.config,
    store: harness.store,
    paths: harness.paths,
    runner,
    manifest: harness.manifest,
    contract: harness.contract,
    lineage: await harness.store.readLineage(PROJECT),
    repoDir: harness.repo.path,
    baseBranch: harness.repo.branch,
    baseSha: harness.repo.headSha,
    designCount: options.designs ?? 4,
    diversityTarget: 'high',
    roundNumber: await harness.store.nextRoundNumber(PROJECT),
    dryRun: true,
    logger: undefined,
  });
}

describe('full design round', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await setUp();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it('produces four candidates on four isolated branches from one base commit', async () => {
    const result = await executeRound(harness);
    const { round } = result;

    expect(round.candidates).toHaveLength(4);
    expect(round.candidates.map((candidate) => candidate.slot)).toEqual(['A', 'B', 'C', 'D']);

    // Every candidate starts from the identical commit — the requirement that
    // makes cross-candidate comparison meaningful.
    expect(new Set(round.candidates.map((candidate) => candidate.baseSha))).toEqual(
      new Set([harness.repo.headSha]),
    );

    // Distinct branches, distinct worktrees, correct naming convention.
    expect(new Set(round.candidates.map((candidate) => candidate.branch)).size).toBe(4);
    expect(new Set(round.candidates.map((candidate) => candidate.worktreePath)).size).toBe(4);
    for (const candidate of round.candidates) {
      expect(candidate.branch).toMatch(/^design\/r001-[a-d]-[a-z0-9-]+$/);
    }
  });

  it('never modifies the target base branch', async () => {
    const git = new GitClient({ cwd: harness.repo.path });
    await executeRound(harness);

    expect(await git.revParse('refs/heads/main')).toBe(harness.repo.headSha);
    expect(await git.currentBranch()).toBe('main');
    expect(await git.isClean()).toBe(true);
  });

  it('never merges design branches into each other or into the base', async () => {
    const git = new GitClient({ cwd: harness.repo.path });
    const { round } = await executeRound(harness);

    for (const candidate of round.candidates) {
      if (!candidate.headSha) continue;
      // Each design branch descends from the base and from nothing else.
      const parents = await git.run(['rev-list', '--parents', '-n', '1', candidate.headSha]);
      expect(parents.split(/\s+/).length, candidate.branch).toBe(2); // commit + one parent
    }
  });

  it('actually runs the target project’s verification commands', async () => {
    const { round } = await executeRound(harness);

    for (const candidate of round.candidates) {
      const typecheck = candidate.gates.find((gate) => gate.gate === 'typecheck');
      const test = candidate.gates.find((gate) => gate.gate === 'test');

      expect(typecheck?.command, candidate.slot).toBe('npm run typecheck');
      expect(typecheck?.status, candidate.slot).toBe('passed');
      expect(typecheck?.exitCode, candidate.slot).toBe(0);
      // A gate that genuinely ran took measurable time.
      expect(typecheck?.durationMs, candidate.slot).toBeGreaterThan(0);

      expect(test?.command, candidate.slot).toBe('npm run test');
      expect(test?.status, candidate.slot).toBe('passed');
    }
  });

  it('runs the protection gate against a real diff', async () => {
    const { round } = await executeRound(harness);

    for (const candidate of round.candidates) {
      expect(candidate.protection, candidate.slot).not.toBeNull();
      expect(candidate.protection?.passed, candidate.slot).toBe(true);
      expect(candidate.protection?.baseSha, candidate.slot).toBe(harness.repo.headSha);
      expect(candidate.protection?.filesChanged, candidate.slot).toBeGreaterThan(0);
    }
  });

  it('reaches a ready state for every candidate and records honest gate results', async () => {
    const { round } = await executeRound(harness);

    for (const candidate of round.candidates) {
      expect(candidate.status, candidate.slot).toBe('ready');
      expect(candidate.headSha, candidate.slot).toBeTruthy();
      expect(candidate.headSha, candidate.slot).not.toBe(harness.repo.headSha);
      expect(didAllRequiredGatesPass(candidate.gates), candidate.slot).toBe(true);
    }
  });

  it('does not claim a build exists when nothing was pushed', async () => {
    const { round } = await executeRound(harness);
    for (const candidate of round.candidates) {
      expect(candidate.build.status, candidate.slot).toBe('BUILD_NOT_REQUESTED');
      expect(candidate.build.artifactUrl, candidate.slot).toBeNull();
      expect(candidate.pushed, candidate.slot).toBe(false);
    }
  });

  it('persists briefs, the round record and a workflow plan', async () => {
    const result = await executeRound(harness);

    const briefs = await harness.store.readBriefs(PROJECT, 1);
    expect(briefs).toHaveLength(4);
    for (const brief of briefs) {
      expect(brief.directives.length).toBeGreaterThanOrEqual(3);
      expect(brief.successCriteria.length).toBeGreaterThanOrEqual(1);
      expect(Object.keys(brief.diversityVector)).toHaveLength(13);
    }

    const stored = await harness.store.readRound(PROJECT, 1);
    expect(stored?.status).toBe('complete');
    expect(stored?.candidates).toHaveLength(4);

    expect(result.workflow.strategy).toBe('generated');
    expect(result.workflow.content).toContain('actions/upload-artifact@v4');
  });

  it('gives each builder only its own brief, never the whole conversation', async () => {
    const runner = new MockAgentRunner();
    await executeRound(harness, { runner });

    const builderCalls = runner.calls.filter((call) => call.role === 'builder');
    expect(builderCalls.length).toBeGreaterThanOrEqual(4);

    for (const call of builderCalls) {
      const slot = call.ledger?.slot;
      expect(slot).toBeTruthy();
      // A builder's prompt must not contain a sibling's design name.
      const otherSlots = ['A', 'B', 'C', 'D'].filter((candidate) => candidate !== slot);
      for (const other of otherSlots) {
        expect(call.prompt).not.toContain(`Design ${other}:`);
      }
      // It must contain its own brief and the contract.
      expect(call.prompt).toContain(`Design ${slot}:`);
      expect(call.prompt).toContain('PROTECTED');
    }
  });

  it('routes each stage to the model role its job requires', async () => {
    const runner = new MockAgentRunner();
    await executeRound(harness, { runner });

    const roleFor = (operation: string): string | undefined =>
      runner.calls.find((call) => call.operation === operation)?.role;

    expect(roleFor('plan-round')).toBe('lead');
    expect(roleFor('implement-design')).toBe('builder');
    expect(roleFor('review-design')).toBe('lead');

    // Opus must not be invoked when nothing failed.
    expect(runner.calls.some((call) => call.role === 'reviewer')).toBe(false);
  });

  it('confines each builder to its own worktree directory', async () => {
    const runner = new MockAgentRunner();
    const { round } = await executeRound(harness, { runner });

    const worktreeBySlot = new Map(
      round.candidates.map((candidate) => [candidate.slot, candidate.worktreePath]),
    );

    for (const call of runner.calls.filter((entry) => entry.role === 'builder')) {
      expect(call.cwd).toBe(worktreeBySlot.get(call.ledger?.slot as never));
    }
  });

  it('records model usage so it can be measured later', async () => {
    // The ledger is written by LedgeredRunner, which the orchestrator does not
    // apply itself; exercise it the way the CLI does.
    const { LedgeredRunner } = await import('../../src/agents/runner-factory.js');
    const runner = new LedgeredRunner(new MockAgentRunner(), {
      store: harness.store,
      context: { projectId: PROJECT },
    });

    await runRound({
      config: harness.config,
      store: harness.store,
      paths: harness.paths,
      runner,
      manifest: harness.manifest,
      contract: harness.contract,
      lineage: await harness.store.readLineage(PROJECT),
      repoDir: harness.repo.path,
      baseBranch: harness.repo.branch,
      baseSha: harness.repo.headSha,
      designCount: 2,
      diversityTarget: 'high',
      roundNumber: 1,
      dryRun: true,
    });

    const usage = await harness.store.readUsage();
    expect(usage.length).toBeGreaterThan(0);
    expect(usage.some((event) => event.role === 'lead' && event.operation === 'plan-round')).toBe(true);
    expect(usage.some((event) => event.role === 'builder')).toBe(true);
    expect(usage.every((event) => event.projectId === PROJECT)).toBe(true);
  });
});

describe('protection enforcement on a real branch', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await setUp();
  });
  afterEach(async () => {
    await harness.cleanup();
  });

  it('fails a candidate that edits a protected file, no matter how good it looks', async () => {
    const git = new GitClient({ cwd: harness.repo.path });
    const manager = new WorktreeManager({
      git,
      worktreesRoot: harness.paths.worktreesDir(PROJECT),
      protectedBranches: ['main'],
    });

    const lease = await manager.create({
      name: 'r001-x-rogue',
      branch: 'design/r001-x-rogue',
      baseSha: harness.repo.headSha,
    });

    // A presentational change plus one line inside the API client.
    await writeFile(join(lease.path, 'src/theme/theme.ts'), 'export const theme = { radius: 24 };\n', 'utf8');
    const client = await readFile(join(lease.path, 'src/api/client.ts'), 'utf8');
    await writeFile(join(lease.path, 'src/api/client.ts'), `${client}\n// tweaked by a design\n`, 'utf8');

    const worktreeGit = git.withCwd(lease.path);
    await worktreeGit.ensureIdentity();
    await worktreeGit.stageAll();
    const headSha = await worktreeGit.commit('design: rogue change');

    const checker = new ProtectionChecker(harness.contract, harness.config.protection);
    const report = await checker.check(git, {
      baseSha: harness.repo.headSha,
      headSha: headSha ?? (await worktreeGit.headSha()),
      cwd: lease.path,
    });

    expect(report.passed).toBe(false);
    expect(report.violations.map((violation) => violation.path)).toContain('src/api/client.ts');
    expect(report.violations.map((violation) => violation.path)).not.toContain('src/theme/theme.ts');
  });

  it('fails the test gate when a design deletes a module the tests require', async () => {
    const git = new GitClient({ cwd: harness.repo.path });
    const manager = new WorktreeManager({
      git,
      worktreesRoot: harness.paths.worktreesDir(PROJECT),
      protectedBranches: ['main'],
    });

    const lease = await manager.create({
      name: 'r001-y-broken',
      branch: 'design/r001-y-broken',
      baseSha: harness.repo.headSha,
    });

    const worktreeGit = git.withCwd(lease.path);
    await worktreeGit.ensureIdentity();
    await worktreeGit.run(['rm', '--quiet', 'src/auth/session.ts']);
    await worktreeGit.stageAll();
    const headSha = await worktreeGit.commit('design: remove a module');

    const gateRun = await runGates({
      cwd: lease.path,
      commands: {
        install: null,
        typecheck: harness.manifest.commands.typecheck,
        lint: harness.manifest.commands.lint,
        test: harness.manifest.commands.test,
        build: null,
      },
      git,
      checker: new ProtectionChecker(harness.contract, harness.config.protection),
      baseSha: harness.repo.headSha,
      headSha: headSha ?? (await worktreeGit.headSha()),
      timeoutMs: 60_000,
    });

    expect(gateRun.passed).toBe(false);
    expect(gateRun.failedGate).toBe('test');

    const testGate = gateRun.results.find((gate) => gate.gate === 'test');
    expect(testGate?.status).toBe('failed');
    expect(testGate?.summary).toContain('missing required module');

    // The protection gate must be reported as skipped, never as passed.
    const protection = gateRun.results.find((gate) => gate.gate === 'protection');
    expect(protection?.status).toBe('skipped');
    expect(didAllRequiredGatesPass(gateRun.results)).toBe(false);
  });
});

describe('choose winner and evolve', () => {
  let harness: Harness;
  let round: Round;

  beforeEach(async () => {
    harness = await setUp();
    round = (await executeRound(harness)).round;
  });
  afterEach(async () => {
    await harness.cleanup();
  });

  it('records the winner, updates lineage, and plans the next generation', async () => {
    const feedback = "C wins overall. I prefer A's map and B's profile.";

    const chosen = chooseWinner({ round, winner: 'C', feedback });
    const stored = await harness.store.writeRound(chosen.round);
    await harness.store.writeLineage(
      appendLineage(await harness.store.readLineage(PROJECT), chosen.lineageEntry),
    );

    expect(stored.status).toBe('chosen');
    expect(stored.winner).toBe('C');

    const lineage = await harness.store.readLineage(PROJECT);
    expect(lineage.entries).toHaveLength(1);
    expect(lineage.entries[0]?.winnerBranch).toBe(
      round.candidates.find((candidate) => candidate.slot === 'C')?.branch,
    );

    const plan = await planNextGeneration({
      runner: new MockAgentRunner(),
      round: stored,
      winner: 'C',
      winnerBranch: chosen.winnerCandidate.branch,
      feedback,
      briefs: await harness.store.readBriefs(PROJECT, 1),
      lineage,
      repoDir: harness.repo.path,
      designCount: 3,
    });

    await harness.store.writeNextGenerationPlan(plan);

    expect(plan.round).toBe(2);
    expect(plan.parentRound).toBe(1);
    expect(plan.parentSlot).toBe('C');
    // The next generation must start from the winner, not the original base.
    expect(plan.parentBranch).toBe(chosen.winnerCandidate.branch);
    expect(plan.directions.length).toBeGreaterThanOrEqual(1);

    const reloaded = await harness.store.readNextGenerationPlan(PROJECT, 1);
    expect(reloaded?.parentSlot).toBe('C');
  });

  it('parses the borrowings a human named in their feedback', () => {
    const references = parseFeedbackReferences(
      "C wins overall. I prefer A's map and B's profile.",
      round.candidates.map((candidate) => candidate.slot),
    );

    expect(references.borrowings).toEqual(
      expect.arrayContaining([
        { slot: 'A', subject: 'map' },
        { slot: 'B', subject: 'profile' },
      ]),
    );
  });

  it('starts the second round from the winner’s commit', async () => {
    const chosen = chooseWinner({ round, winner: 'B', feedback: 'B is closest.' });
    await harness.store.writeRound(chosen.round);

    const winnerHead = chosen.winnerCandidate.headSha;
    expect(winnerHead).toBeTruthy();
    expect(winnerHead).not.toBe(harness.repo.headSha);

    const second = await runRound({
      config: harness.config,
      store: harness.store,
      paths: harness.paths,
      runner: new MockAgentRunner(),
      manifest: harness.manifest,
      contract: harness.contract,
      lineage: await harness.store.readLineage(PROJECT),
      repoDir: harness.repo.path,
      baseBranch: chosen.winnerCandidate.branch,
      baseSha: winnerHead as string,
      designCount: 2,
      diversityTarget: 'high',
      roundNumber: 2,
      parentRound: 1,
      parentSlot: 'B',
      dryRun: true,
    });

    expect(second.round.round).toBe(2);
    expect(second.round.baseSha).toBe(winnerHead);
    expect(second.round.parentRound).toBe(1);
    expect(second.round.parentSlot).toBe('B');

    // Generation 2 inherits generation 1's design work rather than re-deriving it.
    const git = new GitClient({ cwd: harness.repo.path });
    for (const candidate of second.round.candidates) {
      expect(candidate.baseSha).toBe(winnerHead);
      const isDescendant = await git.raw([
        'merge-base',
        '--is-ancestor',
        winnerHead as string,
        candidate.headSha as string,
      ]);
      expect(isDescendant.ok, candidate.slot).toBe(true);
    }

    expect(await harness.store.listRoundNumbers(PROJECT)).toEqual([1, 2]);
  });
});

describe('workflow planning against the inspected target', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await setUp();
  });
  afterEach(async () => {
    await harness.cleanup();
  });

  it('generates a Gradle workflow that names artifacts from the branch', () => {
    const plan = planWorkflow({
      manifest: harness.manifest,
      branchPrefix: 'design',
      reuseExisting: true,
      generate: true,
      workflowPath: '.github/workflows/designlab-android.yml',
    });

    expect(plan.strategy).toBe('generated');
    // Debug is the default variant: debug APKs are signed with the debug
    // keystore and actually install on a device; unsigned release APKs don't.
    expect(plan.variant).toBe('debug');
    expect(plan.content).toContain('assembleDebug');
    expect(plan.content).toContain("'design/**'");
    expect(plan.content).toContain('fieldnotes-');
    expect(plan.requirements.some((item) => item.includes('debug keystore'))).toBe(true);

    const release = planWorkflow({
      manifest: harness.manifest,
      branchPrefix: 'design',
      reuseExisting: true,
      generate: true,
      workflowPath: '.github/workflows/designlab-android.yml',
      variant: 'release',
    });
    expect(release.content).toContain('assembleRelease');
    expect(release.requirements.some((item) => item.includes('UNSIGNED'))).toBe(true);
  });
});
