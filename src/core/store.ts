/**
 * Persistent state store.
 *
 * A thin, schema-validated layer over the on-disk layout defined in
 * `paths.ts`. Reads validate; writes stamp `updatedAt`. Nothing else in the
 * codebase touches DesignLab's state files directly.
 */

import { basename } from 'node:path';

import type { z } from 'zod';

import { DesignLabError } from './errors.js';
import { appendJsonl, listDirNames, readJson, readJsonl, readText, writeJson, writeText } from './fsx.js';
import type { DesignLabPaths } from './paths.js';
import { parseRoundRef, type CandidateSlot } from './ids.js';
import {
  appManifestSchema,
  functionalityContractSchema,
  designBriefSchema,
  lineageSchema,
  nextGenerationPlanSchema,
  projectRecordSchema,
  roundSchema,
  usageEventSchema,
  type AppManifest,
  type DesignBrief,
  type FunctionalityContract,
  type Lineage,
  type NextGenerationPlan,
  type ProjectRecord,
  type Round,
  type UsageEvent,
} from './schemas.js';

function validate<T extends z.ZodTypeAny>(schema: T, value: unknown, path: string): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new DesignLabError('STATE_CORRUPT', `State file failed validation: ${path}\n${issues}`, {
      details: { path, issues: result.error.issues },
      hint: 'The file was written by an incompatible version or edited by hand.',
    });
  }
  return result.data;
}

export class Store {
  constructor(private readonly paths: DesignLabPaths) {}

  // -- projects ------------------------------------------------------------

  async listProjectIds(): Promise<string[]> {
    return listDirNames(this.paths.projectsDir);
  }

  async readProject(projectId: string): Promise<ProjectRecord | null> {
    const path = this.paths.projectFile(projectId);
    const raw = await readJson(path);
    return raw === null ? null : validate(projectRecordSchema, raw, path);
  }

  async writeProject(record: ProjectRecord): Promise<ProjectRecord> {
    const next = { ...record, updatedAt: new Date().toISOString() };
    const validated = validate(projectRecordSchema, next, this.paths.projectFile(record.projectId));
    await writeJson(this.paths.projectFile(record.projectId), validated);
    return validated;
  }

  // -- manifests -----------------------------------------------------------

  async readManifest(projectId: string, sha: string): Promise<AppManifest | null> {
    const path = this.paths.manifestFile(projectId, sha);
    const raw = await readJson(path);
    return raw === null ? null : validate(appManifestSchema, raw, path);
  }

  async readLatestManifest(projectId: string): Promise<AppManifest | null> {
    const pointerPath = this.paths.latestManifestPointer(projectId);
    const pointer = await readJson<{ sha?: string }>(pointerPath);
    if (!pointer?.sha) return null;
    return this.readManifest(projectId, pointer.sha);
  }

  async writeManifest(manifest: AppManifest): Promise<AppManifest> {
    const path = this.paths.manifestFile(manifest.projectId, manifest.sha);
    const validated = validate(appManifestSchema, manifest, path);
    await writeJson(path, validated);
    await writeJson(this.paths.latestManifestPointer(manifest.projectId), {
      sha: manifest.sha,
      branch: manifest.branch,
      updatedAt: new Date().toISOString(),
    });
    return validated;
  }

  async writeAnalysis(projectId: string, sha: string, markdown: string): Promise<string> {
    const path = this.paths.analysisFile(projectId, sha);
    await writeText(path, markdown);
    return path;
  }

  async readAnalysis(projectId: string, sha: string): Promise<string | null> {
    return readText(this.paths.analysisFile(projectId, sha));
  }

  // -- contract ------------------------------------------------------------

  async readContract(projectId: string): Promise<FunctionalityContract | null> {
    const path = this.paths.contractFile(projectId);
    const raw = await readJson(path);
    return raw === null ? null : validate(functionalityContractSchema, raw, path);
  }

  async writeContract(contract: FunctionalityContract): Promise<FunctionalityContract> {
    const path = this.paths.contractFile(contract.projectId);
    const validated = validate(functionalityContractSchema, contract, path);
    await writeJson(path, validated);
    return validated;
  }

  async requireContract(projectId: string): Promise<FunctionalityContract> {
    const contract = await this.readContract(projectId);
    if (!contract) {
      throw new DesignLabError('CONTRACT_MISSING', `No functionality contract for project ${projectId}`, {
        hint: 'Run "designlab inspect" first — it produces the manifest and contract together.',
      });
    }
    return contract;
  }

  async requireManifest(projectId: string): Promise<AppManifest> {
    const manifest = await this.readLatestManifest(projectId);
    if (!manifest) {
      throw new DesignLabError('MANIFEST_MISSING', `No app manifest for project ${projectId}`, {
        hint: 'Run "designlab inspect --repo <url> --branch <branch>" first.',
      });
    }
    return manifest;
  }

