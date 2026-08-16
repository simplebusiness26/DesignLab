#!/usr/bin/env node
/**
 * V1 acceptance run.
 *
 * Drives the real `designlab` CLI end to end against a safe fixture Android
 * application created in a temp directory. Every command is the one an
 * operator would type; nothing is stubbed except the model calls, which
 * `--dry-run` replaces with the deterministic runner.
 *
 *   INIT → INSPECT → MANIFEST → CONTRACT → ROUND → ISOLATED BRANCHES →
 *   BUILDERS → PROTECTION → TESTS → BUILD PIPELINE → STATUS →
 *   CHOOSE WINNER → NEXT-GENERATION PLAN → SECOND GENERATION
 *
 * Usage:  node scripts/acceptance.mjs [--keep]
 */

import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'designlab.js');
const KEEP = process.argv.includes('--keep');

const GREEN = '\u001b[32m';
const RED = '\u001b[31m';
const DIM = '\u001b[2m';
const BOLD = '\u001b[1m';
const RESET = '\u001b[0m';

let stepNumber = 0;
const failures = [];

function heading(title) {
  stepNumber += 1;
  process.stdout.write(`\n${BOLD}[${stepNumber}] ${title}${RESET}\n`);
}

function check(label, condition, detail = '') {
  if (condition) {
    process.stdout.write(`    ${GREEN}✓${RESET} ${label}\n`);
  } else {
    process.stdout.write(`    ${RED}✗ ${label}${RESET}${detail ? ` — ${detail}` : ''}\n`);
    failures.push(label);
  }
}

function run(args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: options.cwd ?? ROOT,
      env: { ...process.env, DESIGNLAB_NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', rejectPromise);
    child.on('close', (code) => resolvePromise({ code: code ?? 1, stdout, stderr }));
  });
}

async function runJson(args, options = {}) {
  const result = await run([...args, '--json'], options);
  if (result.code !== 0) {
    return { ...result, data: null };
  }
  try {
    return { ...result, data: JSON.parse(result.stdout) };
  } catch {
    return { ...result, data: null };
  }
}

function git(cwd, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('git', args, {
      cwd,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'DesignLab Acceptance',
        GIT_AUTHOR_EMAIL: 'acceptance@designlab.local',
        GIT_COMMITTER_NAME: 'DesignLab Acceptance',
        GIT_COMMITTER_EMAIL: 'acceptance@designlab.local',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.on('error', rejectPromise);
    child.on('close', (code) =>
      code === 0 ? resolvePromise(stdout.trim()) : rejectPromise(new Error(`git ${args.join(' ')} failed`)),
    );
  });
}

// ---------------------------------------------------------------------------
// Fixture target application
// ---------------------------------------------------------------------------

