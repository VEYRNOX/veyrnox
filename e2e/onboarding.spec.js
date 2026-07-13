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
// 2026-07-06 REWRITE #2 — WEB JOINED THE PIN COHORT (lockout-bug fix).
// PR #637 ("unify to native 8-digit PIN") migrated the UNLOCK screen to a numeric
// PinPad but left vault CREATION on the old ≥12-char password Input — a half
// migration meaning any real alphanumeric password could be set but never re-entered
// (PinPad accepts digits only). The fix completes the migration: web now shares
// native's PIN cohort end to end (create, confirm, unlock, recover), authModel is
// always 'pin' on web too, and Phase 2 creation runs through the same
// createWalletFromPendingPin() path as native — which means no seed-backup
// interstitial during onboarding either (native never had one; see WalletEntry.jsx
// finishPinSetup / doCreateWallet).
//
// SELECTOR PROVENANCE (DISCOVER, NEVER INVENT) — all read from src/ on 2026-07-06:
//   * "Get Started"                    — WalletEntry.jsx (WelcomeHero CTA).
//   * "Choose an 8-digit PIN" + PinPad  — WalletEntry.jsx pin-create, step 1 (unified).
//   * "Submit PIN" (PinPad's aria-label — NOT its visible "Continue" text; ARIA
//     accessible-name resolution prefers aria-label) — components/security/PinPad.jsx.
//   * "Confirm your PIN" — WalletEntry.jsx pin-create, step 2 (unified).
//   * "PINs didn't match. Choose again." — WalletEntry.jsx (stays on confirm).
//   * "Exploring — view only" + "Create or import" CTA — WalletEntry.jsx ExploreShell
//     (post-Phase-1 landing: real app view-only behind a persistent bottom bar).
//   * "Create Wallet" / "Import an existing seed" — WalletEntry.jsx (choose view).
//   * Authed-shell marker: nav link "Send" — Layout.jsx ({ path: "/send", label: "Send" }).
//     ("in this portfolio" no longer exists — deniability.)
//   * Unlock gate (PIN cohort): role="group" name /PIN entry/i — WalletEntry.jsx.
//   * Send recipient placeholder "0x... or vitalik.eth or wallet.sol" — SendCrypto.jsx.

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';
const VAULT_PIN = '48273951'; // 8-digit, non-sequential (checkPinStrength rejects patterns)

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

// Enter an 8-digit PIN via PinPad's on-screen digit buttons, then submit. Scoped to
// a PinPad's own "N of 8 digits entered" status region so it never collides with
// unrelated same-named buttons elsewhere on the page.
async function enterPin(page, pin) {
  const pad = page.getByRole('group', { name: /PIN entry/i });
  for (const digit of pin) {
    await pad.getByRole('button', { name: digit, exact: true }).click();
  }
  await pad.getByRole('button', { name: 'Submit PIN' }).click();
}

// Phase 1 (unified PIN cohort): Get Started → choose PIN → confirm → choose view.
async function completePasswordSetup(page, pin = VAULT_PIN) {
  await page.getByRole('button', { name: 'Get Started' }).click();
  await expect(page.getByText('Choose an 8-digit PIN')).toBeVisible();
  await enterPin(page, pin);
  await expect(page.getByText('Confirm your PIN')).toBeVisible();
  await enterPin(page, pin);
}

