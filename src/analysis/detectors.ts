/**
 * Framework, tooling and capability detection.
 *
 * All detection is deterministic and evidence-based: each conclusion records
 * the files or dependencies that produced it. That matters because the
 * Functionality Contract is derived from these findings, and a protection rule
 * nobody can justify is a protection rule nobody will trust.
 */

import type {
  AndroidBuildSystem,
  Capability,
  CommandSet,
  Framework,
  PackageManager,
} from '../core/schemas.js';

export interface RepoSnapshot {
  /** Repository-relative POSIX paths. */
  files: readonly string[];
  /** Contents of small, interesting files, keyed by path. */
  contents: ReadonlyMap<string, string>;
}

export interface PackageJsonLike {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export function readPackageJson(snapshot: RepoSnapshot): PackageJsonLike | null {
  const raw = snapshot.contents.get('package.json');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PackageJsonLike;
  } catch {
    return null;
  }
}

export function allDependencies(pkg: PackageJsonLike | null): Record<string, string> {
  if (!pkg) return {};
  return { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
}

// ---------------------------------------------------------------------------
// Framework
// ---------------------------------------------------------------------------

export interface FrameworkDetection {
  framework: Framework;
  version: string | null;
  evidence: string[];
}

export function detectFramework(snapshot: RepoSnapshot): FrameworkDetection {
  const pkg = readPackageJson(snapshot);
  const deps = allDependencies(pkg);
  const has = (name: string): boolean => name in deps;
  const evidence: string[] = [];

  if (snapshot.files.includes('pubspec.yaml')) {
    const pubspec = snapshot.contents.get('pubspec.yaml') ?? '';
    if (/^\s*flutter\s*:/m.test(pubspec) || /sdk:\s*flutter/m.test(pubspec)) {
      evidence.push('pubspec.yaml declares the Flutter SDK');
      return { framework: 'flutter', version: extractPubspecVersion(pubspec), evidence };
    }
  }

  if (has('expo')) {
    evidence.push('expo dependency');
    if (snapshot.files.includes('app.json') || snapshot.files.includes('app.config.js')) {
      evidence.push('expo app config present');
    }
    return { framework: 'expo', version: deps['expo'] ?? null, evidence };
  }

  if (has('react-native')) {
    evidence.push('react-native dependency');
    return { framework: 'react-native', version: deps['react-native'] ?? null, evidence };
  }

  if (has('@capacitor/core') || has('@capacitor/android')) {
    evidence.push('capacitor dependency');
    return { framework: 'capacitor', version: deps['@capacitor/core'] ?? null, evidence };
  }

  if (has('@ionic/angular') || has('@ionic/react') || has('@ionic/vue')) {
    evidence.push('ionic dependency');
    return { framework: 'ionic', version: null, evidence };
  }

  if (has('nativescript') || has('@nativescript/core')) {
    evidence.push('nativescript dependency');
    return { framework: 'nativescript', version: null, evidence };
  }

  const hasKmpSourceSet = snapshot.files.some((file) => file.includes('/commonMain/'));
  if (hasKmpSourceSet) {
    evidence.push('Kotlin Multiplatform commonMain source set');
    return { framework: 'kotlin-multiplatform', version: null, evidence };
  }

  const hasGradle = snapshot.files.some(
    (file) => file === 'settings.gradle' || file === 'settings.gradle.kts' || file.endsWith('/build.gradle') || file.endsWith('/build.gradle.kts'),
  );
  const hasManifest = snapshot.files.some((file) => file.endsWith('AndroidManifest.xml'));
  if (hasGradle && hasManifest) {
    evidence.push('Gradle build files with an AndroidManifest.xml');
    return { framework: 'android-native', version: null, evidence };
  }

  return { framework: 'unknown', version: null, evidence: ['no recognised mobile framework markers'] };
}

function extractPubspecVersion(pubspec: string): string | null {
  const match = /^\s*version:\s*(.+)$/m.exec(pubspec);
  return match?.[1]?.trim() ?? null;
}

// ---------------------------------------------------------------------------
// Package manager
// ---------------------------------------------------------------------------

export function detectPackageManager(snapshot: RepoSnapshot, framework: Framework): PackageManager {
  if (framework === 'flutter') return 'pub';
  if (framework === 'android-native' || framework === 'kotlin-multiplatform') return 'gradle';

  if (snapshot.files.includes('bun.lockb') || snapshot.files.includes('bun.lock')) return 'bun';
  if (snapshot.files.includes('pnpm-lock.yaml')) return 'pnpm';
  if (snapshot.files.includes('yarn.lock')) return 'yarn';
  if (snapshot.files.includes('package-lock.json')) return 'npm';

  const pkg = readPackageJson(snapshot);
  const declared = (pkg as { packageManager?: string } | null)?.packageManager;
  if (typeof declared === 'string') {
    if (declared.startsWith('pnpm')) return 'pnpm';
    if (declared.startsWith('yarn')) return 'yarn';
    if (declared.startsWith('bun')) return 'bun';
    if (declared.startsWith('npm')) return 'npm';
  }

  return pkg ? 'npm' : 'unknown';
}

// ---------------------------------------------------------------------------
// Android build system
// ---------------------------------------------------------------------------

export interface AndroidDetection {
  buildSystem: AndroidBuildSystem;
  packageId: string | null;
  minSdkVersion: number | null;
  permissions: string[];
  evidence: string[];
}

export function detectAndroid(snapshot: RepoSnapshot, framework: Framework): AndroidDetection {
  const evidence: string[] = [];
  const deps = allDependencies(readPackageJson(snapshot));

  const hasAndroidDir = snapshot.files.some((file) => file.startsWith('android/'));
  const hasGradleWrapper = snapshot.files.some((file) => file.endsWith('gradlew'));

  let buildSystem: AndroidBuildSystem = 'unknown';

  if (framework === 'flutter') {
    buildSystem = 'flutter';
    evidence.push('Flutter project: `flutter build apk`');
  } else if (framework === 'expo') {
    if (hasAndroidDir) {
      buildSystem = 'gradle';
      evidence.push('Expo project with a checked-in android/ directory (bare workflow)');
    } else if ('eas-cli' in deps || snapshot.files.includes('eas.json')) {
      buildSystem = 'eas-build';
      evidence.push('eas.json present: builds run on EAS');
    } else {
      buildSystem = 'expo-prebuild';
      evidence.push('Managed Expo project: `expo prebuild` is required before a Gradle build');
    }
  } else if (framework === 'capacitor') {
    buildSystem = hasAndroidDir ? 'gradle' : 'capacitor';
    evidence.push('Capacitor project');
  } else if (hasAndroidDir || hasGradleWrapper) {
    buildSystem = 'gradle';
    evidence.push('Gradle wrapper / android directory present');
  } else {
    buildSystem = 'none';
    evidence.push('no Android build files detected');
  }

  const manifestPath = snapshot.files.find((file) => file.endsWith('AndroidManifest.xml')) ?? null;
  const manifestBody = manifestPath ? snapshot.contents.get(manifestPath) ?? '' : '';
  const permissions = [...manifestBody.matchAll(/android:name="(android\.permission\.[A-Z_0-9]+)"/g)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));

  return {
    buildSystem,
    packageId: detectPackageId(snapshot, manifestBody),
    minSdkVersion: detectMinSdk(snapshot),
    permissions: [...new Set(permissions)].sort(),
    evidence,
  };
}

