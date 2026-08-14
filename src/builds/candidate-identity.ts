/**
 * Temporary candidate app identity.
 *
 * Product requirement: install candidate A, B, C and D side by side on one
 * phone. Android will not install two APKs with the same applicationId, so
 * each candidate needs a suffixed id (`com.example.app.designlab.a`) and a
 * suffixed display name ("TrailMark A").
 *
 * Changing an applicationId is genuinely dangerous on real apps: Firebase
 * config files are bound to the id, OAuth redirect and SHA-1 registrations
 * reference it, restricted Maps keys allow only specific package names, and
 * verified app links stop verifying. Three rules keep this feature safe:
 *
 *  1. **Opt-in.** `build.candidateIdentity` defaults to `off`.
 *  2. **Risk-gated.** Before applying, the candidate worktree is scanned for
 *     known identity-bound integrations. If any are found, the overlay is
 *     refused (recorded, with reasons) unless `allowRiskyIdentity` is set.
 *  3. **Removable by construction.** The overlay is a single engine commit
 *     whose subject carries the `[designlab-identity]` marker, applied at the
 *     branch tip after all gates and review. `merge-check` refuses to call a
 *     branch merge-ready while marker commits are part of the merge content.
 *
 * The overlay never touches backend configuration, API code or anything the
 * contract protects — it edits exactly one identity surface per framework.
 */

import { join } from 'node:path';

import { pathExists, readTextBounded, readText, writeText } from '../core/fsx.js';
import type { GitClient } from '../git/git-client.js';
import type { WorktreeLease } from '../git/worktree-manager.js';
import type { AppManifest, CandidateIdentity } from '../core/schemas.js';
import type { CandidateSlot } from '../core/ids.js';

/** Commit-subject markers identifying removable engine commits. */
export const IDENTITY_COMMIT_MARKER = '[designlab-identity]';
export const PLUMBING_COMMIT_MARKER = '[designlab-plumbing]';
export const ENGINE_COMMIT_MARKERS = [IDENTITY_COMMIT_MARKER, PLUMBING_COMMIT_MARKER] as const;

/** In-file markers wrapping the gradle overlay block. */
export const GRADLE_MARKER_BEGIN = '// designlab-identity-begin';
export const GRADLE_MARKER_END = '// designlab-identity-end';

export interface IdentityPlan {
  mechanism: 'expo-app-json' | 'gradle-suffix' | 'unsupported';
  /** Suffix appended to the applicationId, e.g. ".designlab.a". */
  applicationIdSuffix: string;
  /** Display name shown under the launcher icon, e.g. "TrailMark A". */
  displayName: string;
  /** Repository-relative file the overlay edits. */
  file: string | null;
  /** Why the mechanism is unsupported, when it is. */
  reason: string;
}

export interface IdentityRisk {
  risky: boolean;
  reasons: string[];
}

/** Chooses the identity mechanism for the detected stack. */
export function planCandidateIdentity(manifest: AppManifest, slot: CandidateSlot): IdentityPlan {
  const suffix = `.designlab.${slot.toLowerCase()}`;
  const displayName = `${manifest.appName} ${slot}`;

  if (manifest.framework === 'expo') {
    return { mechanism: 'expo-app-json', applicationIdSuffix: suffix, displayName, file: 'app.json', reason: '' };
  }

  if (
    manifest.framework === 'react-native' ||
    manifest.framework === 'android-native' ||
    manifest.framework === 'flutter' ||
    manifest.framework === 'capacitor'
  ) {
    return {
      mechanism: 'gradle-suffix',
      applicationIdSuffix: suffix,
      displayName,
      file: 'android/app/build.gradle',
      reason: '',
    };
  }

  return {
    mechanism: 'unsupported',
    applicationIdSuffix: suffix,
    displayName,
    file: null,
    reason: `No safe identity mechanism is known for framework "${manifest.framework}".`,
  };
}

/**
 * Scans a candidate worktree for integrations that break when the
 * applicationId changes. Every marker is a file-level fact, not a guess.
 */
export async function assessIdentityRisk(worktreePath: string): Promise<IdentityRisk> {
  const reasons: string[] = [];

  for (const candidate of [
    'google-services.json',
    'android/app/google-services.json',
    'android/google-services.json',
  ]) {
    if (await pathExists(join(worktreePath, candidate))) {
      reasons.push(`${candidate} exists: Firebase configuration is bound to the applicationId.`);
      break;
    }
  }

  const appJson = await readTextBounded(join(worktreePath, 'app.json'));
  if (appJson) {
    try {
      const parsed = JSON.parse(appJson) as {
        expo?: {
          scheme?: unknown;
          android?: { intentFilters?: unknown; googleServicesFile?: unknown };
        };
      };
      if (parsed.expo?.scheme) {
        reasons.push('app.json declares a deep-link scheme; OAuth redirects and links may reference the app identity.');
      }
      if (parsed.expo?.android?.intentFilters) {
        reasons.push('app.json declares Android intent filters; app-link verification is identity-bound.');
      }
      if (parsed.expo?.android?.googleServicesFile) {
        reasons.push('app.json references a google-services file: Firebase configuration is identity-bound.');
      }
    } catch {
      reasons.push('app.json could not be parsed; identity risk cannot be assessed.');
    }
  }

  for (const manifestPath of [
    'android/app/src/main/AndroidManifest.xml',
    'app/src/main/AndroidManifest.xml',
  ]) {
    const body = await readTextBounded(join(worktreePath, manifestPath));
    if (!body) continue;
    if (/android:autoVerify\s*=\s*"true"/.test(body)) {
      reasons.push(`${manifestPath} uses verified app links (autoVerify); verification breaks under a new id.`);
    }
    if (/com\.google\.android\.geo\.API_KEY/.test(body)) {
      reasons.push(`${manifestPath} embeds a Google Maps key; restricted keys allow specific package names only.`);
    }
    break;
  }

  return { risky: reasons.length > 0, reasons };
}