const APP_FILES = {
  'package.json': JSON.stringify(
    {
      name: 'trailmark',
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
        axios: '^1.7.0',
        zustand: '^4.5.0',
      },
      devDependencies: { typescript: '^5.4.0', jest: '^29.7.0' },
    },
    null,
    2,
  ),
  'app.json': JSON.stringify(
    { expo: { name: 'TrailMark', slug: 'trailmark', android: { package: 'com.example.trailmark' } } },
    null,
    2,
  ),
  'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }, null, 2),

  'scripts/typecheck.js':
    "const { existsSync } = require('node:fs');\n" +
    "if (!existsSync('src/screens/HomeScreen.tsx')) { console.error('HomeScreen missing'); process.exit(1); }\n" +
    "console.log('typecheck ok');\n",
  'scripts/lint.js': "console.log('lint ok');\n",
  'scripts/test.js':
    "const { existsSync } = require('node:fs');\n" +
    "for (const f of ['src/api/client.ts', 'src/auth/session.ts', 'src/payments/checkout.ts']) {\n" +
    "  if (!existsSync(f)) { console.error('missing required module: ' + f); process.exit(1); }\n" +
    '}\n' +
    "console.log('4 tests passed');\n",

  'src/api/client.ts':
    'import axios from "axios";\nexport const api = axios.create({ baseURL: "https://api.trailmark.example.com" });\n',
  'src/auth/session.ts':
    'export interface Session { token: string; expiresAt: number }\n' +
    'export const isValid = (s: Session | null) => s !== null && s.expiresAt > Date.now();\n',
  'src/payments/checkout.ts':
    'export const total = (items: Array<{ cents: number }>) => items.reduce((a, b) => a + b.cents, 0);\n',
  'db/migrations/001_init.sql': 'CREATE TABLE trails (id TEXT PRIMARY KEY, name TEXT NOT NULL);\n',

  'src/theme/theme.ts':
    'export const theme = { colors: { bg: "#fff", fg: "#111" }, spacing: { sm: 8, md: 16 }, radius: 8 };\n',
  'src/theme/typography.ts':
    'export const typography = { title: { fontSize: 22 }, body: { fontSize: 15 } };\n',
  'src/components/TrailCard.tsx':
    'import { View, Text } from "react-native";\nexport function TrailCard({ name }: { name: string }) {\n  return (<View><Text>{name}</Text></View>);\n}\n',
  'src/screens/HomeScreen.tsx':
    'import { ScrollView } from "react-native";\nimport { TrailCard } from "../components/TrailCard";\nexport function HomeScreen() {\n  return (<ScrollView><TrailCard name="Ridge Loop" /></ScrollView>);\n}\n',
  'src/screens/MapScreen.tsx':
    'import MapView from "react-native-maps";\nexport function MapScreen() { return <MapView style={{ flex: 1 }} />; }\n',
  'src/screens/ProfileScreen.tsx':
    'import { View, Text } from "react-native";\nexport function ProfileScreen() { return (<View><Text>Profile</Text></View>); }\n',
  'src/screens/LoginScreen.tsx':
    'import { View, Text } from "react-native";\nexport function LoginScreen() { return (<View><Text>Sign in</Text></View>); }\n',
  'src/navigation/RootNavigator.tsx':
    'import { createNativeStackNavigator } from "@react-navigation/native-stack";\n' +
    'import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";\n' +
    'const Stack = createNativeStackNavigator();\nconst Tabs = createBottomTabNavigator();\n' +
    'export function RootNavigator() { return null; }\n',
  'src/state/store.ts': 'import { create } from "zustand";\nexport const useStore = create(() => ({ trails: [] }));\n',
  '__tests__/checkout.test.ts':
    'import { total } from "../src/payments/checkout";\ntest("totals", () => { expect(total([{ cents: 100 }])).toBe(100); });\n',
  'android/app/build.gradle':
    'android {\n  defaultConfig {\n    applicationId "com.example.trailmark"\n    minSdkVersion 24\n  }\n}\n',
  'android/app/src/main/AndroidManifest.xml':
    '<manifest package="com.example.trailmark" xmlns:android="http://schemas.android.com/apk/res/android">\n' +
    '  <uses-permission android:name="android.permission.INTERNET" />\n' +
    '  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n' +
    '</manifest>\n',
  'android/gradlew': '#!/bin/sh\necho gradle\n',
  'README.md': '# TrailMark\n\nA trail logging app.\n',
};

async function createTargetRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'designlab-acceptance-app-'));
  for (const [path, contents] of Object.entries(APP_FILES)) {
    const full = join(dir, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, contents, 'utf8');
  }
  await git(dir, ['init', '--quiet', '--initial-branch=main']);
  await git(dir, ['config', 'user.name', 'DesignLab Acceptance']);
  await git(dir, ['config', 'user.email', 'acceptance@designlab.local']);
  await git(dir, ['config', 'commit.gpgsign', 'false']);
  await git(dir, ['add', '-A']);
  await git(dir, ['commit', '--quiet', '--no-verify', '-m', 'Initial import']);
  return { dir, sha: await git(dir, ['rev-parse', 'HEAD']) };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

