import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';

import { DesignLabError } from '../core/errors.js';
import { GitClient } from '../git/git-client.js';

export const XPLORER_TOURNAMENT_B_ID = '2026-08-15-xplorer';
export const XPLORER_TOURNAMENT_B_SOURCE_REPOSITORY = 'simplebusiness26/The-App';
export const XPLORER_TOURNAMENT_B_SOURCE_BRANCH = 'main2.0-Dev';
export const XPLORER_TOURNAMENT_B_SOURCE_COMMIT = '78632b12eeb4e4123b1a767c8b815fe6617681f9';
export const XPLORER_TOURNAMENT_B_SOURCE_TREE = 'd6aa748c66cf90ee5637e793d71feaa6b4cf399a';
export const XPLORER_TOURNAMENT_B_ROUTE_COUNT = 76;
export const XPLORER_DESIGN_TRANSFORMATION_STANDARD = 'knowledge/DESIGN_TRANSFORMATION_STANDARD.md';

export const DESIGN_TRANSFORMATION_DIMENSIONS = [
  'Visual identity',
  'Navigation presentation',
  'Page composition',
  'Information hierarchy',
  'Component/surface language',
  'Interaction/state presentation',
  'Map experience',
  'Cross-route system coherence',
] as const;

export const XPLORER_CHALLENGERS = [
  { slug: 'katie-dill', name: 'Katie Dill', persona: 'knowledge/personas/ux/katie-dill/PERSONA_PACK.md' },
  { slug: 'alex-schleifer', name: 'Alex Schleifer', persona: 'knowledge/personas/ux/alex-schleifer/PERSONA_PACK.md' },
  { slug: 'karri-saarinen', name: 'Karri Saarinen', persona: 'knowledge/personas/ux/karri-saarinen/PERSONA_PACK.md' },
  { slug: 'rauno-freiberg', name: 'Rauno Freiberg', persona: 'knowledge/personas/ux/rauno-freiberg/PERSONA_PACK.md' },
  { slug: 'rasmus-andersson', name: 'Rasmus Andersson', persona: 'knowledge/personas/ux/rasmus-andersson/PERSONA_PACK.md' },
  { slug: 'talia-cotton', name: 'Talia Cotton', persona: 'knowledge/personas/ux/talia-cotton/PERSONA_PACK.md' },
  { slug: 'emil-kowalski', name: 'Emil Kowalski', persona: 'knowledge/personas/ux/emil-kowalski/PERSONA_PACK.md' },
] as const;

export type XplorerChallengerSlug = (typeof XPLORER_CHALLENGERS)[number]['slug'];

export const XPLORER_TOURNAMENT_B_SHARED_INPUTS = [
  'knowledge/tournaments/challengers/2026-08-15-xplorer/TOURNAMENT.md',
  'knowledge/tournaments/challengers/2026-08-15-xplorer/MASTER_PRODUCT_BRIEF.md',
  'knowledge/tournaments/challengers/2026-08-15-xplorer/PRODUCT_TRUTH_ANNEX.md',
  'knowledge/tournaments/challengers/2026-08-15-xplorer/PRODUCT_TRUTH.json',
  'knowledge/prototypes/FULL_APP_HTML_STANDARD.md',
  'knowledge/ANTI_IMITATION_STANDARD.md',
  'knowledge/PERSONA_PERFECT_10_GATE.md',
] as const;

export const PERFECT_10_CATEGORIES = [
  'Product Truth Fidelity',
  'User-Goal Clarity',
  'Whole-App Coherence',
  'Information Architecture & Navigation',
  'Interaction & State Robustness',
  'Accessibility & Inclusion',
  'Trust, Safety & Privacy',
  'Technical & Performance Realism',
  'Persona Research Fidelity',
  'Originality, Craft & Product Potential',
] as const;

const sourceTruthSchema = z.object({
  repository: z.literal(XPLORER_TOURNAMENT_B_SOURCE_REPOSITORY),
  branch_at_freeze: z.literal(XPLORER_TOURNAMENT_B_SOURCE_BRANCH),
  commit: z.literal(XPLORER_TOURNAMENT_B_SOURCE_COMMIT),
  tree: z.literal(XPLORER_TOURNAMENT_B_SOURCE_TREE),
});

