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
// SELECTOR PROVENANCE (DISCOVER, NEVER INVENT) — refreshed 2026-08-10 for Slice D1
// (PR #1696, EntryTiles). Original read from src/ on 2026-07-06.
//   * "New wallet" / "Have a wallet" / "Advanced" tiles — EntryTiles.jsx, rendered
//     by WalletEntry.jsx's view === "entry-tiles" branch (replaces the old
//     WelcomeHero single "Get Started" CTA — WelcomeHero is now dead code kept
//     for reference, per the Slice D1 commit message).
//   * "Choose an 8-digit PIN" + PinPad  — WalletEntry.jsx pin-create, step 1 (unified).
//   * "Submit PIN" (PinPad's aria-label — NOT its visible "Continue" text; ARIA
//     accessible-name resolution prefers aria-label) — components/security/PinPad.jsx.
//   * "Confirm your PIN" — WalletEntry.jsx pin-create, step 2 (unified).
//   * "PINs didn't match. Choose again." — WalletEntry.jsx (stays on confirm).
//   * "Exploring — view only" + "Create or import" CTA — WalletEntry.jsx ExploreShell
//     (post-Phase-1 landing: real app view-only behind a persistent bottom bar).
//   * "Create Wallet" / "Import an existing seed" — WalletEntry.jsx (choose view) —
//     ONLY shown when chosenPath is unset (e.g. reload resumption). Picking "New
//     wallet"/"Have a wallet" on entry-tiles sets chosenPath and the choose view
//     skips straight to auto-create ('new') or the import form ('have').
//   * Authed-shell marker: nav link "Send" — Layout.jsx ({ path: "/send", label: "Send" }).
//     ("in this portfolio" no longer exists — deniability.)
//   * Unlock gate (PIN cohort): role="group" name /PIN entry/i — WalletEntry.jsx.
//   * Send recipient placeholder "0x... or vitalik.eth or wallet.sol" — SendCrypto.jsx.

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const VAULT_PIN = '48273951'; // 8-digit, non-sequential (checkPinStrength rejects patterns)

