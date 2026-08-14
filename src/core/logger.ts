/**
 * Structured logger.
 *
 * Human mode renders compact, colourised lines for terminal use. JSON mode
 * emits one JSON object per line so orchestration runs can be replayed and
 * analysed after the fact. All log records go to stderr, leaving stdout free
 * for machine-readable command output.
 */

import { describeError } from './errors.js';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export type LogFields = Record<string, unknown>;

export interface LoggerOptions {
  level?: LogLevel;
  format?: 'human' | 'json';
  /** Bound context merged into every record emitted by this logger. */
  context?: LogFields;
  /** Sink override, primarily for tests. */
  sink?: (line: string) => void;
  colour?: boolean;
}

const ANSI = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  cyan: '\u001b[36m',
  green: '\u001b[32m',
  magenta: '\u001b[35m',
} as const;

const LEVEL_STYLE: Record<Exclude<LogLevel, 'silent'>, { label: string; colour: string }> = {
  debug: { label: 'debug', colour: ANSI.dim },
  info: { label: 'info ', colour: ANSI.blue },
  warn: { label: 'warn ', colour: ANSI.yellow },
  error: { label: 'error', colour: ANSI.red },
};

/**
 * Keys whose values are never rendered, even if a caller passes them by
 * mistake. Cheap insurance against leaking credentials into logs or state.
 */
const REDACTED_KEYS = new Set([
  'token',
  'githubtoken',
  'github_token',
  'apikey',
  'api_key',
  'anthropic_api_key',
  'password',
  'secret',
  'authorization',
  'auth',
  'credentials',
  'privatekey',
  'private_key',
]);

export function redactFields(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (REDACTED_KEYS.has(key.toLowerCase().replace(/[-\s]/g, ''))) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? redactFields(value as LogFields)
      : value;
  }
  return out;
}

export class Logger {
  private readonly level: LogLevel;
  private readonly format: 'human' | 'json';
  private readonly context: LogFields;
  private readonly sink: (line: string) => void;
  private readonly colour: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.format = options.format ?? 'human';
    this.context = options.context ?? {};
    this.sink = options.sink ?? ((line) => process.stderr.write(`${line}\n`));
    this.colour = options.colour ?? (!process.env['DESIGNLAB_NO_COLOR'] && process.stderr.isTTY === true);
  }

  /** Returns a logger that stamps additional context onto every record. */
  child(context: LogFields): Logger {
    return new Logger({
      level: this.level,
      format: this.format,
      context: { ...this.context, ...context },
      sink: this.sink,
      colour: this.colour,
    });
  }

  isEnabled(level: LogLevel): boolean {
    return LEVEL_RANK[level] >= LEVEL_RANK[this.level];
  }

  debug(message: string, fields: LogFields = {}): void {
    this.emit('debug', message, fields);
  }

  info(message: string, fields: LogFields = {}): void {
    this.emit('info', message, fields);
  }

  warn(message: string, fields: LogFields = {}): void {
    this.emit('warn', message, fields);
  }

  error(message: string, fields: LogFields = {}): void {
    this.emit('error', message, fields);
  }

  /** Convenience wrapper that flattens an unknown throwable into fields. */
  errorFrom(message: string, error: unknown, fields: LogFields = {}): void {
    this.emit('error', message, { ...fields, error: describeError(error) });
  }

  private emit(level: Exclude<LogLevel, 'silent'>, message: string, fields: LogFields): void {
    if (!this.isEnabled(level)) return;
    const merged = redactFields({ ...this.context, ...fields });

    if (this.format === 'json') {
      this.sink(JSON.stringify({ ts: new Date().toISOString(), level, message, ...merged }));
      return;
    }

    const style = LEVEL_STYLE[level];
    const prefix = this.colour ? `${style.colour}${style.label}${ANSI.reset}` : style.label;
    const scope = typeof merged['scope'] === 'string' ? merged['scope'] : undefined;
    const scopeText = scope ? (this.colour ? ` ${ANSI.cyan}${scope}${ANSI.reset}` : ` ${scope}`) : '';

    const rest = Object.entries(merged)
      .filter(([key]) => key !== 'scope')
      .map(([key, value]) => `${key}=${formatValue(value)}`)
      .join(' ');
    const restText = rest ? (this.colour ? ` ${ANSI.dim}${rest}${ANSI.reset}` : ` ${rest}`) : '';

    this.sink(`${prefix}${scopeText} ${message}${restText}`);
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'string') return /\s/.test(value) ? JSON.stringify(value) : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value) ?? '[unserialisable]';
  } catch {
    // A value with a cyclic reference or a throwing toJSON: name it rather
    // than risk '[object Object]' in a log line.
    return '[unserialisable]';
  }
}

/** Silent logger for tests and library use. */
export const nullLogger = new Logger({ level: 'silent', sink: () => {} });

export function resolveLogLevel(input: string | undefined, fallback: LogLevel = 'info'): LogLevel {
  if (!input) return fallback;
  const normalised = input.toLowerCase();
  return (LOG_LEVELS as readonly string[]).includes(normalised) ? (normalised as LogLevel) : fallback;
}
