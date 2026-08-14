/**
 * CLI execution context.
 *
 * Resolves config, paths, logger, store and agent runner once per command, so
 * individual commands contain product logic rather than wiring. Also owns
 * target-repository acquisition: cloning or reusing the workspace clone and
 * resolving the exact commit a command will operate on.
 */

import { isAbsolute, resolve } from 'node:path';

import { applyEnvOverrides, loadConfigFile, type DesignLabConfig } from '../config/config.js';
import { createAgentRunner, LedgeredRunner } from '../agents/runner-factory.js';
import type { AgentRunner } from '../agents/types.js';
import { DesignLabError } from '../core/errors.js';
import { ensureDir, isDirectory, pathExists } from '../core/fsx.js';
import { normaliseRepoUrl, projectIdFromRepo } from '../core/ids.js';
import { Logger, resolveLogLevel, type LogLevel } from '../core/logger.js';
import { createPaths, type DesignLabPaths } from '../core/paths.js';
import { Store } from '../core/store.js';
import { GitClient } from '../git/git-client.js';
import type { ProjectRecord } from '../core/schemas.js';

export interface GlobalOptions {
  cwd?: string;
  config?: string;
  logLevel?: string;
  json?: boolean;
  dryRun?: boolean;
}

export interface CliContext {
  config: DesignLabConfig;
  paths: DesignLabPaths;
  logger: Logger;
  store: Store;
  /** True when the command should avoid model calls and remote writes. */
  dryRun: boolean;
  /** True when the command should emit machine-readable JSON on stdout. */
  json: boolean;
  createRunner(context?: { projectId?: string; round?: number | null }): AgentRunner;
}

export async function createContext(options: GlobalOptions): Promise<CliContext> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const configPath = options.config
    ? isAbsolute(options.config)
      ? options.config
      : resolve(cwd, options.config)
    : resolve(cwd, 'designlab.config.json');

  const { config: fileConfig } = await loadConfigFile(configPath);
  const config = applyEnvOverrides(fileConfig);

  const dryRun = options.dryRun ?? false;
  const level: LogLevel = resolveLogLevel(options.logLevel, config.logLevel);

  const logger = new Logger({
    level,
    // JSON output on stdout means human logs on stderr would be confusing;
    // structured logs keep both machine-readable.
    format: options.json ? 'json' : config.logFormat,
  });

  const paths = createPaths(cwd, config.workspaceDir);
  const store = new Store(paths);

  return {
    config,
    paths,
    logger,
    store,
    dryRun,
    json: options.json ?? false,
    createRunner(runnerContext = {}) {
      const inner = createAgentRunner(config, { logger, forceMock: dryRun });
      return new LedgeredRunner(inner, { store, logger, context: runnerContext });
    },
  };
}

// ---------------------------------------------------------------------------
// Target repository resolution
// ---------------------------------------------------------------------------

export interface TargetRepo {
  projectId: string;
  repoUrl: string;
  /** Set when the target is a local directory rather than a remote. */
  localPath: string | null;
  /** Working clone DesignLab operates on. */
  repoDir: string;
  branch: string;
  sha: string;
  git: GitClient;
}

export interface ResolveTargetOptions {
  context: CliContext;
  /** Repository URL or local path. Falls back to config, then to the project record. */
  repo?: string | undefined;
  branch?: string | undefined;
  /** Fetch the latest commits before resolving the SHA. */
  refresh?: boolean;
}

/**
 * Ensures a working clone of the target exists and resolves the exact commit
 * the command will use. A local directory target is cloned into the workspace
 * rather than operated on in place, so DesignLab never creates branches or
 * worktrees inside a user's own checkout.
 */
