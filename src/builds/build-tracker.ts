/**
 * Build state tracking.
 *
 * The rule this module exists to enforce: **DesignLab never claims an APK
 * exists unless GitHub says it does.** Every transition out of BUILD_PENDING
 * requires a real Actions response. Nothing here reasons, guesses, or infers
 * from "the branch pushed successfully".
 *
 * Polling deliberately does not involve a model — waiting on Gradle is not a
 * reasoning task, and burning tokens on it would be pure waste.
 */

import type { Logger } from '../core/logger.js';
import { nullLogger } from '../core/logger.js';
import type { BuildRecord, BuildStatus } from '../core/schemas.js';

/**
 * The subset of the GitHub Actions API DesignLab needs. Implemented by the
 * CLI against the GitHub REST API, and by tests against fixtures — which is
 * why build-state logic is testable without network access.
 */
export interface ActionsClient {
  /** Workflow runs for a branch, newest first. */
  listRunsForBranch(options: {
    owner: string;
    repo: string;
    branch: string;
    perPage?: number;
  }): Promise<WorkflowRun[]>;

  /** Artifacts produced by a run. */
  listArtifacts(options: { owner: string; repo: string; runId: number }): Promise<WorkflowArtifact[]>;
}

export interface WorkflowRun {
  id: number;
  name: string | null;
  htmlUrl: string;
  /** queued | in_progress | completed */
  status: string;
  /** success | failure | cancelled | timed_out | null while running */
  conclusion: string | null;
  headSha: string;
  path: string | null;
  createdAt: string;
}

export interface WorkflowArtifact {
  id: number;
  name: string;
  sizeInBytes: number;
  expired: boolean;
  archiveDownloadUrl: string;
}

export interface RepoRef {
  owner: string;
  repo: string;
}

