import type { CliContext } from '../context.js';
import {
  XPLORER_CHALLENGERS,
  prepareXplorerChallengerPacket,
  tournamentBStatus,
  validateXplorerChallengerResult,
  validateXplorerTournamentB,
  type ChallengerPacket,
  type TournamentBValidation,
} from '../../tournaments/xplorer-challenger-b.js';

export async function runChallengerValidate(context: CliContext): Promise<TournamentBValidation> {
  return validateXplorerTournamentB(context.paths.cwd);
}

export async function runChallengerStatus(context: CliContext) {
  return tournamentBStatus(context.paths.cwd);
}

export async function runChallengerPrepare(
  context: CliContext,
  options: { challenger: string; sourceRepo?: string; write?: boolean },
): Promise<ChallengerPacket> {
  return prepareXplorerChallengerPacket({
    knowledgeRoot: context.paths.cwd,
    challenger: options.challenger,
    ...(options.sourceRepo ? { sourceRepoDir: options.sourceRepo } : {}),
    write: options.write ?? false,
  });
}

export async function runChallengerVerify(context: CliContext, challenger: string) {
  return validateXplorerChallengerResult({ knowledgeRoot: context.paths.cwd, challenger });
}

export function formatChallengerValidate(result: TournamentBValidation): string {
  return [
    'Tournament B shared inputs are valid.',
    `  source:      ${result.sourceCommit}`,
    `  routes:      ${result.routeCount}`,
    `  shared hash: ${result.sharedInputFingerprint}`,
    `  personas:    ${result.personas.length}/${XPLORER_CHALLENGERS.length}`,
    '',
    'This command makes no model calls.',
  ].join('\n');
}

export function formatChallengerStatus(result: Awaited<ReturnType<typeof runChallengerStatus>>): string {
  const lines = [
    'Xplorer Challenger Tournament B',
    `  source:      ${result.sourceCommit}`,
    `  shared hash: ${result.sharedInputFingerprint}`,
    '',
  ];
  for (const challenger of result.challengers) {
    lines.push(`  ${challenger.order}. ${challenger.name} — ${challenger.status}`);
  }
  return lines.join('\n');
}

export function formatChallengerPrepare(result: ChallengerPacket, wrote: boolean): string {
  return [
    `Tournament B packet ready: ${result.challengerName}`,
    `  order:       ${result.order}/${XPLORER_CHALLENGERS.length}`,
    `  source:      ${result.sourceCommit}`,
    `  shared hash: ${result.sharedInputFingerprint}`,
    `  persona:     ${result.personaPath}`,
    `  persona hash:${result.personaFingerprint}`,
    wrote
      ? `  packet:      knowledge/tournaments/challengers/2026-08-15-xplorer/candidates/${result.challenger}/RUN_PACKET.md`
      : '  packet:      returned only (use --write to materialise it)',
    '',
    'No Claude/Fable/Sonnet call was made. The packet is model-agnostic and can be executed by the chosen orchestrator.',
  ].join('\n');
}

export function formatChallengerVerify(
  challenger: string,
  result: Awaited<ReturnType<typeof runChallengerVerify>>,
): string {
  return [
    `Tournament B candidate is LOCKED: ${challenger}`,
    `  source:      ${result.result.sourceCommit}`,
    `  truth checks:${result.truthCheck.checks.length} passed`,
    `  perfect 10:  ${result.perfect10.scores.length}/10 categories at 5/5`,
    `  completed:   ${result.result.completedAt}`,
  ].join('\n');
}