const productTruthSchema = z
  .object({
    schema_version: z.string().min(1),
    status: z.literal('locked_shared_input'),
    product: z.literal('Xplorer'),
    tournament: z.literal('Xplorer Challenger Tournament B'),
    source: sourceTruthSchema,
    verification: z.object({ declared_route_count: z.literal(XPLORER_TOURNAMENT_B_ROUTE_COUNT) }).passthrough(),
    routes: z.array(z.string()).length(XPLORER_TOURNAMENT_B_ROUTE_COUNT),
    identity: z
      .object({
        universal_identity: z.literal('Explorer'),
        manager_is_separate_identity: z.literal(false),
        friend_model: z.literal('mutual follows'),
        friend_request_exists: z.literal(false),
      })
      .passthrough(),
    creation_invariants: z
      .object({
        moment_starts_at_camera: z.literal(true),
        memory_starts_at_camera: z.literal(true),
        display_surfaces_may_bypass_camera: z.literal(false),
        generic_create_hub_present: z.literal(false),
      })
      .passthrough(),
    presence: z
      .object({
        checkin_valid_target_families: z.array(z.string()).min(2),
        expires: z.literal(true),
        local_public_audience_button: z.literal(false),
      })
      .passthrough(),
  })
  .passthrough();

const designDeltaDimensionSchema = z.object({
  dimension: z.enum(DESIGN_TRANSFORMATION_DIMENSIONS),
  rating: z.enum(['major', 'moderate']),
  evidence: z.array(z.string().min(12)).min(1),
});

export const challengerDesignDeltaSchema = z.object({
  schemaVersion: z.literal(1),
  challenger: z.enum(XPLORER_CHALLENGERS.map((item) => item.slug) as [XplorerChallengerSlug, ...XplorerChallengerSlug[]]),
  sourceCommit: z.literal(XPLORER_TOURNAMENT_B_SOURCE_COMMIT),
  sameDesign: z.literal(false),
  dimensions: z.array(designDeltaDimensionSchema).length(DESIGN_TRANSFORMATION_DIMENSIONS.length),
  screenFamilies: z.array(
    z.object({
      family: z.string().min(2),
      structuralChange: z.boolean(),
      evidence: z.string().min(12),
    }),
  ).min(10),
  paletteIndependence: z.string().min(40),
  designedFromPersonaModel: z.literal(true),
});
export type ChallengerDesignDelta = z.infer<typeof challengerDesignDeltaSchema>;

const perfect10ScoreSchema = z.object({
  category: z.enum(PERFECT_10_CATEGORIES),
  score: z.literal(5),
  evidence: z.array(z.string().min(8)).min(1),
});

export const challengerPerfect10Schema = z.object({
  schemaVersion: z.literal(1),
  challenger: z.enum(XPLORER_CHALLENGERS.map((item) => item.slug) as [XplorerChallengerSlug, ...XplorerChallengerSlug[]]),
  sourceCommit: z.literal(XPLORER_TOURNAMENT_B_SOURCE_COMMIT),
  scores: z.array(perfect10ScoreSchema).length(PERFECT_10_CATEGORIES.length),
  allPassed: z.literal(true),
  reviewedAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
});
export type ChallengerPerfect10 = z.infer<typeof challengerPerfect10Schema>;

export const challengerProductTruthCheckSchema = z.object({
  schemaVersion: z.literal(1),
  challenger: z.enum(XPLORER_CHALLENGERS.map((item) => item.slug) as [XplorerChallengerSlug, ...XplorerChallengerSlug[]]),
  sourceCommit: z.literal(XPLORER_TOURNAMENT_B_SOURCE_COMMIT),
  checks: z
    .array(
      z.object({
        id: z.string().min(2),
        passed: z.literal(true),
        evidence: z.string().min(8),
      }),
    )
    .min(20),
  violations: z.array(z.never()).length(0),
  passed: z.literal(true),
  checkedAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
});
export type ChallengerProductTruthCheck = z.infer<typeof challengerProductTruthCheckSchema>;

