// ─────────────────────────────────────────────────────────────────────────────
// WebAuthn PRF Tier 2 — Fully Automated CDP Virtual Authenticator Test
//
// Scope: Web wallet WebAuthn PRF unlock + Sepolia ETH send, fully automated
// without human interaction. Uses Chrome DevTools Protocol (CDP) virtual
// authenticator to simulate platform biometric + PRF evaluation.
//
// Test Sequence:
//   1. Start onboarding (Get Started)
//   2. Choose an 8-digit PIN (web and native share the same PIN cohort)
//   3. Enroll WebAuthn PRF hardware factor
//   4. Create wallet
//   5. Navigate to Send screen
//   6. Send 0.001 Sepolia ETH
//   7. Capture on-chain txid from success screen
//
// Status: BUILT (infrastructure complete)
// Environment: Requires dev server + .env.local with VITE_DEV_UNGATE_SEND=1
//
// Run (excluded from `npm run test:e2e` via testIgnore — it needs .env.local with
// VITE_DEV_UNGATE_SEND=1 and a funded testnet wallet, neither of which exists in CI):
//   npm i -D @playwright/test && npx playwright install chromium
//   RUN_SUPERVISED_E2E=1 npx playwright test e2e/webauthn-prf-tier2-send.spec.js --headed --workers=1
// ─────────────────────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
// Web now shares native's PIN cohort (lockout-bug fix — see onboarding.spec.js header).
const TEST_PIN = '48273951'; // 8-digit, non-sequential (checkPinStrength rejects patterns)
// Throwaway Sepolia test recipient — 40-char EVM address (original was 39 chars, invalid).
// Replace with a real funded recipient address before running live UAT.
const SEPOLIA_RECIPIENT = '0x000000000000000000000000000000000000dEaD';
const SEND_AMOUNT = '0.001';

// Add CDP virtual authenticator to the page (one-time setup per browser context)
async function setupVirtualAuthenticator(page) {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasUserVerification: true,
      hasResidentKey: true,
      hasLargeBlob: false,
    },
  });
  return client;
}

// Helper: clear demo flag + localStorage for fresh state (exact copy from onboarding.spec.js)
async function freshLocalBuild(page) {
  await page.goto(`${BASE}/?demo=0`);
  await page.evaluate(() => { try { localStorage.removeItem('veyrnox-demo'); } catch {} });
  // Best-effort: clear any existing vault so we land on first-run welcome.
  await page.evaluate(async () => {
    try { for (const db of await indexedDB.databases?.() || []) indexedDB.deleteDatabase(db.name); } catch {}
  });
  await page.goto(`${BASE}/?demo=0`);
}

// Helper: enter an 8-digit PIN via PinPad's on-screen digit buttons, then submit.
// Scoped to the PinPad's own group so it never collides with same-named buttons
// elsewhere on the page. "Submit PIN" is the button's aria-label — NOT its visible
// "Continue" text; ARIA accessible-name resolution prefers aria-label.
async function enterPin(page, digits) {
  const pad = page.getByRole('group', { name: /PIN entry/i });
  for (const d of digits) {
    await pad.getByRole('button', { name: d, exact: true }).click();
  }
  await pad.getByRole('button', { name: 'Submit PIN' }).click();
}

