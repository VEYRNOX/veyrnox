// Veyrnox validation sweep — ONBOARDING STATE MACHINE (Playwright, browser-only).
//
// WHY THIS LIVES OUTSIDE src/  AND IS NOT IN THE VERIFY GATE
// ----------------------------------------------------------
// The CI `verify` gate is `npm test` = vitest run, include `src/**/*.test.{js,jsx}`,
// on ubuntu with NO dev server and NO browser. The onboarding state machine,
// reload-resumption and gate checks below GENUINELY require a real browser + running
// dev server, so they cannot run in that gate. This file is placed in /e2e (outside
// src/) precisely so vitest never tries to import @playwright/test.
//
// 2026-07-05 REWRITE — WEB AUTH MODEL CHANGED, OLD SELECTORS WERE STALE.
// The original spec drove a 6-digit PIN pad ("Choose a 6-digit PIN", digit buttons,
// role=status dots). The WEB build no longer renders any of that: web onboarding is a
// ≥12-char VAULT PASSWORD (H-A minimum; WalletEntry.jsx pin-create branches on
// Capacitor.isNativePlatform()), and the "in this portfolio" dashboard copy was
// deliberately REMOVED for deniability (deniability-wallet-count.test.js asserts its
// absence). In CI every PIN-selector test timed out and retried ×3 — see run
// 28734031084 / web-e2e-results artifact. This rewrite drives the CURRENT web flow.
//
// SELECTOR PROVENANCE (DISCOVER, NEVER INVENT) — all read from src/ on 2026-07-05:
//   * "Get Started"                    — WalletEntry.jsx:244 (WelcomeHero CTA).
//   * "Set a vault password"           — WalletEntry.jsx:1203 (web pin-create, step 1).
//   * password Input ≥12 chars + "Continue" — WalletEntry.jsx:1210-1213.
//   * "Confirm your password" / "Set Password & Continue" — WalletEntry.jsx:1231-1236.
//   * "Passwords didn't match. Try again." — WalletEntry.jsx:1234/1236 (stays on confirm).
//   * "Exploring — view only" + "Create or import" CTA — WalletEntry.jsx ExploreShell
//     (post-Phase-1 landing: real app view-only behind a persistent bottom bar).
//   * "Create Wallet" / "Import an existing seed" — WalletEntry.jsx:1129/1132 (choose).
//   * "Your Seed Phrase (shown once)"  — WalletEntry.jsx:1346 (one-time backup screen).
//   * "I've backed it up — Enter Wallet" — WalletEntry.jsx:1376 (finishCreate).
//   * Authed-shell marker: nav link "Send" — Layout.jsx:64 ({ path: "/send", label: "Send" }).
//     ("in this portfolio" no longer exists — deniability.)
//   * Unlock gate (web password cohort): "Unlock your wallet" + placeholder
//     "Enter your vault password" — WalletEntry.jsx:1049-1056.
//   * Send recipient placeholder "0x... or vitalik.eth or wallet.sol" — SendCrypto.jsx.

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';
const VAULT_PASSWORD = 'e2e-vault-password-01'; // ≥12 chars (H-A web minimum)

// Clear the silently-persisting demo flag (CLAUDE.md known trap) so we exercise the
// REAL local build (the onboarding gate), not the pre-seeded demo pass-through.
async function freshLocalBuild(page) {
  await page.goto(`${BASE}/?demo=0`);
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  // Best-effort: clear any existing vault so we land on first-run welcome.
  await page.evaluate(async () => {
    try { for (const db of await indexedDB.databases?.() || []) indexedDB.deleteDatabase(db.name); } catch {}
  });
  await page.goto(`${BASE}/?demo=0`);
}

// Phase 1 (web cohort): Get Started → set vault password → confirm → choose view.
async function completePasswordSetup(page, password = VAULT_PASSWORD) {
  await page.getByRole('button', { name: 'Get Started' }).click();
  await expect(page.getByText('Set a vault password')).toBeVisible();
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Confirm your password')).toBeVisible();
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: 'Set Password & Continue' }).click();
}

