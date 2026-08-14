/**
 * Functionality Contract construction.
 *
 *   «Functionality is frozen. Design is flexible.»
 *
 * The contract is the boundary between what a redesign may touch and what it
 * may not. It is built in three layers, in increasing priority:
 *
 *   1. **Built-in rules** — universally dangerous surfaces (migrations, lock
 *      files, native build config, CI). These apply to every project.
 *   2. **Detected rules** — derived from the manifest's capability evidence,
 *      so a project that has payments gets payment protection and one that
 *      does not is not burdened with a meaningless rule.
 *   3. **User rules** — from `designlab.config.json`. Always win.
 *
 * An optional Fable pass may *propose* additional rules; proposals are
 * accepted only as PROTECTED/RESTRICTED tightenings, never as loosenings. A
 * model may make DesignLab more careful; it may not make it less careful.
 */

import type { ProtectionConfig } from '../config/config.js';
import type {
  AppManifest,
  ContractProposal,
  FunctionalityContract,
  ProtectionLevel,
  ProtectionRule,
} from '../core/schemas.js';

/**
 * Rules that hold regardless of the target application. Ordered from broad to
 * specific; conflicts are resolved by specificity at match time, not by order.
 */
export const BUILTIN_RULES: readonly ProtectionRule[] = [
  // --- Never touched, on any project ---------------------------------------
  { pattern: '**/migrations/**', level: 'PROTECTED', reason: 'Database migrations are irreversible in production.', source: 'builtin' },
  { pattern: '**/*.sql', level: 'PROTECTED', reason: 'SQL defines data shape and cannot be a design decision.', source: 'builtin' },
  { pattern: '**/schema.prisma', level: 'PROTECTED', reason: 'Database schema.', source: 'builtin' },
  { pattern: '**/*.lock', level: 'PROTECTED', reason: 'Lock files pin the dependency graph.', source: 'builtin' },
  { pattern: '{package-lock.json,yarn.lock,pnpm-lock.yaml,bun.lockb,Gemfile.lock,Podfile.lock,pubspec.lock}', level: 'PROTECTED', reason: 'Lock files pin the dependency graph.', source: 'builtin' },
  { pattern: '.github/workflows/**', level: 'PROTECTED', reason: 'CI configuration is managed by DesignLab, not by designs.', source: 'builtin' },
  { pattern: '{.env,.env.*}', level: 'PROTECTED', reason: 'Environment configuration and secrets.', source: 'builtin' },
  { pattern: '**/google-services.json', level: 'PROTECTED', reason: 'Service credentials and project wiring.', source: 'builtin' },
  { pattern: '**/GoogleService-Info.plist', level: 'PROTECTED', reason: 'Service credentials and project wiring.', source: 'builtin' },
  { pattern: '**/AndroidManifest.xml', level: 'PROTECTED', reason: 'Permissions, intents and component registration are behavioural.', source: 'builtin' },
  { pattern: '**/Info.plist', level: 'PROTECTED', reason: 'Platform capability declarations.', source: 'builtin' },

  // --- Build system: restricted, because a redesign can legitimately need a
  //     new font or asset dependency, but must declare that it did so. ------
  { pattern: '**/build.gradle', level: 'RESTRICTED', reason: 'Android build configuration affects what ships.', source: 'builtin' },
  { pattern: '**/build.gradle.kts', level: 'RESTRICTED', reason: 'Android build configuration affects what ships.', source: 'builtin' },
  { pattern: '**/settings.gradle{,.kts}', level: 'RESTRICTED', reason: 'Gradle module wiring.', source: 'builtin' },
  { pattern: '**/gradle.properties', level: 'RESTRICTED', reason: 'Build tuning and signing configuration.', source: 'builtin' },
  { pattern: 'package.json', level: 'RESTRICTED', reason: 'Adding a dependency changes the build; declare it explicitly.', source: 'builtin' },
  { pattern: 'pubspec.yaml', level: 'RESTRICTED', reason: 'Adding a dependency changes the build; declare it explicitly.', source: 'builtin' },
  { pattern: '{app.json,app.config.js,app.config.ts,eas.json}', level: 'RESTRICTED', reason: 'App configuration governs the build and store identity.', source: 'builtin' },
  { pattern: '{tsconfig.json,babel.config.js,metro.config.js}', level: 'RESTRICTED', reason: 'Toolchain configuration.', source: 'builtin' },

  // --- Tests: restricted rather than protected, because a redesign may need
  //     to update a snapshot — but never to delete a failing assertion. -----
  { pattern: '**/__tests__/**', level: 'RESTRICTED', reason: 'Tests encode expected behaviour; update snapshots only.', source: 'builtin' },
  { pattern: '**/*.{test,spec}.{ts,tsx,js,jsx}', level: 'RESTRICTED', reason: 'Tests encode expected behaviour; update snapshots only.', source: 'builtin' },
  { pattern: '**/*_test.dart', level: 'RESTRICTED', reason: 'Tests encode expected behaviour.', source: 'builtin' },

  // --- Freely designable ----------------------------------------------------
  { pattern: '**/{theme,themes,tokens,design-system,styles,palette,typography}/**', level: 'DESIGNABLE', reason: 'The visual system is the subject of the experiment.', source: 'builtin' },
  { pattern: '**/{components,ui,widgets}/**', level: 'DESIGNABLE', reason: 'Component presentation is designable.', source: 'builtin' },
  { pattern: '**/{screens,pages,views}/**', level: 'DESIGNABLE', reason: 'Screen composition and layout are designable.', source: 'builtin' },
  { pattern: '**/assets/**', level: 'DESIGNABLE', reason: 'Icons, images and fonts are part of the design.', source: 'builtin' },
  { pattern: '**/*.{png,jpg,jpeg,svg,webp,ttf,otf,woff,woff2}', level: 'DESIGNABLE', reason: 'Design assets.', source: 'builtin' },
  { pattern: '**/res/{drawable,layout,values,font,anim,mipmap}*/**', level: 'DESIGNABLE', reason: 'Android resource files carry the visual design.', source: 'builtin' },
];

