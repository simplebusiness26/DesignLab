/**
 * Reference-image candidates.
 *
 * A user can supply UI mockups — one image or a coherent pack — and DesignLab
 * treats them as a first-class design candidate alongside Fable's
 * explorations:
 *
 *   reference images → visual interpretation (lead model, which can view
 *   images through its Read tool) → structured Reference Design Brief →
 *   the same worktree / builder / protection / gate / review pipeline as
 *   every other candidate → APK.
 *
 * The interpretation contract is strict about epistemics: an image shows
 *   presentation. It cannot show behaviour. The interpreter extracts visible
 * design decisions (composition, hierarchy, navigation presentation, spacing,
 * typography, component treatment, density) and must list what the images do
 * NOT establish rather than inventing it. The existing application remains
 * the source of truth for what the app does.
 */

import { readdir, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

import type { AgentRunner } from '../agents/types.js';
import { LEAD_SYSTEM_PROMPT, renderContractContext, renderManifestContext } from '../agents/prompts.js';
import { DesignLabError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { nullLogger } from '../core/logger.js';
import {
  referenceInterpretationSchema,
  type AppManifest,
  type DesignBrief,
  type FunctionalityContract,
} from '../core/schemas.js';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_IMAGES = 12;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export interface ReferencePack {
  dir: string;
  /** Absolute image paths, sorted by filename for stable ordering. */
  images: string[];
}

/** Loads and validates a reference directory (or a single image file). */
export async function loadReferencePack(input: string, cwd: string): Promise<ReferencePack> {
  const path = resolve(cwd, input);
  const info = await stat(path).catch(() => null);

  if (!info) {
    throw new DesignLabError('CONFIG_INVALID', `Reference path does not exist: ${path}`, {
      hint: 'Pass a directory of mockup images (png/jpg/webp), or a single image file.',
    });
  }

  let images: string[];
  if (info.isFile()) {
    if (!IMAGE_EXTENSIONS.has(extname(path).toLowerCase())) {
      throw new DesignLabError('CONFIG_INVALID', `Reference file is not a supported image: ${path}`, {
        hint: `Supported: ${[...IMAGE_EXTENSIONS].join(', ')}`,
      });
    }
    images = [path];
  } else {
    const entries = await readdir(path, { withFileTypes: true });
    images = entries
      .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase()))
      .map((entry) => join(path, entry.name))
      .sort();
  }

  if (images.length === 0) {
    throw new DesignLabError('CONFIG_INVALID', `No reference images found in ${path}`, {
      hint: `Supported: ${[...IMAGE_EXTENSIONS].join(', ')}`,
    });
  }
  if (images.length > MAX_IMAGES) {
    throw new DesignLabError('CONFIG_INVALID', `Too many reference images (${images.length} > ${MAX_IMAGES})`, {
      hint: 'Supply the key screens only; a coherent pack of 3–8 images works best.',
    });
  }
  for (const image of images) {
    const imageInfo = await stat(image);
    if (imageInfo.size > MAX_IMAGE_BYTES) {
      throw new DesignLabError('CONFIG_INVALID', `Reference image is too large: ${image}`, {
        hint: 'Keep individual mockups under 20 MB.',
      });
    }
  }

  return { dir: info.isFile() ? resolve(path, '..') : path, images };
}

export interface InterpretReferenceOptions {
  runner: AgentRunner;
  pack: ReferencePack;
  manifest: AppManifest;
  contract: FunctionalityContract;
  repoDir: string;
  round: number;
  timeoutMs?: number;
  logger?: Logger;
}

/**
 * Interprets a reference pack into a Design Brief occupying slot A of the
 * round, with origin metadata preserved into lineage.
 */
export async function interpretReference(options: InterpretReferenceOptions): Promise<DesignBrief> {
  const logger = (options.logger ?? nullLogger).child({ scope: 'design:reference', round: options.round });

  const response = await options.runner.run({
    role: 'lead',
    operation: 'interpret-reference',
    prompt: buildInterpretationPrompt(options),
    systemPrompt: LEAD_SYSTEM_PROMPT,
    cwd: options.repoDir,
    outputSchema: referenceInterpretationSchema,
    // Read lets the model view the image files; nothing may be modified.
    toolPolicy: { allowed: ['Read', 'Glob', 'Grep'], denied: ['Edit', 'Write', 'Bash', 'NotebookEdit'] },
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ledger: { projectId: options.manifest.projectId, round: options.round, slot: 'A' },
  });

  if (!response.ok || !response.data) {
    throw new DesignLabError(
      'AGENT_FAILED',
      `Reference interpretation failed: ${response.error ?? 'no data returned'}`,
      {
        details: { images: options.pack.images.length },
        hint: 'Check that the images are readable, or run without --reference.',
      },
    );
  }

  const interpretation = response.data;
  logger.info('reference pack interpreted', {
    images: options.pack.images.length,
    slug: interpretation.slug,
    uncertainties: interpretation.uncertainties.length,
  });

  return {
    schemaVersion: 1,
    projectId: options.manifest.projectId,
    round: options.round,
    slot: 'A',
    origin: 'REFERENCE_IMAGE',
    referenceImages: options.pack.images,
    slug: interpretation.slug,
    name: interpretation.name,
    thesis: interpretation.thesis,
    rationale: interpretation.rationale,
    diversityVector: interpretation.diversityVector,
    directives: interpretation.directives,
    targetScreens: interpretation.targetScreens,
    antiPatterns: [
      ...interpretation.antiPatterns,
      // Epistemic guardrails carried into the builder's brief verbatim.
      'Do not invent behaviour the reference images cannot show; the existing app defines what happens.',
      ...interpretation.uncertainties.map(
        (uncertainty) => `Unresolved by the reference images (keep existing behaviour): ${uncertainty}`,
      ),
    ],
    successCriteria: interpretation.successCriteria,
    parent: null,
    generatedAt: new Date().toISOString(),
  };
}

function buildInterpretationPrompt(options: InterpretReferenceOptions): string {
  return [
    'A human has supplied UI mockups for an existing, working mobile application. Your job is to translate',
    'what is VISIBLE in those images into a precise design brief that an engineer can implement against the',
    'real app.',
    '',
    '## The reference images — view every one with the Read tool before writing anything',
    '',
    ...options.pack.images.map((image, index) => `${index + 1}. ${image}`),
    '',
    '## The application the design will be applied to',
    '',
    renderManifestContext(options.manifest, { detailed: true }),
    '',
    '## What must not change',
    '',
    renderContractContext(options.contract),
    '',
    '## What to extract',
    '',
    'From the images, describe as concrete design decisions: composition and spatial model; information',
    'hierarchy; navigation presentation; spacing and density; typography; component treatment (cards,',
    'sheets, modals, buttons); icon treatment; map presentation if shown; and interactions where the visual',
    'affordances make them reasonable to infer.',
    '',
    'Map each visible screen to the real screens in the manifest where the correspondence is clear, and say',
    'so in targetScreens.',
    '',
    '## Epistemic rules — these are hard rules',
    '',
    '- An image shows presentation, never behaviour. Do NOT invent flows, data, permissions or backend',
    '  behaviour from an image. The existing application is the source of truth for what the app does.',
    '- Anything the images leave ambiguous or do not show goes in `uncertainties`, stating that existing',
    '  behaviour must be kept. An empty uncertainties list on a partial mockup pack is itself a failure.',
    '- Directives must be implementable while honouring the functionality contract above.',
    '',
    'Return JSON matching the provided schema. No prose outside the JSON.',
  ].join('\n');
}
