import { describe, expect, it } from 'vitest';

import {
  PERFECT_10_CATEGORIES,
  XPLORER_CHALLENGERS,
  XPLORER_TOURNAMENT_B_ROUTE_COUNT,
  XPLORER_TOURNAMENT_B_SOURCE_COMMIT,
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

  it('marks only the first unfinished challenger as next', async () => {
    const result = await tournamentBStatus(process.cwd());
    const next = result.challengers.filter((challenger) => challenger.status === 'next');

    expect(next).toHaveLength(1);
    expect(next[0]?.slug).toBe('katie-dill');
    expect(result.challengers.slice(1).every((challenger) => challenger.status === 'blocked')).toBe(true);
  });
});
