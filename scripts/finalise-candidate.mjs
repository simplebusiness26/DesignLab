#!/usr/bin/env node
/**
 * Re-verify and finalise one candidate after a lead review.
 *
 * Used when a round rejected a candidate at the protection gate, and the lead
 * has since reviewed the offending diffs and recorded per-file
 * `approvedExceptions` in designlab.config.json. This script re-runs the
 * PRODUCTION gate runner (dependencies, typecheck, lint, test, protection)
 * against the candidate's existing worktree, and only if every required gate
 * genuinely passes does it:
 *
 *   1. optionally commit workflow-trigger plumbing (adds `<branchPrefix>/**`
 *      to the existing workflow's push triggers) with the
 *      [designlab-plumbing] marker so `merge-check` proves it is dropped
 *      before any merge;
 *   2. push the candidate branch (never a base branch);
 *   3. persist the resulting state through the production Store.
 *
 * No state is hand-written: every status comes from a real gate run or a real
 * git exit code. If gates still fail, the honest failing result is persisted
 * and nothing is pushed.
 *
 * Usage:
 *   node scripts/finalise-candidate.mjs <labCwd> <round> <slot> [--reuse-workflow <path>] [--artifact <name>] [--variant release|debug]
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { runGates, didAllRequiredGatesPass, formatGateResults } = await import(join(ROOT, 'dist/testing/gates.js'));
const { ProtectionChecker } = await import(join(ROOT, 'dist/protection/checker.js'));
const { GitClient } = await import(join(ROOT, 'dist/git/git-client.js'));
const { pendingBuild } = await import(join(ROOT, 'dist/builds/build-tracker.js'));
const { PLUMBING_COMMIT_MARKER } = await import(join(ROOT, 'dist/builds/candidate-identity.js'));
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
  process.stderr.write(
    'usage: finalise-candidate.mjs <labCwd> <round> <slot> [--reuse-workflow <path>] [--artifact <name>] [--variant release|debug]\n',
  );
  process.exit(2);
}
const reuseWorkflow = flag('reuse-workflow') ?? null;
const artifactName = flag('artifact') ?? null;
const variant = flag('variant') ?? 'debug';

const { config } = await loadConfigFile(join(resolve(labCwd), 'designlab.config.json'));
const paths = createPaths(resolve(labCwd), config.workspaceDir);
const store = new Store(paths);
const projectId = (await store.listProjectIds())[0];
if (!projectId) {
  process.stderr.write('no project in this workspace\n');
  process.exit(1);
}
const round = await store.requireRound(projectId, Number(roundArg));
const candidate = round.candidates.find((c) => c.slot === slotArg.toUpperCase());
if (!candidate) {
  process.stderr.write(`no candidate ${slotArg} in round ${roundArg}\n`);
  process.exit(1);
}
const contract = await store.requireContract(projectId);
const manifest = await store.requireManifest(projectId);

const worktree = join(
  paths.worktreesDir(projectId),
  candidate.branch.replace(`${config.branchPrefix}/`, ''),
);

const checker = new ProtectionChecker(contract, config.protection);
const git = new GitClient({ cwd: worktree });

// ---- 1. Re-run the production gates against pure design content ----------
const gateRun = await runGates({
  cwd: worktree,
  commands: {
    install: manifest.commands.install,
    typecheck: manifest.commands.typecheck,
    lint: manifest.commands.lint,
    test: manifest.commands.test,
    build: null,
  },
  git,
  checker,
  baseSha: round.baseSha,
  headSha: candidate.headSha,
  timeoutMs: config.limits.gateTimeoutMs,
});

console.log(formatGateResults(gateRun.results));
candidate.gates = gateRun.results;
candidate.protection = gateRun.protection ?? candidate.protection;

if (!gateRun.passed || !didAllRequiredGatesPass(gateRun.results)) {
  candidate.status = 'rejected';
  candidate.failure = 'Re-verification after lead review still failed; see gates.';
  await store.writeRound(round);
  console.error('Gates still failing; candidate stays rejected. Nothing pushed.');
  process.exit(1);
}

candidate.status = 'ready';
candidate.failure = null;

// ---- 2. Plumbing: fire the repo's own workflow on design branches ---------
if (reuseWorkflow) {
  const wfPath = join(worktree, reuseWorkflow);
  const wf = await readFile(wfPath, 'utf8');
  const trigger = `${config.branchPrefix}/**`;
  if (!wf.includes(trigger)) {
    const match = wf.match(/(^ {2}push:\n {4}branches:\n( {6}- .+\n)+)/m);
    if (!match) {
      console.error('Workflow push-trigger block not in the expected shape; aborting before any push.');
      process.exit(1);
    }
    await writeFile(wfPath, wf.replace(match[1], `${match[1]}      - "${trigger}"\n`), 'utf8');
    await git.stageAll();
    await git.commit(
      `designlab: run the APK workflow on ${config.branchPrefix} branches ${PLUMBING_COMMIT_MARKER}\n\n` +
        `Adds ${trigger} to the existing ${reuseWorkflow} push triggers so each design ` +
        'candidate builds an APK. Temporary DesignLab plumbing: drop before merging ' +
        'the winning design; `designlab merge-check` enforces that.',
    );
    console.log('plumbing commit added:', reuseWorkflow);
  }
}

// ---- 3. Push the candidate branch (never a base branch) -------------------
const FORBIDDEN = new Set([round.baseBranch, 'main', 'master', 'main2.0', 'main2.0-Dev']);
if (FORBIDDEN.has(candidate.branch) || !candidate.branch.startsWith(`${config.branchPrefix}/`)) {
  console.error(`Refusing to push "${candidate.branch}"`);
  process.exit(1);
}
const pushResult = await git.push(config.build.remote, candidate.branch, { cwd: worktree });
if (!pushResult.ok) {
  await store.writeRound(round);
  console.error(`Push failed (exit ${pushResult.exitCode}); candidate stays "ready", nothing recorded as pushed.`);
  process.exit(1);
}

candidate.pushed = true;
candidate.status = 'pushed';
candidate.pushedSha = await git.headSha();
candidate.build = pendingBuild({
  workflowPath: reuseWorkflow ?? config.build.workflowPath,
  artifactName: artifactName ?? 'unknown.apk',
  variant,
  notes: `Pushed to ${config.build.remote} after lead-review re-verification. Waiting for GitHub Actions.`,
});
await store.writeRound(round);

console.log(
  JSON.stringify(
    {
      status: candidate.status,
      branch: candidate.branch,
      headSha: candidate.headSha,
      pushedSha: candidate.pushedSha,
      build: candidate.build.status,
    },
    null,
    2,
  ),
);
