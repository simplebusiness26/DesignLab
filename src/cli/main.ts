/**
 * CLI entry point.
 *
 * Every command follows the same shape: build a context, run the operation,
 * then render either human text (stdout) or JSON (`--json`). Errors are
 * translated into stable exit codes so scripts and CI can branch on them.
 */

import { Command, Option } from 'commander';

import { describeError, exitCodeFor, isDesignLabError } from '../core/errors.js';
import { createContext, type GlobalOptions } from './context.js';
import { formatInitResult, runInit } from './commands/init.js';
import { formatInspectResult, runInspect } from './commands/inspect.js';
import { formatRoundResult, runRoundCommand } from './commands/round.js';
import { formatStatus, runStatus } from './commands/status.js';
import { formatChooseResult, runChoose } from './commands/choose.js';
import { formatDoctorResult, runDoctor } from './commands/doctor.js';
import {
  formatCleanResult,
  formatProtectResult,
  formatWorkflowResult,
  runClean,
  runProtect,
  runWorkflow,
} from './commands/misc.js';
import { formatMergeCheckResult, runMergeCheck } from './commands/merge-check.js';
import { formatVerifyResult, runVerify } from './commands/verify.js';

export const VERSION = '1.0.0';

function output(context: { json: boolean }, human: string, data: unknown): void {
  process.stdout.write(context.json ? `${JSON.stringify(data, null, 2)}\n` : `${human}\n`);
}

function globalOptions(command: Command): GlobalOptions {
  const opts: Record<string, unknown> = command.optsWithGlobals();
  return {
    cwd: typeof opts['cwd'] === 'string' ? opts['cwd'] : undefined,
    config: typeof opts['config'] === 'string' ? opts['config'] : undefined,
    logLevel: typeof opts['logLevel'] === 'string' ? opts['logLevel'] : undefined,
    json: opts['json'] === true,
    dryRun: opts['dryRun'] === true,
  };
}

