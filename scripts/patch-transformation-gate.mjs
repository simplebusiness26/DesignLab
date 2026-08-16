import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(before, after);
}

const runtimePath = 'src/tournaments/xplorer-challenger-b.ts';
let runtime = readFileSync(runtimePath, 'utf8');

runtime = replaceOnce(
  runtime,
  "export const XPLORER_TOURNAMENT_B_ROUTE_COUNT = 76;\n",
  `export const XPLORER_TOURNAMENT_B_ROUTE_COUNT = 76;\nexport const XPLORER_DESIGN_TRANSFORMATION_STANDARD = 'knowledge/DESIGN_TRANSFORMATION_STANDARD.md';\n\nexport const DESIGN_TRANSFORMATION_DIMENSIONS = [\n  'Visual identity',\n  'Navigation presentation',\n  'Page composition',\n  'Information hierarchy',\n  'Component/surface language',\n  'Interaction/state presentation',\n  'Map experience',\n  'Cross-route system coherence',\n] as const;\n`,
  'insert transformation constants',
);

runtime = replaceOnce(
  runtime,
  "const perfect10ScoreSchema = z.object({\n",
  `const designDeltaDimensionSchema = z.object({\n  dimension: z.enum(DESIGN_TRANSFORMATION_DIMENSIONS),\n  rating: z.enum(['major', 'moderate']),\n  evidence: z.array(z.string().min(12)).min(1),\n});\n\nexport const challengerDesignDeltaSchema = z.object({\n  schemaVersion: z.literal(1),\n  challenger: z.enum(XPLORER_CHALLENGERS.map((item) => item.slug) as [XplorerChallengerSlug, ...XplorerChallengerSlug[]]),\n  sourceCommit: z.literal(XPLORER_TOURNAMENT_B_SOURCE_COMMIT),\n  sameDesign: z.literal(false),\n  dimensions: z.array(designDeltaDimensionSchema).length(DESIGN_TRANSFORMATION_DIMENSIONS.length),\n  screenFamilies: z.array(\n    z.object({\n      family: z.string().min(2),\n      structuralChange: z.boolean(),\n      evidence: z.string().min(12),\n    }),\n  ).min(10),\n  paletteIndependence: z.string().min(40),\n  designedFromPersonaModel: z.literal(true),\n});\nexport type ChallengerDesignDelta = z.infer<typeof challengerDesignDeltaSchema>;\n\nconst perfect10ScoreSchema = z.object({\n`,
  'insert design delta schema',
);

runtime = replaceOnce(
  runtime,
  "  requiredOutputs: readonly string[];\n  executionPrompt: string;\n",
  "  requiredOutputs: readonly string[];\n  transformationStandard?: FileFingerprint;\n  executionPrompt: string;\n",
  'extend packet interface',
);

runtime = replaceOnce(
  runtime,
  "  const personaText = await readRequired(root, challenger.persona);\n  const personaFingerprint = sha256(personaText);\n\n  const executionPrompt = [\n",
  `  const personaText = await readRequired(root, challenger.persona);\n  const personaFingerprint = sha256(personaText);\n  const transformationText = index === 0 ? null : await readRequired(root, XPLORER_DESIGN_TRANSFORMATION_STANDARD);\n  const transformationStandard = transformationText\n    ? {\n        path: XPLORER_DESIGN_TRANSFORMATION_STANDARD,\n        sha256: sha256(transformationText),\n        bytes: Buffer.byteLength(transformationText, 'utf8'),\n      }\n    : undefined;\n  const requiredOutputs = index === 0 ? [...REQUIRED_OUTPUTS] : [...REQUIRED_OUTPUTS, 'DESIGN_DELTA.json'];\n\n  const executionPrompt = [\n`,
  'load transformation standard',
);

