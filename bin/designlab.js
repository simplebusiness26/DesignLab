#!/usr/bin/env node
/**
 * DesignLab CLI launcher.
 *
 * Prefers the compiled build, and falls back to a clear message rather than a
 * confusing module-resolution error when the project has not been built.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const compiled = join(here, '..', 'dist', 'cli', 'main.js');

if (!existsSync(compiled)) {
  process.stderr.write(
    'DesignLab has not been built yet.\n' +
      'Run "npm install && npm run build" in the DesignLab checkout, then try again.\n',
  );
  process.exit(1);
}

const { main } = await import(compiled);
process.exitCode = await main(process.argv);
