/**
 * Identifier and slug helpers.
 *
 * Round, candidate and branch identifiers are user-facing, appear in Git
 * branch names and APK filenames, and are compared across runs — so they are
 * generated deterministically here rather than ad hoc at call sites.
 */

import { createHash } from 'node:crypto';

/** Candidate slots within a round, in dispatch order. */
export const CANDIDATE_SLOTS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export type CandidateSlot = (typeof CANDIDATE_SLOTS)[number];

export const MAX_DESIGNS_PER_ROUND = CANDIDATE_SLOTS.length;

export function slotForIndex(index: number): CandidateSlot {
  const slot = CANDIDATE_SLOTS[index];
  if (!slot) {
    throw new RangeError(`Candidate index ${index} exceeds the maximum of ${MAX_DESIGNS_PER_ROUND}`);
  }
  return slot;
}

export function isCandidateSlot(value: string): value is CandidateSlot {
  return (CANDIDATE_SLOTS as readonly string[]).includes(value.toUpperCase());
}

export function normaliseSlot(value: string): CandidateSlot {
  const upper = value.toUpperCase();
  if (!isCandidateSlot(upper)) {
    throw new RangeError(`"${value}" is not a candidate slot (expected one of ${CANDIDATE_SLOTS.join(', ')})`);
  }
  return upper;
}

/** Zero-padded round identifier, e.g. 1 -> "r001". */
export function roundId(roundNumber: number): string {
  if (!Number.isInteger(roundNumber) || roundNumber < 1) {
    throw new RangeError(`Round number must be a positive integer, received ${roundNumber}`);
  }
  return `r${String(roundNumber).padStart(3, '0')}`;
}

/** Parses "r001", "1", or "round-1" back into a round number. */
export function parseRoundRef(value: string): number | null {
  const match = /^(?:round[-_]?)?r?(\d{1,4})$/i.exec(value.trim());
  if (!match?.[1]) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

/**
 * Lowercase, hyphenated, ASCII-safe slug suitable for Git refs and filenames.
 * Git ref rules forbid leading/trailing dots and dashes, `..`, and a trailing
 * `.lock`, all of which this normalisation removes.
 */
export function slugify(input: string, maxLength = 32): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug || 'design';
}

/**
 * Design branch name, e.g. `design/r001-a-immersive`.
 * The prefix is configurable so DesignLab can coexist with existing branch
 * conventions in the target repository.
 */
export function designBranchName(options: {
  prefix?: string;
  round: number;
  slot: CandidateSlot;
  slug: string;
}): string {
  const prefix = (options.prefix ?? 'design').replace(/^\/+|\/+$/g, '');
  return `${prefix}/${roundId(options.round)}-${options.slot.toLowerCase()}-${slugify(options.slug)}`;
}

/** Worktree directory name; flat and filesystem-safe. */
export function worktreeDirName(round: number, slot: CandidateSlot, slug: string): string {
  return `${roundId(round)}-${slot.toLowerCase()}-${slugify(slug)}`;
}

/**
 * APK artifact name, e.g. `myapp-R001-A-immersive.apk`.
 * Kept ASCII and hyphenated so it survives GitHub artifact upload rules.
 */
export function apkArtifactName(options: {
  appSlug: string;
  round: number;
  slot: CandidateSlot;
  slug: string;
}): string {
  return `${slugify(options.appSlug)}-${roundId(options.round).toUpperCase()}-${options.slot}-${slugify(options.slug)}.apk`;
}

/**
 * Stable project identifier derived from the target repository URL. Uses
 * `owner-repo` for readability plus a short hash so that two forks with the
 * same name never collide.
 */
export function projectIdFromRepo(repoUrl: string): string {
  const normalised = normaliseRepoUrl(repoUrl);
  const hash = createHash('sha256').update(normalised).digest('hex').slice(0, 8);
  const parts = normalised.replace(/\.git$/, '').split('/').filter(Boolean);
  const repo = parts.at(-1) ?? 'repo';
  const owner = parts.at(-2) ?? 'local';
  return `${slugify(owner, 24)}-${slugify(repo, 24)}-${hash}`;
}

/**
 * Canonical repository form used for identity and caching, so that
 * `git@github.com:o/r.git` and `https://github.com/o/r` map to one project.
 */
export function normaliseRepoUrl(repoUrl: string): string {
  const trimmed = repoUrl.trim().replace(/\/+$/, '');
  const scpLike = /^(?:ssh:\/\/)?(?:[\w.-]+@)?([\w.-]+):(?!\/)(.+)$/.exec(trimmed);
  if (scpLike?.[1] && scpLike[2]) return `${scpLike[1].toLowerCase()}/${scpLike[2].replace(/\.git$/, '')}`;
  try {
    const url = new URL(trimmed);
    return `${url.host.toLowerCase()}${url.pathname.replace(/\.git$/, '')}`;
  } catch {
    return trimmed.replace(/\.git$/, '');
  }
}

/** Short display form of a commit SHA. */
export function shortSha(sha: string): string {
  return sha.slice(0, 8);
}

/** Content hash used for manifest and contract cache keys. */
export function contentHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}
