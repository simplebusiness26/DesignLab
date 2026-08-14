/**
 * Process execution.
 *
 * All external commands (git, npm, gradle, claude) funnel through here so
 * that timeouts, output capture, truncation and error shape are uniform, and
 * so tests can observe every command DesignLab runs.
 */

import { spawn } from 'node:child_process';

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Milliseconds before the child is killed. Default 10 minutes. */
  timeoutMs?: number;
  /** Text piped to the child's stdin. */
  input?: string;
  /** Maximum characters retained per stream. Older output is dropped. */
  maxBuffer?: number;
  /** Called with each stdout chunk as it arrives. */
  onStdout?: (chunk: string) => void;
  /** Called with each stderr chunk as it arrives. */
  onStderr?: (chunk: string) => void;
  signal?: AbortSignal;
}

export interface ExecResult {
  command: string;
  args: readonly string[];
  cwd: string;
  exitCode: number;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  /** True when the process exited 0 and was not killed. */
  ok: boolean;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_MAX_BUFFER = 2_000_000;

/**
 * Runs a command without a shell. Never throws for a non-zero exit — callers
 * inspect `ok`/`exitCode`, which keeps "the command failed" distinct from
 * "DesignLab crashed".
 */
export function execCommand(
  command: string,
  args: readonly string[] = [],
  options: ExecOptions = {},
): Promise<ExecResult> {
  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER;
  const startedAt = Date.now();

  return new Promise<ExecResult>((resolve, reject) => {
    let child;
    try {
      child = spawn(command, [...args], {
        cwd,
        env: options.env ?? process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timer = timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, timeoutMs)
      : undefined;

    const onAbort = (): void => {
      timedOut = true;
      child.kill('SIGKILL');
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      stdout = appendBounded(stdout, chunk, maxBuffer);
      options.onStdout?.(chunk);
    });
    child.stderr.on('data', (chunk: string) => {
      stderr = appendBounded(stderr, chunk, maxBuffer);
      options.onStderr?.(chunk);
    });

    const finish = (exitCode: number, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      resolve({
        command,
        args: [...args],
        cwd,
        exitCode,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
        ok: exitCode === 0 && !timedOut,
      });
    };

    child.on('error', (error: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      reject(error);
    });

    child.on('close', (code, signal) => finish(code ?? (signal ? 137 : 1), signal));

    if (options.input !== undefined) child.stdin.end(options.input);
    else child.stdin.end();
  });
}

function appendBounded(current: string, chunk: string, maxBuffer: number): string {
  const next = current + chunk;
  return next.length <= maxBuffer ? next : next.slice(next.length - maxBuffer);
}

/**
 * Splits a configured command string (e.g. `"npm run typecheck"`) into an
 * argv array. Handles quoted segments; it deliberately does not support shell
 * operators, because DesignLab never runs commands through a shell.
 */
export function parseCommandLine(commandLine: string): { command: string; args: string[] } | null {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let hasCurrent = false;

  for (const char of commandLine.trim()) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      hasCurrent = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (hasCurrent) {
        tokens.push(current);
        current = '';
        hasCurrent = false;
      }
      continue;
    }
    current += char;
    hasCurrent = true;
  }
  if (hasCurrent) tokens.push(current);
  if (tokens.length === 0) return null;

  const [command, ...args] = tokens;
  if (!command) return null;
  return { command, args };
}

/** Compact rendering of a command for logs and persisted gate records. */
export function formatCommand(command: string, args: readonly string[]): string {
  return [command, ...args].map((part) => (/\s/.test(part) ? JSON.stringify(part) : part)).join(' ');
}

/**
 * Extracts the most useful tail of failing output. Gate records store this
 * rather than megabytes of build noise.
 */
export function summariseFailure(result: ExecResult, maxChars = 4000): string {
  const combined = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join('\n');
  if (!combined) {
    return result.timedOut
      ? `Timed out after ${result.durationMs}ms with no output.`
      : `Exited with code ${result.exitCode} and produced no output.`;
  }
  if (combined.length <= maxChars) return combined;
  return `…(truncated ${combined.length - maxChars} chars)…\n${combined.slice(combined.length - maxChars)}`;
}
