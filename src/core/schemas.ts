/**
 * Domain schemas.
 *
 * Every document DesignLab persists, and every structured response it asks a
 * model to produce, is defined here as a Zod schema. Two consequences matter:
 *
 *  1. Persisted state is validated on read, so a corrupt or hand-edited file
 *     fails loudly instead of poisoning a round.
 *  2. The same schemas are converted to JSON Schema and handed to the Claude
 *     CLI via `--json-schema`, so model output is structurally guaranteed
 *     before DesignLab ever looks at it.
 */

import { z } from 'zod';

import { CANDIDATE_SLOTS } from './ids.js';

export const SCHEMA_VERSION = 1;

const isoDate = z.string().datetime({ offset: true }).or(z.string().datetime());
const sha = z.string().regex(/^[0-9a-f]{7,40}$/, 'expected a git object id');
const nonEmpty = z.string().min(1);

export const candidateSlotSchema = z.enum(CANDIDATE_SLOTS);

// ---------------------------------------------------------------------------
// App Manifest
// ---------------------------------------------------------------------------

export const frameworkSchema = z.enum([
  'react-native',
  'expo',
  'flutter',
  'android-native',
  'kotlin-multiplatform',
  'ionic',
  'capacitor',
  'nativescript',
  'unknown',
]);
export type Framework = z.infer<typeof frameworkSchema>;

export const packageManagerSchema = z.enum(['npm', 'yarn', 'pnpm', 'bun', 'pub', 'gradle', 'unknown']);
export type PackageManager = z.infer<typeof packageManagerSchema>;

export const androidBuildSystemSchema = z.enum([
  'gradle',
  'expo-prebuild',
  'eas-build',
  'flutter',
  'capacitor',
  'none',
  'unknown',
]);
export type AndroidBuildSystem = z.infer<typeof androidBuildSystemSchema>;

export const commandSetSchema = z.object({
  install: z.string().nullable().default(null),
  typecheck: z.string().nullable().default(null),
  lint: z.string().nullable().default(null),
  test: z.string().nullable().default(null),
  build: z.string().nullable().default(null),
  androidBuild: z.string().nullable().default(null),
});
export type CommandSet = z.infer<typeof commandSetSchema>;

export const screenSchema = z.object({
  name: nonEmpty,
  path: nonEmpty,
  /** Best-effort role, e.g. "list", "detail", "auth", "map", "settings". */
  role: z.string().default('unknown'),
  /** Whether the analyser believes this screen is design-relevant. */
  designRelevant: z.boolean().default(true),
});
export type Screen = z.infer<typeof screenSchema>;

export const componentSchema = z.object({
  name: nonEmpty,
  path: nonEmpty,
  /** Rough count of import references found across the repo. */
  usageCount: z.number().int().nonnegative().default(0),
});

export const capabilitySchema = z.object({
  /** Capability key, e.g. "auth", "payments", "location". */
  key: nonEmpty,
  present: z.boolean(),
  /** Evidence that led the analyser to this conclusion. */
  evidence: z.array(z.string()).default([]),
  /** Files most associated with this capability. */
  paths: z.array(z.string()).default([]),
  notes: z.string().default(''),
});
export type Capability = z.infer<typeof capabilitySchema>;

