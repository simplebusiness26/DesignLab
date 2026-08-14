/**
 * `designlab init`
 *
 * Creates the workspace: a config file, the state directories, and the JSON
 * Schemas for every persisted document. Writing the schemas out is deliberate
 * — they make the state directory self-describing to anyone who opens it
 * later, including tooling DesignLab does not know about.
 */

import { resolve } from 'node:path';

import { defaultConfig, writeConfigFile, type DesignLabConfig } from '../../config/config.js';
import { ensureDir, pathExists, writeText } from '../../core/fsx.js';
import { renderSchema } from '../../core/json-schema.js';
import {
  appManifestSchema,
  designBriefSchema,
  functionalityContractSchema,
  lineageSchema,
  nextGenerationPlanSchema,
  projectRecordSchema,
  roundSchema,
  usageEventSchema,
} from '../../core/schemas.js';
import type { CliContext } from '../context.js';

export interface InitOptions {
  repo?: string | undefined;
  branch?: string | undefined;
  force?: boolean;
}

export interface InitResult {
  configPath: string;
  workspaceRoot: string;
  schemasWritten: string[];
  created: boolean;
}

const SCHEMAS = {
  'app-manifest': appManifestSchema,
  'functionality-contract': functionalityContractSchema,
  'design-brief': designBriefSchema,
  round: roundSchema,
  lineage: lineageSchema,
  'next-generation-plan': nextGenerationPlanSchema,
  'project-record': projectRecordSchema,
  'usage-event': usageEventSchema,
} as const;

export async function runInit(context: CliContext, options: InitOptions): Promise<InitResult> {
  const logger = context.logger.child({ scope: 'init' });
  const configPath = context.paths.configFile;
  const alreadyExists = await pathExists(configPath);

  if (alreadyExists && !options.force) {
    logger.info('configuration already exists; leaving it untouched', { path: configPath });
  } else {
    const config: DesignLabConfig = {
      ...defaultConfig(),
      $schema: './.designlab/schemas/config.schema.json',
      repo: options.repo ?? null,
      branch: options.branch ?? 'main',
    };
    await writeConfigFile(configPath, config);
    logger.info('configuration written', { path: configPath });
  }

  await ensureDir(context.paths.stateDir);
  await ensureDir(context.paths.projectsDir);
  await ensureDir(context.paths.workspaceDir);
  await ensureDir(context.paths.logsDir);
  await ensureDir(context.paths.schemasDir);

  const schemasWritten: string[] = [];
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    const path = resolve(context.paths.schemasDir, `${name}.schema.json`);
    await writeText(path, renderSchema(schema, name));
    schemasWritten.push(path);
  }

  // A README inside the workspace so the directory explains itself.
  await writeText(
    resolve(context.paths.root, 'README.md'),
    [
      '# DesignLab workspace',
      '',
      'This directory is created and managed by DesignLab.',
      '',
      '- `schemas/` — JSON Schemas for every persisted document. Safe to commit.',
      '- `state/` — manifests, contracts, rounds, briefs and lineage. Machine-local.',
      '- `workspace/` — clones and per-candidate Git worktrees. Machine-local, disposable.',
      '- `usage.jsonl` — model/agent usage ledger.',
      '',
      'Deleting `workspace/` is always safe: it is rebuilt on the next run.',
      'Deleting `state/` discards your round history and lineage.',
      '',
      'No credentials are ever written here.',
      '',
    ].join('\n'),
  );

  return {
    configPath,
    workspaceRoot: context.paths.root,
    schemasWritten,
    created: !alreadyExists || Boolean(options.force),
  };
}

export function formatInitResult(result: InitResult): string {
  return [
    'DesignLab workspace ready.',
    '',
    `  config:    ${result.configPath}`,
    `  workspace: ${result.workspaceRoot}`,
    `  schemas:   ${result.schemasWritten.length} written`,
    '',
    'Next: designlab inspect --repo <url> --branch <branch>',
  ].join('\n');
}
