/**
 * Integration tests for candidate identity overlays and merge-readiness,
 * against real Git repositories.
 *
 * These two features are the "candidate → device testing → human approval →
 * merge" path: identity makes side-by-side installs possible, and merge-check
 * proves the temporary plumbing is out before a human merges.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyCandidateIdentity,
  assessIdentityRisk,
  GRADLE_MARKER_BEGIN,
  isEngineCommitSubject,
  planCandidateIdentity,
} from '../../src/builds/candidate-identity.js';
import { checkMergeReadiness } from '../../src/builds/merge-readiness.js';
import { buildContract } from '../../src/protection/contract.js';
import { defaultConfig } from '../../src/config/config.js';
import { inspectRepository } from '../../src/analysis/inspector.js';
import { GitClient } from '../../src/git/git-client.js';
import { WorktreeManager, type WorktreeLease } from '../../src/git/worktree-manager.js';
import { removeDir } from '../../src/core/fsx.js';
import {
  commitChanges,
  createFixtureRepo,
  makeTempDir,
  RN_APP_FILES,
  writeFiles,
  type FixtureRepo,
} from '../helpers/fixture-repo.js';
import type { AppManifest, FunctionalityContract } from '../../src/core/schemas.js';

describe('candidate identity', () => {
  let repo: FixtureRepo;
  let git: GitClient;
  let worktreesRoot: string;
  let manager: WorktreeManager;
  let manifest: AppManifest;

  beforeEach(async () => {
    repo = await createFixtureRepo(RN_APP_FILES);
    git = new GitClient({ cwd: repo.path });
    worktreesRoot = join(await makeTempDir('designlab-idw-'), 'worktrees');
    manager = new WorktreeManager({ git, worktreesRoot, protectedBranches: ['main'] });
    ({ manifest } = await inspectRepository({
      repoDir: repo.path,
      projectId: 'identity-test-0000001',
      repoUrl: 'https://github.com/test/fieldnotes',
      branch: 'main',
      sha: repo.headSha,
      aiEnrichment: false,
    }));
  });

  afterEach(async () => {
    await manager.cleanAll({ force: true }).catch(() => {});
    await removeDir(worktreesRoot);
    await repo.cleanup();
  });

  async function lease(name: string): Promise<WorktreeLease> {
    return manager.create({ name, branch: `design/r001-${name}`, baseSha: repo.headSha });
  }

  it('plans a per-candidate suffix and display name for the detected stack', () => {
    const plan = planCandidateIdentity(manifest, 'B');
    expect(plan.applicationIdSuffix).toBe('.designlab.b');
    expect(plan.displayName).toBe('FieldNotes B');
    expect(plan.mechanism).toBe('expo-app-json');
  });

  it('applies the overlay as a single marked commit that edits only the identity surface', async () => {
    const wt = await lease('a-identity');
    const identity = await applyCandidateIdentity({
      git,
      lease: wt,
      manifest,
      slot: 'A',
      allowRisky: false,
    });

    expect(identity.applied).toBe(true);
    expect(identity.commit).toBeTruthy();

    // The commit subject carries the machine-readable marker.
    const subject = await git.withCwd(wt.path).commitSubject('HEAD');
    expect(isEngineCommitSubject(subject)).toBe(true);

    // Exactly one file changed, and it is the identity surface.
    const changes = await git.changedFiles(`${identity.commit}^`, identity.commit ?? 'HEAD', wt.path);
    expect(changes.map((change) => change.path)).toEqual(['app.json']);

    const appJson = JSON.parse(await readFile(join(wt.path, 'app.json'), 'utf8')) as {
      expo: { name: string; android: { package: string } };
    };
    expect(appJson.expo.name).toBe('FieldNotes A');
    expect(appJson.expo.android.package).toBe('com.example.fieldnotes.designlab.a');
  });

  it('gives each candidate a distinct applicationId, which is what side-by-side install needs', async () => {
    const a = planCandidateIdentity(manifest, 'A');
    const b = planCandidateIdentity(manifest, 'B');
    expect(a.applicationIdSuffix).not.toBe(b.applicationIdSuffix);
  });

  it('refuses the overlay when Firebase config is present — identity-bound integrations break', async () => {
    const wt = await lease('c-risky');
    await writeFiles(wt.path, { 'google-services.json': '{"project_info":{}}' });

    const identity = await applyCandidateIdentity({
      git,
      lease: wt,
      manifest,
      slot: 'C',
      allowRisky: false,
    });

    expect(identity.applied).toBe(false);
    expect(identity.reason).toContain('Firebase');
    // Nothing was committed.
    expect(await git.withCwd(wt.path).headSha()).not.toBe(identity.commit);
  });

  it('applies despite risk only when explicitly allowed, and records the acknowledged risks', async () => {
    const wt = await lease('d-risky-allowed');
    await writeFiles(wt.path, { 'google-services.json': '{"project_info":{}}' });

    const identity = await applyCandidateIdentity({
      git,
      lease: wt,
      manifest,
      slot: 'D',
      allowRisky: true,
    });

    expect(identity.applied).toBe(true);
    expect(identity.reason).toContain('acknowledged risks');
  });

  it('detects deep-link and maps risk markers', async () => {
    const dir = await makeTempDir('designlab-risk-');
    await writeFiles(dir, {
      'app.json': JSON.stringify({ expo: { name: 'X', scheme: 'xapp', android: { package: 'com.x' } } }),
    });
    const risk = await assessIdentityRisk(dir);
    expect(risk.risky).toBe(true);
    expect(risk.reasons.join(' ')).toContain('deep-link');
    await removeDir(dir);
  });

  it('uses a marker-delimited gradle block for native projects', async () => {
    // Reshape the manifest to a gradle target and give the worktree the file.
    const gradleManifest = { ...manifest, framework: 'react-native' as const };
    const wt = await lease('e-gradle');

    const identity = await applyCandidateIdentity({
      git,
      lease: wt,
      manifest: gradleManifest,
      slot: 'E',
      allowRisky: false,
    });

    expect(identity.applied).toBe(true);
    const gradle = await readFile(join(wt.path, 'android/app/build.gradle'), 'utf8');
    expect(gradle).toContain(GRADLE_MARKER_BEGIN);
    expect(gradle).toContain('applicationIdSuffix ".designlab.e"');
  });
});

describe('merge-readiness', () => {
  let repo: FixtureRepo;
  let git: GitClient;
  let contract: FunctionalityContract;

  beforeEach(async () => {
    repo = await createFixtureRepo(RN_APP_FILES);
    git = new GitClient({ cwd: repo.path });
    const { manifest } = await inspectRepository({
      repoDir: repo.path,
      projectId: 'merge-test-00000001',
      repoUrl: 'https://github.com/test/fieldnotes',
      branch: 'main',
      sha: repo.headSha,
      aiEnrichment: false,
    });
    contract = buildContract({ manifest, config: defaultConfig().protection });
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  /** Builds a candidate branch: design commit, then optional engine commits. */
  async function makeCandidateBranch(options: { engineCommits?: boolean; touchProtected?: boolean } = {}): Promise<string> {
    await git.run(['checkout', '-b', 'design/r001-a-test']);
    await writeFiles(repo.path, {
      'src/theme/theme.ts': 'export const theme = { colors: { bg: "#000", fg: "#fff" }, spacing: { sm: 4, md: 8 }, radius: 0 };\n',
      ...(options.touchProtected ? { 'src/api/client.ts': '// changed by a design\n' } : {}),
    });
    await git.stageAll();
    await git.commit('design(a): dense dark theme');

    if (options.engineCommits) {
      await writeFiles(repo.path, { '.github/workflows/designlab-android.yml': 'name: x\n' });
      await git.stageAll();
      await git.commit('designlab: add build workflow [designlab-plumbing]');
      await writeFiles(repo.path, { 'app.json': JSON.stringify({ expo: { name: 'FieldNotes A', slug: 'fieldnotes', android: { package: 'com.example.fieldnotes.designlab.a' } } }, null, 2) });
      await git.stageAll();
      await git.commit('designlab: temporary candidate identity A [designlab-identity]');
    }

    const tip = await git.headSha();
    await git.checkout('main');
    return tip;
  }

  it('is MERGE_READY for a clean design branch, peeling engine commits off the tip', async () => {
    await makeCandidateBranch({ engineCommits: true });

    const result = await checkMergeReadiness({
      git,
      contract,
      protectionConfig: defaultConfig().protection,
      candidateRef: 'design/r001-a-test',
      baseRef: 'main',
    });

    expect(result.ready).toBe(true);
    expect(result.engineCommits).toHaveLength(2);
    // The design head is the commit BELOW the engine commits.
    expect(await git.commitSubject(result.designHeadSha)).toBe('design(a): dense dark theme');
    expect(result.protection.passed).toBe(true);
    expect(result.conflicts).toEqual({ checked: true, clean: true, files: [] });
    expect(result.instructions.join('\n')).toContain(result.designHeadSha);
  });

  it('the identity overlay never reaches the merge content', async () => {
    await makeCandidateBranch({ engineCommits: true });
    const result = await checkMergeReadiness({
      git,
      contract,
      protectionConfig: defaultConfig().protection,
      candidateRef: 'design/r001-a-test',
      baseRef: 'main',
    });

    // app.json at the design head is byte-identical to base: the suffixed
    // package exists only in the engine commit that will be dropped.
    const baseAppJson = await git.showFile('main', 'app.json');
    const designAppJson = await git.showFile(result.designHeadSha, 'app.json');
    expect(designAppJson).toBe(baseAppJson);
    expect(designAppJson).not.toContain('.designlab.');
  });

  it('blocks when the design content violates the contract', async () => {
    await makeCandidateBranch({ touchProtected: true });

    const result = await checkMergeReadiness({
      git,
      contract,
      protectionConfig: defaultConfig().protection,
      candidateRef: 'design/r001-a-test',
      baseRef: 'main',
    });

    expect(result.ready).toBe(false);
    expect(result.blockers.join(' ')).toContain('Functionality Contract');
    expect(result.protection.violations.map((violation) => violation.path)).toContain('src/api/client.ts');
  });

  it('blocks when an engine commit is buried under design commits', async () => {
    await git.run(['checkout', '-b', 'design/r001-b-buried']);
    await writeFiles(repo.path, { 'app.json': JSON.stringify({ expo: { name: 'FieldNotes B', slug: 'fieldnotes', android: { package: 'com.example.fieldnotes.designlab.b' } } }) });
    await git.stageAll();
    await git.commit('designlab: temporary candidate identity B [designlab-identity]');
    await writeFiles(repo.path, { 'src/theme/theme.ts': 'export const theme = {};\n' });
    await git.stageAll();
    await git.commit('design(b): later design work');
    await git.checkout('main');

    const result = await checkMergeReadiness({
      git,
      contract,
      protectionConfig: defaultConfig().protection,
      candidateRef: 'design/r001-b-buried',
      baseRef: 'main',
    });

    expect(result.ready).toBe(false);
    expect(result.blockers.join(' ')).toContain('buried');
  });

  it('blocks when the merge would conflict with newer base work', async () => {
    await makeCandidateBranch();
    // Base moves on and edits the same file differently.
    await commitChanges(repo.path, {
      'src/theme/theme.ts': 'export const theme = { colors: { bg: "#eee" } };\n',
    });

    const result = await checkMergeReadiness({
      git,
      contract,
      protectionConfig: defaultConfig().protection,
      candidateRef: 'design/r001-a-test',
      baseRef: 'main',
    });

    expect(result.ready).toBe(false);
    expect(result.conflicts).toMatchObject({ checked: true, clean: false });
    expect(result.blockers.join(' ')).toContain('conflict');
  });

  it('re-checks protection at merge time rather than trusting round records', async () => {
    // A branch whose design commit was fine when made, but the CONTRACT
    // changed since (simulated by a stricter user rule at check time).
    await makeCandidateBranch();
    const stricter = buildContract({
      manifest: {
        ...(await inspectRepository({
          repoDir: repo.path,
          projectId: 'merge-test-00000001',
          repoUrl: 'https://github.com/test/fieldnotes',
          branch: 'main',
          sha: repo.headSha,
          aiEnrichment: false,
        })).manifest,
      },
      config: {
        ...defaultConfig().protection,
        rules: [{ pattern: 'src/theme/**', level: 'PROTECTED', reason: 'theme frozen for release week' }],
      },
    });

    const result = await checkMergeReadiness({
      git,
      contract: stricter,
      protectionConfig: defaultConfig().protection,
      candidateRef: 'design/r001-a-test',
      baseRef: 'main',
    });

    expect(result.ready).toBe(false);
  });
});