function parseIntOption(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`--${name} must be an integer, received "${value}"`);
  }
  return parsed;
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('designlab')
    .description('Evolutionary UI experimentation engine for existing mobile applications')
    .version(VERSION)
    .option('--cwd <dir>', 'directory to run in (defaults to the current directory)')
    .option('--config <path>', 'path to designlab.config.json')
    .option('--log-level <level>', 'debug | info | warn | error | silent')
    .option('--json', 'emit machine-readable JSON on stdout', false)
    .option(
      '--dry-run',
      'run the full pipeline with the deterministic agent backend: no model calls, no pushes',
      false,
    );

  // -- init ----------------------------------------------------------------
  program
    .command('init')
    .description('create the DesignLab workspace and configuration')
    .option('--repo <url>', 'default target repository')
    .option('--branch <name>', 'default base branch', 'main')
    .option('--force', 'overwrite an existing configuration file', false)
    .action(async (options: { repo?: string; branch?: string; force?: boolean }, command: Command) => {
      const context = await createContext(globalOptions(command));
      const result = await runInit(context, {
        repo: options.repo,
        branch: options.branch,
        force: options.force ?? false,
      });
      output(context, formatInitResult(result), result);
    });

  // -- inspect -------------------------------------------------------------
  program
    .command('inspect')
    .description('analyse the target application and build its manifest and functionality contract')
    .option('--repo <url|path>', 'target repository URL or local path')
    .option('--branch <name>', 'branch to analyse')
    .option('--force', 're-analyse even if this commit has already been inspected', false)
    .option('--no-ai', 'skip the AI enrichment and contract-proposal passes')
    .action(
      async (
        options: { repo?: string; branch?: string; force?: boolean; ai?: boolean },
        command: Command,
      ) => {
        const context = await createContext(globalOptions(command));
        const result = await runInspect(context, {
          repo: options.repo,
          branch: options.branch,
          force: options.force ?? false,
          // commander maps --no-ai to `ai: false`
          noAi: options.ai === false,
        });
        output(context, formatInspectResult(result), result);
      },
    );

  // -- round ---------------------------------------------------------------
  program
    .command('round')
    .description('generate, implement, verify and review a full generation of designs')
    .option('--repo <url|path>', 'target repository URL or local path')
    .option('--base <branch>', 'base branch (ignored when evolving from a previous winner)')
    .option('--designs <n>', 'number of designs to generate', (value) => parseIntOption(value, 'designs'), 4)
    .addOption(
      new Option('--diversity <level>', 'how different the designs must be')
        .choices(['low', 'medium', 'high'])
        .default('high'),
    )
    .option('--no-push', 'do not push successful design branches')
    .option('--write-workflow', 'commit the generated Actions workflow onto candidate branches even without pushing', false)
    .option(
      '--reference <path>',
      'directory (or single image) of UI mockups; becomes an additional slot-A candidate',
    )
    .action(
      async (
        options: {
          repo?: string;
          base?: string;
          designs?: number;
          diversity?: 'low' | 'medium' | 'high';
          push?: boolean;
          writeWorkflow?: boolean;
          reference?: string;
        },
        command: Command,
      ) => {
        const context = await createContext(globalOptions(command));
        const result = await runRoundCommand(context, {
          repo: options.repo,
          base: options.base,
          designs: options.designs,
          diversity: options.diversity,
          noPush: options.push === false,
          writeWorkflow: options.writeWorkflow ?? false,
          reference: options.reference,
        });
        output(context, formatRoundResult(result, context.dryRun), result);
      },
    );

  // -- status --------------------------------------------------------------
  program
    .command('status')
    .description('show manifest, contract, rounds, candidates, build state and usage')
    .option('--repo <url|path>', 'target repository')
    .option('--round <n>', 'show only this round', (value) => parseIntOption(value, 'round'))
    .option('--refresh', 're-read APK build state from the GitHub Actions API', false)
    .action(
      async (options: { repo?: string; round?: number; refresh?: boolean }, command: Command) => {
        const context = await createContext(globalOptions(command));
        const result = await runStatus(context, {
          repo: options.repo,
          round: options.round,
          refresh: options.refresh ?? false,
        });
        output(context, formatStatus(result), result);
      },
    );

  // -- choose --------------------------------------------------------------
  program
    .command('choose')
    .description('record the winning design and plan the next generation')
    .argument('<round>', 'round number or id, e.g. 1 or r001')
    .argument('<candidate>', 'candidate letter, e.g. C')
    .option('-f, --feedback <text>', 'why it won, and what to take from the others')
    .option('--repo <url|path>', 'target repository')
    .option('--designs <n>', 'designs to plan for the next round', (value) => parseIntOption(value, 'designs'))
    .option('--no-plan', 'record the winner without planning the next generation')
    .action(
      async (
        roundRef: string,
        candidateRef: string,
        options: { feedback?: string; repo?: string; designs?: number; plan?: boolean },
        command: Command,
      ) => {
        const context = await createContext(globalOptions(command));
        const result = await runChoose(context, {
          roundRef,
          candidateRef,
          feedback: options.feedback,
          repo: options.repo,
          designs: options.designs,
          noPlan: options.plan === false,
        });
        output(context, formatChooseResult(result), result);
      },
    );

  // -- protect -------------------------------------------------------------
  program
    .command('protect')
    .description('show the functionality contract, classify paths, or check a branch against it')
    .option('--repo <url|path>', 'target repository')
    .option('--path <path...>', 'classify these repository-relative paths')
    .option('--branch <name>', 'check this branch against the contract')
    .option('--base <ref>', 'base ref for the branch check')
    .action(
      async (
        options: { repo?: string; path?: string[]; branch?: string; base?: string },
        command: Command,
      ) => {
        const context = await createContext(globalOptions(command));
        const result = await runProtect(context, {
          repo: options.repo,
          paths: options.path,
          branch: options.branch,
          base: options.base,
        });
        output(context, formatProtectResult(result), result);
        if (result.report && !result.report.passed) process.exitCode = 6;
      },
    );

  // -- workflow ------------------------------------------------------------
  program
    .command('workflow')
    .description('show or write the GitHub Actions workflow that builds an APK per design branch')
    .option('--repo <url|path>', 'target repository')
    .option('--write', 'write the workflow into the working clone', false)
    .action(async (options: { repo?: string; write?: boolean }, command: Command) => {
      const context = await createContext(globalOptions(command));
      const result = await runWorkflow(context, { repo: options.repo, write: options.write ?? false });
      output(context, formatWorkflowResult(result), result);
    });

  // -- clean ---------------------------------------------------------------
  program
    .command('clean')
    .description('remove local worktrees (never remote branches)')
    .option('--repo <url|path>', 'target repository')
    .option('--delete-branches', 'also delete the local design branches', false)
    .action(async (options: { repo?: string; deleteBranches?: boolean }, command: Command) => {
      const context = await createContext(globalOptions(command));
      const result = await runClean(context, {
        repo: options.repo,
        deleteBranches: options.deleteBranches ?? false,
      });
      output(context, formatCleanResult(result, options.deleteBranches ?? false), result);
    });

  // -- verify --------------------------------------------------------------
  program
    .command('verify')
    .description('re-run the verification gates for an existing candidate and persist the honest result')
    .argument('<round>', 'round number or id, e.g. 1 or r001')
    .argument('<candidate>', 'candidate letter, e.g. A')
    .option('--repo <url|path>', 'target repository')
    .action(async (roundRef: string, candidateRef: string, options: { repo?: string }, command: Command) => {
      const context = await createContext(globalOptions(command));
      const result = await runVerify(context, {
        roundRef,
        candidateRef,
        repo: options.repo,
      });
      output(context, formatVerifyResult(result), result);
      if (result.status === 'rejected') process.exitCode = 7;
    });

  // -- merge-check ---------------------------------------------------------
  program
    .command('merge-check')
    .description('verify a candidate branch is ready for a human merge (never merges)')
    .argument('<round>', 'round number or id, e.g. 1 or r001')
    .argument('<candidate>', 'candidate letter, e.g. C')
    .option('--repo <url|path>', 'target repository')
    .option('--base <branch>', 'merge target branch (defaults to the round base branch)')
    .action(
      async (
        roundRef: string,
        candidateRef: string,
        options: { repo?: string; base?: string },
        command: Command,
      ) => {
        const context = await createContext(globalOptions(command));
        const result = await runMergeCheck(context, {
          roundRef,
          candidateRef,
          repo: options.repo,
          base: options.base,
        });
        output(context, formatMergeCheckResult(result), result);
        if (!result.readiness.ready) process.exitCode = 8;
      },
    );

  // -- doctor --------------------------------------------------------------
  program
    .command('doctor')
    .description('check that git, node, the Claude CLI and the workspace are ready')
    .action(async (_options: unknown, command: Command) => {
      const context = await createContext(globalOptions(command));
      const result = await runDoctor(context);
      output(context, formatDoctorResult(result), result);
      if (!result.ok) process.exitCode = 1;
    });

  return program;
}

