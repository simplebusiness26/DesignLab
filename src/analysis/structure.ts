/**
 * Screen and component discovery.
 *
 * Screens matter because design briefs target them and reviewers check them.
 * Discovery is heuristic by necessity — there is no universal definition of a
 * "screen" across React Native, Expo Router, Flutter and native Android — so
 * each heuristic is scoped to a framework and every result carries the path it
 * came from, letting a human check the analyser's work.
 */

import type { Framework, Screen } from '../core/schemas.js';
import type { RepoSnapshot } from './detectors.js';

interface ComponentRef {
  name: string;
  path: string;
  usageCount: number;
}

/** Role inference from a screen's name; drives design-brief targeting. */
const ROLE_PATTERNS: ReadonlyArray<{ pattern: RegExp; role: string }> = [
  { pattern: /(login|signin|sign-in|signup|sign-up|register|auth|otp|verify|forgot)/i, role: 'auth' },
  { pattern: /(map|location|nearby|directions|route)/i, role: 'map' },
  { pattern: /(chat|message|inbox|conversation|thread)/i, role: 'messaging' },
  { pattern: /(profile|account|me\b|user)/i, role: 'profile' },
  { pattern: /(settings|preferences|config)/i, role: 'settings' },
  { pattern: /(feed|home|timeline|discover|explore|dashboard)/i, role: 'feed' },
  { pattern: /(search|filter|browse)/i, role: 'search' },
  { pattern: /(detail|item|view|show)/i, role: 'detail' },
  { pattern: /(list|index|all)/i, role: 'list' },
  { pattern: /(checkout|cart|payment|billing|subscribe|plan)/i, role: 'commerce' },
  { pattern: /(onboard|welcome|intro|tutorial|splash)/i, role: 'onboarding' },
  { pattern: /(notification|alert)/i, role: 'notifications' },
  { pattern: /(camera|photo|media|gallery)/i, role: 'media' },
];

export function inferRole(name: string, path: string): string {
  const haystack = `${name} ${path}`;
  for (const { pattern, role } of ROLE_PATTERNS) {
    if (pattern.test(haystack)) return role;
  }
  return 'unknown';
}

/**
 * Screens whose *behaviour* is sensitive are still design-relevant — an auth
 * screen can be redesigned — but they are flagged so briefs treat them with
 * more care.
 */
function isDesignRelevant(role: string): boolean {
  return role !== 'unknown' || true;
}

