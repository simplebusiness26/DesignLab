/**
 * Design round planning.
 *
 * Asks the lead agent (Fable) for N structurally different design directions,
 * scores the result for genuine diversity, and re-plans with specific,
 * named collisions when the set is too homogeneous. The scoring loop is what
 * turns "please make them different" into an enforced requirement.
 */

import type { AgentResponse, AgentRunner } from '../agents/types.js';
import { LEAD_SYSTEM_PROMPT, renderContractContext, renderManifestContext } from '../agents/prompts.js';
import { DesignLabError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { nullLogger } from '../core/logger.js';
import { slotForIndex, slugify, type CandidateSlot } from '../core/ids.js';
import {
  designPlanSchema,
  DIVERSITY_DIMENSIONS,
  type AppManifest,
  type DesignBrief,
  type DesignPlan,
  type FunctionalityContract,
  type Lineage,
  type NextGenerationPlan,
} from '../core/schemas.js';
import { describeDiversityShortfall, scoreDiversity, type DiversityScore } from './diversity.js';

export interface PlanRoundOptions {
  runner: AgentRunner;
  manifest: AppManifest;
  contract: FunctionalityContract;
  repoDir: string;
  round: number;
  designCount: number;
  diversityTarget: 'low' | 'medium' | 'high';
  minDiversityScore: number;
  maxRetries: number;
  timeoutMs?: number;
  logger?: Logger;
  /** Evolution context: the plan produced by `designlab choose`. */
  nextGenerationPlan?: NextGenerationPlan | null;
  lineage?: Lineage | null;
}

export interface PlanRoundResult {
  plan: DesignPlan;
  briefs: DesignBrief[];
  diversity: DiversityScore;
  attempts: number;
  /** True when the accepted plan still fell short of the diversity target. */
  belowTarget: boolean;
}

export async function planRound(options: PlanRoundOptions): Promise<PlanRoundResult> {
  const logger = (options.logger ?? nullLogger).child({ scope: 'design:plan', round: options.round });

  let attempts = 0;
  let best: { plan: DesignPlan; diversity: DiversityScore } | null = null;
  let feedback: string | null = null;

  const maxAttempts = options.maxRetries + 1;

  while (attempts < maxAttempts) {
    attempts += 1;

    // The explicit annotation short-circuits inference through the runner's
    // generic, which TypeScript otherwise reports as circular here.
    const response: AgentResponse<DesignPlan> = await options.runner.run({
      role: 'lead',
      operation: 'plan-round',
      prompt: buildPlanPrompt(options, feedback),
      systemPrompt: LEAD_SYSTEM_PROMPT,
      cwd: options.repoDir,
      outputSchema: designPlanSchema,
      toolPolicy: { allowed: ['Read', 'Glob', 'Grep'], denied: ['Edit', 'Write', 'Bash', 'NotebookEdit'] },
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ledger: { projectId: options.manifest.projectId, round: options.round, slot: null },
    });

    if (!response.ok || !response.data) {
      // A transport or validation failure is worth one more attempt, but not
      // an unbounded loop.
      if (attempts < maxAttempts) {
        logger.warn('design planning attempt failed, retrying', { attempt: attempts, error: response.error });
        feedback = `The previous attempt could not be used: ${response.error ?? 'no data returned'}. Return valid JSON matching the schema.`;
        continue;
      }
      throw new DesignLabError('AGENT_FAILED', `Design planning failed: ${response.error ?? 'no data returned'}`, {
        details: { round: options.round, attempts },
        hint: 'Re-run with --dry-run to verify the pipeline, or check `claude` authentication.',
      });
    }

    const plan = normalisePlan(response.data, options.designCount);
    const diversity = scoreDiversity(
      plan.designs.map((design) => ({ id: design.slug, diversityVector: design.diversityVector, thesis: design.thesis })),
    );

    logger.info('design plan scored', {
      attempt: attempts,
      designs: plan.designs.length,
      diversity: diversity.score,
      required: options.minDiversityScore,
    });

    if (!best || diversity.score > best.diversity.score) best = { plan, diversity };

    if (diversity.score >= options.minDiversityScore) {
      return {
        plan,
        diversity,
        attempts,
        belowTarget: false,
        briefs: toBriefs(plan, options),
      };
    }

    feedback = describeDiversityShortfall(diversity, options.minDiversityScore);
    logger.warn('design set too homogeneous, re-planning', {
      attempt: attempts,
      score: diversity.score,
      weakestPair: diversity.weakestPair ? `${diversity.weakestPair.a}/${diversity.weakestPair.b}` : null,
    });
  }

  if (!best) {
    throw new DesignLabError('AGENT_FAILED', 'Design planning produced no usable plan', {
      details: { round: options.round, attempts },
    });
  }

  // Retries are exhausted. Proceeding with the best set is better than
  // aborting the round, but the shortfall is recorded and surfaced.
  logger.warn('proceeding with the most diverse plan available', {
    score: best.diversity.score,
    required: options.minDiversityScore,
  });

  return {
    plan: best.plan,
    diversity: best.diversity,
    attempts,
    belowTarget: true,
    briefs: toBriefs(best.plan, options),
  };
}

/** Trims/pads the plan to exactly the requested design count and de-dupes slugs. */
export function normalisePlan(plan: DesignPlan, designCount: number): DesignPlan {
  const designs = plan.designs.slice(0, designCount);
  const seen = new Set<string>();

  for (const design of designs) {
    let slug = slugify(design.slug || design.name);
    let suffix = 2;
    while (seen.has(slug)) {
      slug = slugify(`${design.slug || design.name}-${suffix}`);
      suffix += 1;
    }
    seen.add(slug);
    design.slug = slug;
  }

  return { ...plan, designs };
}

function toBriefs(plan: DesignPlan, options: PlanRoundOptions): DesignBrief[] {
  const parentPlan = options.nextGenerationPlan;
  const generatedAt = new Date().toISOString();

  return plan.designs.map((design, index) => {
    const slot: CandidateSlot = slotForIndex(index);
    const direction = parentPlan?.directions.find((entry) => entry.slug === design.slug);
    const relation = direction?.relation ?? design.parentRelation ?? '';

    return {
      schemaVersion: 1 as const,
      projectId: options.manifest.projectId,
      round: options.round,
      slot,
      slug: design.slug,
      name: design.name,
      thesis: design.thesis,
      rationale: design.rationale,
      diversityVector: design.diversityVector,
      directives: design.directives,
      targetScreens: design.targetScreens,
      antiPatterns: design.antiPatterns,
      successCriteria: design.successCriteria,
      parent:
        parentPlan && relation
          ? { round: parentPlan.parentRound, slot: parentPlan.parentSlot, relation }
          : null,
      generatedAt,
    };
  });
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

const DIVERSITY_GUIDANCE: Record<'low' | 'medium' | 'high', string> = {
  low: 'Designs may share an overall structure and differ mainly in visual treatment and density.',
  medium: 'Designs must differ in at least four dimensions, including navigation presentation or information hierarchy.',
  high:
    'Designs must be structurally different systems. Each must take a distinct position on the majority of the ' +
    'dimensions below, and at minimum on information hierarchy, navigation presentation, density and interaction model. ' +
    'If two designs could be described by the same sentence with different adjectives, one of them is wrong.',
};

function buildPlanPrompt(options: PlanRoundOptions, feedback: string | null): string {
  const sections: string[] = [];

  sections.push(
    `You are planning round ${options.round} of a UI design experiment on an existing, working mobile application.`,
    `Produce exactly ${options.designCount} distinct design directions.`,
    '',
    '## The target application',
    '',
    renderManifestContext(options.manifest, { detailed: true }),
    '',
    '## What must not change',
    '',
    renderContractContext(options.contract),
    '',
    '## Diversity requirement',
    '',
    DIVERSITY_GUIDANCE[options.diversityTarget],
    '',
    'Every design must declare its position on all of these dimensions, in a few concrete words each:',
    ...DIVERSITY_DIMENSIONS.map((dimension) => `- ${dimension}`),
    '',
    'Write positions as design decisions, not adjectives. "single scrolling canvas, no tab bar" is a position; ' +
      '"modern and clean" is not.',
  );

  if (options.nextGenerationPlan) {
    const plan = options.nextGenerationPlan;
    sections.push(
      '',
      '## Evolution context',
      '',
      `This round evolves from round ${plan.parentRound}, candidate ${plan.parentSlot} (branch \`${plan.parentBranch}\`).`,
      plan.feedback ? `Human feedback on the previous round: "${plan.feedback}"` : '',
      plan.reasoning ? `Agreed direction for this generation: ${plan.reasoning}` : '',
      '',
      'The directions decided for this generation are:',
      ...plan.directions.map(
        (direction) =>
          `- **${direction.slug}** (${direction.riskLevel}): ${direction.thesis} — ${direction.relation}` +
          (direction.borrowsFrom.length > 0 ? ` [borrows from ${direction.borrowsFrom.join(', ')}]` : ''),
      ),
      '',
      'Use those slugs and honour those relations. Turn each into a full design brief.',
    );
  } else if (options.lineage && options.lineage.entries.length > 0) {
    const history = options.lineage.entries
      .filter((entry) => entry.winner)
      .map((entry) => `- Round ${entry.round}: winner ${entry.winner}${entry.feedback ? ` — "${entry.feedback}"` : ''}`);
    if (history.length > 0) {
      sections.push('', '## Previous rounds', '', ...history);
    }
  }

  sections.push(
    '',
    '## Directives',
    '',
    'For each design, write directives a competent engineer can execute without asking you a question. ' +
      'Reference real screens and components from the manifest above. Say what changes and how, not how it should feel.',
    '',
    'Success criteria must be observable: something a reviewer can confirm by looking at the running app.',
  );

  if (feedback) {
    sections.push(
      '',
      '## Correction required — your previous attempt was rejected',
      '',
      feedback,
      '',
      'Produce a new set that fixes this. Keep the strongest directions and replace the ones that collided.',
    );
  }

  sections.push('', 'Return JSON matching the provided schema. No prose outside the JSON.');

  return sections.filter((section) => section !== '').join('\n');
}