export const challengerResultSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.literal('locked'),
  challenger: z.enum(XPLORER_CHALLENGERS.map((item) => item.slug) as [XplorerChallengerSlug, ...XplorerChallengerSlug[]]),
  sourceRepository: z.literal(XPLORER_TOURNAMENT_B_SOURCE_REPOSITORY),
  sourceCommit: z.literal(XPLORER_TOURNAMENT_B_SOURCE_COMMIT),
  sourceTree: z.literal(XPLORER_TOURNAMENT_B_SOURCE_TREE),
  sharedInputFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  personaFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  prototype: z.literal('prototype/index.html'),
  designThesis: z.literal('DESIGN_THESIS.md'),
  selfReview: z.literal('SELF_REVIEW.md'),
  perfect10: z.literal('PERFECT_10.json'),
  productTruthCheck: z.literal('PRODUCT_TRUTH_CHECK.json'),
  completedAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
});
export type ChallengerResult = z.infer<typeof challengerResultSchema>;

export interface FileFingerprint {
  path: string;
  sha256: string;
  bytes: number;
}

export interface TournamentBValidation {
  ok: true;
  root: string;
  sourceCommit: string;
  sourceTree: string;
  routeCount: number;
  sharedInputs: FileFingerprint[];
  sharedInputFingerprint: string;
  personas: Array<{ slug: XplorerChallengerSlug; name: string; path: string; sha256: string; bytes: number }>;
}

export interface ChallengerPacket {
  schemaVersion: 1;
  tournament: 'Xplorer Challenger Tournament B';
  challenger: XplorerChallengerSlug;
  challengerName: string;
  order: number;
  sourceRepository: typeof XPLORER_TOURNAMENT_B_SOURCE_REPOSITORY;
  sourceBranchAtFreeze: typeof XPLORER_TOURNAMENT_B_SOURCE_BRANCH;
  sourceCommit: typeof XPLORER_TOURNAMENT_B_SOURCE_COMMIT;
  sourceTree: typeof XPLORER_TOURNAMENT_B_SOURCE_TREE;
  sharedInputFingerprint: string;
  personaFingerprint: string;
  sharedInputs: FileFingerprint[];
  personaPath: string;
  requiredOutputs: readonly string[];
  transformationStandard?: FileFingerprint;
  executionPrompt: string;
}

export interface PrepareChallengerOptions {
  knowledgeRoot: string;
  challenger: string;
  /** Optional local Xplorer clone. When supplied the frozen commit must exist. */
  sourceRepoDir?: string;
  /** Materialise RUN_PACKET.md and RUN_PACKET.json inside the challenger folder. */
  write?: boolean;
}

export interface ValidateChallengerResultOptions {
  knowledgeRoot: string;
  challenger: string;
}

const REQUIRED_OUTPUTS = [
  'prototype/index.html',
  'DESIGN_THESIS.md',
  'SELF_REVIEW.md',
  'PERFECT_10.json',
  'PRODUCT_TRUTH_CHECK.json',
  'RESULT.json',
] as const;

function challengerBySlug(slug: string) {
  return XPLORER_CHALLENGERS.find((item) => item.slug === slug) ?? null;
}

function tournamentDir(root: string): string {
  return join(root, 'knowledge', 'tournaments', 'challengers', XPLORER_TOURNAMENT_B_ID);
}

function candidateDir(root: string, slug: XplorerChallengerSlug): string {
  return join(tournamentDir(root), 'candidates', slug);
}

async function readRequired(root: string, relativePath: string): Promise<string> {
  const absolute = join(root, relativePath);
  let text: string;
  try {
    text = await readFile(absolute, 'utf8');
  } catch (error) {
    throw new DesignLabError('CONFIG_MISSING', `Tournament B required input is missing: ${relativePath}`, {
      cause: error,
      details: { path: absolute },
    });
  }
  if (text.trim().length === 0) {
    throw new DesignLabError('STATE_CORRUPT', `Tournament B required input is empty: ${relativePath}`);
  }
  return text;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function combinedFingerprint(files: readonly FileFingerprint[]): string {
  const canonical = [...files]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => `${file.path}\0${file.sha256}\0${file.bytes}`)
    .join('\n');
  return sha256(`${XPLORER_TOURNAMENT_B_SOURCE_COMMIT}\n${canonical}`);
}

async function fingerprintFile(root: string, relativePath: string): Promise<FileFingerprint> {
  const text = await readRequired(root, relativePath);
  return { path: relativePath, sha256: sha256(text), bytes: Buffer.byteLength(text, 'utf8') };
}