export const appManifestSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  projectId: nonEmpty,
  repoUrl: nonEmpty,
  branch: nonEmpty,
  /** Commit the manifest describes. Manifests are cached by this value. */
  sha,
  generatedAt: isoDate,
  appName: nonEmpty,
  appSlug: nonEmpty,
  framework: frameworkSchema,
  frameworkVersion: z.string().nullable().default(null),
  languages: z.array(z.string()).default([]),
  packageManager: packageManagerSchema,
  androidBuildSystem: androidBuildSystemSchema,
  androidPackageId: z.string().nullable().default(null),
  minSdkVersion: z.number().int().nullable().default(null),
  sourceRoots: z.array(z.string()).default([]),
  screens: z.array(screenSchema).default([]),
  navigation: z.object({
    library: z.string().nullable().default(null),
    pattern: z.string().default('unknown'),
    paths: z.array(z.string()).default([]),
  }),
  components: z.array(componentSchema).default([]),
  designSystem: z.object({
    present: z.boolean().default(false),
    themePaths: z.array(z.string()).default([]),
    tokens: z.array(z.string()).default([]),
    stylingApproach: z.string().default('unknown'),
  }),
  stateManagement: z.array(z.string()).default([]),
  capabilities: z.array(capabilitySchema).default([]),
  permissions: z.array(z.string()).default([]),
  nativeModules: z.array(z.string()).default([]),
  apis: z.array(z.string()).default([]),
  backends: z.array(z.string()).default([]),
  testing: z.object({
    frameworks: z.array(z.string()).default([]),
    testPaths: z.array(z.string()).default([]),
    hasTests: z.boolean().default(false),
  }),
  commands: commandSetSchema,
  ci: z.object({
    hasWorkflows: z.boolean().default(false),
    workflowPaths: z.array(z.string()).default([]),
    buildsAndroid: z.boolean().default(false),
    androidWorkflowPath: z.string().nullable().default(null),
  }),
  fileCount: z.number().int().nonnegative().default(0),
  /** True when the walk hit its file cap; analysis may be partial. */
  truncated: z.boolean().default(false),
  /** How the manifest was produced. */
  analysisMode: z.enum(['deterministic', 'ai-enriched']).default('deterministic'),
  /** Free-form notes from the AI enrichment pass. */
  notes: z.array(z.string()).default([]),
});
export type AppManifest = z.infer<typeof appManifestSchema>;

/** The subset an AI enrichment pass is allowed to supply. */
export const manifestEnrichmentSchema = z.object({
  appName: z.string().optional(),
  screens: z.array(screenSchema).max(80).optional(),
  navigationPattern: z.string().optional(),
  stateManagement: z.array(z.string()).max(12).optional(),
  capabilities: z
    .array(z.object({ key: nonEmpty, present: z.boolean(), notes: z.string().default('') }))
    .max(30)
    .optional(),
  designSystemSummary: z.string().optional(),
  notes: z.array(z.string()).max(20).optional(),
});
export type ManifestEnrichment = z.infer<typeof manifestEnrichmentSchema>;

// ---------------------------------------------------------------------------
// Functionality Contract
// ---------------------------------------------------------------------------

export const protectionLevelSchema = z.enum(['PROTECTED', 'RESTRICTED', 'DESIGNABLE', 'UNKNOWN']);
export type ProtectionLevel = z.infer<typeof protectionLevelSchema>;

export const protectionRuleSchema = z.object({
  /** Glob pattern, matched against repository-relative POSIX paths. */
  pattern: nonEmpty,
  level: protectionLevelSchema,
  /** Why this rule exists — surfaced verbatim in gate failures. */
  reason: nonEmpty,
  /** Where the rule came from; user rules always win. */
  source: z.enum(['builtin', 'detected', 'user']).default('detected'),
});
export type ProtectionRule = z.infer<typeof protectionRuleSchema>;

export const behaviourInvariantSchema = z.object({
  id: nonEmpty,
  statement: nonEmpty,
  category: z.string().default('general'),
  /** Files that implement the invariant, if known. */
  paths: z.array(z.string()).default([]),
});
export type BehaviourInvariant = z.infer<typeof behaviourInvariantSchema>;

