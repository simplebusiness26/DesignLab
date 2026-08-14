import { describe, expect, it } from 'vitest';

import { compileGlob, matchesAny, matchesGlob } from '../../src/protection/glob.js';

describe('glob matching', () => {
  it('matches literal paths', () => {
    expect(matchesGlob('package.json', 'package.json')).toBe(true);
    expect(matchesGlob('package.json', 'src/package.json')).toBe(false);
  });

  it('treats * as a single segment wildcard', () => {
    expect(matchesGlob('src/*.ts', 'src/index.ts')).toBe(true);
    expect(matchesGlob('src/*.ts', 'src/deep/index.ts')).toBe(false);
  });

  it('treats ** as a cross-segment wildcard', () => {
    expect(matchesGlob('src/**', 'src/a/b/c.ts')).toBe(true);
    expect(matchesGlob('**/*.sql', 'db/migrations/001.sql')).toBe(true);
    expect(matchesGlob('**/migrations/**', 'server/db/migrations/002_add.sql')).toBe(true);
  });

  it('lets a/**/b also match a/b', () => {
    expect(matchesGlob('src/**/theme.ts', 'src/theme.ts')).toBe(true);
    expect(matchesGlob('src/**/theme.ts', 'src/ui/tokens/theme.ts')).toBe(true);
  });

  it('supports brace alternation', () => {
    expect(matchesGlob('**/*.{png,jpg,svg}', 'assets/logo.svg')).toBe(true);
    expect(matchesGlob('**/*.{png,jpg,svg}', 'assets/logo.gif')).toBe(false);
    expect(matchesGlob('{package-lock.json,yarn.lock}', 'yarn.lock')).toBe(true);
  });

  it('supports nested braces', () => {
    expect(matchesGlob('src/{a,b{c,d}}/x.ts', 'src/bd/x.ts')).toBe(true);
    expect(matchesGlob('src/{a,b{c,d}}/x.ts', 'src/be/x.ts')).toBe(false);
  });

  it('supports ? and character classes', () => {
    expect(matchesGlob('src/?.ts', 'src/a.ts')).toBe(true);
    expect(matchesGlob('src/?.ts', 'src/ab.ts')).toBe(false);
    expect(matchesGlob('src/[abc].ts', 'src/b.ts')).toBe(true);
    expect(matchesGlob('src/[!abc].ts', 'src/d.ts')).toBe(true);
    expect(matchesGlob('src/[!abc].ts', 'src/a.ts')).toBe(false);
  });

  it('treats a trailing slash as "this directory and everything under it"', () => {
    expect(matchesGlob('src/api/', 'src/api/client.ts')).toBe(true);
    expect(matchesGlob('src/api/', 'src/api/nested/deep.ts')).toBe(true);
    expect(matchesGlob('src/api/', 'src/apiary.ts')).toBe(false);
  });

  it('normalises Windows separators and leading ./', () => {
    expect(matchesGlob('src/**', 'src\\a\\b.ts')).toBe(true);
    expect(matchesGlob('src/**', './src/a.ts')).toBe(true);
  });

  it('does not let a wildcard escape into a sibling directory', () => {
    expect(matchesGlob('src/api/*', 'src/api-v2/client.ts')).toBe(false);
  });

  it('records negation without applying it', () => {
    const matcher = compileGlob('!src/theme/**');
    expect(matcher.negated).toBe(true);
    expect(matcher.test('src/theme/a.ts')).toBe(true);
  });

  it('escapes regex metacharacters in literal segments', () => {
    expect(matchesGlob('src/a+b.ts', 'src/a+b.ts')).toBe(true);
    expect(matchesGlob('src/a+b.ts', 'src/aab.ts')).toBe(false);
    expect(matchesGlob('src/a.b.ts', 'src/axb.ts')).toBe(false);
  });

  it('scores more literal patterns as more specific', () => {
    const broad = compileGlob('src/**');
    const narrow = compileGlob('src/api/payments/**');
    expect(narrow.specificity).toBeGreaterThan(broad.specificity);
  });

  it('matchesAny reports whether any pattern matches', () => {
    expect(matchesAny(['src/**', 'lib/**'], 'lib/x.ts')).toBe(true);
    expect(matchesAny(['src/**', 'lib/**'], 'app/x.ts')).toBe(false);
  });
});