export async function validateXplorerTournamentB(knowledgeRoot: string): Promise<TournamentBValidation> {
  const root = resolve(knowledgeRoot);
  const sharedInputs: FileFingerprint[] = [];
  for (const path of XPLORER_TOURNAMENT_B_SHARED_INPUTS) {
    sharedInputs.push(await fingerprintFile(root, path));
  }

  const productTruthText = await readRequired(
    root,
    'knowledge/tournaments/challengers/2026-08-15-xplorer/PRODUCT_TRUTH.json',
  );
  let parsedTruth: unknown;
  try {
    parsedTruth = JSON.parse(productTruthText);
  } catch (error) {
    throw new DesignLabError('STATE_CORRUPT', 'Tournament B PRODUCT_TRUTH.json is not valid JSON.', { cause: error });
  }
  const truth = productTruthSchema.safeParse(parsedTruth);
  if (!truth.success) {
    throw new DesignLabError('STATE_CORRUPT', 'Tournament B PRODUCT_TRUTH.json does not match the locked source contract.', {
      details: { issues: truth.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) },
    });
  }

  if (new Set(truth.data.routes).size !== XPLORER_TOURNAMENT_B_ROUTE_COUNT) {
    throw new DesignLabError('STATE_CORRUPT', 'Tournament B route manifest contains duplicate routes.', {
      details: { routeCount: truth.data.routes.length, unique: new Set(truth.data.routes).size },
    });
  }

  const personas: TournamentBValidation['personas'] = [];
  for (const challenger of XPLORER_CHALLENGERS) {
    const text = await readRequired(root, challenger.persona);
    if (text.length < 4_000) {
      throw new DesignLabError('STATE_CORRUPT', `Persona pack is unexpectedly small: ${challenger.persona}`, {
        details: { bytes: Buffer.byteLength(text, 'utf8') },
      });
    }
    personas.push({
      slug: challenger.slug,
      name: challenger.name,
      path: challenger.persona,
      sha256: sha256(text),
      bytes: Buffer.byteLength(text, 'utf8'),
    });
  }

  return {
    ok: true,
    root,
    sourceCommit: XPLORER_TOURNAMENT_B_SOURCE_COMMIT,
    sourceTree: XPLORER_TOURNAMENT_B_SOURCE_TREE,
    routeCount: truth.data.routes.length,
    sharedInputs,
    sharedInputFingerprint: combinedFingerprint(sharedInputs),
    personas,
  };
}

async function assertFrozenCommitAvailable(sourceRepoDir: string): Promise<void> {
  const repo = resolve(sourceRepoDir);
  const git = new GitClient({ cwd: repo });
  if (!(await git.isRepository())) {
    throw new DesignLabError('GIT_FAILED', `--source-repo is not a Git repository: ${repo}`);
  }
  const resolved = await git.tryRevParse(`${XPLORER_TOURNAMENT_B_SOURCE_COMMIT}^{commit}`);
  if (!resolved || !resolved.startsWith(XPLORER_TOURNAMENT_B_SOURCE_COMMIT)) {
    throw new DesignLabError('GIT_FAILED', 'The local Xplorer clone does not contain the frozen Tournament B commit.', {
      details: { repo, required: XPLORER_TOURNAMENT_B_SOURCE_COMMIT },
      hint: `Fetch ${XPLORER_TOURNAMENT_B_SOURCE_BRANCH} from ${XPLORER_TOURNAMENT_B_SOURCE_REPOSITORY} before preparing a candidate.`,
    });
  }
}

async function assertPreviousChallengersLocked(root: string, index: number): Promise<void> {
  for (let prior = 0; prior < index; prior += 1) {
    const challenger = XPLORER_CHALLENGERS[prior];
    if (!challenger) continue;
    await validateXplorerChallengerResult({ knowledgeRoot: root, challenger: challenger.slug }).catch((error: unknown) => {
      throw new DesignLabError(
        'CANDIDATE_NOT_FOUND',
        `Tournament B is sequential: ${challenger.name} must be fully locked before the next challenger starts.`,
        { cause: error, details: { requiredPreviousChallenger: challenger.slug } },
      );
    });
  }
}

