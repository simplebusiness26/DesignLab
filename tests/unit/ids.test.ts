import { describe, expect, it } from 'vitest';

import {
  apkArtifactName,
  designBranchName,
  normaliseRepoUrl,
  normaliseSlot,
  parseRoundRef,
  projectIdFromRepo,
  roundId,
  slotForIndex,
  slugify,
  worktreeDirName,
} from '../../src/core/ids.js';

describe('roundId', () => {
  it('zero-pads to three digits', () => {
    expect(roundId(1)).toBe('r001');
    expect(roundId(12)).toBe('r012');
    expect(roundId(345)).toBe('r345');
  });

  it('rejects non-positive and non-integer input', () => {
    expect(() => roundId(0)).toThrow(RangeError);
    expect(() => roundId(-1)).toThrow(RangeError);
    expect(() => roundId(1.5)).toThrow(RangeError);
  });
});

describe('parseRoundRef', () => {
  it('accepts the forms a human actually types', () => {
    expect(parseRoundRef('1')).toBe(1);
    expect(parseRoundRef('r001')).toBe(1);
    expect(parseRoundRef('R012')).toBe(12);
    expect(parseRoundRef('round-3')).toBe(3);
    expect(parseRoundRef('  2 ')).toBe(2);
  });

  it('rejects nonsense', () => {
    expect(parseRoundRef('abc')).toBeNull();
    expect(parseRoundRef('')).toBeNull();
    expect(parseRoundRef('r0')).toBe(null);
  });
});

describe('slugify', () => {
  it('produces git-ref-safe slugs', () => {
    expect(slugify('Immersive & Spatial')).toBe('immersive-spatial');
    expect(slugify('  --Premium Calm--  ')).toBe('premium-calm');
    expect(slugify('Café Crème')).toBe('cafe-creme');
    expect(slugify('a/b/c')).toBe('a-b-c');
  });

  it('never returns an empty or dash-terminated slug', () => {
    expect(slugify('!!!')).toBe('design');
    expect(slugify('')).toBe('design');
    // Truncation must not leave a trailing dash, which git refs disallow.
    expect(slugify('aaaaaaaaa-bbbbbbbbb', 10).endsWith('-')).toBe(false);
  });

  it('respects the length cap', () => {
    expect(slugify('a'.repeat(100)).length).toBeLessThanOrEqual(32);
  });
});

describe('designBranchName', () => {
  it('follows the documented convention', () => {
    expect(designBranchName({ round: 1, slot: 'A', slug: 'immersive' })).toBe('design/r001-a-immersive');
    expect(designBranchName({ round: 12, slot: 'D', slug: 'Utility Speed' })).toBe(
      'design/r012-d-utility-speed',
    );
  });

  it('honours a custom prefix and strips stray slashes', () => {
    expect(designBranchName({ prefix: 'experiments/', round: 2, slot: 'B', slug: 'social' })).toBe(
      'experiments/r002-b-social',
    );
  });
});

describe('apkArtifactName', () => {
  it('produces the documented artifact filename', () => {
    expect(apkArtifactName({ appSlug: 'FieldNotes', round: 1, slot: 'A', slug: 'immersive' })).toBe(
      'fieldnotes-R001-A-immersive.apk',
    );
  });
});

describe('worktreeDirName', () => {
  it('is flat and filesystem-safe', () => {
    expect(worktreeDirName(3, 'C', 'premium calm')).toBe('r003-c-premium-calm');
  });
});

describe('normaliseSlot', () => {
  it('accepts lower case and rejects out-of-range letters', () => {
    expect(normaliseSlot('c')).toBe('C');
    expect(() => normaliseSlot('Z')).toThrow(RangeError);
  });
});

describe('slotForIndex', () => {
  it('maps positions to letters and rejects overflow', () => {
    expect(slotForIndex(0)).toBe('A');
    expect(slotForIndex(3)).toBe('D');
    expect(() => slotForIndex(8)).toThrow(RangeError);
  });
});

describe('normaliseRepoUrl', () => {
  it('maps every reference to one repository onto the same identity', () => {
    const expected = 'github.com/owner/app';
    expect(normaliseRepoUrl('https://github.com/owner/app')).toBe(expected);
    expect(normaliseRepoUrl('https://github.com/owner/app.git')).toBe(expected);
    expect(normaliseRepoUrl('https://github.com/owner/app/')).toBe(expected);
    expect(normaliseRepoUrl('git@github.com:owner/app.git')).toBe(expected);
    expect(normaliseRepoUrl('ssh://git@github.com:owner/app')).toBe(expected);
  });
});

describe('projectIdFromRepo', () => {
  it('is stable across equivalent URL forms', () => {
    expect(projectIdFromRepo('https://github.com/owner/app')).toBe(
      projectIdFromRepo('git@github.com:owner/app.git'),
    );
  });

  it('distinguishes forks that share a repository name', () => {
    expect(projectIdFromRepo('https://github.com/alice/app')).not.toBe(
      projectIdFromRepo('https://github.com/bob/app'),
    );
  });

  it('reads as owner-repo-hash', () => {
    expect(projectIdFromRepo('https://github.com/owner/app')).toMatch(/^owner-app-[0-9a-f]{8}$/);
  });
});
