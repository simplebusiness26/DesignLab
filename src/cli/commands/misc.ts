/**
 * Supporting commands: `protect`, `workflow`, `clean`.
 *
 * `protect` exists because the contract should be inspectable before a round
 * runs, not discovered when a candidate fails. `workflow` prints what
 * DesignLab would add to the target repository so a human can review it first.
 * `clean` removes disposable local state without ever touching remote refs.
 */

import { writeText } from '../../core/fsx.js';
import { DesignLabError } from '../../core/errors.js';
import { planWorkflow, type WorkflowPlan } from '../../builds/workflow-generator.js';
import { GitClient } from '../../git/git-client.js';
import { WorktreeManager } from '../../git/worktree-manager.js';
import { ProtectionChecker } from '../../protection/checker.js';
import { formatProtectionReport } from '../../protection/checker.js';
import type { FunctionalityContract, ProtectionLevel, ProtectionReport } from '../../core/schemas.js';
import type { CliContext } from '../context.js';
import { resolveProjectId, resolveTarget } from '../context.js';

// ---------------------------------------------------------------------------
// protect
// ---------------------------------------------------------------------------

export interface ProtectOptions {
  repo?: string | undefined;
  /** Classify these paths instead of listing the whole contract. */
  paths?: string[] | undefined;
  /** Check a branch's diff against the contract. */
  branch?: string | undefined;
  base?: string | undefined;
}

export interface ProtectResult {
  contract: FunctionalityContract;
  classifications: Array<{ path: string; level: ProtectionLevel; rule: string | null; reason: string }>;
  report: ProtectionReport | null;
}

export async function runProtect(context: CliContext, options: ProtectOptions): Promise<ProtectResult> {
  const projectId = await resolveProjectId(context, options.repo);
  const contract = await context.store.requireContract(projectId);
  const checker = new ProtectionChecker(contract, context.config.protection);

  const classifications = (options.paths ?? []).map((path) => {
    const { level, rule } = checker.classify(path);
    return {
      path,
      level,
      rule: rule?.pattern ?? null,
      reason: rule?.reason ?? 'No rule matched this path.',
    };
  });

  let report: ProtectionReport | null = null;

  if (options.branch) {
    const target = await resolveTarget({ context, repo: options.repo, refresh: false });
    const git = new GitClient({ cwd: target.repoDir, logger: context.logger });

    const baseRef = options.base ?? target.branch;
    const baseSha = await git.tryRevParse(baseRef);
    const headSha = await git.tryRevParse(options.branch);

    if (!baseSha) {
      throw new DesignLabError('GIT_FAILED', `Base ref "${baseRef}" could not be resolved`, {
        details: { baseRef },
      });
    }
    if (!headSha) {
      throw new DesignLabError('GIT_FAILED', `Branch "${options.branch}" could not be resolved`, {
        details: { branch: options.branch },
        hint: 'Fetch the branch first, or check the name.',
      });
    }

    report = await checker.check(git, { baseSha, headSha });
  }

  return { contract, classifications, report };
}

export function formatProtectResult(result: ProtectResult): string {
  const lines: string[] = [];

  if (result.classifications.length > 0) {
    lines.push('Path classification:', '');
    for (const entry of result.classifications) {
      lines.push(
        `  ${entry.level.padEnd(11)} ${entry.path}`,
        `              rule: ${entry.rule ?? '(none)'}`,
        `              why:  ${entry.reason}`,
      );
    }
    lines.push('');
  }

  if (result.report) {
    lines.push(formatProtectionReport(result.report), '');
  }

  if (result.classifications.length === 0 && !result.report) {
    const byLevel: Record<string, string[]> = {};
    for (const rule of result.contract.rules) {
      (byLevel[rule.level] ??= []).push(`${rule.pattern}  — ${rule.reason}`);
    }

    lines.push(
      `Functionality contract  (${result.contract.rules.length} rules, ${result.contract.invariants.length} invariants)`,
      `Principle: ${result.contract.principle}`,
      '',
    );

    for (const level of ['PROTECTED', 'RESTRICTED', 'DESIGNABLE', 'UNKNOWN'] as const) {
      const rules = byLevel[level];
      if (!rules || rules.length === 0) continue;
      lines.push(`${level} (${rules.length}):`, ...rules.map((rule) => `  ${rule}`), '');
    }

    if (result.contract.invariants.length > 0) {
      lines.push(
        'Behavioural invariants:',
        ...result.contract.invariants.map((invariant) => `  - ${invariant.statement}`),
        '',
      );
    }

    if (result.contract.approvedExceptions.length > 0) {
      lines.push(
        'Approved exceptions:',
        ...result.contract.approvedExceptions.map(
          (exception) => `  - ${exception.pattern} — ${exception.reason}`,
        ),
      );
    }
  }

  return lines.join('\n').trimEnd();
}