async function main() {
  process.stdout.write(`${BOLD}DesignLab V1 acceptance run${RESET}\n`);
  process.stdout.write(`${DIM}Everything below runs the real CLI against a temporary fixture app.${RESET}\n`);

  const app = await createTargetRepo();
  const workspace = await mkdtemp(join(tmpdir(), 'designlab-acceptance-ws-'));
  process.stdout.write(`${DIM}target:    ${app.dir}${RESET}\n`);
  process.stdout.write(`${DIM}workspace: ${workspace}${RESET}\n`);

  const base = ['--cwd', workspace];
  const dry = [...base, '--dry-run'];

  try {
    // ---- 1. DOCTOR -------------------------------------------------------
    heading('DOCTOR — environment check');
    {
      // Acceptance deliberately replaces all model calls with the deterministic
      // backend. Doctor must inspect that same dry-run environment, otherwise a
      // CI runner with no Claude binary fails before the test has even begun.
      const { data, code } = await runJson([...dry, 'doctor']);
      check('doctor ran', data !== null, `exit ${code}`);
      const byName = new Map((data?.checks ?? []).map((c) => [c.name, c]));
      check('git is present and supports worktrees', byName.get('git')?.status === 'ok');
      check('node version is sufficient', byName.get('node')?.status === 'ok');
      check(
        'model roles are configured (fable / sonnet / opus)',
        (byName.get('model roles')?.detail ?? '').includes('lead=fable') &&
          (byName.get('model roles')?.detail ?? '').includes('builder=sonnet') &&
          (byName.get('model roles')?.detail ?? '').includes('reviewer=opus'),
      );
      check(
        'dry-run agent backend is recognised',
        (byName.get('agent backend')?.detail ?? '').includes('dry-run'),
      );
    }

    // ---- 2. INIT ---------------------------------------------------------
    heading('INIT — create the workspace');
    {
      const { data, code } = await runJson([...base, 'init', '--repo', app.dir, '--branch', 'main']);
      check('init succeeded', code === 0 && data !== null);
      check('config file written', Boolean(data?.configPath));
      check('JSON schemas emitted', (data?.schemasWritten?.length ?? 0) >= 8);
    }

    // ---- 3. INSPECT ------------------------------------------------------
    heading('INSPECT — analyse the target and build the manifest + contract');
    let manifest;
    {
      const { data, code, stderr } = await runJson([...dry, 'inspect', '--repo', app.dir, '--branch', 'main']);
      check('inspect succeeded', code === 0 && data !== null, stderr.slice(-300));
      manifest = data?.manifest;

      check('app name detected', manifest?.appName === 'TrailMark', manifest?.appName);
      check('framework detected as expo', manifest?.framework === 'expo', manifest?.framework);
      check('android build system detected as gradle', manifest?.androidBuildSystem === 'gradle');
      check('android package id detected', manifest?.androidPackageId === 'com.example.trailmark');
      check('manifest is keyed to the inspected commit', manifest?.sha === app.sha);
      check('screens discovered', (manifest?.screens?.length ?? 0) >= 4, `${manifest?.screens?.length}`);
      check('navigation library detected', manifest?.navigation?.library === 'react-navigation');
      check('state management detected', (manifest?.stateManagement ?? []).includes('zustand'));

      const present = new Set(
        (manifest?.capabilities ?? []).filter((c) => c.present).map((c) => c.key),
      );
      check('auth capability detected', present.has('auth'));
      check('payments capability detected', present.has('payments'));
      check('location capability detected', present.has('location'));
      check('api capability detected', present.has('api'));

      check('typecheck command detected', manifest?.commands?.typecheck === 'npm run typecheck');
      check('test command detected', manifest?.commands?.test === 'npm run test');
      check('human-readable analysis written', Boolean(data?.analysisPath));
    }

    // ---- 4. FUNCTIONALITY CONTRACT --------------------------------------
    heading('FUNCTIONALITY CONTRACT — verify the frozen/flexible boundary');
    {
      const { data, code } = await runJson([
        ...base,
        'protect',
        '--repo',
        app.dir,
        '--path',
        'src/api/client.ts',
        'src/auth/session.ts',
        'src/payments/checkout.ts',
        'db/migrations/001_init.sql',
        'src/theme/theme.ts',
        'src/components/TrailCard.tsx',
        'src/screens/HomeScreen.tsx',
        'package.json',
      ]);
      check('protect succeeded', code === 0 && data !== null);

      const byPath = new Map((data?.classifications ?? []).map((c) => [c.path, c.level]));
      check('api client is PROTECTED', byPath.get('src/api/client.ts') === 'PROTECTED');
      check('auth session is PROTECTED', byPath.get('src/auth/session.ts') === 'PROTECTED');
      check('payments are PROTECTED', byPath.get('src/payments/checkout.ts') === 'PROTECTED');
      check('migrations are PROTECTED', byPath.get('db/migrations/001_init.sql') === 'PROTECTED');
      check('theme is DESIGNABLE', byPath.get('src/theme/theme.ts') === 'DESIGNABLE');
      check('components are DESIGNABLE', byPath.get('src/components/TrailCard.tsx') === 'DESIGNABLE');
      check('screens are DESIGNABLE', byPath.get('src/screens/HomeScreen.tsx') === 'DESIGNABLE');
      check('package.json is RESTRICTED', byPath.get('package.json') === 'RESTRICTED');

      const invariants = (data?.contract?.invariants ?? []).map((i) => i.id);
      check('auth invariant recorded', invariants.includes('auth-boundary'));
      check('payment invariant recorded', invariants.includes('payment-amounts'));
      check('no-test-weakening invariant recorded', invariants.includes('no-test-weakening'));
    }

    // ---- 5. ROUND --------------------------------------------------------
    heading('ROUND 1 — briefs, isolation, builders, gates, review');
    let round1;
    {
      const { data, code, stderr } = await runJson([
        ...dry,
        'round',
        '--repo',
        app.dir,
        '--designs',
        '4',
        '--diversity',
        'high',
      ]);
      check('round succeeded', code === 0 && data !== null, stderr.slice(-400));
      round1 = data?.round;

      check('four candidates produced', round1?.candidates?.length === 4);
      check(
        'all candidates share one base commit',
        new Set((round1?.candidates ?? []).map((c) => c.baseSha)).size === 1,
      );
      check('base commit is the inspected commit', round1?.baseSha === app.sha);
      check(
        'branch naming follows the convention',
        (round1?.candidates ?? []).every((c) => c.branch.startsWith('designlab/r001-')),
      );
      check(
        'each candidate has its own worktree',
        new Set((round1?.candidates ?? []).map((c) => c.worktreePath)).size === 4,
      );
      check('diversity was scored', typeof round1?.diversityScore === 'number');
      check('diversity met the target', data?.belowDiversityTarget === false);
      check(
        'typecheck actually ran for every candidate',
        (round1?.candidates ?? []).every((c) =>
          c.gates.some((g) => g.gate === 'typecheck' && g.status === 'passed' && g.exitCode === 0),
        ),
      );
      check(
        'tests actually ran for every candidate',
        (round1?.candidates ?? []).every((c) =>
          c.gates.some((g) => g.gate === 'test' && g.status === 'passed' && g.exitCode === 0),
        ),
      );
      check(
        'protection gate ran against a real diff for every candidate',
        (round1?.candidates ?? []).every((c) =>
          c.gates.some((g) => g.gate === 'protection' && g.status === 'passed') &&
          c.protection?.headSha &&
          c.protection?.baseSha,
        ),
      );
      check(
        'every candidate produced real changes',
        (round1?.candidates ?? []).every((c) => c.filesChanged > 0 && c.headSha),
      );
      check(
        'every candidate was reviewed',
        (round1?.candidates ?? []).every((c) => c.review?.verdict === 'accept'),
      );
      check(
        'every candidate reached a ready state',
        (round1?.candidates ?? []).every((c) => c.status === 'ready'),
      );
      check(
        'no APK is claimed, because nothing was pushed',
        (round1?.candidates ?? []).every((c) => c.build?.status === 'BUILD_NOT_REQUESTED'),
      );
    }

    // ---- 6. ISOLATION ----------------------------------------------------
    heading('ISOLATION — verify the target repository was not harmed');
    {
      check('target repo HEAD is unchanged', (await git(app.dir, ['rev-parse', 'HEAD'])) === app.sha);
      check('target repo working tree is clean', (await git(app.dir, ['status', '--porcelain'])) === '');
      const branches = await git(app.dir, ['branch', '--format=%(refname:short)']);
      check('target repo has no design branches', !branches.split('\n').some((b) => b.startsWith('designlab/')));
    }

    // ---- 7. BUILD PIPELINE -----------------------------------------------
    heading('BUILD PIPELINE — Actions workflow for APK per branch');
    {
      const { data, code } = await runJson([...base, 'workflow', '--repo', app.dir]);
      check('workflow planning succeeded', code === 0 && data !== null);
      check('a workflow was generated', data?.plan?.strategy === 'generated');
      const yaml = data?.plan?.yaml ?? '';
      check('workflow triggers on design branches', yaml.includes('designlab/**'));
      check('workflow builds a DEBUG APK by default — the variant that installs on a device', yaml.includes('assembleDebug'));
      check('workflow records its variant', data?.plan?.variant === 'debug');
      check('workflow uploads an artifact', yaml.includes('actions/upload-artifact'));
      check('artifact naming derives from the app slug', data?.plan?.artifactPattern?.includes('trailmark'));
      check('installability of the debug variant is stated', data?.plan?.installability === 'DEVICE_INSTALLABLE');
    }

    // ---- 8. STATUS -------------------------------------------------------
    heading('STATUS — reported state');
    {
      const { data, code } = await runJson([...base, 'status', '--repo', app.dir]);
      check('status succeeded', code === 0 && data !== null);
      check('manifest is reported', data?.manifest?.sha === app.sha);
      check('contract is reported', data?.contract?.manifestSha === app.sha);
      check('round 1 is listed', (data?.rounds ?? []).some((r) => r.round === 1));
      check('usage was recorded', (data?.usage?.total?.requests ?? 0) > 0);
      check('usage is broken down by role', Object.keys(data?.usage?.byRole ?? {}).length >= 2);
      check('lead and builder roles both appear', Boolean(data?.usage?.byRole?.lead) && Boolean(data?.usage?.byRole?.builder));
      check('the escalation reviewer was NOT invoked (nothing failed)', !data?.usage?.byRole?.reviewer);
    }

    // ---- 9. CHOOSE -------------------------------------------------------
    heading('CHOOSE — record a winner and plan the next generation');
    {
      const { data, code } = await runJson([
        ...dry,
        'choose',
        '1',
        'C',
        '--repo',
        app.dir,
        '--feedback',
        "C wins overall. Prefer A's map and B's profile.",
      ]);
      check('choose succeeded', code === 0 && data !== null);
      check('winner recorded', data?.round?.winner === 'C');
      check('round marked as chosen', data?.round?.status === 'chosen');
      check('feedback stored', data?.round?.feedback?.includes("A's map"));
      check('borrowing parsed: A\'s map', data?.plan?.borrows?.some((b) => b.fromSlot === 'A' && b.element === 'map'));
      check('borrowing parsed: B\'s profile', data?.plan?.borrows?.some((b) => b.fromSlot === 'B' && b.element === 'profile'));
      check('next-generation plan produced', Boolean(data?.plan));
      check('plan targets round 2', data?.plan?.round === 2);
      check('plan parents on round 1 candidate C', data?.plan?.baseRound === 1 && data?.plan?.baseSlot === 'C');
      check('plan bases on the winner\'s branch, not the original base', data?.plan?.baseBranch === round1?.candidates?.find((c) => c.slot === 'C')?.branch);
      check('plan proposes directions', (data?.plan?.directions?.length ?? 0) > 0);
    }

    // ---- 10. ROUND 2 -----------------------------------------------------
    heading('ROUND 2 — evolution from the winner');
    let round2;
    {
      const { data, code, stderr } = await runJson([...dry, 'round', '--repo', app.dir, '--designs', '4']);
      check('round 2 succeeded', code === 0 && data !== null, stderr.slice(-400));
      round2 = data?.round;
      const winner = round1?.candidates?.find((c) => c.slot === 'C');
      check('round 2 recorded', round2?.round === 2);
      check('round 2 parents on round 1 candidate C', round2?.parentRound === 1 && round2?.parentSlot === 'C');
      check('round 2 bases on the winner\'s commit, so design work compounds', round2?.baseSha === winner?.headSha);
      check('round 2 candidates all start from the winner', (round2?.candidates ?? []).every((c) => c.baseSha === winner?.headSha));
      check('round 2 branches use the r002 prefix', (round2?.candidates ?? []).every((c) => c.branch.startsWith('designlab/r002-')));
      check('round 2 candidates passed their gates', (round2?.candidates ?? []).every((c) => c.status === 'ready'));
    }

    // ---- 11. REFERENCE CANDIDATE ----------------------------------------
    heading('ROUND 3 — reference-image candidate alongside explorations');
    let round3;
    {
      const referenceDir = join(workspace, 'reference-mockups');
      await mkdir(referenceDir, { recursive: true });
      // A real PNG header plus arbitrary body is sufficient — DesignLab does not
      // decode the image, it identifies format from the signature and gives the
      // absolute path to the model so the model can use its Read tool.
      const tinyPng = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52,
      ]);
      await writeFile(join(referenceDir, 'home.png'), tinyPng);
      await writeFile(join(referenceDir, 'notes.txt'), 'not an image');

      const { data, code, stderr } = await runJson([
        ...dry,
        'round',
        '--repo',
        app.dir,
        '--designs',
        '3',
        '--reference',
        referenceDir,
      ]);
      check('reference round succeeded', code === 0 && data !== null, stderr.slice(-400));
      round3 = data?.round;
      check('reference adds one candidate on top of the explorations', round3?.candidates?.length === 4);
      const referenceCandidate = round3?.candidates?.find((c) => c.slot === 'A');
      check('slot A is the reference candidate', referenceCandidate?.origin === 'REFERENCE_IMAGE');
      check('reference origin recorded', referenceCandidate?.origin === 'REFERENCE_IMAGE');
      check(
        'exploration origins recorded',
        (round3?.candidates ?? []).filter((c) => c.slot !== 'A').every((c) => c.origin === 'FABLE_EXPLORATION'),
      );
      const referenceBriefPath = join(workspace, '.designlab', 'state', 'projects', round3?.projectId ?? '', 'rounds', 'r003', 'briefs', 'a.json');
      const referenceBrief = JSON.parse(await readFile(referenceBriefPath, 'utf8'));
      check('reference brief carries the image paths', referenceBrief.referenceImages?.some((p) => p.endsWith('home.png')));
      check('reference candidate went through the same gates', referenceCandidate?.status === 'ready');
    }

    // ---- 12. MERGE-CHECK -------------------------------------------------
    heading('MERGE-CHECK — winner is verifiably mergeable, and merging stays human');
    {
      const { data, code } = await runJson([...base, 'merge-check', '1', 'C', '--repo', app.dir]);
      check('merge-check ran', code === 0 && data !== null);
      check('winner branch is MERGE_READY', data?.readiness?.status === 'MERGE_READY');
      check('conflict check ran clean', data?.readiness?.conflicts?.length === 0);
      check('merge instructions are for a human, not executed', data?.readiness?.instructions?.some((line) => line.includes('git merge')));
      check('base branch untouched by merge-check', (await git(app.dir, ['rev-parse', 'HEAD'])) === app.sha);
    }

    // ---- 13. PERSISTENCE -------------------------------------------------
    heading('PERSISTENCE — everything survives a restart');
    {
      const { data } = await runJson([...base, 'status', '--repo', app.dir]);
      check('all three rounds persisted', (data?.rounds ?? []).length === 3);
      check('winner persisted on round 1', data?.rounds?.find((r) => r.round === 1)?.winner === 'C');
      const projectId = round1?.projectId;
      const brief = JSON.parse(
        await readFile(join(workspace, '.designlab', 'state', 'projects', projectId, 'rounds', 'r001', 'briefs', 'c.json'), 'utf8'),
      );
      check('design briefs persisted', brief?.slot === 'C');
      check('brief carries a full diversity vector', Object.keys(brief?.diversityVector ?? {}).length === 13);
      const lineage = JSON.parse(
        await readFile(join(workspace, '.designlab', 'state', 'projects', projectId, 'lineage.json'), 'utf8'),
      );
      check('lineage persisted', (lineage?.entries ?? []).some((entry) => entry.round === 1 && entry.winner === 'C'));
    }
  } finally {
    if (KEEP) {
      process.stdout.write(`\n${DIM}kept target: ${app.dir}${RESET}\n`);
      process.stdout.write(`${DIM}kept workspace: ${workspace}${RESET}\n`);
    } else {
      await rm(app.dir, { recursive: true, force: true });
      await rm(workspace, { recursive: true, force: true });
    }
  }

  process.stdout.write(`\n${DIM}${'─'.repeat(70)}${RESET}\n`);
  if (failures.length > 0) {
    process.stdout.write(`${RED}${BOLD}ACCEPTANCE FAILED${RESET} — ${failures.length} check(s):\n`);
    for (const failure of failures) process.stdout.write(`  ${RED}✗${RESET} ${failure}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`${GREEN}${BOLD}ACCEPTANCE PASSED${RESET}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${RED}acceptance crashed: ${error?.stack || error}${RESET}\n`);
  process.exitCode = 1;
});
