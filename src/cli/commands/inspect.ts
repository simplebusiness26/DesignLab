/**
 * `designlab inspect`
 *
 * Analyses the target application and produces the App Manifest, the
 * human-readable analysis, and the Functionality Contract.
 *
 * The manifest is cached by the inspected commit SHA. Re-running against an
 * unchanged repository is a no-op that costs nothing — the single most
 * effective usage control in the system, since inspection is otherwise the
 * most expensive read of the whole codebase.
 */

import { inspectRepository } from '../../analysis/inspector.js';
import { recordCacheHit } from '../../agents/runner-factory.js';
import { contentHash, shortSha } from '../../core/ids.js';
import { buildContract } from '../../protection/contract.js';
import {
  contractProposalSchema,
  type AppManifest,
  type FunctionalityContract,
} from '../../core/schemas.js';
import { LEAD_SYSTEM_PROMPT, renderManifestContext } from '../../agents/prompts.js';
import type { CliContext } from '../context.js';
import { ensureProjectRecord, resolveTarget } from '../context.js';

export interface InspectOptions {
  repo?: string | undefined;
  branch?: string | undefined;
  /** Re-analyse even when a manifest already exists for this commit. */
  force?: boolean;
  /** Skip the AI enrichment and contract-proposal passes. */
  noAi?: boolean;
}

export interface InspectResult {
  manifest: AppManifest;
  contract: FunctionalityContract;
  analysisPath: string;
  cached: boolean;
  enriched: boolean;
  enrichmentError: string | null;
}

export async function runInspect(context: CliContext, options: InspectOptions): Promise<InspectResult> {
  const logger = context.logger.child({ scope: 'inspect' });

  const target = await resolveTarget({
    context,
    repo: options.repo,
    branch: options.branch,
    refresh: true,
  });

  logger.info('inspecting target', {
    projectId: target.projectId,
    branch: target.branch,
    sha: shortSha(target.sha),
  });

  // Cache hit: the exact commit has already been analysed.
  const existing = await context.store.readManifest(target.projectId, target.sha);
  if (existing && !options.force) {
    const contract = (await context.store.readContract(target.projectId)) ?? null;
    if (contract && contract.manifestSha === target.sha) {
      logger.info('manifest and contract are current for this commit; nothing to do', {
        sha: shortSha(target.sha),
      });
      await recordCacheHit(context.store, {
        projectId: target.projectId,
        operation: 'inspect',
        notes: `manifest reused for ${shortSha(target.sha)}`,
      });
      return {
        manifest: existing,
        contract,
        analysisPath: context.paths.analysisFile(target.projectId, target.sha),
        cached: true,
        enriched: existing.analysisMode === 'ai-enriched',
        enrichmentError: null,
      };
    }
  }

  // The clone is at whatever commit it was left at; check out the target
  // commit so the analysis describes the branch the operator asked for.
  await target.git.raw(['checkout', '--detach', target.sha]);

  const useAi = !options.noAi && context.config.aiManifestEnrichment;
  const runner = context.createRunner({ projectId: target.projectId, round: null });

  const result = await inspectRepository({
    repoDir: target.repoDir,
    projectId: target.projectId,
    repoUrl: target.repoUrl,
    branch: target.branch,
    sha: target.sha,
    logger,
    runner: useAi ? runner : null,
    aiEnrichment: useAi,
    leadTimeoutMs: context.config.limits.leadTimeoutMs,
  });

  const manifest = await context.store.writeManifest(result.manifest);
  const analysisPath = await context.store.writeAnalysis(
    target.projectId,
    target.sha,
    result.analysisMarkdown,
  );

  await ensureProjectRecord(context, target, {
    appName: manifest.appName,
    appSlug: manifest.appSlug,
  });

  // ---- Functionality Contract -------------------------------------------

  let proposal = null;
  if (useAi) {
    const response = await runner.run({
      role: 'lead',
      operation: 'classify-contract',
      prompt: [
        'You are establishing the functionality boundary for a UI redesign experiment on an existing application.',
        '',
        'The principle is: **functionality is frozen, design is flexible**. A redesign may change how the app looks,',
        'reads and feels. It must not change what the app does.',
        '',
        '## The application',
        '',
        renderManifestContext(manifest, { detailed: true }),
        '',
        '## Your task',
        '',
        'Read the repository and identify paths that a redesign must NOT change, beyond the obvious ones',
        '(migrations, lock files, CI, manifests, native code) which DesignLab already protects.',
        '',
        'Return glob patterns relative to the repository root. Use:',
        '- PROTECTED for behaviour that must be byte-for-byte preserved in effect: business rules, auth,',
        '  payments, persistence, backend contracts, permission logic, message delivery.',
        '- RESTRICTED for code a design may need to touch but must justify: build config, tests, shared',
        '  utilities that mix presentation with behaviour.',
        '',
        'Do not propose DESIGNABLE rules; DesignLab decides what is designable. Every rule needs a specific',
        'reason grounded in what you actually read, not a generic caution.',
        '',
        'Also list behavioural invariants that must still hold after any redesign.',
      ].join('\n'),
      systemPrompt: LEAD_SYSTEM_PROMPT,
      cwd: target.repoDir,
      outputSchema: contractProposalSchema,
      toolPolicy: { allowed: ['Read', 'Glob', 'Grep'], denied: ['Edit', 'Write', 'Bash', 'NotebookEdit'] },
      timeoutMs: context.config.limits.leadTimeoutMs,
      ledger: { projectId: target.projectId, round: null, slot: null },
    });

    if (response.ok && response.data) {
      proposal = response.data;
      logger.info('contract proposal accepted', { rules: proposal.rules.length });
    } else {
      logger.warn('contract proposal unavailable; using deterministic rules only', {
        error: response.error,
      });
    }
  }

  const contract = await context.store.writeContract(
    buildContract({ manifest, config: context.config.protection, proposal }),
  );

  logger.info('inspection complete', {
    framework: manifest.framework,
    screens: manifest.screens.length,
    rules: contract.rules.length,
    contractHash: contentHash(contract.rules),
  });

  return {
    manifest,
    contract,
    analysisPath,
    cached: false,
    enriched: result.enriched,
    enrichmentError: result.enrichmentError,
  };
}