export const functionalityContractSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  projectId: nonEmpty,
  /** Manifest commit this contract was derived from. */
  manifestSha: sha,
  generatedAt: isoDate,
  principle: z.string().default('Functionality is frozen. Design is flexible.'),
  rules: z.array(protectionRuleSchema),
  invariants: z.array(behaviourInvariantSchema).default([]),
  /**
   * Paths a design may modify even though a broader rule protects them.
   * Every exception must carry a reason; they are recorded, not inferred.
   */
  approvedExceptions: z
    .array(z.object({ pattern: nonEmpty, reason: nonEmpty, approvedBy: z.string().default('config') }))
    .default([]),
  /** Level applied when no rule matches a changed path. */
  defaultLevel: protectionLevelSchema.default('UNKNOWN'),
  notes: z.array(z.string()).default([]),
});
export type FunctionalityContract = z.infer<typeof functionalityContractSchema>;

/** Shape returned by the Fable contract-classification pass. */
export const contractProposalSchema = z.object({
  rules: z
    .array(
      z.object({
        pattern: nonEmpty,
        level: protectionLevelSchema,
        reason: nonEmpty,
      }),
    )
    .max(120),
  invariants: z
    .array(z.object({ id: nonEmpty, statement: nonEmpty, category: z.string().default('general') }))
    .max(40)
    .default([]),
  notes: z.array(z.string()).max(20).default([]),
});
export type ContractProposal = z.infer<typeof contractProposalSchema>;

// ---------------------------------------------------------------------------
// Design briefs
// ---------------------------------------------------------------------------

/** The axes along which DesignLab measures whether two designs truly differ. */
export const DIVERSITY_DIMENSIONS = [
  'informationHierarchy',
  'navigationPresentation',
  'density',
  'screenComposition',
  'interactionModel',
  'visualLanguage',
  'contentEmphasis',
  'spatialModel',
  'typography',
  'componentShape',
  'motion',
  'discoverability',
  'oneHandedUsage',
] as const;
export type DiversityDimension = (typeof DIVERSITY_DIMENSIONS)[number];

export const diversityVectorSchema = z.object(
  Object.fromEntries(DIVERSITY_DIMENSIONS.map((dimension) => [dimension, z.string().min(2)])) as {
    [K in DiversityDimension]: z.ZodString;
  },
);
export type DiversityVector = z.infer<typeof diversityVectorSchema>;

/**
 * Where a design direction came from. Reference-derived candidates carry the
 * supplied mockups through the whole pipeline and into lineage, so "we tried
 * your design against four explorations" is a queryable fact, not folklore.
 */
export const designOriginSchema = z.enum(['FABLE_EXPLORATION', 'REFERENCE_IMAGE']);
export type DesignOrigin = z.infer<typeof designOriginSchema>;

export const designBriefSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  projectId: nonEmpty,
  round: z.number().int().positive(),
  slot: candidateSlotSchema,
  origin: designOriginSchema.default('FABLE_EXPLORATION'),
  /** Absolute paths of the reference images this brief was interpreted from. */
  referenceImages: z.array(z.string()).default([]),
  /** Short kebab identity used in branch names and APK filenames. */
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'expected a kebab-case slug').max(32),
  name: nonEmpty,
  /** One-line statement of the design's point of view. */
  thesis: nonEmpty,
  /** Longer rationale: who this serves and why it might win. */
  rationale: z.string().default(''),
  diversityVector: diversityVectorSchema,
  /** Concrete, checkable instructions for the builder. */
  directives: z.array(nonEmpty).min(3).max(40),
  /** Screens the design must visibly change. */
  targetScreens: z.array(z.string()).default([]),
  /** Things this design must deliberately NOT do — keeps designs apart. */
  antiPatterns: z.array(z.string()).default([]),
  /** What a reviewer should be able to see if the brief was honoured. */
  successCriteria: z.array(nonEmpty).min(1).max(20),
  /** Lineage: brief this one evolved from, if any. */
  parent: z
    .object({ round: z.number().int().positive(), slot: candidateSlotSchema, relation: z.string() })
    .nullable()
    .default(null),
  generatedAt: isoDate,
});
export type DesignBrief = z.infer<typeof designBriefSchema>;

