// Separate Playwright config for the perf sweep. The main playwright.config.ts
// bootstraps a dev server (unbundled) and runs the full e2e suite; perf needs
// the BUILT preview server and only the perf spec, so we don't accidentally
// measure Vite's HMR overhead or drag in unrelated tests.

import { defineConfig, devices } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:4173';

export default defineConfig({
  testDir: '.',
  testMatch: /(web-perf|warm-wallet-perf)\.spec\.js$/,
  fullyParallel: false, // sequential — parallel navigations skew LCP/FCP
  workers: 1,
  retries: 0,           // perf regressions must not be retried away
  timeout: 120_000,     // warm-wallet onboarding runs real KDF (~30s slot)
  reporter: [['list'], ['json', { outputFile: 'results/playwright-report.json' }]],
  use: {
    baseURL: BASE,
    viewport: { width: 1280, height: 800 },
    ...devices['Desktop Chrome'],
  },
});