/**
 * Capability → protection rules. Applied only when the manifest found real
 * evidence for that capability, keeping the contract proportionate.
 */
const CAPABILITY_RULES: Record<string, ReadonlyArray<{ pattern: string; level: ProtectionLevel; reason: string }>> = {
  auth: [
    { pattern: '**/{auth,authentication,session}/**', level: 'PROTECTED', reason: 'Authentication behaviour must be identical after a redesign.' },
    { pattern: '**/{login,signin,signup}/**/*.{ts,tsx,js,jsx,dart,kt}', level: 'RESTRICTED', reason: 'Auth screens may be restyled, but their flow and validation must not change.' },
  ],
  payments: [
    { pattern: '**/{payment,payments,billing,checkout,subscription,subscriptions}/**', level: 'PROTECTED', reason: 'Payment logic is financially sensitive.' },
  ],
  database: [
    { pattern: '**/{db,database,models,entities}/**', level: 'PROTECTED', reason: 'Data models and persistence shape.' },
  ],
  api: [
    { pattern: '**/{api,services,network,http,graphql}/**', level: 'PROTECTED', reason: 'Backend request/response contracts.' },
  ],
  location: [
    { pattern: '**/{location,geo,geolocation}/**', level: 'PROTECTED', reason: 'Location acquisition and permission behaviour.' },
    { pattern: '**/{map,maps}/**/*.{ts,tsx,js,jsx,dart,kt}', level: 'RESTRICTED', reason: 'Map presentation is designable; the location behaviour behind it is not.' },
  ],
  messaging: [
    { pattern: '**/{messaging,notifications,push}/**', level: 'PROTECTED', reason: 'Message delivery and notification behaviour.' },
    { pattern: '**/{chat,messages,conversations}/**/*.{ts,tsx,js,jsx,dart,kt}', level: 'RESTRICTED', reason: 'Chat presentation is designable; delivery semantics are not.' },
  ],
  storage: [
    { pattern: '**/{storage,persistence}/**', level: 'PROTECTED', reason: 'Persistence keys and shapes must remain stable.' },
  ],
  analytics: [
    { pattern: '**/analytics/**', level: 'RESTRICTED', reason: 'Event names are a data contract; surrounding UI may change.' },
  ],
  'native-modules': [
    { pattern: '{ios,android}/**/*.{m,mm,swift,java,kt}', level: 'PROTECTED', reason: 'Native bridge code is outside the design surface.' },
  ],
};

export interface BuildContractOptions {
  manifest: AppManifest;
  config: ProtectionConfig;
  /** Optional rules proposed by the lead agent. */
  proposal?: ContractProposal | null;
}

