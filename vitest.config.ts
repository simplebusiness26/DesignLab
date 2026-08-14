import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Integration tests create real Git repositories and worktrees; give them
    // room without letting a hung child process stall the whole suite.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    environment: 'node',
    pool: 'forks',
    reporters: ['default'],
  },
});
