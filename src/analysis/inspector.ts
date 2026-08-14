/**
 * Repository inspector.
 *
 * Produces the App Manifest: the reusable, machine-readable description of the
 * target application that every later stage depends on.
 *
 * Two design decisions matter here:
 *
 *  1. **Deterministic first.** Framework, commands, capabilities and structure
 *     are derived from files, not from a model. The AI pass only *enriches*
 *     fields that genuinely need judgment, and can never contradict a
 *     deterministic finding about build commands or protected surfaces.
 *
 *  2. **Cached by commit SHA.** Re-inspecting an unchanged repository is pure
 *     waste, so a manifest is keyed by the exact commit it describes and
 *     reused until that commit changes.
 */

import { join } from 'node:path';

import { readTextBounded, walkFiles } from '../core/fsx.js';
import type { Logger } from '../core/logger.js';
import { nullLogger } from '../core/logger.js';
import { slugify } from '../core/ids.js';
import {
  manifestEnrichmentSchema,
  type AppManifest,
  type Screen,
} from '../core/schemas.js';
import type { AgentRunner } from '../agents/types.js';
import { LEAD_SYSTEM_PROMPT } from '../agents/prompts.js';
import {
  detectAndroid,
  detectCapabilities,
  detectCi,
  detectCommands,
  detectFramework,
  detectLanguages,
  detectNavigation,
  detectPackageManager,
  detectSourceRoots,
  detectStateManagement,
  detectStylingApproach,
  detectTestingSetup,
  detectThemePaths,
  readPackageJson,
  type RepoSnapshot,
} from './detectors.js';
import { discoverApis, discoverBackends, discoverComponents, discoverNativeModules, discoverScreens } from './structure.js';

/**
 * Files whose contents inform detection. Reading every file in a large repo is
 * both slow and unnecessary — these patterns cover configuration, theming,
 * navigation and enough source to classify structure.
 */
const CONTENT_PATTERNS: readonly RegExp[] = [
  /^package\.json$/,
  /^pubspec\.yaml$/,
  /^app\.(json|config\.[jt]s)$/,
  /^eas\.json$/,
  /^tsconfig\.json$/,
  /^(babel|metro|jest|vitest|tailwind)\.config\.[jt]s$/,
  /^\.github\/workflows\/.*\.ya?ml$/,
  /(^|\/)AndroidManifest\.xml$/,
  /(^|\/)(build|settings)\.gradle(\.kts)?$/,
  /(^|\/)(theme|themes|design-system|tokens|colou?rs|typography|palette|styles?)(\/|\.)/i,
  /(^|\/)(navigation|navigators?|routes?|router)\//i,
  /(^|\/)_layout\.[jt]sx?$/,
  /(^|\/)(screens?|pages?|views?)\//i,
  /(^|\/)(components?|ui|widgets?)\//i,
  /(^|\/)(api|services?|network|graphql)\//i,
  /(^|\/)(auth|authentication|login|session)\//i,
  /(^|\/)(migrations?|schema)\//i,
  /^(src|app|lib)\/[^/]*\.(ts|tsx|js|jsx|dart|kt)$/,
];

const MAX_CONTENT_FILES = 900;
const MAX_CONTENT_BYTES = 128 * 1024;

export interface InspectOptions {
  repoDir: string;
  projectId: string;
  repoUrl: string;
  branch: string;
  sha: string;
  logger?: Logger;
  /** When provided, an enrichment pass runs after deterministic analysis. */
  runner?: AgentRunner | null;
  aiEnrichment?: boolean;
  maxFiles?: number;
  leadTimeoutMs?: number;
}

export interface InspectResult {
  manifest: AppManifest;
  analysisMarkdown: string;
  /** True when the AI enrichment pass ran and returned usable output. */
  enriched: boolean;
  enrichmentError: string | null;
}

/** Builds a bounded snapshot of the repository for the detectors to read. */
export async function buildSnapshot(
  repoDir: string,
  options: { maxFiles?: number } = {},
): Promise<{ snapshot: RepoSnapshot; truncated: boolean }> {
  const { files, truncated } = await walkFiles(repoDir, { maxFiles: options.maxFiles ?? 20_000 });

  const interesting = files.filter((file) => CONTENT_PATTERNS.some((pattern) => pattern.test(file)));
  const contents = new Map<string, string>();

  for (const file of interesting.slice(0, MAX_CONTENT_FILES)) {
    const body = await readTextBounded(join(repoDir, file), MAX_CONTENT_BYTES);
    if (body !== null) contents.set(file, body);
  }

  return { snapshot: { files, contents }, truncated };
}

