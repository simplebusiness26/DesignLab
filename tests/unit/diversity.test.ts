import { describe, expect, it } from 'vitest';

import {
  describeDiversityShortfall,
  scoreDiversity,
  textSimilarity,
  type ScorableDesign,
} from '../../src/design/diversity.js';
import { DIVERSITY_DIMENSIONS, type DiversityVector } from '../../src/core/schemas.js';

function vector(fill: (dimension: string, index: number) => string): DiversityVector {
  return Object.fromEntries(
    DIVERSITY_DIMENSIONS.map((dimension, index) => [dimension, fill(dimension, index)]),
  ) as DiversityVector;
}

const IMMERSIVE: ScorableDesign = {
  id: 'immersive',
  diversityVector: vector((dimension) => `edge to edge canvas ${dimension} full bleed imagery`),
};

const UTILITY: ScorableDesign = {
  id: 'utility',
  diversityVector: vector(() => 'dense tabular rows compact toolbar keyboard shortcuts'),
};

const PREMIUM: ScorableDesign = {
  id: 'premium',
  diversityVector: vector(() => 'generous whitespace restrained serif slow deliberate reveal'),
};

describe('textSimilarity', () => {
  it('is 1 for identical text and 0 for disjoint text', () => {
    expect(textSimilarity('dense tabular rows', 'dense tabular rows')).toBe(1);
    expect(textSimilarity('dense tabular rows', 'airy generous whitespace')).toBe(0);
  });

  it('ignores word order and stop words', () => {
    expect(textSimilarity('a dense grid of cards', 'grid of dense cards')).toBe(1);
  });

  it('reports partial overlap between the two extremes', () => {
    const similarity = textSimilarity('dense compact grid', 'dense airy grid');
    expect(similarity).toBeGreaterThan(0);
    expect(similarity).toBeLessThan(1);
  });

  it('treats two empty strings as identical', () => {
    expect(textSimilarity('', '')).toBe(1);
    expect(textSimilarity('something', '')).toBe(0);
  });
});

describe('scoreDiversity', () => {
  it('scores a single design as fully diverse', () => {
    const score = scoreDiversity([IMMERSIVE]);
    expect(score.score).toBe(1);
    expect(score.pairs).toHaveLength(0);
  });

  it('scores genuinely different designs highly', () => {
    const score = scoreDiversity([IMMERSIVE, UTILITY, PREMIUM]);
    expect(score.score).toBeGreaterThan(0.9);
    expect(score.convergedDimensions).toHaveLength(0);
  });

  it('scores near-identical designs at zero and names the colliding pair', () => {
    const clone: ScorableDesign = { id: 'utility-copy', diversityVector: UTILITY.diversityVector };
    const score = scoreDiversity([UTILITY, clone]);

    expect(score.score).toBe(0);
    expect(score.weakestPair?.a).toBe('utility');
    expect(score.weakestPair?.b).toBe('utility-copy');
    expect(score.weakestPair?.collidingDimensions).toHaveLength(DIVERSITY_DIMENSIONS.length);
  });

  it('catches the failure mode this system exists to prevent: one design, four colourways', () => {
    // Only the visual-language dimension differs; everything structural is shared.
    const base = 'single scrolling feed persistent bottom tabs medium density';
    const palettes = ['blue palette', 'green palette', 'warm palette', 'dark palette'];

    const designs: ScorableDesign[] = palettes.map((palette, index) => ({
      id: `variant-${index}`,
      diversityVector: vector((dimension) => (dimension === 'visualLanguage' ? palette : base)),
    }));

    const score = scoreDiversity(designs);
    expect(score.score).toBeLessThan(0.2);
    // Every structural dimension should be flagged as converged.
    expect(score.convergedDimensions.length).toBeGreaterThanOrEqual(DIVERSITY_DIMENSIONS.length - 1);
    expect(score.convergedDimensions).toContain('informationHierarchy');
    expect(score.convergedDimensions).toContain('navigationPresentation');
  });

  it('identifies the weakest pair inside an otherwise diverse set', () => {
    const nearDuplicate: ScorableDesign = {
      id: 'utility-2',
      diversityVector: vector(() => 'dense tabular rows compact toolbar keyboard shortcuts'),
    };
    const score = scoreDiversity([IMMERSIVE, UTILITY, PREMIUM, nearDuplicate]);
    const pair = [score.weakestPair?.a, score.weakestPair?.b].sort();
    expect(pair).toEqual(['utility', 'utility-2']);
  });

  it('produces the number of pairs implied by the set size', () => {
    expect(scoreDiversity([IMMERSIVE, UTILITY, PREMIUM]).pairs).toHaveLength(3);
  });
});

describe('describeDiversityShortfall', () => {
  it('names the colliding pair and the dimensions to separate on', () => {
    const clone: ScorableDesign = { id: 'utility-copy', diversityVector: UTILITY.diversityVector };
    const feedback = describeDiversityShortfall(scoreDiversity([UTILITY, clone]), 0.55);

    expect(feedback).toContain('utility');
    expect(feedback).toContain('utility-copy');
    expect(feedback).toContain('informationHierarchy');
    // The correction must be actionable, not a scolding.
    expect(feedback).toMatch(/Rewrite one of them/);
  });
});
