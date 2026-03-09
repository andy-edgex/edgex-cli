import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/v2_regression/**'],
    globals: false,
    pool: 'forks',
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/utils/**'],
      exclude: ['src/commands/**', 'src/mcp/**', 'src/index.ts'],
    },
  },
});
