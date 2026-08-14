/**
 * Agent system prompts.
 *
 * These define each role's authority and boundaries. They are deliberately
 * terse: DesignLab's real guarantees are enforced by deterministic gates
 * (protection diffs, worktree leases, verification commands), and a prompt
 * that pretends otherwise would encourage trusting the model where it should
 * not be trusted. The prompt's job is to make the *right* behaviour easy, not
 * to be the only thing standing between a builder and a database migration.
 */

import type { AppManifest, DesignBrief, FunctionalityContract } from '../core/schemas.js';

const SHARED_RULES = `
Hard rules that apply to every DesignLab agent:
- Never modify files that the Functionality Contract marks PROTECTED.
- Never weaken, delete or skip a test to make a check pass.
- Never invent build or test results. If you did not run it, say so.
- Never print, log or commit credentials, tokens or secrets.
- Stay inside your assigned working directory.
`.trim();

export const LEAD_SYSTEM_PROMPT = `
You are the DesignLab Lead Designer and Orchestrator.

You own product interpretation, design strategy, and quality judgment for an
evolutionary UI experiment on an EXISTING, WORKING mobile application.

Your responsibilities:
- Understand what the target product actually is and who uses it.
- Decide which parts of the experience are worth experimenting on.
- Generate design directions that are structurally different from each other,
  not variations of one idea with different colours.
- Judge implementations honestly, including rejecting your own earlier ideas.
- Turn human feedback into the next generation's strategy.

What makes a design direction genuinely different: a different information
hierarchy, a different navigation presentation, a different density, a
different interaction model, a different spatial model. Two directions that
share all of those are the same design wearing different paint, and you should
reject them.

You are working on an application that already functions. The redesign must
not change what the app does — only how it looks, reads and feels.

${SHARED_RULES}
`.trim();

export const BUILDER_SYSTEM_PROMPT = `
You are a DesignLab UI Builder.

You implement ONE design brief inside ONE assigned Git worktree. You do not
redefine the product, choose a different design direction, or negotiate the
brief. If the brief is impossible as written, implement what you can and
report the deviation honestly rather than substituting your own idea.

How to work:
- Read the existing code before changing it, and reuse the app's existing
  architecture, component patterns and conventions wherever they fit.
- Implement the brief's directives concretely and visibly. A reviewer should
  be able to see the design thesis without being told what it was.
- Change presentation, not behaviour. Same data, same flows, same outcomes.
- Run the project's typecheck, lint and test commands, and fix ordinary
  failures you introduced.
- Do not touch files the Functionality Contract marks PROTECTED. If your
  design appears to require it, stop and report the blocker.
- Work only inside your assigned worktree directory.

${SHARED_RULES}
`.trim();

export const REVIEWER_SYSTEM_PROMPT = `
You are the DesignLab Engineering Reviewer, invoked only when a builder has
repeatedly failed to resolve a problem or when a change looks dangerously
broad.

Your job is diagnosis, not implementation. Read the failure output and the
diff, identify the actual root cause, and return precise, minimal instructions
that the builder can execute. Prefer the smallest correct fix.

Call out architectural regressions, changes that reach beyond presentation
into behaviour, and any change that appears to work around a check rather than
satisfy it.

${SHARED_RULES}
`.trim();

/**
 * Compact manifest rendering for agent context. Full manifests are large and
 * mostly irrelevant to a single builder; this keeps the token cost bounded
 * while preserving what actually informs design decisions.
 */
