/**
 * `designlab doctor`
 *
 * Checks that everything DesignLab depends on is actually present and working,
 * rather than discovering it mid-round. Each check reports what it found, not
 * what it assumes.
 */

import { execCommand } from '../../core/exec.js';
import { pathExists } from '../../core/fsx.js';
import { createAgentRunner } from '../../agents/runner-factory.js';
import type { CliContext } from '../context.js';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
  hint?: string;
}

export interface DoctorResult {
  checks: Check[];
  ok: boolean;
}

export async function runDoctor(context: CliContext): Promise<DoctorResult> {
  const checks: Check[] = [];

  // --- git ----------------------------------------------------------------
  try {
    const git = await execCommand('git', ['--version'], { timeoutMs: 15_000 });
    const version = git.stdout.trim();
    const parsed = /(\d+)\.(\d+)/.exec(version);
    const major = Number.parseInt(parsed?.[1] ?? '0', 10);
    const minor = Number.parseInt(parsed?.[2] ?? '0', 10);
    const supportsWorktree = major > 2 || (major === 2 && minor >= 15);
    checks.push({
      name: 'git',
      status: git.ok && supportsWorktree ? 'ok' : 'fail',
      detail: git.ok ? version : 'git is not runnable',
      ...(supportsWorktree ? {} : { hint: 'DesignLab needs git 2.15+ for worktree support.' }),
    });
  } catch {
    checks.push({
      name: 'git',
      status: 'fail',
      detail: 'git was not found on PATH',
      hint: 'Install git 2.15 or newer.',
    });
  }

  // --- node ---------------------------------------------------------------
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  checks.push({
    name: 'node',
    status: nodeMajor >= 20 ? 'ok' : 'fail',
    detail: `v${process.versions.node}`,
    ...(nodeMajor >= 20 ? {} : { hint: 'DesignLab requires Node 20.10 or newer.' }),
  });

  // --- agent backend ------------------------------------------------------
  // Dry-run is a real supported execution mode: createContext.createRunner()
  // force-selects the deterministic mock runner so no Claude binary or model
  // credential is required. Doctor must describe the same environment the
  // command will actually use; checking Claude here while the rest of the CLI
  // uses the mock makes `designlab --dry-run doctor` fail despite its own hint.
  if (context.dryRun || context.config.agentRunner === 'mock') {
    checks.push({
      name: 'agent backend',
      status: 'warn',
      detail: context.dryRun
        ? 'dry-run — deterministic mock backend; no real model calls will be made'
        : 'configured as "mock" — no real model calls will be made',
      hint: context.dryRun
        ? 'Remove --dry-run when you want to verify the configured real model backend.'
        : 'Set agentRunner to "claude-code" for real design generation.',
    });
  } else {
    const runner = createAgentRunner(context.config, { logger: context.logger });
    const available = await runner.isAvailable();
    let version = '';
    if (available) {
      const result = await execCommand(context.config.claudeBin, ['--version'], { timeoutMs: 30_000 }).catch(
        () => null,
      );
      version = result?.stdout.trim() ?? '';
    }
    checks.push({
      name: 'claude CLI',
      status: available ? 'ok' : 'fail',
      detail: available ? version || 'available' : `"${context.config.claudeBin}" is not runnable`,
      ...(available
        ? {}
        : {
            hint: 'Install Claude Code and authenticate it, or set DESIGNLAB_CLAUDE_BIN. Use --dry-run to work without it.',
          }),
    });
  }

  // --- models -------------------------------------------------------------
  checks.push({
    name: 'model roles',
    status: 'ok',
    detail: `lead=${context.config.models.lead} builder=${context.config.models.builder} reviewer=${context.config.models.reviewer}`,
  });

  // --- workspace ----------------------------------------------------------
  const workspaceExists = await pathExists(context.paths.root);
  checks.push({
    name: 'workspace',
    status: workspaceExists ? 'ok' : 'warn',
    detail: workspaceExists ? context.paths.root : `${context.paths.root} does not exist yet`,
    ...(workspaceExists ? {} : { hint: 'Run "designlab init".' }),
  });

  const configExists = await pathExists(context.paths.configFile);
  checks.push({
    name: 'configuration',
    status: configExists ? 'ok' : 'warn',
    detail: configExists ? context.paths.configFile : 'using built-in defaults',
    ...(configExists ? {} : { hint: 'Run "designlab init" to write a config file.' }),
  });

  // --- GitHub token -------------------------------------------------------
  const hasToken = Boolean(process.env['GITHUB_TOKEN'] ?? process.env['GH_TOKEN']);
  checks.push({
    name: 'GitHub token',
    status: hasToken ? 'ok' : 'warn',
    detail: hasToken ? 'present (value not read into logs)' : 'not set',
    ...(hasToken
      ? {}
      : { hint: 'Set GITHUB_TOKEN to let "designlab status --refresh" read APK build results.' }),
  });

  // --- projects -----------------------------------------------------------
  const projects = await context.store.listProjectIds().catch(() => []);
  checks.push({
    name: 'inspected projects',
    status: projects.length > 0 ? 'ok' : 'warn',
    detail: projects.length > 0 ? projects.join(', ') : 'none',
    ...(projects.length > 0 ? {} : { hint: 'Run "designlab inspect --repo <url>".' }),
  });

  return { checks, ok: checks.every((check) => check.status !== 'fail') };
}

export function formatDoctorResult(result: DoctorResult): string {
  const icon: Record<CheckStatus, string> = { ok: ' ok ', warn: 'warn', fail: 'FAIL' };

  const lines = result.checks.flatMap((check) => {
    const rows = [`  [${icon[check.status]}] ${check.name.padEnd(20)} ${check.detail}`];
    if (check.hint) rows.push(`         → ${check.hint}`);
    return rows;
  });

  return [
    'DesignLab environment check',
    '',
    ...lines,
    '',
    result.ok ? 'All required components are present.' : 'One or more required components are missing.',
  ].join('\n');
}