export async function inspectRepository(options: InspectOptions): Promise<InspectResult> {
  const logger = (options.logger ?? nullLogger).child({ scope: 'inspect' });

  const { snapshot, truncated } = await buildSnapshot(options.repoDir, {
    ...(options.maxFiles !== undefined ? { maxFiles: options.maxFiles } : {}),
  });
  logger.info('repository scanned', { files: snapshot.files.length, read: snapshot.contents.size, truncated });

  const { framework, version, evidence: frameworkEvidence } = detectFramework(snapshot);
  const packageManager = detectPackageManager(snapshot, framework);
  const android = detectAndroid(snapshot, framework);
  const commands = detectCommands(snapshot, framework, packageManager, android.buildSystem);
  const capabilities = detectCapabilities(snapshot, android.permissions);
  const navigation = detectNavigation(snapshot);
  const testing = detectTestingSetup(snapshot);
  const ci = detectCi(snapshot);
  const screens = discoverScreens(snapshot, framework);
  const components = discoverComponents(snapshot);
  const themePaths = detectThemePaths(snapshot);
  const pkg = readPackageJson(snapshot);

  const appName = deriveAppName(snapshot, options.repoUrl);

  let manifest: AppManifest = {
    schemaVersion: 1,
    projectId: options.projectId,
    repoUrl: options.repoUrl,
    branch: options.branch,
    sha: options.sha,
    generatedAt: new Date().toISOString(),
    appName,
    appSlug: slugify(appName),
    framework,
    frameworkVersion: version,
    languages: detectLanguages(snapshot),
    packageManager,
    androidBuildSystem: android.buildSystem,
    androidPackageId: android.packageId,
    minSdkVersion: android.minSdkVersion,
    sourceRoots: detectSourceRoots(snapshot),
    screens,
    navigation,
    components,
    designSystem: {
      present: themePaths.length > 0,
      themePaths,
      tokens: [],
      stylingApproach: detectStylingApproach(snapshot),
    },
    stateManagement: detectStateManagement(snapshot),
    capabilities,
    permissions: android.permissions,
    nativeModules: discoverNativeModules(snapshot),
    apis: discoverApis(snapshot),
    backends: discoverBackends(snapshot),
    testing,
    commands,
    ci,
    fileCount: snapshot.files.length,
    truncated,
    analysisMode: 'deterministic',
    notes: [...frameworkEvidence, ...android.evidence],
  };

  let enriched = false;
  let enrichmentError: string | null = null;

  if (options.aiEnrichment && options.runner) {
    const outcome = await enrichManifest(manifest, options.runner, {
      repoDir: options.repoDir,
      projectId: options.projectId,
      ...(options.leadTimeoutMs !== undefined ? { timeoutMs: options.leadTimeoutMs } : {}),
      logger,
    });
    if (outcome.manifest) {
      manifest = outcome.manifest;
      enriched = true;
    } else {
      enrichmentError = outcome.error;
      logger.warn('manifest enrichment skipped', { reason: outcome.error });
    }
  }

  return {
    manifest,
    analysisMarkdown: renderAnalysis(manifest, { packageJsonName: pkg?.name ?? null }),
    enriched,
    enrichmentError,
  };
}

// ---------------------------------------------------------------------------
// AI enrichment
// ---------------------------------------------------------------------------

async function enrichManifest(
  manifest: AppManifest,
  runner: AgentRunner,
  options: { repoDir: string; projectId: string; timeoutMs?: number; logger: Logger },
): Promise<{ manifest: AppManifest | null; error: string | null }> {
  const prompt = [
    'You are analysing an existing mobile application so that a redesign system can plan UI experiments.',
    'A deterministic scan has already established the facts below. Do not contradict them.',
    '',
    'Deterministic findings:',
    `- Framework: ${manifest.framework}${manifest.frameworkVersion ? ` ${manifest.frameworkVersion}` : ''}`,
    `- Package manager: ${manifest.packageManager}`,
    `- Android build: ${manifest.androidBuildSystem}`,
    `- Styling: ${manifest.designSystem.stylingApproach}`,
    `- Navigation library: ${manifest.navigation.library ?? 'unknown'}`,
    `- Detected screens (${manifest.screens.length}): ${manifest.screens.slice(0, 30).map((screen) => screen.name).join(', ') || 'none'}`,
    `- Capabilities detected: ${manifest.capabilities.filter((capability) => capability.present).map((capability) => capability.key).join(', ') || 'none'}`,
    '',
    'Read the repository in your working directory and answer only what genuinely requires judgment:',
    '1. A better human-facing app name, if the detected one is wrong.',
    '2. The real navigation pattern as a user experiences it.',
    '3. Which state-management approach the code actually uses.',
    '4. Any capability the deterministic scan missed or got wrong, with a short reason.',
    '5. Up to five notes a designer would need before redesigning this app.',
    '',
    'Be concise. Omit any field you cannot improve on.',
  ].join('\n');

  const response = await runner.run({
    role: 'lead',
    operation: 'enrich-manifest',
    prompt,
    systemPrompt: LEAD_SYSTEM_PROMPT,
    cwd: options.repoDir,
    outputSchema: manifestEnrichmentSchema,
    toolPolicy: { allowed: ['Read', 'Glob', 'Grep'], denied: ['Edit', 'Write', 'Bash', 'NotebookEdit'] },
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ledger: { projectId: options.projectId, round: null, slot: null },
  });

  if (!response.ok || !response.data) {
    return { manifest: null, error: response.error ?? 'enrichment returned no data' };
  }

  const parsed = manifestEnrichmentSchema.safeParse(response.data);
  if (!parsed.success) return { manifest: null, error: 'enrichment output failed validation' };

  return { manifest: mergeEnrichment(manifest, parsed.data), error: null };
}

