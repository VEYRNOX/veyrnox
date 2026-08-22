import { config } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

// Load .env.test at the very top before any tests run
config({ path: '.env.test' });

export default defineConfig({
  testDir: './e2e',
  // Supervised / UAT harnesses are NOT part of the automated suite. Harness B is
  // human-in-the-loop (blocks up to 20 min per human step — in CI it just burns the
  // clock until the job timeout); the WebAuthn tier-2 harness needs .env.local with
  // VITE_DEV_UNGATE_SEND=1 plus a funded testnet wallet; the Sepolia-verified harness
  // hardcodes the public Hardhat/Ganache test mnemonic, which holds no real funds and
  // cannot complete a real send. Run them explicitly with RUN_SUPERVISED_E2E=1 (headed,
  // per their file headers).
  testIgnore: process.env.RUN_SUPERVISED_E2E
    ? []
    : [
        '**/send-broadcast.harness-b.spec.js',
        '**/webauthn-prf-tier2-send.spec.js',
        '**/webauthn-prf-sepolia-verified.spec.js',
        '**/walletconnect-live-pairing.spec.js',
      ],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 60000,
  // 73 tests on a single worker could not finish inside the 20-minute CI step budget —
  // and `retries: 2` means every failing test costs 3x, so failures made it worse, not
  // just slower. Files still run serially within a worker (fullyParallel: false), but
  // separate spec FILES can now run concurrently, which is where the wall-clock goes.
  workers: process.env.CI ? 6 : 1,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Since the low-end threshold dropped to <=2GB/<=2 cores, CI chromium no
    // longer counts as low-end and the two 14s/18s Framer Motion lamp loops
    // run for the whole suite duration — enough load to trip the chromium
    // session crash the onboarding illegal-transit specs hit. The components
    // already short-circuit their animate/transition props when prefers-
    // reduced-motion is set, so force reduce for every test.
    reducedMotion: 'reduce',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Deployed-preview project. It matches ONLY the smoke spec: the rest of the
    // suite cannot run against a built deployment (seven specs import
    // '/src/**' at runtime, which exists only while Vite serves source in dev).
    //
    // testMatch also stops the whole suite running twice. `web-e2e-tests`
    // invokes `playwright test` with no --project, so every project runs — and
    // this one silently re-ran all 73 specs against localhost, doubling CI time
    // and doubling the exposure to flaky tests. qa-demo-isolation failed here
    // under [staging] while passing on retry under [chromium].
    //
    // The specs navigate with ABSOLUTE urls built from their own BASE const
    // (which reads process.env.BASE_URL), so Playwright's `baseURL` is never
    // consulted. It is set here only for completeness.
    {
      name: 'staging',
      testMatch: /staging-smoke\.spec\.js$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.BASE_URL || 'http://127.0.0.1:5173',
      },
    },
  ],

  // Skip the local dev server only when tests target a remote deployment.
  webServer: process.env.BASE_URL ? undefined : {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