// Phase 1.5: password setup lands in the EXPLORE shell (real app, view-only, no
// vault) behind a persistent bottom-bar CTA (WalletEntry.jsx ExploreShell). Leaving
// explore via that CTA is what reaches the Phase-2 create/import choice. exact:true
// — the portfolio page has a sibling "Create or import a wallet" button.
async function leaveExploreToChoose(page) {
  // exact:true — a sibling "You're exploring — view only. No wallet yet." banner
  // also substring-matches this text.
  await expect(page.getByText('Exploring — view only', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Create or import', exact: true }).click();
}

// Phase 2: choose view → Create Wallet → one-time seed backup → Enter Wallet.
// Vault creation runs real crypto (seed gen + KDF) — allow a generous window.
async function createWalletThroughBackup(page) {
  await page.getByRole('button', { name: /Create Wallet/i }).click();
  await expect(page.getByText('Your Seed Phrase (shown once)')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: /I've backed it up/i }).click();
}

test.describe('onboarding state machine — authoritative order (web password cohort)', () => {
  test('fresh open shows the welcome hero, NOT a dashboard and NOT a credential prompt', async ({ page }) => {
    await freshLocalBuild(page);
    await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible();
    // Illegal: no authed app shell on first paint.
    await expect(page.getByRole('link', { name: 'Send', exact: true })).toHaveCount(0);
  });

  test('Get Started → vault password → confirm → explore → Create Wallet → seed backup → authed shell', async ({ page }) => {
    await freshLocalBuild(page);
    await completePasswordSetup(page);
    await leaveExploreToChoose(page);

    // Phase 2 → the "choose" view. Create Wallet is a SEPARATE atomic action.
    await expect(page.getByRole('button', { name: /Create Wallet/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Import an existing seed/i })).toBeVisible();

    await createWalletThroughBackup(page);
    // Fully authed shell: the nav owns "Send" AND the explore (view-only) bar is
    // gone. The dashboard deliberately shows no wallet count / portfolio copy
    // (deniability), so these are the markers.
    await expect(page.getByRole('link', { name: 'Send', exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Create or import', exact: true })).toHaveCount(0);
  });

  test('confirm-mismatch shows an error and does NOT provision a vault', async ({ page }) => {
    await freshLocalBuild(page);
    await page.getByRole('button', { name: 'Get Started' }).click();
    await expect(page.getByText('Set a vault password')).toBeVisible();
    await page.locator('input[type="password"]').first().fill(VAULT_PASSWORD);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByText('Confirm your password')).toBeVisible();
    await page.locator('input[type="password"]').first().fill('different-password-99');
    await page.getByRole('button', { name: 'Set Password & Continue' }).click();
    await expect(page.getByText(/Passwords didn't match/i)).toBeVisible();
    // Still on the confirm step, still unauthed — nothing was provisioned.
    await expect(page.getByText('Confirm your password')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Send', exact: true })).toHaveCount(0);
  });
});

test.describe('illegal transitions / reload resumption (fail-closed)', () => {
  test('deep-link to /send before onboarding renders the gate, never the Send screen', async ({ page }) => {
    await freshLocalBuild(page);
    await page.goto(`${BASE}/send?demo=0`);
    // The gate (WalletEntry) owns the screen; the Send form's recipient field must NOT appear.
    await expect(page.getByPlaceholder(/0x\.\.\. or .*\.eth/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible();
  });

  test('reload AFTER wallet creation returns to the unlock gate, never straight to an authed view', async ({ page }) => {
    await freshLocalBuild(page);
    await completePasswordSetup(page);
    await leaveExploreToChoose(page);
    await createWalletThroughBackup(page);
    await expect(page.getByRole('link', { name: 'Send', exact: true })).toBeVisible({ timeout: 15000 });

    await page.reload();
    // Returning user: the vault PIN unlock gate must own the screen on reload (web mirrors native).
    await expect(page.getByRole('group', { name: /PIN entry/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Send', exact: true })).toHaveCount(0);
  });
});

// PIN pad a11y — HONESTLY SKIPPED on web. PinPad renders on BOTH native and web
// (WalletEntry.jsx unlock branch). These a11y tests for keyboard interaction with the
// PinPad must be exercised under the native shell (Appium suite — tests/android/),
// not faked here on chromium. The underlying PinPad is the same, but the native
// platform is where biometric+PIN flows and physical-key input are real.
test.describe('PIN pad a11y / keyboard (native-exercised, not web-faked)', () => {
  test.skip(true, 'PinPad a11y is tested on the native shell (Appium). Web exercise would be a fake.');

  test('the status dots expose a live aria-label that tracks entry length', () => {});
  test('physical number-key press enters a PIN digit (keyboard-only users)', () => {});
});
