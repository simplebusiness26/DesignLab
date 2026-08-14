#!/usr/bin/env node
/**
 * Build-status refresh via relayed Actions API responses.
 *
 * Some environments (like this session's proxied one) cannot reach
 * api.github.com directly but have an authorized GitHub API channel that
 * returns the same Actions payloads. This script keeps DesignLab's honest
 * state machine as the sole arbiter: the relayed JSON (workflow runs +
 * artifacts, verbatim GitHub API shapes) is fed through the production
 * `refreshBuildStatus`, and the resulting record — including the
 * installability verdict — is persisted through the production Store.
 *
 * Usage:
 *   node scripts/refresh-from-json.mjs <labCwd> <round> <slot> <runsJson> <artifactsJson>
 *
 * runsJson:      GitHub API shape { workflow_runs: [...] }
 * artifactsJson: GitHub API shape { artifacts: [...] }  (may be empty)
 */

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { refreshBuildStatus } = await import(join(ROOT, 'dist/builds/build-tracker.js'));
const { Store } = await import(join(ROOT, 'dist/core/store.js'));
const { createPaths } = await import(join(ROOT, 'dist/core/paths.js'));
const { loadConfigFile } = await import(join(ROOT, 'dist/config/config.js'));

const [, , labCwd, roundArg, slotArg, runsPath, artifactsPath] = process.argv;
if (!labCwd || !roundArg || !slotArg || !runsPath) {
  process.stderr.write('usage: refresh-from-json.mjs <labCwd> <round> <slot> <runsJson> [artifactsJson]\n');
  process.exit(2);
}

const { config } = await loadConfigFile(join(resolve(labCwd), 'designlab.config.json'));
const paths = createPaths(resolve(labCwd), config.workspaceDir);
const store = new Store(paths);

const projectIds = await store.listProjectIds();
const projectId = projectIds[0];
if (!projectId) {
  process.stderr.write('no project in this workspace\n');
  process.exit(1);
}

const round = await store.requireRound(projectId, Number(roundArg));
const candidate = round.candidates.find((entry) => entry.slot === slotArg.toUpperCase());
if (!candidate) {
  process.stderr.write(`no candidate ${slotArg} in round ${roundArg}\n`);
  process.exit(1);
}

const runsRaw = JSON.parse(await readFile(runsPath, 'utf8'));
const artifactsRaw = artifactsPath ? JSON.parse(await readFile(artifactsPath, 'utf8')) : { artifacts: [] };

/** ActionsClient backed by the relayed API payloads, shape-identical to REST. */
const client = {
  listRunsForBranch: async () =>
    (runsRaw.workflow_runs ?? []).map((run) => ({
      id: run.id,
      name: run.name ?? null,
      htmlUrl: run.html_url,
      status: run.status,
      conclusion: run.conclusion,
      headSha: run.head_sha,
      path: run.path ?? null,
      createdAt: run.created_at,
    })),
  listArtifacts: async () =>
    (artifactsRaw.artifacts ?? []).map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      sizeInBytes: artifact.size_in_bytes ?? 0,
      expired: artifact.expired ?? false,
      archiveDownloadUrl: artifact.archive_download_url ?? '',
    })),
};

const updated = await refreshBuildStatus({
  client,
  repo: { owner: 'relay', repo: 'relay' },
  branch: candidate.branch,
  headSha: candidate.pushedSha ?? candidate.headSha,
  current: candidate.build,
  releaseSigned: config.build.releaseSigned,
});

candidate.build = updated;
await store.writeRound(round);

process.stdout.write(
  JSON.stringify(
    {
      slot: candidate.slot,
      branch: candidate.branch,
      status: updated.status,
      installability: updated.installability,
      variant: updated.variant,
      artifactName: updated.artifactName,
      artifactUrl: updated.artifactUrl,
      workflowRunUrl: updated.workflowRunUrl,
      conclusion: updated.conclusion,
      notes: updated.notes,
    },
    null,
    2,
  ) + '\n',
);
