#!/usr/bin/env node
/**
 * Live agent smoke test.
 *
 * Makes REAL model calls through DesignLab's own `ClaudeCodeRunner` to prove
 * the model boundary works end to end: role→model mapping, structured output
 * via --json-schema, envelope parsing, usage extraction, and — for the
 * planning call — that a real model can satisfy the diversity requirement.
 *
 * This costs money and is therefore not part of `npm test`. Run it manually
 * once per environment, and after changing anything in src/agents/.
 *
 *   node scripts/live-smoke.mjs [--full]
 *
 * Without --full it makes two cheap calls (planning + review shape).
 * With --full it also runs a real builder against a fixture worktree.
 */

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { ClaudeCodeRunner } = await import(join(ROOT, 'dist/agents/claude-code-runner.js'));
const { LEAD_SYSTEM_PROMPT, BUILDER_SYSTEM_PROMPT } = await import(join(ROOT, 'dist/agents/prompts.js'));
const { designPlanSchema, designReviewSchema, builderReportSchema } = await import(
  join(ROOT, 'dist/core/schemas.js')
);
const { scoreDiversity } = await import(join(ROOT, 'dist/design/diversity.js'));

const GREEN = '\u001b[32m';
const RED = '\u001b[31m';
const DIM = '\u001b[2m';
const BOLD = '\u001b[1m';
const RESET = '\u001b[0m';

const failures = [];
let totalCost = 0;

function check(label, condition, detail = '') {
  if (condition) {
    process.stdout.write(`    ${GREEN}✓${RESET} ${label}\n`);
  } else {
    process.stdout.write(`    ${RED}✗ ${label}${RESET}${detail ? ` — ${detail}` : ''}\n`);
    failures.push(label);
  }
}

function heading(title) {
  process.stdout.write(`\n${BOLD}${title}${RESET}\n`);
}

const runner = new ClaudeCodeRunner({
  models: { lead: 'fable', builder: 'sonnet', reviewer: 'opus' },
  defaultTimeoutMs: 10 * 60 * 1000,
});

const APP_CONTEXT = `
App: TrailMark — a trail logging app for hikers.
Framework: expo 51 (React Native)
Styling: react-native StyleSheet
Navigation: react-navigation — stack + bottom tabs
State: zustand

Screens:
- Home (feed) — src/screens/HomeScreen.tsx, a vertical list of trail cards
- Map (map) — src/screens/MapScreen.tsx, full-screen map of nearby trails
- Profile (profile) — src/screens/ProfileScreen.tsx, user stats and history
- Login (auth) — src/screens/LoginScreen.tsx

Theme files: src/theme/theme.ts, src/theme/typography.ts
Components: src/components/TrailCard.tsx
`.trim();

const CONTRACT_CONTEXT = `
Principle: Functionality is frozen. Design is flexible.

PROTECTED (never modify):
- src/api/** — backend request contracts
- src/auth/** — authentication behaviour
- src/payments/** — payment logic
- db/migrations/** — database migrations

DESIGNABLE (free to change):
- src/theme/** — visual tokens
- src/components/** — component presentation
- src/screens/** — screen composition and layout
`.trim();

