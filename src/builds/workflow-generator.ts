/**
 * GitHub Actions workflow generation.
 *
 * DesignLab's build strategy, in order of preference:
 *
 *   1. **Reuse** an Android workflow the target repository already has. A
 *      project that already builds APKs knows more about its own signing,
 *      caching and flavours than any generator could.
 *   2. **Generate** the smallest workflow that fits the detected stack.
 *   3. **Report unsupported** — honestly — when neither is possible.
 *
 * Compilation is deterministic work, so no model is involved at any point.
 * Workflows are emitted as plain YAML text rather than through a YAML library:
 * the output is a small, fixed shape, and hand-written text keeps the
 * generated file readable and reviewable by whoever inherits it.
 */

import type { AppManifest } from '../core/schemas.js';
import { lockfileNormalisationCommands } from './lockfile-registry.js';

/**
 * A literal `$` for the emitted YAML. Written as an interpolation so the
 * template literals below stay readable: `${D}{{ … }}` is a GitHub Actions
 * expression, and `${D}VAR` is a shell variable, neither of which should be
 * interpolated by TypeScript.
 */
const D = '$';

export type WorkflowStrategy = 'reuse-existing' | 'generated' | 'unsupported';

export interface WorkflowPlan {
  strategy: WorkflowStrategy;
  /** Android build variant the workflow produces. */
  variant: 'debug' | 'release';
  /** Path the workflow lives at, relative to the repository root. */
  path: string | null;
  /** YAML body when `strategy` is "generated". */
  content: string | null;
  /** Why this strategy was chosen — surfaced in `designlab status`. */
  reason: string;
  /** Manual setup the operator must complete (e.g. secrets). */
  requirements: string[];
}

export interface WorkflowPlanOptions {
  manifest: AppManifest;
  /** Branch prefix that triggers the workflow, e.g. "design". */
  branchPrefix: string;
  reuseExisting: boolean;
  generate: boolean;
  workflowPath: string;
  /**
   * Build variant. Defaults to `debug` because a debug APK is signed with the
   * debug keystore and installs on any device; an unsigned release APK does
   * not install anywhere and is useless for design evaluation.
   */
  variant?: 'debug' | 'release';
  /**
   * Foreign registry prefixes found in package-lock.json (e.g. a Replit
   * package-firewall mirror). The generated workflow rewrites them to the
   * public registry in CI, before install — the lockfile itself is PROTECTED
   * and is never modified in the repository.
   */
  lockfileForeignRegistries?: readonly string[];
}

