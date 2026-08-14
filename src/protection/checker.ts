/**
 * Protection checker.
 *
 * The gate that makes «functionality is frozen» real. It diffs a candidate's
 * branch against the round's base commit and classifies every changed path
 * against the Functionality Contract. No model is consulted: an agent that
 * modifies a protected file fails here regardless of how convincingly it
 * explains itself.
 *
 * Resolution rules:
 *  - Every rule that matches a path is collected; the most specific wins.
 *  - Ties are broken by source priority (user > detected > builtin), then by
 *    severity — when a path is genuinely ambiguous, the stricter reading wins.
 *  - Renames are checked against both the old and the new path, so a protected
 *    file cannot be laundered by moving it.
 */

import type { ProtectionConfig } from '../config/config.js';
import type { ChangedFile, GitClient } from '../git/git-client.js';
import type {
  FunctionalityContract,
  ProtectionLevel,
  ProtectionReport,
  ProtectionRule,
  ProtectionViolation,
} from '../core/schemas.js';
import { compileGlob, type GlobMatcher } from './glob.js';

const SEVERITY: Record<ProtectionLevel, number> = {
  PROTECTED: 3,
  RESTRICTED: 2,
  UNKNOWN: 1,
  DESIGNABLE: 0,
};

interface CompiledRule {
  rule: ProtectionRule;
  matcher: GlobMatcher;
}

export class ProtectionChecker {
  private readonly compiled: CompiledRule[];
  private readonly exceptions: Array<{ matcher: GlobMatcher; reason: string }>;
  private readonly config: ProtectionConfig;
  private readonly defaultLevel: ProtectionLevel;

  constructor(contract: FunctionalityContract, config: ProtectionConfig) {
    this.compiled = contract.rules.map((rule) => ({ rule, matcher: compileGlob(rule.pattern) }));
    this.exceptions = contract.approvedExceptions.map((exception) => ({
      matcher: compileGlob(exception.pattern),
      reason: exception.reason,
    }));
    this.config = config;
    this.defaultLevel = contract.defaultLevel;
  }

  /**
   * Classifies a single repository-relative path. Exposed so the CLI can
   * answer "would this file be allowed?" without running a full diff.
   */
  classify(path: string): { level: ProtectionLevel; rule: ProtectionRule | null } {
    let best: CompiledRule | null = null;

    for (const candidate of this.compiled) {
      if (!candidate.matcher.test(path)) continue;
      if (!best) {
        best = candidate;
        continue;
      }
      if (compareRules(candidate, best) > 0) best = candidate;
    }

    return best ? { level: best.rule.level, rule: best.rule } : { level: this.defaultLevel, rule: null };
  }

  /** True when an approved exception waives protection for this path. */
  exceptionFor(path: string): string | null {
    for (const exception of this.exceptions) {
      if (exception.matcher.test(path)) return exception.reason;
    }
    return null;
  }

  /** Evaluates an already-computed set of changed files. */
  evaluate(changes: readonly ChangedFile[], baseSha: string, headSha: string): ProtectionReport {
    const violations: ProtectionViolation[] = [];
    const unknownPaths: string[] = [];
    const waived: Array<{ path: string; reason: string }> = [];

    for (const change of changes) {
      // A rename touches two paths; both must be permitted.
      const paths = change.previousPath ? [change.path, change.previousPath] : [change.path];
      let recorded = false;

      for (const path of paths) {
        const { level, rule } = this.classify(path);

        if (level === 'DESIGNABLE') continue;

        if (level === 'UNKNOWN') {
          if (!unknownPaths.includes(path)) unknownPaths.push(path);
          if (this.config.failOnUnknown && !recorded) {
            const exception = this.exceptionFor(path);
            if (exception) {
              waived.push({ path, reason: exception });
              continue;
            }
            violations.push({
              path,
              level,
              rule: rule?.pattern ?? '(no matching rule)',
              reason: 'Changed a path that no contract rule covers, and failOnUnknown is enabled.',
              changeType: change.changeType,
              additions: change.additions,
              deletions: change.deletions,
            });
            recorded = true;
          }
          continue;
        }

        if (level === 'RESTRICTED' && !this.config.failOnRestricted) continue;

        const exception = this.exceptionFor(path);
        if (exception) {
          waived.push({ path, reason: exception });
          continue;
        }

        if (recorded) continue;
        violations.push({
          path,
          level,
          rule: rule?.pattern ?? '(no matching rule)',
          reason: rule?.reason ?? 'Protected by the functionality contract.',
          changeType: change.changeType,
          additions: change.additions,
          deletions: change.deletions,
        });
        recorded = true;
      }
    }

    // A change set far larger than any redesign should need is itself a
    // signal — usually a reformat, a dependency reinstall, or a lost worktree.
    if (changes.length > this.config.maxChangedFiles) {
      violations.push({
        path: '(change set)',
        level: 'PROTECTED',
        rule: 'maxChangedFiles',
        reason: `Changed ${changes.length} files, above the configured ceiling of ${this.config.maxChangedFiles}.`,
        changeType: 'modified',
        additions: 0,
        deletions: 0,
      });
    }

    return {
      passed: violations.length === 0,
      baseSha,
      headSha,
      filesChanged: changes.length,
      violations,
      unknownPaths: unknownPaths.slice(0, 200),
      waived,
      checkedAt: new Date().toISOString(),
    };
  }

  /** Diffs base..head in a worktree and evaluates the result. */
  async check(
    git: GitClient,
    options: { baseSha: string; headSha: string; cwd?: string },
  ): Promise<ProtectionReport> {
    const changes = await git.changedFiles(options.baseSha, options.headSha, options.cwd);
    return this.evaluate(changes, options.baseSha, options.headSha);
  }
}

/**
 * Orders two matching rules. Returns > 0 when `a` should win.
 *
 * Source priority comes first: a project's own rule in `designlab.config.json`
 * must override a built-in even when the built-in's pattern is more specific,
 * because the operator knows their codebase and DesignLab does not. Within a
 * single source, the more specific pattern wins, and a genuine tie resolves to
 * the stricter level.
 */
function compareRules(a: CompiledRule, b: CompiledRule): number {
  const bySource = sourceRank(a.rule.source) - sourceRank(b.rule.source);
  if (bySource !== 0) return bySource;

  const bySpecificity = a.matcher.specificity - b.matcher.specificity;
  if (bySpecificity !== 0) return bySpecificity;

  return SEVERITY[a.rule.level] - SEVERITY[b.rule.level];
}

function sourceRank(source: ProtectionRule['source']): number {
  return source === 'user' ? 3 : source === 'detected' ? 2 : 1;
}

/** Operator-facing rendering of a failed protection report. */
export function formatProtectionReport(report: ProtectionReport): string {
  if (report.passed) {
    const waived = report.waived.length > 0 ? `, ${report.waived.length} waived by exception` : '';
    return `Protection check passed: ${report.filesChanged} file(s) changed${waived}.`;
  }

  const lines = [
    `Protection check FAILED: ${report.violations.length} violation(s) across ${report.filesChanged} changed file(s).`,
    '',
  ];

  for (const violation of report.violations.slice(0, 25)) {
    lines.push(
      `  [${violation.level}] ${violation.path} (${violation.changeType}, +${violation.additions}/-${violation.deletions})`,
      `      matched: ${violation.rule}`,
      `      reason:  ${violation.reason}`,
    );
  }

  if (report.violations.length > 25) {
    lines.push(`  …and ${report.violations.length - 25} more.`);
  }

  return lines.join('\n');
}