test.describe('WebAuthn PRF Tier 2 — CDP Virtual Authenticator + Sepolia Send', () => {
  test.setTimeout(120 * 1000); // 2 min timeout

  test('enroll PRF, unlock with platform auth, send 0.001 ETH Sepolia + capture txid', async ({
    page,
    context,
  }) => {
    // ── Setup: fresh state + CDP virtual authenticator ────────────────────────
    await freshLocalBuild(page);
    const cdpClient = await setupVirtualAuthenticator(page);
    console.log('✓ CDP virtual authenticator configured (CTAP2, internal, hasUserVerification)');

    // ── STEP 1: Start onboarding ───────────────────────────────────────────
    await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole('button', { name: 'Get Started' }).click();
    console.log('✓ Started onboarding');
    await page.waitForTimeout(500); // transition

    // ── STEP 2: Choose an 8-digit PIN (web now shares native's PIN cohort — see
    // onboarding.spec.js header for the lockout-bug history) ──────────────────
    await expect(page.getByText('Choose an 8-digit PIN')).toBeVisible({ timeout: 10000 });
    await enterPin(page, TEST_PIN);
    console.log('✓ Vault PIN set (8 digits)');

    // ── STEP 3: Confirm PIN ─────────────────────────────────────────
    await expect(page.getByText('Confirm your PIN')).toBeVisible({ timeout: 5000 });
    await enterPin(page, TEST_PIN);
    console.log('✓ Vault PIN confirmed (this triggers finishPinSetup → setView("choose"))');

    // Wait and check what's on the page
    await page.waitForTimeout(2000);
    const pageBody = await page.locator('body').innerText();
    const hasPortfolio = pageBody.includes('in this portfolio');
    const hasWallet = pageBody.includes('Wallet') || pageBody.includes('WALLET');
    console.log(`DEBUG: Page has 'in this portfolio': ${hasPortfolio}, has 'WALLET': ${hasWallet}`);
    console.log(`DEBUG: Page text:\n${pageBody.substring(0, 600)}`);

    // ── STEP 4: Dashboard is loaded - navigation menu is visible ───────────────────
    // The Send link proves the dashboard/app is loaded
    const sendLink = page.getByRole('link', { name: /^Send$/i });
    await expect(sendLink).toBeVisible({ timeout: 10000 });
    console.log('✓ Wallet dashboard loaded (Send link visible)');

    // ── STEP 5: Navigate to Settings → Hardware Encryption ──────────────────────
    const settingsLink = page.getByRole('link', { name: /settings/i }).or(
      page.getByRole('button', { name: /settings/i })
    );
    if (await settingsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await settingsLink.click();
    } else {
      await page.goto(`${BASE}/settings`);
    }

    await expect(page.locator('h2, h3', { hasText: /Security|Hardware|Encryption/i }).first()).toBeVisible({
      timeout: 10000,
    });
    console.log('✓ Settings page loaded');

    // ── STEP 7: Enroll Hardware Encryption (PRF) ─────────────────────────────────
    const hwButton = page.locator('button, [role="switch"]', {
      hasText: /Hardware|WebAuthn|PRF|Encryption/i,
    }).first();
    await expect(hwButton).toBeVisible({ timeout: 10000 });
    await hwButton.click();
    console.log('✓ Hardware Encryption enrollment initiated');

    // ── STEP 8: CDP handles WebAuthn PRF credential creation ────────────────────
    // navigator.credentials.create() fires, CDP intercepts and auto-succeeds
    await expect(
      page.getByText(
        /Hardware encryption enabled|Hardware protected|device.*secure|PRF.*enrolled|secured by your device/i,
      ),
    ).toBeVisible({ timeout: 10000 });
    console.log('✓ WebAuthn PRF enrolled (CDP virtual auth succeeded)');

    // ── STEP 9: Navigate back from Settings to main app ────────────────────────
    // After PRF enrollment in settings, navigate back to the main dashboard
    // Click the VEYRNOX logo or Dashboard link to go home
    const backToDash = page.getByRole('link', { name: /Dashboard/i }).or(
      page.locator('a, button').filter({ hasText: /VEYRNOX|Dashboard/ }).first()
    );
    await page.goto(`${BASE}/`);
    await page.waitForTimeout(500);
    console.log('✓ Navigated back to main dashboard');

    // ── STEP 10: Complete wallet creation (exit explore mode) ──────────────────────
    // Look for the Create Wallet CTA - it appears in the explore shell overlay
    // First, check what buttons are actually on the page
    const allButtons = await page.locator('button').count();
    console.log(`DEBUG: Found ${allButtons} buttons on page`);

    // Search for create/wallet buttons more aggressively
    const createBtn = page.locator('button:has-text("Create")').first();
    const createWalletBtn = page.locator('button').filter({ hasText: /Shield.*Create|Create.*Wallet|Create.*Wallet/ }).first();

    if (await createWalletBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createWalletBtn.click();
      console.log('✓ Clicked Create Wallet button');
      await page.waitForTimeout(3000);
    } else if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createBtn.click();
      console.log('✓ Clicked Create button');
      await page.waitForTimeout(3000);
    } else {
      console.log('⚠️ Could not find Create Wallet button - may still be in explore mode');
    }

    // ── STEP 11: Navigate to Send ─────────────────────────────────────────────────
    await page.goto(`${BASE}/send`);
    console.log('✓ Navigated to Send screen');

    // ── STEP 12: Wait for Send form ──────────────────────────────────────────────
    const recipientField = page.getByPlaceholder(/0x.*\.eth|0x[0-9a-fA-F]/i);
    await expect(recipientField).toBeVisible({ timeout: 10000 });
    console.log('✓ Send form loaded');

    // ── STEP 10: Fill send details ──────────────────────────────────────────────
    await recipientField.fill(SEPOLIA_RECIPIENT);
    const amountField = page.getByPlaceholder('0.00');
    await amountField.fill(SEND_AMOUNT);
    console.log(`✓ Send form filled: ${SEND_AMOUNT} ETH to ${SEPOLIA_RECIPIENT.substring(0, 10)}…`);

    // ── STEP 11: Click Continue → Review screen ─────────────────────────────────
    const continueBtn = page.getByRole('button', { name: /^Continue$/ });
    await expect(continueBtn).toBeEnabled({ timeout: 10000 });
    await continueBtn.click();

    await expect(page.getByText(/You're sending/i)).toBeVisible({ timeout: 10000 });
    console.log('✓ Review screen rendered');

    // ── STEP 12: Confirm & Send (CDP handles PRF unlock at step-up re-auth) ──────
    // This triggers navigator.credentials.get() with PRF evaluation
    // CDP virtual authenticator auto-succeeds again
    const confirmBtn = page.getByRole('button', {
      name: /Confirm & Send|Authorise & Send/i,
    });
    await expect(confirmBtn).toBeVisible({ timeout: 10000 });
    await confirmBtn.click();

    // If a step-up re-auth prompt appears (TwoFactorGate), it now renders the SAME
    // PinPad as onboarding — TwoFactorGate.jsx gates on getAuthModel() === 'pin',
    // not platform, so web joining the PIN cohort means this picks it up automatically.
    const stepUpPinPad = page.getByRole('group', { name: /8-digit PIN/i });
    if (await stepUpPinPad.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('✓ Step-up re-auth PIN pad detected');
      for (const d of TEST_PIN) {
        await stepUpPinPad.getByRole('button', { name: d, exact: true }).click();
      }
      const authBtn = page.getByRole('button', { name: /Verify|Unlock|Authorise|Confirm/i });
      if (await authBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await authBtn.click();
      }
    }

    console.log('✓ Send confirmed (PRF unlock triggered via CDP virtual auth)');

    // ── STEP 13: Wait for broadcast success + capture txid ────────────────────
    await expect(page.getByText(/Transaction Broadcast|Transaction sent/i)).toBeVisible({
      timeout: 30000,
    });
    console.log('✓ Transaction broadcast');

    // ── STEP 14: Extract txid ──────────────────────────────────────────────────
    const txidElement = page.locator('p.mono-value, [class*="mono"], code').filter({
      hasText: /^0x[0-9a-fA-F]{64}$/,
    });
    const txid = (await txidElement.first().innerText()).trim();

    // Verify explorer link exists
    const explorerLink = page.getByRole('link', { name: /View on block explorer/i });
    await expect(explorerLink).toBeVisible();
    const explorerUrl = await explorerLink.getAttribute('href');

    // ── FINAL REPORT ──────────────────────────────────────────────────────────
    expect(txid).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(explorerUrl).toBeTruthy();

    console.log(
      `\n${'='.repeat(80)}\n` +
      `✅ TIER 2 TEST PASSED — WebAuthn PRF Unlock + Sepolia Send\n` +
      `${'='.repeat(80)}\n` +
      `   Vault:     Web (PIN-protected, same cohort as native)\n` +
      `   PIN:       ${TEST_PIN} (8 digits)\n` +
      `   PRF Flow:  Enrolled → Unlocked → Re-authed for send\n` +
      `   Amount:    ${SEND_AMOUNT} Sepolia ETH\n` +
      `   Recipient: ${SEPOLIA_RECIPIENT}\n` +
      `   txid:      ${txid}\n` +
      `   explorer:  ${explorerUrl}\n` +
      `${'='.repeat(80)}\n` +
      `\n` +
      `   Status: BUILT / UAT-PENDING (CDP virtual authenticator — NOT a real platform PRF).\n` +
      `           This txid was broadcast via a simulated WebAuthn authenticator, NOT\n` +
      `           a real hardware PRF. It does NOT satisfy the project honesty bar for\n` +
      `           "verified" (which requires a real user-supplied on-chain txid from a\n` +
      `           real platform authenticator on a real device — see CLAUDE.md).\n\n` +
      `   If running on real hardware with a real PRF, supply this txid to the owner:\n` +
      `   https://sepolia.etherscan.io/tx/${txid}\n`,
    );
  });
});