export async function prepareXplorerChallengerPacket(options: PrepareChallengerOptions): Promise<ChallengerPacket> {
  const root = resolve(options.knowledgeRoot);
  const challenger = challengerBySlug(options.challenger);
  if (!challenger) {
    throw new DesignLabError('CANDIDATE_NOT_FOUND', `Unknown Tournament B challenger: ${options.challenger}`, {
      details: { allowed: XPLORER_CHALLENGERS.map((item) => item.slug) },
    });
  }

  const validation = await validateXplorerTournamentB(root);
  const index = XPLORER_CHALLENGERS.findIndex((item) => item.slug === challenger.slug);
  await assertPreviousChallengersLocked(root, index);
  if (options.sourceRepoDir) await assertFrozenCommitAvailable(options.sourceRepoDir);

  const sharedSections: string[] = [];
  for (const input of XPLORER_TOURNAMENT_B_SHARED_INPUTS) {
    const contents = await readRequired(root, input);
    sharedSections.push(`\n\n===== BEGIN ${input} =====\n${contents.trim()}\n===== END ${input} =====`);
  }
  const personaText = await readRequired(root, challenger.persona);
  const personaFingerprint = sha256(personaText);
  const transformationText = index === 0 ? null : await readRequired(root, XPLORER_DESIGN_TRANSFORMATION_STANDARD);
  const transformationStandard = transformationText
    ? {
        path: XPLORER_DESIGN_TRANSFORMATION_STANDARD,
        sha256: sha256(transformationText),
        bytes: Buffer.byteLength(transformationText, 'utf8'),
      }
    : undefined;
  const requiredOutputs = index === 0 ? [...REQUIRED_OUTPUTS] : [...REQUIRED_OUTPUTS, 'DESIGN_DELTA.json'];

  const executionPrompt = [
    `You are executing Challenger ${index + 1} of ${XPLORER_CHALLENGERS.length}: ${challenger.name}.`,
    '',
    'This is Xplorer Challenger Tournament B. The shared Product Truth is frozen. The persona is the only intended variable.',
    `Source repository: ${XPLORER_TOURNAMENT_B_SOURCE_REPOSITORY}`,
    `Frozen branch at capture: ${XPLORER_TOURNAMENT_B_SOURCE_BRANCH}`,
    `Frozen source commit: ${XPLORER_TOURNAMENT_B_SOURCE_COMMIT}`,
    `Frozen source tree: ${XPLORER_TOURNAMENT_B_SOURCE_TREE}`,
    '',
    'NON-NEGOTIABLE EXECUTION RULES',
    '1. Work only from the frozen Xplorer source commit. Do not use the moving branch head.',
    '2. Use the complete shared Product Truth package below. Where it conflicts with frozen source, frozen source wins.',
    `3. Load ONLY ${challenger.name}'s persona pack. Do not inspect, mention or borrow another challenger.` ,
    '4. Inspect the actual Xplorer source relevant to this persona before making design decisions.',
    '5. Redesign the whole product as one coherent Xplorer. Do not produce showcase screens only.',
    '6. You may reorganise navigation and information architecture, but may not invent product behaviour or weaken privacy, permission or ownership rules.',
    '7. Follow the anti-imitation standard. Apply professional reasoning; do not copy trade dress or famous product screens.',
    '8. Produce one resolved candidate, not a menu of directions.',
    '9. Run persona-specific self-review, Product Truth validation and the global Perfect-10 gate. A single score below 5/5 blocks submission.',
    '10. Do not mark RESULT.json locked until every required artifact exists and every gate genuinely passes.',
    ...(transformationText
      ? [
          '11. Existing Xplorer UI is NOT a template. Product Truth is locked; the current visual/layout system is not.',
          '12. Create the design from this persona product model first, then implement it. A reskin or simplified old layout automatically fails.',
          '13. Prove major transformation across visual identity, navigation, composition, hierarchy, components, state presentation, map experience and cross-route coherence.',
          '14. At least eight of the ten mandatory screen families must have structural change; at least six of eight transformation dimensions must be major.',
          '15. Do not begin APK compilation until the Design Transformation gate passes.',
        ]
      : []),
    '',
    'REQUIRED OUTPUTS',
    ...requiredOutputs.map((output) => `- candidates/${challenger.slug}/${output}`),
    '',
    'The prototype must be a standalone mobile-friendly whole-app HTML candidate. It may simulate real data but may not add fake capabilities.',
    '',
    '===== BEGIN SELECTED PERSONA PACK =====',
    personaText.trim(),
    '===== END SELECTED PERSONA PACK =====',
    ...(transformationText
      ? [
          '',
          '===== BEGIN DESIGN TRANSFORMATION STANDARD =====',
          transformationText.trim(),
          '===== END DESIGN TRANSFORMATION STANDARD =====',
        ]
      : []),
    ...sharedSections,
    '',
    'FINAL SUBMISSION CONTRACT',
    `- RESULT.json challenger must be "${challenger.slug}" and sourceCommit must be ${XPLORER_TOURNAMENT_B_SOURCE_COMMIT}.`,
    `- RESULT.json sharedInputFingerprint must be ${validation.sharedInputFingerprint}.`,
    `- RESULT.json personaFingerprint must be ${personaFingerprint}.`,
    '- PRODUCT_TRUTH_CHECK.json must contain at least 20 evidence-backed checks, all passed, with zero violations.',
    '- PERFECT_10.json must contain exactly the ten DesignLab categories, every score exactly 5, each with concrete evidence.',
    '- SELF_REVIEW.md must explicitly review the candidate through the selected persona reasoning, including weaknesses found and corrected.',
    ...(transformationText
      ? [
          `- DESIGN_DELTA.json must use transformation standard SHA-256 ${transformationStandard?.sha256}.`,
          '- DESIGN_DELTA.json must prove sameDesign=false, all eight dimensions changed, at least six major dimensions, ten screen families and at least eight structural changes.',
        ]
      : []),
    '- The candidate remains blocked until deterministic runtime validation accepts all of the above.',
  ].join('\n');

  const packet: ChallengerPacket = {
    schemaVersion: 1,
    tournament: 'Xplorer Challenger Tournament B',
    challenger: challenger.slug,
    challengerName: challenger.name,
    order: index + 1,
    sourceRepository: XPLORER_TOURNAMENT_B_SOURCE_REPOSITORY,
    sourceBranchAtFreeze: XPLORER_TOURNAMENT_B_SOURCE_BRANCH,
    sourceCommit: XPLORER_TOURNAMENT_B_SOURCE_COMMIT,
    sourceTree: XPLORER_TOURNAMENT_B_SOURCE_TREE,
    sharedInputFingerprint: validation.sharedInputFingerprint,
    personaFingerprint,
    sharedInputs: validation.sharedInputs,
    personaPath: challenger.persona,
    requiredOutputs,
    transformationStandard,
    executionPrompt,
  };

  if (options.write) {
    const outDir = candidateDir(root, challenger.slug);
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'RUN_PACKET.md'), `${executionPrompt}\n`, 'utf8');
    await writeFile(
      join(outDir, 'RUN_PACKET.json'),
      `${JSON.stringify({ ...packet, executionPrompt: undefined }, null, 2)}\n`,
      'utf8',
    );
  }

  return packet;
}

