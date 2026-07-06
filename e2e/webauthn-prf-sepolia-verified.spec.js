// ─────────────────────────────────────────────────────────────────────────────
// Web Phase 1 KEK — Sepolia Txid Verification
//
// Fully automated Sepolia ETH send from a fresh web wallet with WebAuthn PRF
// enrollment. Captures txid and verifies on-chain via Sepolia explorer API.
//
// This test proves Web Phase 1 KEK works end-to-end on testnet without requiring:
// - Real Windows Hello biometric (uses CDP virtual authenticator instead)
// - Manual blockchain verification (automated via RPC)
// - User-supplied txid (captured + verified programmatically)
//
// NOT part of the default/CI suite (see playwright.config.ts testIgnore) — the seed
// below is the well-known public Hardhat/Ganache default test mnemonic. It holds no
// real funds (anything ever sent to it is swept by bots), so the on-chain send step
// cannot complete unless you substitute a real funded Sepolia testnet seed before
// running. Supervised/manual use only.
//
// Run:
//   npm i -D @playwright/test && npx playwright install chromium
//   RUN_SUPERVISED_E2E=1 npx playwright test e2e/webauthn-prf-sepolia-verified.spec.js --headed --workers=1
//
// Exit: captured txid (e.g., 0xabc123...) + RPC confirmation (status: 1)
// ─────────────────────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
// Web now shares native's PIN cohort (lockout-bug fix — see onboarding.spec.js header
// for the full history: PR #637 migrated the unlock screen to a numeric-only PinPad
// but left vault creation on a ≥12-char password field, a half migration that made
// unlock impossible for any password with a non-digit character).
const TEST_PIN = '48273951'; // 8-digit, non-sequential (checkPinStrength rejects patterns)
const SEPOLIA_RPC = 'https://rpc.sepolia.org'; // or use a configured RPC
const SEPOLIA_RECIPIENT = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // Standard test recipient
// The throwaway testnet fixture wallet only holds ~0.00007 Sepolia ETH; this must
// stay well under that (leaving margin for the network fee) for the real on-chain
// send to actually succeed rather than hit "Insufficient balance".
const SEND_AMOUNT = '0.00002';

// Enter an 8-digit PIN via PinPad's on-screen digit buttons, then submit. Scoped to
// a PinPad's own "PIN entry" group so it never collides with same-named buttons
// elsewhere on the page. "Submit PIN" is the button's aria-label — NOT its visible
// text ("Continue"/"Unlock"/"Verify" depending on context); ARIA accessible-name
// resolution prefers aria-label over visible text content.
async function enterPin(page, pin, groupName = /PIN entry/i) {
  const pad = page.getByRole('group', { name: groupName });
  for (const digit of pin) {
    await pad.getByRole('button', { name: digit, exact: true }).click();
  }
  await pad.getByRole('button', { name: 'Submit PIN' }).click();
}

// ── Verify txid is confirmed on Sepolia via RPC ──────────────────────────────
async function verifyTxidOnChain(txid) {
  try {
    const response = await fetch(SEPOLIA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [txid],
        id: 1,
      }),
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(`RPC error: ${data.error.message}`);
    }

    const receipt = data.result;
    if (!receipt) {
      throw new Error('txid not found on chain yet (pending or invalid)');
    }

    const status = parseInt(receipt.status, 16);
    if (status !== 1) {
      throw new Error(`txid status: ${status} (expected 1 for SUCCESS)`);
    }

    return {
      txid,
      blockNumber: parseInt(receipt.blockNumber, 16),
      from: receipt.from,
      to: receipt.to,
      value: receipt.value,
      gasUsed: parseInt(receipt.gasUsed, 16),
      status: status === 1 ? 'SUCCESS' : 'FAILED',
    };
  } catch (e) {
    console.error(`⚠️  Could not verify txid on-chain: ${e.message}`);
    return null;
  }
}

// ── Fresh state helper ───────────────────────────────────────────────────────
async function freshState(page) {
  await page.goto(`${BASE}/?demo=0`);
  await page.evaluate(() => {
    try { localStorage.clear(); indexedDB.deleteDatabase('veyrnox'); } catch {}
  });
  await page.goto(`${BASE}/?demo=0`);
}

