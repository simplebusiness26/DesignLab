/**
 * Evolution engine.
 *
 * Turns a human's choice — "C wins overall, but I prefer A's map and B's
 * profile" — into a concrete plan for the next generation.
 *
 * The interesting design decision is that the winner's *branch*, not the
 * original base branch, becomes the base commit for the next round. That is
 * what makes DesignLab evolutionary rather than merely iterative: generation
 * N+1 starts from the accumulated design work of generation N, and improvements
 * compound instead of being re-derived every round.
 *
 * Feedback that names sibling candidates is parsed deterministically, so a
 * borrowed subsystem is a recorded fact in the plan rather than something a
 * model might forget.
 */

import type { AgentRunner } from '../agents/types.js';
import { LEAD_SYSTEM_PROMPT, renderBriefContext } from '../agents/prompts.js';
import { DesignLabError } from '../core/errors.js';
import { CANDIDATE_SLOTS, slugify, type CandidateSlot } from '../core/ids.js';
import type { Logger } from '../core/logger.js';
import { nullLogger } from '../core/logger.js';
import { overallScore } from '../design/reviewer.js';
import {
  nextGenerationPlanSchema,
  type Candidate,
  type DesignBrief,
  type Lineage,
  type LineageEntry,
  type NextGenerationPlan,
  type Round,
} from '../core/schemas.js';
import { z } from 'zod';

/** The lead agent returns reasoning plus directions; identity is stamped locally. */
const evolutionResponseSchema = z.object({
  reasoning: z.string().min(10),
  directions: nextGenerationPlanSchema.shape.directions,
});

export interface ChooseWinnerOptions {
  round: Round;
  winner: CandidateSlot;
  feedback: string;
}

export interface ChooseWinnerResult {
  round: Round;
  lineageEntry: LineageEntry;
  winnerCandidate: Candidate;
}

/**
 * Records a winner on a round. Validates that the candidate exists and is in a
 * state that can meaningfully win — choosing a candidate that never passed its
 * gates would poison the next generation's base commit.
 */
export function chooseWinner(options: ChooseWinnerOptions): ChooseWinnerResult {
  const { round, winner, feedback } = options;

  const winnerCandidate = round.candidates.find((candidate) => candidate.slot === winner);
  if (!winnerCandidate) {
    throw new DesignLabError('CANDIDATE_NOT_FOUND', `Round ${round.round} has no candidate ${winner}`, {
      details: { round: round.round, winner, available: round.candidates.map((c) => c.slot) },
      hint: `Available candidates: ${round.candidates.map((candidate) => candidate.slot).join(', ') || 'none'}.`,
    });
  }

  if (!winnerCandidate.headSha) {
    throw new DesignLabError('CANDIDATE_NOT_FOUND', `Candidate ${winner} has no committed implementation`, {
      details: { round: round.round, winner, status: winnerCandidate.status },
      hint: 'Only a candidate that produced commits can become the parent of the next generation.',
    });
  }

  if (winnerCandidate.status === 'failed') {
    throw new DesignLabError('CANDIDATE_NOT_FOUND', `Candidate ${winner} failed and cannot be chosen`, {
      details: { round: round.round, winner, failure: winnerCandidate.failure },
      hint: 'Choose a candidate that reached "ready" or "pushed", or re-run the round.',
    });
  }

  const updated: Round = {
    ...round,
    status: 'chosen',
    winner,
    feedback: feedback || null,
  };

  const lineageEntry: LineageEntry = {
    round: round.round,
    parentRound: round.parentRound,
    parentSlot: round.parentSlot,
    baseSha: round.baseSha,
    winner,
    winnerBranch: winnerCandidate.branch,
    feedback: feedback || null,
    candidateSlots: round.candidates.map((candidate) => candidate.slot),
    referenceSlots: round.candidates
      .filter((candidate) => candidate.origin === 'REFERENCE_IMAGE')
      .map((candidate) => candidate.slot),
    chosenAt: new Date().toISOString(),
    createdAt: round.createdAt,
  };

  return { round: updated, lineageEntry, winnerCandidate };
}

export function appendLineage(lineage: Lineage, entry: LineageEntry): Lineage {
  const entries = lineage.entries.filter((existing) => existing.round !== entry.round);
  entries.push(entry);
  entries.sort((a, b) => a.round - b.round);
  return { ...lineage, entries };
}

