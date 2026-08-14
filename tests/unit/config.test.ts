import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  applyEnvOverrides,
  applyOverrides,
  defaultConfig,
  loadConfigFile,
  parseConfig,
  writeConfigFile,
} from '../../src/config/config.js';
import { DesignLabError } from '../../src/core/errors.js';
import { writeJson } from '../../src/core/fsx.js';
import { makeTempDir } from '../helpers/fixture-repo.js';

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await makeTempDir('designlab-config-');
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('defaultConfig', () => {
  it('encodes the intended orchestration policy', () => {
    const config = defaultConfig();
    expect(config.models.lead).toBe('fable');
    expect(config.models.builder).toBe('sonnet');
    expect(config.models.reviewer).toBe('opus');
    // Opus must not be reachable on a first failure.
    expect(config.limits.builderAttempts).toBeGreaterThanOrEqual(2);
    expect(config.limits.escalations).toBeLessThanOrEqual(1);
    expect(config.protection.failOnRestricted).toBe(true);
  });

  it('parses an empty object into full defaults', () => {
    expect(parseConfig({}, 'test')).toEqual(defaultConfig());
    expect(parseConfig(undefined, 'test')).toEqual(defaultConfig());
  });
});

describe('parseConfig', () => {
  it('reports the offending field rather than failing generically', () => {
    let thrown: unknown;
    try {
      parseConfig({ limits: { concurrency: 99 } }, 'designlab.config.json');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DesignLabError);
    expect((thrown as DesignLabError).code).toBe('CONFIG_INVALID');
    expect((thrown as DesignLabError).message).toContain('limits.concurrency');
  });

  it('rejects an unknown protection level', () => {
    expect(() =>
      parseConfig({ protection: { rules: [{ pattern: 'a/**', level: 'SACRED', reason: 'x' }] } }, 'test'),
    ).toThrow(DesignLabError);
  });

  it('accepts project protection overrides', () => {
    const config = parseConfig(
      {
        protection: {
          rules: [{ pattern: 'src/pricing/**', level: 'PROTECTED', reason: 'pricing rules' }],
          approvedExceptions: [{ pattern: 'src/pricing/labels.ts', reason: 'copy only' }],
          failOnUnknown: true,
        },
      },
      'test',
    );
    expect(config.protection.rules).toHaveLength(1);
    expect(config.protection.approvedExceptions[0]?.pattern).toBe('src/pricing/labels.ts');
    expect(config.protection.failOnUnknown).toBe(true);
  });
});

describe('loadConfigFile', () => {
  it('returns defaults when no file exists', async () => {
    const dir = await tempDir();
    const { config, exists } = await loadConfigFile(join(dir, 'designlab.config.json'));
    expect(exists).toBe(false);
    expect(config).toEqual(defaultConfig());
  });

  it('round-trips a written config', async () => {
    const dir = await tempDir();
    const path = join(dir, 'designlab.config.json');
    const original = { ...defaultConfig(), repo: 'https://github.com/owner/app', branch: 'develop' };

    await writeConfigFile(path, original);
    const { config, exists } = await loadConfigFile(path);

    expect(exists).toBe(true);
    expect(config.repo).toBe('https://github.com/owner/app');
    expect(config.branch).toBe('develop');
  });

  it('surfaces an invalid file as CONFIG_INVALID', async () => {
    const dir = await tempDir();
    const path = join(dir, 'designlab.config.json');
    await writeJson(path, { limits: { builderAttempts: 0 } });
    await expect(loadConfigFile(path)).rejects.toThrow(DesignLabError);
  });
});

describe('applyEnvOverrides', () => {
  it('applies recognised environment variables only', () => {
    const config = applyEnvOverrides(defaultConfig(), {
      DESIGNLAB_LOG_LEVEL: 'debug',
      DESIGNLAB_CLAUDE_BIN: '/opt/claude',
      DESIGNLAB_AGENT_RUNNER: 'mock',
      UNRELATED: 'x',
    });
    expect(config.logLevel).toBe('debug');
    expect(config.claudeBin).toBe('/opt/claude');
    expect(config.agentRunner).toBe('mock');
  });

  it('ignores an invalid log level rather than throwing', () => {
    expect(applyEnvOverrides(defaultConfig(), { DESIGNLAB_LOG_LEVEL: 'loud' }).logLevel).toBe('info');
  });
});

describe('applyOverrides', () => {
  it('merges nested sections without dropping unspecified fields', () => {
    const merged = applyOverrides(defaultConfig(), {
      branch: 'develop',
      limits: { concurrency: 4 } as never,
    });
    expect(merged.branch).toBe('develop');
    expect(merged.limits.concurrency).toBe(4);
    expect(merged.limits.builderAttempts).toBe(defaultConfig().limits.builderAttempts);
  });

  it('ignores undefined overrides', () => {
    const merged = applyOverrides(defaultConfig(), { branch: undefined });
    expect(merged.branch).toBe('main');
  });
});
