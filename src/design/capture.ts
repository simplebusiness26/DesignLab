/**
 * Screen capture for design review — interface now, adapters later.
 *
 * Fable's creative review is materially stronger when it can *see* the
 * rendered implementation instead of inferring it from diffs. Real capture
 * needs framework-specific machinery (an emulator or web preview, navigation
 * scripting, screenshotting) that does not exist yet, and pretending
 * otherwise would poison the review stage with fabricated evidence.
 *
 * So the boundary is defined honestly:
 *
 *  - the orchestrator asks the adapter to capture after gates pass and
 *    records the outcome on the candidate (`captured` / `unsupported` /
 *    `failed` — never silently absent);
 *  - the review stage attaches captured images to Fable's prompt when, and
 *    only when, they exist (the lead model views them via its Read tool,
 *    exactly as reference mockups are viewed);
 *  - the shipped adapter reports `unsupported` for every framework, in so
 *    many words.
 *
 * Implementing a real adapter is purely additive: satisfy this interface and
 * register it; nothing else changes.
 */

import type { AppManifest, CaptureStatus } from '../core/schemas.js';
import type { WorktreeLease } from '../git/worktree-manager.js';

export interface CaptureRequest {
  lease: WorktreeLease;
  manifest: AppManifest;
  /** Screens the brief targets — the ones worth capturing first. */
  targetScreens: readonly string[];
  /** Directory the adapter should write images into. */
  outputDir: string;
}

export interface CaptureResult {
  status: CaptureStatus;
  /** Absolute paths of captured images; empty unless status is `captured`. */
  images: string[];
  /** Honest explanation for `unsupported` and `failed`. */
  reason: string;
}

export interface ScreenCaptureAdapter {
  readonly name: string;
  /** Cheap capability check; called before any capture attempt. */
  supports(manifest: AppManifest): boolean;
  capture(request: CaptureRequest): Promise<CaptureResult>;
}

/**
 * The shipped adapter: no framework is supported yet, and it says so.
 * `captureStatus: 'unsupported'` on a candidate means exactly this.
 */
export class NullCaptureAdapter implements ScreenCaptureAdapter {
  readonly name = 'none';

  supports(): boolean {
    return false;
  }

  capture(request: CaptureRequest): Promise<CaptureResult> {
    return Promise.resolve({
      status: 'unsupported',
      images: [],
      reason:
        `Screen capture is not yet implemented for ${request.manifest.framework}. ` +
        'Review proceeds on code and diff evidence only.',
    });
  }
}

export const defaultCaptureAdapter: ScreenCaptureAdapter = new NullCaptureAdapter();
