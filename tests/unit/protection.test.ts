import { describe, expect, it } from 'vitest';

import { defaultConfig } from '../../src/config/config.js';
import { ProtectionChecker, formatProtectionReport } from '../../src/protection/checker.js';
import { buildContract, BUILTIN_RULES } from '../../src/protection/contract.js';
import type { ChangedFile } from '../../src/git/git-client.js';
import type { AppManifest, FunctionalityContract } from '../../src/core/schemas.js';

function manifest(overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    schemaVersion: 1,
    projectId: 'test-app-000000',
    repoUrl: 'https://github.com/test/app',
    branch: 'main',
    sha: 'a'.repeat(40),
    generatedAt: new Date().toISOString(),
    appName: 'Test App',
    appSlug: 'test-app',
    framework: 'expo',
    frameworkVersion: '51.0.0',
    languages: ['TypeScript'],
    packageManager: 'npm',
    androidBuildSystem: 'expo-prebuild',
    androidPackageId: 'com.test.app',
    minSdkVersion: 24,
    sourceRoots: ['src'],
    screens: [],
    navigation: { library: 'react-navigation', pattern: 'stack', paths: [] },
    components: [],
    designSystem: { present: true, themePaths: ['src/theme/theme.ts'], tokens: [], stylingApproach: 'StyleSheet' },
    stateManagement: ['zustand'],
    capabilities: [],
    permissions: [],
    nativeModules: [],
    apis: [],
    backends: [],
    testing: { frameworks: ['jest'], testPaths: [], hasTests: true },
    commands: {
      install: 'npm ci',
      typecheck: 'npm run typecheck',
      lint: 'npm run lint',
      test: 'npm run test',
      build: null,
      androidBuild: null,
    },
    ci: { hasWorkflows: false, workflowPaths: [], buildsAndroid: false, androidWorkflowPath: null },
    fileCount: 100,
    truncated: false,
    analysisMode: 'deterministic',
    notes: [],
    ...overrides,
  };
}

function capability(key: string, paths: string[] = []): AppManifest['capabilities'][number] {
  return { key, present: true, evidence: [`dependency: ${key}`], paths, notes: '' };
}

function change(path: string, changeType: ChangedFile['changeType'] = 'modified'): ChangedFile {
  return { path, previousPath: null, changeType, additions: 5, deletions: 2, binary: false };
}

function checkerFor(contract: FunctionalityContract, config = defaultConfig().protection): ProtectionChecker {
  return new ProtectionChecker(contract, config);
}

describe('buildContract', () => {
  it('always includes the universal built-in rules', () => {
    const contract = buildContract({ manifest: manifest(), config: defaultConfig().protection });
    const patterns = contract.rules.map((rule) => rule.pattern);
    expect(patterns).toContain('**/migrations/**');
    expect(patterns).toContain('.github/workflows/**');
    expect(contract.rules.length).toBeGreaterThanOrEqual(BUILTIN_RULES.length);
  });

  it('adds capability rules only for capabilities that are actually present', () => {
    const withPayments = buildContract({
      manifest: manifest({ capabilities: [capability('payments')] }),
      config: defaultConfig().protection,
    });
    const withoutPayments = buildContract({
      manifest: manifest({ capabilities: [{ ...capability('payments'), present: false, evidence: [] }] }),
      config: defaultConfig().protection,
    });

    const hasPaymentRule = (contract: FunctionalityContract): boolean =>
      contract.rules.some((rule) => rule.pattern.includes('payment'));

    expect(hasPaymentRule(withPayments)).toBe(true);
    expect(hasPaymentRule(withoutPayments)).toBe(false);
  });

  it('protects the concrete evidence paths for high-risk capabilities', () => {
    const contract = buildContract({
      manifest: manifest({ capabilities: [capability('payments', ['src/checkout/total.ts'])] }),
      config: defaultConfig().protection,
    });
    const rule = contract.rules.find((entry) => entry.pattern === 'src/checkout/total.ts');
    expect(rule?.level).toBe('PROTECTED');
  });

  it('derives invariants from the capabilities present', () => {
    const contract = buildContract({
      manifest: manifest({ capabilities: [capability('auth'), capability('payments')] }),
      config: defaultConfig().protection,
    });
    const ids = contract.invariants.map((invariant) => invariant.id);
    expect(ids).toContain('auth-boundary');
    expect(ids).toContain('payment-amounts');
    expect(ids).toContain('no-test-weakening');
  });

  it('lets user rules win over built-ins for the same path', () => {
    const contract = buildContract({
      manifest: manifest(),
      config: {
        ...defaultConfig().protection,
        rules: [{ pattern: 'src/theme/**', level: 'PROTECTED', reason: 'this project ships a locked design system' }],
      },
    });

    expect(checkerFor(contract).classify('src/theme/theme.ts').level).toBe('PROTECTED');
  });

  it('accepts an agent proposal only when it tightens the contract', () => {
    const contract = buildContract({
      manifest: manifest(),
      config: defaultConfig().protection,
      proposal: {
        rules: [
          { pattern: 'src/pricing/**', level: 'PROTECTED', reason: 'pricing rules' },
          // A loosening attempt: must be ignored.
          { pattern: '**/migrations/**', level: 'DESIGNABLE', reason: 'looks harmless to me' },
        ],
        invariants: [],
        notes: [],
      },
    });

    const checker = checkerFor(contract);
    expect(checker.classify('src/pricing/rules.ts').level).toBe('PROTECTED');
    expect(checker.classify('db/migrations/001.sql').level).toBe('PROTECTED');
    expect(contract.notes.join(' ')).toContain('may only tighten');
  });
});

