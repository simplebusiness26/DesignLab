/**
 * Worktree manager.
 *
 * Enforces DesignLab's Git isolation guarantees as code rather than as
 * instructions to a model:
 *
 *  - every candidate in a round starts from the *same* base commit;
 *  - each candidate gets its own branch and its own worktree directory;
 *  - a builder is confined to its own worktree (verified, not assumed);
 *  - the target's base branch is never checked out, modified or force-pushed;
 *  - design branches are never merged automatically;
 *  - cleanup removes local worktrees but never remote branches unless the
 *    caller explicitly asks.
 */

import { isAbsolute, relative, resolve, sep } from 'node:path';

import { DesignLabError } from '../core/errors.js';
import { ensureDir, isDirectory, pathExists, removeDir } from '../core/fsx.js';
import type { Logger } from '../core/logger.js';
import { nullLogger } from '../core/logger.js';
import type { GitClient, WorktreeInfo } from './git-client.js';

export interface WorktreeLease {
  /** Branch created for this candidate. */
  branch: string;
  /** Absolute path the builder is allowed to write to. */
  path: string;
  /** Commit the branch was created from. */
  baseSha: string;
  /** Directory name under the project's worktrees directory. */
  name: string;
}

export interface WorktreeManagerOptions {
  git: GitClient;
  /** Root directory that contains every worktree for this project. */
  worktreesRoot: string;
  logger?: Logger;
  /**
   * Branches that must never be checked out into a DesignLab worktree,
   * modified, or pushed to. Always includes the round's base branch.
   */
  protectedBranches?: readonly string[];
}

export class WorktreeManager {
  private readonly git: GitClient;
  private readonly worktreesRoot: string;
  private readonly logger: Logger;
  private readonly protectedBranches: Set<string>;

  /**
   * `git worktree add` and `git worktree remove` both mutate shared metadata
   * under `.git/worktrees/`, and Git does not lock that directory against
   * itself. Two concurrent calls can therefore fail with an error as opaque as
   * "failed to read .git/worktrees/<other>/commondir". Every mutating
   * operation is queued through this chain so callers may fan out freely.
   */
  private mutations: Promise<unknown> = Promise.resolve();

  constructor(options: WorktreeManagerOptions) {
    this.git = options.git;
    this.worktreesRoot = resolve(options.worktreesRoot);
    this.logger = (options.logger ?? nullLogger).child({ scope: 'worktree' });
    this.protectedBranches = new Set(options.protectedBranches ?? []);
  }

  /** Marks a branch as never-writable (the round base branch, typically). */
  protectBranch(branch: string): void {
    this.protectedBranches.add(branch);
  }

  isProtectedBranch(branch: string): boolean {
    return this.protectedBranches.has(branch);
  }

  /** Serialises a Git worktree mutation behind any already in flight. */
  private serialise<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutations.then(operation, operation);
    // Keep the chain alive regardless of outcome; failures surface to the
    // caller through `result`, not through the queue.
    this.mutations = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /**
   * Creates an isolated worktree on a new branch rooted at `baseSha`.
   *
   * Refuses to reuse a directory that already contains a different worktree,
   * so two candidates can never be handed the same working directory.
   */
  create(options: {
    name: string;
    branch: string;
    baseSha: string;
    /** Replace an existing worktree/branch with the same name. */
    force?: boolean;
  }): Promise<WorktreeLease> {
    return this.serialise(() => this.createUnsafe(options));
  }