// Phase 1.5: PIN setup lands in the EXPLORE shell (real app, view-only, no
// vault) behind a persistent bottom-bar CTA (WalletEntry.jsx ExploreShell). Leaving
// explore via that CTA is what reaches the Phase-2 create/import choice. exact:true
// — the portfolio page has a sibling "Create or import a wallet" button.
async function leaveExploreToChoose(page) {
  // exact:true — a sibling "You're exploring — view only. No wallet yet." banner
  // also substring-matches this text.
  await expect(page.getByText('Exploring — view only', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Create or import', exact: true }).click();
}

// Phase 2: choose view → Create Wallet → authed shell. Unified with native: creation
// runs through createWalletFromPendingPin, which does NOT show a seed-backup
// interstitial during onboarding (native never has — see WalletEntry.jsx). Vault
// creation runs real crypto (seed gen + KDF) — allow a generous window.
async function createWalletThroughBackup(page) {
  await page.getByRole('button', { name: /Create Wallet/i }).click();
  await expect(page.getByRole('link', { name: 'Send', exact: true })).toBeVisible({ timeout: 30000 });
}

// Throwaway BIP-39 UAT fixture seed (TESTNET-ONLY, never real value — see project
// memory "throwaway-testnet-seed"). Sourced from the git-ignored .env.test
// (VITE_TEST_THROWAWAY_SEED), loaded via dotenv in playwright.config.ts. Used here
// purely to exercise the import branch; no funds, no chain interaction.
const IMPORT_SEED = process.env.VITE_TEST_THROWAWAY_SEED;
if (!IMPORT_SEED) throw new Error('VITE_TEST_THROWAWAY_SEED not set — see .env.test (loaded via dotenv in playwright.config.ts).');

// Phase 2 (import variant): choose view → "Import an existing seed" → paste phrase →
// Restore / Import. No seed-backup screen (the user supplied the seed) — imports
// land straight on the authed shell.
async function importWalletThroughRestore(page, seed = IMPORT_SEED) {
  await page.getByRole('button', { name: /Import an existing seed/i }).click();
  await page.getByLabel('Recovery seed phrase').fill(seed);
  await page.getByRole('button', { name: /Restore \/ Import/i }).click();
}

test.describe('onboarding state machine — authoritative order (PIN cohort, web/native unified)', () => {
  test('fresh open shows the welcome hero, NOT a dashboard and NOT a credential prompt', async ({ page }) => {
    await freshLocalBuild(page);
    await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible();
    // Illegal: no authed app shell on first paint.
    await expect(page.getByRole('link', { name: 'Send', exact: true })).toHaveCount(0);
  });

  test('Get Started → choose PIN → confirm → explore → Create Wallet → authed shell', async ({ page }) => {
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
    await expect(page.getByText('Choose an 8-digit PIN')).toBeVisible();
    await enterPin(page, VAULT_PIN);
    await expect(page.getByText('Confirm your PIN')).toBeVisible();
    await enterPin(page, '19283746'); // deliberately different 8-digit PIN
    await expect(page.getByText(/PINs didn't match/i)).toBeVisible();
    // Mismatch bounces back to the first PIN step (WalletEntry.jsx resets pinStep to
    // 'real'), still unauthed — nothing was provisioned.
    await expect(page.getByText('Choose an 8-digit PIN')).toBeVisible();
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

  test('reload AFTER wallet creation returns to the unlock gate, and the original PIN actually unlocks it', async ({ page }) => {
    await freshLocalBuild(page);
    await completePasswordSetup(page);
    await leaveExploreToChoose(page);
    await createWalletThroughBackup(page);
    await expect(page.getByRole('link', { name: 'Send', exact: true })).toBeVisible({ timeout: 15000 });

    await page.reload();
    // Returning user: the gate must render the SAME PinPad used at creation (web
    // and native share one PIN cohort now) — asserting a PIN-labelled group is
    // visible is NOT sufficient on its own (a mismatched-credential-surface bug
    // could still hide behind it), so also assert it actually unlocks.
    await expect(page.getByRole('group', { name: /PIN entry/i })).toBeVisible();
    await enterPin(page, VAULT_PIN);
    await expect(page.getByRole('link', { name: 'Send', exact: true })).toBeVisible({ timeout: 15000 });
  });

  test('onboarding-lockout regression: reload after IMPORTING a seed still unlocks with the same 8-digit PIN', async ({ page }) => {
    test.skip(!IMPORT_SEED, 'requires VITE_TEST_THROWAWAY_SEED — see .env.test (git-ignored; unset in CI)');
    // Regression coverage for the web onboarding lockout bug. History: PR #637 made
    // the unlock screen a numeric-only PinPad but left creation on a free-text
    // password (lockout); PR #645 fixed it by routing on authModel instead, keeping
    // BOTH cohorts. This fix goes further: web now shares native's single PIN cohort
    // end to end (create, confirm, unlock, recover) — there is no separate "password
    // cohort" left to route around, since web is a testing-only surface (never
    // production) that should fully mirror native. Importing a seed also lands the
    // device in the PIN cohort, and reload must show the SAME PinPad, not a stale
    // password field.
    await freshLocalBuild(page);
    await completePasswordSetup(page);
    await leaveExploreToChoose(page);
    await importWalletThroughRestore(page);
    await expect(page.getByRole('link', { name: 'Send', exact: true })).toBeVisible({ timeout: 15000 });

    await page.reload();
    // The credential surface must be the same PinPad — a real password field here
    // would mean the reload landed in a stale/mismatched cohort.
    await expect(page.getByRole('group', { name: /PIN entry/i })).toBeVisible();
    await expect(page.getByPlaceholder('Enter your vault password')).toHaveCount(0);

    await enterPin(page, VAULT_PIN);
    await expect(page.getByRole('link', { name: 'Send', exact: true })).toBeVisible({ timeout: 15000 });
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