// ---------------------------------------------------------------------------
// Feedback interpretation
// ---------------------------------------------------------------------------

export interface FeedbackReferences {
  /** Slots the human explicitly mentioned, other than the winner. */
  mentionedSlots: CandidateSlot[];
  /** Subsystem hints, e.g. "map", "profile", parsed alongside a slot. */
  borrowings: Array<{ slot: CandidateSlot; subject: string }>;
}

/**
 * Extracts sibling references from free-text feedback.
 *
 * Recognises the phrasings people actually use — "A's map", "B's profile
 * screen", "keep the map from A" — and requires a possessive or an explicit
 * "from X" so that a bare letter in ordinary prose does not create a phantom
 * borrowing.
 */
export function parseFeedbackReferences(feedback: string, availableSlots: readonly CandidateSlot[]): FeedbackReferences {
  const mentioned = new Set<CandidateSlot>();
  const borrowings: Array<{ slot: CandidateSlot; subject: string }> = [];
  const slotPattern = availableSlots.join('');
  if (!feedback.trim() || slotPattern.length === 0) return { mentionedSlots: [], borrowings: [] };

  // "A's map", "B’s profile screen" — the subject runs forward from the
  // possessive until a verb, conjunction or sentence break ends the phrase.
  // The trailing text is captured through a lookahead so the match itself
  // stays zero-width there; consuming it would swallow a later "B's …".
  const possessive = new RegExp(`\\b([${slotPattern}])['’]s\\s+(?=(.{1,80}))`, 'gi');
  for (const match of feedback.matchAll(possessive)) {
    const slot = normaliseSlotSafe(match[1], availableSlots);
    const subject = subjectAfter(match[2] ?? '');

    if (slot && subject) {
      mentioned.add(slot);
      borrowings.push({ slot, subject });
    }
  }

  // "take the map from A" — the subject runs backwards from "from" until an
  // article, verb or sentence break, so surrounding clauses are not absorbed.
  const fromPattern = new RegExp(`\\bfrom\\s+([${slotPattern}])\\b`, 'gi');
  for (const match of feedback.matchAll(fromPattern)) {
    const slot = normaliseSlotSafe(match[1], availableSlots);
    const subject = subjectBefore(feedback.slice(0, match.index ?? 0));
    if (slot && subject) {
      mentioned.add(slot);
      borrowings.push({ slot, subject });
    }
  }

  // Bare "design C" / "candidate B" references.
  const explicit = new RegExp(`\\b(?:design|candidate|option|variant)\\s+([${slotPattern}])\\b`, 'gi');
  for (const match of feedback.matchAll(explicit)) {
    const slot = normaliseSlotSafe(match[1], availableSlots);
    if (slot) mentioned.add(slot);
  }

  return { mentionedSlots: [...mentioned].sort(), borrowings: dedupeBorrowings(borrowings) };
}

/**
 * Words that end a subject phrase. Feedback is prose, so "A's map is the best
 * part" must yield "map", not the rest of the sentence.
 */
const SUBJECT_TERMINATORS = new Set([
  'is', 'was', 'are', 'were', 'be', 'been', 'looks', 'look', 'feels', 'feel',
  'works', 'work', 'seems', 'seem', 'has', 'have', 'had', 'does', 'do', 'did',
  'wins', 'win', 'won', 'beats', 'beat', 'and', 'but', 'or', 'than', 'that',
  'which', 'because', 'so', 'however', 'really', 'though', 'overall', 'instead',
  'rather', 'while', 'when', 'if', 'it', 'its', 'i', 'we', 'you', 'they',
  'also', 'plus', 'best', 'better',
]);

/** Words that introduce a subject rather than being part of it. */
const SUBJECT_LEADERS = new Set([
  'the', 'a', 'an', 'keep', 'keeps', 'take', 'takes', 'use', 'uses', 'using',
  'adopt', 'adopts', 'want', 'wants', 'prefer', 'prefers', 'like', 'likes',
  'love', 'loved', 'borrow', 'borrows', 'bring', 'pull', 'steal', 'reuse',
  'with', 'into', 'for', 'of', 'from',
]);

const MAX_SUBJECT_WORDS = 3;

function cleanWord(raw: string): string {
  return raw.replace(/[^a-z-]/gi, '').toLowerCase();
}

function endsPhrase(raw: string): boolean {
  return /[,.;:!?]/.test(raw);
}