/** Parses `owner/repo` out of a GitHub URL. Returns null for non-GitHub remotes. */
export function parseGitHubRepo(repoUrl: string): RepoRef | null {
  const trimmed = repoUrl.trim().replace(/\.git$/, '').replace(/\/+$/, '');

  const scpLike = /^(?:ssh:\/\/)?(?:git@)?github\.com[:/]([^/]+)\/([^/]+)$/.exec(trimmed);
  if (scpLike?.[1] && scpLike[2]) return { owner: scpLike[1], repo: scpLike[2] };

  try {
    const url = new URL(trimmed);
    if (!/(^|\.)github\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    const [owner, repo] = parts;
    if (owner && repo) return { owner, repo };
  } catch {
    return null;
  }

  return null;
}

/** Initial record for a candidate whose branch has just been pushed. */
export function pendingBuild(options: {
  workflowPath: string | null;
  artifactName: string;
  notes?: string;
}): BuildRecord {
  return {
    status: 'BUILD_PENDING',
    workflowPath: options.workflowPath,
    workflowRunId: null,
    workflowRunUrl: null,
    artifactName: options.artifactName,
    artifactUrl: null,
    conclusion: null,
    checkedAt: new Date().toISOString(),
    notes: options.notes ?? '',
  };
}

export function unsupportedBuild(reason: string): BuildRecord {
  return {
    status: 'BUILD_UNSUPPORTED',
    workflowPath: null,
    workflowRunId: null,
    workflowRunUrl: null,
    artifactName: null,
    artifactUrl: null,
    conclusion: null,
    checkedAt: new Date().toISOString(),
    notes: reason,
  };
}

export function notRequestedBuild(reason: string): BuildRecord {
  return {
    status: 'BUILD_NOT_REQUESTED',
    workflowPath: null,
    workflowRunId: null,
    workflowRunUrl: null,
    artifactName: null,
    artifactUrl: null,
    conclusion: null,
    checkedAt: new Date().toISOString(),
    notes: reason,
  };
}

export interface RefreshBuildOptions {
  client: ActionsClient;
  repo: RepoRef;
  branch: string;
  /** The commit DesignLab pushed; runs for other commits are ignored. */
  headSha: string | null;
  current: BuildRecord;
  logger?: Logger;
}

/**
 * Refreshes a build record from GitHub. Every status here is derived from an
 * actual API response; when the API says nothing, the record stays as it was.
 */
export async function refreshBuildStatus(options: RefreshBuildOptions): Promise<BuildRecord> {
  const logger = (options.logger ?? nullLogger).child({ scope: 'build' });

  if (options.current.status === 'BUILD_UNSUPPORTED' || options.current.status === 'BUILD_NOT_REQUESTED') {
    return options.current;
  }

  let runs: WorkflowRun[];
  try {
    runs = await options.client.listRunsForBranch({
      owner: options.repo.owner,
      repo: options.repo.repo,
      branch: options.branch,
      perPage: 20,
    });
  } catch (error) {
    logger.warn('could not read workflow runs', { branch: options.branch, error: String(error) });
    // An unreachable API is not evidence of failure. State is left untouched.
    return { ...options.current, notes: `Could not reach GitHub Actions: ${String(error)}`.slice(0, 500) };
  }

  const relevant = options.headSha
    ? runs.filter((run) => run.headSha === options.headSha)
    : runs;

  const run = relevant[0] ?? runs[0];
  if (!run) {
    return {
      ...options.current,
      status: 'BUILD_PENDING',
      checkedAt: new Date().toISOString(),
      notes: 'No workflow run has appeared for this branch yet.',
    };
  }

  const base: BuildRecord = {
    ...options.current,
    workflowRunId: run.id,
    workflowRunUrl: run.htmlUrl,
    workflowPath: run.path ?? options.current.workflowPath,
    conclusion: run.conclusion,
    checkedAt: new Date().toISOString(),
  };

  if (run.status !== 'completed') {
    return { ...base, status: run.status === 'queued' ? 'BUILD_PENDING' : 'BUILD_RUNNING', notes: '' };
  }

  if (run.conclusion !== 'success') {
    return {
      ...base,
      status: 'BUILD_FAILED',
      notes: `Workflow run concluded "${run.conclusion ?? 'unknown'}".`,
    };
  }

  // A successful run is still not an APK. Only an artifact proves that.
  let artifacts: WorkflowArtifact[];
  try {
    artifacts = await options.client.listArtifacts({
      owner: options.repo.owner,
      repo: options.repo.repo,
      runId: run.id,
    });
  } catch (error) {
    logger.warn('could not read workflow artifacts', { runId: run.id, error: String(error) });
    return {
      ...base,
      status: 'BUILD_RUNNING',
      notes: `Run succeeded, but the artifact list could not be read: ${String(error)}`.slice(0, 500),
    };
  }

  const expected = options.current.artifactName?.replace(/\.apk$/, '');
  const artifact =
    (expected ? artifacts.find((entry) => entry.name === expected || entry.name === options.current.artifactName) : undefined) ??
    artifacts.find((entry) => /\.apk$/i.test(entry.name) || /apk/i.test(entry.name)) ??
    artifacts[0];

  if (!artifact) {
    return {
      ...base,
      status: 'BUILD_FAILED',
      notes: 'The workflow succeeded but produced no artifact, so no APK exists.',
    };
  }

  if (artifact.expired) {
    return {
      ...base,
      status: 'BUILD_FAILED',
      notes: `Artifact "${artifact.name}" has expired and can no longer be downloaded.`,
    };
  }

  return {
    ...base,
    status: 'BUILD_SUCCESS',
    artifactName: artifact.name.endsWith('.apk') ? artifact.name : `${artifact.name}.apk`,
    artifactUrl: artifact.archiveDownloadUrl,
    notes: `Artifact ${artifact.name} (${formatBytes(artifact.sizeInBytes)}).`,
  };
}

/** Minimal GitHub REST implementation of `ActionsClient`. */
export class GitHubActionsClient implements ActionsClient {
  constructor(
    private readonly token: string,
    private readonly apiBase = 'https://api.github.com',
  ) {}

  async listRunsForBranch(options: {
    owner: string;
    repo: string;
    branch: string;
    perPage?: number;
  }): Promise<WorkflowRun[]> {
    const url = `${this.apiBase}/repos/${options.owner}/${options.repo}/actions/runs?branch=${encodeURIComponent(
      options.branch,
    )}&per_page=${options.perPage ?? 20}`;
    const body = await this.get<{ workflow_runs?: RawRun[] }>(url);
    return (body.workflow_runs ?? []).map(toWorkflowRun);
  }

  async listArtifacts(options: { owner: string; repo: string; runId: number }): Promise<WorkflowArtifact[]> {
    const url = `${this.apiBase}/repos/${options.owner}/${options.repo}/actions/runs/${options.runId}/artifacts`;
    const body = await this.get<{ artifacts?: RawArtifact[] }>(url);
    return (body.artifacts ?? []).map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      sizeInBytes: artifact.size_in_bytes ?? 0,
      expired: artifact.expired ?? false,
      archiveDownloadUrl: artifact.archive_download_url ?? '',
    }));
  }

  private async get<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.token}`,
        'x-github-api-version': '2022-11-28',
        'user-agent': 'designlab',
      },
    });

    if (!response.ok) {
      // Deliberately does not include the token or response body, which can
      // echo request headers on some error paths.
      throw new Error(`GitHub API returned ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }
}

interface RawRun {
  id: number;
  name?: string | null;
  html_url: string;
  status: string;
  conclusion: string | null;
  head_sha: string;
  path?: string | null;
  created_at: string;
}

interface RawArtifact {
  id: number;
  name: string;
  size_in_bytes?: number;
  expired?: boolean;
  archive_download_url?: string;
}

function toWorkflowRun(raw: RawRun): WorkflowRun {
  return {
    id: raw.id,
    name: raw.name ?? null,
    htmlUrl: raw.html_url,
    status: raw.status,
    conclusion: raw.conclusion,
    headSha: raw.head_sha,
    path: raw.path ?? null,
    createdAt: raw.created_at,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Human-readable build status, used by `designlab status`. */
export function describeBuildStatus(status: BuildStatus): string {
  switch (status) {
    case 'BUILD_SUCCESS':
      return 'APK built';
    case 'BUILD_FAILED':
      return 'build failed';
    case 'BUILD_RUNNING':
      return 'building';
    case 'BUILD_PENDING':
      return 'queued';
    case 'BUILD_UNSUPPORTED':
      return 'no build pipeline';
    default:
      return 'not requested';
  }
}