// ---------------------------------------------------------------------------
// workflow
// ---------------------------------------------------------------------------

export interface WorkflowOptions {
  repo?: string | undefined;
  /** Write the workflow into the primary clone instead of printing it. */
  write?: boolean;
}

export async function runWorkflow(
  context: CliContext,
  options: WorkflowOptions,
): Promise<{ plan: WorkflowPlan; writtenTo: string | null }> {
  const projectId = await resolveProjectId(context, options.repo);
  const manifest = await context.store.requireManifest(projectId);

  const plan = planWorkflow({
    manifest,
    branchPrefix: context.config.branchPrefix,
    reuseExisting: context.config.build.reuseExistingWorkflow,
    generate: context.config.build.generateWorkflow,
    workflowPath: context.config.build.workflowPath,
  });

  if (!options.write || plan.strategy !== 'generated' || !plan.content || !plan.path) {
    return { plan, writtenTo: null };
  }

  const target = await resolveTarget({ context, repo: options.repo, refresh: false });
  const path = `${target.repoDir}/${plan.path}`;
  await writeText(path, plan.content);

  return { plan, writtenTo: path };
}

export function formatWorkflowResult(result: { plan: WorkflowPlan; writtenTo: string | null }): string {
  const { plan } = result;
  const lines = [`Build strategy: ${plan.strategy}`, `Reason: ${plan.reason}`, ''];

  if (plan.path) lines.push(`Workflow path: ${plan.path}`, '');

  if (plan.requirements.length > 0) {
    lines.push('Requirements:', ...plan.requirements.map((item) => `  - ${item}`), '');
  }

  if (result.writtenTo) {
    lines.push(`Written to ${result.writtenTo}`);
  } else if (plan.content) {
    lines.push('--- workflow ---', plan.content);
  }

  return lines.join('\n').trimEnd();
}

// ---------------------------------------------------------------------------
// clean
// ---------------------------------------------------------------------------

export interface CleanOptions {
  repo?: string | undefined;
  /** Also delete the local design branches. Remote branches are never touched. */
  deleteBranches?: boolean;
}

export async function runClean(
  context: CliContext,
  options: CleanOptions,
): Promise<{ removed: string[]; orphaned: string[] }> {
  const projectId = await resolveProjectId(context, options.repo);
  const repoDir = context.paths.repoDir(projectId);

  const git = new GitClient({ cwd: repoDir, logger: context.logger });
  if (!(await git.isRepository())) {
    return { removed: [], orphaned: [] };
  }

  const manager = new WorktreeManager({
    git,
    worktreesRoot: context.paths.worktreesDir(projectId),
    logger: context.logger,
    protectedBranches: ['main', 'master'],
  });

  const removed = await manager.cleanAll({
    force: true,
    deleteBranches: options.deleteBranches ?? false,
  });
  const { orphaned } = await manager.reconcile();

  return { removed, orphaned };
}

export function formatCleanResult(
  result: { removed: string[]; orphaned: string[] },
  deletedBranches: boolean,
): string {
  const lines = [
    `Removed ${result.removed.length} worktree(s).`,
    deletedBranches
      ? 'Local design branches were deleted. Remote branches were not touched.'
      : 'Local design branches were kept. Pass --delete-branches to remove them.',
  ];

  if (result.orphaned.length > 0) {
    lines.push('', 'Directories Git no longer tracks (left in place for you to inspect):');
    lines.push(...result.orphaned.map((path) => `  ${path}`));
  }

  return lines.join('\n');
}