  private async createUnsafe(options: {
    name: string;
    branch: string;
    baseSha: string;
    force?: boolean;
  }): Promise<WorktreeLease> {
    const { name, branch, baseSha } = options;

    if (this.protectedBranches.has(branch)) {
      throw new DesignLabError('GIT_UNSAFE', `Refusing to create a worktree on protected branch "${branch}"`, {
        details: { branch },
        hint: 'Design branches must use the design/ prefix, never the target base branch.',
      });
    }

    const path = resolve(this.worktreesRoot, name);
    this.assertInsideRoot(path);
    await ensureDir(this.worktreesRoot);

    const existing = await this.findWorktree(path);
    if (existing) {
      if (!options.force) {
        if (existing.branch === branch) {
          this.logger.debug('reusing existing worktree', { path, branch });
          return { branch, path, baseSha, name };
        }
        throw new DesignLabError(
          'WORKTREE_CONFLICT',
          `Worktree directory ${path} is already checked out on "${existing.branch ?? 'detached HEAD'}"`,
          {
            details: { path, expected: branch, actual: existing.branch },
            hint: 'Run "designlab clean" or pass --force to recreate the worktree.',
          },
        );
      }
      // destroyUnsafe, not destroy: we already hold the mutation slot.
      await this.destroyUnsafe(path, { force: true });
    } else if (await pathExists(path)) {
      if (!options.force) {
        throw new DesignLabError('WORKTREE_CONFLICT', `Directory ${path} already exists and is not a worktree`, {
          details: { path },
          hint: 'Remove the directory, or pass --force.',
        });
      }
      await removeDir(path);
    }

    if (await this.git.branchExists(branch)) {
      if (!options.force) {
        throw new DesignLabError('WORKTREE_CONFLICT', `Branch "${branch}" already exists`, {
          details: { branch },
          hint: 'Choose a different design slug, or pass --force to recreate the branch.',
        });
      }
      await this.git.deleteLocalBranch(branch, true);
    }

    await this.git.addWorktree(path, branch, baseSha);
    // A worktree inherits repo config, but identity may be absent in CI.
    await this.git.withCwd(path).ensureIdentity();

    this.logger.info('worktree created', { branch, path, baseSha: baseSha.slice(0, 8) });
    return { branch, path, baseSha, name };
  }

  /**
   * Verifies that a lease still describes reality before work is dispatched
   * into it, and that the builder has not wandered onto another branch.
   */
  async verifyLease(lease: WorktreeLease): Promise<void> {
    const info = await this.findWorktree(lease.path);
    if (!info) {
      throw new DesignLabError('WORKTREE_CONFLICT', `Worktree ${lease.path} is missing`, {
        details: { lease },
        hint: 'Re-run the round; the worktree was removed or never created.',
      });
    }
    if (info.branch !== lease.branch) {
      throw new DesignLabError(
        'WORKTREE_CONFLICT',
        `Worktree ${lease.path} is on "${info.branch ?? 'detached HEAD'}" but the lease expects "${lease.branch}"`,
        { details: { lease, actual: info.branch } },
      );
    }
  }