export function discoverScreens(snapshot: RepoSnapshot, framework: Framework): Screen[] {
  const screens = new Map<string, Screen>();

  const add = (name: string, path: string): void => {
    if (screens.has(path)) return;
    const role = inferRole(name, path);
    screens.set(path, { name, path, role, designRelevant: isDesignRelevant(role) });
  };

  if (framework === 'flutter') {
    for (const file of snapshot.files) {
      if (!file.endsWith('.dart')) continue;
      const body = snapshot.contents.get(file) ?? '';
      const isScreenPath = /(^|\/)(screens?|pages?|views?)\//i.test(file);
      const isScreenName = /(screen|page|view)\.dart$/i.test(file);
      const extendsWidget = /class\s+(\w+)\s+extends\s+(StatelessWidget|StatefulWidget)/.test(body);
      if (isScreenPath || isScreenName || (extendsWidget && /Scaffold\s*\(/.test(body))) {
        add(toTitle(basename(file).replace(/\.dart$/, '')), file);
      }
    }
    return sortScreens([...screens.values()]);
  }

  if (framework === 'android-native' || framework === 'kotlin-multiplatform') {
    for (const file of snapshot.files) {
      if (!/\.(kt|java)$/.test(file)) continue;
      const body = snapshot.contents.get(file) ?? '';
      const isActivity = /class\s+\w*(Activity|Fragment)\b/.test(body) || /(Activity|Fragment)\.(kt|java)$/.test(file);
      const isComposableScreen = /@Composable/.test(body) && /fun\s+\w*Screen\s*\(/.test(body);
      if (isActivity || isComposableScreen) {
        add(toTitle(basename(file).replace(/\.(kt|java)$/, '')), file);
      }
    }
    return sortScreens([...screens.values()]);
  }

  // JavaScript / TypeScript frameworks.
  const isSourceFile = (file: string): boolean => /\.[jt]sx?$/.test(file) && !/\.(test|spec|d)\.[jt]sx?$/.test(file);

  // Expo Router / Next-style file routing: app/**/page.tsx or app/**/*.tsx.
  const usesFileRouting = snapshot.files.some((file) => /^app\/.*_layout\.[jt]sx?$/.test(file));
  if (usesFileRouting) {
    for (const file of snapshot.files) {
      if (!file.startsWith('app/') || !isSourceFile(file)) continue;
      const name = basename(file).replace(/\.[jt]sx?$/, '');
      if (name.startsWith('_')) continue; // layouts and route groups
      const routeName = name === 'index' ? parentDirName(file) || 'Index' : name;
      add(toTitle(routeName), file);
    }
  }

  for (const file of snapshot.files) {
    if (!isSourceFile(file)) continue;
    const inScreenDir = /(^|\/)(screens?|pages?|views?|routes?)\//i.test(file);
    const screenSuffix = /(Screen|Page|View)\.[jt]sx?$/.test(file);
    if (!inScreenDir && !screenSuffix) continue;
    const name = basename(file).replace(/\.[jt]sx?$/, '');
    if (name === 'index') {
      const parent = parentDirName(file);
      add(toTitle(parent || 'Index'), file);
      continue;
    }
    add(toTitle(name), file);
  }

  return sortScreens([...screens.values()]);
}

/**
 * Reusable components, ranked by how often they are imported. A redesign that
 * changes the top components changes the whole app, which is exactly what a
 * brief should ask for.
 */
export function discoverComponents(snapshot: RepoSnapshot, limit = 40): ComponentRef[] {
  const componentFiles = snapshot.files.filter(
    (file) =>
      /(^|\/)(components?|ui|widgets?|elements?|atoms|molecules|organisms)\//i.test(file) &&
      /\.([jt]sx?|dart|kt)$/.test(file) &&
      !/\.(test|spec|d)\.[jt]sx?$/.test(file),
  );

  const allBodies = [...snapshot.contents.values()].join('\n');
  const refs: ComponentRef[] = [];

  for (const file of componentFiles) {
    const name = basename(file).replace(/\.([jt]sx?|dart|kt)$/, '');
    if (name === 'index') continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = allBodies.match(new RegExp(`\\b${escaped}\\b`, 'g'));
    refs.push({ name, path: file, usageCount: Math.max(0, (matches?.length ?? 1) - 1) });
  }

  return refs.sort((a, b) => b.usageCount - a.usageCount || a.path.localeCompare(b.path)).slice(0, limit);
}

/** Third-party API hosts and backend services referenced in source. */
export function discoverApis(snapshot: RepoSnapshot, limit = 20): string[] {
  const hosts = new Set<string>();
  const urlPattern = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?:[/:][^\s"'`)]*)?/gi;

  for (const [path, body] of snapshot.contents) {
    if (path.startsWith('.github/') || /\.(md|lock|json)$/.test(path)) continue;
    for (const match of body.matchAll(urlPattern)) {
      const host = match[1]?.toLowerCase();
      if (!host) continue;
      // Documentation and tooling links are noise, not integrations.
      if (/(github\.com|npmjs|reactnative\.dev|flutter\.dev|w3\.org|schemas?\.|example\.com|localhost|apache\.org|google\.com\/apis)/.test(host)) {
        continue;
      }
      hosts.add(host);
      if (hosts.size >= limit * 3) break;
    }
  }

  return [...hosts].sort().slice(0, limit);
}

export function discoverBackends(snapshot: RepoSnapshot): string[] {
  const found = new Set<string>();
  const haystack = [...snapshot.contents.values()].join('\n').toLowerCase();
  const signatures: Record<string, RegExp> = {
    firebase: /firebase|firestore/,
    supabase: /supabase/,
    'aws-amplify': /aws-amplify|amplify/,
    appwrite: /appwrite/,
    parse: /parse-server|parse\/react-native/,
    graphql: /graphql|apollo/,
    rest: /axios|fetch\(/,
    pocketbase: /pocketbase/,
  };

  for (const [name, pattern] of Object.entries(signatures)) {
    if (pattern.test(haystack)) found.add(name);
  }
  return [...found].sort();
}

export function discoverNativeModules(snapshot: RepoSnapshot, limit = 30): string[] {
  const modules = snapshot.files
    .filter((file) => /^(ios|android)\/.*\.(m|mm|swift|java|kt)$/.test(file))
    .map((file) => file.split('/').slice(0, 3).join('/'));
  return [...new Set(modules)].sort().slice(0, limit);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

function parentDirName(path: string): string {
  const parts = path.split('/');
  return parts.at(-2) ?? '';
}

function toTitle(value: string): string {
  const cleaned = value
    .replace(/[[\]()]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return cleaned
    .split(/\s+/)
    .map((word) => (word ? word[0]?.toUpperCase() + word.slice(1) : ''))
    .join(' ')
    .trim() || value;
}

function sortScreens(screens: Screen[]): Screen[] {
  return screens.sort((a, b) => a.path.localeCompare(b.path)).slice(0, 200);
}