/** Fable's raw round-planning output, before DesignLab stamps identity onto it. */
export const designPlanSchema = z.object({
  strategy: z.string().min(10),
  designs: z
    .array(
      z.object({
        slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(32),
        name: nonEmpty,
        thesis: nonEmpty,
        rationale: z.string().default(''),
        diversityVector: diversityVectorSchema,
        directives: z.array(nonEmpty).min(3).max(40),
        targetScreens: z.array(z.string()).default([]),
        antiPatterns: z.array(z.string()).default([]),
        successCriteria: z.array(nonEmpty).min(1).max(20),
        parentRelation: z.string().default(''),
      }),
    )
    .min(1)
    .max(8),
});
export type DesignPlan = z.infer<typeof designPlanSchema>;

// ---------------------------------------------------------------------------
// Gates, builds, candidates, rounds
// ---------------------------------------------------------------------------

export const gateNameSchema = z.enum([
  'dependencies',
  'typecheck',
  'lint',
  'test',
  'protection',
  'build',
]);
export type GateName = z.infer<typeof gateNameSchema>;

export const gateStatusSchema = z.enum(['passed', 'failed', 'skipped', 'not-configured']);
export type GateStatus = z.infer<typeof gateStatusSchema>;

export const gateResultSchema = z.object({
  gate: gateNameSchema,
  status: gateStatusSchema,
  /** Exact command that ran, or null for internal gates such as protection. */
  command: z.string().nullable().default(null),
  exitCode: z.number().int().nullable().default(null),
  durationMs: z.number().int().nonnegative().default(0),
  /** Trimmed, useful tail of failing output. Never the full log. */
  summary: z.string().default(''),
  /** Why a gate was skipped or reported not-configured. */
  reason: z.string().default(''),
  ranAt: isoDate,
});
export type GateResult = z.infer<typeof gateResultSchema>;

export const protectionViolationSchema = z.object({
  path: nonEmpty,
  level: protectionLevelSchema,
  rule: nonEmpty,
  reason: nonEmpty,
  changeType: z.enum(['added', 'modified', 'deleted', 'renamed']),
  additions: z.number().int().nonnegative().default(0),
  deletions: z.number().int().nonnegative().default(0),
});
export type ProtectionViolation = z.infer<typeof protectionViolationSchema>;

export const protectionReportSchema = z.object({
  passed: z.boolean(),
  baseSha: sha,
  headSha: sha,
  filesChanged: z.number().int().nonnegative(),
  violations: z.array(protectionViolationSchema).default([]),
  /** Changes that matched no rule; reported but not fatal by default. */
  unknownPaths: z.array(z.string()).default([]),
  /** Paths allowed by an approved exception, recorded for audit. */
  waived: z.array(z.object({ path: nonEmpty, reason: nonEmpty })).default([]),
  checkedAt: isoDate,
});
export type ProtectionReport = z.infer<typeof protectionReportSchema>;

export const buildStatusSchema = z.enum([
  'BUILD_NOT_REQUESTED',
  'BUILD_PENDING',
  'BUILD_RUNNING',
  'BUILD_SUCCESS',
  'BUILD_FAILED',
  'BUILD_UNSUPPORTED',
]);
export type BuildStatus = z.infer<typeof buildStatusSchema>;

/**
 * Whether a successfully built artifact can actually be installed on a phone.
 * BUILD_SUCCESS alone is not that claim: an unsigned release APK builds fine
 * and installs nowhere. Debug builds are signed with the debug keystore and
 * install on any device; release builds are installable only when the target
 * has real signing configured.
 */
export const installabilitySchema = z.enum(['DEVICE_INSTALLABLE', 'NOT_INSTALLABLE', 'UNKNOWN']);
export type Installability = z.infer<typeof installabilitySchema>;

export const buildVariantSchema = z.enum(['debug', 'release']);
export type BuildVariant = z.infer<typeof buildVariantSchema>;