  /**
   * Confirms that a path a worker wants to touch lies inside its own lease.
   * Used to reject cross-worktree access before it happens.
   */
  assertWithinLease(lease: WorktreeLease, candidatePath: string): void {
    const target = resolve(candidatePath);
    const rel = relative(resolve(lease.path), target);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new DesignLabError('GIT_UNSAFE', `Path ${target} is outside worktree ${lease.path}`, {
        details: { lease: lease.path, target },
        hint: 'Builders may only modify files inside their own assigned worktree.',
      });
    }
  }

  async findWorktree(path: string): Promise<WorktreeInfo | null> {
    const target = resolve(path);
    const worktrees = await this.git.listWorktrees();
    return worktrees.find((worktree) => resolve(worktree.path) === target) ?? null;
  }

  async list(): Promise<WorktreeInfo[]> {
    const worktrees = await this.git.listWorktrees();
    return worktrees.filter((worktree) => !worktree.isMain && this.isInsideRoot(worktree.path));
  }

  /**
   * Removes a worktree directory and, optionally, its local branch.
   * Never touches remote refs.
   */
  destroy(path: string, options: { force?: boolean; deleteBranch?: boolean } = {}): Promise<void> {
    return this.serialise(() => this.destroyUnsafe(path, options));
  }

  private async destroyUnsafe(
    path: string,
    options: { force?: boolean; deleteBranch?: boolean } = {},
  ): Promise<void> {
    const target = resolve(path);
    this.assertInsideRoot(target);

    const info = await this.findWorktree(target);
    if (info) {
      if (info.isMain) {
        throw new DesignLabError('GIT_UNSAFE', 'Refusing to remove the main working tree', {
          details: { path: target },
        });
      }
      await this.git.removeWorktree(target, options.force ?? false).catch(async (error: unknown) => {
        if (!options.force) throw error;
        await removeDir(target);
        await this.git.pruneWorktrees();
      });

      if (options.deleteBranch && info.branch && !this.protectedBranches.has(info.branch)) {
        await this.git.deleteLocalBranch(info.branch, true).catch(() => {
          this.logger.warn('could not delete local branch', { branch: info.branch });
        });
      }
    } else if (await isDirectory(target)) {
      await removeDir(target);
    }

    await this.git.pruneWorktrees();
    this.logger.debug('worktree destroyed', { path: target, deleteBranch: options.deleteBranch ?? false });
  }

  /**
   * Removes every worktree under this project's root. Local branches are kept
   * by default: a pushed design branch is a permanent artifact, and deleting
   * its local counterpart would lose nothing but deleting it silently would
   * surprise the operator.
   */
  cleanAll(options: { force?: boolean; deleteBranches?: boolean } = {}): Promise<string[]> {
    return this.serialise(async () => {
      const removed: string[] = [];
      for (const worktree of await this.list()) {
        await this.destroyUnsafe(worktree.path, {
          force: options.force ?? true,
          deleteBranch: options.deleteBranches ?? false,
        });
        removed.push(worktree.path);
      }
      return removed;
    });
  }

  /**
   * Removes worktrees whose directory has vanished, plus any leftover
   * directory that Git no longer tracks. Safe to run at the start of a round.
   */
  async reconcile(): Promise<{ pruned: number; orphaned: string[] }> {
    await this.git.pruneWorktrees();
    const tracked = new Set((await this.list()).map((worktree) => resolve(worktree.path)));
    const orphaned: string[] = [];

    if (await isDirectory(this.worktreesRoot)) {
      const { readdir } = await import('node:fs/promises');
      const entries = await readdir(this.worktreesRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const path = resolve(this.worktreesRoot, entry.name);
        if (!tracked.has(path)) orphaned.push(path);
      }
    }

    return { pruned: tracked.size, orphaned };
  }

  private isInsideRoot(path: string): boolean {
    const rel = relative(this.worktreesRoot, resolve(path));
    return rel !== '' && !rel.startsWith('..') && !rel.startsWith(sep);
  }

  private assertInsideRoot(path: string): void {
    if (!this.isInsideRoot(path)) {
      throw new DesignLabError('GIT_UNSAFE', `Refusing to operate on ${path}: outside ${this.worktreesRoot}`, {
        details: { path, root: this.worktreesRoot },
      });
    }
  }
}

/**
 * Guard used before any push. DesignLab pushes design branches only; the
 * target's base branch is read-only from DesignLab's point of view.
 */
export function assertPushSafe(branch: string, protectedBranches: readonly string[], branchPrefix: string): void {
  if (protectedBranches.includes(branch)) {
    throw new DesignLabError('GIT_UNSAFE', `Refusing to push protected branch "${branch}"`, {
      details: { branch, protectedBranches },
      hint: 'DesignLab only ever pushes branches it created under the design prefix.',
    });
  }
  const prefix = branchPrefix.replace(/\/+$/, '');
  if (!branch.startsWith(`${prefix}/`)) {
    throw new DesignLabError('GIT_UNSAFE', `Refusing to push "${branch}": not a DesignLab design branch`, {
      details: { branch, expectedPrefix: `${prefix}/` },
    });
  }
}
