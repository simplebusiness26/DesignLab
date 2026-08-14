/**
 * Integration tests for the Git and worktree layer, against real repositories.
 *
 * These verify the isolation guarantees DesignLab's whole safety story rests
 * on, so they deliberately use genuine `git` invocations rather than mocks.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GitClient, parseNameStatusZ, parseNumstatZ, parseWorktreeList } from '../../src/git/git-client.js';
import { WorktreeManager, assertPushSafe } from '../../src/git/worktree-manager.js';
import { DesignLabError } from '../../src/core/errors.js';
import {
  commitChanges,
  createFixtureRepo,
  deleteFile,
  makeTempDir,
  renameFile,
  RN_APP_FILES,
  type FixtureRepo,
} from '../helpers/fixture-repo.js';
import { removeDir } from '../../src/core/fsx.js';

describe('GitClient', () => {
  let repo: FixtureRepo;
  let git: GitClient;

  beforeEach(async () => {
    repo = await createFixtureRepo(RN_APP_FILES);
    git = new GitClient({ cwd: repo.path });
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('recognises a repository and resolves its HEAD', async () => {
    expect(await git.isRepository()).toBe(true);
    expect(await git.headSha()).toBe(repo.headSha);
    expect(await git.currentBranch()).toBe('main');
  });

  it('returns null rather than throwing for a missing ref', async () => {
    expect(await git.tryRevParse('refs/heads/nope')).toBeNull();
    expect(await git.branchExists('nope')).toBe(false);
  });

  it('throws a typed error for a failing command', async () => {
    await expect(git.run(['rev-parse', 'refs/heads/definitely-missing'])).rejects.toThrow(DesignLabError);
  });

  it('reports changed files with per-file line counts', async () => {
    const head = await commitChanges(repo.path, {
      'src/theme/theme.ts': 'export const theme = { colors: { background: "#000" } };\n',
      'src/theme/new-tokens.ts': 'export const tokens = { radius: 24 };\n',
    });

    const changes = await git.changedFiles(repo.headSha, head);
    const byPath = new Map(changes.map((change) => [change.path, change]));

    expect(byPath.get('src/theme/theme.ts')?.changeType).toBe('modified');
    expect(byPath.get('src/theme/new-tokens.ts')?.changeType).toBe('added');
    expect(byPath.get('src/theme/new-tokens.ts')?.additions).toBeGreaterThan(0);
  });

  it('classifies deletions', async () => {
    const head = await deleteFile(repo.path, 'src/components/Button.tsx');
    const changes = await git.changedFiles(repo.headSha, head);
    expect(changes.find((change) => change.path === 'src/components/Button.tsx')?.changeType).toBe('deleted');
  });

  it('classifies renames and preserves the previous path', async () => {
    const head = await renameFile(repo.path, 'src/auth/session.ts', 'src/theme/session.ts');
    const changes = await git.changedFiles(repo.headSha, head);
    const renamed = changes.find((change) => change.path === 'src/theme/session.ts');

    // The previous path is what makes protection impossible to launder.
    expect(renamed?.changeType).toBe('renamed');
    expect(renamed?.previousPath).toBe('src/auth/session.ts');
  });

  it('handles paths containing spaces', async () => {
    const head = await commitChanges(repo.path, { 'src/theme/my tokens.ts': 'export const x = 1;\n' });
    const changes = await git.changedFiles(repo.headSha, head);
    expect(changes.map((change) => change.path)).toContain('src/theme/my tokens.ts');
  });

  it('commits staged work and reports null when there is nothing to commit', async () => {
    await git.ensureIdentity();
    expect(await git.commit('empty')).toBeNull();

    await writeFile(join(repo.path, 'src/theme/theme.ts'), 'export const theme = {};\n', 'utf8');
    await git.stageAll();
    const sha = await git.commit('design: restyle');

    expect(sha).toBeTruthy();
    expect(sha).not.toBe(repo.headSha);
    expect(await git.commitSubject('HEAD')).toBe('design: restyle');
  });

  it('detects the default branch', async () => {
    expect(await git.detectDefaultBranch()).toBe('main');
  });

  it('reports a clean and a dirty working tree', async () => {
    expect(await git.isClean()).toBe(true);
    await writeFile(join(repo.path, 'README.md'), 'changed\n', 'utf8');
    expect(await git.isClean()).toBe(false);
  });
});

describe('git output parsers', () => {
  it('parses --name-status -z including renames', () => {
    const output = ['M', 'src/a.ts', 'A', 'src/b.ts', 'D', 'src/c.ts', 'R100', 'src/old.ts', 'src/new.ts'].join('\0');
    const changes = parseNameStatusZ(output);

    expect(changes).toEqual([
      { path: 'src/a.ts', previousPath: null, changeType: 'modified' },
      { path: 'src/b.ts', previousPath: null, changeType: 'added' },
      { path: 'src/c.ts', previousPath: null, changeType: 'deleted' },
      { path: 'src/new.ts', previousPath: 'src/old.ts', changeType: 'renamed' },
    ]);
  });

  it('parses --numstat -z including binary files and renames', () => {
    const output = ['3\t1\tsrc/a.ts', '-\t-\tassets/logo.png', '5\t0\t', 'src/old.ts', 'src/new.ts'].join('\0');
    const stats = parseNumstatZ(output);

    expect(stats.get('src/a.ts')).toEqual({ additions: 3, deletions: 1, binary: false });
    expect(stats.get('assets/logo.png')?.binary).toBe(true);
    expect(stats.get('src/new.ts')).toEqual({ additions: 5, deletions: 0, binary: false });
  });

  it('parses worktree list --porcelain', () => {
    const output = [
      'worktree /repo',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      'worktree /repo/.designlab/worktrees/r001-a',
      'HEAD def456',
      'branch refs/heads/design/r001-a-immersive',
      '',
    ].join('\n');

    const worktrees = parseWorktreeList(output);
    expect(worktrees).toHaveLength(2);
    expect(worktrees[0]?.isMain).toBe(true);
    expect(worktrees[1]?.branch).toBe('design/r001-a-immersive');
    expect(worktrees[1]?.isMain).toBe(false);
  });
});

describe('WorktreeManager', () => {
  let repo: FixtureRepo;
  let git: GitClient;
  let worktreesRoot: string;
  let manager: WorktreeManager;

  beforeEach(async () => {
    repo = await createFixtureRepo(RN_APP_FILES);
    git = new GitClient({ cwd: repo.path });
    worktreesRoot = join(await makeTempDir('designlab-wt-'), 'worktrees');
    manager = new WorktreeManager({
      git,
      worktreesRoot,
      protectedBranches: ['main'],
    });
  });

  afterEach(async () => {
    await manager.cleanAll({ force: true }).catch(() => {});
    await removeDir(worktreesRoot);
    await repo.cleanup();
  });

  it('creates an isolated worktree on a new branch at the base commit', async () => {
    const lease = await manager.create({
      name: 'r001-a-immersive',
      branch: 'design/r001-a-immersive',
      baseSha: repo.headSha,
    });

    expect(lease.path).toBe(join(worktreesRoot, 'r001-a-immersive'));
    expect(await git.branchExists('design/r001-a-immersive')).toBe(true);

    const worktreeGit = git.withCwd(lease.path);
    expect(await worktreeGit.headSha()).toBe(repo.headSha);
    // The worktree really is a checkout of the target app.
    expect(await readFile(join(lease.path, 'src/theme/theme.ts'), 'utf8')).toContain('export const theme');
  });

  it('gives every candidate the same base commit but a different directory', async () => {
    const leases = await Promise.all(
      (['a', 'b', 'c', 'd'] as const).map((slot) =>
        manager.create({
          name: `r001-${slot}-design`,
          branch: `design/r001-${slot}-design`,
          baseSha: repo.headSha,
        }),
      ),
    );

    expect(new Set(leases.map((lease) => lease.baseSha)).size).toBe(1);
    expect(new Set(leases.map((lease) => lease.path)).size).toBe(4);

    for (const lease of leases) {
      expect(await git.withCwd(lease.path).headSha()).toBe(repo.headSha);
    }
  });

  it('serialises concurrent worktree creation instead of racing git metadata', async () => {
    // `git worktree add` mutates shared state under .git/worktrees/ and does
    // not lock against itself, so the manager must queue these internally.
    const leases = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        manager.create({
          name: `parallel-${index}`,
          branch: `design/r009-${index}-parallel`,
          baseSha: repo.headSha,
        }),
      ),
    );

    expect(leases).toHaveLength(6);
    expect(await manager.list()).toHaveLength(6);
    for (const lease of leases) {
      expect(await git.withCwd(lease.path).headSha()).toBe(repo.headSha);
    }
  });

  it('keeps the queue alive after a failed mutation', async () => {
    await expect(
      manager.create({ name: 'bad', branch: 'main', baseSha: repo.headSha }),
    ).rejects.toThrow();

    // A rejection must not poison later operations.
    const lease = await manager.create({
      name: 'after-failure',
      branch: 'design/r009-ok',
      baseSha: repo.headSha,
    });
    expect(lease.branch).toBe('design/r009-ok');
  });

  it('keeps one candidate’s edits invisible to another', async () => {
    const a = await manager.create({ name: 'r001-a', branch: 'design/r001-a', baseSha: repo.headSha });
    const b = await manager.create({ name: 'r001-b', branch: 'design/r001-b', baseSha: repo.headSha });

    await writeFile(join(a.path, 'src/theme/theme.ts'), 'export const theme = { variant: "a" };\n', 'utf8');
    const bTheme = await readFile(join(b.path, 'src/theme/theme.ts'), 'utf8');

    expect(bTheme).not.toContain('variant: "a"');
  });

  it('refuses to create a worktree on a protected branch', async () => {
    await expect(
      manager.create({ name: 'bad', branch: 'main', baseSha: repo.headSha }),
    ).rejects.toThrow(/protected branch/);
  });

  it('refuses to reuse a directory checked out on a different branch', async () => {
    await manager.create({ name: 'shared', branch: 'design/r001-a', baseSha: repo.headSha });

    await expect(
      manager.create({ name: 'shared', branch: 'design/r001-b', baseSha: repo.headSha }),
    ).rejects.toThrow(DesignLabError);
  });

  it('recreates a worktree when force is passed', async () => {
    await manager.create({ name: 'shared', branch: 'design/r001-a', baseSha: repo.headSha });
    const replaced = await manager.create({
      name: 'shared',
      branch: 'design/r001-b',
      baseSha: repo.headSha,
      force: true,
    });

    expect(replaced.branch).toBe('design/r001-b');
    expect((await manager.findWorktree(replaced.path))?.branch).toBe('design/r001-b');
  });

  it('refuses to operate outside its worktrees root', async () => {
    await expect(manager.destroy('/tmp/somewhere-else')).rejects.toThrow(/outside/);
  });

  it('verifies that a lease still describes reality', async () => {
    const lease = await manager.create({ name: 'r001-a', branch: 'design/r001-a', baseSha: repo.headSha });
    await expect(manager.verifyLease(lease)).resolves.toBeUndefined();

    await manager.destroy(lease.path, { force: true });
    await expect(manager.verifyLease(lease)).rejects.toThrow(/missing/);
  });

  it('rejects a path outside the assigned worktree', async () => {
    const lease = await manager.create({ name: 'r001-a', branch: 'design/r001-a', baseSha: repo.headSha });

    expect(() => manager.assertWithinLease(lease, join(lease.path, 'src/theme/theme.ts'))).not.toThrow();
    expect(() => manager.assertWithinLease(lease, join(worktreesRoot, 'r001-b/src/theme/theme.ts'))).toThrow(
      /outside worktree/,
    );
    expect(() => manager.assertWithinLease(lease, '/etc/passwd')).toThrow(/outside worktree/);
  });

  it('cleans worktrees while keeping local branches by default', async () => {
    await manager.create({ name: 'r001-a', branch: 'design/r001-a', baseSha: repo.headSha });
    await manager.create({ name: 'r001-b', branch: 'design/r001-b', baseSha: repo.headSha });

    const removed = await manager.cleanAll({ force: true });

    expect(removed).toHaveLength(2);
    expect(await manager.list()).toHaveLength(0);
    // A pushed design branch is a permanent artifact; cleanup must not assume.
    expect(await git.branchExists('design/r001-a')).toBe(true);
  });

  it('deletes local branches only when explicitly asked', async () => {
    await manager.create({ name: 'r001-a', branch: 'design/r001-a', baseSha: repo.headSha });
    await manager.cleanAll({ force: true, deleteBranches: true });
    expect(await git.branchExists('design/r001-a')).toBe(false);
  });

  it('reports directories git no longer tracks instead of deleting them', async () => {
    await mkdir(join(worktreesRoot, 'left-behind'), { recursive: true });
    await writeFile(join(worktreesRoot, 'left-behind', 'file.txt'), 'x', 'utf8');

    const { orphaned } = await manager.reconcile();
    expect(orphaned.some((path) => path.endsWith('left-behind'))).toBe(true);
  });
});

describe('assertPushSafe', () => {
  it('allows a design branch', () => {
    expect(() => assertPushSafe('design/r001-a-immersive', ['main'], 'design')).not.toThrow();
  });

  it('refuses a protected branch', () => {
    expect(() => assertPushSafe('main', ['main'], 'design')).toThrow(/protected branch/);
  });

  it('refuses any branch DesignLab did not create', () => {
    expect(() => assertPushSafe('feature/whatever', ['main'], 'design')).toThrow(/not a DesignLab design branch/);
  });

  it('honours a custom prefix', () => {
    expect(() => assertPushSafe('experiments/r001-a', ['main'], 'experiments')).not.toThrow();
    expect(() => assertPushSafe('design/r001-a', ['main'], 'experiments')).toThrow();
  });
});