async function readJsonFile(path: string, label: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    throw new DesignLabError('CANDIDATE_NOT_FOUND', `${label} is missing.`, { cause: error, details: { path } });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new DesignLabError('STATE_CORRUPT', `${label} is not valid JSON.`, { cause: error, details: { path } });
  }
}

async function assertSubstantialFile(path: string, label: string, minimumBytes: number): Promise<void> {
  let info;
  try {
    info = await stat(path);
  } catch (error) {
    throw new DesignLabError('CANDIDATE_NOT_FOUND', `${label} is missing.`, { cause: error, details: { path } });
  }
  if (!info.isFile() || info.size < minimumBytes) {
    throw new DesignLabError('STATE_CORRUPT', `${label} is incomplete.`, {
      details: { path, bytes: info.size, minimumBytes },
    });
  }
}

function assertPerfect10CategoryCoverage(review: ChallengerPerfect10): void {
  const categories = review.scores.map((score) => score.category);
  const unique = new Set(categories);
  if (unique.size !== PERFECT_10_CATEGORIES.length) {
    throw new DesignLabError('STATE_CORRUPT', 'PERFECT_10.json repeats or omits a DesignLab category.', {
      details: { categories },
    });
  }
  for (const category of PERFECT_10_CATEGORIES) {
    if (!unique.has(category)) {
      throw new DesignLabError('STATE_CORRUPT', `PERFECT_10.json is missing: ${category}`);
    }
  }
}

