import { describe, expect, it } from 'vitest';

import {
  buildFailureFeedback,
  didAllRequiredGatesPass,
  formatGateResults,
} from '../../src/testing/gates.js';
import { parseCommandLine, summariseFailure } from '../../src/core/exec.js';
import type { GateResult, GateStatus } from '../../src/core/schemas.js';

function gate(name: GateResult['gate'], status: GateStatus, extra: Partial<GateResult> = {}): GateResult {
  return {
    gate: name,
    status,
    command: null,
    exitCode: null,
    durationMs: 100,
    summary: '',
    reason: '',
    ranAt: new Date().toISOString(),
    ...extra,
  };
}

describe('didAllRequiredGatesPass', () => {
  it('accepts a run where everything required actually passed', () => {
    expect(
      didAllRequiredGatesPass([
        gate('dependencies', 'passed'),
        gate('typecheck', 'passed'),
        gate('lint', 'passed'),
        gate('test', 'passed'),
        gate('protection', 'passed'),
      ]),
    ).toBe(true);
  });

  it('rejects a run where any gate failed', () => {
    expect(didAllRequiredGatesPass([gate('typecheck', 'failed'), gate('protection', 'passed')])).toBe(false);
    expect(didAllRequiredGatesPass([gate('typecheck', 'passed'), gate('protection', 'failed')])).toBe(false);
  });

  it('never counts a skipped gate as a pass', () => {
    // This is the dishonesty the gate design exists to prevent: tests that
    // were skipped because typecheck failed must not read as success.
    expect(
      didAllRequiredGatesPass([
        gate('typecheck', 'failed'),
        gate('test', 'skipped'),
        gate('protection', 'skipped'),
      ]),
    ).toBe(false);
  });

  it('requires the protection gate to have genuinely run', () => {
    expect(didAllRequiredGatesPass([gate('typecheck', 'passed'), gate('test', 'passed')])).toBe(false);
    expect(didAllRequiredGatesPass([gate('protection', 'not-configured')])).toBe(false);
  });

  it('tolerates a project that genuinely has no typecheck or test command', () => {
    expect(
      didAllRequiredGatesPass([
        gate('typecheck', 'not-configured'),
        gate('test', 'not-configured'),
        gate('protection', 'passed'),
      ]),
    ).toBe(true);
  });

  it('rejects an empty run', () => {
    expect(didAllRequiredGatesPass([])).toBe(false);
  });

  it('does not sink a candidate for an advisory gate failure', () => {
    // A missing lockfile or pre-existing lint debt is a fact about the target
    // project, not a defect in the design being evaluated.
    expect(
      didAllRequiredGatesPass([
        gate('dependencies', 'failed', { reason: 'npm ci: no lockfile' }),
        gate('lint', 'failed', { reason: 'pre-existing lint errors' }),
        gate('typecheck', 'passed'),
        gate('test', 'passed'),
        gate('protection', 'passed'),
      ]),
    ).toBe(true);
  });

  it('agrees with runGates about which gates are decisive', () => {
    // Advisory gates are recorded but never decisive in either direction.
    expect(
      didAllRequiredGatesPass([gate('lint', 'passed'), gate('dependencies', 'passed')]),
    ).toBe(false);
  });
});

describe('formatGateResults', () => {
  it('shows each gate with its outcome and reason', () => {
    const text = formatGateResults([
      gate('typecheck', 'passed', { durationMs: 3200 }),
      gate('test', 'failed', { reason: 'Exited 1.', exitCode: 1 }),
      gate('lint', 'not-configured', { reason: 'The target project has no lint command.' }),
    ]);

    expect(text).toContain('PASS typecheck');
    expect(text).toContain('FAIL test');
    expect(text).toContain('N/A  lint');
    expect(text).toContain('Exited 1.');
  });
});

describe('buildFailureFeedback', () => {
  it('is empty when nothing failed', () => {
    expect(buildFailureFeedback([gate('typecheck', 'passed')])).toBe('');
  });

  it('gives the builder the command, exit code and output', () => {
    const feedback = buildFailureFeedback([
      gate('typecheck', 'failed', {
        command: 'npm run typecheck',
        exitCode: 2,
        summary: "src/screens/HomeScreen.tsx(4,10): error TS2305: Module has no exported member 'Card'.",
      }),
    ]);

    expect(feedback).toContain('typecheck failed');
    expect(feedback).toContain('npm run typecheck');
    expect(feedback).toContain('Exit code: 2');
    expect(feedback).toContain('TS2305');
  });
});

describe('parseCommandLine', () => {
  it('splits a simple command', () => {
    expect(parseCommandLine('npm run typecheck')).toEqual({ command: 'npm', args: ['run', 'typecheck'] });
  });

  it('respects quoted segments', () => {
    expect(parseCommandLine('node -e "console.log(1)"')).toEqual({
      command: 'node',
      args: ['-e', 'console.log(1)'],
    });
  });

  it('preserves an empty quoted argument', () => {
    expect(parseCommandLine('cmd ""')).toEqual({ command: 'cmd', args: [''] });
  });

  it('returns null for an empty command line', () => {
    expect(parseCommandLine('   ')).toBeNull();
  });
});

describe('summariseFailure', () => {
  it('prefers stderr and reports a timeout distinctly', () => {
    const base = {
      command: 'npm',
      args: ['test'],
      cwd: '/tmp',
      signal: null,
      durationMs: 1000,
      ok: false,
    };

    expect(summariseFailure({ ...base, exitCode: 1, stdout: 'out', stderr: 'boom', timedOut: false })).toContain(
      'boom',
    );
    expect(
      summariseFailure({ ...base, exitCode: 137, stdout: '', stderr: '', timedOut: true }),
    ).toContain('Timed out');
  });

  it('truncates from the front, keeping the useful tail', () => {
    const long = `${'x'.repeat(9000)}FINAL_ERROR`;
    const summary = summariseFailure(
      {
        command: 'npm',
        args: ['test'],
        cwd: '/tmp',
        exitCode: 1,
        signal: null,
        stdout: long,
        stderr: '',
        durationMs: 1,
        timedOut: false,
        ok: false,
      },
      500,
    );

    expect(summary).toContain('FINAL_ERROR');
    expect(summary).toContain('truncated');
    expect(summary.length).toBeLessThan(700);
  });
});