export interface ApplyIdentityOptions {
  git: GitClient;
  lease: WorktreeLease;
  manifest: AppManifest;
  slot: CandidateSlot;
  allowRisky: boolean;
}

/**
 * Applies the identity overlay as a single marked commit at the branch tip.
 * Returns the recorded identity outcome — including an honest `applied: false`
 * with reasons when the overlay was refused or impossible.
 */
export async function applyCandidateIdentity(options: ApplyIdentityOptions): Promise<CandidateIdentity> {
  const plan = planCandidateIdentity(options.manifest, options.slot);

  if (plan.mechanism === 'unsupported' || !plan.file) {
    return { applied: false, applicationIdSuffix: null, displayName: null, commit: null, reason: plan.reason };
  }

  const risk = await assessIdentityRisk(options.lease.path);
  if (risk.risky && !options.allowRisky) {
    return {
      applied: false,
      applicationIdSuffix: null,
      displayName: null,
      commit: null,
      reason:
        `Identity overlay refused — identity-bound integrations detected: ${risk.reasons.join(' ')} ` +
        'Set build.allowRiskyIdentity to override, understanding those integrations will not work in candidate builds.',
    };
  }

  const filePath = join(options.lease.path, plan.file);
  const edited =
    plan.mechanism === 'expo-app-json'
      ? await editExpoAppJson(filePath, plan)
      : await editGradle(filePath, plan);

  if (!edited.ok) {
    return { applied: false, applicationIdSuffix: null, displayName: null, commit: null, reason: edited.reason };
  }

  const worktreeGit = options.git.withCwd(options.lease.path);
  await worktreeGit.stageAll();
  const commit = await worktreeGit.commit(
    `designlab: temporary candidate identity ${options.slot} ${IDENTITY_COMMIT_MARKER}\n\n` +
      `applicationId suffix: ${plan.applicationIdSuffix}\n` +
      `display name: ${plan.displayName}\n\n` +
      'This commit exists only so candidate APKs can be installed side by side.\n' +
      'It MUST be dropped before merging the winning design; `designlab merge-check` enforces that.' +
      (risk.risky ? `\n\nApplied despite detected risks:\n${risk.reasons.map((r) => `- ${r}`).join('\n')}` : ''),
  );

  if (!commit) {
    return {
      applied: false,
      applicationIdSuffix: null,
      displayName: null,
      commit: null,
      reason: 'The identity edit produced no change to commit.',
    };
  }

  return {
    applied: true,
    applicationIdSuffix: plan.applicationIdSuffix,
    displayName: plan.displayName,
    commit,
    reason: risk.risky ? `Applied with acknowledged risks: ${risk.reasons.join(' ')}` : '',
  };
}

async function editExpoAppJson(
  filePath: string,
  plan: IdentityPlan,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const raw = await readText(filePath);
  if (raw === null) return { ok: false, reason: 'app.json not found in the candidate worktree.' };

  let parsed: { expo?: { name?: string; android?: { package?: string } } };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return { ok: false, reason: 'app.json is not valid JSON.' };
  }

  if (!parsed.expo) return { ok: false, reason: 'app.json has no "expo" section.' };
  parsed.expo.name = plan.displayName;
  parsed.expo.android = parsed.expo.android ?? {};
  if (parsed.expo.android.package) {
    parsed.expo.android.package = `${parsed.expo.android.package}${plan.applicationIdSuffix}`;
  }

  await writeText(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
  return { ok: true };
}

async function editGradle(
  filePath: string,
  plan: IdentityPlan,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const raw = await readText(filePath);
  if (raw === null) return { ok: false, reason: `${filePath} not found in the candidate worktree.` };
  if (raw.includes(GRADLE_MARKER_BEGIN)) {
    return { ok: false, reason: 'An identity overlay block is already present.' };
  }

  // Appended as a self-contained block so removal is exactly one commit (or
  // one marker-delimited deletion). `applicationIdSuffix` is a supported
  // Gradle mechanism on build types; it composes with any applicationId the
  // project sets, unlike rewriting the id in place.
  const block = [
    '',
    `${GRADLE_MARKER_BEGIN} (temporary DesignLab candidate identity — must be removed before merge)`,
    'android {',
    '    buildTypes {',
    `        debug { applicationIdSuffix "${plan.applicationIdSuffix}" }`,
    `        release { applicationIdSuffix "${plan.applicationIdSuffix}" }`,
    '    }',
    '}',
    GRADLE_MARKER_END,
    '',
  ].join('\n');

  await writeText(filePath, raw + block);

  // Display name: edit strings.xml app_name when the conventional file exists.
  const stringsPath = filePath.replace(/build\.gradle(\.kts)?$/, 'src/main/res/values/strings.xml');
  const strings = await readText(stringsPath);
  if (strings && /<string name="app_name">[^<]*<\/string>/.test(strings)) {
    await writeText(
      stringsPath,
      strings.replace(
        /<string name="app_name">[^<]*<\/string>/,
        `<string name="app_name">${escapeXml(plan.displayName)}</string>`,
      ),
    );
  }

  return { ok: true };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;');
}

/** True when a commit subject marks a removable engine commit. */
export function isEngineCommitSubject(subject: string): boolean {
  return ENGINE_COMMIT_MARKERS.some((marker) => subject.includes(marker));
}
