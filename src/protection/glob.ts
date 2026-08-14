/**
 * Minimal glob matcher for protection patterns.
 *
 * Protection rules decide whether a design is accepted or rejected, so the
 * matcher is implemented here rather than pulled from a dependency: the exact
 * semantics are part of DesignLab's security model and must be testable,
 * stable, and free of surprises from an upstream release.
 *
 * Supported syntax:
 *   *      any run of characters except "/"
 *   **     any run of characters including "/"
 *   ?      exactly one character except "/"
 *   {a,b}  alternation
 *   [abc]  character class (with [!abc] / [^abc] negation)
 *   !p     leading "!" marks a negated pattern (handled by the caller)
 *
 * A pattern ending in "/" or "/**" matches the directory and everything under
 * it. Matching is case-sensitive and always against repository-relative POSIX
 * paths.
 */

export interface GlobMatcher {
  readonly pattern: string;
  readonly negated: boolean;
  test(path: string): boolean;
  /** Rough specificity score; higher wins when rules conflict. */
  readonly specificity: number;
}

const CACHE = new Map<string, RegExp>();

export function compileGlob(pattern: string): GlobMatcher {
  const negated = pattern.startsWith('!');
  const body = negated ? pattern.slice(1) : pattern;
  const normalised = normalisePattern(body);

  let regex = CACHE.get(normalised);
  if (!regex) {
    regex = new RegExp(`^${globToRegexSource(normalised)}$`);
    CACHE.set(normalised, regex);
  }

  const compiled = regex;
  return {
    pattern,
    negated,
    specificity: scoreSpecificity(normalised),
    test: (path: string): boolean => compiled.test(normalisePath(path)),
  };
}

export function matchesGlob(pattern: string, path: string): boolean {
  return compileGlob(pattern).test(path);
}

/** True when `path` matches any pattern, ignoring negation semantics. */
export function matchesAny(patterns: readonly string[], path: string): boolean {
  return patterns.some((pattern) => compileGlob(pattern).test(path));
}

function normalisePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function normalisePattern(pattern: string): string {
  const trimmed = normalisePath(pattern.trim());
  // "src/api/" and "src/api" both mean "this directory and its contents".
  if (trimmed.endsWith('/')) return `${trimmed}**`;
  return trimmed;
}

function globToRegexSource(pattern: string): string {
  let source = '';
  let index = 0;

  while (index < pattern.length) {
    const char = pattern[index];

    if (char === '*') {
      const isDouble = pattern[index + 1] === '*';
      if (isDouble) {
        const nextIsSlash = pattern[index + 2] === '/';
        if (nextIsSlash) {
          // "a/**/b" should also match "a/b".
          source += '(?:.*/)?';
          index += 3;
        } else {
          source += '.*';
          index += 2;
        }
        continue;
      }
      source += '[^/]*';
      index += 1;
      continue;
    }

    if (char === '?') {
      source += '[^/]';
      index += 1;
      continue;
    }

    if (char === '[') {
      const close = pattern.indexOf(']', index + 1);
      if (close === -1) {
        source += '\\[';
        index += 1;
        continue;
      }
      let body = pattern.slice(index + 1, close);
      if (body.startsWith('!') || body.startsWith('^')) body = `^${body.slice(1)}`;
      source += `[${body.replace(/\\/g, '\\\\')}]`;
      index = close + 1;
      continue;
    }

    if (char === '{') {
      const close = findClosingBrace(pattern, index);
      if (close === -1) {
        source += '\\{';
        index += 1;
        continue;
      }
      const alternatives = splitAlternatives(pattern.slice(index + 1, close));
      source += `(?:${alternatives.map(globToRegexSource).join('|')})`;
      index = close + 1;
      continue;
    }

    source += char === undefined ? '' : escapeRegex(char);
    index += 1;
  }

  return source;
}

function findClosingBrace(pattern: string, start: number): number {
  let depth = 0;
  for (let index = start; index < pattern.length; index += 1) {
    if (pattern[index] === '{') depth += 1;
    else if (pattern[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitAlternatives(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of body) {
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

function escapeRegex(char: string): string {
  return /[.*+?^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
}

/**
 * Specificity heuristic used when two rules match the same path: literal path
 * segments count for more than wildcards, so `src/api/payments/**` beats
 * `src/**`.
 */
function scoreSpecificity(pattern: string): number {
  const segments = pattern.split('/');
  let score = segments.length * 10;
  for (const segment of segments) {
    if (segment === '**') score -= 8;
    else if (segment.includes('*')) score -= 3;
    else score += segment.length;
  }
  return score;
}
