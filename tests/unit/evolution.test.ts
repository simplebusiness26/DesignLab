import { describe, expect, it } from 'vitest';

import {
  appendLineage,
  chooseWinner,
  fallbackPlan,
  parseFeedbackReferences,
} from '../../src/lineage/evolution.js';
import { DesignLabError } from '../../src/core/errors.js';
import { MockAgentRunner } from '../../src/agents/mock-runner.js';
import type { Candidate, DesignBrief, Lineage, Round } from '../../src/core/schemas.js';
import { DIVERSITY_DIMENSIONS, type DiversityVector } from '../../src/core/schemas.js';
import type { CandidateSlot } from '../../src/core/ids.js';

const SHA = (char: string): string => char.repeat(40);

function candidate(slot: CandidateSlot, overrides: Partial<Candidate> = {}): Candidate {
  return {
    slot,
    slug: slot.toLowerCase(),
    name: `Design ${slot}`,
    origin: 'FABLE_EXPLORATION',
    status: 'ready',
    identity: null,
    captures: [],
    captureStatus: 'skipped',
    branch: `design/r001-${slot.toLowerCase()}-${slot.toLowerCase()}`,
    worktreePath: `/tmp/wt/${slot}`,
    baseSha: SHA('a'),
    headSha: SHA(slot.toLowerCase()),
    pushedSha: null,
    pushed: true,
    attempts: 1,
    escalations: 0,
    gates: [],
    protection: null,
    review: null,
    build: {
      status: 'BUILD_PENDING',
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
    filesChanged: 5,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function round(overrides: Partial<Round> = {}): Round {
  return {
    schemaVersion: 1,
    projectId: 'test-app-000000',
    round: 1,
    status: 'complete',
    parentRound: null,
    parentSlot: null,
    baseBranch: 'main',
    baseSha: SHA('a'),
    manifestSha: SHA('a'),
    strategy: 'explore four structurally distinct systems',
    diversityTarget: 'high',
    diversityScore: 0.8,
    candidates: [candidate('A'), candidate('B'), candidate('C'), candidate('D')],
    winner: null,
    feedback: null,
    dryRun: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function vector(): DiversityVector {
  return Object.fromEntries(DIVERSITY_DIMENSIONS.map((d) => [d, `${d} position`])) as DiversityVector;
}

function brief(slot: CandidateSlot, name: string): DesignBrief {
  return {
    schemaVersion: 1,
    projectId: 'test-app-000000',
    round: 1,
    slot,
    origin: 'FABLE_EXPLORATION',
    referenceImages: [],
    slug: name.toLowerCase(),
    name,
    thesis: `${name} thesis`,
    rationale: '',
    diversityVector: vector(),
    directives: ['a', 'b', 'c'],
    targetScreens: [],
    antiPatterns: [],
    successCriteria: ['visible'],
    parent: null,
    generatedAt: new Date().toISOString(),
  };
}

describe('chooseWinner', () => {
  it('records the winner and produces a lineage entry', () => {
    const result = chooseWinner({ round: round(), winner: 'C', feedback: 'C reads best.' });

    expect(result.round.status).toBe('chosen');
    expect(result.round.winner).toBe('C');
    expect(result.round.feedback).toBe('C reads best.');
    expect(result.lineageEntry.winnerBranch).toBe('design/r001-c-c');
    expect(result.lineageEntry.candidateSlots).toEqual(['A', 'B', 'C', 'D']);
    expect(result.lineageEntry.chosenAt).toBeTruthy();
  });

  it('rejects a candidate that does not exist', () => {
    expect(() => chooseWinner({ round: round(), winner: 'H', feedback: '' })).toThrow(DesignLabError);
  });

  it('rejects a candidate with no committed implementation', () => {
    const withoutCommit = round({
      candidates: [candidate('A', { headSha: null, status: 'gates-failed' })],
    });
    expect(() => chooseWinner({ round: withoutCommit, winner: 'A', feedback: '' })).toThrow(
      /no committed implementation/,
    );
  });

  it('rejects a failed candidate, since it would poison the next base commit', () => {
    const failed = round({ candidates: [candidate('A', { status: 'failed' })] });
    expect(() => chooseWinner({ round: failed, winner: 'A', feedback: '' })).toThrow(/failed and cannot be chosen/);
  });
});

describe('appendLineage', () => {
  const empty: Lineage = {
    schemaVersion: 1,
    projectId: 'test-app-000000',
    entries: [],
    updatedAt: new Date().toISOString(),
  };

  it('appends and keeps entries ordered by round', () => {
    const { lineageEntry: first } = chooseWinner({ round: round(), winner: 'A', feedback: '' });
    const { lineageEntry: second } = chooseWinner({ round: round({ round: 2 }), winner: 'B', feedback: '' });

    const lineage = appendLineage(appendLineage(empty, second), first);
    expect(lineage.entries.map((entry) => entry.round)).toEqual([1, 2]);
  });

  it('replaces an existing entry for the same round rather than duplicating it', () => {
    const { lineageEntry: original } = chooseWinner({ round: round(), winner: 'A', feedback: '' });
    const { lineageEntry: corrected } = chooseWinner({ round: round(), winner: 'C', feedback: 'changed my mind' });

    const lineage = appendLineage(appendLineage(empty, original), corrected);
    expect(lineage.entries).toHaveLength(1);
    expect(lineage.entries[0]?.winner).toBe('C');
  });
});

describe('parseFeedbackReferences', () => {
  const slots: CandidateSlot[] = ['A', 'B', 'C', 'D'];

  it('parses the example from the product brief', () => {
    const references = parseFeedbackReferences(
      "C wins overall. I prefer A's map and B's profile.",
      slots,
    );

    expect(references.mentionedSlots).toContain('A');
    expect(references.mentionedSlots).toContain('B');
    expect(references.borrowings).toEqual(
      expect.arrayContaining([
        { slot: 'A', subject: 'map' },
        { slot: 'B', subject: 'profile' },
      ]),
    );
  });

  it('handles the "X from Y" phrasing', () => {
    const references = parseFeedbackReferences('Keep C but take the map from A.', slots);
    expect(references.borrowings).toEqual([{ slot: 'A', subject: 'map' }]);
  });

  it('handles a typographic apostrophe', () => {
    const references = parseFeedbackReferences('I want B’s profile screen.', slots);
    expect(references.borrowings[0]).toEqual({ slot: 'B', subject: 'profile screen' });
  });

  it('recognises explicit "design X" references', () => {
    expect(parseFeedbackReferences('Design B was close.', slots).mentionedSlots).toEqual(['B']);
  });

  it('does not invent borrowings from ordinary prose', () => {
    // A bare capital letter in a sentence must not become a phantom borrowing.
    const references = parseFeedbackReferences('A better result overall, and it loads faster.', slots);
    expect(references.borrowings).toHaveLength(0);
  });

  it('deduplicates repeated borrowings', () => {
    const references = parseFeedbackReferences("A's map is good. Really, A's map is the best part.", slots);
    expect(references.borrowings).toHaveLength(1);
  });

  it('returns nothing for empty feedback', () => {
    expect(parseFeedbackReferences('', slots)).toEqual({ mentionedSlots: [], borrowings: [] });
  });

  it('ignores letters outside the round', () => {
    expect(parseFeedbackReferences("H's layout was nice.", ['A', 'B']).borrowings).toHaveLength(0);
  });
});

describe('fallbackPlan', () => {
  const briefs = [brief('A', 'Immersive'), brief('B', 'Social'), brief('C', 'Premium'), brief('D', 'Utility')];

  it('covers refinement, grafting and radical evolution', () => {
    const references = parseFeedbackReferences("C wins. I prefer A's map and B's profile.", [
      'A',
      'B',
      'C',
      'D',
    ]);

    const plan = fallbackPlan(
      {
        runner: new MockAgentRunner(),
        round: round(),
        winner: 'C',
        winnerBranch: 'design/r001-c-premium',
        feedback: "C wins. I prefer A's map and B's profile.",
        briefs,
        lineage: { schemaVersion: 1, projectId: 'p', entries: [], updatedAt: new Date().toISOString() },
        repoDir: '/tmp',
        designCount: 4,
      },
      references,
    );

    expect(plan.round).toBe(2);
    expect(plan.parentRound).toBe(1);
    expect(plan.parentSlot).toBe('C');
    expect(plan.parentBranch).toBe('design/r001-c-premium');
    expect(plan.directions).toHaveLength(4);

    const risks = plan.directions.map((direction) => direction.riskLevel);
    expect(risks).toContain('conservative');
    expect(risks).toContain('radical');

    // Both requested borrowings must survive into concrete directions.
    const borrowed = plan.directions.flatMap((direction) => direction.borrowsFrom);
    expect(borrowed).toContain('A');
    expect(borrowed).toContain('B');
  });

  it('produces exactly the requested number of directions with unique slugs', () => {
    const plan = fallbackPlan(
      {
        runner: new MockAgentRunner(),
        round: round(),
        winner: 'A',
        winnerBranch: 'design/r001-a-immersive',
        feedback: '',
        briefs,
        lineage: { schemaVersion: 1, projectId: 'p', entries: [], updatedAt: new Date().toISOString() },
        repoDir: '/tmp',
        designCount: 3,
      },
      { mentionedSlots: [], borrowings: [] },
    );

    expect(plan.directions).toHaveLength(3);
    expect(new Set(plan.directions.map((direction) => direction.slug)).size).toBe(3);
  });
});