runtime = replaceOnce(
  runtime,
  "    '10. Do not mark RESULT.json locked until every required artifact exists and every gate genuinely passes.',\n    '',\n    'REQUIRED OUTPUTS',\n    ...REQUIRED_OUTPUTS.map((output) => `- candidates/${challenger.slug}/${output}`),\n",
  `    '10. Do not mark RESULT.json locked until every required artifact exists and every gate genuinely passes.',\n    ...(transformationText\n      ? [\n          '11. Existing Xplorer UI is NOT a template. Product Truth is locked; the current visual/layout system is not.',\n          '12. Create the design from this persona product model first, then implement it. A reskin or simplified old layout automatically fails.',\n          '13. Prove major transformation across visual identity, navigation, composition, hierarchy, components, state presentation, map experience and cross-route coherence.',\n          '14. At least eight of the ten mandatory screen families must have structural change; at least six of eight transformation dimensions must be major.',\n          '15. Do not begin APK compilation until the Design Transformation gate passes.',\n        ]\n      : []),\n    '',\n    'REQUIRED OUTPUTS',\n    ...requiredOutputs.map((output) => \`- candidates/\${challenger.slug}/\${output}\`),\n`,
  'strengthen execution rules',
);

runtime = replaceOnce(
  runtime,
  "    '===== END SELECTED PERSONA PACK =====',\n    ...sharedSections,\n",
  `    '===== END SELECTED PERSONA PACK =====',\n    ...(transformationText\n      ? [\n          '',\n          '===== BEGIN DESIGN TRANSFORMATION STANDARD =====',\n          transformationText.trim(),\n          '===== END DESIGN TRANSFORMATION STANDARD =====',\n        ]\n      : []),\n    ...sharedSections,\n`,
  'inject transformation standard into packet',
);

runtime = replaceOnce(
  runtime,
  "    '- SELF_REVIEW.md must explicitly review the candidate through the selected persona reasoning, including weaknesses found and corrected.',\n    '- The candidate remains blocked until deterministic runtime validation accepts all of the above.',\n",
  `    '- SELF_REVIEW.md must explicitly review the candidate through the selected persona reasoning, including weaknesses found and corrected.',\n    ...(transformationText\n      ? [\n          \`- DESIGN_DELTA.json must use transformation standard SHA-256 \${transformationStandard?.sha256}.\`,\n          '- DESIGN_DELTA.json must prove sameDesign=false, all eight dimensions changed, at least six major dimensions, ten screen families and at least eight structural changes.',\n        ]\n      : []),\n    '- The candidate remains blocked until deterministic runtime validation accepts all of the above.',\n`,
  'add design delta final contract',
);

runtime = replaceOnce(
  runtime,
  "    personaPath: challenger.persona,\n    requiredOutputs: REQUIRED_OUTPUTS,\n    executionPrompt,\n",
  "    personaPath: challenger.persona,\n    requiredOutputs,\n    transformationStandard,\n    executionPrompt,\n",
  'packet fields',
);

runtime = replaceOnce(
  runtime,
  "  const validation = await validateXplorerTournamentB(root);\n  const persona = validation.personas.find((item) => item.slug === challenger.slug);\n",
  "  const validation = await validateXplorerTournamentB(root);\n  const index = XPLORER_CHALLENGERS.findIndex((item) => item.slug === challenger.slug);\n  const persona = validation.personas.find((item) => item.slug === challenger.slug);\n",
  'validator challenger index',
);

