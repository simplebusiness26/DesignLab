/**
 * Public library surface.
 *
 * DesignLab is primarily a CLI, but the engine is usable as a library so a
 * future dashboard or service can drive rounds without shelling out. Only
 * stable, documented pieces are exported here.
 */

// Core
export { DesignLabError, EXIT_CODES, exitCodeFor, isDesignLabError, type ErrorCode } from './core/errors.js';
export { Logger, nullLogger, resolveLogLevel, type LogLevel } from './core/logger.js';
export { DesignLabPaths, createPaths, CONFIG_FILENAME } from './core/paths.js';
export { Store } from './core/store.js';
export { runRound, mapWithConcurrency, type RunRoundOptions, type RunRoundResult } from './core/orchestrator.js';
export * from './core/schemas.js';
export {
  apkArtifactName,
  designBranchName,
  normaliseSlot,
  parseRoundRef,
  projectIdFromRepo,
  roundId,
  slugify,
  worktreeDirName,
  CANDIDATE_SLOTS,
  MAX_DESIGNS_PER_ROUND,
  type CandidateSlot,
} from './core/ids.js';

// Config
export {
  configSchema,
  defaultConfig,
  loadConfigFile,
  parseConfig,
  writeConfigFile,
  type DesignLabConfig,
} from './config/config.js';

// Agents
export type { AgentRequest, AgentResponse, AgentRole, AgentRunner } from './agents/types.js';
export {
  ClaudeCodeRunner,
  resolvePermissionMode,
  runningAsRoot,
  type PermissionMode,
} from './agents/claude-code-runner.js';
export { MockAgentRunner } from './agents/mock-runner.js';
export { createAgentRunner, LedgeredRunner } from './agents/runner-factory.js';

// Git
export { GitClient, type ChangedFile, type WorktreeInfo } from './git/git-client.js';
export { WorktreeManager, assertPushSafe, type WorktreeLease } from './git/worktree-manager.js';

// Analysis
export { inspectRepository, buildSnapshot, renderAnalysis, type InspectResult } from './analysis/inspector.js';

// Protection
export { buildContract, BUILTIN_RULES } from './protection/contract.js';
export { ProtectionChecker, formatProtectionReport } from './protection/checker.js';
export { compileGlob, matchesGlob } from './protection/glob.js';
export { runInvariantChecks } from './protection/invariants.js';

// Design
export { planRound, type PlanRoundResult } from './design/planner.js';
export { loadReferencePack, interpretReference, type ReferencePack } from './design/reference.js';
export { NullCaptureAdapter, defaultCaptureAdapter, type ScreenCaptureAdapter } from './design/capture.js';
export { scoreDiversity, describeDiversityShortfall, type DiversityScore } from './design/diversity.js';
export { buildCandidate } from './design/builder.js';
export { reviewCandidate, overallScore } from './design/reviewer.js';

// Tournament B — model-agnostic sequential challenger runtime
export {
  XPLORER_TOURNAMENT_B_ID,
  XPLORER_TOURNAMENT_B_SOURCE_REPOSITORY,
  XPLORER_TOURNAMENT_B_SOURCE_BRANCH,
  XPLORER_TOURNAMENT_B_SOURCE_COMMIT,
  XPLORER_TOURNAMENT_B_SOURCE_TREE,
  XPLORER_TOURNAMENT_B_ROUTE_COUNT,
  XPLORER_TOURNAMENT_B_SHARED_INPUTS,
  XPLORER_CHALLENGERS,
  PERFECT_10_CATEGORIES,
  challengerPerfect10Schema,
  challengerProductTruthCheckSchema,
  challengerResultSchema,
  validateXplorerTournamentB,
  prepareXplorerChallengerPacket,
  validateXplorerChallengerResult,
  tournamentBStatus,
  type XplorerChallengerSlug,
  type TournamentBValidation,
  type ChallengerPacket,
  type ChallengerPerfect10,
  type ChallengerProductTruthCheck,
  type ChallengerResult,
} from './tournaments/xplorer-challenger-b.js';

// Testing gates
export { runGates, didAllRequiredGatesPass, formatGateResults, DEFAULT_GATES } from './testing/gates.js';

// Builds
export { planWorkflow, type WorkflowPlan } from './builds/workflow-generator.js';
export {
  applyCandidateIdentity,
  assessIdentityRisk,
  planCandidateIdentity,
  isEngineCommitSubject,
  IDENTITY_COMMIT_MARKER,
  PLUMBING_COMMIT_MARKER,
} from './builds/candidate-identity.js';
export { checkMergeReadiness, type MergeReadinessResult } from './builds/merge-readiness.js';
export {
  GitHubActionsClient,
  parseGitHubRepo,
  refreshBuildStatus,
  describeBuildStatus,
  assessInstallability,
  type ActionsClient,
} from './builds/build-tracker.js';

// Lineage
export {
  chooseWinner,
  appendLineage,
  parseFeedbackReferences,
  planNextGeneration,
} from './lineage/evolution.js';