/** Reads a subject phrase forwards, e.g. from `"map is good."` → `"map"`. */
function subjectAfter(text: string): string {
  const words: string[] = [];

  for (const raw of text.trim().split(/\s+/)) {
    const word = cleanWord(raw);
    if (!word) break;
    if (words.length === 0 && SUBJECT_LEADERS.has(word)) continue;
    if (SUBJECT_TERMINATORS.has(word)) break;
    words.push(word);
    if (endsPhrase(raw) || words.length >= MAX_SUBJECT_WORDS) break;
  }

  return words.join(' ');
}

/** Reads a subject phrase backwards, e.g. from `"…take the map "` → `"map"`. */
function subjectBefore(text: string): string {
  const words: string[] = [];

  for (const raw of text.trim().split(/\s+/).reverse()) {
    const word = cleanWord(raw);
    if (!word) break;
    if (SUBJECT_TERMINATORS.has(word) || SUBJECT_LEADERS.has(word)) break;
    words.push(word);
    // Punctuation before this word closes the phrase.
    if (endsPhrase(raw) || words.length >= MAX_SUBJECT_WORDS) break;
  }

  return words.reverse().join(' ');
}

function normaliseSlotSafe(value: string | undefined, available: readonly CandidateSlot[]): CandidateSlot | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  return available.includes(upper as CandidateSlot) ? (upper as CandidateSlot) : null;
}

function dedupeBorrowings(
  borrowings: ReadonlyArray<{ slot: CandidateSlot; subject: string }>,
): Array<{ slot: CandidateSlot; subject: string }> {
  const seen = new Set<string>();
  const out: Array<{ slot: CandidateSlot; subject: string }> = [];
  for (const borrowing of borrowings) {
    const key = `${borrowing.slot}:${borrowing.subject.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(borrowing);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Next-generation planning
// ---------------------------------------------------------------------------

export interface PlanNextGenerationOptions {
  runner: AgentRunner;
  round: Round;
  winner: CandidateSlot;
  winnerBranch: string;
  feedback: string;
  briefs: readonly DesignBrief[];
  lineage: Lineage;
  repoDir: string;
  designCount: number;
  timeoutMs?: number;
  logger?: Logger;
}

export async function planNextGeneration(options: PlanNextGenerationOptions): Promise<NextGenerationPlan> {
  const logger = (options.logger ?? nullLogger).child({ scope: 'evolution', round: options.round.round });

  const availableSlots = options.round.candidates.map((candidate) => candidate.slot);
  const references = parseFeedbackReferences(options.feedback, availableSlots);

  const response = await options.runner.run({
    role: 'lead',
    operation: 'plan-next-generation',
    prompt: buildEvolutionPrompt(options, references),
    systemPrompt: LEAD_SYSTEM_PROMPT,
    cwd: options.repoDir,
    outputSchema: evolutionResponseSchema,
    toolPolicy: { allowed: ['Read', 'Glob', 'Grep'], denied: ['Edit', 'Write', 'Bash', 'NotebookEdit'] },
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ledger: { projectId: options.round.projectId, round: options.round.round, slot: options.winner },
  });

  if (!response.ok || !response.data) {
    // A missing evolution plan should not strand the operator, so a
    // deterministic fallback keeps `choose` useful even when the agent fails.
    logger.warn('evolution planning failed; using the deterministic fallback plan', { error: response.error });
    return fallbackPlan(options, references);
  }

  const directions = normaliseDirections(response.data.directions, options.designCount, references);

  return {
    schemaVersion: 1,
    projectId: options.round.projectId,
    round: options.round.round + 1,
    parentRound: options.round.round,
    parentSlot: options.winner,
    parentBranch: options.winnerBranch,
    feedback: options.feedback,
    reasoning: response.data.reasoning,
    directions,
    generatedAt: new Date().toISOString(),
  };
}

function normaliseDirections(
  directions: NextGenerationPlan['directions'],
  designCount: number,
  references: FeedbackReferences,
): NextGenerationPlan['directions'] {
  const seen = new Set<string>();
  const normalised = directions.slice(0, designCount).map((direction) => {
    let slug = slugify(direction.slug || direction.name);
    let suffix = 2;
    while (seen.has(slug)) {
      slug = slugify(`${direction.slug || direction.name}-${suffix}`);
      suffix += 1;
    }
    seen.add(slug);

    // When a model already describes the requested subsystem in a direction,
    // stamp the sibling slot onto that direction even if `borrowsFrom` omitted
    // it. This makes the structured plan agree with its own prose.
    const impliedBorrowings = references.borrowings
      .filter((borrowing) => directionMentionsSubject(direction, borrowing.subject))
      .map((borrowing) => borrowing.slot);

    return {
      ...direction,
      slug,
      borrowsFrom: [...new Set([...direction.borrowsFrom, ...impliedBorrowings])],
    };
  });

  if (normalised.length === 0) return directions.slice(0, designCount);

  // Human feedback outranks model omission. The prompt already calls explicit
  // borrowings requirements; this deterministic pass makes that statement
  // true. If the model did not create a matching graft, attach the missing
  // borrowing to the most suitable existing direction and update its prose so
  // the plan does not merely carry a hidden slot id with no design meaning.
  // Prefer a moderate direction, preserving dedicated conservative and radical
  // probes when possible. Multiple requested subsystems may legitimately land
  // in one hybrid direction.
  for (const borrowing of references.borrowings) {
    const represented = normalised.some(
      (direction) =>
        direction.borrowsFrom.includes(borrowing.slot) &&
        directionMentionsSubject(direction, borrowing.subject),
    );
    if (represented) continue;

    const semanticIndex = normalised.findIndex((direction) =>
      directionMentionsSubject(direction, borrowing.subject),
    );
    const targetIndex = semanticIndex >= 0 ? semanticIndex : bestBorrowingTarget(normalised);
    const target = normalised[targetIndex];
    if (!target) continue;

    const label = `candidate ${borrowing.slot}'s ${borrowing.subject}`;
    normalised[targetIndex] = {
      ...target,
      name: directionMentionsSubject(target, borrowing.subject)
        ? target.name
        : `${target.name} + ${borrowing.slot}'s ${borrowing.subject}`,
      thesis: directionMentionsSubject(target, borrowing.subject)
        ? target.thesis
        : `${target.thesis} Explicitly incorporate ${label}, as required by the human feedback.`,
      relation: `${target.relation}; incorporates ${borrowing.subject} from candidate ${borrowing.slot}`,
      borrowsFrom: [...new Set([...target.borrowsFrom, borrowing.slot])],
    };
  }

  return normalised;
}

