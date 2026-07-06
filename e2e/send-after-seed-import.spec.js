// Veyrnox validation sweep — SEND-AFTER-SEED-IMPORT (Playwright, browser-only).
//
// WHY THIS LIVES OUTSIDE src/ — same reason as onboarding.spec.js: this needs a real
// browser + running dev server (react-router navigation, WalletProvider async probes),
// which vitest's node/jsdom `verify` gate cannot exercise.
//
// REGRESSION UNDER TEST (2026-07-06): reported bug — after importing a seed via the
// onboarding flow (same session, no reload), clicking the sidebar "Send" link
// (navigation.js "/send" entry, Layout.jsx ~line 223) briefly navigates to /send then
// immediately bounces back to `/` within ~1s; the Send form never renders.
//
// ROOT CAUSE (found via recon, confirmed by this test going red first): WalletProvider
// resolves `vaultExists`/`vaultChecking` ONCE on mount (src/lib/WalletProvider.jsx
// ~line 609, deps `[]`) via a `keyStore.hasVault()` probe taken BEFORE onboarding ever
// runs. `createWallet`/`importWallet` (~line 852/897) never update that state after
// successfully provisioning a vault. SendCrypto.jsx's cold-load/deep-link guard
// (~line 118-124) reads the STALE `vaultExists === false` from that pre-onboarding probe
// and immediately navigates home — even though a real vault now exists in the SAME
// session. A page reload "fixes" it only because the mount-time probe re-runs against
// the now-real vault; this test deliberately does NOT reload, to isolate the same-session
// staleness.
//
// SELECTOR PROVENANCE (DISCOVER, NEVER INVENT) — read from src/ on 2026-07-06. Web
// now shares native's PIN cohort end to end (lockout-bug fix; see onboarding.spec.js
// header for the full history):
//   * "Get Started" / "Choose an 8-digit PIN" / "Confirm your PIN" — WalletEntry.jsx
//     (see onboarding.spec.js for the PinPad-driving helper).
//   * "Create or import" CTA (leave explore) — WalletEntry.jsx ExploreShell.
//   * "Import an existing seed" button — WalletEntry.jsx (choose view).
//   * Recovery seed textarea (aria-label "Recovery seed phrase") — WalletEntry.jsx.
//   * "Restore / Import" button — WalletEntry.jsx.
//   * Authed-shell marker + sidebar nav link "Send" — Layout.jsx (navGroups, ~line 223).
//   * Send form recipient field id="send-recipient" (Label "Send to (address or name)") —
//     SendCrypto.jsx:1029-1037 (placeholder text has since changed from the stale one
//     referenced in onboarding.spec.js's header comment; the input id is the stable hook).

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';
const VAULT_PIN = '48273951'; // 8-digit, non-sequential (checkPinStrength rejects patterns)
// Designated throwaway BIP-39 testnet/faucet fixture seed (never holds real value).
const THROWAWAY_SEED = 'bamboo lyrics harvest potato seat carry equip nation slam begin admit pet';

async function freshLocalBuild(page) {
  await page.goto(`${BASE}/?demo=0`);
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.evaluate(async () => {
    try { for (const db of await indexedDB.databases?.() || []) indexedDB.deleteDatabase(db.name); } catch {}
  });
  await page.goto(`${BASE}/?demo=0`);
}

async function enterPin(page, pin) {
  const pad = page.getByRole('group', { name: /PIN entry/i });
  for (const digit of pin) {
    await pad.getByRole('button', { name: digit, exact: true }).click();
  }
  await pad.getByRole('button', { name: 'Submit PIN' }).click();
}

async function completePasswordSetup(page, pin = VAULT_PIN) {
  await page.getByRole('button', { name: 'Get Started' }).click();
  await expect(page.getByText('Choose an 8-digit PIN')).toBeVisible();
  await enterPin(page, pin);
  await expect(page.getByText('Confirm your PIN')).toBeVisible();
  await enterPin(page, pin);
}

async function leaveExploreToChoose(page) {
  await expect(page.getByText('Exploring — view only', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Create or import', exact: true }).click();
}

// Phase 2 (import): choose view -> "Import an existing seed" -> paste phrase -> Restore.
async function importSeedThroughChoose(page, seed = THROWAWAY_SEED) {
  await page.getByRole('button', { name: /Import an existing seed/i }).click();
  await page.getByLabel('Recovery seed phrase').fill(seed);
  await page.getByRole('button', { name: /Restore \/ Import/i }).click();
}

test.describe('Send after same-session seed import (no reload)', () => {
  test('Send link navigates to /send and the Send form stays rendered (no bounce to /)', async ({ page }) => {
    await freshLocalBuild(page);
    await completePasswordSetup(page);
    await leaveExploreToChoose(page);
    await importSeedThroughChoose(page);

    // Fully authed shell, same session, NO reload.
    const sendLink = page.getByRole('link', { name: 'Send', exact: true });
    await expect(sendLink).toBeVisible({ timeout: 15000 });

    await sendLink.click();
    await expect(page).toHaveURL(`${BASE}/send`);
    await expect(page.locator('#send-recipient')).toBeVisible({ timeout: 5000 });

    // The reported bug bounces back to `/` within ~1s. Wait past that window and
    // assert we are STILL on /send with the form rendered, not silently redirected home.
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(`${BASE}/send`);
    await expect(page.locator('#send-recipient')).toBeVisible();
  });
});
