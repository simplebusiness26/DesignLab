#!/usr/bin/env node
/**
 * DesignLab acceptance run.
 *
 * This is intentionally an operator-level test: it drives the built CLI, not
 * internal functions. Model work is replaced with the deterministic backend by
 * --dry-run. Tournament B is different by design: its challenger runtime is
 * model-agnostic, so acceptance validates its frozen inputs, order and packet
 * preparation directly.
 */

import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'designlab.js');
const KEEP = process.argv.includes('--keep');
const FROZEN_XPLORER = '78632b12eeb4e4123b1a767c8b815fe6617681f9';

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
  if (result.code !== 0) return { ...result, data: null };
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
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', rejectPromise);
    child.on('close', (code) =>
      code === 0
        ? resolvePromise(stdout.trim())
        : rejectPromise(new Error(`git ${args.join(' ')} failed: ${stderr.trim()}`)),
    );
  });
}

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
    "if (!existsSync('src/screens/HomeScreen.tsx')) process.exit(1);\n" +
    "console.log('typecheck ok');\n",
  'scripts/lint.js': "console.log('lint ok');\n",
  'scripts/test.js':
    "const { existsSync } = require('node:fs');\n" +
    "for (const f of ['src/api/client.ts','src/auth/session.ts','src/payments/checkout.ts']) if (!existsSync(f)) process.exit(1);\n" +
    "console.log('tests ok');\n",
  'src/api/client.ts':
    'import axios from "axios";\nexport const api = axios.create({ baseURL: "https://api.trailmark.example.com" });\n',
  'src/auth/session.ts':
    'export interface Session { token: string; expiresAt: number }\nexport const isValid = (s: Session | null) => s !== null && s.expiresAt > Date.now();\n',
  'src/payments/checkout.ts':
    'export const total = (items: Array<{ cents: number }>) => items.reduce((a,b) => a + b.cents, 0);\n',
  'db/migrations/001_init.sql': 'CREATE TABLE trails (id TEXT PRIMARY KEY, name TEXT NOT NULL);\n',
  'src/theme/theme.ts':
    'export const theme = { colors: { bg: "#fff", fg: "#111" }, spacing: { sm: 8, md: 16 }, radius: 8 };\n',
  'src/components/TrailCard.tsx':
    'import { View, Text } from "react-native";\nexport function TrailCard({ name }: { name: string }) { return <View><Text>{name}</Text></View>; }\n',
  'src/screens/HomeScreen.tsx':
    'import { ScrollView } from "react-native";\nimport { TrailCard } from "../components/TrailCard";\nexport function HomeScreen() { return <ScrollView><TrailCard name="Ridge Loop" /></ScrollView>; }\n',
  'src/screens/MapScreen.tsx':
    'import MapView from "react-native-maps";\nexport function MapScreen() { return <MapView style={{ flex: 1 }} />; }\n',
  'src/screens/ProfileScreen.tsx':
    'import { View, Text } from "react-native";\nexport function ProfileScreen() { return <View><Text>Profile</Text></View>; }\n',
  'src/screens/LoginScreen.tsx':
    'import { View, Text } from "react-native";\nexport function LoginScreen() { return <View><Text>Sign in</Text></View>; }\n',
  'src/navigation/RootNavigator.tsx':
    'import { createNativeStackNavigator } from "@react-navigation/native-stack";\n' +
    'import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";\n' +
    'const Stack=createNativeStackNavigator(); const Tabs=createBottomTabNavigator(); export function RootNavigator(){ return null; }\n',
  'src/state/store.ts':
    'import { create } from "zustand";\nexport const useStore = create(() => ({ trails: [] }));\n',
  '__tests__/checkout.test.ts':
    'import { total } from "../src/payments/checkout"; test("totals", () => { expect(total([{cents:100}])).toBe(100); });\n',
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