runtime = replaceOnce(
  runtime,
  "  await assertSubstantialFile(join(dir, 'DESIGN_THESIS.md'), 'design thesis', 150);\n  await assertSubstantialFile(join(dir, 'SELF_REVIEW.md'), 'persona self-review', 300);\n\n  const resultParsed = challengerResultSchema.safeParse(await readJsonFile(join(dir, 'RESULT.json'), 'RESULT.json'));\n",
  `  await assertSubstantialFile(join(dir, 'DESIGN_THESIS.md'), 'design thesis', 150);\n  await assertSubstantialFile(join(dir, 'SELF_REVIEW.md'), 'persona self-review', 300);\n\n  if (index > 0) {\n    await assertSubstantialFile(join(dir, 'DESIGN_DELTA.json'), 'design transformation proof', 500);\n    const deltaParsed = challengerDesignDeltaSchema.safeParse(\n      await readJsonFile(join(dir, 'DESIGN_DELTA.json'), 'DESIGN_DELTA.json'),\n    );\n    if (!deltaParsed.success) {\n      throw new DesignLabError('STATE_CORRUPT', 'DESIGN_DELTA.json did not pass the Design Transformation schema.', {\n        details: { issues: deltaParsed.error.issues.map((issue) => \`\${issue.path.join('.')}: \${issue.message}\`) },\n      });\n    }\n    if (deltaParsed.data.challenger !== challenger.slug) {\n      throw new DesignLabError('STATE_CORRUPT', 'DESIGN_DELTA.json belongs to a different challenger.');\n    }\n    const dimensionNames = deltaParsed.data.dimensions.map((item) => item.dimension);\n    if (new Set(dimensionNames).size !== DESIGN_TRANSFORMATION_DIMENSIONS.length) {\n      throw new DesignLabError('STATE_CORRUPT', 'DESIGN_DELTA.json repeats or omits a transformation dimension.');\n    }\n    for (const dimension of DESIGN_TRANSFORMATION_DIMENSIONS) {\n      if (!dimensionNames.includes(dimension)) {\n        throw new DesignLabError('STATE_CORRUPT', \`DESIGN_DELTA.json is missing transformation dimension: \${dimension}\`);\n      }\n    }\n    const majorDimensions = deltaParsed.data.dimensions.filter((item) => item.rating === 'major').length;\n    if (majorDimensions < 6) {\n      throw new DesignLabError('STATE_CORRUPT', 'Design Transformation gate requires at least six major dimensions.', {\n        details: { majorDimensions, required: 6 },\n      });\n    }\n    const familyNames = deltaParsed.data.screenFamilies.map((item) => item.family.toLowerCase());\n    if (new Set(familyNames).size !== familyNames.length) {\n      throw new DesignLabError('STATE_CORRUPT', 'DESIGN_DELTA.json contains duplicate screen families.');\n    }\n    const structuralFamilies = deltaParsed.data.screenFamilies.filter((item) => item.structuralChange).length;\n    if (structuralFamilies < 8) {\n      throw new DesignLabError('STATE_CORRUPT', 'Design Transformation gate requires at least eight structurally changed screen families.', {\n        details: { structuralFamilies, required: 8 },\n      });\n    }\n  }\n\n  const resultParsed = challengerResultSchema.safeParse(await readJsonFile(join(dir, 'RESULT.json'), 'RESULT.json'));\n`,
  'validate design delta',
);

writeFileSync(runtimePath, runtime, 'utf8');

const testPath = 'tests/unit/xplorer-challenger-b.test.ts';
let test = readFileSync(testPath, 'utf8');
test = replaceOnce(
  test,
  "  PERFECT_10_CATEGORIES,\n  XPLORER_CHALLENGERS,\n",
  "  DESIGN_TRANSFORMATION_DIMENSIONS,\n  PERFECT_10_CATEGORIES,\n  XPLORER_CHALLENGERS,\n",
  'test import dimensions',
);
test = replaceOnce(
  test,
  "  challengerPerfect10Schema,\n",
  "  challengerDesignDeltaSchema,\n  challengerPerfect10Schema,\n",
  'test import schema',
);

