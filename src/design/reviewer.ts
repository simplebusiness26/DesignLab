/**
 * Fable design review.
 *
 * Engineering gates prove a candidate compiles, passes tests and respects the
 * contract. They say nothing about whether it is a *good design that honours
 * its brief* — which is the point of the exercise. This stage is where Fable
 * judges the creative work, and where a candidate that is merely a recoloured
 * sibling gets rejected.
 *
 * The economically important behaviour: a candidate that fails creative review
 * but passed engineering is returned to *its own* builder with specific
 * corrections. DesignLab never rebuilds the whole round because one design was
 * weak.
 */

import type { AgentRunner } from '../agents/types.js';
import { LEAD_SYSTEM_PROMPT, renderBriefContext } from '../agents/prompts.js';
import type { Logger } from '../core/logger.js';
import { nullLogger } from '../core/logger.js';
import { designReviewSchema, type DesignBrief, type DesignReview } from '../core/schemas.js';
import type { GitClient } from '../git/git-client.js';

export interface ReviewCandidateOptions {
  runner: AgentRunner;
  brief: DesignBrief;
  worktreePath: string;
  baseSha: string;
  headSha: string;
  git: GitClient;
  /** Briefs of the sibling candidates, used to judge distinctiveness. */
  siblingBriefs: readonly DesignBrief[];
  timeoutMs?: number;
  maxBudgetUsd?: number | null;
  logger?: Logger;
}

export async function reviewCandidate(options: ReviewCandidateOptions): Promise<DesignReview | null> {
  const logger = (options.logger ?? nullLogger).child({
    scope: 'review',
    round: options.brief.round,
    slot: options.brief.slot,
  });

  const diffStat = await options.git
    .diffStat(options.baseSha, options.headSha, options.worktreePath)
    .catch(() => '');

  // A bounded slice of the real diff: enough to judge the work, not enough to
  // blow the context window on a large redesign.
  const diff = await options.git
    .diffText(options.baseSha, options.headSha, [], options.worktreePath)
    .catch(() => '');

  const siblings = options.siblingBriefs
    .filter((brief) => brief.slot !== options.brief.slot)
    .map((brief) => `- ${brief.slot} "${brief.name}": ${brief.thesis}`);

  const response = await options.runner.run({
    role: 'lead',
    operation: 'review-design',
    prompt: [
      `Review the implementation of design ${options.brief.slot} from round ${options.brief.round}.`,
      'It has already passed typecheck, lint, tests and the functionality-contract check. ' +
        'Your job is the design judgment those checks cannot make.',
      '',
      '## The brief it was meant to implement',
      '',
      renderBriefContext(options.brief),
      '',
      siblings.length > 0 ? '## Competing designs in this round' : '',
      siblings.length > 0 ? siblings.join('\n') : '',
      siblings.length > 0
        ? '\nThis candidate must be clearly distinguishable from those. If it is not, that is a rejection.'
        : '',
      '',
      '## Change summary',
      '',
      '```',
      diffStat.slice(0, 3000) || '(no summary available)',
      '```',
      '',
      '## Diff (truncated)',
      '',
      '```diff',
      diff.slice(0, 40_000) || '(no diff available)',
      '```',
      '',
      '## What to assess',
      '',
      'Read the changed files in the working directory to see the full implementation. Then score, honestly:',
      '- brief adherence: were the directives actually implemented, or gestured at?',
      '- distinctiveness: is this a different design, or the same design repainted?',
      '- internal consistency: does the design hold together across screens?',
      '- functionality preservation: does anything look like a behaviour change?',
      '- usability: is it usable one-handed, legible, and navigable?',
      '- completeness: is the whole target surface done, or only the easy screens?',
      '- regression risk: how likely is this to break something subtle? (higher = riskier)',
      '',
      'Verdict rules:',
      '- "accept": the brief was honoured and the design is genuinely distinct.',
      '- "revise": the work is salvageable; list precise corrections the builder can apply.',
      '- "reject": the design is a minor variant of a sibling, or the brief was ignored.',
      '',
      'Be a demanding reviewer. Accepting a weak design costs a whole APK build and a human evaluation slot.',
    ]
      .filter((line) => line !== '')
      .join('\n'),
    systemPrompt: LEAD_SYSTEM_PROMPT,
    cwd: options.worktreePath,
    outputSchema: designReviewSchema,
    toolPolicy: { allowed: ['Read', 'Glob', 'Grep'], denied: ['Edit', 'Write', 'Bash', 'NotebookEdit'] },
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.maxBudgetUsd ? { maxBudgetUsd: options.maxBudgetUsd } : {}),
    ledger: {
      projectId: options.brief.projectId,
      round: options.brief.round,
      slot: options.brief.slot,
    },
  });

  if (!response.ok || !response.data) {
    logger.warn('design review failed', { error: response.error });
    return null;
  }

  return { ...response.data, reviewedAt: new Date().toISOString() };
}

/** The correction text handed back to a builder after a "revise" verdict. */
export function buildRevisionPrompt(review: DesignReview, brief: DesignBrief): string {
  return [
    `Your implementation of design ${brief.slot} passed the engineering checks, but the design review asked for changes.`,
    '',
    `Reviewer summary: ${review.summary}`,
    '',
    'Apply these corrections:',
    ...review.corrections.map((correction, index) => `${index + 1}. ${correction}`),
    '',
    'Do not restart the design. Do not touch PROTECTED paths. Re-run the verification commands when you are done.',
    '',
    '## The brief, unchanged',
    '',
    renderBriefContext(brief),
  ].join('\n');
}

/** Aggregate scoring used for round summaries and status output. */
export function overallScore(review: DesignReview): number {
  const positives =
    review.briefAdherence +
    review.distinctiveness +
    review.internalConsistency +
    review.functionalityPreservation +
    review.usability +
    review.completeness;
  const mean = positives / 6;
  // Regression risk is a penalty, weighted lightly so a bold design is not
  // punished for being ambitious.
  return Math.round((mean - review.regressionRisk * 0.2) * 100) / 100;
}
