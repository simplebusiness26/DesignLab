/**
 * Diversity scoring.
 *
 * The central product risk in DesignLab is that a model, asked for four
 * designs, produces one design in four colourways. This module makes that risk
 * measurable rather than a matter of taste.
 *
 * Each design declares a position on thirteen dimensions. Two designs are
 * compared dimension by dimension using token-overlap similarity; the round's
 * score is the mean pairwise *distance*. A score below the configured
 * threshold sends the plan back to the lead agent with the specific collisions
 * named, which is far more useful than "be more different".
 */

import { DIVERSITY_DIMENSIONS, type DiversityDimension, type DiversityVector } from '../core/schemas.js';

export interface PairDistance {
  a: string;
  b: string;
  distance: number;
  /** Dimensions where the two designs are effectively saying the same thing. */
  collidingDimensions: DiversityDimension[];
}

export interface DiversityScore {
  /** Mean pairwise distance across the round. 0 = identical, 1 = fully distinct. */
  score: number;
  /** The most similar pair — the one to fix first. */
  weakestPair: PairDistance | null;
  pairs: PairDistance[];
  /** Dimensions on which the whole round has converged. */
  convergedDimensions: DiversityDimension[];
}

export interface ScorableDesign {
  /** Identifier used in feedback, e.g. a slug or slot. */
  id: string;
  diversityVector: DiversityVector;
  thesis?: string;
}

/** Similarity above this means two designs collide on a dimension. */
const COLLISION_THRESHOLD = 0.6;

export function scoreDiversity(designs: readonly ScorableDesign[]): DiversityScore {
  if (designs.length < 2) {
    return { score: 1, weakestPair: null, pairs: [], convergedDimensions: [] };
  }

  const pairs: PairDistance[] = [];
  const collisionCounts = new Map<DiversityDimension, number>();

  for (let i = 0; i < designs.length; i += 1) {
    for (let j = i + 1; j < designs.length; j += 1) {
      const first = designs[i];
      const second = designs[j];
      if (!first || !second) continue;

      const collidingDimensions: DiversityDimension[] = [];
      let similaritySum = 0;

      for (const dimension of DIVERSITY_DIMENSIONS) {
        const similarity = textSimilarity(
          first.diversityVector[dimension] ?? '',
          second.diversityVector[dimension] ?? '',
        );
        similaritySum += similarity;
        if (similarity >= COLLISION_THRESHOLD) {
          collidingDimensions.push(dimension);
          collisionCounts.set(dimension, (collisionCounts.get(dimension) ?? 0) + 1);
        }
      }

      const meanSimilarity = similaritySum / DIVERSITY_DIMENSIONS.length;
      pairs.push({
        a: first.id,
        b: second.id,
        distance: round3(1 - meanSimilarity),
        collidingDimensions,
      });
    }
  }

  const score = round3(pairs.reduce((total, pair) => total + pair.distance, 0) / pairs.length);
  const weakestPair = pairs.reduce<PairDistance | null>(
    (worst, pair) => (worst === null || pair.distance < worst.distance ? pair : worst),
    null,
  );

  const pairCount = pairs.length;
  const convergedDimensions = [...collisionCounts.entries()]
    // A dimension is "converged" when most pairs collide on it.
    .filter(([, count]) => count >= Math.max(1, Math.ceil(pairCount * 0.6)))
    .map(([dimension]) => dimension)
    .sort();

  return { score, weakestPair, pairs, convergedDimensions };
}

/**
 * Token-overlap similarity (Jaccard over normalised word sets, with a bonus
 * for exact matches). Deliberately simple and dependency-free: the goal is to
 * catch "these two say the same thing", not to model semantics.
 */
export function textSimilarity(a: string, b: string): number {
  const left = tokenise(a);
  const right = tokenise(b);
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  const jaccard = union === 0 ? 0 : intersection / union;

  const normalisedA = [...left].sort().join(' ');
  const normalisedB = [...right].sort().join(' ');
  return normalisedA === normalisedB ? 1 : jaccard;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'the', 'of', 'to', 'with', 'for', 'on', 'in', 'is', 'are',
  'that', 'this', 'it', 'as', 'by', 'at', 'or', 'be', 'more', 'less', 'very',
]);

function tokenise(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/[\s-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  );
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Actionable feedback for a re-plan. Names the colliding pair and the
 * dimensions they must separate on, so the second attempt is a correction
 * rather than a re-roll.
 */
export function describeDiversityShortfall(score: DiversityScore, threshold: number): string {
  const lines = [
    `The design set scored ${score.score.toFixed(3)} on diversity, below the required ${threshold.toFixed(3)}.`,
  ];

  if (score.weakestPair) {
    lines.push(
      '',
      `The closest pair is "${score.weakestPair.a}" and "${score.weakestPair.b}" (distance ${score.weakestPair.distance.toFixed(3)}).`,
    );
    if (score.weakestPair.collidingDimensions.length > 0) {
      lines.push(
        `They take effectively the same position on: ${score.weakestPair.collidingDimensions.join(', ')}.`,
        'Rewrite one of them so it differs structurally on at least three of those dimensions.',
      );
    }
  }

  if (score.convergedDimensions.length > 0) {
    lines.push(
      '',
      `The whole set has converged on: ${score.convergedDimensions.join(', ')}.`,
      'These dimensions are doing no work. Give each design a genuinely different position on them.',
    );
  }

  lines.push(
    '',
    'A different colour palette or type scale is not a different design. Different information hierarchy, ' +
      'navigation presentation, density and interaction model are.',
  );

  return lines.join('\n');
}