export const buildRecordSchema = z.object({
  status: buildStatusSchema.default('BUILD_NOT_REQUESTED'),
  /** Android build variant the workflow was asked to produce. */
  variant: buildVariantSchema.nullable().default(null),
  /** Device-installability assessment; meaningful once BUILD_SUCCESS. */
  installability: installabilitySchema.default('UNKNOWN'),
  /** GitHub Actions workflow file that produces the APK. */
  workflowPath: z.string().nullable().default(null),
  workflowRunId: z.number().int().nullable().default(null),
  workflowRunUrl: z.string().nullable().default(null),
  /** Expected artifact filename; only meaningful once BUILD_SUCCESS. */
  artifactName: z.string().nullable().default(null),
  artifactUrl: z.string().nullable().default(null),
  /** Populated only from a real Actions response. */
  conclusion: z.string().nullable().default(null),
  checkedAt: isoDate.nullable().default(null),
  notes: z.string().default(''),
});
export type BuildRecord = z.infer<typeof buildRecordSchema>;

export const designReviewSchema = z.object({
  briefAdherence: z.number().min(0).max(10),
  distinctiveness: z.number().min(0).max(10),
  internalConsistency: z.number().min(0).max(10),
  functionalityPreservation: z.number().min(0).max(10),
  usability: z.number().min(0).max(10),
  completeness: z.number().min(0).max(10),
  regressionRisk: z.number().min(0).max(10).describe('higher means riskier'),
  verdict: z.enum(['accept', 'revise', 'reject']),
  summary: nonEmpty,
  /** Specific, actionable corrections when the verdict is "revise". */
  corrections: z.array(nonEmpty).max(20).default([]),
  reviewedAt: isoDate.optional(),
});
export type DesignReview = z.infer<typeof designReviewSchema>;

export const candidateStatusSchema = z.enum([
  'planned',
  'worktree-ready',
  'implementing',
  'gates-running',
  'gates-failed',
  'review-pending',
  'revising',
  'rejected',
  'ready',
  'pushed',
  'failed',
]);
export type CandidateStatus = z.infer<typeof candidateStatusSchema>;

/**
 * Record of a temporary per-candidate app identity (suffixed applicationId
 * and display name) applied as a marked, removable engine commit so several
 * candidate APKs can be installed side by side. Never applied silently:
 * `applied: false` plus a reason is recorded when identity was requested but
 * judged unsafe for this target.
 */
export const candidateIdentitySchema = z.object({
  applied: z.boolean(),
  applicationIdSuffix: z.string().nullable().default(null),
  displayName: z.string().nullable().default(null),
  /** Commit that carries the overlay; must be dropped before merge. */
  commit: z.string().nullable().default(null),
  reason: z.string().default(''),
});
export type CandidateIdentity = z.infer<typeof candidateIdentitySchema>;

export const captureStatusSchema = z.enum(['captured', 'unsupported', 'failed', 'skipped']);
export type CaptureStatus = z.infer<typeof captureStatusSchema>;

export const candidateSchema = z.object({
  slot: candidateSlotSchema,
  slug: nonEmpty,
  name: nonEmpty,
  origin: designOriginSchema.default('FABLE_EXPLORATION'),
  status: candidateStatusSchema.default('planned'),
  identity: candidateIdentitySchema.nullable().default(null),
  /** Screenshot paths captured for review; empty until an adapter exists. */
  captures: z.array(z.string()).default([]),
  captureStatus: captureStatusSchema.default('skipped'),
  branch: nonEmpty,
  worktreePath: z.string().nullable().default(null),
  baseSha: sha,
  headSha: z.string().nullable().default(null),
  /**
   * Tip actually pushed to the remote. Differs from `headSha` (the design
   * content) when marked engine commits — build workflow, identity overlay —
   * were appended before the push. Build tracking must match runs against
   * THIS commit; merge-check uses `headSha` as the merge content.
   */
  pushedSha: z.string().nullable().default(null),
  pushed: z.boolean().default(false),
  attempts: z.number().int().nonnegative().default(0),
  escalations: z.number().int().nonnegative().default(0),
  gates: z.array(gateResultSchema).default([]),
  protection: protectionReportSchema.nullable().default(null),
  review: designReviewSchema.nullable().default(null),
  build: buildRecordSchema,
  /** Terminal failure explanation, when status is "failed". */
  failure: z.string().nullable().default(null),
  filesChanged: z.number().int().nonnegative().default(0),
  updatedAt: isoDate,
});
export type Candidate = z.infer<typeof candidateSchema>;