export async function resolveTarget(options: ResolveTargetOptions): Promise<TargetRepo> {
  const { context } = options;
  const repoInput = options.repo ?? context.config.repo;

  if (!repoInput) {
    throw new DesignLabError('CONFIG_MISSING', 'No target repository specified', {
      hint: 'Pass --repo <url|path>, or set "repo" in designlab.config.json (run "designlab init").',
    });
  }

  const localPath = await resolveLocalPath(repoInput, context.paths.cwd);
  const repoUrl = localPath ?? repoInput;
  const projectId = projectIdFromRepo(repoUrl);
  const repoDir = context.paths.repoDir(projectId);

  await ensureDir(context.paths.workspaceDir);

  const cloneSource = localPath ?? repoInput;
  const bootstrap = new GitClient({ cwd: context.paths.cwd, logger: context.logger });

  if (!(await isDirectory(repoDir))) {
    context.logger.info('cloning target repository', { repo: redactUrl(repoUrl), into: repoDir });
    await bootstrap.clone(cloneSource, repoDir, options.branch ? { branch: options.branch } : {});
  }

  const git = new GitClient({ cwd: repoDir, logger: context.logger });
  await git.ensureIdentity();

  if (!(await git.isRepository())) {
    throw new DesignLabError('GIT_FAILED', `${repoDir} is not a valid Git repository`, {
      details: { repoDir },
      hint: 'Delete the workspace directory and re-run to force a fresh clone.',
    });
  }

  const branch = options.branch ?? context.config.branch ?? (await git.detectDefaultBranch());

  if (options.refresh !== false) {
    await git.fetch('origin').catch((error: unknown) => {
      // Offline operation on an existing clone is legitimate; a stale base is
      // reported rather than fatal.
      context.logger.warn('could not fetch from origin; using the local clone as-is', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  const sha = await resolveBranchSha(git, branch);

  return { projectId, repoUrl, localPath, repoDir, branch, sha, git };
}

async function resolveBranchSha(git: GitClient, branch: string): Promise<string> {
  for (const ref of [`refs/remotes/origin/${branch}`, `refs/heads/${branch}`, branch]) {
    const sha = await git.tryRevParse(ref);
    if (sha) return sha;
  }
  throw new DesignLabError('GIT_FAILED', `Branch "${branch}" was not found in the target repository`, {
    details: { branch },
    hint: 'Check the branch name, or pass --branch with the correct value.',
  });
}

async function resolveLocalPath(repoInput: string, cwd: string): Promise<string | null> {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(repoInput)) return null;
  if (/^[\w.-]+@[\w.-]+:/.test(repoInput)) return null;

  const candidate = isAbsolute(repoInput) ? repoInput : resolve(cwd, repoInput);
  return (await pathExists(candidate)) ? candidate : null;
}

/** Loads or creates the persistent project record. */
export async function ensureProjectRecord(
  context: CliContext,
  target: TargetRepo,
  details: { appName: string; appSlug: string },
): Promise<ProjectRecord> {
  const existing = await context.store.readProject(target.projectId);
  const now = new Date().toISOString();

  const record: ProjectRecord = {
    schemaVersion: 1,
    projectId: target.projectId,
    repoUrl: target.repoUrl,
    localPath: target.localPath,
    defaultBranch: target.branch,
    appName: details.appName,
    appSlug: details.appSlug,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  return context.store.writeProject(record);
}

/**
 * Resolves a project id from a `--repo` flag, config, or — when exactly one
 * project has been inspected — the workspace itself. Commands such as `status`
 * and `choose` should not require the operator to repeat the repo URL.
 */
export async function resolveProjectId(context: CliContext, repo?: string): Promise<string> {
  const input = repo ?? context.config.repo;
  if (input) return projectIdFromRepo(input);

  const projects = await context.store.listProjectIds();
  if (projects.length === 1 && projects[0]) return projects[0];

  if (projects.length === 0) {
    throw new DesignLabError('MANIFEST_MISSING', 'No inspected projects found in this workspace', {
      hint: 'Run "designlab inspect --repo <url>" first.',
    });
  }

  throw new DesignLabError('CONFIG_MISSING', 'Multiple projects exist; specify which one', {
    details: { projects },
    hint: `Pass --repo <url>. Known projects: ${projects.join(', ')}.`,
  });
}

/** Never log a URL that may carry an embedded credential. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = '';
      parsed.password = '';
      return `${parsed.toString()} (credentials redacted)`;
    }
    return url;
  } catch {
    return normaliseRepoUrl(url);
  }
}