export function planWorkflow(options: WorkflowPlanOptions): WorkflowPlan {
  const { manifest } = options;
  const variant = options.variant ?? 'debug';

  if (options.reuseExisting && manifest.ci.androidWorkflowPath) {
    return {
      strategy: 'reuse-existing',
      variant,
      path: manifest.ci.androidWorkflowPath,
      content: null,
      reason: `The repository already builds Android artifacts in ${manifest.ci.androidWorkflowPath}.`,
      requirements: [
        `Ensure ${manifest.ci.androidWorkflowPath} triggers on branches matching "${options.branchPrefix}/**".`,
        'Ensure the workflow uploads the APK as a build artifact.',
      ],
    };
  }

  if (!options.generate) {
    return {
      strategy: 'unsupported',
      variant,
      path: null,
      content: null,
      reason: 'Workflow generation is disabled in configuration and no existing Android workflow was found.',
      requirements: ['Enable build.generateWorkflow, or add an Android build workflow to the target repository.'],
    };
  }

  const generator = GENERATORS[manifest.androidBuildSystem];
  if (!generator) {
    return {
      strategy: 'unsupported',
      variant,
      path: null,
      content: null,
      reason: `No APK build strategy is available for android build system "${manifest.androidBuildSystem}".`,
      requirements: [
        'Add an Android build workflow to the target repository, then re-run inspection so DesignLab can reuse it.',
      ],
    };
  }

  return {
    strategy: 'generated',
    variant,
    path: options.workflowPath,
    content: generator(manifest, options.branchPrefix, variant, options.lockfileForeignRegistries ?? []),
    reason: `Generated a ${variant} workflow for the detected build system "${manifest.androidBuildSystem}".`,
    requirements: generatorRequirements(manifest, variant),
  };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

type Generator = (
  manifest: AppManifest,
  branchPrefix: string,
  variant: 'debug' | 'release',
  foreignRegistries: readonly string[],
) => string;

const GENERATORS: Partial<Record<AppManifest['androidBuildSystem'], Generator>> = {
  gradle: generateGradleWorkflow,
  'expo-prebuild': generateExpoPrebuildWorkflow,
  'eas-build': generateEasWorkflow,
  flutter: generateFlutterWorkflow,
  capacitor: generateCapacitorWorkflow,
};

/**
 * Header shared by every generated workflow. The artifact name is derived at
 * run time from the branch, which is what makes
 * `<app>-R001-A-<design>.apk` fall out of the branch naming convention
 * without DesignLab having to inject per-branch workflow variants.
 */
function workflowHeader(manifest: AppManifest, branchPrefix: string, name: string): string {
  return `# Generated by DesignLab. Builds one APK per design branch.
#
# Artifact naming is derived from the branch: a branch called
#   ${branchPrefix}/r001-a-immersive
# produces
#   ${manifest.appSlug}-R001-A-immersive.apk
#
# Safe to edit: DesignLab will not overwrite this file once it exists unless
# you re-run inspection with --force-workflow.

name: ${name}

on:
  push:
    branches:
      - '${branchPrefix}/**'
  workflow_dispatch:

# Design branches are independent experiments; never cancel one for another.
concurrency:
  group: designlab-${D}{{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  build:
    name: Build Android APK
    runs-on: ubuntu-latest
    timeout-minutes: 60

    steps:
      - name: Check out the design branch
        uses: actions/checkout@v4

      - name: Derive DesignLab artifact name
        id: designlab
        shell: bash
        run: |
          set -euo pipefail
          branch="${D}{GITHUB_REF#refs/heads/}"
          # design/r001-a-immersive -> round=r001 slot=a slug=immersive
          leaf="${D}{branch##*/}"
          round="${D}(printf '%s' "${D}leaf" | cut -d- -f1)"
          slot="${D}(printf '%s' "${D}leaf" | cut -d- -f2)"
          slug="${D}(printf '%s' "${D}leaf" | cut -d- -f3-)"
          if [ -z "${D}round" ] || [ -z "${D}slot" ]; then
            round="r000"; slot="x"; slug="${D}leaf"
          fi
          name="${manifest.appSlug}-${D}(printf '%s' "${D}round" | tr '[:lower:]' '[:upper:]')-${D}(printf '%s' "${D}slot" | tr '[:lower:]' '[:upper:]')-${D}slug"
          echo "artifact_name=${D}name" >> "${D}GITHUB_OUTPUT"
          echo "Artifact will be named ${D}name.apk"
`;
}

const UPLOAD_STEP = `
      - name: Locate the built APK
        id: apk
        shell: bash
        run: |
          set -euo pipefail
          apk="${D}(find . -name '*.apk' -not -path '*/node_modules/*' -print | head -n 1)"
          if [ -z "${D}apk" ]; then
            echo "::error::No APK was produced by the build."
            exit 1
          fi
          echo "path=${D}apk" >> "${D}GITHUB_OUTPUT"
          echo "Found APK at ${D}apk"

      - name: Rename to the DesignLab artifact name
        shell: bash
        run: |
          set -euo pipefail
          mkdir -p designlab-output
          cp "${D}{{ steps.apk.outputs.path }}" "designlab-output/${D}{{ steps.designlab.outputs.artifact_name }}.apk"

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: ${D}{{ steps.designlab.outputs.artifact_name }}
          path: designlab-output/*.apk
          if-no-files-found: error
          retention-days: 30
`;

function nodeSetupSteps(manifest: AppManifest, foreignRegistries: readonly string[] = []): string {
  const cache = manifest.packageManager === 'npm' || manifest.packageManager === 'yarn'
    ? `\n          cache: '${manifest.packageManager}'`
    : '';

  const install =
    manifest.commands.install ??
    (manifest.packageManager === 'yarn'
      ? 'yarn install --frozen-lockfile'
      : manifest.packageManager === 'pnpm'
        ? 'pnpm install --frozen-lockfile'
        : 'npm ci');

  const pnpmSetup =
    manifest.packageManager === 'pnpm'
      ? `
      - name: Set up pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9
`
      : '';

  const normalise =
    foreignRegistries.length > 0
      ? `
      - name: Normalise lockfile registry (foreign mirror hosts detected)
        shell: bash
        run: |
          set -euo pipefail
          # The lockfile pins tarballs to a sandbox-internal registry mirror
          # that does not exist here. Rewrite to the public registry; pinned
          # versions and integrity hashes are unchanged. CI-only: the
          # repository's lockfile is protected and never modified.
${lockfileNormalisationCommands(foreignRegistries)
  .map((command) => `          ${command}`)
  .join('\n')}
`
      : '';

  return `${pnpmSetup}
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'${cache}
${normalise}
      - name: Install dependencies
        run: ${install}
`;
}

const JAVA_SETUP = `
      - name: Set up JDK
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3
`;

function generateGradleWorkflow(
  manifest: AppManifest,
  branchPrefix: string,
  variant: 'debug' | 'release',
  foreignRegistries: readonly string[],
): string {
  const isJsProject = manifest.packageManager !== 'gradle' && manifest.packageManager !== 'unknown';
  const task = gradleTask(variant);
  return `${workflowHeader(manifest, branchPrefix, 'DesignLab Android Build')}${
    isJsProject ? nodeSetupSteps(manifest, foreignRegistries) : ''
  }${JAVA_SETUP}
      - name: Grant execute permission to the Gradle wrapper
        run: chmod +x android/gradlew || chmod +x gradlew || true

      - name: Build ${variant} APK
        shell: bash
        run: |
          set -euo pipefail
          if [ -d android ]; then
            cd android
          fi
          if [ -x ./gradlew ]; then
            ./gradlew ${task} --no-daemon --stacktrace
          else
            gradle ${task} --no-daemon --stacktrace
          fi
${UPLOAD_STEP}`;
}

function generateExpoPrebuildWorkflow(
  manifest: AppManifest,
  branchPrefix: string,
  variant: 'debug' | 'release',
  foreignRegistries: readonly string[],
): string {
  return `${workflowHeader(manifest, branchPrefix, 'DesignLab Android Build (Expo)')}${nodeSetupSteps(
    manifest,
    foreignRegistries,
  )}${JAVA_SETUP}
      - name: Generate native Android project
        run: npx expo prebuild --platform android --no-install

      - name: Build ${variant} APK
        shell: bash
        run: |
          set -euo pipefail
          cd android
          chmod +x ./gradlew
          ./gradlew ${gradleTask(variant)} --no-daemon --stacktrace
${UPLOAD_STEP}`;
}

function generateEasWorkflow(
  manifest: AppManifest,
  branchPrefix: string,
  _variant: 'debug' | 'release',
  foreignRegistries: readonly string[],
): string {
  // EAS builds are governed by the eas.json profile; the "preview" profile
  // produces an internal-distribution APK that installs on device.
  return `${workflowHeader(manifest, branchPrefix, 'DesignLab Android Build (EAS)')}${nodeSetupSteps(manifest, foreignRegistries)}
      - name: Set up EAS
        uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${D}{{ secrets.EXPO_TOKEN }}

      - name: Build APK on EAS
        run: eas build --platform android --profile preview --non-interactive --wait --output ./designlab-build.apk

      - name: Rename to the DesignLab artifact name
        shell: bash
        run: |
          set -euo pipefail
          mkdir -p designlab-output
          cp ./designlab-build.apk "designlab-output/${D}{{ steps.designlab.outputs.artifact_name }}.apk"

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: ${D}{{ steps.designlab.outputs.artifact_name }}
          path: designlab-output/*.apk
          if-no-files-found: error
          retention-days: 30
`;
}

function generateFlutterWorkflow(
  manifest: AppManifest,
  branchPrefix: string,
  variant: 'debug' | 'release',
): string {
  return `${workflowHeader(manifest, branchPrefix, 'DesignLab Android Build (Flutter)')}${JAVA_SETUP}
      - name: Set up Flutter
        uses: subosito/flutter-action@v2
        with:
          channel: stable
          cache: true

      - name: Install dependencies
        run: flutter pub get

      - name: Build ${variant} APK
        run: flutter build apk --${variant}
${UPLOAD_STEP}`;
}

function generateCapacitorWorkflow(
  manifest: AppManifest,
  branchPrefix: string,
  variant: 'debug' | 'release',
  foreignRegistries: readonly string[],
): string {
  return `${workflowHeader(manifest, branchPrefix, 'DesignLab Android Build (Capacitor)')}${nodeSetupSteps(
    manifest,
    foreignRegistries,
  )}${JAVA_SETUP}
      - name: Build web assets
        run: ${manifest.commands.build ?? 'npm run build'}

      - name: Sync Capacitor Android project
        run: npx cap sync android

      - name: Build ${variant} APK
        shell: bash
        run: |
          set -euo pipefail
          cd android
          chmod +x ./gradlew
          ./gradlew ${gradleTask(variant)} --no-daemon --stacktrace
${UPLOAD_STEP}`;
}

function gradleTask(variant: 'debug' | 'release'): string {
  return variant === 'debug' ? 'assembleDebug' : 'assembleRelease';
}

function generatorRequirements(manifest: AppManifest, variant: 'debug' | 'release'): string[] {
  const requirements = ['GitHub Actions must be enabled on the target repository.'];

  if (variant === 'debug') {
    requirements.push(
      'Debug APKs are signed with the debug keystore and install on any device with "install unknown apps" allowed.',
    );
  } else {
    requirements.push(
      'Release builds are UNSIGNED unless the target has signing configured — an unsigned APK will not install. ' +
        'Either configure release signing in the repository, or use the default debug variant for device evaluation.',
    );
  }

  if (manifest.androidBuildSystem === 'eas-build') {
    requirements.push('Add an EXPO_TOKEN repository secret so EAS builds can authenticate.');
  }

  return requirements;
}