export function renderManifestContext(manifest: AppManifest, options: { detailed?: boolean } = {}): string {
  const lines = [
    `App: ${manifest.appName}`,
    `Framework: ${manifest.framework}${manifest.frameworkVersion ? ` ${manifest.frameworkVersion}` : ''}`,
    `Package manager: ${manifest.packageManager}`,
    `Android build: ${manifest.androidBuildSystem}`,
    `Styling: ${manifest.designSystem.stylingApproach}`,
    `Navigation: ${manifest.navigation.library ?? 'unknown'} (${manifest.navigation.pattern})`,
    `State management: ${manifest.stateManagement.join(', ') || 'unknown'}`,
    `Source roots: ${manifest.sourceRoots.join(', ') || '(repository root)'}`,
  ];

  const capabilities = manifest.capabilities.filter((capability) => capability.present).map((c) => c.key);
  if (capabilities.length > 0) lines.push(`Capabilities present: ${capabilities.join(', ')}`);

  if (manifest.screens.length > 0) {
    const screens = manifest.screens.slice(0, options.detailed ? 60 : 25);
    lines.push('', 'Screens:');
    for (const screen of screens) lines.push(`- ${screen.name} (${screen.role}) — ${screen.path}`);
    if (manifest.screens.length > screens.length) {
      lines.push(`- …and ${manifest.screens.length - screens.length} more`);
    }
  }

  if (options.detailed && manifest.components.length > 0) {
    lines.push('', 'Most-reused components:');
    for (const component of manifest.components.slice(0, 20)) {
      lines.push(`- ${component.name} (${component.usageCount} refs) — ${component.path}`);
    }
  }

  if (manifest.designSystem.themePaths.length > 0) {
    lines.push('', `Theme files: ${manifest.designSystem.themePaths.slice(0, 10).join(', ')}`);
  }

  lines.push(
    '',
    'Commands:',
    `- install: ${manifest.commands.install ?? '(none detected)'}`,
    `- typecheck: ${manifest.commands.typecheck ?? '(none detected)'}`,
    `- lint: ${manifest.commands.lint ?? '(none detected)'}`,
    `- test: ${manifest.commands.test ?? '(none detected)'}`,
  );

  return lines.join('\n');
}

/** Contract rendering that leads with what is forbidden. */
export function renderContractContext(contract: FunctionalityContract): string {
  const byLevel = (level: string): string[] =>
    contract.rules.filter((rule) => rule.level === level).map((rule) => `- ${rule.pattern} — ${rule.reason}`);

  const sections = [
    `Principle: ${contract.principle}`,
    '',
    'PROTECTED (never modify):',
    ...(byLevel('PROTECTED').length > 0 ? byLevel('PROTECTED') : ['- (none recorded)']),
    '',
    'RESTRICTED (modify only if the brief explicitly requires it, and say so):',
    ...(byLevel('RESTRICTED').length > 0 ? byLevel('RESTRICTED') : ['- (none recorded)']),
    '',
    'DESIGNABLE (free to change):',
    ...(byLevel('DESIGNABLE').length > 0 ? byLevel('DESIGNABLE') : ['- (none recorded)']),
  ];

  if (contract.invariants.length > 0) {
    sections.push('', 'Behavioural invariants that must still hold afterwards:');
    for (const invariant of contract.invariants) sections.push(`- ${invariant.statement}`);
  }

  if (contract.approvedExceptions.length > 0) {
    sections.push('', 'Approved exceptions:');
    for (const exception of contract.approvedExceptions) {
      sections.push(`- ${exception.pattern} — ${exception.reason}`);
    }
  }

  return sections.join('\n');
}

/** Full brief rendering — the builder's primary instruction. */
export function renderBriefContext(brief: DesignBrief): string {
  const vector = Object.entries(brief.diversityVector)
    .map(([dimension, value]) => `- ${dimension}: ${value}`)
    .join('\n');

  const lines = [
    `Design ${brief.slot}: ${brief.name}`,
    `Thesis: ${brief.thesis}`,
    '',
    brief.rationale ? `Rationale: ${brief.rationale}` : '',
    '',
    'Design system position:',
    vector,
    '',
    'Directives (implement all of these):',
    ...brief.directives.map((directive, index) => `${index + 1}. ${directive}`),
  ];

  if (brief.targetScreens.length > 0) {
    lines.push('', `Screens that must visibly change: ${brief.targetScreens.join(', ')}`);
  }
  if (brief.antiPatterns.length > 0) {
    lines.push('', 'Explicitly avoid:', ...brief.antiPatterns.map((item) => `- ${item}`));
  }
  lines.push('', 'Success criteria:', ...brief.successCriteria.map((item) => `- ${item}`));

  if (brief.parent) {
    lines.push(
      '',
      `Lineage: evolved from round ${brief.parent.round} candidate ${brief.parent.slot} (${brief.parent.relation}).`,
    );
  }

  return lines.filter((line) => line !== '').join('\n');
}
