import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Supervised / UAT harnesses are NOT part of the automated suite. Harness B is
  // human-in-the-loop (blocks up to 20 min per human step — in CI it just burns the
  // clock until the job timeout); the WebAuthn tier-2 harness needs .env.local with
  // VITE_DEV_UNGATE_SEND=1 plus a funded testnet wallet. Run them explicitly with
  // RUN_SUPERVISED_E2E=1 (headed, per their file headers).
  testIgnore: process.env.RUN_SUPERVISED_E2E
    ? []
    : ['**/send-broadcast.harness-b.spec.js', '**/webauthn-prf-tier2-send.spec.js'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
