#!/usr/bin/env node
/**
 * Record an already-completed push for a candidate, from evidence only.
 *
 * Every recorded fact is re-derived here, not asserted:
 *   - the protection gate entry is refreshed by running the PRODUCTION
 *     ProtectionChecker over the candidate's real git diff (base..head);
 *   - the pushed state is recorded only if `git ls-remote` shows the remote
 *     branch tip equal to the candidate's design head right now;
 *   - the build record becomes BUILD_PENDING, which the build tracker will
 *     only ever promote on a real successful Actions run + artifact.
 *
 * If either derivation fails, nothing is recorded and the exit code says so.
 *
 * Usage: node scripts/record-push.mjs <labCwd> <round> <slot> [--workflow <path>] [--artifact <name>] [--variant release|debug]
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { ProtectionChecker, formatProtectionReport } = await import(join(ROOT, 'dist/protection/checker.js'));
const { GitClient } = await import(join(ROOT, 'dist/git/git-client.js'));
const { pendingBuild } = await import(join(ROOT, 'dist/builds/build-tracker.js'));
const { Store } = await import(join(ROOT, 'dist/core/store.js'));
const { createPaths } = await import(join(ROOT, 'dist/core/paths.js'));
const { loadConfigFile } = await import(join(ROOT, 'dist/config/config.js'));

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const [labCwd, roundArg, slotArg] = positional;
if (!labCwd || !roundArg || !slotArg) {
  process.stderr.write('usage: record-push.mjs <labCwd> <round> <slot> [--workflow <path>] [--artifact <name>] [--variant release|debug]\n');
  process.exit(2);
}

const { config } = await loadConfigFile(join(resolve(labCwd), 'designlab.config.json'));
const paths = createPaths(resolve(labCwd), config.workspaceDir);
const store = new Store(paths);
const projectId = (await store.listProjectIds())[0];
const round = await store.requireRound(projectId, Number(roundArg));
const candidate = round.candidates.find((c) => c.slot === slotArg.toUpperCase());
if (!candidate) {
  process.stderr.write(`no candidate ${slotArg} in round ${roundArg}\n`);
  process.exit(1);
}
const contract = await store.requireContract(projectId);

const worktree = join(
  paths.worktreesDir(projectId),
  candidate.branch.replace(`${config.branchPrefix}/`, ''),
);
const git = new GitClient({ cwd: worktree });

// ---- 1. Protection gate, re-derived by the production checker ------------
const checker = new ProtectionChecker(contract, config.protection);
const started = Date.now();
const changes = await git.changedFiles(round.baseSha, candidate.headSha);
const report = checker.evaluate(changes, round.baseSha, candidate.headSha);
const durationMs = Date.now() - started;
console.log(formatProtectionReport(report).split('\n')[0]);

if (!report.passed) {
  process.stderr.write('Protection does not pass; refusing to record anything.\n');
  process.exit(1);
}

const protGate = candidate.gates.find((g) => g.gate === 'protection');
if (protGate) {
  protGate.status = 'passed';
  protGate.summary = formatProtectionReport(report);
  delete protGate.reason;
  protGate.durationMs = durationMs;
  protGate.ranAt = new Date().toISOString();
}
candidate.protection = report;

// ---- 2. Pushed state, verified against the remote right now ---------------
const lsRemote = await git.raw(['ls-remote', config.build.remote, `refs/heads/${candidate.branch}`]);
const remoteTip = lsRemote.stdout.trim().split(/\s+/)[0] ?? '';
if (remoteTip !== candidate.headSha) {
  process.stderr.write(
    `Remote tip ${remoteTip || '(absent)'} does not equal design head ${candidate.headSha}; refusing to record a push.\n`,
  );
  process.exit(1);
}

candidate.status = 'pushed';
candidate.pushed = true;
candidate.pushedSha = remoteTip;
candidate.failure = null;
candidate.build = pendingBuild({
  workflowPath: flag('workflow') ?? config.build.workflowPath,
  artifactName: flag('artifact') ?? 'unknown.apk',
  variant: flag('variant') ?? config.build.variant,
  notes: `Recorded from evidence: remote ${config.build.remote}/${candidate.branch} tip equals design head. Waiting for GitHub Actions.`,
});

await store.writeRound(round);
console.log(
  JSON.stringify(
    { slot: candidate.slot, status: candidate.status, pushedSha: candidate.pushedSha, build: candidate.build.status },
    null,
    2,
  ),
);
