/**
 * Git client.
 *
 * A deliberately small, typed wrapper over the `git` binary. DesignLab's
 * isolation guarantees depend on Git behaving predictably, so every command
 * runs without a shell, with `core.hooksPath` disabled (a target repo's hooks
 * must never execute inside DesignLab's orchestration), and with a
 * non-interactive terminal so a credential prompt fails fast instead of
 * hanging a round.
 */

import { DesignLabError } from '../core/errors.js';
import { execCommand, formatCommand, summariseFailure, type ExecResult } from '../core/exec.js';
import type { Logger } from '../core/logger.js';
import { nullLogger } from '../core/logger.js';

export interface GitClientOptions {
  cwd: string;
  logger?: Logger;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export type ChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

export interface ChangedFile {
  path: string;
  /** Original path for renames. */
  previousPath: string | null;
  changeType: ChangeType;
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface WorktreeInfo {
  path: string;
  head: string | null;
  branch: string | null;
  detached: boolean;
  locked: boolean;
  /** True for the main working tree of the repository. */
  isMain: boolean;
}

export class GitClient {
  readonly cwd: string;
  private readonly logger: Logger;
  private readonly timeoutMs: number;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: GitClientOptions) {
    this.cwd = options.cwd;
    this.logger = (options.logger ?? nullLogger).child({ scope: 'git' });
    this.timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
    this.env = {
      ...(options.env ?? process.env),
      // Never let a target repository's hooks run inside DesignLab.
      GIT_CONFIG_NOSYSTEM: '1',
      // Fail fast rather than blocking on an interactive credential prompt.
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: '',
      // Deterministic output regardless of the operator's locale.
      LC_ALL: 'C',
    };
  }

  /** Returns a client bound to a different directory (e.g. a worktree). */
  withCwd(cwd: string): GitClient {
    return new GitClient({ cwd, logger: this.logger, timeoutMs: this.timeoutMs, env: this.env });
  }

  /** Runs git, returning the raw result without throwing on failure. */
  async raw(args: readonly string[], options: { cwd?: string; timeoutMs?: number } = {}): Promise<ExecResult> {
    const fullArgs = ['-c', 'core.hooksPath=/dev/null', ...args];
    const result = await execCommand('git', fullArgs, {
      cwd: options.cwd ?? this.cwd,
      env: this.env,
      timeoutMs: options.timeoutMs ?? this.timeoutMs,
    });
    this.logger.debug('git command', {
      command: formatCommand('git', args),
      exitCode: result.exitCode,
      durationMs: result.durationMs,
    });
    return result;
  }

  /** Runs git and throws a `GIT_FAILED` DesignLabError on a non-zero exit. */
  async run(args: readonly string[], options: { cwd?: string; timeoutMs?: number } = {}): Promise<string> {
    const result = await this.raw(args, options);
    if (!result.ok) {
      throw new DesignLabError('GIT_FAILED', `git ${args[0] ?? ''} failed: ${summariseFailure(result, 800)}`, {
        details: {
          command: formatCommand('git', args),
          exitCode: result.exitCode,
          cwd: result.cwd,
        },
      });
    }
    return result.stdout.trim();
  }

  // -- repository facts ----------------------------------------------------

  async isRepository(): Promise<boolean> {
    const result = await this.raw(['rev-parse', '--is-inside-work-tree']);
    return result.ok && result.stdout.trim() === 'true';
  }

  async revParse(ref: string): Promise<string> {
    return this.run(['rev-parse', ref]);
  }

  async tryRevParse(ref: string): Promise<string | null> {
    const result = await this.raw(['rev-parse', '--verify', '--quiet', ref]);
    return result.ok ? result.stdout.trim() : null;
  }

  async currentBranch(): Promise<string | null> {
    const result = await this.raw(['symbolic-ref', '--short', '-q', 'HEAD']);
    return result.ok ? result.stdout.trim() : null;
  }

  async headSha(cwd?: string): Promise<string> {
    return this.run(['rev-parse', 'HEAD'], cwd ? { cwd } : {});
  }