/**
 * Merges enrichment into the manifest. The deterministic values for build
 * commands, framework and CI are never overwritten — those are facts, and a
 * model guessing at them would break real builds.
 */
export function mergeEnrichment(
  manifest: AppManifest,
  enrichment: {
    appName?: string;
    screens?: Screen[];
    navigationPattern?: string;
    stateManagement?: string[];
    capabilities?: Array<{ key: string; present: boolean; notes: string }>;
    designSystemSummary?: string;
    notes?: string[];
  },
): AppManifest {
  const next: AppManifest = { ...manifest, analysisMode: 'ai-enriched' };

  if (enrichment.appName?.trim()) {
    next.appName = enrichment.appName.trim();
    next.appSlug = slugify(next.appName);
  }

  if (enrichment.screens && enrichment.screens.length > 0) {
    // Union by path: the model may name screens better, but it must not make
    // detected screens disappear.
    const byPath = new Map(manifest.screens.map((screen) => [screen.path, screen]));
    for (const screen of enrichment.screens) {
      const existing = byPath.get(screen.path);
      byPath.set(screen.path, existing ? { ...existing, ...screen } : screen);
    }
    next.screens = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  if (enrichment.navigationPattern?.trim()) {
    next.navigation = { ...manifest.navigation, pattern: enrichment.navigationPattern.trim() };
  }

  if (enrichment.stateManagement && enrichment.stateManagement.length > 0) {
    next.stateManagement = [...new Set([...manifest.stateManagement, ...enrichment.stateManagement])].sort();
  }

  if (enrichment.capabilities && enrichment.capabilities.length > 0) {
    const byKey = new Map(manifest.capabilities.map((capability) => [capability.key, capability]));
    for (const capability of enrichment.capabilities) {
      const existing = byKey.get(capability.key);
      if (existing) {
        // A model may add a capability the scan missed, but may not silently
        // remove one that has file-level evidence behind it.
        byKey.set(capability.key, {
          ...existing,
          present: existing.evidence.length > 0 ? existing.present : capability.present,
          notes: capability.notes || existing.notes,
        });
      } else {
        byKey.set(capability.key, {
          key: capability.key,
          present: capability.present,
          evidence: ['reported by analysis agent'],
          paths: [],
          notes: capability.notes,
        });
      }
    }
    next.capabilities = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  if (enrichment.designSystemSummary?.trim()) {
    next.designSystem = {
      ...manifest.designSystem,
      stylingApproach: `${manifest.designSystem.stylingApproach} — ${enrichment.designSystemSummary.trim()}`,
    };
  }

  if (enrichment.notes && enrichment.notes.length > 0) {
    next.notes = [...manifest.notes, ...enrichment.notes];
  }

  return next;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function deriveAppName(snapshot: RepoSnapshot, repoUrl: string): string {
  const pkg = readPackageJson(snapshot);

  const appJson = snapshot.contents.get('app.json');
  if (appJson) {
    try {
      const parsed = JSON.parse(appJson) as { expo?: { name?: string }; name?: string };
      const name = parsed.expo?.name ?? parsed.name;
      if (name) return name;
    } catch {
      // fall through
    }
  }

  const pubspec = snapshot.contents.get('pubspec.yaml');
  if (pubspec) {
    const match = /^name:\s*(\S+)/m.exec(pubspec);
    if (match?.[1]) return match[1];
  }

  const strings = snapshot.files.find((file) => file.endsWith('res/values/strings.xml'));
  if (strings) {
    const body = snapshot.contents.get(strings) ?? '';
    const match = /<string name="app_name">([^<]+)<\/string>/.exec(body);
    if (match?.[1]) return match[1].trim();
  }

  if (pkg?.name) return pkg.name;

  const fromUrl = repoUrl.replace(/\.git$/, '').split('/').filter(Boolean).at(-1);
  return fromUrl ?? 'app';
}

/** Concise human-readable analysis, saved alongside the machine manifest. */
export function renderAnalysis(manifest: AppManifest, extra: { packageJsonName: string | null }): string {
  const present = manifest.capabilities.filter((capability) => capability.present);
  const absent = manifest.capabilities.filter((capability) => !capability.present);

  const lines: string[] = [
    `# ${manifest.appName} — DesignLab analysis`,
    '',
    `- **Repository:** ${manifest.repoUrl}`,
    `- **Branch / commit:** \`${manifest.branch}\` @ \`${manifest.sha.slice(0, 12)}\``,
    `- **Analysed:** ${manifest.generatedAt}`,
    `- **Mode:** ${manifest.analysisMode}`,
    `- **Files scanned:** ${manifest.fileCount}${manifest.truncated ? ' (truncated — analysis may be partial)' : ''}`,
    '',
    '## Technology',
    '',
    `| Aspect | Value |`,
    `| --- | --- |`,
    `| Framework | ${manifest.framework}${manifest.frameworkVersion ? ` (${manifest.frameworkVersion})` : ''} |`,
    `| Languages | ${manifest.languages.join(', ') || 'unknown'} |`,
    `| Package manager | ${manifest.packageManager} |`,
    `| Android build | ${manifest.androidBuildSystem} |`,
    `| Android package | ${manifest.androidPackageId ?? 'not detected'} |`,
    `| minSdk | ${manifest.minSdkVersion ?? 'not detected'} |`,
    `| Styling | ${manifest.designSystem.stylingApproach} |`,
    `| Navigation | ${manifest.navigation.library ?? 'unknown'} — ${manifest.navigation.pattern} |`,
    `| State management | ${manifest.stateManagement.join(', ') || 'unknown'} |`,
    `| Source roots | ${manifest.sourceRoots.join(', ') || 'repository root'} |`,
    '',
    '## Commands',
    '',
    '```',
    `install:      ${manifest.commands.install ?? '(none detected)'}`,
    `typecheck:    ${manifest.commands.typecheck ?? '(none detected)'}`,
    `lint:         ${manifest.commands.lint ?? '(none detected)'}`,
    `test:         ${manifest.commands.test ?? '(none detected)'}`,
    `build:        ${manifest.commands.build ?? '(none detected)'}`,
    `android build: ${manifest.commands.androidBuild ?? '(none detected)'}`,
    '```',
    '',
    '## Capabilities detected',
    '',
  ];

  if (present.length > 0) {
    for (const capability of present) {
      lines.push(`- **${capability.key}** — ${capability.evidence.slice(0, 3).join('; ')}`);
    }
  } else {
    lines.push('_None detected._');
  }

  if (absent.length > 0) {
    lines.push('', `Not detected: ${absent.map((capability) => capability.key).join(', ')}.`);
  }

  lines.push('', `## Screens (${manifest.screens.length})`, '');
  if (manifest.screens.length > 0) {
    lines.push('| Screen | Role | Path |', '| --- | --- | --- |');
    for (const screen of manifest.screens.slice(0, 40)) {
      lines.push(`| ${screen.name} | ${screen.role} | \`${screen.path}\` |`);
    }
    if (manifest.screens.length > 40) lines.push('', `…and ${manifest.screens.length - 40} more.`);
  } else {
    lines.push('_No screens identified. Design briefs will target the source roots instead._');
  }

  if (manifest.components.length > 0) {
    lines.push('', '## Most-reused components', '');
    for (const component of manifest.components.slice(0, 15)) {
      lines.push(`- \`${component.path}\` (${component.usageCount} references)`);
    }
  }

  if (manifest.designSystem.themePaths.length > 0) {
    lines.push('', '## Design system surface', '');
    for (const path of manifest.designSystem.themePaths.slice(0, 20)) lines.push(`- \`${path}\``);
  }

  lines.push(
    '',
    '## Testing and CI',
    '',
    `- Test frameworks: ${manifest.testing.frameworks.join(', ') || 'none detected'}`,
    `- Test files: ${manifest.testing.testPaths.length}`,
    `- GitHub Actions workflows: ${manifest.ci.workflowPaths.length}`,
    `- Existing Android build workflow: ${manifest.ci.androidWorkflowPath ?? 'none'}`,
  );

  if (manifest.permissions.length > 0) {
    lines.push('', '## Android permissions', '', ...manifest.permissions.map((permission) => `- \`${permission}\``));
  }

  if (manifest.apis.length > 0) {
    lines.push('', '## External hosts referenced', '', ...manifest.apis.slice(0, 15).map((host) => `- ${host}`));
  }

  if (manifest.notes.length > 0) {
    lines.push('', '## Notes', '', ...manifest.notes.map((note) => `- ${note}`));
  }

  if (extra.packageJsonName) {
    lines.push('', `_package.json name: \`${extra.packageJsonName}\`_`);
  }

  return `${lines.join('\n')}\n`;
}
