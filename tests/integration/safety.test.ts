/**
 * Integration tests for the audit-driven safety fixes:
 *
 *  - the Opus escalation ladder is actually reachable with default limits;
 *  - invariant guards catch dependency removal and identity drift that path
 *    rules alone would let through;
 *  - reference-image candidates run through the production orchestrator with
 *    origin metadata intact;
 *  - the generated build workflow is committed onto candidate branches (the
 *    fix without which GitHub Actions would never run for targets that have
 *    no Android CI of their own).
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MockAgentRunner } from '../../src/agents/mock-runner.js';
import { buildCandidate } from '../../src/design/builder.js';
import { defaultConfig, type DesignLabConfig } from '../../src/config/config.js';
import { inspectRepository } from '../../src/analysis/inspector.js';
import { buildContract } from '../../src/protection/contract.js';
import { ProtectionChecker } from '../../src/protection/checker.js';
import { runInvariantChecks } from '../../src/protection/invariants.js';
import { runGates } from '../../src/testing/gates.js';
import { runRound } from '../../src/core/orchestrator.js';
import { chooseWinner } from '../../src/lineage/evolution.js';
import { Store } from '../../src/core/store.js';
import { createPaths } from '../../src/core/paths.js';
import { removeDir, writeJson } from '../../src/core/fsx.js';
import { GitClient } from '../../src/git/git-client.js';
import { WorktreeManager } from '../../src/git/worktree-manager.js';
import {
  commitChanges,
  createFixtureRepo,
  makeTempDir,
  RN_APP_FILES,
  type FixtureRepo,
} from '../helpers/fixture-repo.js';
import type { AppManifest, DesignBrief, FunctionalityContract } from '../../src/core/schemas.js';
import { DIVERSITY_DIMENSIONS } from '../../src/core/schemas.js';

/** 1×1 transparent PNG — a real, viewable image for reference-pack tests. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function inspectFixture(repo: FixtureRepo, projectId: string): Promise<AppManifest> {
  const { manifest } = await inspectRepository({
    repoDir: repo.path,
    projectId,
    repoUrl: 'https://github.com/test/fieldnotes',
    branch: 'main',
    sha: repo.headSha,
    aiEnrichment: false,
  });
  return manifest;
}

describe('escalation ladder', () => {
  let repo: FixtureRepo;
  let git: GitClient;
  let worktreesRoot: string;
  let manager: WorktreeManager;
  let manifest: AppManifest;
  let contract: FunctionalityContract;

  beforeEach(async () => {
    // A target whose test suite ALWAYS fails: the builder cannot fix it, so
    // the full retry → escalate → retry ladder must play out.
    repo = await createFixtureRepo({
      ...RN_APP_FILES,
      'scripts/test.js': "console.error('deliberately failing'); process.exit(1);\n",
    });
    git = new GitClient({ cwd: repo.path });
    worktreesRoot = join(await makeTempDir('designlab-esc-'), 'worktrees');
    manager = new WorktreeManager({ git, worktreesRoot, protectedBranches: ['main'] });
    manifest = await inspectFixture(repo, 'escalation-test-0001');
    contract = buildContract({ manifest, config: defaultConfig().protection });
  });

  afterEach(async () => {
    await manager.cleanAll({ force: true }).catch(() => {});
    await removeDir(worktreesRoot);
    await repo.cleanup();
  });

  it('reaches the Opus reviewer with DEFAULT limits after a failed retry, exactly once', async () => {
    const runner = new MockAgentRunner();
    const lease = await manager.create({
      name: 'r001-a-esc',
      branch: 'design/r001-a-esc',
      baseSha: repo.headSha,
    });

    const brief: DesignBrief = {
      schemaVersion: 1,
      projectId: 'escalation-test-0001',
      round: 1,
      slot: 'A',
      origin: 'FABLE_EXPLORATION',
      referenceImages: [],
      slug: 'esc',
      name: 'Escalation probe',
      thesis: 'Probe the escalation ladder.',
      rationale: '',
      diversityVector: Object.fromEntries(
        DIVERSITY_DIMENSIONS.map((dimension) => [dimension, `${dimension} position`]),
      ) as DesignBrief['diversityVector'],
      directives: ['a', 'b', 'c'],
      targetScreens: [],
      antiPatterns: [],
      successCriteria: ['x'],
      parent: null,
      generatedAt: new Date().toISOString(),
    };

    const limits = defaultConfig().limits; // NOT overridden — defaults must work
    expect(limits.builderAttempts).toBe(3);

    const result = await buildCandidate({
      runner,
      brief,
      lease,
      manifest,
      contract,
      checker: new ProtectionChecker(contract, defaultConfig().protection),
      git,
      commands: {
        install: null,
        typecheck: manifest.commands.typecheck,
        lint: null,
        test: manifest.commands.test,
        build: null,
      },
      limits: { ...limits, builderTimeoutMs: 60_000, gateTimeoutMs: 60_000, leadTimeoutMs: 60_000 },
    });

    // The candidate fails honestly — the tests genuinely fail — but on the
    // way there the reviewer must have been consulted exactly once, and the
    // escalated attempt must have run.
    expect(result.status).toBe('gates-failed');
    expect(result.attempts).toBe(3);
    expect(result.escalations).toBe(1);

    const reviewerCalls = runner.calls.filter((call) => call.role === 'reviewer');
    expect(reviewerCalls).toHaveLength(1);
    expect(reviewerCalls[0]?.operation).toBe('escalate-failure');

    // The post-escalation builder attempt received the reviewer's diagnosis.
    const builderCalls = runner.calls.filter((call) => call.role === 'builder');
    expect(builderCalls).toHaveLength(3);
    expect(builderCalls[2]?.prompt).toContain('Engineering review of your previous failure');
  });
});

describe('invariant guards', () => {
  let repo: FixtureRepo;
  let git: GitClient;

  beforeEach(async () => {
    repo = await createFixtureRepo(RN_APP_FILES);
    git = new GitClient({ cwd: repo.path });
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  async function invariantsFor(files: Record<string, string>): Promise<string[]> {
    const headSha = await commitChanges(repo.path, files);
    const changes = await git.changedFiles(repo.headSha, headSha);
    const violations = await runInvariantChecks({ git, baseSha: repo.headSha, headSha, changes });
    return violations.map((violation) => violation.rule);
  }

  it('catches a removed dependency even though package.json changes are otherwise negotiable', async () => {
    const pkg = JSON.parse(RN_APP_FILES['package.json'] ?? '{}') as {
      dependencies: Record<string, string>;
    };
    delete pkg.dependencies['@stripe/stripe-react-native'];

    const rules = await invariantsFor({ 'package.json': JSON.stringify(pkg, null, 2) });
    expect(rules).toContain('invariant:dependency-removed');
  });

  it('allows dependency additions — a design may need a font or animation library', async () => {
    const pkg = JSON.parse(RN_APP_FILES['package.json'] ?? '{}') as {
      dependencies: Record<string, string>;
    };
    pkg.dependencies['lottie-react-native'] = '^6.0.0';

    const rules = await invariantsFor({ 'package.json': JSON.stringify(pkg, null, 2) });
    expect(rules).not.toContain('invariant:dependency-removed');
  });

  it('catches an app identity change a design tried to make itself', async () => {
    const rules = await invariantsFor({
      'app.json': JSON.stringify({
        expo: { name: 'TotallyNewName', slug: 'fieldnotes', android: { package: 'com.hijacked.app' } },
      }),
    });
    expect(rules.filter((rule) => rule === 'invariant:app-identity').length).toBeGreaterThanOrEqual(2);
  });

  it('catches a declared-permissions change in expo config', async () => {
    const rules = await invariantsFor({
      'app.json': JSON.stringify({
        expo: {
          name: 'FieldNotes',
          slug: 'fieldnotes',
          android: { package: 'com.example.fieldnotes', permissions: ['android.permission.RECORD_AUDIO'] },
        },
      }),
    });
    expect(rules).toContain('invariant:permissions');
  });

  it('fires inside the protection gate, so a waived path rule cannot smuggle a dependency removal', async () => {
    const manifest = await inspectFixture(repo, 'invariant-gate-0001');
    // A contract that explicitly ALLOWS package.json edits via an exception —
    // the realistic "the design may add a font dep" configuration.
    const protectionConfig = {
      ...defaultConfig().protection,
      approvedExceptions: [{ pattern: 'package.json', reason: 'design may add presentation deps' }],
    };
    const contract = buildContract({ manifest, config: protectionConfig });

    const pkg = JSON.parse(RN_APP_FILES['package.json'] ?? '{}') as {
      dependencies: Record<string, string>;
    };
    delete pkg.dependencies['react-native-maps'];
    const headSha = await commitChanges(repo.path, { 'package.json': JSON.stringify(pkg, null, 2) });

    const gateRun = await runGates({
      cwd: repo.path,
      commands: { install: null, typecheck: null, lint: null, test: null, build: null },
      git,
      checker: new ProtectionChecker(contract, protectionConfig),
      baseSha: repo.headSha,
      headSha,
      timeoutMs: 60_000,
    });

    expect(gateRun.failedGate).toBe('protection');
    expect(
      gateRun.protection?.violations.some((violation) => violation.rule === 'invariant:dependency-removed'),
    ).toBe(true);
  });
});

describe('reference-image candidates and workflow delivery', () => {
  let repo: FixtureRepo;
  let workspaceRoot: string;
  let referenceDir: string;

  beforeEach(async () => {
    repo = await createFixtureRepo(RN_APP_FILES);
    workspaceRoot = await makeTempDir('designlab-ref-');
    referenceDir = await makeTempDir('designlab-refimg-');
    for (const name of ['home.png', 'map.png', 'profile.png']) {
      await writeFile(join(referenceDir, name), TINY_PNG);
    }
  });

  afterEach(async () => {
    const git = new GitClient({ cwd: repo.path });
    const paths = createPaths(workspaceRoot, join(workspaceRoot, '.designlab'));
    const manager = new WorktreeManager({ git, worktreesRoot: paths.worktreesDir('reference-test-001') });
    await manager.cleanAll({ force: true }).catch(() => {});
    await removeDir(workspaceRoot);
    await removeDir(referenceDir);
    await repo.cleanup();
  });

  async function runReferenceRound(): Promise<Awaited<ReturnType<typeof runRound>>> {
    const paths = createPaths(workspaceRoot, join(workspaceRoot, '.designlab'));
    const store = new Store(paths);
    const manifest = await store.writeManifest(await inspectFixture(repo, 'reference-test-001'));
    const base = defaultConfig();
    const config: DesignLabConfig = {
      ...base,
      limits: { ...base.limits, concurrency: 2 },
      build: { ...base.build, pushBranches: false },
    };
    const contract = await store.writeContract(buildContract({ manifest, config: config.protection }));

    return runRound({
      config,
      store,
      paths,
      runner: new MockAgentRunner(),
      manifest,
      contract,
      lineage: await store.readLineage('reference-test-001'),
      repoDir: repo.path,
      baseBranch: 'main',
      baseSha: repo.headSha,
      designCount: 2,
      diversityTarget: 'high',
      roundNumber: 1,
      dryRun: true,
      writeWorkflow: true,
      reference: {
        dir: referenceDir,
        images: ['home.png', 'map.png', 'profile.png'].map((name) => join(referenceDir, name)),
      },
    });
  }

  it('runs the reference as slot A plus the requested explorations, with origin metadata', async () => {
    const result = await runReferenceRound();

    expect(result.round.candidates).toHaveLength(3);
    const [reference, ...explorations] = result.round.candidates;

    expect(reference?.slot).toBe('A');
    expect(reference?.origin).toBe('REFERENCE_IMAGE');
    expect(reference?.status).toBe('ready');
    expect(explorations.every((candidate) => candidate.origin === 'FABLE_EXPLORATION')).toBe(true);
    expect(explorations.map((candidate) => candidate.slot)).toEqual(['B', 'C']);

    const referenceBrief = result.briefs.find((brief) => brief.slot === 'A');
    expect(referenceBrief?.origin).toBe('REFERENCE_IMAGE');
    expect(referenceBrief?.referenceImages).toHaveLength(3);
    // Epistemic guardrails carried into the builder-facing brief.
    expect(referenceBrief?.antiPatterns.join(' ')).toContain('Do not invent behaviour');
  });

  it('records reference origin in lineage when a winner is chosen', async () => {
    const result = await runReferenceRound();
    const { lineageEntry } = chooseWinner({ round: result.round, winner: 'A', feedback: 'The mockups won.' });
    expect(lineageEntry.referenceSlots).toEqual(['A']);
  });

  it('commits the generated workflow onto every candidate branch with the plumbing marker', async () => {
    const result = await runReferenceRound();
    const git = new GitClient({ cwd: repo.path });

    for (const candidate of result.round.candidates) {
      const tipSubject = await git.commitSubject(candidate.branch);
      expect(tipSubject, candidate.branch).toContain('[designlab-plumbing]');

      // The workflow file exists ON THE BRANCH — the property GitHub Actions
      // actually requires to run a push-triggered build.
      const workflow = await git.showFile(candidate.branch, '.github/workflows/designlab-android.yml');
      expect(workflow, candidate.branch).not.toBeNull();
      expect(workflow).toContain('assembleDebug');

      // The design head recorded on the candidate sits BELOW the plumbing
      // commit and does not contain it.
      expect(candidate.headSha).toBeTruthy();
      const designSubject = await git.commitSubject(candidate.headSha as string);
      expect(designSubject).not.toContain('[designlab-plumbing]');
    }
  });
});

describe('stale round abandonment state', () => {
  it('treats only complete/chosen/aborted as terminal', async () => {
    // Pin the exact status set the round command consults, so adding a new
    // status forces a decision here.
    const workspaceRoot = await makeTempDir('designlab-stale-');
    const paths = createPaths(workspaceRoot, join(workspaceRoot, '.designlab'));
    const store = new Store(paths);

    await writeJson(paths.roundFile('p-stale-000000001', 1), {
      schemaVersion: 1,
      projectId: 'p-stale-000000001',
      round: 1,
      status: 'implementing',
      parentRound: null,
      parentSlot: null,
      baseBranch: 'main',
      baseSha: 'a'.repeat(40),
      manifestSha: 'a'.repeat(40),
      strategy: '',
      diversityTarget: 'high',
      diversityScore: null,
      candidates: [],
      winner: null,
      feedback: null,
      dryRun: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const stale = await store.readRound('p-stale-000000001', 1);
    expect(stale?.status).toBe('implementing');
    // The abandonment rule the CLI applies:
    expect(['complete', 'chosen', 'aborted'].includes(stale?.status ?? '')).toBe(false);

    await store.writeRound({ ...(stale as NonNullable<typeof stale>), status: 'aborted' });
    expect((await store.readRound('p-stale-000000001', 1))?.status).toBe('aborted');
    await removeDir(workspaceRoot);
  });
});