  async branchExists(branch: string): Promise<boolean> {
    const result = await this.raw(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
    return result.ok;
  }

  async remoteBranchExists(remote: string, branch: string): Promise<boolean> {
    const result = await this.raw(['ls-remote', '--exit-code', '--heads', remote, branch]);
    return result.ok;
  }

  async listBranches(): Promise<string[]> {
    const output = await this.run(['for-each-ref', '--format=%(refname:short)', 'refs/heads']);
    return output.split('\n').map((line) => line.trim()).filter(Boolean);
  }

  async remoteUrl(remote = 'origin'): Promise<string | null> {
    const result = await this.raw(['remote', 'get-url', remote]);
    return result.ok ? result.stdout.trim() : null;
  }

  /** Detects the remote HEAD branch, falling back to common defaults. */
  async detectDefaultBranch(remote = 'origin'): Promise<string> {
    const symbolic = await this.raw(['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`]);
    if (symbolic.ok) {
      const value = symbolic.stdout.trim();
      const stripped = value.startsWith(`${remote}/`) ? value.slice(remote.length + 1) : value;
      if (stripped) return stripped;
    }
    for (const candidate of ['main', 'master', 'develop']) {
      if (await this.branchExists(candidate)) return candidate;
    }
    return (await this.currentBranch()) ?? 'main';
  }

  async isClean(cwd?: string): Promise<boolean> {
    const result = await this.raw(['status', '--porcelain'], cwd ? { cwd } : {});
    return result.ok && result.stdout.trim() === '';
  }

  async commitSubject(ref: string): Promise<string> {
    return this.run(['log', '-1', '--format=%s', ref]);
  }

  // -- fetching and cloning ------------------------------------------------

  async clone(repoUrl: string, destination: string, options: { branch?: string; depth?: number } = {}): Promise<void> {
    const args = ['clone'];
    if (options.depth && options.depth > 0) args.push('--depth', String(options.depth));
    if (options.branch) args.push('--branch', options.branch);
    args.push(repoUrl, destination);
    const result = await this.raw(args, { cwd: process.cwd() });
    if (!result.ok) {
      throw new DesignLabError('GIT_FAILED', `Failed to clone ${repoUrl}: ${summariseFailure(result, 800)}`, {
        details: { repoUrl, destination, exitCode: result.exitCode },
        hint: 'Check the URL, network access, and that credentials are available to git.',
        retryable: true,
      });
    }
  }

  async fetch(remote: string, refspec?: string): Promise<void> {
    const args = ['fetch', '--prune', remote];
    if (refspec) args.push(refspec);
    await this.run(args);
  }

  async checkout(ref: string, cwd?: string): Promise<void> {
    await this.run(['checkout', ref], cwd ? { cwd } : {});
  }

  // -- diffing -------------------------------------------------------------

  /**
   * Files changed between two commits, with per-file line counts.
   * Uses `--no-renames`-free numstat plus name-status so renames are
   * classified correctly — a rename of a protected file is still a change to
   * a protected file.
   */
  async changedFiles(baseRef: string, headRef: string, cwd?: string): Promise<ChangedFile[]> {
    const options = cwd ? { cwd } : {};
    const nameStatus = await this.run(
      ['diff', '--name-status', '-M', '-z', `${baseRef}..${headRef}`],
      options,
    );
    const numstat = await this.run(['diff', '--numstat', '-M', '-z', `${baseRef}..${headRef}`], options);

    const stats = parseNumstatZ(numstat);
    const changes = parseNameStatusZ(nameStatus);

    return changes.map((change) => {
      const stat = stats.get(change.path) ?? { additions: 0, deletions: 0, binary: false };
      return {
        path: change.path,
        previousPath: change.previousPath,
        changeType: change.changeType,
        additions: stat.additions,
        deletions: stat.deletions,
        binary: stat.binary,
      };
    });
  }

  /** Uncommitted changes in a working tree, relative to HEAD. */
  async workingTreeChanges(cwd?: string): Promise<string[]> {
    const output = await this.run(['status', '--porcelain=v1', '-z'], cwd ? { cwd } : {});
    return output
      .split('\0')
      .map((entry) => entry.slice(3).trim())
      .filter(Boolean);
  }

  async diffText(baseRef: string, headRef: string, paths: readonly string[] = [], cwd?: string): Promise<string> {
    const args = ['diff', '-M', `${baseRef}..${headRef}`];
    if (paths.length > 0) args.push('--', ...paths);
    return this.run(args, cwd ? { cwd } : {});
  }

  async diffStat(baseRef: string, headRef: string, cwd?: string): Promise<string> {
    return this.run(['diff', '--stat', '-M', `${baseRef}..${headRef}`], cwd ? { cwd } : {});
  }

  // -- committing ----------------------------------------------------------

  async stageAll(cwd?: string): Promise<void> {
    await this.run(['add', '-A'], cwd ? { cwd } : {});
  }

  /**
   * Commits staged changes. Returns null when there is nothing to commit,
   * which the orchestrator treats as "the builder made no changes" rather
   * than as an error.
   */
  async commit(message: string, cwd?: string): Promise<string | null> {
    const options = cwd ? { cwd } : {};
    const staged = await this.raw(['diff', '--cached', '--quiet'], options);
    if (staged.ok) return null; // exit 0 means no staged differences
    await this.run(['commit', '--no-verify', '-m', message], options);
    return this.run(['rev-parse', 'HEAD'], options);
  }

  async push(
    remote: string,
    branch: string,
    options: { cwd?: string; setUpstream?: boolean; force?: boolean } = {},
  ): Promise<ExecResult> {
    const args = ['push'];
    if (options.setUpstream !== false) args.push('-u');
    if (options.force) args.push('--force-with-lease');
    args.push(remote, `refs/heads/${branch}:refs/heads/${branch}`);
    return this.raw(args, options.cwd ? { cwd: options.cwd } : {});
  }

  // -- worktrees -----------------------------------------------------------

  async listWorktrees(): Promise<WorktreeInfo[]> {
    const output = await this.run(['worktree', 'list', '--porcelain']);
    return parseWorktreeList(output);
  }

  async addWorktree(path: string, branch: string, startPoint: string): Promise<void> {
    await this.run(['worktree', 'add', '-b', branch, path, startPoint]);
  }

  async addWorktreeForExistingBranch(path: string, branch: string): Promise<void> {
    await this.run(['worktree', 'add', path, branch]);
  }

  async removeWorktree(path: string, force = false): Promise<void> {
    const args = ['worktree', 'remove'];
    if (force) args.push('--force');
    args.push(path);
    await this.run(args);
  }

  async pruneWorktrees(): Promise<void> {
    await this.run(['worktree', 'prune']);
  }

  async deleteLocalBranch(branch: string, force = false): Promise<void> {
    await this.run(['branch', force ? '-D' : '-d', branch]);
  }

  /** Configures identity locally so commits succeed in CI-like environments. */
  async ensureIdentity(name = 'DesignLab', email = 'designlab@localhost'): Promise<void> {
    const existingName = await this.raw(['config', 'user.name']);
    if (!existingName.ok || !existingName.stdout.trim()) {
      await this.run(['config', 'user.name', name]);
    }
    const existingEmail = await this.raw(['config', 'user.email']);
    if (!existingEmail.ok || !existingEmail.stdout.trim()) {
      await this.run(['config', 'user.email', email]);
    }
  }
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

interface ParsedChange {
  path: string;
  previousPath: string | null;
  changeType: ChangeType;
}

/**
 * `git diff --name-status -z` emits NUL-separated fields. Renames and copies
 * occupy three fields (status, old path, new path); everything else two.
 */
export function parseNameStatusZ(output: string): ParsedChange[] {
  const fields = output.split('\0').filter((field) => field.length > 0);
  const changes: ParsedChange[] = [];

  for (let index = 0; index < fields.length; ) {
    const status = fields[index];
    if (!status) break;
    const code = status[0];

    if (code === 'R' || code === 'C') {
      const previousPath = fields[index + 1];
      const path = fields[index + 2];
      index += 3;
      if (!path || !previousPath) continue;
      changes.push({ path, previousPath, changeType: 'renamed' });
      continue;
    }

    const path = fields[index + 1];
    index += 2;
    if (!path) continue;
    changes.push({
      path,
      previousPath: null,
      changeType: code === 'A' ? 'added' : code === 'D' ? 'deleted' : 'modified',
    });
  }

  return changes;
}

interface NumstatEntry {
  additions: number;
  deletions: number;
  binary: boolean;
}

/**
 * `git diff --numstat -z` emits `add\tdel\tpath\0`, except for renames where
 * the path is replaced by `\0oldpath\0newpath`. Binary files report `-`.
 */
export function parseNumstatZ(output: string): Map<string, NumstatEntry> {
  const stats = new Map<string, NumstatEntry>();
  const fields = output.split('\0');

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (!field) continue;
    const match = /^([0-9]+|-)\t([0-9]+|-)\t(.*)$/.exec(field);
    if (!match) continue;
    const [, addRaw, delRaw, pathPart] = match;
    const binary = addRaw === '-' || delRaw === '-';
    const entry: NumstatEntry = {
      additions: binary ? 0 : Number.parseInt(addRaw ?? '0', 10),
      deletions: binary ? 0 : Number.parseInt(delRaw ?? '0', 10),
      binary,
    };

    if (pathPart === '') {
      // Rename form: the next two fields are old path then new path.
      const newPath = fields[index + 2];
      index += 2;
      if (newPath) stats.set(newPath, entry);
      continue;
    }
    if (pathPart) stats.set(pathPart, entry);
  }

  return stats;
}

export function parseWorktreeList(output: string): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = [];
  let current: Partial<WorktreeInfo> | null = null;
  let isFirst = true;

  const flush = (): void => {
    if (current?.path) {
      worktrees.push({
        path: current.path,
        head: current.head ?? null,
        branch: current.branch ?? null,
        detached: current.detached ?? false,
        locked: current.locked ?? false,
        isMain: current.isMain ?? false,
      });
    }
    current = null;
  };

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (trimmed.startsWith('worktree ')) {
      flush();
      current = { path: trimmed.slice('worktree '.length), isMain: isFirst };
      isFirst = false;
      continue;
    }
    if (!current) continue;
    if (trimmed.startsWith('HEAD ')) current.head = trimmed.slice('HEAD '.length);
    else if (trimmed.startsWith('branch ')) current.branch = trimmed.slice('branch refs/heads/'.length);
    else if (trimmed === 'detached') current.detached = true;
    else if (trimmed.startsWith('locked')) current.locked = true;
  }
  flush();

  return worktrees;
}
