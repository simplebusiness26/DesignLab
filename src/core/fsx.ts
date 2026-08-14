/**
 * Filesystem helpers used by the state store and analysers.
 *
 * JSON writes are atomic (write to a temp file in the same directory, then
 * rename) because DesignLab persists round state while multiple builder
 * processes are running, and a half-written round file would be worse than
 * no round file.
 */

import { constants } from 'node:fs';
import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { DesignLabError } from './errors.js';

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeText(path: string, contents: string): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, contents, 'utf8');
}

export async function readJson<T = unknown>(path: string): Promise<T | null> {
  const raw = await readText(path);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new DesignLabError('STATE_CORRUPT', `Could not parse JSON at ${path}`, {
      cause: error,
      details: { path },
      hint: 'Delete or repair the file, then re-run the command that produced it.',
    });
  }
}

/** Atomic JSON write: temp file in the target directory, then rename. */
export async function writeJson(path: string, value: unknown): Promise<void> {
  const dir = dirname(path);
  await ensureDir(dir);
  const tmp = join(dir, `.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(tmp, path);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
}

/** Appends a single JSON line; used by the usage ledger. */
export async function appendJsonl(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(value)}\n`, { encoding: 'utf8', flag: 'a' });
}

export async function readJsonl<T = unknown>(path: string): Promise<T[]> {
  const raw = await readText(path);
  if (raw === null) return [];
  const out: T[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as T);
    } catch {
      // A truncated final line is expected if a process died mid-append.
    }
  }
  return out;
}

export async function listDirNames(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function removeDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

/**
 * Walks a directory tree, returning repository-relative POSIX paths.
 * Bounded by `maxFiles` and `maxDepth` so that inspecting a large target repo
 * cannot run away, and skips directories that never contain design-relevant
 * source.
 */
export interface WalkOptions {
  maxFiles?: number;
  maxDepth?: number;
  ignoreDirs?: ReadonlySet<string>;
}

export const DEFAULT_IGNORED_DIRS: ReadonlySet<string> = new Set([
  '.git',
  'node_modules',
  '.gradle',
  'build',
  'dist',
  'out',
  '.next',
  '.expo',
  '.dart_tool',
  'Pods',
  'DerivedData',
  '.idea',
  '.vscode',
  'coverage',
  '__pycache__',
  'vendor',
  '.venv',
  'venv',
  '.designlab',
]);

export interface WalkResult {
  files: string[];
  truncated: boolean;
}

export async function walkFiles(root: string, options: WalkOptions = {}): Promise<WalkResult> {
  const maxFiles = options.maxFiles ?? 20_000;
  const maxDepth = options.maxDepth ?? 12;
  const ignoreDirs = options.ignoreDirs ?? DEFAULT_IGNORED_DIRS;

  const files: string[] = [];
  let truncated = false;

  const visit = async (dir: string, relative: string, depth: number): Promise<void> => {
    if (truncated || depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (truncated) return;
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) continue;
        await visit(join(dir, entry.name), childRelative, depth + 1);
      } else if (entry.isFile()) {
        if (files.length >= maxFiles) {
          truncated = true;
          return;
        }
        files.push(childRelative);
      }
    }
  };

  await visit(root, '', 0);
  files.sort();
  return { files, truncated };
}

/** Reads a file only if it is smaller than `maxBytes`; avoids loading blobs. */
export async function readTextBounded(path: string, maxBytes = 256 * 1024): Promise<string | null> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > maxBytes) return null;
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}