export function buildContract(options: BuildContractOptions): FunctionalityContract {
  const { manifest, config, proposal } = options;
  const rules: ProtectionRule[] = [...BUILTIN_RULES];

  // Layer 2 — capability-derived rules, with evidence-backed paths.
  for (const capability of manifest.capabilities) {
    if (!capability.present) continue;
    const capabilityRules = CAPABILITY_RULES[capability.key];
    if (!capabilityRules) continue;
    for (const rule of capabilityRules) {
      rules.push({ ...rule, source: 'detected' });
    }
  }

  // Explicitly protect the concrete paths that produced capability evidence
  // for the highest-risk capabilities — a rule with a real path behind it is
  // harder to argue with than a pattern.
  for (const capability of manifest.capabilities) {
    if (!capability.present) continue;
    if (!['payments', 'database', 'auth'].includes(capability.key)) continue;
    for (const path of capability.paths.slice(0, 10)) {
      rules.push({
        pattern: path,
        level: 'PROTECTED',
        reason: `Evidence of ${capability.key} behaviour in this file.`,
        source: 'detected',
      });
    }
  }

  // Layer 2b — accepted model proposals. Tightenings only.
  const proposalNotes: string[] = [];
  if (proposal) {
    for (const proposed of proposal.rules) {
      if (proposed.level === 'DESIGNABLE' || proposed.level === 'UNKNOWN') {
        proposalNotes.push(`Ignored a proposed ${proposed.level} rule for "${proposed.pattern}": agents may only tighten the contract.`);
        continue;
      }
      rules.push({ ...proposed, source: 'detected' });
    }
  }

  // Layer 3 — user rules always win.
  for (const rule of config.rules) {
    rules.push({ ...rule, source: 'user' });
  }

  const invariants = [
    ...defaultInvariants(manifest),
    ...(proposal?.invariants ?? []).map((invariant) => ({ ...invariant, paths: [] })),
  ];

  return {
    schemaVersion: 1,
    projectId: manifest.projectId,
    manifestSha: manifest.sha,
    generatedAt: new Date().toISOString(),
    principle: 'Functionality is frozen. Design is flexible.',
    rules: dedupeRules(rules),
    invariants: dedupeInvariants(invariants),
    approvedExceptions: config.approvedExceptions.map((exception) => ({
      pattern: exception.pattern,
      reason: exception.reason,
      approvedBy: 'config',
    })),
    defaultLevel: 'UNKNOWN',
    notes: [...proposalNotes, ...(proposal?.notes ?? [])],
  };
}

function defaultInvariants(manifest: AppManifest): FunctionalityContract['invariants'] {
  const invariants: FunctionalityContract['invariants'] = [
    {
      id: 'no-behaviour-change',
      statement: 'Every user-visible flow must produce the same outcome as before the redesign.',
      category: 'general',
      paths: [],
    },
    {
      id: 'no-test-weakening',
      statement: 'No existing test may be deleted, skipped, or have an assertion relaxed.',
      category: 'testing',
      paths: [],
    },
  ];

  const has = (key: string): boolean =>
    manifest.capabilities.some((capability) => capability.key === key && capability.present);

  if (has('auth')) {
    invariants.push({
      id: 'auth-boundary',
      statement: 'Unauthenticated users must not reach authenticated screens or data.',
      category: 'authentication',
      paths: [],
    });
  }
  if (has('payments')) {
    invariants.push({
      id: 'payment-amounts',
      statement: 'Prices, totals, currencies and payment confirmation steps must be unchanged.',
      category: 'payments',
      paths: [],
    });
  }
  if (has('location')) {
    invariants.push({
      id: 'location-permission',
      statement: 'Location permission must still be requested before any location is read.',
      category: 'permissions',
      paths: [],
    });
  }
  if (has('messaging')) {
    invariants.push({
      id: 'message-delivery',
      statement: 'Message send, receipt and ordering semantics must be unchanged.',
      category: 'messaging',
      paths: [],
    });
  }
  if (has('database') || has('storage')) {
    invariants.push({
      id: 'persistence-compat',
      statement: 'Persisted data written by the previous version must remain readable.',
      category: 'persistence',
      paths: [],
    });
  }

  return invariants;
}

function dedupeRules(rules: readonly ProtectionRule[]): ProtectionRule[] {
  const byKey = new Map<string, ProtectionRule>();
  for (const rule of rules) {
    const key = `${rule.pattern}::${rule.level}`;
    const existing = byKey.get(key);
    // A later source (detected < user) replaces an earlier one.
    if (!existing || sourceRank(rule.source) >= sourceRank(existing.source)) byKey.set(key, rule);
  }
  return [...byKey.values()];
}

function sourceRank(source: ProtectionRule['source']): number {
  return source === 'user' ? 3 : source === 'detected' ? 2 : 1;
}

function dedupeInvariants(
  invariants: FunctionalityContract['invariants'],
): FunctionalityContract['invariants'] {
  const byId = new Map(invariants.map((invariant) => [invariant.id, invariant]));
  return [...byId.values()];
}
