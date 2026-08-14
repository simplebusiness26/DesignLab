/**
 * Canonical on-disk layout.
 *
 * Everything DesignLab persists lives under a single workspace root
 * (`.designlab/` by default) so a project can be inspected, wiped or archived
 * as one unit. Paths are computed here rather than joined ad hoc, which keeps
 * the layout documented in exactly one place.
 *
 *   <root>/
 *     schemas/                     JSON Schemas for every persisted document
 *     state/
 *       projects/<projectId>/
 *         project.json             Target repo identity and defaults
 *         manifests/<sha>.json     App Manifest, keyed by inspected commit
 *         manifests/latest.json    Pointer to the newest manifest
 *         analysis/<sha>.md        Human-readable analysis
 *         contract.json            Functionality Contract
 *         lineage.json             Round graph and winners
 *         rounds/<roundId>/
 *           round.json             Round record (briefs, gates, builds)
 *           briefs/<slot>.json     Design Brief per candidate
 *           logs/<slot>/…          Builder transcripts and gate output
 *     workspace/<projectId>/
 *       repo/                      Primary clone of the target repository
 *       worktrees/<name>/          One isolated worktree per candidate
 *     logs/                        Orchestration run logs
 *     usage.jsonl                  Model/agent usage ledger
 */

import { isAbsolute, join, resolve } from 'node:path';

import { roundId, type CandidateSlot } from './ids.js';

export const DEFAULT_WORKSPACE_DIRNAME = '.designlab';
export const CONFIG_FILENAME = 'designlab.config.json';

export class DesignLabPaths {
  /** Absolute path to the workspace root (`.designlab`). */
  readonly root: string;
  /** Directory the CLI was invoked from; config resolution anchor. */
  readonly cwd: string;

  constructor(cwd: string, root?: string) {
    this.cwd = resolve(cwd);
    const candidate = root ?? DEFAULT_WORKSPACE_DIRNAME;
    this.root = isAbsolute(candidate) ? candidate : resolve(this.cwd, candidate);
  }

  get configFile(): string {
    return join(this.cwd, CONFIG_FILENAME);
  }

  get schemasDir(): string {
    return join(this.root, 'schemas');
  }

  get stateDir(): string {
    return join(this.root, 'state');
  }

  get projectsDir(): string {
    return join(this.stateDir, 'projects');
  }

  get workspaceDir(): string {
    return join(this.root, 'workspace');
  }

  get logsDir(): string {
    return join(this.root, 'logs');
  }

  get usageLedger(): string {
    return join(this.root, 'usage.jsonl');
  }

  projectDir(projectId: string): string {
    return join(this.projectsDir, projectId);
  }

  projectFile(projectId: string): string {
    return join(this.projectDir(projectId), 'project.json');
  }

  manifestsDir(projectId: string): string {
    return join(this.projectDir(projectId), 'manifests');
  }

  manifestFile(projectId: string, sha: string): string {
    return join(this.manifestsDir(projectId), `${sha}.json`);
  }

  latestManifestPointer(projectId: string): string {
    return join(this.manifestsDir(projectId), 'latest.json');
  }

  analysisFile(projectId: string, sha: string): string {
    return join(this.projectDir(projectId), 'analysis', `${sha}.md`);
  }

  contractFile(projectId: string): string {
    return join(this.projectDir(projectId), 'contract.json');
  }

  lineageFile(projectId: string): string {
    return join(this.projectDir(projectId), 'lineage.json');
  }

  roundsDir(projectId: string): string {
    return join(this.projectDir(projectId), 'rounds');
  }

  roundDir(projectId: string, round: number): string {
    return join(this.roundsDir(projectId), roundId(round));
  }

  roundFile(projectId: string, round: number): string {
    return join(this.roundDir(projectId, round), 'round.json');
  }

  briefFile(projectId: string, round: number, slot: CandidateSlot): string {
    return join(this.roundDir(projectId, round), 'briefs', `${slot.toLowerCase()}.json`);
  }

  candidateLogDir(projectId: string, round: number, slot: CandidateSlot): string {
    return join(this.roundDir(projectId, round), 'logs', slot.toLowerCase());
  }

  nextGenPlanFile(projectId: string, round: number): string {
    return join(this.roundDir(projectId, round), 'next-generation-plan.json');
  }

  /** Primary clone of the target repository. */
  repoDir(projectId: string): string {
    return join(this.workspaceDir, projectId, 'repo');
  }

  worktreesDir(projectId: string): string {
    return join(this.workspaceDir, projectId, 'worktrees');
  }

  worktreeDir(projectId: string, name: string): string {
    return join(this.worktreesDir(projectId), name);
  }
}

export function createPaths(cwd: string = process.cwd(), root?: string): DesignLabPaths {
  return new DesignLabPaths(cwd, root);
}