export const roundStatusSchema = z.enum([
  'planning',
  'planned',
  'implementing',
  'reviewing',
  'complete',
  'chosen',
  'aborted',
]);
export type RoundStatus = z.infer<typeof roundStatusSchema>;

export const roundSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  projectId: nonEmpty,
  round: z.number().int().positive(),
  status: roundStatusSchema.default('planning'),
  /** Round this generation evolved from. */
  parentRound: z.number().int().positive().nullable().default(null),
  parentSlot: candidateSlotSchema.nullable().default(null),
  baseBranch: nonEmpty,
  /** Every candidate starts from exactly this commit. */
  baseSha: sha,
  manifestSha: sha,
  strategy: z.string().default(''),
  diversityTarget: z.enum(['low', 'medium', 'high']).default('high'),
  diversityScore: z.number().min(0).max(1).nullable().default(null),
  candidates: z.array(candidateSchema).default([]),
  winner: candidateSlotSchema.nullable().default(null),
  feedback: z.string().nullable().default(null),
  dryRun: z.boolean().default(false),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type Round = z.infer<typeof roundSchema>;

// ---------------------------------------------------------------------------
// Lineage and evolution
// ---------------------------------------------------------------------------

export const lineageEntrySchema = z.object({
  round: z.number().int().positive(),
  parentRound: z.number().int().positive().nullable().default(null),
  parentSlot: candidateSlotSchema.nullable().default(null),
  baseSha: sha,
  winner: candidateSlotSchema.nullable().default(null),
  winnerBranch: z.string().nullable().default(null),
  feedback: z.string().nullable().default(null),
  candidateSlots: z.array(candidateSlotSchema).default([]),
  /** Slots whose design originated from user-supplied reference images. */
  referenceSlots: z.array(candidateSlotSchema).default([]),
  chosenAt: isoDate.nullable().default(null),
  createdAt: isoDate,
});
export type LineageEntry = z.infer<typeof lineageEntrySchema>;

export const lineageSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  projectId: nonEmpty,
  entries: z.array(lineageEntrySchema).default([]),
  updatedAt: isoDate,
});
export type Lineage = z.infer<typeof lineageSchema>;

export const nextGenerationPlanSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  projectId: nonEmpty,
  /** Round the plan will produce. */
  round: z.number().int().positive(),
  parentRound: z.number().int().positive(),
  parentSlot: candidateSlotSchema,
  parentBranch: nonEmpty,
  feedback: z.string().default(''),
  reasoning: z.string().default(''),
  directions: z
    .array(
      z.object({
        slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(32),
        name: nonEmpty,
        thesis: nonEmpty,
        /** How this direction relates to the winner and rejected siblings. */
        relation: nonEmpty,
        /** Ideas carried over from non-winning candidates, if any. */
        borrowsFrom: z.array(candidateSlotSchema).default([]),
        riskLevel: z.enum(['conservative', 'moderate', 'radical']).default('moderate'),
      }),
    )
    .min(1)
    .max(8),
  generatedAt: isoDate,
});
export type NextGenerationPlan = z.infer<typeof nextGenerationPlanSchema>;

// ---------------------------------------------------------------------------
// Project record and usage ledger
// ---------------------------------------------------------------------------

