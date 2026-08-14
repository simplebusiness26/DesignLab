#!/usr/bin/env node
/**
 * Re-run the production verification gates for one existing candidate and
 * persist the honest result. Verification only: this script never pushes,
 * never edits files, and never invents state — candidate status is set to
 * `ready` only when every required gate genuinely passed just now, and back
 * to `rejected` (with the failing gates recorded) otherwise.
 *
 * Used after a lead review changes the effective contract (e.g. approved
 * exceptions synced via sync-contract-exceptions.mjs) so the stored round
 * state reflects a real gate run against the updated contract.
 *
 * Usage: node scripts/reverify-candidate.mjs <labCwd> <round> <slot>
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { runGates, didAllRequiredGatesPass, formatGateResults } = await import(join(ROOT, 'dist/testing/gates.js'));
const { ProtectionChecker } = await import(join(ROOT, 'dist/protection/checker.js'));
const { GitClient } = await import(join(ROOT, 'dist/git/git-client.js'));
const { Store } = await import(join(ROOT, 'dist/core/store.js'));
const { createPaths } = await import(join(ROOT, 'dist/core/paths.js'));
const { loadConfigFile } = await import(join(ROOT, 'dist/config/config.js'));

const [, , labCwd, roundArg, slotArg] = process.argv;
if (!labCwd || !roundArg || !slotArg) {
  process.stderr.write('usage: reverify-candidate.mjs <labCwd> <round> <slot>\n');
  process.exit(2);
}

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

if (gateRun.passed && didAllRequiredGatesPass(gateRun.results)) {
  candidate.status = 'ready';
  candidate.failure = null;
} else {
  candidate.status = 'rejected';
  candidate.failure = `Re-verification failed at gate: ${gateRun.failedGate ?? 'unknown'}.`;
}

await store.writeRound(round);
console.log(JSON.stringify({ slot: candidate.slot, status: candidate.status, headSha: candidate.headSha }, null, 2));
