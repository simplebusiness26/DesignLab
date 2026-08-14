import { describe, expect, it } from 'vitest';

import {
  extractForeignRegistryPrefixes,
  lockfileNormalisationCommands,
} from '../../src/builds/lockfile-registry.js';
import { planWorkflow } from '../../src/builds/workflow-generator.js';
import type { AppManifest } from '../../src/core/schemas.js';

/** Replit-shaped lockfile fragment: the case found on the first live target. */
const REPLIT_LOCK = JSON.stringify({
  packages: {
    'node_modules/react': {
      version: '19.0.0',
      resolved: 'http://package-firewall.replit.local/npm/react/-/react-19.0.0.tgz',
      integrity: 'sha512-x',
    },
    'node_modules/@supabase/supabase-js': {
      version: '2.45.0',
      resolved:
        'http://package-firewall.replit.local/npm/@supabase/supabase-js/-/supabase-js-2.45.0.tgz',
      integrity: 'sha512-y',
    },
  },
});

const CLEAN_LOCK = JSON.stringify({
  packages: {
    'node_modules/react': {
      version: '19.0.0',
      resolved: 'https://registry.npmjs.org/react/-/react-19.0.0.tgz',
      integrity: 'sha512-x',
    },
  },
});

describe('extractForeignRegistryPrefixes', () => {
  it('finds the sandbox mirror prefix, once, across scoped and unscoped packages', () => {
    expect(extractForeignRegistryPrefixes(REPLIT_LOCK)).toEqual([
      'http://package-firewall.replit.local/npm',
    ]);
  });

  it('reports nothing for a lockfile pinned to the public registry', () => {
    expect(extractForeignRegistryPrefixes(CLEAN_LOCK)).toEqual([]);
  });

  it('handles a mixed lockfile without flagging the public entries', () => {
    const mixed = REPLIT_LOCK.slice(0, -2) + ',' + CLEAN_LOCK.slice(13);
    expect(extractForeignRegistryPrefixes(mixed)).toEqual([
      'http://package-firewall.replit.local/npm',
    ]);
  });
});

describe('lockfileNormalisationCommands', () => {
  it('rewrites the foreign prefix to the public registry, preserving the tarball path', () => {
    const [command] = lockfileNormalisationCommands(['http://package-firewall.replit.local/npm']);
    expect(command).toBe(
      "sed -i 's#http://package-firewall.replit.local/npm/#https://registry.npmjs.org/#g' package-lock.json",
    );
  });
});

function manifest(): AppManifest {
  return {
    schemaVersion: 1,
    projectId: 'p',
    repoUrl: 'https://github.com/test/app',
    branch: 'main',
    sha: 'a'.repeat(40),
    generatedAt: new Date().toISOString(),
    appName: 'App',
    appSlug: 'app',
    framework: 'expo',
    frameworkVersion: null,
    languages: [],
    packageManager: 'npm',
    androidBuildSystem: 'expo-prebuild',
    androidPackageId: null,
    minSdkVersion: null,
    sourceRoots: [],
    screens: [],
    navigation: { library: null, pattern: 'unknown', paths: [] },
    components: [],
    designSystem: { present: false, themePaths: [], tokens: [], stylingApproach: 'unknown' },
    stateManagement: [],
    capabilities: [],
    permissions: [],
    nativeModules: [],
    apis: [],
    backends: [],
    testing: { frameworks: [], testPaths: [], hasTests: false },
    commands: { install: 'npm ci', typecheck: null, lint: null, test: null, build: null, androidBuild: null },
    ci: { hasWorkflows: false, workflowPaths: [], buildsAndroid: false, androidWorkflowPath: null },
    fileCount: 0,
    truncated: false,
    analysisMode: 'deterministic',
    notes: [],
  };
}

describe('workflow generation with foreign registries', () => {
  const options = {
    branchPrefix: 'design',
    reuseExisting: true,
    generate: true,
    workflowPath: '.github/workflows/designlab-android.yml',
  };

  it('inserts the normalisation step BEFORE dependency install', () => {
    const plan = planWorkflow({
      manifest: manifest(),
      ...options,
      lockfileForeignRegistries: ['http://package-firewall.replit.local/npm'],
    });

    expect(plan.content).toContain('Normalise lockfile registry');
    expect(plan.content).toContain("package-firewall.replit.local/npm/#https://registry.npmjs.org/#g");
    const normaliseIndex = plan.content?.indexOf('Normalise lockfile registry') ?? -1;
    const installIndex = plan.content?.indexOf('Install dependencies') ?? -1;
    expect(normaliseIndex).toBeGreaterThan(-1);
    expect(installIndex).toBeGreaterThan(normaliseIndex);
  });

  it('emits no normalisation step for a clean lockfile', () => {
    const plan = planWorkflow({ manifest: manifest(), ...options, lockfileForeignRegistries: [] });
    expect(plan.content).not.toContain('Normalise lockfile registry');
  });
});
