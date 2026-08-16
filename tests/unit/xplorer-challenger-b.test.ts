import { describe, expect, it } from 'vitest';

import {
  DESIGN_TRANSFORMATION_DIMENSIONS,
  PERFECT_10_CATEGORIES,
  XPLORER_CHALLENGERS,
  XPLORER_TOURNAMENT_B_CONTRACT_REVISION,
  XPLORER_TOURNAMENT_B_ROUTE_COUNT,
  XPLORER_TOURNAMENT_B_SOURCE_COMMIT,
  challengerDesignDeltaSchema,
  challengerPerfect10Schema,
  challengerProductTruthCheckSchema,
  prepareXplorerChallengerPacket,
  tournamentBStatus,
  validateXplorerTournamentB,
} from '../../src/tournaments/xplorer-challenger-b.js';

describe('Xplorer Tournament B runtime', () => {
  it('validates capability-first Product Truth v2 and all seven persona packs', async () => {
    const result = await validateXplorerTournamentB(process.cwd());

    expect(result.ok).toBe(true);
    expect(result.sourceCommit).toBe(XPLORER_TOURNAMENT_B_SOURCE_COMMIT);
    expect(result.contractRevision).toBe(XPLORER_TOURNAMENT_B_CONTRACT_REVISION);
    expect(result.routeCount).toBe(XPLORER_TOURNAMENT_B_ROUTE_COUNT);
    expect(result.personas).toHaveLength(XPLORER_CHALLENGERS.length);
    expect(result.sharedInputFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.sharedInputs.map((input) => input.path)).toContain(
      'knowledge/tournaments/challengers/2026-08-15-xplorer/PRODUCT_TRUTH_V2_CONTRACT.md',
    );
    expect(new Set(result.personas.map((persona) => persona.sha256)).size).toBe(XPLORER_CHALLENGERS.length);
  });

  it('prepares a v2 Katie packet that gives the persona implementation freedom without weakening Product Truth', async () => {
    const packet = await prepareXplorerChallengerPacket({
      knowledgeRoot: process.cwd(),
      challenger: 'katie-dill',
    });

    expect(packet.schemaVersion).toBe(2);
    expect(packet.contractRevision).toBe(XPLORER_TOURNAMENT_B_CONTRACT_REVISION);
    expect(packet.order).toBe(1);
    expect(packet.challengerName).toBe('Katie Dill');
    expect(packet.sourceCommit).toBe(XPLORER_TOURNAMENT_B_SOURCE_COMMIT);
    expect(packet.requiredOutputs).toContain('prototype/index.html');
    expect(packet.requiredOutputs).toContain('PERFECT_10.json');
    expect(packet.executionPrompt).toContain('BEGIN SELECTED PERSONA PACK');
    expect(packet.executionPrompt).toContain('Frozen source wins for product/data/capability facts');
    expect(packet.executionPrompt).toContain('Navigation, headers, screen grouping, control placement, gestures');
    expect(packet.executionPrompt).toContain('classify it before changing the design');
    expect(packet.executionPrompt).toContain('replace it with outcome-level verification');
    expect(packet.executionPrompt).toContain(packet.sharedInputFingerprint);
    expect(packet.executionPrompt).toContain(packet.personaFingerprint);
  });

  it('does not silently treat a pre-v2 prior candidate as v2-locked', async () => {
    await expect(
      prepareXplorerChallengerPacket({
        knowledgeRoot: process.cwd(),
        challenger: 'alex-schleifer',
      }),
    ).rejects.toThrow(/must be reviewed and locked under 2\.0-capability-first/);
  });

  it('requires migrated legacy UI assertions to name the protected outcome and replacement verification', () => {
    const valid = challengerProductTruthCheckSchema.safeParse({
      schemaVersion: 2,
      contractRevision: XPLORER_TOURNAMENT_B_CONTRACT_REVISION,
      challenger: 'karri-saarinen',
      sourceCommit: XPLORER_TOURNAMENT_B_SOURCE_COMMIT,
      checks: Array.from({ length: 20 }, (_, index) => ({
        id: `truth-${index}`,
        passed: true,
        evidence: 'Concrete capability, lifecycle, privacy or outcome evidence from the candidate.',
      })),
      migratedImplementationAssertions: [
        {
          oldAssertion: 'Frozen navigation required one exact upward swipe gesture.',
          protectedOutcome: 'Discover remains clearly reachable from the exploration experience.',
          replacementVerification: 'Outcome journey test reaches Discover through the redesigned visible interaction.',
          passed: true,
        },
      ],
      violations: [],
      passed: true,
      checkedAt: new Date().toISOString(),
    });
    expect(valid.success).toBe(true);

    const invalid = challengerProductTruthCheckSchema.safeParse({
      schemaVersion: 2,
      contractRevision: XPLORER_TOURNAMENT_B_CONTRACT_REVISION,
      challenger: 'karri-saarinen',
      sourceCommit: XPLORER_TOURNAMENT_B_SOURCE_COMMIT,
      checks: Array.from({ length: 20 }, (_, index) => ({
        id: `truth-${index}`,
        passed: true,
        evidence: 'Concrete capability evidence.',
      })),
      migratedImplementationAssertions: [
        {
          oldAssertion: 'Old gesture',
          protectedOutcome: '',
          replacementVerification: '',
          passed: true,
        },
      ],
      violations: [],
      passed: true,
      checkedAt: new Date().toISOString(),
    });
    expect(invalid.success).toBe(false);
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
      dimensions: DESIGN_TRANSFORMATION_DIMENSIONS.map((dimension) => ({
        dimension,
        rating: 'major',
        evidence: ['evidence evidence'],
      })),
      screenFamilies: Array.from({ length: 10 }, (_, index) => ({
        family: `family-${index}`,
        structuralChange: true,
        evidence: 'structural evidence',
      })),
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

  it('surfaces pre-v2 candidates instead of pretending they are current locks', async () => {
    const result = await tournamentBStatus(process.cwd());
    const statuses = result.challengers.map((challenger) => challenger.status);

    expect(result.contractRevision).toBe(XPLORER_TOURNAMENT_B_CONTRACT_REVISION);
    expect(statuses).toContain('pre-v2');
    expect(result.challengers[0]?.slug).toBe('katie-dill');
    expect(result.challengers[0]?.status).toBe('pre-v2');

    const firstUnresolved = statuses.findIndex((status) => status !== 'locked');
    expect(firstUnresolved).toBeGreaterThanOrEqual(0);
    expect(statuses.slice(0, firstUnresolved).every((status) => status === 'locked')).toBe(true);
    expect(statuses.slice(firstUnresolved + 1).every((status) => status !== 'locked')).toBe(true);
  });
});
