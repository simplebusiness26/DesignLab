import { describe, expect, it } from 'vitest';

import { MockAgentRunner } from '../../src/agents/mock-runner.js';
import type { CandidateSlot } from '../../src/core/ids.js';
import {
  DIVERSITY_DIMENSIONS,
  type Candidate,
  type DesignBrief,
  type DiversityVector,
  type Lineage,
  type Round,
} from '../../src/core/schemas.js';
import { planNextGeneration } from '../../src/lineage/evolution.js';

const SHA = (char: string): string => char.repeat(40);

function candidate(slot: CandidateSlot): Candidate {
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
    pushed: false,
    attempts: 1,
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
    filesChanged: 1,
    updatedAt: new Date().toISOString(),
  };
}

function vector(): DiversityVector {
  return Object.fromEntries(DIVERSITY_DIMENSIONS.map((dimension) => [dimension, `${dimension} position`])) as DiversityVector;
}

function brief(slot: CandidateSlot): DesignBrief {
  return {
    schemaVersion: 1,
    projectId: 'test-app-000000',
    round: 1,
    slot,
    origin: 'FABLE_EXPLORATION',
    referenceImages: [],
    slug: `design-${slot.toLowerCase()}`,
    name: `Design ${slot}`,
    thesis: `Design ${slot} thesis`,
    rationale: '',
    diversityVector: vector(),
    directives: ['one', 'two', 'three'],
    targetScreens: [],
    antiPatterns: [],
    successCriteria: ['works'],
    parent: null,
    generatedAt: new Date().toISOString(),
  };
}

describe('planNextGeneration required borrowings', () => {
  it('deterministically preserves every subsystem explicitly requested by the human', async () => {
    const candidates = (['A', 'B', 'C', 'D'] as CandidateSlot[]).map(candidate);
    const round: Round = {
      schemaVersion: 1,
      projectId: 'test-app-000000',
      round: 1,
      status: 'chosen',
      parentRound: null,
      parentSlot: null,
      baseBranch: 'main',
      baseSha: SHA('a'),
      manifestSha: SHA('a'),
      strategy: 'test',
      diversityTarget: 'high',
      diversityScore: 0.8,
      candidates,
      winner: 'C',
      feedback: "C wins. Prefer A's map and B's profile.",
      dryRun: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const lineage: Lineage = {
      schemaVersion: 1,
      projectId: round.projectId,
      entries: [],
      updatedAt: new Date().toISOString(),
    };

    // The mock model deliberately returns a next-generation response that
    // carries A's map but omits B's profile. The evolution engine must repair
    // that omission because parsed human feedback is a requirement, not a
    // model suggestion.
    const plan = await planNextGeneration({
      runner: new MockAgentRunner({ applyBuilderEdits: false }),
      round,
      winner: 'C',
      winnerBranch: candidates.find((entry) => entry.slot === 'C')?.branch ?? 'design/r001-c-c',
      feedback: round.feedback ?? '',
      briefs: (['A', 'B', 'C', 'D'] as CandidateSlot[]).map(brief),
      lineage,
      repoDir: process.cwd(),
      designCount: 4,
    });

    const borrowedSlots = plan.directions.flatMap((direction) => direction.borrowsFrom);
    expect(borrowedSlots).toContain('A');
    expect(borrowedSlots).toContain('B');

    const profileDirection = plan.directions.find(
      (direction) => direction.borrowsFrom.includes('B') && `${direction.name} ${direction.thesis} ${direction.relation}`.toLowerCase().includes('profile'),
    );
    expect(profileDirection).toBeTruthy();
  });
});