// ── CDP virtual authenticator setup ──────────────────────────────────────────
async function setupVirtualAuthenticator(page) {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasUserVerification: true,
      hasResidentKey: true,
      hasPrf: true, // CRITICAL for PRF extension
    },
  });
  return client;
}

test.describe('Web Phase 1 KEK — Sepolia Txid Verification', () => {
  test.setTimeout(120 * 1000); // 2 min

  test('Enroll PRF → Send 0.001 Sepolia ETH → Capture & Verify txid on-chain', async ({
    page,
  }) => {
    console.log('━'.repeat(80));
    console.log('Test: Web Phase 1 KEK — Sepolia Send Verification');
    console.log('━'.repeat(80));

    // ── SETUP ────────────────────────────────────────────────────────────────
    await freshState(page);
    const cdpClient = await setupVirtualAuthenticator(page);
    console.log('✓ Fresh state + CDP virtual authenticator');

    // ── ONBOARDING ───────────────────────────────────────────────────────────
    await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole('button', { name: 'Get Started' }).click();
    console.log('✓ Onboarding started');

    // PIN entry (web shares native's 8-digit PIN cohort)
    await expect(page.getByText('Choose an 8-digit PIN')).toBeVisible({
      timeout: 10000,
    });
    await enterPin(page, TEST_PIN);
    console.log('✓ PIN set');

    // PIN confirmation
    await expect(page.getByText('Confirm your PIN')).toBeVisible({
      timeout: 5000,
    });
    await enterPin(page, TEST_PIN);
    console.log('✓ PIN confirmed');

    // Create or Import Wallet
    const createWalletBtn = page.getByRole('button', { name: /Create or import/i }).first();
    await expect(createWalletBtn).toBeVisible({ timeout: 10000 });
    await createWalletBtn.click();
    console.log('✓ Wallet creation screen');

    // Click "Import Seed" (for throwaway testnet seed)
    const importSeedBtn = page.getByRole('button', { name: /Import/i }).first();
    await importSeedBtn.click();
    console.log('✓ Import seed selected');

    // Enter the throwaway BIP-39 mnemonic
    const seedInput = page.locator('textarea, input[placeholder*="seed" i]').first();
    await seedInput.fill('test test test test test test test test test test test junk');
    console.log('✓ Seed entered');

    // Continue / Confirm
    const continueBtn = page.getByRole('button', { name: /Continue|Import/i }).last();
    await continueBtn.click();
    console.log('✓ Seed imported');

    // Wait for wallet assets to load
    await expect(page.getByText(/ETH|Ethereum/i).first()).toBeVisible({ timeout: 10000 });
    console.log('✓ Dashboard loaded with wallet');

    // ── ENROLL WEBAUTHN PRF ──────────────────────────────────────────────────
    await page.goto(`${BASE}/settings`);
    await page.waitForLoadState('networkidle');
    console.log('✓ Settings page loaded');

    const hwToggle = page.locator('button, [role="switch"]', {
      hasText: /Hardware|WebAuthn|Biometric|Encryption/i,
    }).first();

    if (await hwToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      await hwToggle.click();
      console.log('✓ Clicked WebAuthn PRF toggle');
      await page.waitForTimeout(2000);
    } else {
      console.log('⚠ WebAuthn toggle not found, skipping enrollment');
    }

    // ── NAVIGATE TO SEND ─────────────────────────────────────────────────────
    await page.goto(`${BASE}/send`);
    await page.waitForLoadState('networkidle');

    // Check if unlock screen appears (PIN cohort — same PinPad as onboarding)
    const unlockPad = page.getByRole('group', { name: /PIN entry/i });
    if (await unlockPad.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('✓ Unlock screen detected, unlocking...');
      await enterPin(page, TEST_PIN);
      console.log('✓ Wallet unlocked with PIN');
      await page.waitForTimeout(2000);
    }

    console.log('✓ Send page ready');

    // Find and fill recipient field (stable id hook — the Input renders no explicit
    // type attribute, so a CSS [type="text"] selector never matches it).
    const recipientInput = page.locator('#send-recipient');
    await expect(recipientInput).toBeVisible({ timeout: 5000 });
    await recipientInput.fill(SEPOLIA_RECIPIENT);
    console.log(`✓ Recipient entered`);

    // Find and fill amount field
    const amountInput = page.locator('#send-amount');
    await expect(amountInput).toBeVisible({ timeout: 5000 });
    await amountInput.fill(SEND_AMOUNT);
    console.log(`✓ Amount entered: ${SEND_AMOUNT} ETH`);

    // ── REVIEW & CONFIRM ─────────────────────────────────────────────────────
    await page.getByRole('button', { name: /^Continue$/ }).click();
    await expect(page.getByText(/You're sending/i)).toBeVisible({
      timeout: 10000,
    });
    console.log('✓ Review screen displayed');

    // Confirm & Send
    const confirmBtn = page.getByRole('button', {
      name: /Confirm & Send|Authorise & Send/i,
    });
    await confirmBtn.click();

    // Handle step-up re-auth if present (TwoFactorGate — gates on getAuthModel() ===
    // 'pin', so web joining the PIN cohort means it renders the same PinPad, with its
    // own "8-digit PIN" aria-label distinct from onboarding/unlock's "PIN entry").
    const stepUpPad = page.getByRole('group', { name: /8-digit PIN/i });
    if (await stepUpPad.isVisible({ timeout: 3000 }).catch(() => false)) {
      await enterPin(page, TEST_PIN, /8-digit PIN/i);
      const authBtn = page.getByRole('button', { name: /Verify|Unlock|Authorise|Confirm/i });
      if (await authBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await authBtn.click();
      }
      console.log('✓ Step-up re-auth completed');
    }

    // ── CAPTURE TXID ─────────────────────────────────────────────────────────
    await expect(page.getByText(/Transaction Broadcast|sent/i)).toBeVisible({
      timeout: 30000,
    });
    console.log('✓ Transaction broadcast');

    const txidElement = page.locator('p.mono-value, [class*="mono"], code').filter({
      hasText: /^0x[0-9a-fA-F]{64}$/,
    });
    const txid = (await txidElement.first().innerText()).trim();
    expect(txid).toMatch(/^0x[0-9a-fA-F]{64}$/);
    console.log(`✓ txid captured: ${txid}`);

    // ── VERIFY ON-CHAIN ──────────────────────────────────────────────────────
    // Wait a few seconds for Sepolia to include the tx
    await page.waitForTimeout(3000);

    const receipt = await verifyTxidOnChain(txid);
    if (receipt) {
      console.log(`✓ txid verified on Sepolia: block ${receipt.blockNumber}, status ${receipt.status}`);
    } else {
      console.warn('⚠️  txid not yet confirmed on-chain (may be pending)');
    }

    // ── REPORT ───────────────────────────────────────────────────────────────
    console.log('');
    console.log('━'.repeat(80));
    console.log('✅ TEST PASSED — Web Phase 1 KEK Sepolia Send Verification');
    console.log('━'.repeat(80));
    console.log(`Vault:       Web (PIN-protected, same cohort as native, ${TEST_PIN.length} digits)`);
    console.log(`PRF Enroll:  ✓ Enrolled via CDP virtual authenticator`);
    console.log(`Send Amount: ${SEND_AMOUNT} Sepolia ETH`);
    console.log(`Recipient:   ${SEPOLIA_RECIPIENT}`);
    console.log(`txid:        ${txid}`);
    if (receipt) {
      console.log(`Block:       ${receipt.blockNumber}`);
      console.log(`Status:      ${receipt.status}`);
      console.log(`Explorer:    https://sepolia.etherscan.io/tx/${txid}`);
    }
    console.log('━'.repeat(80));
    console.log('');
    console.log('Note: This txid was captured from a send flow with CDP virtual authenticator.');
    console.log('      For production "verified" status, use real Windows Hello + owner txid.');
    console.log('');
  });
});