async function main() {
  process.stdout.write(`${BOLD}DesignLab acceptance run${RESET}\n`);

  // -----------------------------------------------------------------------
  // Tournament B: prove the new strict path before exercising legacy V1.
  // -----------------------------------------------------------------------
  heading('TOURNAMENT B — frozen inputs, order and model-agnostic packet');
  {
    const base = ['--cwd', ROOT, 'challenger'];
    const validated = await runJson([...base, 'validate']);
    check('Tournament B validation command succeeds', validated.code === 0 && validated.data !== null);
    check('frozen Xplorer commit is exact', validated.data?.sourceCommit === FROZEN_XPLORER);
    check('76 unique frozen routes are represented', validated.data?.routeCount === 76);
    check('all seven persona packs validate', validated.data?.personas?.length === 7);
    check('shared inputs have a stable SHA-256 fingerprint', /^[0-9a-f]{64}$/.test(validated.data?.sharedInputFingerprint ?? ''));

    const status = await runJson([...base, 'status']);
    check('Tournament B status command succeeds', status.code === 0 && status.data !== null);
    const challengers = status.data?.challengers ?? [];
    const next = challengers.filter((item) => item.status === 'next');
    const katieLocked = challengers.find((item) => item.slug === 'katie-dill')?.status === 'locked';
    if (katieLocked) {
      check('Katie remains locked once her validated result exists', challengers.find((item) => item.slug === 'katie-dill')?.status === 'locked');
      check('Alex is the only next challenger after Katie locks', next.length === 1 && next[0]?.slug === 'alex-schleifer');
      check('challengers after Alex remain blocked', challengers.slice(2).every((item) => item.status === 'blocked'));
    } else {
      check('Katie is the only next challenger before any result is locked', next.length === 1 && next[0]?.slug === 'katie-dill');
      check('later challengers are blocked', challengers.slice(1).every((item) => item.status === 'blocked'));
    }

    const katie = await runJson([...base, 'prepare', 'katie-dill']);
    check('Katie packet prepares without a model backend', katie.code === 0 && katie.data !== null);
    check('Katie is challenger 1', katie.data?.order === 1);
    check('Katie packet is frozen to the same Xplorer SHA', katie.data?.sourceCommit === FROZEN_XPLORER);
    check('Katie packet loads only her persona path', katie.data?.personaPath?.endsWith('/katie-dill/PERSONA_PACK.md'));
    check('packet requires whole-app prototype', katie.data?.requiredOutputs?.includes('prototype/index.html'));
    check('packet requires Product Truth and Perfect-10 proof',
      katie.data?.requiredOutputs?.includes('PRODUCT_TRUTH_CHECK.json') &&
      katie.data?.requiredOutputs?.includes('PERFECT_10.json'));

    const alexProgress = await run([...base, 'prepare', 'alex-schleifer', '--json']);
    if (katieLocked) {
      check('Alex can start after Katie is locked', alexProgress.code === 0);
    } else {
      check('Alex cannot start before Katie is locked', alexProgress.code !== 0 && alexProgress.stderr.includes('must be fully locked'));
    }
  }

  // -----------------------------------------------------------------------
  // Generic V1: prove the existing engine still works after the new runtime.
  // -----------------------------------------------------------------------
  const app = await createTargetRepo();
  const workspace = await mkdtemp(join(tmpdir(), 'designlab-acceptance-ws-'));
  const base = ['--cwd', workspace];
  const dry = [...base, '--dry-run'];

  process.stdout.write(`${DIM}fixture target: ${app.dir}${RESET}\n`);
  process.stdout.write(`${DIM}workspace:      ${workspace}${RESET}\n`);

  try {
    heading('DOCTOR — dry-run environment reflects the actual backend');
    {
      const result = await runJson([...dry, 'doctor']);
      check('doctor succeeds without Claude in dry-run', result.code === 0 && result.data !== null);
      const byName = new Map((result.data?.checks ?? []).map((item) => [item.name, item]));
      check('git supports worktrees', byName.get('git')?.status === 'ok');
      check('node version is sufficient', byName.get('node')?.status === 'ok');
      check('dry-run backend is recognised', (byName.get('agent backend')?.detail ?? '').includes('dry-run'));
      check('model roles remain configured',
        (byName.get('model roles')?.detail ?? '').includes('lead=fable') &&
        (byName.get('model roles')?.detail ?? '').includes('builder=sonnet') &&
        (byName.get('model roles')?.detail ?? '').includes('reviewer=opus'));
    }

    heading('INIT + INSPECT — product truth inputs are generated from code');
    {
      const init = await runJson([...base, 'init', '--repo', app.dir, '--branch', 'main']);
      check('init succeeds', init.code === 0 && init.data !== null);
      check('configuration is written', Boolean(init.data?.configPath));

      const inspect = await runJson([...dry, 'inspect', '--repo', app.dir, '--branch', 'main']);
      check('inspect succeeds', inspect.code === 0 && inspect.data !== null, inspect.stderr.slice(-250));
      const manifest = inspect.data?.manifest;
      check('fixture app is detected', manifest?.appName === 'TrailMark' && manifest?.framework === 'expo');
      check('inspection is pinned to the target commit', manifest?.sha === app.sha);
      check('screens and navigation are discovered', (manifest?.screens?.length ?? 0) >= 4 && manifest?.navigation?.library === 'react-navigation');
      check('auth/payments/location/api capabilities are detected',
        ['auth','payments','location','api'].every((key) => manifest?.capabilities?.some((capability) => capability.key === key && capability.present)));
    }

    heading('FUNCTIONALITY CONTRACT — designable and protected boundaries');
    {
      const protect = await runJson([
        ...base,
        'protect',
        '--repo', app.dir,
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
      check('protect succeeds', protect.code === 0 && protect.data !== null);
      const byPath = new Map((protect.data?.classifications ?? []).map((item) => [item.path, item.level]));
      check('backend/auth/payments/migrations are protected',
        ['src/api/client.ts','src/auth/session.ts','src/payments/checkout.ts','db/migrations/001_init.sql']
          .every((path) => byPath.get(path) === 'PROTECTED'));
      check('theme/components/screens are designable',
        ['src/theme/theme.ts','src/components/TrailCard.tsx','src/screens/HomeScreen.tsx']
          .every((path) => byPath.get(path) === 'DESIGNABLE'));
      check('package.json is restricted', byPath.get('package.json') === 'RESTRICTED');
    }

    heading('ROUND 1 — isolated deterministic candidate generation');
    let round1;
    {
      const result = await runJson([...dry, 'round', '--repo', app.dir, '--designs', '4', '--diversity', 'high']);
      check('round 1 succeeds', result.code === 0 && result.data !== null, result.stderr.slice(-350));
      round1 = result.data?.round;
      check('four candidates are produced', round1?.candidates?.length === 4);
      check('all candidates share the inspected base',
        round1?.baseSha === app.sha && (round1?.candidates ?? []).every((candidate) => candidate.baseSha === app.sha));
      check('current branch convention is design/r001-*',
        (round1?.candidates ?? []).every((candidate) => candidate.branch.startsWith('design/r001-')));
      check('candidate worktrees are isolated', new Set((round1?.candidates ?? []).map((candidate) => candidate.worktreePath)).size === 4);
      check('all candidates made real changes and passed required gates',
        (round1?.candidates ?? []).every((candidate) =>
          candidate.filesChanged > 0 && candidate.headSha && candidate.status === 'ready' &&
          ['typecheck','test','protection'].every((gate) => candidate.gates.some((entry) => entry.gate === gate && entry.status === 'passed'))));
      check('all candidates were reviewed', (round1?.candidates ?? []).every((candidate) => candidate.review?.verdict === 'accept'));
      check('dry-run does not claim APK builds', (round1?.candidates ?? []).every((candidate) => candidate.build?.status === 'BUILD_NOT_REQUESTED'));
    }

    heading('ISOLATION — source repository remains untouched');
    {
      check('target HEAD is unchanged', (await git(app.dir, ['rev-parse', 'HEAD'])) === app.sha);
      check('target working tree is clean', (await git(app.dir, ['status', '--porcelain'])) === '');
      const branches = await git(app.dir, ['branch', '--format=%(refname:short)']);
      check('target contains no DesignLab candidate branches', !branches.split('\n').some((branch) => branch.startsWith('design/')));
    }

    heading('BUILD WORKFLOW — current generated Android contract');
    {
      const result = await runJson([...base, 'workflow', '--repo', app.dir]);
      check('workflow planning succeeds', result.code === 0 && result.data !== null);
      const plan = result.data?.plan;
      const yaml = plan?.content ?? '';
      check('a debug workflow is generated', plan?.strategy === 'generated' && plan?.variant === 'debug');
      check('workflow triggers on current design branches', yaml.includes("'design/**'"));
      check('workflow builds a debug APK', yaml.includes('assembleDebug'));
      check('workflow uploads the APK artifact', yaml.includes('actions/upload-artifact@v4'));
      check('workflow derives TrailMark artifact names from the branch', yaml.includes('trailmark-') && yaml.includes('artifact_name'));
    }

    heading('STATUS — persisted rounds and usage are honest');
    {
      const result = await runJson([...base, 'status', '--repo', app.dir]);
      check('status succeeds', result.code === 0 && result.data !== null);
      check('manifest and contract are reported', result.data?.manifest?.sha === app.sha && result.data?.contract?.manifestSha === app.sha);
      check('round 1 is persisted', (result.data?.rounds ?? []).some((round) => round.round === 1));
      check('agent usage is recorded', (result.data?.usage?.totalCalls ?? 0) > 0);
      check('lead and builder usage are separated', Boolean(result.data?.usage?.byRole?.lead) && Boolean(result.data?.usage?.byRole?.builder));
      check('reviewer escalation was unnecessary', !result.data?.usage?.byRole?.reviewer);
    }

    heading('CHOOSE — winner, borrowings and next-generation parent are exact');
    let winner;
    {
      winner = round1?.candidates?.find((candidate) => candidate.slot === 'C');
      const result = await runJson([
        ...dry,
        'choose', '1', 'C',
        '--repo', app.dir,
        '--feedback', "C wins overall. Prefer A's map and B's profile.",
      ]);
      check('choose succeeds', result.code === 0 && result.data !== null);
      check('candidate C is recorded as winner', result.data?.winner === 'C' && result.data?.round?.status === 'chosen');
      check("A's map is parsed as a borrowing", result.data?.borrowings?.some((item) => item.slot === 'A' && item.subject === 'map'));
      check("B's profile is parsed as a borrowing", result.data?.borrowings?.some((item) => item.slot === 'B' && item.subject === 'profile'));
      check('next plan parents exactly on round 1 candidate C',
        result.data?.plan?.parentRound === 1 &&
        result.data?.plan?.parentSlot === 'C' &&
        result.data?.plan?.parentBranch === winner?.branch);
      check('at least one planned direction carries each requested sibling borrowing',
        result.data?.plan?.directions?.some((direction) => direction.borrowsFrom?.includes('A')) &&
        result.data?.plan?.directions?.some((direction) => direction.borrowsFrom?.includes('B')));
    }

    heading('ROUND 2 — evolution starts from the winner, not the original app');
    {
      const result = await runJson([...dry, 'round', '--repo', app.dir, '--designs', '4']);
      check('round 2 succeeds', result.code === 0 && result.data !== null, result.stderr.slice(-350));
      const round2 = result.data?.round;
      check('round 2 records the parent', round2?.parentRound === 1 && round2?.parentSlot === 'C');
      check('round 2 bases on winner commit', round2?.baseSha === winner?.headSha);
      check('every round 2 candidate starts from winner commit', (round2?.candidates ?? []).every((candidate) => candidate.baseSha === winner?.headSha));
      check('current round 2 branch convention is design/r002-*', (round2?.candidates ?? []).every((candidate) => candidate.branch.startsWith('design/r002-')));
      check('round 2 candidates pass their gates', (round2?.candidates ?? []).every((candidate) => candidate.status === 'ready'));
    }

    heading('REFERENCE CANDIDATE — external visual input uses the same gates');
    {
      const referenceDir = join(workspace, 'reference-mockups');
      await mkdir(referenceDir, { recursive: true });
      await writeFile(
        join(referenceDir, 'home.png'),
        Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52]),
      );
      const result = await runJson([
        ...dry,
        'round', '--repo', app.dir, '--designs', '3', '--reference', referenceDir,
      ]);
      check('reference round succeeds', result.code === 0 && result.data !== null, result.stderr.slice(-350));
      const reference = result.data?.round?.candidates?.find((candidate) => candidate.slot === 'A');
      check('slot A is the reference candidate', reference?.origin === 'REFERENCE_IMAGE');
      check('reference candidate passes the same gates', reference?.status === 'ready');
      const briefPath = join(
        workspace,
        '.designlab','state','projects', result.data?.round?.projectId ?? '',
        'rounds','r003','briefs','a.json',
      );
      const brief = JSON.parse(await readFile(briefPath, 'utf8'));
      check('reference image path is persisted in its brief', brief.referenceImages?.some((path) => path.endsWith('home.png')));
    }

    heading('MERGE CHECK — verifies, but never performs, the human merge');
    {
      const result = await runJson([...base, 'merge-check', '1', 'C', '--repo', app.dir]);
      check('merge-check succeeds', result.code === 0 && result.data !== null);
      check('winner is merge ready', result.data?.readiness?.ready === true);
      check('protection re-check passes', result.data?.readiness?.protection?.passed === true);
      check('conflict check is explicit and clean',
        result.data?.readiness?.conflicts?.checked === true && result.data?.readiness?.conflicts?.clean === true);
      check('merge remains a human action', result.data?.readiness?.instructions?.some((line) => line.includes('git merge --no-ff')));
      check('base branch is still untouched', (await git(app.dir, ['rev-parse', 'HEAD'])) === app.sha);
    }

    heading('PERSISTENCE — state survives separate CLI processes');
    {
      const result = await runJson([...base, 'status', '--repo', app.dir]);
      check('all three rounds persist', result.data?.rounds?.length === 3);
      check('round 1 winner persists', result.data?.rounds?.find((round) => round.round === 1)?.winner === 'C');
      const projectId = round1?.projectId;
      const brief = JSON.parse(await readFile(
        join(workspace,'.designlab','state','projects',projectId,'rounds','r001','briefs','c.json'),
        'utf8',
      ));
      check('candidate brief persists with full diversity vector', brief?.slot === 'C' && Object.keys(brief?.diversityVector ?? {}).length === 13);
      const lineage = JSON.parse(await readFile(
        join(workspace,'.designlab','state','projects',projectId,'lineage.json'),
        'utf8',
      ));
      check('winner lineage persists', lineage?.entries?.some((entry) => entry.round === 1 && entry.winner === 'C'));
    }
  } finally {
    if (KEEP) {
      process.stdout.write(`${DIM}kept target: ${app.dir}${RESET}\n`);
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