export const projectRecordSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  projectId: nonEmpty,
  repoUrl: nonEmpty,
  /** Local path when the target is a directory rather than a remote. */
  localPath: z.string().nullable().default(null),
  defaultBranch: nonEmpty,
  appName: nonEmpty,
  appSlug: nonEmpty,
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type ProjectRecord = z.infer<typeof projectRecordSchema>;

export const usageEventSchema = z.object({
  ts: isoDate,
  projectId: z.string().default(''),
  round: z.number().int().nullable().default(null),
  slot: z.string().nullable().default(null),
  role: z.string(),
  model: z.string(),
  operation: z.string(),
  durationMs: z.number().int().nonnegative().default(0),
  ok: z.boolean().default(true),
  /** Populated when the underlying runner reports cost/tokens. */
  costUsd: z.number().nullable().default(null),
  inputTokens: z.number().int().nullable().default(null),
  outputTokens: z.number().int().nullable().default(null),
  numTurns: z.number().int().nullable().default(null),
  cacheHit: z.boolean().default(false),
  notes: z.string().default(''),
});
export type UsageEvent = z.infer<typeof usageEventSchema>;

/** Structured verdict returned by the Opus escalation reviewer. */
export const escalationVerdictSchema = z.object({
  diagnosis: nonEmpty,
  rootCause: z.string().default(''),
  recoverable: z.boolean(),
  /** Precise instructions handed back to the Sonnet builder. */
  instructions: z.array(nonEmpty).max(20).default([]),
  /** Files the reviewer believes must change. */
  suspectPaths: z.array(z.string()).max(40).default([]),
  riskNotes: z.string().default(''),
});
export type EscalationVerdict = z.infer<typeof escalationVerdictSchema>;

/**
 * Structured output of the reference-image interpretation pass: the lead
 * agent views user-supplied mockups and translates what is *visible* into a
 * design brief. `uncertainties` is load-bearing — an image shows presentation,
 * not behaviour, and anything the image cannot establish must be named rather
 * than invented. The existing app remains the source of truth for behaviour.
 */
export const referenceInterpretationSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(32),
  name: nonEmpty,
  thesis: nonEmpty,
  rationale: z.string().default(''),
  diversityVector: diversityVectorSchema,
  directives: z.array(nonEmpty).min(3).max(40),
  targetScreens: z.array(z.string()).default([]),
  antiPatterns: z.array(z.string()).default([]),
  successCriteria: z.array(nonEmpty).min(1).max(20),
  /** What the images do NOT establish; behaviour must come from the app. */
  uncertainties: z.array(z.string()).max(20).default([]),
});
export type ReferenceInterpretation = z.infer<typeof referenceInterpretationSchema>;

/**
 * Verdict of the semantic diversity judge: a conceptual check that runs after
 * the cheap lexical filter has passed, catching designs that use different
 * words for the same structural decisions.
 */
export const diversityJudgementSchema = z.object({
  verdict: z.enum(['distinct', 'collision']),
  collidingPairs: z
    .array(z.object({ a: nonEmpty, b: nonEmpty, reason: nonEmpty }))
    .max(10)
    .default([]),
  /** Concrete replanning guidance when the verdict is "collision". */
  guidance: z.string().default(''),
});
export type DiversityJudgement = z.infer<typeof diversityJudgementSchema>;

/** Structured report a Sonnet builder returns after implementing a brief. */
export const builderReportSchema = z.object({
  implemented: z.boolean(),
  summary: nonEmpty,
  filesChanged: z.array(z.string()).max(400).default([]),
  screensTouched: z.array(z.string()).max(80).default([]),
  /** Directives the builder consciously did not implement, with reasons. */
  deviations: z.array(z.object({ directive: nonEmpty, reason: nonEmpty })).max(40).default([]),
  selfCheck: z.string().default(''),
  blockers: z.array(z.string()).max(20).default([]),
});
export type BuilderReport = z.infer<typeof builderReportSchema>;
