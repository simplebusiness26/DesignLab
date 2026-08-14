/**
 * Deterministic behavioural-invariant guards.
 *
 * The path-based contract answers "may this file change?". These guards
 * answer a sharper question for a handful of files where the *content* of the
 * change matters: the dependency graph, the app's identity, and its declared
 * permissions. All three are places where a plausible-looking edit changes
 * what the app *is* rather than how it looks, and all three are cheap to
 * check by comparing the file at the base and head commits.
 *
 * These guards fire even when a path rule was waived by an approved
 * exception: an exception saying "the design may add a font dependency to
 * package.json" must not silently authorise *removing* the payments SDK.
 *
 * Each check runs only when its file actually changed, so the cost on a
 * typical design diff is zero.
 */

import type { ChangedFile, GitClient } from '../git/git-client.js';
import type { ProtectionViolation } from '../core/schemas.js';

export interface InvariantCheckOptions {
  git: GitClient;
  baseSha: string;
  headSha: string;
  cwd?: string;
  changes: readonly ChangedFile[];
}

export async function runInvariantChecks(options: InvariantCheckOptions): Promise<ProtectionViolation[]> {
  const changedPaths = new Set(options.changes.map((change) => change.path));
  const violations: ProtectionViolation[] = [];

  if (changedPaths.has('package.json')) {
    violations.push(...(await checkNodeDependencies(options)));
  }
  if (changedPaths.has('pubspec.yaml')) {
    violations.push(...(await checkPubspecDependencies(options)));
  }
  if (changedPaths.has('app.json')) {
    violations.push(...(await checkExpoAppConfig(options)));
  }
  for (const gradlePath of ['android/app/build.gradle', 'android/app/build.gradle.kts']) {
    if (changedPaths.has(gradlePath)) {
      violations.push(...(await checkGradleIdentity(options, gradlePath)));
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

async function checkNodeDependencies(options: InvariantCheckOptions): Promise<ProtectionViolation[]> {
  const base = await readJsonAt(options, options.baseSha, 'package.json');
  const head = await readJsonAt(options, options.headSha, 'package.json');
  if (!base || !head) return [];

  const violations: ProtectionViolation[] = [];
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const baseDeps = asRecord(base[section]);
    const headDeps = asRecord(head[section]);
    for (const name of Object.keys(baseDeps)) {
      if (!(name in headDeps)) {
        violations.push(
          violation(
            'package.json',
            'invariant:dependency-removed',
            `The design removed the dependency "${name}" from ${section}. A redesign may add presentation ` +
              'dependencies; it must never remove existing ones — removal changes what the app can do.',
          ),
        );
      }
    }
  }
  return violations;
}

async function checkPubspecDependencies(options: InvariantCheckOptions): Promise<ProtectionViolation[]> {
  const base = await showAt(options, options.baseSha, 'pubspec.yaml');
  const head = await showAt(options, options.headSha, 'pubspec.yaml');
  if (base === null || head === null) return [];

  const violations: ProtectionViolation[] = [];
  for (const name of pubspecDependencyNames(base)) {
    if (!pubspecDependencyNames(head).has(name)) {
      violations.push(
        violation(
          'pubspec.yaml',
          'invariant:dependency-removed',
          `The design removed the dependency "${name}" from pubspec.yaml.`,
        ),
      );
    }
  }
  return violations;
}

/** Top-level entries under `dependencies:` / `dev_dependencies:`. */
function pubspecDependencyNames(pubspec: string): Set<string> {
  const names = new Set<string>();
  let inSection = false;
  for (const line of pubspec.split('\n')) {
    if (/^(dependencies|dev_dependencies):\s*$/.test(line)) {
      inSection = true;
      continue;
    }
    if (/^\S/.test(line)) inSection = false;
    if (!inSection) continue;
    const match = /^ {2}([a-zA-Z0-9_]+)\s*:/.exec(line);
    if (match?.[1] && match[1] !== 'flutter') names.add(match[1]);
  }
  return names;
}

// ---------------------------------------------------------------------------
// App identity and permissions
// ---------------------------------------------------------------------------

async function checkExpoAppConfig(options: InvariantCheckOptions): Promise<ProtectionViolation[]> {
  const base = await readJsonAt(options, options.baseSha, 'app.json');
  const head = await readJsonAt(options, options.headSha, 'app.json');
  if (!base || !head) return [];

  const baseExpo = asRecord(base['expo']);
  const headExpo = asRecord(head['expo']);
  const baseAndroid = asRecord(baseExpo['android']);
  const headAndroid = asRecord(headExpo['android']);
  const violations: ProtectionViolation[] = [];

  if (baseAndroid['package'] !== headAndroid['package']) {
    violations.push(
      violation(
        'app.json',
        'invariant:app-identity',
        `The design changed the Android package from "${String(baseAndroid['package'])}" to ` +
          `"${String(headAndroid['package'])}". App identity is never a design decision; side-by-side install ` +
          'identities are applied by DesignLab itself as a marked, removable overlay.',
      ),
    );
  }

  if (baseExpo['name'] !== headExpo['name']) {
    violations.push(
      violation(
        'app.json',
        'invariant:app-identity',
        `The design renamed the app from "${String(baseExpo['name'])}" to "${String(headExpo['name'])}". ` +
          'The product name is identity, not presentation.',
      ),
    );
  }

  const basePermissions = JSON.stringify(baseAndroid['permissions'] ?? null);
  const headPermissions = JSON.stringify(headAndroid['permissions'] ?? null);
  if (basePermissions !== headPermissions) {
    violations.push(
      violation(
        'app.json',
        'invariant:permissions',
        'The design changed the declared Android permissions. Permissions govern what the app may do on the ' +
          'device and are frozen along with functionality.',
      ),
    );
  }

  return violations;
}

async function checkGradleIdentity(
  options: InvariantCheckOptions,
  gradlePath: string,
): Promise<ProtectionViolation[]> {
  const base = await showAt(options, options.baseSha, gradlePath);
  const head = await showAt(options, options.headSha, gradlePath);
  if (base === null || head === null) return [];

  const baseId = /applicationId\s*=?\s*["']([\w.]+)["']/.exec(base)?.[1] ?? null;
  const headId = /applicationId\s*=?\s*["']([\w.]+)["']/.exec(head)?.[1] ?? null;

  if (baseId !== headId) {
    return [
      violation(
        gradlePath,
        'invariant:app-identity',
        `The design changed the applicationId from "${String(baseId)}" to "${String(headId)}". ` +
          'App identity is never a design decision.',
      ),
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function violation(path: string, rule: string, reason: string): ProtectionViolation {
  return {
    path,
    level: 'PROTECTED',
    rule,
    reason,
    changeType: 'modified',
    additions: 0,
    deletions: 0,
  };
}

async function showAt(options: InvariantCheckOptions, ref: string, path: string): Promise<string | null> {
  return options.git.showFile(ref, path, options.cwd);
}

async function readJsonAt(
  options: InvariantCheckOptions,
  ref: string,
  path: string,
): Promise<Record<string, unknown> | null> {
  const raw = await showAt(options, ref, path);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