test = replaceOnce(
  test,
  "  it('requires every Perfect-10 category to be scored exactly 5', () => {\n",
  `  it('prepares Alex with the mandatory creative-independence transformation gate', async () => {\n    const packet = await prepareXplorerChallengerPacket({\n      knowledgeRoot: process.cwd(),\n      challenger: 'alex-schleifer',\n    });\n\n    expect(packet.order).toBe(2);\n    expect(packet.requiredOutputs).toContain('DESIGN_DELTA.json');\n    expect(packet.transformationStandard?.path).toBe('knowledge/DESIGN_TRANSFORMATION_STANDARD.md');\n    expect(packet.transformationStandard?.sha256).toMatch(/^[0-9a-f]{64}$/);\n    expect(packet.executionPrompt).toContain('Existing Xplorer UI is NOT a template');\n    expect(packet.executionPrompt).toContain('A reskin or simplified old layout automatically fails');\n  });\n\n  it('rejects design-delta proof that is not a genuine transformation', () => {\n    const valid = challengerDesignDeltaSchema.safeParse({\n      schemaVersion: 1,\n      challenger: 'alex-schleifer',\n      sourceCommit: XPLORER_TOURNAMENT_B_SOURCE_COMMIT,\n      sameDesign: false,\n      dimensions: DESIGN_TRANSFORMATION_DIMENSIONS.map((dimension) => ({\n        dimension,\n        rating: 'major',\n        evidence: ['Concrete implementation and prototype evidence for this changed dimension.'],\n      })),\n      screenFamilies: Array.from({ length: 10 }, (_, index) => ({\n        family: \`family-\${index}\`,\n        structuralChange: index < 8,\n        evidence: 'Documented structural re-composition beyond colour, radius or spacing changes.',\n      })),\n      paletteIndependence: 'The palette was derived from the challenger product model rather than copied from frozen Xplorer.',\n      designedFromPersonaModel: true,\n    });\n    expect(valid.success).toBe(true);\n\n    const invalid = challengerDesignDeltaSchema.safeParse({\n      schemaVersion: 1,\n      challenger: 'alex-schleifer',\n      sourceCommit: XPLORER_TOURNAMENT_B_SOURCE_COMMIT,\n      sameDesign: true,\n      dimensions: DESIGN_TRANSFORMATION_DIMENSIONS.map((dimension) => ({ dimension, rating: 'major', evidence: ['evidence evidence'] })),\n      screenFamilies: Array.from({ length: 10 }, (_, index) => ({ family: \`family-\${index}\`, structuralChange: true, evidence: 'structural evidence' })),\n      paletteIndependence: 'This intentionally long palette explanation still cannot rescue sameDesign=true.',\n      designedFromPersonaModel: true,\n    });\n    expect(invalid.success).toBe(false);\n  });\n\n  it('requires every Perfect-10 category to be scored exactly 5', () => {\n`,
  'insert transformation tests',
);
writeFileSync(testPath, test, 'utf8');

const acceptancePath = 'scripts/acceptance.mjs';
let acceptance = readFileSync(acceptancePath, 'utf8');
acceptance = replaceOnce(
  acceptance,
  "    if (katieLocked) {\n      check('Alex can start after Katie is locked', alexProgress.code === 0);\n    } else {\n",
  `    if (katieLocked) {\n      check('Alex can start after Katie is locked', alexProgress.code === 0);\n      const alex = await runJson([...base, 'prepare', 'alex-schleifer']);\n      check('Alex packet requires Design Transformation proof', alex.data?.requiredOutputs?.includes('DESIGN_DELTA.json'));\n      check('Alex packet loads the creative-independence standard', alex.data?.transformationStandard?.path === 'knowledge/DESIGN_TRANSFORMATION_STANDARD.md');\n      check('Alex transformation standard has a stable fingerprint', /^[0-9a-f]{64}$/.test(alex.data?.transformationStandard?.sha256 ?? ''));\n    } else {\n`,
  'acceptance Alex gate',
);
writeFileSync(acceptancePath, acceptance, 'utf8');

const statePath = 'knowledge/state/DESIGNLAB_STATE.json';
const state = JSON.parse(readFileSync(statePath, 'utf8'));
state.schemaVersion = '1.4.0';
state.challengerTournamentB.designTransformationStandard = 'knowledge/DESIGN_TRANSFORMATION_STANDARD.md';
state.challengerTournamentB.designTransformationGate = 'required-from-challenger-2';
state.challengerTournamentB.sameAppDifferentPolish = 'automatic-failure';
state.challengerTournamentB.apkPipeline = 'validate-transform-then-compile-in-parallel';
state.challengerTournamentB.creativeIndependence = {
  productTruthLocked: true,
  existingUiLocked: false,
  minimumMajorTransformationDimensions: 6,
  totalTransformationDimensions: 8,
  minimumStructurallyChangedScreenFamilies: 8,
  minimumScreenFamiliesReviewed: 10,
};
writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

console.log('Design Transformation gate patched into runtime, tests, acceptance and state.');