export async function validateXplorerChallengerResult(
  options: ValidateChallengerResultOptions,
): Promise<{ ok: true; result: ChallengerResult; perfect10: ChallengerPerfect10; truthCheck: ChallengerProductTruthCheck }> {
  const root = resolve(options.knowledgeRoot);
  const challenger = challengerBySlug(options.challenger);
  if (!challenger) {
    throw new DesignLabError('CANDIDATE_NOT_FOUND', `Unknown Tournament B challenger: ${options.challenger}`);
  }

  const validation = await validateXplorerTournamentB(root);
  const index = XPLORER_CHALLENGERS.findIndex((item) => item.slug === challenger.slug);
  const persona = validation.personas.find((item) => item.slug === challenger.slug);
  if (!persona) throw new DesignLabError('STATE_CORRUPT', `Persona fingerprint missing for ${challenger.slug}.`);

  const dir = candidateDir(root, challenger.slug);
  await assertSubstantialFile(join(dir, 'prototype', 'index.html'), 'whole-app prototype', 1_000);
  await assertSubstantialFile(join(dir, 'DESIGN_THESIS.md'), 'design thesis', 150);
  await assertSubstantialFile(join(dir, 'SELF_REVIEW.md'), 'persona self-review', 300);

  if (index > 0) {
    await assertSubstantialFile(join(dir, 'DESIGN_DELTA.json'), 'design transformation proof', 500);
    const deltaParsed = challengerDesignDeltaSchema.safeParse(
      await readJsonFile(join(dir, 'DESIGN_DELTA.json'), 'DESIGN_DELTA.json'),
    );
    if (!deltaParsed.success) {
      throw new DesignLabError('STATE_CORRUPT', 'DESIGN_DELTA.json did not pass the Design Transformation schema.', {
        details: { issues: deltaParsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) },
      });
    }
    if (deltaParsed.data.challenger !== challenger.slug) {
      throw new DesignLabError('STATE_CORRUPT', 'DESIGN_DELTA.json belongs to a different challenger.');
    }
    const dimensionNames = deltaParsed.data.dimensions.map((item) => item.dimension);
    if (new Set(dimensionNames).size !== DESIGN_TRANSFORMATION_DIMENSIONS.length) {
      throw new DesignLabError('STATE_CORRUPT', 'DESIGN_DELTA.json repeats or omits a transformation dimension.');
    }
    for (const dimension of DESIGN_TRANSFORMATION_DIMENSIONS) {
      if (!dimensionNames.includes(dimension)) {
        throw new DesignLabError('STATE_CORRUPT', `DESIGN_DELTA.json is missing transformation dimension: ${dimension}`);
      }
    }
    const majorDimensions = deltaParsed.data.dimensions.filter((item) => item.rating === 'major').length;
    if (majorDimensions < 6) {
      throw new DesignLabError('STATE_CORRUPT', 'Design Transformation gate requires at least six major dimensions.', {
        details: { majorDimensions, required: 6 },
      });
    }
    const familyNames = deltaParsed.data.screenFamilies.map((item) => item.family.toLowerCase());
    if (new Set(familyNames).size !== familyNames.length) {
      throw new DesignLabError('STATE_CORRUPT', 'DESIGN_DELTA.json contains duplicate screen families.');
    }
    const structuralFamilies = deltaParsed.data.screenFamilies.filter((item) => item.structuralChange).length;
    if (structuralFamilies < 8) {
      throw new DesignLabError('STATE_CORRUPT', 'Design Transformation gate requires at least eight structurally changed screen families.', {
        details: { structuralFamilies, required: 8 },
      });
    }
  }

  const resultParsed = challengerResultSchema.safeParse(await readJsonFile(join(dir, 'RESULT.json'), 'RESULT.json'));
  if (!resultParsed.success) {
    throw new DesignLabError('STATE_CORRUPT', 'RESULT.json does not match the Tournament B lock schema.', {
      details: { issues: resultParsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) },
    });
  }
  const result = resultParsed.data;
  if (result.challenger !== challenger.slug) {
    throw new DesignLabError('STATE_CORRUPT', 'RESULT.json belongs to a different challenger.');
  }
  if (result.sharedInputFingerprint !== validation.sharedInputFingerprint) {
    throw new DesignLabError('STATE_CORRUPT', 'Candidate was built from a different shared Product Truth package.', {
      details: { expected: validation.sharedInputFingerprint, actual: result.sharedInputFingerprint },
    });
  }
  if (result.personaFingerprint !== persona.sha256) {
    throw new DesignLabError('STATE_CORRUPT', 'Candidate was built from a different persona pack.', {
      details: { expected: persona.sha256, actual: result.personaFingerprint },
    });
  }

  const perfectParsed = challengerPerfect10Schema.safeParse(
    await readJsonFile(join(dir, 'PERFECT_10.json'), 'PERFECT_10.json'),
  );
  if (!perfectParsed.success) {
    throw new DesignLabError('STATE_CORRUPT', 'PERFECT_10.json does not prove ten 5/5 scores.', {
      details: { issues: perfectParsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) },
    });
  }
  if (perfectParsed.data.challenger !== challenger.slug) {
    throw new DesignLabError('STATE_CORRUPT', 'PERFECT_10.json belongs to a different challenger.');
  }
  assertPerfect10CategoryCoverage(perfectParsed.data);

  const truthParsed = challengerProductTruthCheckSchema.safeParse(
    await readJsonFile(join(dir, 'PRODUCT_TRUTH_CHECK.json'), 'PRODUCT_TRUTH_CHECK.json'),
  );
  if (!truthParsed.success) {
    throw new DesignLabError('STATE_CORRUPT', 'PRODUCT_TRUTH_CHECK.json did not pass the Tournament B truth gate.', {
      details: { issues: truthParsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) },
    });
  }
  if (truthParsed.data.challenger !== challenger.slug) {
    throw new DesignLabError('STATE_CORRUPT', 'PRODUCT_TRUTH_CHECK.json belongs to a different challenger.');
  }
  if (new Set(truthParsed.data.checks.map((check) => check.id)).size !== truthParsed.data.checks.length) {
    throw new DesignLabError('STATE_CORRUPT', 'PRODUCT_TRUTH_CHECK.json contains duplicate check ids.');
  }

  const prototype = await readFile(join(dir, 'prototype', 'index.html'), 'utf8');
  if (!/<html[\s>]/i.test(prototype) || !/<body[\s>]/i.test(prototype)) {
    throw new DesignLabError('STATE_CORRUPT', 'prototype/index.html is not a standalone HTML document.');
  }

  return { ok: true, result, perfect10: perfectParsed.data, truthCheck: truthParsed.data };
}

