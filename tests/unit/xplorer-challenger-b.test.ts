import { describe, expect, it } from 'vitest';

import {
  DESIGN_TRANSFORMATION_DIMENSIONS,
  PERFECT_10_CATEGORIES,
  XPLORER_CHALLENGERS,
  XPLORER_TOURNAMENT_B_ROUTE_COUNT,
  XPLORER_TOURNAMENT_B_SOURCE_COMMIT,
  challengerDesignDeltaSchema,
  challengerPerfect10Schema,
  prepareXplorerChallengerPacket,
  tournamentBStatus,
  validateXplorerTournamentB,
} from '../../src/tournaments/xplorer-challenger-b.js';

describe('Xplorer Tournament B runtime', () => {
  it('validates the locked shared Product Truth and all seven persona packs', async () => {
    const result = await validateXplorerTournamentB(process.cwd());

    expect(result.ok).toBe(true);
    expect(result.sourceCommit).toBe(XPLORER_TOURNAMENT_B_SOURCE_COMMIT);
    expect(result.routeCount).toBe(XPLORER_TOURNAMENT_B_ROUTE_COUNT);
    expect(result.personas).toHaveLength(XPLORER_CHALLENGERS.length);
    expect(result.sharedInputFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(result.personas.map((persona) => persona.sha256)).size).toBe(XPLORER_CHALLENGERS.length);
  });

  it('prepares Katie first from the same frozen inputs without using the generic round planner', async () => {
    const packet = await prepareXplorerChallengerPacket({
      knowledgeRoot: process.cwd(),
      challenger: 'katie-dill',
    });

    expect(packet.order).toBe(1);
    expect(packet.challengerName).toBe('Katie Dill');
    expect(packet.sourceCommit).toBe(XPLORER_TOURNAMENT_B_SOURCE_COMMIT);
    expect(packet.requiredOutputs).toContain('prototype/index.html');
    expect(packet.requiredOutputs).toContain('PERFECT_10.json');
    expect(packet.executionPrompt).toContain('BEGIN SELECTED PERSONA PACK');
    expect(packet.executionPrompt).toContain('A single score below 5/5 blocks submission');
    expect(packet.executionPrompt).toContain(packet.sharedInputFingerprint);
    expect(packet.executionPrompt).toContain(packet.personaFingerprint);
  });

  it('prepares Alex with the mandatory creative-independence transformation gate', async () => {
    const packet = await prepareXplorerChallengerPacket({
      knowledgeRoot: process.cwd(),
      challenger: 'alex-schleifer',
    });

    expect(packet.order).toBe(2);
    expect(packet.requiredOutputs).toContain('DESIGN_DELTA.json');
    expect(packet.transformationStandard?.path).toBe('knowledge/DESIGN_TRANSFORMATION_STANDARD.md');
    expect(packet.transformationStandard?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(packet.executionPrompt).toContain('Existing Xplorer UI is NOT a template');
    expect(packet.executionPrompt).toContain('A reskin or simplified old layout automatically fails');
  });

  it('rejects design-delta proof that is not a genuine transformation', () => {
    const valid = challengerDesignDeltaSchema.safeParse({
      schemaVersion: 1,
      challenger: 'alex-schleifer',
      sourceCommit: XPLORER_TOURNAMENT_B_SOURCE_COMMIT,
      sameDesign: false,
      dimensions: DESIGN_TRANSFORMATION_DIMENSIONS.map((dimension) => ({
        dimension,
        rating: 'major',
        evidence: ['Concrete implementation and prototype evidence for this changed dimension.'],
      })),
      screenFamilies: Array.from({ length: 10 }, (_, index) => ({
        family: `family-${index}`,
        structuralChange: index < 8,
        evidence: 'Documented structural re-composition beyond colour, radius or spacing changes.',
      })),
      paletteIndependence: 'The palette was derived from the challenger product model rather than copied from frozen Xplorer.',
      designedFromPersonaModel: true,
    });
    expect(valid.success).toBe(true);

    const invalid = challengerDesignDeltaSchema.safeParse({
      schemaVersion: 1,
      challenger: 'alex-schleifer',
      sourceCommit: XPLORER_TOURNAMENT_B_SOURCE_COMMIT,
      sameDesign: true,
      dimensions: DESIGN_TRANSFORMATION_DIMENSIONS.map((dimension) => ({ dimension, rating: 'major', evidence: ['evidence evidence'] })),
      screenFamilies: Array.from({ length: 10 }, (_, index) => ({ family: `family-${index}`, structuralChange: true, evidence: 'structural evidence' })),
      paletteIndependence: 'This intentionally long palette explanation still cannot rescue sameDesign=true.',
      designedFromPersonaModel: true,
    });
    expect(invalid.success).toBe(false);
  });

  it('requires every Perfect-10 category to be scored exactly 5', () => {
    const scores = PERFECT_10_CATEGORIES.map((category) => ({
      category,
      score: 5 as const,
      evidence: ['Concrete evidence from the completed candidate.'],
    }));

    const valid = challengerPerfect10Schema.safeParse({
      schemaVersion: 1,
      challenger: 'katie-dill',
      sourceCommit: XPLORER_TOURNAMENT_B_SOURCE_COMMIT,
      scores,
      allPassed: true,
      reviewedAt: new Date().toISOString(),
    });
    expect(valid.success).toBe(true);

    const invalid = challengerPerfect10Schema.safeParse({
      schemaVersion: 1,
      challenger: 'katie-dill',
      sourceCommit: XPLORER_TOURNAMENT_B_SOURCE_COMMIT,
      scores: scores.map((score, index) => (index === 0 ? { ...score, score: 4 } : score)),
      allPassed: true,
      reviewedAt: new Date().toISOString(),
    });
    expect(invalid.success).toBe(false);
  });

  it('keeps tournament status strictly sequential as candidates become locked', async () => {
    const result = await tournamentBStatus(process.cwd());
    const statuses = result.challengers.map((challenger) => challenger.status);
    const nextIndexes = statuses
      .map((status, index) => (status === 'next' ? index : -1))
      .filter((index) => index >= 0);

    expect(nextIndexes.length).toBeLessThanOrEqual(1);

    const firstNonLocked = statuses.findIndex((status) => status !== 'locked');
    if (firstNonLocked === -1) {
      expect(statuses.every((status) => status === 'locked')).toBe(true);
      return;
    }

    expect(statuses[firstNonLocked]).toBe('next');
    expect(statuses.slice(0, firstNonLocked).every((status) => status === 'locked')).toBe(true);
    expect(statuses.slice(firstNonLocked + 1).every((status) => status === 'blocked')).toBe(true);
  });
});