export async function main(argv: readonly string[] = process.argv): Promise<number> {
  const program = buildProgram();
  program.exitOverride();

  try {
    await program.parseAsync([...argv]);
    return typeof process.exitCode === 'number' ? process.exitCode : 0;
  } catch (error) {
    // Commander throws for --help and --version; those are successful exits.
    const commanderCode = (error as { code?: string }).code;
    if (commanderCode === 'commander.helpDisplayed' || commanderCode === 'commander.version') return 0;
    if (commanderCode === 'commander.help') return 0;

    if (isDesignLabError(error)) {
      process.stderr.write(`\nerror [${error.code}] ${error.message}\n`);
      if (error.hint) process.stderr.write(`hint: ${error.hint}\n`);
      return exitCodeFor(error);
    }

    if (commanderCode?.startsWith('commander.')) {
      // Commander has already written its own message.
      return typeof (error as { exitCode?: number }).exitCode === 'number'
        ? (error as { exitCode: number }).exitCode
        : 1;
    }

    process.stderr.write(`\nerror: ${describeError(error)}\n`);
    if (process.env['DESIGNLAB_LOG_LEVEL'] === 'debug' && error instanceof Error && error.stack) {
      process.stderr.write(`${error.stack}\n`);
    }
    return 1;
  }
}
