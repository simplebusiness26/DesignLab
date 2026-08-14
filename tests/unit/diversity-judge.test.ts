/**
 * Tests for the semantic diversity judge inside round planning.
 *
 * The lexical score is a cheap first filter; the judge is Fable-level
 * conceptual judgement. These tests script the runner so the judge's control
 * flow — collision → re-plan with the judge's guidance → distinct — is pinned
 * without any model.
 */

import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { MockAgentRunner } from '../../src/agents/mock-runner.js';
import type { AgentRequest, AgentResponse, AgentRole, AgentRunner } from '../../src/agents/types.js';
import { planRound } from '../../src/design/planner.js';
import { buildContract } from '../../src/protection/contract.js';
import { defaultConfig } from '../../src/config/config.js';
import type { AppManifest, DiversityJudgement } from '../../src/core/schemas.js';

function manifest(): AppManifest {
  return {
    schemaVersion: 1,
    projectId: 'judge-test-00000001',
    repoUrl: 'https://github.com/test/app',
    branch: 'main',
    sha: 'a'.repeat(40),
    generatedAt: new Date().toISOString(),
    appName: 'Judged',
    appSlug: 'judged',
    framework: 'expo',
    frameworkVersion: null,
    languages: [],
    packageManager: 'npm',
    androidBuildSystem: 'gradle',
    androidPackageId: null,
    minSdkVersion: null,
    sourceRoots: ['src'],
    screens: [],
    navigation: { library: null, pattern: 'unknown', paths: [] },
    components: [],
    designSystem: { present: false, themePaths: [], tokens: [], stylingApproach: 'unknown' },
    stateManagement: [],
    capabilities: [],
    permissions: [],
    nativeModules: [],
    apis: [],
    backends: [],
    testing: { frameworks: [], testPaths: [], hasTests: false },
    commands: { install: null, typecheck: null, lint: null, test: null, build: null, androidBuild: null },
    ci: { hasWorkflows: false, workflowPaths: [], buildsAndroid: false, androidWorkflowPath: null },
    fileCount: 0,
    truncated: false,
    analysisMode: 'deterministic',
    notes: [],
  };
}

/**
 * Delegates everything to the mock runner except `judge-diversity`, whose
 * verdicts play out in the scripted order.
 */
class ScriptedJudgeRunner implements AgentRunner {
  readonly name = 'scripted';
  readonly inner = new MockAgentRunner({ applyBuilderEdits: false });
  readonly judgements: DiversityJudgement[];
  judgeCalls = 0;
  planCalls = 0;
  lastPlanPrompt = '';

  constructor(judgements: DiversityJudgement[]) {
    this.judgements = judgements;
  }

  modelFor(role: AgentRole): string {
    return this.inner.modelFor(role);
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async run<TSchema extends z.ZodTypeAny>(
    request: AgentRequest<TSchema>,
  ): Promise<AgentResponse<z.infer<TSchema>>> {
    if (request.operation === 'judge-diversity') {
      const judgement = this.judgements[this.judgeCalls] ?? this.judgements.at(-1);
      this.judgeCalls += 1;
      return {
        ok: true,
        role: request.role,
        model: 'fable',
        operation: request.operation,
        text: JSON.stringify(judgement),
        data: judgement as z.infer<TSchema>,
        usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, numTurns: 1 },
        durationMs: 1,
        error: null,
        sessionId: null,
      };
    }
    if (request.operation === 'plan-round') {
      this.planCalls += 1;
      this.lastPlanPrompt = request.prompt;
    }
    return this.inner.run(request);
  }
}

async function plan(runner: AgentRunner, options: { semanticJudge: boolean; diversity?: 'high' | 'medium' }) {
  const targetManifest = manifest();
  return planRound({
    runner,
    manifest: targetManifest,
    contract: buildContract({ manifest: targetManifest, config: defaultConfig().protection }),
    repoDir: '/tmp',
    round: 1,
    designCount: 3,
    diversityTarget: options.diversity ?? 'high',
    minDiversityScore: 0.55,
    maxRetries: 2,
    semanticJudge: options.semanticJudge,
  });
}

describe('semantic diversity judge', () => {
  it('accepts the set when the judge finds it distinct, after exactly one judge call', async () => {
    const runner = new ScriptedJudgeRunner([{ verdict: 'distinct', collidingPairs: [], guidance: '' }]);
    const result = await plan(runner, { semanticJudge: true });

    expect(result.belowTarget).toBe(false);
    expect(result.attempts).toBe(1);
    expect(runner.judgeCalls).toBe(1);
  });

  it('re-plans on a conceptual collision, feeding the judge\'s guidance back to Fable', async () => {
    const runner = new ScriptedJudgeRunner([
      {
        verdict: 'collision',
        collidingPairs: [
          { a: 'immersive', b: 'social', reason: 'Both are a single scrolling feed with bottom tabs.' },
        ],
        guidance: 'Replace one with a map-first spatial structure.',
      },
      { verdict: 'distinct', collidingPairs: [], guidance: '' },
    ]);

    const result = await plan(runner, { semanticJudge: true });

    expect(runner.planCalls).toBe(2);
    expect(runner.judgeCalls).toBe(2);
    expect(result.attempts).toBe(2);
    expect(result.belowTarget).toBe(false);
    // The second planning prompt carried the judge's specific correction.
    expect(runner.lastPlanPrompt).toContain('single scrolling feed with bottom tabs');
    expect(runner.lastPlanPrompt).toContain('map-first spatial structure');
  });

  it('proceeds with belowTarget recorded when the collision survives every retry', async () => {
    const runner = new ScriptedJudgeRunner([
      {
        verdict: 'collision',
        collidingPairs: [{ a: 'x', b: 'y', reason: 'same structure' }],
        guidance: '',
      },
    ]);

    const result = await plan(runner, { semanticJudge: true });
    // The shortfall is visible, never silently swallowed.
    expect(result.belowTarget).toBe(true);
  });

  it('makes no judge call when disabled — the cost is opt-out-able', async () => {
    const runner = new ScriptedJudgeRunner([{ verdict: 'distinct', collidingPairs: [], guidance: '' }]);
    await plan(runner, { semanticJudge: false });
    expect(runner.judgeCalls).toBe(0);
  });

  it('makes no judge call below the high diversity target — medium rounds stay cheap', async () => {
    const runner = new ScriptedJudgeRunner([{ verdict: 'distinct', collidingPairs: [], guidance: '' }]);
    await plan(runner, { semanticJudge: true, diversity: 'medium' });
    expect(runner.judgeCalls).toBe(0);
  });

  it('a judge outage never sinks a round — the lexical pass stands', async () => {
    const failing: AgentRunner = {
      name: 'failing-judge',
      modelFor: (role) => role,
      isAvailable: () => Promise.resolve(true),
      run: async <TSchema extends z.ZodTypeAny>(request: AgentRequest<TSchema>) => {
        if (request.operation === 'judge-diversity') {
          return {
            ok: false,
            role: request.role,
            model: 'fable',
            operation: request.operation,
            text: '',
            data: null,
            usage: { costUsd: null, inputTokens: null, outputTokens: null, numTurns: null },
            durationMs: 1,
            error: 'judge unavailable',
            sessionId: null,
          };
        }
        return new MockAgentRunner({ applyBuilderEdits: false }).run(request);
      },
    };

    const result = await plan(failing, { semanticJudge: true });
    expect(result.belowTarget).toBe(false);
    expect(result.briefs.length).toBe(3);
  });
});
