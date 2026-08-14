/**
 * Test fixtures: real Git repositories on disk.
 *
 * DesignLab's core guarantees are about Git behaviour, so the integration
 * tests use genuine repositories with genuine commits rather than mocking the
 * Git client. Everything is created under a temp directory and removed
 * afterwards, so no real project is ever touched.
 */

import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { execCommand } from '../../src/core/exec.js';

export interface FixtureRepo {
  /** Path to the fixture repository (a normal, non-bare checkout). */
  path: string;
  /** Commit created by the initial import. */
  headSha: string;
  branch: string;
  /** Removes the temp tree. */
  cleanup(): Promise<void>;
}

const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'DesignLab Test',
  GIT_AUTHOR_EMAIL: 'test@designlab.local',
  GIT_COMMITTER_NAME: 'DesignLab Test',
  GIT_COMMITTER_EMAIL: 'test@designlab.local',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
};

export async function makeTempDir(prefix = 'designlab-test-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execCommand('git', args, { cwd, env: GIT_ENV, timeoutMs: 60_000 });
  if (!result.ok) {
    throw new Error(`git ${args.join(' ')} failed (${result.exitCode}): ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

export async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, contents] of Object.entries(files)) {
    const path = join(root, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents, 'utf8');
  }
}

/** Creates a Git repository containing `files`, with one initial commit. */
export async function createFixtureRepo(
  files: Record<string, string>,
  options: { branch?: string; prefix?: string } = {},
): Promise<FixtureRepo> {
  const branch = options.branch ?? 'main';
  const root = await makeTempDir(options.prefix ?? 'designlab-repo-');

  await git(root, ['init', '--quiet', `--initial-branch=${branch}`]);
  await git(root, ['config', 'user.name', 'DesignLab Test']);
  await git(root, ['config', 'user.email', 'test@designlab.local']);
  await git(root, ['config', 'commit.gpgsign', 'false']);

  await writeFiles(root, files);
  await git(root, ['add', '-A']);
  await git(root, ['commit', '--quiet', '--no-verify', '-m', 'Initial import']);

  const headSha = await git(root, ['rev-parse', 'HEAD']);

  return {
    path: root,
    headSha,
    branch,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}

/** Commits changes into an existing fixture repo, returning the new SHA. */
export async function commitChanges(
  repoPath: string,
  files: Record<string, string>,
  message = 'Test change',
): Promise<string> {
  await writeFiles(repoPath, files);
  await git(repoPath, ['add', '-A']);
  await git(repoPath, ['commit', '--quiet', '--no-verify', '-m', message]);
  return git(repoPath, ['rev-parse', 'HEAD']);
}

export async function deleteFile(repoPath: string, relativePath: string, message = 'Delete file'): Promise<string> {
  await git(repoPath, ['rm', '--quiet', relativePath]);
  await git(repoPath, ['commit', '--quiet', '--no-verify', '-m', message]);
  return git(repoPath, ['rev-parse', 'HEAD']);
}

export async function renameFile(
  repoPath: string,
  from: string,
  to: string,
  message = 'Rename file',
): Promise<string> {
  await mkdir(dirname(join(repoPath, to)), { recursive: true });
  await git(repoPath, ['mv', from, to]);
  await git(repoPath, ['commit', '--quiet', '--no-verify', '-m', message]);
  return git(repoPath, ['rev-parse', 'HEAD']);
}

// ---------------------------------------------------------------------------
// A realistic React Native / Expo target application
// ---------------------------------------------------------------------------

/**
 * Deliberately includes a protected surface (auth, api, migrations), a
 * designable surface (theme, components, screens), tests, and a working
 * typecheck/test command — so the whole gate pipeline has something real to
 * run against.
 */
export const RN_APP_FILES: Record<string, string> = {
  'package.json': JSON.stringify(
    {
      name: 'fieldnotes',
      version: '1.0.0',
      private: true,
      scripts: {
        typecheck: 'node ./scripts/typecheck.js',
        lint: 'node ./scripts/lint.js',
        test: 'node ./scripts/test.js',
      },
      dependencies: {
        expo: '~51.0.0',
        react: '18.2.0',
        'react-native': '0.74.0',
        '@react-navigation/native': '^6.1.0',
        'react-native-maps': '^1.14.0',
        'expo-location': '~17.0.0',
        '@stripe/stripe-react-native': '^0.37.0',
        '@react-native-async-storage/async-storage': '^1.23.0',
        axios: '^1.7.0',
        zustand: '^4.5.0',
      },
      devDependencies: { typescript: '^5.4.0', jest: '^29.7.0' },
    },
    null,
    2,
  ),

  'app.json': JSON.stringify(
    { expo: { name: 'FieldNotes', slug: 'fieldnotes', android: { package: 'com.example.fieldnotes' } } },
    null,
    2,
  ),

  'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true, jsx: 'react-native' } }, null, 2),

  // Verification commands that genuinely run and genuinely can fail.
  'scripts/typecheck.js': [
    "const { readFileSync, existsSync } = require('node:fs');",
    '// A deliberately simple stand-in for tsc: fails if a screen imports a',
    '// component that does not exist, which is the failure a redesign causes.',
    "const path = 'src/screens/HomeScreen.tsx';",
    'if (!existsSync(path)) { console.error("HomeScreen.tsx is missing"); process.exit(1); }',
    "console.log('typecheck ok');",
    '',
  ].join('\n'),

  'scripts/lint.js': ["console.log('lint ok');", ''].join('\n'),

  'scripts/test.js': [
    "const { existsSync } = require('node:fs');",
    "const required = ['src/api/client.ts', 'src/auth/session.ts'];",
    'for (const file of required) {',
    '  if (!existsSync(file)) { console.error(`missing required module: ${file}`); process.exit(1); }',
    '}',
    "console.log('3 tests passed');",
    '',
  ].join('\n'),

  // --- PROTECTED surface --------------------------------------------------
  'src/api/client.ts': [
    'import axios from "axios";',
    '',
    'export const api = axios.create({ baseURL: "https://api.fieldnotes.example.com/v2" });',
    '',
    'export async function fetchNotes(cursor?: string) {',
    '  const response = await api.get("/notes", { params: { cursor } });',
    '  return response.data;',
    '}',
    '',
  ].join('\n'),

  'src/auth/session.ts': [
    'export interface Session { token: string; userId: string; expiresAt: number }',
    '',
    'export function isSessionValid(session: Session | null): boolean {',
    '  return session !== null && session.expiresAt > Date.now();',
    '}',
    '',
  ].join('\n'),

  'src/payments/checkout.ts': [
    'export function calculateTotal(items: Array<{ priceCents: number; quantity: number }>): number {',
    '  return items.reduce((total, item) => total + item.priceCents * item.quantity, 0);',
    '}',
    '',
  ].join('\n'),

  'db/migrations/001_initial.sql': 'CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);\n',

  // --- DESIGNABLE surface -------------------------------------------------
  'src/theme/theme.ts': [
    'export const theme = {',
    '  colors: { background: "#ffffff", text: "#111111", accent: "#2b6cb0" },',
    '  spacing: { xs: 4, sm: 8, md: 16, lg: 24 },',
    '  radius: 8,',
    '};',
    '',
  ].join('\n'),

  'src/theme/typography.ts': [
    'export const typography = {',
    '  title: { fontSize: 24, fontWeight: "600" },',
    '  body: { fontSize: 16, fontWeight: "400" },',
    '};',
    '',
  ].join('\n'),

  'src/components/NoteCard.tsx': [
    'import { View, Text } from "react-native";',
    'import { theme } from "../theme/theme";',
    '',
    'export function NoteCard({ title }: { title: string }) {',
    '  return (',
    '    <View style={{ padding: theme.spacing.md, borderRadius: theme.radius }}>',
    '      <Text>{title}</Text>',
    '    </View>',
    '  );',
    '}',
    '',
  ].join('\n'),

  'src/components/Button.tsx': [
    'import { Pressable, Text } from "react-native";',
    '',
    'export function Button({ label }: { label: string }) {',
    '  return (<Pressable><Text>{label}</Text></Pressable>);',
    '}',
    '',
  ].join('\n'),

  'src/screens/HomeScreen.tsx': [
    'import { ScrollView } from "react-native";',
    'import { NoteCard } from "../components/NoteCard";',
    '',
    'export function HomeScreen() {',
    '  return (<ScrollView><NoteCard title="First note" /></ScrollView>);',
    '}',
    '',
  ].join('\n'),

  'src/screens/MapScreen.tsx': [
    'import MapView from "react-native-maps";',
    '',
    'export function MapScreen() {',
    '  return <MapView style={{ flex: 1 }} />;',
    '}',
    '',
  ].join('\n'),

  'src/screens/ProfileScreen.tsx': [
    'import { View, Text } from "react-native";',
    '',
    'export function ProfileScreen() {',
    '  return (<View><Text>Profile</Text></View>);',
    '}',
    '',
  ].join('\n'),

  'src/screens/LoginScreen.tsx': [
    'import { View, Text } from "react-native";',
    '',
    'export function LoginScreen() {',
    '  return (<View><Text>Sign in</Text></View>);',
    '}',
    '',
  ].join('\n'),

  'src/navigation/RootNavigator.tsx': [
    'import { createNativeStackNavigator } from "@react-navigation/native-stack";',
    'import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";',
    '',
    'const Stack = createNativeStackNavigator();',
    'const Tabs = createBottomTabNavigator();',
    '',
    'export function RootNavigator() { return null; }',
    '',
  ].join('\n'),

  'src/state/store.ts': [
    'import { create } from "zustand";',
    '',
    'export const useStore = create(() => ({ notes: [] }));',
    '',
  ].join('\n'),

  '__tests__/checkout.test.ts': [
    'import { calculateTotal } from "../src/payments/checkout";',
    '',
    'test("totals line items", () => {',
    '  expect(calculateTotal([{ priceCents: 100, quantity: 2 }])).toBe(200);',
    '});',
    '',
  ].join('\n'),

  'android/app/build.gradle': [
    'android {',
    '    namespace "com.example.fieldnotes"',
    '    defaultConfig {',
    '        applicationId "com.example.fieldnotes"',
    '        minSdkVersion 24',
    '    }',
    '}',
    '',
  ].join('\n'),

  'android/app/src/main/AndroidManifest.xml': [
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example.fieldnotes">',
    '  <uses-permission android:name="android.permission.INTERNET" />',
    '  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
    '  <uses-permission android:name="android.permission.CAMERA" />',
    '</manifest>',
    '',
  ].join('\n'),

  'android/gradlew': '#!/bin/sh\necho "gradle wrapper"\n',

  'README.md': '# FieldNotes\n\nA field note-taking app.\n',
};

/** Minimal Flutter target, used to prove framework detection generalises. */
export const FLUTTER_APP_FILES: Record<string, string> = {
  'pubspec.yaml': [
    'name: harbour',
    'description: A harbour logging app.',
    'version: 2.1.0+21',
    '',
    'environment:',
    '  sdk: ">=3.0.0 <4.0.0"',
    '',
    'dependencies:',
    '  flutter:',
    '    sdk: flutter',
    '  go_router: ^13.0.0',
    '  flutter_bloc: ^8.1.0',
    '  geolocator: ^11.0.0',
    '',
  ].join('\n'),

  'lib/main.dart': [
    "import 'package:flutter/material.dart';",
    '',
    'void main() => runApp(const HarbourApp());',
    '',
    'class HarbourApp extends StatelessWidget {',
    '  const HarbourApp({super.key});',
    '  @override',
    '  Widget build(BuildContext context) => const MaterialApp(home: Scaffold());',
    '}',
    '',
  ].join('\n'),

  'lib/screens/home_screen.dart': [
    "import 'package:flutter/material.dart';",
    '',
    'class HomeScreen extends StatelessWidget {',
    '  const HomeScreen({super.key});',
    '  @override',
    '  Widget build(BuildContext context) => Scaffold(body: Container());',
    '}',
    '',
  ].join('\n'),

  'lib/theme/app_theme.dart': [
    "import 'package:flutter/material.dart';",
    '',
    'final appTheme = ThemeData(useMaterial3: true);',
    '',
  ].join('\n'),

  'test/widget_test.dart': "void main() {}\n",

  'android/app/build.gradle': 'android { defaultConfig { applicationId "com.example.harbour" } }\n',
};
