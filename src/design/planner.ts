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
  diversityJudgementSchema,
  DIVERSITY_DIMENSIONS,
  type AppManifest,
  type DesignBrief,
  type DesignPlan,
  type DiversityJudgement,
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
  /**
   * A reference-derived brief already occupying slot A. Fable's exploratory
   * designs fill the following slots and must be structurally distinct from
   * the reference as well as from each other.
   */
  referenceBrief?: DesignBrief | null;
  /** Run the conceptual diversity judgement after the lexical filter. */
  semanticJudge?: boolean;
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

    // The reference design (when present) participates in scoring: Fable's
    // explorations must be distinct from it too, or the round wastes a slot
    // re-deriving the supplied mockups.
    const scorable = [
      ...(options.referenceBrief
        ? [
            {
              id: `reference:${options.referenceBrief.slug}`,
              diversityVector: options.referenceBrief.diversityVector,
              thesis: options.referenceBrief.thesis,
            },
          ]
        : []),
      ...plan.designs.map((design) => ({
        id: design.slug,
        diversityVector: design.diversityVector,
        thesis: design.thesis,
      })),
    ];
    const diversity = scoreDiversity(scorable);

    logger.info('design plan scored', {
      attempt: attempts,
      designs: plan.designs.length,
      diversity: diversity.score,
      required: options.minDiversityScore,
    });

    if (!best || diversity.score > best.diversity.score) best = { plan, diversity };

    if (diversity.score >= options.minDiversityScore) {
      // Lexical distance passed — cheap filter done. For high-diversity
      // rounds, one conceptual judgement now catches the failure the lexical
      // score cannot: different vocabulary describing the same structural
      // decisions. This is where design intelligence earns its cost.
      if (options.semanticJudge && options.diversityTarget === 'high') {
        const judgement = await judgeDiversitySemantically(options, plan, logger);
        if (judgement && judgement.verdict === 'collision' && attempts < maxAttempts) {
          feedback = formatJudgementFeedback(judgement);
          logger.warn('semantic diversity judge found a conceptual collision, re-planning', {
            attempt: attempts,
            pairs: judgement.collidingPairs.map((pair) => `${pair.a}/${pair.b}`).join(' '),
          });
          continue;
        }
        if (judgement && judgement.verdict === 'collision') {
          // Retries exhausted: proceed, but the shortfall is recorded.
          logger.warn('semantic collision remains after retries; proceeding with the best set', {
            pairs: judgement.collidingPairs.map((pair) => `${pair.a}/${pair.b}`).join(' '),
          });
          return { plan, diversity, attempts, belowTarget: true, briefs: toBriefs(plan, options) };
        }
      }

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

  const slotOffset = options.referenceBrief ? 1 : 0;

  return plan.designs.map((design, index) => {
    const slot: CandidateSlot = slotForIndex(index + slotOffset);
    const direction = parentPlan?.directions.find((entry) => entry.slug === design.slug);
    const relation = direction?.relation ?? design.parentRelation ?? '';

    return {
      schemaVersion: 1 as const,
      projectId: options.manifest.projectId,
      round: options.round,
      slot,
      origin: 'FABLE_EXPLORATION' as const,
      referenceImages: [],
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
// Semantic diversity judgement
// ---------------------------------------------------------------------------

/**
 * One small, tool-free lead-model call judging whether the set is genuinely
 * distinct as *product structure*, not vocabulary. Failure to obtain a
 * judgement is non-fatal: the lexical filter already passed, and a judge
 * outage must not sink a round.
 */
async function judgeDiversitySemantically(
  options: PlanRoundOptions,
  plan: DesignPlan,
  logger: Logger,
): Promise<DiversityJudgement | null> {
  const designs = [
    ...(options.referenceBrief
      ? [{ slug: `reference:${options.referenceBrief.slug}`, thesis: options.referenceBrief.thesis, vector: options.referenceBrief.diversityVector, directives: options.referenceBrief.directives }]
      : []),
    ...plan.designs.map((design) => ({
      slug: design.slug,
      thesis: design.thesis,
      vector: design.diversityVector,
      directives: design.directives,
    })),
  ];

  const sections = designs.map((design) => {
    const vector = Object.entries(design.vector)
      .map(([dimension, value]) => `  - ${dimension}: ${value}`)
      .join('\n');
    return [`### ${design.slug}`, `Thesis: ${design.thesis}`, 'Positions:', vector, 'Key directives:', ...design.directives.slice(0, 6).map((d) => `  - ${d}`)].join('\n');
  });

  const response: AgentResponse<DiversityJudgement> = await options.runner.run({
    role: 'lead',
    operation: 'judge-diversity',
    prompt: [
      'Judge whether these design directions are STRUCTURALLY distinct products, or the same product',
      'described in different vocabulary. A lexical filter has already passed them; your job is the',
      'conceptual check it cannot make.',
      '',
      ...sections,
      '',
      'Two designs collide when a user holding both would experience the same information hierarchy, the',
      'same navigation model, the same density and the same interaction model — regardless of wording,',
      'palette, typography or mood. Adjectives ("premium", "bold", "clean") are not differences.',
      '',
      'If any pair collides, name the pair, state the shared structural decisions in concrete terms, and',
      'give replanning guidance that says what structural position the replacement should take instead.',
      '',
      'Judge from the material above only. Return JSON matching the schema.',
    ].join('\n'),
    systemPrompt: LEAD_SYSTEM_PROMPT,
    cwd: options.repoDir,
    outputSchema: diversityJudgementSchema,
    // Everything needed is in the prompt; no repository access, no tools.
    toolPolicy: { allowed: [], denied: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebFetch', 'WebSearch'] },
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ledger: { projectId: options.manifest.projectId, round: options.round, slot: null },
  });

  if (!response.ok || !response.data) {
    logger.warn('semantic diversity judgement unavailable; lexical score stands', { error: response.error });
    return null;
  }
  return response.data;
}

function formatJudgementFeedback(judgement: DiversityJudgement): string {
  return [
    'A conceptual review found that the set is not structurally diverse, despite different wording:',
    '',
    ...judgement.collidingPairs.map((pair) => `- "${pair.a}" and "${pair.b}": ${pair.reason}`),
    '',
    judgement.guidance || 'Replace one design in each colliding pair with a structurally different position.',
    '',
    'Reminder: a different colour palette, type scale or mood is not a different design. Different',
    'information hierarchy, navigation model, density and interaction model are.',
  ].join('\n');
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

  if (options.referenceBrief) {
    sections.push(
      '',
      '## A reference-derived design already occupies slot A',
      '',
      `Name: ${options.referenceBrief.name}`,
      `Thesis: ${options.referenceBrief.thesis}`,
      '',
      'It was interpreted from mockups the human supplied. Your exploratory designs compete WITH it: each',
      'must be structurally distinct from the reference as well as from each other. Do not re-derive the',
      'reference design; explore the positions it does not occupy.',
    );
  }

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
