/**
 * Merge-readiness verification.
 *
 * A winning candidate is not a disposable prototype — its branch must be able
 * to become the real application. But a candidate branch legitimately carries
 * things that must NOT reach production: the temporary identity overlay and
 * the DesignLab build workflow, both applied as marked engine commits at the
 * branch tip.
 *
 * `merge-check` therefore separates the branch into two parts:
 *
 *   base ──▸ design commits (the merge content) ──▸ engine commits (dropped)
 *
 * and verifies, deterministically:
 *
 *  1. every engine commit sits at the tip, in one contiguous run, so dropping
 *     them is trivial (`git merge <designHead>` merges everything real);
 *  2. the design content re-passes the Functionality Contract against the
 *     *current* base branch tip — protection is re-checked at merge time, not
 *     trusted from round records;
 *  3. the design content merges cleanly into the current base
 *     (`git merge-tree`, no working tree touched).
 *
 * It never merges. The final `git merge` is a human action, and the command
 * prints the exact commands for it.
 */

import type { ProtectionConfig } from '../config/config.js';
import type { GitClient } from '../git/git-client.js';
import { ProtectionChecker } from '../protection/checker.js';
import { runInvariantChecks } from '../protection/invariants.js';
import type { FunctionalityContract, ProtectionReport } from '../core/schemas.js';
import { isEngineCommitSubject } from './candidate-identity.js';

export interface EngineCommit {
  sha: string;
  subject: string;
}

export interface MergeReadinessResult {
  ready: boolean;
  /** Marked engine commits found at the branch tip (newest first). */
  engineCommits: EngineCommit[];
  /** Tip of the actual design content — the commit a human would merge. */
  designHeadSha: string;
  /** Current tip of the merge target. */
  baseSha: string;
  protection: ProtectionReport;
  conflicts: { checked: true; clean: boolean; files: string[] } | { checked: false; reason: string };
  /** Every reason the branch is not ready, empty when it is. */
  blockers: string[];
  /** Exact commands for the human merge, valid only when ready. */
  instructions: string[];
}

export interface MergeCheckOptions {
  git: GitClient;
  contract: FunctionalityContract;
  protectionConfig: ProtectionConfig;
  /** Candidate branch ref (must resolve locally). */
  candidateRef: string;
  /** Merge target ref — the current base branch tip, not the round's old base. */
  baseRef: string;
  /** Sanity ceiling on how many tip commits may be engine commits. */
  maxEngineCommits?: number;
}

export async function checkMergeReadiness(options: MergeCheckOptions): Promise<MergeReadinessResult> {
  const { git } = options;
  const blockers: string[] = [];

  const tipSha = await git.revParse(options.candidateRef);
  const baseSha = await git.revParse(options.baseRef);

  // ---- 1. Peel marked engine commits off the tip --------------------------

  const engineCommits: EngineCommit[] = [];
  let designHeadSha = tipSha;
  const ceiling = options.maxEngineCommits ?? 8;

  for (let depth = 0; depth < ceiling; depth += 1) {
    const subject = await git.commitSubject(designHeadSha);
    if (!isEngineCommitSubject(subject)) break;
    engineCommits.push({ sha: designHeadSha, subject });
    designHeadSha = await git.revParse(`${designHeadSha}^`);
  }

  // Engine commits buried under design commits cannot be dropped by merging
  // an earlier tip — that is a genuine blocker, not an inconvenience.
  const buried = await findBuriedEngineCommits(git, baseSha, designHeadSha);
  for (const commit of buried) {
    blockers.push(
      `Engine commit ${commit.sha.slice(0, 8)} ("${commit.subject}") is buried under design commits and ` +
        'cannot be dropped by merging an earlier tip. Rebase it out before merging.',
    );
  }

  // ---- 2. Re-check the Functionality Contract at merge time ---------------

  const checker = new ProtectionChecker(options.contract, options.protectionConfig);
  const mergeBase = await git.run(['merge-base', baseSha, designHeadSha]);
  const changes = await git.changedFiles(mergeBase, designHeadSha);
  const pathReport = checker.evaluate(changes, mergeBase, designHeadSha);
  const invariantViolations = await runInvariantChecks({
    git,
    baseSha: mergeBase,
    headSha: designHeadSha,
    changes,
  });
  const protection = {
    ...pathReport,
    passed: pathReport.passed && invariantViolations.length === 0,
    violations: [...pathReport.violations, ...invariantViolations],
  };
  if (!protection.passed) {
    blockers.push(
      `The design content violates the Functionality Contract (${protection.violations.length} violation(s)).`,
    );
  }

  if (designHeadSha === mergeBase) {
    blockers.push('The branch contains no design content beyond the merge base — nothing to merge.');
  }

  // ---- 3. Conflict check, without touching any working tree ---------------

  let conflicts: MergeReadinessResult['conflicts'];
  const mergeTree = await git.raw(['merge-tree', '--write-tree', '--name-only', baseSha, designHeadSha]);
  if (mergeTree.exitCode === 0) {
    conflicts = { checked: true, clean: true, files: [] };
  } else if (mergeTree.exitCode === 1) {
    const files = mergeTree.stdout.trim().split('\n').slice(1).filter(Boolean);
    conflicts = { checked: true, clean: false, files };
    blockers.push(
      `Merging into the current base would conflict in ${files.length} file(s): ${files.slice(0, 10).join(', ')}.`,
    );
  } else {
    // Older git without merge-tree --write-tree: report honestly, don't guess.
    conflicts = {
      checked: false,
      reason: `git merge-tree is unavailable (exit ${mergeTree.exitCode}); conflict state was not checked.`,
    };
  }

  const ready = blockers.length === 0;

  return {
    ready,
    engineCommits,
    designHeadSha,
    baseSha,
    protection,
    conflicts,
    blockers,
    instructions: ready
      ? [
          `# Merge the design content, leaving the ${engineCommits.length} temporary engine commit(s) behind:`,
          `git checkout ${options.baseRef.replace(/^refs\/(heads|remotes\/origin)\//, '')}`,
          `git merge --no-ff ${designHeadSha}  # design content only`,
        ]
      : [],
  };
}

/**
 * Engine commits that are NOT part of the contiguous tip run — i.e. reachable
 * from the design head but not from the base. These cannot be peeled off.
 */
async function findBuriedEngineCommits(
  git: GitClient,
  baseSha: string,
  designHeadSha: string,
): Promise<EngineCommit[]> {
  const log = await git.raw(['log', '--format=%H%x00%s', `${baseSha}..${designHeadSha}`]);
  if (!log.ok) return [];

  const buried: EngineCommit[] = [];
  for (const line of log.stdout.split('\n')) {
    const [sha, subject] = line.split('\0');
    if (sha && subject && isEngineCommitSubject(subject)) buried.push({ sha, subject });
  }
  return buried;
}