function directionMentionsSubject(
  direction: NextGenerationPlan['directions'][number],
  subject: string,
): boolean {
  const needle = subject.trim().toLowerCase();
  if (!needle) return false;
  const haystack = `${direction.name} ${direction.thesis} ${direction.relation}`.toLowerCase();
  if (haystack.includes(needle)) return true;
  const firstWord = needle.split(/\s+/)[0];
  return firstWord ? haystack.includes(firstWord) : false;
}

function bestBorrowingTarget(directions: NextGenerationPlan['directions']): number {
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  directions.forEach((direction, index) => {
    // Keep pure conservative/radical probes intact where a moderate hybrid is
    // available; among peers, use the direction carrying the fewest grafts.
    const riskPenalty = direction.riskLevel === 'moderate' ? 0 : direction.riskLevel === 'conservative' ? 100 : 200;
    const score = riskPenalty + direction.borrowsFrom.length;
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

/**
 * Deterministic evolution plan used when the lead agent is unavailable.
 * Encodes the standard evolutionary moves: refine the winner, graft each
 * explicitly requested borrowing, and probe one radical alternative.
 */
export function fallbackPlan(
  options: PlanNextGenerationOptions,
  references: FeedbackReferences,
): NextGenerationPlan {
  const winnerBrief = options.briefs.find((brief) => brief.slot === options.winner);
  const winnerName = winnerBrief?.name ?? `Candidate ${options.winner}`;

  const directions: NextGenerationPlan['directions'] = [
    {
      slug: 'refined',
      name: `${winnerName}, refined`,
      thesis: `Keep the winning structure and resolve its rough edges.`,
      relation: 'conservative refinement of the winner',
      borrowsFrom: [],
      riskLevel: 'conservative',
    },
  ];

  for (const borrowing of references.borrowings.slice(0, Math.max(0, options.designCount - 2))) {
    const siblingBrief = options.briefs.find((brief) => brief.slot === borrowing.slot);
    directions.push({
      slug: slugify(`with-${borrowing.slot}-${borrowing.subject}`),
      name: `${winnerName} + ${borrowing.slot}'s ${borrowing.subject}`,
      thesis: `Keep the winning direction but adopt ${siblingBrief?.name ?? `candidate ${borrowing.slot}`}'s ${borrowing.subject}.`,
      relation: `winner with the ${borrowing.subject} taken from candidate ${borrowing.slot}`,
      borrowsFrom: [borrowing.slot],
      riskLevel: 'moderate',
    });
  }

  if (directions.length < options.designCount) {
    directions.push({
      slug: 'radical',
      name: `${winnerName}, pushed further`,
      thesis: `Take the winning thesis to its structural extreme and see whether it still holds.`,
      relation: 'radical evolution of the winner',
      borrowsFrom: [],
      riskLevel: 'radical',
    });
  }

  while (directions.length < options.designCount) {
    const index = directions.length;
    directions.push({
      slug: `explore-${index}`,
      name: `Exploration ${index}`,
      thesis: 'Probe an unexplored position on the dimensions the previous round converged on.',
      relation: 'exploratory sibling of the winner',
      borrowsFrom: [],
      riskLevel: 'moderate',
    });
  }

  return {
    schemaVersion: 1,
    projectId: options.round.projectId,
    round: options.round.round + 1,
    parentRound: options.round.round,
    parentSlot: options.winner,
    parentBranch: options.winnerBranch,
    feedback: options.feedback,
    reasoning:
      'Deterministic fallback plan: the lead agent was unavailable, so DesignLab derived directions from the ' +
      'winner and the borrowings named in your feedback.',
    directions: directions.slice(0, options.designCount),
    generatedAt: new Date().toISOString(),
  };
}

function buildEvolutionPrompt(options: PlanNextGenerationOptions, references: FeedbackReferences): string {
  const winnerBrief = options.briefs.find((brief) => brief.slot === options.winner);
  const rejected = options.briefs.filter((brief) => brief.slot !== options.winner);

  const sections: string[] = [
    `Round ${options.round.round} is complete. A human has chosen candidate ${options.winner} as the winner.`,
    `Plan the ${options.designCount} directions for round ${options.round.round + 1}.`,
    '',
    '## The winning design',
    '',
    winnerBrief ? renderBriefContext(winnerBrief) : `Candidate ${options.winner} (brief unavailable).`,
  ];

  if (rejected.length > 0) {
    sections.push('', '## The designs that did not win', '');
    for (const brief of rejected) {
      const candidate = options.round.candidates.find((entry) => entry.slot === brief.slot);
      const score = candidate?.review ? ` — review score ${overallScore(candidate.review)}` : '';
      sections.push(`### ${brief.slot}: ${brief.name}${score}`, `Thesis: ${brief.thesis}`, '');
    }
    sections.push(
      'Their ideas are not wasted. A losing design often contains one subsystem that beat the winner.',
    );
  }

  sections.push('', '## Human feedback', '', options.feedback || '(none given)');

  if (references.borrowings.length > 0) {
    sections.push(
      '',
      'DesignLab parsed these explicit borrowings from that feedback, and they are requirements, not suggestions:',
      ...references.borrowings.map(
        (borrowing) => `- take the ${borrowing.subject} from candidate ${borrowing.slot}`,
      ),
    );
  }

  if (options.lineage.entries.length > 0) {
    const history = options.lineage.entries
      .filter((entry) => entry.winner)
      .map((entry) => `- Round ${entry.round}: winner ${entry.winner}${entry.feedback ? ` — "${entry.feedback}"` : ''}`);
    if (history.length > 0) sections.push('', '## Earlier generations', '', ...history);
  }

  sections.push(
    '',
    '## What to produce',
    '',
    `Exactly ${options.designCount} directions for the next generation. Every direction starts from the winner's ` +
      `branch (\`${options.winnerBranch}\`), so each one inherits the winning implementation and evolves it.`,
    '',
    'A good generation covers a spread of risk:',
    '- at least one conservative refinement of the winner,',
    '- one or more grafts that combine the winner with a specific idea from a rejected sibling,',
    '- at least one radical evolution that tests whether the winning thesis has further to run.',
    '',
    'Honour every borrowing named in the feedback. Do not repeat a direction the previous round already rejected ' +
      'unless the feedback specifically asked for it.',
    '',
    'Return JSON matching the schema.',
  );

  return sections.join('\n');
}

/** All slots, for feedback parsing when a round record is unavailable. */
export const ALL_SLOTS: readonly CandidateSlot[] = CANDIDATE_SLOTS;