// Clear the silently-persisting demo flag (CLAUDE.md known trap) so we exercise the
// REAL local build (the onboarding gate), not the pre-seeded demo pass-through.
async function freshLocalBuild(page) {
  await page.goto(`${BASE}/?demo=0`);
  await page.evaluate(() => { try { localStorage.clear(); localStorage.setItem('veyrnox-telemetry-consent', 'granted'); } catch {} });
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

// Phase 1 (unified PIN cohort): entry-tiles pick → choose PIN → confirm → choose
// view. `tile` selects which EntryTiles button to click — 'new' (default) or
// 'have'; both are PIN-first (Slice D1). Regex matches the unit tests'
// selector pattern (src/components/__tests__/EntryTiles.test.jsx).
async function completePasswordSetup(page, pin = VAULT_PIN, tile = 'new') {
  const tileName = tile === 'have' ? /have.*wallet|import|existing/i : /new wallet/i;
  await page.getByRole('button', { name: tileName }).click();
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

// Post-onboarding gate before the authed shell:
//   * fresh CREATE (chosenPath==='new') → <WalletCreatedFlash> — primary is
//     "Set up Personal Backup" (navigates AWAY, not what we want in this spec);
//     dismiss is "Skip for now — take me to my wallet".
//   * fresh IMPORT (chosenPath==='have') → <FirstReceiveCard> — dismiss is
//     "You're set".
// Race all three locators — isVisible() does not auto-wait, so a single-locator
// wait would miss whichever card the path actually rendered.
// (Was "You're set"-only before PR #1724 replaced the CREATE-path card with
// WalletCreatedFlash — the "You're set" button no longer exists on that path.)
async function waitForAuthedShell(page) {
  // Telemetry consent is an interstitial that gates the WHOLE shell, so it is
  // handled first and the rest of the chain re-evaluated after.
  //
  // Why the beforeEach pre-seed is not enough: freshLocalBuild() sets
  // veyrnox-telemetry-consent='granted', but #1783 (cac2e0b6) added
  // clearConsent() to BOTH createWallet and the import path in
  // WalletProvider.jsx — a new wallet identity must not inherit the previous
  // one's consent. That in-flow clear wipes the seeded value, so the one-time
  // screen renders on the NEXT entry, i.e. after the reload-and-unlock these
  // tests perform. Seeding cannot cover it; the screen has to be dismissed.
  //
  // DENY, never grant: a test must not switch real telemetry egress on. See
  // CLAUDE.md on the run that wrote 126 events to production Supabase.
  const consentDeny = page.getByRole('button', { name: 'No thanks' });
  const dismissCreatedFlash = page.getByRole('button', {
    name: 'Skip for now — take me to my wallet',
  });
  const dismissReceiveCard = page.getByRole('button', { name: "You're set" });
  const sendLink = page.getByRole('link', { name: 'Send', exact: true });

  // .first() is REQUIRED on these or-chains. The created-flash overlay renders
  // ON TOP of an already-painted dashboard, so the flash button and the sidebar
  // Send link are visible simultaneously and the chain resolves to 2 elements —
  // a Playwright strict-mode violation, not a missing element. Pre-existing
  // latent bug in this helper; it only surfaced once the import test started
  // routing through it (CI run 31887145905).
  await expect(
    consentDeny.or(dismissCreatedFlash).or(dismissReceiveCard).or(sendLink).first(),
  ).toBeVisible({ timeout: 30000 });
  if (await consentDeny.isVisible()) {
    await consentDeny.click();
    await expect(
      dismissCreatedFlash.or(dismissReceiveCard).or(sendLink).first(),
    ).toBeVisible({ timeout: 30000 });
  }

  if (await dismissCreatedFlash.isVisible()) {
    await dismissCreatedFlash.click();
  } else if (await dismissReceiveCard.isVisible()) {
    await dismissReceiveCard.click();
  }
  await expect(sendLink).toBeVisible({ timeout: 30000 });
}

// Phase 2: PIN confirm → authed shell. Slice D1: chosenPath === 'new' (set by the
// entry-tiles pick in completePasswordSetup) auto-fires wallet creation as soon as
// hasPendingPin flips true — this typically wins the race against the explore
// screen's paint, so it must NOT be reached via leaveExploreToChoose (that "Exploring
// — view only" text may never appear on this path; confirmed empirically 2026-08-10).
// Vault creation runs real crypto (seed gen + KDF) — allow a generous window
// (waitForAuthedShell's 30s).
async function createWalletThroughBackup(page) {
  await waitForAuthedShell(page);
}

// Throwaway BIP-39 UAT fixture seed (TESTNET-ONLY, never real value — see project
// memory "throwaway-testnet-seed"). Sourced from the git-ignored .env.test
// (VITE_TEST_THROWAWAY_SEED), loaded via dotenv in playwright.config.ts. Used here
// purely to exercise the import branch; no funds, no chain interaction.
const IMPORT_SEED = process.env.VITE_TEST_THROWAWAY_SEED;
// Deliberately NO module-scope throw here. Throwing at import time fails Playwright's
// COLLECTION step, which aborts the whole run — two specs needing this seed took down
// all ten and reported "0 tests in 0 files". The `test.skip(!IMPORT_SEED, …)` guard
// below handles the unset case correctly: those tests skip, everything else still runs.

// Phase 2 (import variant): choose view → paste phrase → Restore / Import → authed
// shell (via waitForAuthedShell — the import path also lands on Slice C's
// FirstReceiveCard first). Slice D1: chosenPath === 'have' (set by
// completePasswordSetup(page, pin, 'have')) skips straight to the import form — no
// separate "Import an existing seed" button click needed (that button only shows
// when chosenPath is unset).
async function importWalletThroughRestore(page, seed = IMPORT_SEED) {
  // Slice I: the Have import sub-form is <SeedInputGrid> (per-word boxes),
  // not a single textarea — select the matching word-count tab first if the
  // fixture seed isn't 12 words (the grid's default), then fill each box.
  const words = seed.trim().split(/\s+/);
  if (words.length !== 12) {
    await page.getByRole('button', { name: String(words.length), exact: true }).click();
  }
  const boxes = page.locator('input[id^="seed-word-"]');
  await expect(boxes).toHaveCount(words.length);
  for (let i = 0; i < words.length; i++) {
    await boxes.nth(i).fill(words[i]);
  }
  await page.getByRole('button', { name: /Restore \/ Import/i }).click();
  await waitForAuthedShell(page);
}

test.describe('onboarding state machine — authoritative order (PIN cohort, web/native unified)', () => {
  test('fresh open shows the entry-tiles picker, NOT a dashboard and NOT a credential prompt', async ({ page }) => {
    await freshLocalBuild(page);
    await expect(page.getByRole('button', { name: /new wallet/i })).toBeVisible();
    // Illegal: no authed app shell on first paint.
    await expect(page.getByRole('link', { name: 'Send', exact: true })).toHaveCount(0);
  });

  test('New wallet tile → choose PIN → confirm → auto-create → authed shell', async ({ page }) => {
    await freshLocalBuild(page);
    await completePasswordSetup(page);
    // Slice D1: chosenPath === 'new' auto-fires creation as soon as the PIN is
    // confirmed — no separate "Create Wallet" click, no two-button picker, and
    // (empirically) no reliable "Exploring — view only" paint to wait on either.
    await createWalletThroughBackup(page);
    // Fully authed shell: the nav owns "Send" AND the explore (view-only) bar is
    // gone. The dashboard deliberately shows no wallet count / portfolio copy
    // (deniability), so these are the markers.
    await expect(page.getByRole('link', { name: 'Send', exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Create or import', exact: true })).toHaveCount(0);
  });

  test('confirm-mismatch shows an error and does NOT provision a vault', async ({ page }) => {
    await freshLocalBuild(page);
    await page.getByRole('button', { name: /new wallet/i }).click();
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
    await expect(page.getByRole('button', { name: /new wallet/i })).toBeVisible();
  });

  test('reload AFTER wallet creation returns to the unlock gate, and the original PIN actually unlocks it', async ({ page }) => {
    await freshLocalBuild(page);
    await completePasswordSetup(page);
    // Slice D1: chosenPath === 'new' auto-fires creation on PIN confirm — no
    // explore step to leave (see createWalletThroughBackup).
    await createWalletThroughBackup(page);
    await expect(page.getByRole('link', { name: 'Send', exact: true })).toBeVisible({ timeout: 15000 });

    await page.reload();
    // Returning user: the gate must render the SAME PinPad used at creation (web
    // and native share one PIN cohort now) — asserting a PIN-labelled group is
    // visible is NOT sufficient on its own (a mismatched-credential-surface bug
    // could still hide behind it), so also assert it actually unlocks.
    await expect(page.getByRole('group', { name: /PIN entry/i })).toBeVisible();
    await enterPin(page, VAULT_PIN);
    // Via waitForAuthedShell, not a bare Send assertion: creation cleared stored
    // consent (#1783), so this first post-creation entry meets the one-time
    // telemetry screen before the dashboard. The helper dismisses it and still
    // ends on the same Send-link assertion, so the unlock claim is unweakened.
    await waitForAuthedShell(page);
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
    await completePasswordSetup(page, VAULT_PIN, 'have');
    // Slice I: the explore-intercept guard gained `&& !chosenPath`, so
    // chosenPath === 'have' now skips ExploreShell entirely — PIN confirm
    // lands directly on the Have import form, with no "Exploring — view
    // only" screen to leave via leaveExploreToChoose(). Assert the skip
    // holds (not just that the import form eventually appears) so a
    // regression that reopens the explore-flash bug fails here.
    await expect(page.locator('[data-testid="explore-shell"]')).toHaveCount(0);
    await importWalletThroughRestore(page);
    await expect(page.getByRole('link', { name: 'Send', exact: true })).toBeVisible({ timeout: 15000 });

    await page.reload();
    // The credential surface must be the same PinPad — a real password field here
    // would mean the reload landed in a stale/mismatched cohort.
    await expect(page.getByRole('group', { name: /PIN entry/i })).toBeVisible();
    await expect(page.getByPlaceholder('Enter your vault password')).toHaveCount(0);

    await enterPin(page, VAULT_PIN);
    // Same reason as the creation test above — #1783 clears consent on IMPORT
    // too, so this entry meets the one-time telemetry screen first.
    await waitForAuthedShell(page);
  });
});

// PIN pad a11y — the DOM-contract half runs on web (PinPad renders on both
// platforms via WalletEntry.jsx). The physical-key/biometric half is
// legitimately native-only (Appium — tests/android/). Codex P2 2026-08-15:
// blanket test.skip(true) with empty bodies left zero executable coverage for
// the a11y contract the section named; the DOM-contract case now runs on web.
test.describe('PIN pad a11y — web-exercisable DOM contract', () => {
  test('the dot row is aria-hidden and does NOT leak digit-count into a11y tree', async ({ page }) => {
    await freshLocalBuild(page);
    // Slice D1: "New wallet" tile → auto-fires creation on the choose view.
    await page.getByRole('button', { name: /new wallet/i }).click();
    await expect(page.getByText('Choose an 8-digit PIN')).toBeVisible({ timeout: 15000 });

    const pad = page.getByRole('group', { name: /PIN entry/i });

    // Codex P3 2026-08-15: the dot row used to be role="status" with a
    // live aria-label "N of M digits entered". That announced every
    // keystroke to any AT / screen-reader relay — a credential-entry side
    // channel. Now the dot row is aria-hidden; the static input hint
    // ("Use your keyboard to type your PIN, then press Enter or Submit.")
    // is the sole AT affordance. Positive guard: the leak MUST NOT return.
    await expect(pad.locator('[role="status"]')).toHaveCount(0);
    await expect(pad.locator('[aria-label*="digits entered"]')).toHaveCount(0);
    await expect(pad.locator('[aria-hidden="true"]').first()).toBeVisible();
    await expect(pad.locator('#pin-hint')).toHaveText(/Use your keyboard to type your PIN/);

    // Verify visual dot fill still tracks entry length for sighted users
    // (bg-primary is the fill class in PinPad.jsx).
    await expect(pad.locator('span.bg-primary')).toHaveCount(0);
    await pad.getByRole('button', { name: '4', exact: true }).click();
    await expect(pad.locator('span.bg-primary')).toHaveCount(1);
    await pad.getByRole('button', { name: '2', exact: true }).click();
    await expect(pad.locator('span.bg-primary')).toHaveCount(2);
  });
});

test.describe('PIN pad — physical-key input (native-only, Appium)', () => {
  test.skip(true, 'Physical-key input + biometric flows are exercised on the native shell (Appium — tests/android/). Web exercise would be a fake.');

  test('physical number-key press enters a PIN digit (keyboard-only users)', () => {});
});