function detectPackageId(snapshot: RepoSnapshot, manifestBody: string): string | null {
  const fromManifest = /package="([\w.]+)"/.exec(manifestBody)?.[1];
  if (fromManifest) return fromManifest;

  for (const path of ['android/app/build.gradle', 'android/app/build.gradle.kts']) {
    const body = snapshot.contents.get(path);
    if (!body) continue;
    const applicationId = /applicationId\s*=?\s*["']([\w.]+)["']/.exec(body)?.[1];
    if (applicationId) return applicationId;
  }

  const appJson = snapshot.contents.get('app.json');
  if (appJson) {
    try {
      const parsed = JSON.parse(appJson) as { expo?: { android?: { package?: string } } };
      if (parsed.expo?.android?.package) return parsed.expo.android.package;
    } catch {
      // Not fatal; the package id is informational.
    }
  }

  return null;
}

function detectMinSdk(snapshot: RepoSnapshot): number | null {
  for (const path of ['android/build.gradle', 'android/app/build.gradle', 'android/app/build.gradle.kts', 'android/build.gradle.kts']) {
    const body = snapshot.contents.get(path);
    if (!body) continue;
    const match = /minSdk(?:Version)?\s*=?\s*(\d+)/.exec(body);
    if (match?.[1]) return Number.parseInt(match[1], 10);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export function detectCommands(
  snapshot: RepoSnapshot,
  framework: Framework,
  packageManager: PackageManager,
  android: AndroidBuildSystem,
): CommandSet {
  if (framework === 'flutter') {
    return {
      install: 'flutter pub get',
      typecheck: 'flutter analyze',
      lint: 'flutter analyze',
      test: snapshot.files.some((file) => file.startsWith('test/')) ? 'flutter test' : null,
      build: null,
      androidBuild: 'flutter build apk --release',
    };
  }

  if (framework === 'android-native' || framework === 'kotlin-multiplatform') {
    const hasWrapper = snapshot.files.some((file) => file.endsWith('gradlew'));
    const gradle = hasWrapper ? './gradlew' : 'gradle';
    return {
      install: null,
      typecheck: `${gradle} compileDebugKotlin`,
      lint: `${gradle} lint`,
      test: `${gradle} testDebugUnitTest`,
      build: `${gradle} assembleDebug`,
      androidBuild: `${gradle} assembleRelease`,
    };
  }

  const pkg = readPackageJson(snapshot);
  const scripts = pkg?.scripts ?? {};
  const runner = scriptRunner(packageManager);

  const pick = (...names: string[]): string | null => {
    for (const name of names) {
      if (typeof scripts[name] === 'string') return `${runner} ${name}`;
    }
    return null;
  };

  const deps = allDependencies(pkg);
  const typecheckFallback =
    snapshot.files.includes('tsconfig.json') && ('typescript' in deps)
      ? `${execRunner(packageManager)} tsc --noEmit`
      : null;

  return {
    install: installCommand(packageManager),
    typecheck: pick('typecheck', 'type-check', 'tsc', 'types') ?? typecheckFallback,
    lint: pick('lint', 'eslint'),
    test: pick('test', 'test:unit', 'jest'),
    build: pick('build'),
    androidBuild: detectAndroidBuildCommand(snapshot, packageManager, android, scripts),
  };
}

function detectAndroidBuildCommand(
  snapshot: RepoSnapshot,
  packageManager: PackageManager,
  android: AndroidBuildSystem,
  scripts: Record<string, string>,
): string | null {
  const runner = scriptRunner(packageManager);
  for (const name of ['android:build', 'build:android', 'apk', 'build:apk']) {
    if (typeof scripts[name] === 'string') return `${runner} ${name}`;
  }

  switch (android) {
    case 'gradle': {
      const hasWrapper = snapshot.files.some((file) => file.startsWith('android/') && file.endsWith('gradlew'));
      return hasWrapper ? 'cd android && ./gradlew assembleRelease' : 'cd android && gradle assembleRelease';
    }
    case 'expo-prebuild':
      return `${execRunner(packageManager)} expo prebuild --platform android && cd android && ./gradlew assembleRelease`;
    case 'eas-build':
      return `${execRunner(packageManager)} eas build --platform android --profile production --non-interactive`;
    case 'flutter':
      return 'flutter build apk --release';
    case 'capacitor':
      return `${execRunner(packageManager)} cap sync android && cd android && ./gradlew assembleRelease`;
    default:
      return null;
  }
}

export function scriptRunner(packageManager: PackageManager): string {
  switch (packageManager) {
    case 'yarn':
      return 'yarn';
    case 'pnpm':
      return 'pnpm run';
    case 'bun':
      return 'bun run';
    default:
      return 'npm run';
  }
}

export function execRunner(packageManager: PackageManager): string {
  switch (packageManager) {
    case 'yarn':
      return 'yarn';
    case 'pnpm':
      return 'pnpm exec';
    case 'bun':
      return 'bunx';
    default:
      return 'npx';
  }
}

export function installCommand(packageManager: PackageManager): string | null {
  switch (packageManager) {
    case 'npm':
      return 'npm ci';
    case 'yarn':
      return 'yarn install --frozen-lockfile';
    case 'pnpm':
      return 'pnpm install --frozen-lockfile';
    case 'bun':
      return 'bun install --frozen-lockfile';
    case 'pub':
      return 'flutter pub get';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

interface CapabilitySignature {
  key: string;
  dependencies: readonly string[];
  pathPatterns: readonly RegExp[];
  permissions: readonly string[];
  notes: string;
}

/**
 * Capability signatures drive both the manifest and the default protection
 * rules. Each is intentionally narrow: a false positive here becomes a
 * protection rule that blocks legitimate design work.
 */
export const CAPABILITY_SIGNATURES: readonly CapabilitySignature[] = [
  {
    key: 'auth',
    dependencies: ['firebase', '@react-native-firebase/auth', 'next-auth', '@auth0/auth0-react', 'react-native-auth0', 'aws-amplify', '@supabase/supabase-js', 'jsonwebtoken', 'expo-auth-session'],
    pathPatterns: [/(^|\/)(auth|authentication|login|session)\//i, /(^|\/)use-?auth\.[jt]sx?$/i],
    permissions: [],
    notes: 'Authentication flows are behavioural and must survive a redesign unchanged.',
  },
  {
    key: 'payments',
    dependencies: ['stripe', '@stripe/stripe-react-native', 'react-native-iap', 'expo-in-app-purchases', 'braintree-web', 'razorpay'],
    pathPatterns: [/(^|\/)(payment|payments|billing|checkout|subscription)s?\//i],
    permissions: ['android.permission.BILLING'],
    notes: 'Payment logic is financially sensitive and never designable.',
  },
  {
    key: 'location',
    dependencies: ['react-native-maps', 'expo-location', '@react-native-community/geolocation', 'google_maps_flutter', 'geolocator', 'react-native-geolocation-service', 'mapbox-gl', '@rnmapbox/maps'],
    pathPatterns: [/(^|\/)(location|geo|maps?)\//i],
    permissions: ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'],
    notes: 'Location acquisition behaviour is protected; map presentation is designable.',
  },
  {
    key: 'messaging',
    dependencies: ['@react-native-firebase/messaging', 'expo-notifications', 'socket.io-client', 'pusher-js', 'stream-chat', '@sendbird/chat', 'firebase_messaging'],
    pathPatterns: [/(^|\/)(chat|messag(e|ing)|notification)s?\//i],
    permissions: ['android.permission.POST_NOTIFICATIONS'],
    notes: 'Message delivery and ordering are behavioural guarantees.',
  },
  {
    key: 'database',
    dependencies: ['realm', 'watermelondb', '@nozbe/watermelondb', 'react-native-sqlite-storage', 'expo-sqlite', 'drizzle-orm', 'prisma', '@prisma/client', 'typeorm', 'sqflite', 'hive'],
    pathPatterns: [/(^|\/)(migrations?|schema|db|database)\//i, /\.(sql|prisma)$/i],
    permissions: [],
    notes: 'Schema and migrations are the highest-risk surface in the repository.',
  },
  {
    key: 'storage',
    dependencies: ['@react-native-async-storage/async-storage', 'react-native-mmkv', 'expo-secure-store', 'redux-persist', 'shared_preferences'],
    pathPatterns: [/(^|\/)(storage|persist(ence)?)\//i],
    permissions: [],
    notes: 'Persistence keys and shapes must stay stable across a redesign.',
  },
  {
    key: 'api',
    dependencies: ['axios', '@tanstack/react-query', 'swr', 'apollo-client', '@apollo/client', 'graphql', 'urql', 'ky', 'dio', 'retrofit'],
    pathPatterns: [/(^|\/)(api|services?|network|http|graphql)\//i],
    permissions: ['android.permission.INTERNET'],
    notes: 'Request/response contracts with the backend are protected.',
  },
  {
    key: 'analytics',
    dependencies: ['@amplitude/analytics-react-native', 'mixpanel-react-native', '@segment/analytics-react-native', 'posthog-react-native', '@react-native-firebase/analytics'],
    pathPatterns: [/(^|\/)analytics\//i],
    permissions: [],
    notes: 'Event names and properties are a data contract; presentation may change around them.',
  },
  {
    key: 'camera',
    dependencies: ['react-native-vision-camera', 'expo-camera', 'react-native-image-picker', 'expo-image-picker', 'camera'],
    pathPatterns: [/(^|\/)(camera|media|photo)s?\//i],
    permissions: ['android.permission.CAMERA'],
    notes: 'Capture and permission flow are behavioural; the viewfinder chrome is designable.',
  },
  {
    key: 'native-modules',
    dependencies: [],
    pathPatterns: [/(^|\/)(ios|android)\/.*\.(m|mm|swift|java|kt)$/i, /(^|\/)native_?modules?\//i],
    permissions: [],
    notes: 'Native bridge code is outside the design surface.',
  },
];

export function detectCapabilities(snapshot: RepoSnapshot, permissions: readonly string[]): Capability[] {
  const deps = allDependencies(readPackageJson(snapshot));
  const pubspec = snapshot.contents.get('pubspec.yaml') ?? '';
  const gradleFiles = snapshot.files
    .filter((file) => file.endsWith('.gradle') || file.endsWith('.gradle.kts'))
    .map((file) => snapshot.contents.get(file) ?? '')
    .join('\n');

  return CAPABILITY_SIGNATURES.map((signature) => {
    const evidence: string[] = [];
    const paths: string[] = [];

    for (const dependency of signature.dependencies) {
      if (dependency in deps) evidence.push(`dependency: ${dependency}`);
      else if (pubspec.includes(`${dependency}:`)) evidence.push(`pubspec dependency: ${dependency}`);
      else if (gradleFiles.includes(dependency)) evidence.push(`gradle dependency: ${dependency}`);
    }

    for (const pattern of signature.pathPatterns) {
      const matches = snapshot.files.filter((file) => pattern.test(file));
      if (matches.length > 0) {
        evidence.push(`${matches.length} path(s) matching ${pattern.source}`);
        paths.push(...matches.slice(0, 12));
      }
    }

    for (const permission of signature.permissions) {
      if (permissions.includes(permission)) evidence.push(`manifest permission: ${permission}`);
    }

    return {
      key: signature.key,
      present: evidence.length > 0,
      evidence: evidence.slice(0, 10),
      paths: [...new Set(paths)].slice(0, 20),
      notes: signature.notes,
    };
  });
}

// ---------------------------------------------------------------------------
// State management, navigation, styling
// ---------------------------------------------------------------------------

const STATE_LIBRARIES: Record<string, string> = {
  redux: 'redux',
  '@reduxjs/toolkit': 'redux-toolkit',
  zustand: 'zustand',
  jotai: 'jotai',
  recoil: 'recoil',
  mobx: 'mobx',
  'mobx-react-lite': 'mobx',
  valtio: 'valtio',
  '@tanstack/react-query': 'react-query',
  swr: 'swr',
  xstate: 'xstate',
  'flutter_bloc': 'bloc',
  provider: 'provider',
  riverpod: 'riverpod',
  'get_it': 'get_it',
};

export function detectStateManagement(snapshot: RepoSnapshot): string[] {
  const deps = allDependencies(readPackageJson(snapshot));
  const pubspec = snapshot.contents.get('pubspec.yaml') ?? '';
  const found = new Set<string>();

  for (const [dependency, label] of Object.entries(STATE_LIBRARIES)) {
    if (dependency in deps || new RegExp(`^\\s*${dependency}\\s*:`, 'm').test(pubspec)) found.add(label);
  }

  if (found.size === 0) {
    const usesContext = snapshot.files.some((file) => /context/i.test(file) && /\.[jt]sx?$/.test(file));
    if (usesContext) found.add('react-context');
  }

  return [...found].sort();
}

const NAVIGATION_LIBRARIES: Record<string, string> = {
  '@react-navigation/native': 'react-navigation',
  'expo-router': 'expo-router',
  'react-native-navigation': 'react-native-navigation',
  'go_router': 'go_router',
  'auto_route': 'auto_route',
  '@ionic/angular': 'ionic-router',
};

export function detectNavigation(snapshot: RepoSnapshot): {
  library: string | null;
  pattern: string;
  paths: string[];
} {
  const deps = allDependencies(readPackageJson(snapshot));
  const pubspec = snapshot.contents.get('pubspec.yaml') ?? '';

  let library: string | null = null;
  for (const [dependency, label] of Object.entries(NAVIGATION_LIBRARIES)) {
    if (dependency in deps || new RegExp(`^\\s*${dependency}\\s*:`, 'm').test(pubspec)) {
      library = label;
      break;
    }
  }

  const paths = snapshot.files
    .filter((file) => /(^|\/)(navigation|navigators?|routes?|router)\//i.test(file) || /(^|\/)_layout\.[jt]sx?$/.test(file))
    .slice(0, 20);

  const bodies = paths.map((path) => snapshot.contents.get(path) ?? '').join('\n');
  const hasTabs = /createBottomTabNavigator|Tabs|BottomNavigation|NavigationBar/i.test(bodies) ||
    snapshot.files.some((file) => /\(tabs\)/.test(file));
  const hasDrawer = /createDrawerNavigator|Drawer/i.test(bodies);
  const hasStack = /createNativeStackNavigator|createStackNavigator|Stack\.Screen/i.test(bodies);

  const parts: string[] = [];
  if (hasStack) parts.push('stack');
  if (hasTabs) parts.push('bottom tabs');
  if (hasDrawer) parts.push('drawer');

  return { library, pattern: parts.length > 0 ? parts.join(' + ') : 'unknown', paths };
}

export function detectStylingApproach(snapshot: RepoSnapshot): string {
  const deps = allDependencies(readPackageJson(snapshot));
  const approaches: string[] = [];

  if ('nativewind' in deps || 'tailwindcss' in deps) approaches.push('tailwind/nativewind');
  if ('styled-components' in deps) approaches.push('styled-components');
  if ('@emotion/native' in deps || '@emotion/react' in deps) approaches.push('emotion');
  if ('react-native-paper' in deps) approaches.push('react-native-paper');
  if ('@shopify/restyle' in deps) approaches.push('restyle');
  if ('tamagui' in deps) approaches.push('tamagui');
  if ('@gluestack-ui/themed' in deps) approaches.push('gluestack');
  if ('@rneui/themed' in deps || 'react-native-elements' in deps) approaches.push('rn-elements');

  if (approaches.length === 0) {
    const usesStyleSheet = [...snapshot.contents.values()].some((body) => /StyleSheet\.create/.test(body));
    if (usesStyleSheet) approaches.push('react-native StyleSheet');
    else if (snapshot.files.some((file) => file.endsWith('.dart'))) approaches.push('flutter ThemeData');
    else if (snapshot.files.some((file) => file.includes('res/values/') && file.endsWith('.xml'))) {
      approaches.push('android XML themes');
    }
  }

  return approaches.length > 0 ? approaches.join(', ') : 'unknown';
}

export function detectThemePaths(snapshot: RepoSnapshot): string[] {
  return snapshot.files
    .filter((file) =>
      /(^|\/)(theme|themes|design-?system|tokens|styles?|colou?rs|typography|palette)(\/|\.)/i.test(file) &&
      /\.(ts|tsx|js|jsx|dart|kt|xml|json|css)$/i.test(file),
    )
    .slice(0, 40);
}

export function detectTestingSetup(snapshot: RepoSnapshot): {
  frameworks: string[];
  testPaths: string[];
  hasTests: boolean;
} {
  const deps = allDependencies(readPackageJson(snapshot));
  const frameworks: string[] = [];

  if ('jest' in deps || 'jest-expo' in deps) frameworks.push('jest');
  if ('vitest' in deps) frameworks.push('vitest');
  if ('@testing-library/react-native' in deps) frameworks.push('testing-library');
  if ('detox' in deps) frameworks.push('detox');
  if ('@playwright/test' in deps) frameworks.push('playwright');
  if (snapshot.files.some((file) => file.startsWith('test/') && file.endsWith('_test.dart'))) {
    frameworks.push('flutter_test');
  }
  if (snapshot.files.some((file) => file.includes('/src/test/') || file.includes('/src/androidTest/'))) {
    frameworks.push('junit');
  }

  const testPaths = snapshot.files
    .filter((file) =>
      /(^|\/)(__tests__|test|tests|spec)\//i.test(file) ||
      /\.(test|spec)\.[jt]sx?$/.test(file) ||
      /_test\.dart$/.test(file),
    )
    .slice(0, 60);

  return { frameworks: [...new Set(frameworks)], testPaths, hasTests: testPaths.length > 0 };
}

export function detectCi(snapshot: RepoSnapshot): {
  hasWorkflows: boolean;
  workflowPaths: string[];
  buildsAndroid: boolean;
  androidWorkflowPath: string | null;
} {
  const workflowPaths = snapshot.files.filter(
    (file) => file.startsWith('.github/workflows/') && /\.ya?ml$/.test(file),
  );

  let androidWorkflowPath: string | null = null;
  for (const path of workflowPaths) {
    const body = snapshot.contents.get(path) ?? '';
    if (/assembleRelease|assembleDebug|flutter build apk|eas build|bundleRelease|\.apk/i.test(body)) {
      androidWorkflowPath = path;
      break;
    }
  }

  return {
    hasWorkflows: workflowPaths.length > 0,
    workflowPaths,
    buildsAndroid: androidWorkflowPath !== null,
    androidWorkflowPath,
  };
}

/** Source roots that contain the design-relevant code. */
export function detectSourceRoots(snapshot: RepoSnapshot): string[] {
  const candidates = ['src', 'app', 'lib', 'components', 'screens', 'features', 'packages'];
  const roots = candidates.filter((candidate) =>
    snapshot.files.some((file) => file.startsWith(`${candidate}/`)),
  );
  return roots.length > 0 ? roots : [];
}

export function detectLanguages(snapshot: RepoSnapshot): string[] {
  const counts = new Map<string, number>();
  const mapping: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript',
    js: 'JavaScript',
    jsx: 'JavaScript',
    dart: 'Dart',
    kt: 'Kotlin',
    kts: 'Kotlin',
    java: 'Java',
    swift: 'Swift',
    m: 'Objective-C',
    mm: 'Objective-C',
  };

  for (const file of snapshot.files) {
    const extension = file.split('.').pop()?.toLowerCase() ?? '';
    const language = mapping[extension];
    if (language) counts.set(language, (counts.get(language) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([language]) => language);
}