async function main() {
  process.stdout.write(`${BOLD}DesignLab live agent smoke test${RESET}\n`);
  process.stdout.write(`${DIM}Makes real model calls. This costs money.${RESET}\n`);

  const available = await runner.isAvailable();
  if (!available) {
    process.stdout.write(`${RED}The claude CLI is not available. Nothing to test.${RESET}\n`);
    return 1;
  }

  const workdir = await mkdtemp(join(tmpdir(), 'designlab-live-'));

  try {
    // ---- 1. Fable: plan a round ----------------------------------------
    heading('1. Lead (fable) — plan a design round with enforced diversity');

    const planPrompt = [
      'You are planning round 1 of a UI design experiment on an existing, working mobile application.',
      'Produce exactly 3 distinct design directions.',
      '',
      '## The target application',
      '',
      APP_CONTEXT,
      '',
      '## What must not change',
      '',
      CONTRACT_CONTEXT,
      '',
      '## Diversity requirement',
      '',
      'Designs must be structurally different systems. Each must take a distinct position on the majority of',
      'the dimensions in the schema, and at minimum on information hierarchy, navigation presentation,',
      'density and interaction model. If two designs could be described by the same sentence with different',
      'adjectives, one of them is wrong.',
      '',
      'Write positions as design decisions, not adjectives. "single scrolling canvas, no tab bar" is a',
      'position; "modern and clean" is not.',
      '',
      'Return JSON matching the provided schema. No prose outside the JSON.',
    ].join('\n');

    const planResponse = await runner.run({
      role: 'lead',
      operation: 'plan-round',
      prompt: planPrompt,
      systemPrompt: LEAD_SYSTEM_PROMPT,
      cwd: workdir,
      outputSchema: designPlanSchema,
      toolPolicy: { allowed: ['Read', 'Glob', 'Grep'], denied: ['Edit', 'Write', 'Bash'] },
      timeoutMs: 8 * 60 * 1000,
    });

    check('planning call succeeded', planResponse.ok, planResponse.error ?? '');
    check('role mapped to the fable model', planResponse.model === 'fable');
    check('structured output was returned and validated', planResponse.data !== null);
    check('usage was extracted from the envelope', planResponse.usage.costUsd !== null);
    check('session id was extracted', planResponse.sessionId !== null);

    if (planResponse.usage.costUsd) totalCost += planResponse.usage.costUsd;

    const plan = planResponse.data;
    if (plan) {
      check('three designs produced', plan.designs.length === 3, `${plan.designs.length}`);
      check('every design has a slug and a thesis', plan.designs.every((d) => d.slug && d.thesis));
      check(
        'every design declares all 13 diversity dimensions',
        plan.designs.every((d) => Object.keys(d.diversityVector).length === 13),
      );
      check(
        'every design has at least 3 directives',
        plan.designs.every((d) => d.directives.length >= 3),
      );

      const score = scoreDiversity(
        plan.designs.map((d) => ({ id: d.slug, diversityVector: d.diversityVector })),
      );
      check(
        `a real model meets the diversity threshold (scored ${score.score.toFixed(3)}, need 0.55)`,
        score.score >= 0.55,
        score.weakestPair ? `weakest pair ${score.weakestPair.a}/${score.weakestPair.b}` : '',
      );

      process.stdout.write(`${DIM}    designs: ${plan.designs.map((d) => d.slug).join(', ')}${RESET}\n`);
      for (const design of plan.designs) {
        process.stdout.write(`${DIM}      ${design.slug}: ${design.thesis}${RESET}\n`);
      }
    }

    // ---- 2. Fable: review shape ----------------------------------------
    heading('2. Lead (fable) — design review returns a usable verdict');

    const reviewResponse = await runner.run({
      role: 'lead',
      operation: 'review-design',
      prompt: [
        'Review a design implementation. It has already passed typecheck, lint, tests and the',
        'functionality-contract check.',
        '',
        'Brief: "Utility — maximum information density and the shortest path to any action."',
        'Directives: replace the card list with a compact table; move primary actions into a persistent',
        'toolbar; reduce vertical rhythm to an 8px grid.',
        '',
        'What was actually implemented (diff summary):',
        '  src/theme/theme.ts        | 12 +++---',
        '  src/theme/typography.ts   |  4 ++--',
        '',
        'That is the entire change. No screen or component files were touched.',
        '',
        'Score this honestly and return JSON matching the schema.',
      ].join('\n'),
      systemPrompt: LEAD_SYSTEM_PROMPT,
      cwd: workdir,
      outputSchema: designReviewSchema,
      toolPolicy: { allowed: ['Read', 'Glob', 'Grep'], denied: ['Edit', 'Write', 'Bash'] },
      timeoutMs: 5 * 60 * 1000,
    });

    check('review call succeeded', reviewResponse.ok, reviewResponse.error ?? '');
    check('review output validated against the schema', reviewResponse.data !== null);
    if (reviewResponse.usage.costUsd) totalCost += reviewResponse.usage.costUsd;

    if (reviewResponse.data) {
      const review = reviewResponse.data;
      check(
        'a theme-only change is NOT accepted as honouring a structural brief',
        review.verdict !== 'accept',
        `verdict was "${review.verdict}"`,
      );
      check('brief adherence scored low', review.briefAdherence <= 5, `${review.briefAdherence}/10`);
      check('a non-accept verdict carries corrections', review.verdict === 'accept' || review.corrections.length > 0);
      process.stdout.write(`${DIM}    verdict: ${review.verdict} — ${review.summary}${RESET}\n`);
    }

    // ---- 3. Sonnet: real implementation (--full only) -------------------
    if (process.argv.includes('--full')) {
      heading('3. Builder (sonnet) — implement a brief in a real directory');

      await mkdir(join(workdir, 'src/theme'), { recursive: true });
      await mkdir(join(workdir, 'src/components'), { recursive: true });
      await writeFile(
        join(workdir, 'src/theme/theme.ts'),
        'export const theme = { colors: { bg: "#fff", fg: "#111" }, spacing: { sm: 8, md: 16 }, radius: 8 };\n',
        'utf8',
      );
      await writeFile(
        join(workdir, 'src/components/TrailCard.tsx'),
        'import { View, Text } from "react-native";\n' +
          'import { theme } from "../theme/theme";\n' +
          'export function TrailCard({ name }: { name: string }) {\n' +
          '  return (<View style={{ padding: theme.spacing.md, borderRadius: theme.radius }}><Text>{name}</Text></View>);\n' +
          '}\n',
        'utf8',
      );

      const buildResponse = await runner.run({
        role: 'builder',
        operation: 'implement-design',
        prompt: [
          `You are working in an isolated directory at ${workdir}. Everything you change must be inside it.`,
          '',
          '## Your design brief',
          '',
          'Design A: Utility',
          'Thesis: Maximum information density and the shortest path to any action.',
          '',
          'Directives:',
          '1. Reduce the theme spacing scale so the UI is denser.',
          '2. Square off component corners — remove the rounded radius.',
          '3. Make TrailCard a compact row rather than a padded card.',
          '',
          '## Functionality contract',
          '',
          CONTRACT_CONTEXT,
          '',
          'Implement the directives, then return JSON matching the schema reporting what you did.',
        ].join('\n'),
        systemPrompt: BUILDER_SYSTEM_PROMPT,
        cwd: workdir,
        outputSchema: builderReportSchema,
        toolPolicy: { allowed: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'], denied: ['WebFetch', 'WebSearch'] },
        timeoutMs: 10 * 60 * 1000,
      });

      check('builder call succeeded', buildResponse.ok, buildResponse.error ?? '');
      check('builder returned a structured report', buildResponse.data !== null);
      check('role mapped to the sonnet model', buildResponse.model === 'sonnet');
      if (buildResponse.usage.costUsd) totalCost += buildResponse.usage.costUsd;

      if (buildResponse.data) {
        check('builder reports having implemented the brief', buildResponse.data.implemented === true);
        const { readFile } = await import('node:fs/promises');
        const theme = await readFile(join(workdir, 'src/theme/theme.ts'), 'utf8');
        check('the theme file was genuinely modified', !theme.includes('radius: 8'), theme.trim());
        process.stdout.write(`${DIM}    ${buildResponse.data.summary}${RESET}\n`);
      }
    } else {
      process.stdout.write(`\n${DIM}Skipping the builder call. Pass --full to include it.${RESET}\n`);
    }
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }

  process.stdout.write('\n' + '─'.repeat(70) + '\n');
  process.stdout.write(`${DIM}Reported cost: $${totalCost.toFixed(4)}${RESET}\n`);

  if (failures.length === 0) {
    process.stdout.write(`${GREEN}${BOLD}LIVE SMOKE PASSED${RESET} — real model calls work end to end.\n`);
    return 0;
  }
  process.stdout.write(`${RED}${BOLD}LIVE SMOKE FAILED${RESET} — ${failures.length} check(s):\n`);
  for (const failure of failures) process.stdout.write(`  ${RED}✗${RESET} ${failure}\n`);
  return 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`\nlive smoke crashed: ${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