export function formatInspectResult(result: InspectResult): string {
  const { manifest, contract } = result;
  const present = manifest.capabilities.filter((capability) => capability.present).map((c) => c.key);

  const byLevel = (level: string): number => contract.rules.filter((rule) => rule.level === level).length;

  const lines = [
    result.cached
      ? `${manifest.appName} — already analysed at ${shortSha(manifest.sha)} (cached, no model calls made).`
      : `${manifest.appName} — analysed at ${shortSha(manifest.sha)}.`,
    '',
    `  framework:      ${manifest.framework}${manifest.frameworkVersion ? ` ${manifest.frameworkVersion}` : ''}`,
    `  package mgr:    ${manifest.packageManager}`,
    `  android build:  ${manifest.androidBuildSystem}`,
    `  styling:        ${manifest.designSystem.stylingApproach}`,
    `  navigation:     ${manifest.navigation.library ?? 'unknown'} (${manifest.navigation.pattern})`,
    `  screens:        ${manifest.screens.length}`,
    `  components:     ${manifest.components.length}`,
    `  capabilities:   ${present.join(', ') || 'none detected'}`,
    `  analysis mode:  ${manifest.analysisMode}`,
    '',
    'Functionality contract:',
    `  PROTECTED:   ${byLevel('PROTECTED')} rules`,
    `  RESTRICTED:  ${byLevel('RESTRICTED')} rules`,
    `  DESIGNABLE:  ${byLevel('DESIGNABLE')} rules`,
    `  invariants:  ${contract.invariants.length}`,
    '',
    'Commands detected:',
    `  typecheck: ${manifest.commands.typecheck ?? '(none)'}`,
    `  lint:      ${manifest.commands.lint ?? '(none)'}`,
    `  test:      ${manifest.commands.test ?? '(none)'}`,
    `  android:   ${manifest.commands.androidBuild ?? '(none)'}`,
    '',
    `Analysis written to ${result.analysisPath}`,
  ];

  if (result.enrichmentError) {
    lines.push('', `Note: AI enrichment did not run (${result.enrichmentError}). Deterministic analysis was used.`);
  }
  if (manifest.truncated) {
    lines.push('', 'Warning: the repository scan hit its file cap; analysis may be incomplete.');
  }

  lines.push('', 'Next: designlab round --designs 4');
  return lines.join('\n');
}