  // -- rounds --------------------------------------------------------------

  async listRoundNumbers(projectId: string): Promise<number[]> {
    const names = await listDirNames(this.paths.roundsDir(projectId));
    return names
      .map((name) => parseRoundRef(basename(name)))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
  }

  async readRound(projectId: string, round: number): Promise<Round | null> {
    const path = this.paths.roundFile(projectId, round);
    const raw = await readJson(path);
    return raw === null ? null : validate(roundSchema, raw, path);
  }

  async requireRound(projectId: string, round: number): Promise<Round> {
    const record = await this.readRound(projectId, round);
    if (!record) {
      throw new DesignLabError('ROUND_NOT_FOUND', `Round ${round} does not exist for ${projectId}`, {
        details: { projectId, round },
        hint: 'Run "designlab status" to list existing rounds.',
      });
    }
    return record;
  }

  async writeRound(round: Round): Promise<Round> {
    const path = this.paths.roundFile(round.projectId, round.round);
    const next = { ...round, updatedAt: new Date().toISOString() };
    const validated = validate(roundSchema, next, path);
    await writeJson(path, validated);
    return validated;
  }

  async nextRoundNumber(projectId: string): Promise<number> {
    const rounds = await this.listRoundNumbers(projectId);
    return (rounds.at(-1) ?? 0) + 1;
  }

  // -- briefs --------------------------------------------------------------

  async writeBrief(brief: DesignBrief): Promise<DesignBrief> {
    const path = this.paths.briefFile(brief.projectId, brief.round, brief.slot);
    const validated = validate(designBriefSchema, brief, path);
    await writeJson(path, validated);
    return validated;
  }

  async readBrief(projectId: string, round: number, slot: CandidateSlot): Promise<DesignBrief | null> {
    const path = this.paths.briefFile(projectId, round, slot);
    const raw = await readJson(path);
    return raw === null ? null : validate(designBriefSchema, raw, path);
  }

  async readBriefs(projectId: string, round: number): Promise<DesignBrief[]> {
    const record = await this.readRound(projectId, round);
    if (!record) return [];
    const briefs: DesignBrief[] = [];
    for (const candidate of record.candidates) {
      const brief = await this.readBrief(projectId, round, candidate.slot);
      if (brief) briefs.push(brief);
    }
    return briefs;
  }

  // -- lineage -------------------------------------------------------------

  async readLineage(projectId: string): Promise<Lineage> {
    const path = this.paths.lineageFile(projectId);
    const raw = await readJson(path);
    if (raw === null) {
      return { schemaVersion: 1, projectId, entries: [], updatedAt: new Date().toISOString() };
    }
    return validate(lineageSchema, raw, path);
  }

  async writeLineage(lineage: Lineage): Promise<Lineage> {
    const path = this.paths.lineageFile(lineage.projectId);
    const next = { ...lineage, updatedAt: new Date().toISOString() };
    const validated = validate(lineageSchema, next, path);
    await writeJson(path, validated);
    return validated;
  }

  // -- next-generation plans ----------------------------------------------

  async writeNextGenerationPlan(plan: NextGenerationPlan): Promise<NextGenerationPlan> {
    const path = this.paths.nextGenPlanFile(plan.projectId, plan.parentRound);
    const validated = validate(nextGenerationPlanSchema, plan, path);
    await writeJson(path, validated);
    return validated;
  }

  async readNextGenerationPlan(projectId: string, parentRound: number): Promise<NextGenerationPlan | null> {
    const path = this.paths.nextGenPlanFile(projectId, parentRound);
    const raw = await readJson(path);
    return raw === null ? null : validate(nextGenerationPlanSchema, raw, path);
  }

  // -- usage ledger --------------------------------------------------------

  async recordUsage(event: UsageEvent): Promise<void> {
    const validated = usageEventSchema.parse(event);
    await appendJsonl(this.paths.usageLedger, validated);
  }

  async readUsage(): Promise<UsageEvent[]> {
    const rows = await readJsonl<unknown>(this.paths.usageLedger);
    const out: UsageEvent[] = [];
    for (const row of rows) {
      const parsed = usageEventSchema.safeParse(row);
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  }

  // -- misc ----------------------------------------------------------------

  async writeCandidateLog(
    projectId: string,
    round: number,
    slot: CandidateSlot,
    filename: string,
    contents: string,
  ): Promise<string> {
    const dir = this.paths.candidateLogDir(projectId, round, slot);
    const path = `${dir}/${filename}`;
    await writeText(path, contents);
    return path;
  }
}
