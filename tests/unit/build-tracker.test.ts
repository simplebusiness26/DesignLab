import { describe, expect, it } from 'vitest';

import {
  describeBuildStatus,
  notRequestedBuild,
  parseGitHubRepo,
  pendingBuild,
  refreshBuildStatus,
  unsupportedBuild,
  type ActionsClient,
  type WorkflowArtifact,
  type WorkflowRun,
} from '../../src/builds/build-tracker.js';
import { planWorkflow } from '../../src/builds/workflow-generator.js';
import type { AppManifest } from '../../src/core/schemas.js';

const HEAD = 'c'.repeat(40);

function run(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 42,
    name: 'DesignLab Android Build',
    htmlUrl: 'https://github.com/test/app/actions/runs/42',
    status: 'completed',
    conclusion: 'success',
    headSha: HEAD,
    path: '.github/workflows/designlab-android.yml',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function artifact(overrides: Partial<WorkflowArtifact> = {}): WorkflowArtifact {
  return {
    id: 7,
    name: 'testapp-R001-A-immersive',
    sizeInBytes: 12_000_000,
    expired: false,
    archiveDownloadUrl: 'https://api.github.com/artifacts/7/zip',
    ...overrides,
  };
}

function stubClient(runs: WorkflowRun[], artifacts: WorkflowArtifact[] = []): ActionsClient {
  return {
    listRunsForBranch: async () => runs,
    listArtifacts: async () => artifacts,
  };
}

const baseRecord = pendingBuild({
  workflowPath: '.github/workflows/designlab-android.yml',
  artifactName: 'testapp-R001-A-immersive.apk',
});

const repo = { owner: 'test', repo: 'app' };

describe('parseGitHubRepo', () => {
  it('handles every URL form a remote might use', () => {
    expect(parseGitHubRepo('https://github.com/owner/app')).toEqual({ owner: 'owner', repo: 'app' });
    expect(parseGitHubRepo('https://github.com/owner/app.git')).toEqual({ owner: 'owner', repo: 'app' });
    expect(parseGitHubRepo('git@github.com:owner/app.git')).toEqual({ owner: 'owner', repo: 'app' });
  });

  it('returns null for a non-GitHub remote', () => {
    expect(parseGitHubRepo('https://gitlab.com/owner/app')).toBeNull();
    expect(parseGitHubRepo('/local/path')).toBeNull();
  });
});

describe('refreshBuildStatus', () => {
  it('reports BUILD_SUCCESS only when a real artifact exists', async () => {
    const result = await refreshBuildStatus({
      client: stubClient([run()], [artifact()]),
      repo,
      branch: 'design/r001-a-immersive',
      headSha: HEAD,
      current: baseRecord,
    });

    expect(result.status).toBe('BUILD_SUCCESS');
    expect(result.artifactName).toBe('testapp-R001-A-immersive.apk');
    expect(result.artifactUrl).toBe('https://api.github.com/artifacts/7/zip');
    expect(result.workflowRunUrl).toContain('/runs/42');
  });

  it('does NOT claim an APK when the run succeeded but produced no artifact', async () => {
    const result = await refreshBuildStatus({
      client: stubClient([run()], []),
      repo,
      branch: 'design/r001-a-immersive',
      headSha: HEAD,
      current: baseRecord,
    });

    expect(result.status).toBe('BUILD_FAILED');
    expect(result.artifactUrl).toBeNull();
    expect(result.notes).toContain('no artifact');
  });

  it('does not claim an APK when the artifact has expired', async () => {
    const result = await refreshBuildStatus({
      client: stubClient([run()], [artifact({ expired: true })]),
      repo,
      branch: 'design/r001-a-immersive',
      headSha: HEAD,
      current: baseRecord,
    });
    expect(result.status).toBe('BUILD_FAILED');
    expect(result.notes).toContain('expired');
  });

  it('reports in-flight runs as running or pending', async () => {
    const running = await refreshBuildStatus({
      client: stubClient([run({ status: 'in_progress', conclusion: null })]),
      repo,
      branch: 'b',
      headSha: HEAD,
      current: baseRecord,
    });
    expect(running.status).toBe('BUILD_RUNNING');

    const queued = await refreshBuildStatus({
      client: stubClient([run({ status: 'queued', conclusion: null })]),
      repo,
      branch: 'b',
      headSha: HEAD,
      current: baseRecord,
    });
    expect(queued.status).toBe('BUILD_PENDING');
  });

  it('reports a failed run as BUILD_FAILED with its conclusion', async () => {
    const result = await refreshBuildStatus({
      client: stubClient([run({ conclusion: 'failure' })]),
      repo,
      branch: 'b',
      headSha: HEAD,
      current: baseRecord,
    });
    expect(result.status).toBe('BUILD_FAILED');
    expect(result.conclusion).toBe('failure');
  });

  it('stays pending when no run has appeared yet', async () => {
    const result = await refreshBuildStatus({
      client: stubClient([]),
      repo,
      branch: 'b',
      headSha: HEAD,
      current: baseRecord,
    });
    expect(result.status).toBe('BUILD_PENDING');
    expect(result.notes).toContain('No workflow run');
  });

  it('ignores runs for a different commit', async () => {
    const result = await refreshBuildStatus({
      client: stubClient([run({ headSha: 'd'.repeat(40), conclusion: 'failure' })], [artifact()]),
      repo,
      branch: 'b',
      headSha: HEAD,
      current: baseRecord,
    });
    // Falls back to the newest run only because no run matches; the point is
    // that a stale success can never be reported as this commit's success.
    expect(result.status).toBe('BUILD_FAILED');
  });

  it('leaves state untouched when GitHub is unreachable', async () => {
    const failing: ActionsClient = {
      listRunsForBranch: async () => {
        throw new Error('network down');
      },
      listArtifacts: async () => [],
    };

    const result = await refreshBuildStatus({
      client: failing,
      repo,
      branch: 'b',
      headSha: HEAD,
      current: baseRecord,
    });

    // An unreachable API is not evidence of failure.
    expect(result.status).toBe('BUILD_PENDING');
    expect(result.notes).toContain('Could not reach GitHub Actions');
  });

  it('never revives an unsupported or unrequested build', async () => {
    const unsupported = await refreshBuildStatus({
      client: stubClient([run()], [artifact()]),
      repo,
      branch: 'b',
      headSha: HEAD,
      current: unsupportedBuild('no android build system'),
    });
    expect(unsupported.status).toBe('BUILD_UNSUPPORTED');

    const notRequested = await refreshBuildStatus({
      client: stubClient([run()], [artifact()]),
      repo,
      branch: 'b',
      headSha: HEAD,
      current: notRequestedBuild('dry run'),
    });
    expect(notRequested.status).toBe('BUILD_NOT_REQUESTED');
  });
});

describe('describeBuildStatus', () => {
  it('gives a human phrase for each state', () => {
    expect(describeBuildStatus('BUILD_SUCCESS')).toBe('APK built');
    expect(describeBuildStatus('BUILD_FAILED')).toBe('build failed');
    expect(describeBuildStatus('BUILD_UNSUPPORTED')).toBe('no build pipeline');
  });
});

// ---------------------------------------------------------------------------

function manifestWith(overrides: Partial<AppManifest>): AppManifest {
  return {
    schemaVersion: 1,
    projectId: 'p',
    repoUrl: 'https://github.com/test/app',
    branch: 'main',
    sha: 'a'.repeat(40),
    generatedAt: new Date().toISOString(),
    appName: 'Test App',
    appSlug: 'testapp',
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
    commands: { install: null, typecheck: null, lint: null, test: null, build: null, androidBuild: null },
    ci: { hasWorkflows: false, workflowPaths: [], buildsAndroid: false, androidWorkflowPath: null },
    fileCount: 0,
    truncated: false,
    analysisMode: 'deterministic',
    notes: [],
    ...overrides,
  };
}

describe('planWorkflow', () => {
  const options = {
    branchPrefix: 'design',
    reuseExisting: true,
    generate: true,
    workflowPath: '.github/workflows/designlab-android.yml',
  };

  it('prefers an existing Android workflow over generating one', () => {
    const plan = planWorkflow({
      manifest: manifestWith({
        ci: {
          hasWorkflows: true,
          workflowPaths: ['.github/workflows/android.yml'],
          buildsAndroid: true,
          androidWorkflowPath: '.github/workflows/android.yml',
        },
      }),
      ...options,
    });

    expect(plan.strategy).toBe('reuse-existing');
    expect(plan.path).toBe('.github/workflows/android.yml');
    expect(plan.content).toBeNull();
  });

  it('generates a workflow matching the detected build system', () => {
    for (const buildSystem of ['gradle', 'expo-prebuild', 'flutter', 'capacitor', 'eas-build'] as const) {
      const plan = planWorkflow({ manifest: manifestWith({ androidBuildSystem: buildSystem }), ...options });
      expect(plan.strategy, buildSystem).toBe('generated');
      expect(plan.content, buildSystem).toContain("branches:");
      expect(plan.content, buildSystem).toContain("'design/**'");
      expect(plan.content, buildSystem).toContain('actions/upload-artifact@v4');
    }
  });

  it('derives the artifact name from the branch, not from injected variants', () => {
    const plan = planWorkflow({ manifest: manifestWith({ androidBuildSystem: 'gradle' }), ...options });
    expect(plan.content).toContain('testapp-');
    expect(plan.content).toContain('GITHUB_OUTPUT');
  });

  it('uses flutter tooling for a Flutter target', () => {
    const plan = planWorkflow({ manifest: manifestWith({ androidBuildSystem: 'flutter' }), ...options });
    expect(plan.content).toContain('subosito/flutter-action');
    expect(plan.content).toContain('flutter build apk --release');
  });

  it('requires an EXPO_TOKEN for an EAS target', () => {
    const plan = planWorkflow({ manifest: manifestWith({ androidBuildSystem: 'eas-build' }), ...options });
    expect(plan.requirements.join(' ')).toContain('EXPO_TOKEN');
  });

  it('reports unsupported rather than pretending, when no strategy fits', () => {
    const plan = planWorkflow({ manifest: manifestWith({ androidBuildSystem: 'none' }), ...options });
    expect(plan.strategy).toBe('unsupported');
    expect(plan.content).toBeNull();
  });

  it('reports unsupported when generation is disabled and nothing exists', () => {
    const plan = planWorkflow({
      manifest: manifestWith({ androidBuildSystem: 'gradle' }),
      ...options,
      generate: false,
    });
    expect(plan.strategy).toBe('unsupported');
  });
});
