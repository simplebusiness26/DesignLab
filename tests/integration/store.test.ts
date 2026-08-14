/**
 * Integration tests for state persistence.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DesignLabError } from '../../src/core/errors.js';
import { removeDir, writeJson } from '../../src/core/fsx.js';
import { createPaths, type DesignLabPaths } from '../../src/core/paths.js';
import { Store } from '../../src/core/store.js';
import { DIVERSITY_DIMENSIONS, type AppManifest, type DesignBrief, type Round } from '../../src/core/schemas.js';
import { makeTempDir } from '../helpers/fixture-repo.js';

const PROJECT = 'test-app-abcd1234';
const SHA = 'a'.repeat(40);

function manifest(overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    schemaVersion: 1,
    projectId: PROJECT,
    repoUrl: 'https://github.com/test/app',
    branch: 'main',
    sha: SHA,
    generatedAt: new Date().toISOString(),
    appName: 'Test App',
    appSlug: 'test-app',
    framework: 'expo',
    frameworkVersion: null,
    languages: ['TypeScript'],
    packageManager: 'npm',
    androidBuildSystem: 'gradle',
    androidPackageId: null,
    minSdkVersion: null,
    sourceRoots: ['src'],
    screens: [],
    navigation: { library: null, pattern: 'unknown', paths: [] },
    components: [],
    designSystem: { present: false, themePaths: [], tokens: [], stylingApproach: 'unknown' },
    stateManagement: [],
    capabilities: [],
    permissions: [],
    nativeModules: [],
    apis: [],
    backends: [],
    testing: { frameworks: [], testPaths: [], hasTests: false },
    commands: { install: null, typecheck: null, lint: null, test: null, build: null, androidBuild: null },
    ci: { hasWorkflows: false, workflowPaths: [], buildsAndroid: false, androidWorkflowPath: null },
    fileCount: 0,
    truncated: false,
    analysisMode: 'deterministic',
    notes: [],
    ...overrides,
  };
}

function round(number: number): Round {
  return {
    schemaVersion: 1,
    projectId: PROJECT,
    round: number,
    status: 'planned',
    parentRound: null,
    parentSlot: null,
    baseBranch: 'main',
    baseSha: SHA,
    manifestSha: SHA,
    strategy: 'test strategy',
    diversityTarget: 'high',
    diversityScore: 0.8,
    candidates: [],
    winner: null,
    feedback: null,
    dryRun: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function brief(slot: 'A' | 'B'): DesignBrief {
  return {
    schemaVersion: 1,
    projectId: PROJECT,
    round: 1,
    slot,
    origin: 'FABLE_EXPLORATION',
    referenceImages: [],
    slug: slot === 'A' ? 'immersive' : 'utility',
    name: slot === 'A' ? 'Immersive' : 'Utility',
    thesis: 'A thesis.',
    rationale: '',
    diversityVector: Object.fromEntries(
      DIVERSITY_DIMENSIONS.map((dimension) => [dimension, `${slot} ${dimension}`]),
    ) as DesignBrief['diversityVector'],
    directives: ['one', 'two', 'three'],
    targetScreens: [],
    antiPatterns: [],
    successCriteria: ['visible'],
    parent: null,
    generatedAt: new Date().toISOString(),
  };
}

describe('Store', () => {
  let root: string;
  let paths: DesignLabPaths;
  let store: Store;

  beforeEach(async () => {
    root = await makeTempDir('designlab-store-');
    paths = createPaths(root, join(root, '.designlab'));
    store = new Store(paths);
  });

  afterEach(async () => {
    await removeDir(root);
  });

  it('round-trips a manifest and tracks the latest pointer', async () => {
    await store.writeManifest(manifest());
    expect((await store.readManifest(PROJECT, SHA))?.appName).toBe('Test App');
    expect((await store.readLatestManifest(PROJECT))?.sha).toBe(SHA);

    // A newer commit becomes the latest, but the old one remains readable.
    const newSha = 'b'.repeat(40);
    await store.writeManifest(manifest({ sha: newSha, appName: 'Renamed' }));

    expect((await store.readLatestManifest(PROJECT))?.appName).toBe('Renamed');
    expect((await store.readManifest(PROJECT, SHA))?.appName).toBe('Test App');
  });

  it('returns null for state that does not exist', async () => {
    expect(await store.readManifest(PROJECT, SHA)).toBeNull();
    expect(await store.readLatestManifest(PROJECT)).toBeNull();
    expect(await store.readContract(PROJECT)).toBeNull();
    expect(await store.readRound(PROJECT, 1)).toBeNull();
  });

  it('throws an actionable error when required state is missing', async () => {
    await expect(store.requireManifest(PROJECT)).rejects.toThrow(DesignLabError);
    await expect(store.requireRound(PROJECT, 1)).rejects.toThrow(/does not exist/);

    // The recovery step belongs in `hint`, which is what the CLI prints.
    await expect(store.requireContract(PROJECT)).rejects.toMatchObject({
      code: 'CONTRACT_MISSING',
      hint: expect.stringContaining('inspect'),
    });
    await expect(store.requireManifest(PROJECT)).rejects.toMatchObject({
      code: 'MANIFEST_MISSING',
      hint: expect.stringContaining('inspect'),
    });
  });

  it('validates on read, so corrupt state fails loudly instead of poisoning a round', async () => {
    await writeJson(paths.manifestFile(PROJECT, SHA), { projectId: PROJECT, framework: 'not-a-framework' });
    await expect(store.readManifest(PROJECT, SHA)).rejects.toThrow(DesignLabError);
  });

  it('reports unparseable JSON as STATE_CORRUPT', async () => {
    const path = paths.roundFile(PROJECT, 1);
    await writeJson(path, {});
    await writeFile(path, '{ not json', 'utf8');

    await expect(store.readRound(PROJECT, 1)).rejects.toMatchObject({ code: 'STATE_CORRUPT' });
  });

  it('lists rounds in numeric order and computes the next round number', async () => {
    for (const number of [1, 2, 10]) await store.writeRound(round(number));

    expect(await store.listRoundNumbers(PROJECT)).toEqual([1, 2, 10]);
    expect(await store.nextRoundNumber(PROJECT)).toBe(11);
  });

  it('starts numbering at 1 for a fresh project', async () => {
    expect(await store.nextRoundNumber(PROJECT)).toBe(1);
  });

  it('stores briefs per candidate and reads them back for a round', async () => {
    await store.writeRound({
      ...round(1),
      candidates: [
        { ...emptyCandidate('A'), slug: 'immersive', name: 'Immersive' },
        { ...emptyCandidate('B'), slug: 'utility', name: 'Utility' },
      ],
    });
    await store.writeBrief(brief('A'));
    await store.writeBrief(brief('B'));

    const briefs = await store.readBriefs(PROJECT, 1);
    expect(briefs.map((entry) => entry.slot)).toEqual(['A', 'B']);
    expect(briefs[0]?.name).toBe('Immersive');
  });

  it('persists the analysis markdown alongside the manifest', async () => {
    await store.writeAnalysis(PROJECT, SHA, '# Analysis\n\nSome text.\n');
    expect(await store.readAnalysis(PROJECT, SHA)).toContain('# Analysis');
  });

  it('appends usage events and reads them back', async () => {
    for (const role of ['lead', 'builder', 'builder']) {
      await store.recordUsage({
        ts: new Date().toISOString(),
        projectId: PROJECT,
        round: 1,
        slot: null,
        role,
        model: role === 'lead' ? 'fable' : 'sonnet',
        operation: 'test',
        durationMs: 10,
        ok: true,
        costUsd: 0.01,
        inputTokens: 100,
        outputTokens: 50,
        numTurns: 1,
        cacheHit: false,
        notes: '',
      });
    }

    const usage = await store.readUsage();
    expect(usage).toHaveLength(3);
    expect(usage.filter((event) => event.role === 'builder')).toHaveLength(2);
  });

  it('skips malformed usage rows rather than failing the whole read', async () => {
    await store.recordUsage({
      ts: new Date().toISOString(),
      projectId: PROJECT,
      round: null,
      slot: null,
      role: 'lead',
      model: 'fable',
      operation: 'test',
      durationMs: 1,
      ok: true,
      costUsd: null,
      inputTokens: null,
      outputTokens: null,
      numTurns: null,
      cacheHit: false,
      notes: '',
    });
    await writeFile(paths.usageLedger, 'not json\n{"partial":\n', { encoding: 'utf8', flag: 'a' });

    expect(await store.readUsage()).toHaveLength(1);
  });

  it('round-trips lineage', async () => {
    const lineage = await store.readLineage(PROJECT);
    expect(lineage.entries).toEqual([]);

    await store.writeLineage({
      ...lineage,
      entries: [
        {
          round: 1,
          parentRound: null,
          parentSlot: null,
          baseSha: SHA,
          winner: 'C',
          winnerBranch: 'design/r001-c-premium',
          feedback: 'C wins',
          candidateSlots: ['A', 'B', 'C'],
          referenceSlots: [],
          chosenAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ],
    });

    expect((await store.readLineage(PROJECT)).entries[0]?.winner).toBe('C');
  });

  it('keeps projects isolated from each other', async () => {
    await store.writeManifest(manifest());
    await store.writeManifest(manifest({ projectId: 'other-app-99999999', appName: 'Other' }));

    expect((await store.readLatestManifest(PROJECT))?.appName).toBe('Test App');
    expect((await store.readLatestManifest('other-app-99999999'))?.appName).toBe('Other');
    expect(await store.listProjectIds()).toEqual(['other-app-99999999', PROJECT].sort());
  });

  it('writes candidate logs where the operator can find them', async () => {
    const path = await store.writeCandidateLog(PROJECT, 1, 'A', 'attempt-1.json', '{"ok":true}');
    expect(path).toContain('rounds/r001/logs/a/attempt-1.json');
  });
});

function emptyCandidate(slot: 'A' | 'B'): Round['candidates'][number] {
  return {
    slot,
    slug: slot.toLowerCase(),
    name: slot,
    origin: 'FABLE_EXPLORATION',
    status: 'planned',
    identity: null,
    captures: [],
    captureStatus: 'skipped',
    branch: `design/r001-${slot.toLowerCase()}-x`,
    worktreePath: null,
    baseSha: SHA,
    headSha: null,
    pushedSha: null,
    pushed: false,
    attempts: 0,
    escalations: 0,
    gates: [],
    protection: null,
    review: null,
    build: {
      status: 'BUILD_NOT_REQUESTED',
      variant: null,
      installability: 'UNKNOWN',
      workflowPath: null,
      workflowRunId: null,
      workflowRunUrl: null,
      artifactName: null,
      artifactUrl: null,
      conclusion: null,
      checkedAt: null,
      notes: '',
    },
    failure: null,
    filesChanged: 0,
    updatedAt: new Date().toISOString(),
  };
}
