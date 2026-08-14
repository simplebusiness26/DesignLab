/**
 * Integration tests for repository inspection, against real fixture apps.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildSnapshot, inspectRepository, mergeEnrichment } from '../../src/analysis/inspector.js';
import { detectCommands, detectFramework, detectPackageManager, detectAndroid } from '../../src/analysis/detectors.js';
import { discoverScreens, inferRole } from '../../src/analysis/structure.js';
import { MockAgentRunner } from '../../src/agents/mock-runner.js';
import {
  createFixtureRepo,
  FLUTTER_APP_FILES,
  RN_APP_FILES,
  type FixtureRepo,
} from '../helpers/fixture-repo.js';

describe('inspectRepository — React Native / Expo target', () => {
  let repo: FixtureRepo;

  beforeEach(async () => {
    repo = await createFixtureRepo(RN_APP_FILES);
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  async function inspect(): Promise<Awaited<ReturnType<typeof inspectRepository>>> {
    return inspectRepository({
      repoDir: repo.path,
      projectId: 'test-fieldnotes-000000',
      repoUrl: 'https://github.com/test/fieldnotes',
      branch: 'main',
      sha: repo.headSha,
      aiEnrichment: false,
    });
  }

  it('identifies the framework, tooling and Android build system', async () => {
    const { manifest } = await inspect();

    expect(manifest.framework).toBe('expo');
    expect(manifest.packageManager).toBe('npm');
    // A bare Expo project with a checked-in android/ builds through Gradle.
    expect(manifest.androidBuildSystem).toBe('gradle');
    expect(manifest.androidPackageId).toBe('com.example.fieldnotes');
    expect(manifest.minSdkVersion).toBe(24);
    expect(manifest.appName).toBe('FieldNotes');
    expect(manifest.appSlug).toBe('fieldnotes');
  });

  it('detects the project’s real verification commands', async () => {
    const { manifest } = await inspect();

    expect(manifest.commands.install).toBe('npm ci');
    expect(manifest.commands.typecheck).toBe('npm run typecheck');
    expect(manifest.commands.lint).toBe('npm run lint');
    expect(manifest.commands.test).toBe('npm run test');
  });

  it('discovers screens and infers their roles', async () => {
    const { manifest } = await inspect();
    const byName = new Map(manifest.screens.map((screen) => [screen.name, screen]));

    expect([...byName.keys()]).toEqual(
      expect.arrayContaining(['Home Screen', 'Map Screen', 'Profile Screen', 'Login Screen']),
    );
    expect(byName.get('Login Screen')?.role).toBe('auth');
    expect(byName.get('Map Screen')?.role).toBe('map');
    expect(byName.get('Profile Screen')?.role).toBe('profile');
  });

  it('detects the capabilities that determine protection rules', async () => {
    const { manifest } = await inspect();
    const present = new Set(
      manifest.capabilities.filter((capability) => capability.present).map((capability) => capability.key),
    );

    expect(present).toContain('auth');
    expect(present).toContain('payments');
    expect(present).toContain('location');
    expect(present).toContain('api');
    expect(present).toContain('storage');
  });

  it('records evidence for every capability it claims', async () => {
    const { manifest } = await inspect();
    for (const capability of manifest.capabilities.filter((entry) => entry.present)) {
      expect(capability.evidence.length, capability.key).toBeGreaterThan(0);
    }
  });

  it('reads navigation, state management and theme surfaces', async () => {
    const { manifest } = await inspect();

    expect(manifest.navigation.library).toBe('react-navigation');
    expect(manifest.navigation.pattern).toContain('stack');
    expect(manifest.stateManagement).toContain('zustand');
    expect(manifest.designSystem.present).toBe(true);
    expect(manifest.designSystem.themePaths).toContain('src/theme/theme.ts');
  });

  it('reads Android permissions from the manifest', async () => {
    const { manifest } = await inspect();
    expect(manifest.permissions).toContain('android.permission.ACCESS_FINE_LOCATION');
    expect(manifest.permissions).toContain('android.permission.CAMERA');
  });

  it('finds the test setup', async () => {
    const { manifest } = await inspect();
    expect(manifest.testing.hasTests).toBe(true);
    expect(manifest.testing.frameworks).toContain('jest');
  });

  it('reports no existing Android CI workflow for a repo that has none', async () => {
    const { manifest } = await inspect();
    expect(manifest.ci.hasWorkflows).toBe(false);
    expect(manifest.ci.androidWorkflowPath).toBeNull();
  });

  it('produces a human-readable analysis covering the essentials', async () => {
    const { analysisMarkdown } = await inspect();

    expect(analysisMarkdown).toContain('# FieldNotes — DesignLab analysis');
    expect(analysisMarkdown).toContain('| Framework |');
    expect(analysisMarkdown).toContain('## Commands');
    expect(analysisMarkdown).toContain('## Capabilities detected');
    expect(analysisMarkdown).toContain('npm run typecheck');
  });

  it('records the exact commit it describes, which is what makes caching safe', async () => {
    const { manifest } = await inspect();
    expect(manifest.sha).toBe(repo.headSha);
  });

  it('enriches the manifest without discarding deterministic findings', async () => {
    const enriched = await inspectRepository({
      repoDir: repo.path,
      projectId: 'test-fieldnotes-000000',
      repoUrl: 'https://github.com/test/fieldnotes',
      branch: 'main',
      sha: repo.headSha,
      aiEnrichment: true,
      runner: new MockAgentRunner({ applyBuilderEdits: false }),
    });

    expect(enriched.enriched).toBe(true);
    expect(enriched.manifest.analysisMode).toBe('ai-enriched');
    // Build commands are facts and must survive enrichment untouched.
    expect(enriched.manifest.commands.typecheck).toBe('npm run typecheck');
    expect(enriched.manifest.framework).toBe('expo');
  });
});

describe('inspectRepository — Flutter target', () => {
  let repo: FixtureRepo;

  beforeEach(async () => {
    repo = await createFixtureRepo(FLUTTER_APP_FILES);
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('detects Flutter and its native toolchain rather than assuming Expo', async () => {
    const { manifest } = await inspectRepository({
      repoDir: repo.path,
      projectId: 'test-harbour-000000',
      repoUrl: 'https://github.com/test/harbour',
      branch: 'main',
      sha: repo.headSha,
      aiEnrichment: false,
    });

    expect(manifest.framework).toBe('flutter');
    expect(manifest.packageManager).toBe('pub');
    expect(manifest.androidBuildSystem).toBe('flutter');
    expect(manifest.appName).toBe('harbour');
    expect(manifest.commands.install).toBe('flutter pub get');
    expect(manifest.commands.test).toBe('flutter test');
    expect(manifest.commands.androidBuild).toBe('flutter build apk --release');
    expect(manifest.navigation.library).toBe('go_router');
    expect(manifest.stateManagement).toContain('bloc');
    expect(manifest.screens.map((screen) => screen.path)).toContain('lib/screens/home_screen.dart');
  });
});

describe('detectors', () => {
  it('maps lockfiles onto package managers', async () => {
    const cases: Array<[string, string]> = [
      ['yarn.lock', 'yarn'],
      ['pnpm-lock.yaml', 'pnpm'],
      ['package-lock.json', 'npm'],
      ['bun.lockb', 'bun'],
    ];

    for (const [lockfile, expected] of cases) {
      const snapshot = {
        files: ['package.json', lockfile],
        contents: new Map([['package.json', JSON.stringify({ dependencies: { 'react-native': '0.74.0' } })]]),
      };
      expect(detectPackageManager(snapshot, 'react-native'), lockfile).toBe(expected);
    }
  });

  it('distinguishes managed Expo, bare Expo and EAS', () => {
    const managed = {
      files: ['package.json', 'app.json'],
      contents: new Map([['package.json', JSON.stringify({ dependencies: { expo: '~51.0.0' } })]]),
    };
    expect(detectAndroid(managed, 'expo').buildSystem).toBe('expo-prebuild');

    const eas = {
      files: ['package.json', 'eas.json'],
      contents: new Map([['package.json', JSON.stringify({ dependencies: { expo: '~51.0.0' } })]]),
    };
    expect(detectAndroid(eas, 'expo').buildSystem).toBe('eas-build');

    const bare = {
      files: ['package.json', 'android/app/build.gradle'],
      contents: new Map([['package.json', JSON.stringify({ dependencies: { expo: '~51.0.0' } })]]),
    };
    expect(detectAndroid(bare, 'expo').buildSystem).toBe('gradle');
  });

  it('falls back to tsc when no typecheck script exists', () => {
    const snapshot = {
      files: ['package.json', 'tsconfig.json'],
      contents: new Map([
        ['package.json', JSON.stringify({ devDependencies: { typescript: '^5.4.0' }, scripts: {} })],
      ]),
    };
    expect(detectCommands(snapshot, 'react-native', 'npm', 'gradle').typecheck).toBe('npx tsc --noEmit');
  });

  it('reports unknown rather than guessing when there are no framework markers', () => {
    const snapshot = { files: ['README.md'], contents: new Map() };
    expect(detectFramework(snapshot).framework).toBe('unknown');
  });
});

describe('structure discovery', () => {
  it('infers screen roles from names and paths', () => {
    expect(inferRole('LoginScreen', 'src/screens/LoginScreen.tsx')).toBe('auth');
    expect(inferRole('MapScreen', 'src/screens/MapScreen.tsx')).toBe('map');
    expect(inferRole('CheckoutScreen', 'src/screens/CheckoutScreen.tsx')).toBe('commerce');
    expect(inferRole('Whatever', 'src/screens/Whatever.tsx')).toBe('unknown');
  });

  it('recognises Expo Router file-based routes', () => {
    const snapshot = {
      files: ['app/_layout.tsx', 'app/index.tsx', 'app/(tabs)/profile.tsx', 'app/(tabs)/_layout.tsx'],
      contents: new Map<string, string>(),
    };
    const screens = discoverScreens(snapshot, 'expo');
    const paths = screens.map((screen) => screen.path);

    expect(paths).toContain('app/index.tsx');
    expect(paths).toContain('app/(tabs)/profile.tsx');
    // Layouts are not screens.
    expect(paths).not.toContain('app/_layout.tsx');
  });
});

describe('buildSnapshot', () => {
  let repo: FixtureRepo;

  beforeEach(async () => {
    repo = await createFixtureRepo(RN_APP_FILES);
  });
  afterEach(async () => {
    await repo.cleanup();
  });

  it('reads interesting files and skips the rest', async () => {
    const { snapshot } = await buildSnapshot(repo.path);

    expect(snapshot.files.length).toBeGreaterThan(10);
    expect(snapshot.contents.has('package.json')).toBe(true);
    expect(snapshot.contents.has('src/theme/theme.ts')).toBe(true);
    // Reading everything would be slow and pointless.
    expect(snapshot.contents.size).toBeLessThan(snapshot.files.length + 1);
  });

  it('never walks into .git', async () => {
    const { snapshot } = await buildSnapshot(repo.path);
    expect(snapshot.files.some((file) => file.startsWith('.git/'))).toBe(false);
  });

  it('reports truncation rather than silently analysing a fragment', async () => {
    const { truncated } = await buildSnapshot(repo.path, { maxFiles: 3 });
    expect(truncated).toBe(true);
  });
});

describe('mergeEnrichment', () => {
  const base = {
    schemaVersion: 1 as const,
    projectId: 'p',
    repoUrl: 'https://github.com/test/app',
    branch: 'main',
    sha: 'a'.repeat(40),
    generatedAt: new Date().toISOString(),
    appName: 'app',
    appSlug: 'app',
    framework: 'expo' as const,
    frameworkVersion: null,
    languages: [],
    packageManager: 'npm' as const,
    androidBuildSystem: 'gradle' as const,
    androidPackageId: null,
    minSdkVersion: null,
    sourceRoots: [],
    screens: [{ name: 'Home', path: 'src/screens/Home.tsx', role: 'feed', designRelevant: true }],
    navigation: { library: null, pattern: 'unknown', paths: [] },
    components: [],
    designSystem: { present: false, themePaths: [], tokens: [], stylingApproach: 'StyleSheet' },
    stateManagement: [],
    capabilities: [
      { key: 'auth', present: true, evidence: ['dependency: firebase'], paths: [], notes: '' },
    ],
    permissions: [],
    nativeModules: [],
    apis: [],
    backends: [],
    testing: { frameworks: [], testPaths: [], hasTests: false },
    commands: {
      install: 'npm ci',
      typecheck: 'npm run typecheck',
      lint: null,
      test: null,
      build: null,
      androidBuild: null,
    },
    ci: { hasWorkflows: false, workflowPaths: [], buildsAndroid: false, androidWorkflowPath: null },
    fileCount: 1,
    truncated: false,
    analysisMode: 'deterministic' as const,
    notes: [],
  };

  it('cannot remove a capability that has file-level evidence', () => {
    const merged = mergeEnrichment(base, {
      capabilities: [{ key: 'auth', present: false, notes: 'I did not see any auth' }],
    });
    expect(merged.capabilities.find((capability) => capability.key === 'auth')?.present).toBe(true);
  });

  it('can add a capability the scan missed', () => {
    const merged = mergeEnrichment(base, {
      capabilities: [{ key: 'messaging', present: true, notes: 'chat via websockets' }],
    });
    expect(merged.capabilities.find((capability) => capability.key === 'messaging')?.present).toBe(true);
  });

  it('cannot make a detected screen disappear', () => {
    const merged = mergeEnrichment(base, {
      screens: [{ name: 'Settings', path: 'src/screens/Settings.tsx', role: 'settings', designRelevant: true }],
    });
    expect(merged.screens.map((screen) => screen.path)).toContain('src/screens/Home.tsx');
    expect(merged.screens.map((screen) => screen.path)).toContain('src/screens/Settings.tsx');
  });

  it('leaves build commands alone', () => {
    const merged = mergeEnrichment(base, { appName: 'Better Name' });
    expect(merged.commands.typecheck).toBe('npm run typecheck');
    expect(merged.appName).toBe('Better Name');
    expect(merged.appSlug).toBe('better-name');
  });
});
