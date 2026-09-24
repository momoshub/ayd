import { defineConfig } from 'vitest/config';

// Opt-in integration tests (real browsers, network). Not part of `pnpm check`.
// Run with `pnpm test:integration` after `pnpm exec playwright install chromium`.
export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.itest.ts', 'apps/**/src/**/*.itest.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
