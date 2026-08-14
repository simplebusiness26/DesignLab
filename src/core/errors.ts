/**
 * DesignLab error taxonomy.
 *
 * Every failure that DesignLab can anticipate is represented by a
 * `DesignLabError` carrying a stable machine-readable `code`. The CLI maps
 * codes onto exit codes, and the orchestrator uses them to decide whether a
 * failure is retryable, escalatable, or terminal.
 */

export type ErrorCode =
  | 'CONFIG_INVALID'
  | 'CONFIG_MISSING'
  | 'STATE_CORRUPT'
  | 'GIT_FAILED'
  | 'GIT_UNSAFE'
  | 'WORKTREE_CONFLICT'
  | 'MANIFEST_MISSING'
  | 'CONTRACT_MISSING'
  | 'CONTRACT_VIOLATION'
  | 'AGENT_FAILED'
  | 'AGENT_UNAVAILABLE'
  | 'AGENT_OUTPUT_INVALID'
  | 'GATE_FAILED'
  | 'ROUND_NOT_FOUND'
  | 'CANDIDATE_NOT_FOUND'
  | 'BUILD_UNSUPPORTED'
  | 'NOT_IMPLEMENTED'
  | 'USAGE_LIMIT'
  | 'INTERNAL';

export interface DesignLabErrorOptions {
  /** Structured detail attached to logs and persisted failure records. */
  readonly details?: Record<string, unknown>;
  /** Underlying error, preserved for diagnostics. */
  readonly cause?: unknown;
  /** Operator-facing hint describing the shortest path to recovery. */
  readonly hint?: string;
  /** True when re-running the same operation could plausibly succeed. */
  readonly retryable?: boolean;
}

export class DesignLabError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown>;
  readonly hint: string | undefined;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, options: DesignLabErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'DesignLabError';
    this.code = code;
    this.details = options.details ?? {};
    this.hint = options.hint;
    this.retryable = options.retryable ?? false;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      hint: this.hint,
      retryable: this.retryable,
    };
  }
}

/** Exit codes are stable so CI and scripts can branch on them. */
export const EXIT_CODES: Readonly<Record<ErrorCode | 'OK' | 'UNKNOWN', number>> = Object.freeze({
  OK: 0,
  UNKNOWN: 1,
  CONFIG_INVALID: 2,
  CONFIG_MISSING: 2,
  STATE_CORRUPT: 3,
  GIT_FAILED: 4,
  GIT_UNSAFE: 4,
  WORKTREE_CONFLICT: 4,
  MANIFEST_MISSING: 5,
  CONTRACT_MISSING: 5,
  CONTRACT_VIOLATION: 6,
  AGENT_FAILED: 7,
  AGENT_UNAVAILABLE: 7,
  AGENT_OUTPUT_INVALID: 7,
  GATE_FAILED: 8,
  ROUND_NOT_FOUND: 9,
  CANDIDATE_NOT_FOUND: 9,
  BUILD_UNSUPPORTED: 10,
  NOT_IMPLEMENTED: 11,
  USAGE_LIMIT: 12,
  INTERNAL: 1,
});

export function exitCodeFor(error: unknown): number {
  if (error instanceof DesignLabError) return EXIT_CODES[error.code] ?? EXIT_CODES.UNKNOWN;
  return EXIT_CODES.UNKNOWN;
}

export function isDesignLabError(error: unknown): error is DesignLabError {
  return error instanceof DesignLabError;
}

/** Normalises anything thrown into a readable single-line message. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
