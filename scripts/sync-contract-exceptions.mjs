#!/usr/bin/env node
/**
 * Re-derive the approvedExceptions layer of a stored Functionality Contract
 * from the current designlab.config.json.
 *
 * The contract snapshots config exceptions at inspect time (see
 * buildContract in src/protection/contract.ts: they are copied verbatim with
 * approvedBy:'config'). When a lead reviews a rejected candidate and records
 * new per-file exceptions in config, this script refreshes that one layer —
 * and only that layer — without re-rolling the detected/proposed rules the
 * candidate was already validated against. Rules, invariants and the default
 * level are untouched; the result is schema-validated by the production
 * Store on write.
 *
 * Usage: node scripts/sync-contract-exceptions.mjs <labCwd>
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { Store } = await import(join(ROOT, 'dist/core/store.js'));
const { createPaths } = await import(join(ROOT, 'dist/core/paths.js'));
const { loadConfigFile } = await import(join(ROOT, 'dist/config/config.js'));

const [, , labCwd] = process.argv;
if (!labCwd) {
  process.stderr.write('usage: sync-contract-exceptions.mjs <labCwd>\n');
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

const contract = await store.requireContract(projectId);
contract.approvedExceptions = config.protection.approvedExceptions.map((exception) => ({
  pattern: exception.pattern,
  reason: exception.reason,
  approvedBy: 'config',
}));
await store.writeContract(contract);

console.log(
  `contract for ${projectId}: ${contract.approvedExceptions.length} approved exception(s) synced from config`,
);
for (const e of contract.approvedExceptions) console.log(`  - ${e.pattern}`);
