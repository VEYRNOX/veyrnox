// Veyrnox validation sweep — ONBOARDING STATE MACHINE (Playwright, browser-only).
//
// WHY THIS LIVES OUTSIDE src/  AND IS NOT IN THE VERIFY GATE
// ----------------------------------------------------------
// The CI `verify` gate is `npm test` = vitest run, include `src/**/*.test.{js,jsx}`,
// on ubuntu with NO dev server and NO browser. The onboarding state machine,
// reload-resumption, focus-trap and keyboard-nav checks below GENUINELY require a
// real browser + running dev server, so they cannot run in that gate. This file is
// placed in /e2e (outside src/) precisely so vitest never tries to import
// @playwright/test (which is not in devDependencies) and turn the gate red.
//
// HONEST STATUS (report it faithfully): these specs were AUTHORED from REAL,
// discovered selectors (button text / aria-labels read out of WalletEntry.jsx and
// PinPad.jsx, and two facts verified LIVE against the running dev server — see
// below). They were NOT executed in the authoring environment because Playwright
// is not installed here. To run:
//     npm i -D @playwright/test && npx playwright install chromium
//     npx playwright test e2e/onboarding.spec.js   # dev server on :5173
//
// SELECTOR PROVENANCE (DISCOVER, NEVER INVENT)
//   * "Get Started"        — WalletEntry WelcomeHero; VERIFIED LIVE at /?demo=0.
//   * PIN dots aria-label  — PinPad.jsx:26 `${value.length} of ${length} digits entered`; VERIFIED LIVE pattern.
//   * digit buttons "0".."9" — PinPad.jsx:65-74 (button text).
//   * "Choose a 6-digit PIN" / "Confirm your PIN" — WalletEntry.jsx:853/861.
//   * "Create Wallet" / "Import an existing seed" — WalletEntry.jsx:791/794.
// No data-testid exists on these surfaces (see report: T-INFRA "no stable selector"),
// so role+text is the only available handle — recorded as a coverage risk.

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

// Clear the silently-persisting demo flag (CLAUDE.md known trap) so we exercise the
// REAL local build (the onboarding gate), not the pre-seeded demo pass-through.
async function freshLocalBuild(page) {
  await page.goto(`${BASE}/?demo=0`);
  await page.evaluate(() => { try { localStorage.removeItem('veyrnox-demo'); } catch {} });
  // Best-effort: clear any existing vault so we land on first-run welcome.
  await page.evaluate(async () => {
    try { for (const db of await indexedDB.databases?.() || []) indexedDB.deleteDatabase(db.name); } catch {}
  });
  await page.goto(`${BASE}/?demo=0`);
}

async function enterPin(page, digits) {
  for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click();
}

test.describe('onboarding state machine — authoritative order', () => {
  test('fresh open shows the welcome hero, NOT a dashboard and NOT a raw PIN pad', async ({ page }) => {
    await freshLocalBuild(page);
    await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible();
    // Illegal: no authed dashboard content on first paint.
    await expect(page.getByText(/in this portfolio/i)).toHaveCount(0);
  });

  test('Get Started → PIN-create (6-digit) → confirm → empty dashboard (choose) → Create Wallet', async ({ page }) => {
    await freshLocalBuild(page);
    await page.getByRole('button', { name: 'Get Started' }).click();

    await expect(page.getByText('Choose a 6-digit PIN')).toBeVisible();
    await enterPin(page, '123456');                       // auto-advances at 6th digit
    await expect(page.getByText('Confirm your PIN')).toBeVisible();
    await enterPin(page, '123456');

    // Phase 1 complete → the "choose" view. Create Wallet is a SEPARATE atomic action.
    await expect(page.getByRole('button', { name: /Create Wallet/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Import an existing seed/i })).toBeVisible();

    await page.getByRole('button', { name: /Create Wallet/i }).click();
    // Wallet dashboard (real build = WalletPortfolioPage) eventually renders.
    await expect(page.getByText(/in this portfolio/i)).toBeVisible({ timeout: 15000 });
  });

  test('confirm-mismatch resets to the PIN-create step with an error (no provisioning)', async ({ page }) => {
    await freshLocalBuild(page);
    await page.getByRole('button', { name: 'Get Started' }).click();
    await enterPin(page, '123456');
    await expect(page.getByText('Confirm your PIN')).toBeVisible();
    await enterPin(page, '654321');                       // mismatch
    await expect(page.getByText(/didn.t match/i)).toBeVisible();
    await expect(page.getByText('Choose a 6-digit PIN')).toBeVisible(); // reset to step 1
  });
});

test.describe('illegal transitions / reload resumption (fail-closed)', () => {
  test('deep-link to /send before unlock renders the gate, never the Send screen', async ({ page }) => {
    await freshLocalBuild(page);
    await page.goto(`${BASE}/send?demo=0`);
    // The gate (WalletEntry) owns the screen; the Send form's recipient field must NOT appear.
    await expect(page.getByPlaceholder(/0x\.\.\. or .*\.eth/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible();
  });

  test('reload AFTER wallet creation returns to the PIN pad, never straight to an authed view', async ({ page }) => {
    await freshLocalBuild(page);
    await page.getByRole('button', { name: 'Get Started' }).click();
    await enterPin(page, '123456');
    await enterPin(page, '123456');
    await page.getByRole('button', { name: /Create Wallet/i }).click();
    await expect(page.getByText(/in this portfolio/i)).toBeVisible({ timeout: 15000 });

    await page.reload();
    // Returning user: the PIN-unlock pad (status dots) must gate access on reload.
    await expect(page.getByText('Enter your PIN')).toBeVisible();
    await expect(page.getByText(/in this portfolio/i)).toHaveCount(0);
  });
});

test.describe('PIN pad a11y / keyboard (browser-only — see FLAG A11Y-PIN-1)', () => {
  test('the 6 status dots expose a live aria-label that tracks entry length', async ({ page }) => {
    await freshLocalBuild(page);
    await page.getByRole('button', { name: 'Get Started' }).click();
    await expect(page.getByRole('status', { name: '0 of 6 digits entered' })).toBeVisible();
    await page.getByRole('button', { name: '1', exact: true }).click();
    await expect(page.getByRole('status', { name: '1 of 6 digits entered' })).toBeVisible();
  });

  // EXPECTED TO FAIL until fixed — documents FLAG A11Y-PIN-1: there is no keydown
  // handler, so a physical number key does NOT enter a digit. Remove `.fail` when fixed.
  test.fail('physical number-key press enters a PIN digit (keyboard-only users)', async ({ page }) => {
    await freshLocalBuild(page);
    await page.getByRole('button', { name: 'Get Started' }).click();
    await page.keyboard.press('Digit1');
    await expect(page.getByRole('status', { name: '1 of 6 digits entered' })).toBeVisible();
  });
});