describe('ProtectionChecker.classify', () => {
  const contract = buildContract({
    manifest: manifest({ capabilities: [capability('auth'), capability('payments'), capability('api')] }),
    config: defaultConfig().protection,
  });
  const checker = checkerFor(contract);

  it('classifies protected surfaces as PROTECTED', () => {
    expect(checker.classify('db/migrations/001_initial.sql').level).toBe('PROTECTED');
    expect(checker.classify('src/auth/session.ts').level).toBe('PROTECTED');
    expect(checker.classify('src/api/client.ts').level).toBe('PROTECTED');
    expect(checker.classify('src/payments/checkout.ts').level).toBe('PROTECTED');
    expect(checker.classify('.github/workflows/ci.yml').level).toBe('PROTECTED');
    expect(checker.classify('android/app/src/main/AndroidManifest.xml').level).toBe('PROTECTED');
  });

  it('classifies design surfaces as DESIGNABLE', () => {
    expect(checker.classify('src/theme/theme.ts').level).toBe('DESIGNABLE');
    expect(checker.classify('src/components/NoteCard.tsx').level).toBe('DESIGNABLE');
    expect(checker.classify('src/screens/HomeScreen.tsx').level).toBe('DESIGNABLE');
    expect(checker.classify('assets/icon.png').level).toBe('DESIGNABLE');
  });

  it('classifies negotiable surfaces as RESTRICTED', () => {
    expect(checker.classify('package.json').level).toBe('RESTRICTED');
    expect(checker.classify('__tests__/checkout.test.ts').level).toBe('RESTRICTED');
    expect(checker.classify('android/app/build.gradle').level).toBe('RESTRICTED');
  });

  it('falls back to UNKNOWN for paths no rule covers', () => {
    expect(checker.classify('scratch/notes.txt').level).toBe('UNKNOWN');
  });

  it('prefers the more specific rule when two match', () => {
    // "src/screens/**" is DESIGNABLE, but an auth screen is RESTRICTED.
    expect(checker.classify('src/screens/HomeScreen.tsx').level).toBe('DESIGNABLE');
    expect(checker.classify('src/login/LoginForm.tsx').level).toBe('RESTRICTED');
  });
});