export async function tournamentBStatus(knowledgeRoot: string): Promise<{
  sourceCommit: string;
  sharedInputFingerprint: string;
  challengers: Array<{ slug: XplorerChallengerSlug; name: string; order: number; status: 'locked' | 'next' | 'blocked' }>;
}> {
  const root = resolve(knowledgeRoot);
  const validation = await validateXplorerTournamentB(root);
  const statuses: Array<{ slug: XplorerChallengerSlug; name: string; order: number; status: 'locked' | 'next' | 'blocked' }> = [];
  let foundUnlocked = false;

  for (let index = 0; index < XPLORER_CHALLENGERS.length; index += 1) {
    const challenger = XPLORER_CHALLENGERS[index];
    if (!challenger) continue;
    let locked = false;
    try {
      await validateXplorerChallengerResult({ knowledgeRoot: root, challenger: challenger.slug });
      locked = true;
    } catch {
      locked = false;
    }
    if (locked && !foundUnlocked) {
      statuses.push({ slug: challenger.slug, name: challenger.name, order: index + 1, status: 'locked' });
    } else if (!foundUnlocked) {
      foundUnlocked = true;
      statuses.push({ slug: challenger.slug, name: challenger.name, order: index + 1, status: 'next' });
    } else {
      statuses.push({ slug: challenger.slug, name: challenger.name, order: index + 1, status: 'blocked' });
    }
  }

  return {
    sourceCommit: XPLORER_TOURNAMENT_B_SOURCE_COMMIT,
    sharedInputFingerprint: validation.sharedInputFingerprint,
    challengers: statuses,
  };
}