describe('ProtectionChecker.evaluate', () => {
  const contract = buildContract({
    manifest: manifest({ capabilities: [capability('auth'), capability('payments')] }),
    config: defaultConfig().protection,
  });

  it('passes a purely presentational change set', () => {
    const report = checkerFor(contract).evaluate(
      [change('src/theme/theme.ts'), change('src/components/NoteCard.tsx'), change('src/screens/HomeScreen.tsx')],
      'a'.repeat(40),
      'b'.repeat(40),
    );
    expect(report.passed).toBe(true);
    expect(report.violations).toHaveLength(0);
    expect(report.filesChanged).toBe(3);
  });

  it('fails a change set that touches a protected path', () => {
    const report = checkerFor(contract).evaluate(
      [change('src/theme/theme.ts'), change('src/auth/session.ts')],
      'a'.repeat(40),
      'b'.repeat(40),
    );
    expect(report.passed).toBe(false);
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]?.path).toBe('src/auth/session.ts');
    expect(report.violations[0]?.level).toBe('PROTECTED');
  });

  it('cannot be bypassed by renaming a protected file', () => {
    const renamed: ChangedFile = {
      path: 'src/theme/session.ts',
      previousPath: 'src/auth/session.ts',
      changeType: 'renamed',
      additions: 0,
      deletions: 0,
      binary: false,
    };
    const report = checkerFor(contract).evaluate([renamed], 'a'.repeat(40), 'b'.repeat(40));
    expect(report.passed).toBe(false);
    expect(report.violations[0]?.path).toBe('src/auth/session.ts');
  });

  it('catches deletion of a protected file', () => {
    const report = checkerFor(contract).evaluate(
      [change('db/migrations/001.sql', 'deleted')],
      'a'.repeat(40),
      'b'.repeat(40),
    );
    expect(report.passed).toBe(false);
    expect(report.violations[0]?.changeType).toBe('deleted');
  });

  it('honours failOnRestricted', () => {
    const changes = [change('package.json')];
    const strict = checkerFor(contract, { ...defaultConfig().protection, failOnRestricted: true });
    const lenient = checkerFor(contract, { ...defaultConfig().protection, failOnRestricted: false });

    expect(strict.evaluate(changes, 'a'.repeat(40), 'b'.repeat(40)).passed).toBe(false);
    expect(lenient.evaluate(changes, 'a'.repeat(40), 'b'.repeat(40)).passed).toBe(true);
  });

  it('records unknown paths but only fails when configured to', () => {
    const changes = [change('scratch/notes.txt')];
    const lenient = checkerFor(contract).evaluate(changes, 'a'.repeat(40), 'b'.repeat(40));
    expect(lenient.passed).toBe(true);
    expect(lenient.unknownPaths).toContain('scratch/notes.txt');

    const strict = checkerFor(contract, {
      ...defaultConfig().protection,
      failOnUnknown: true,
    }).evaluate(changes, 'a'.repeat(40), 'b'.repeat(40));
    expect(strict.passed).toBe(false);
  });

  it('waives a protected path covered by an approved exception, and records the waiver', () => {
    const withException = buildContract({
      manifest: manifest({ capabilities: [capability('auth')] }),
      config: {
        ...defaultConfig().protection,
        approvedExceptions: [{ pattern: 'src/auth/LoginCopy.ts', reason: 'presentation copy only' }],
      },
    });

    const report = checkerFor(withException, {
      ...defaultConfig().protection,
      approvedExceptions: [{ pattern: 'src/auth/LoginCopy.ts', reason: 'presentation copy only' }],
    }).evaluate([change('src/auth/LoginCopy.ts')], 'a'.repeat(40), 'b'.repeat(40));

    expect(report.passed).toBe(true);
    expect(report.waived[0]?.reason).toBe('presentation copy only');
  });

  it('fails a runaway change set even when every path is designable', () => {
    const changes = Array.from({ length: 12 }, (_, index) => change(`src/theme/file-${index}.ts`));
    const report = checkerFor(contract, { ...defaultConfig().protection, maxChangedFiles: 10 }).evaluate(
      changes,
      'a'.repeat(40),
      'b'.repeat(40),
    );
    expect(report.passed).toBe(false);
    expect(report.violations.some((violation) => violation.rule === 'maxChangedFiles')).toBe(true);
  });
});

describe('formatProtectionReport', () => {
  it('explains a failure in terms of the rule and the reason', () => {
    const contract = buildContract({
      manifest: manifest({ capabilities: [capability('auth')] }),
      config: defaultConfig().protection,
    });
    const report = checkerFor(contract).evaluate([change('src/auth/session.ts')], 'a'.repeat(40), 'b'.repeat(40));
    const text = formatProtectionReport(report);

    expect(text).toContain('FAILED');
    expect(text).toContain('src/auth/session.ts');
    expect(text).toContain('reason:');
  });

  it('reports a pass compactly', () => {
    const contract = buildContract({ manifest: manifest(), config: defaultConfig().protection });
    const report = checkerFor(contract).evaluate([change('src/theme/theme.ts')], 'a'.repeat(40), 'b'.repeat(40));
    expect(formatProtectionReport(report)).toContain('passed');
  });
});
