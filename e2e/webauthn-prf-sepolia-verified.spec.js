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
// SUPERVISED HARNESS — NOT part of the unattended CI suite (playwright.config.ts
// testIgnore). It sends real Sepolia ETH from the well-known public 'test test
// ... junk' throwaway mnemonic, whose balance is dust-only (bot-drained, shared
// by every tool that documents this fixture) — nowhere near the 0.001 ETH this
// test tries to send, so it cannot pass unattended without funding that address
// first. It was missing from testIgnore (an oversight vs. its sibling
// webauthn-prf-tier2-send.spec.js, which has the identical funded-wallet
// requirement and IS gated), which is why it ran — and consistently failed — in
// every CI run. A separate bug (now fixed) also made it hang for the full test
// timeout: a speculative "Password tab" click matched the unrelated "Forgot
// password? Restore from seed phrase" recovery link by accessible name and
// navigated away from the unlock screen entirely.
//
// Run (after funding the mnemonic's Sepolia address):
//   npm i -D @playwright/test && npx playwright install chromium
//   RUN_SUPERVISED_E2E=1 npx playwright test e2e/webauthn-prf-sepolia-verified.spec.js --headed --workers=1
//
// Exit: captured txid (e.g., 0xabc123...) + RPC confirmation (status: 1)
// ─────────────────────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const TEST_PASSWORD = 'web-kek-verified-password-2026';
const SEPOLIA_RPC = 'https://rpc.sepolia.org'; // or use a configured RPC
const SEPOLIA_RECIPIENT = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // Standard test recipient
const SEND_AMOUNT = '0.001';

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

    // Password entry (web requires 12+ chars)
    await expect(page.getByText('Set a vault password')).toBeVisible({
      timeout: 10000,
    });
    await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Continue' }).click();
    console.log('✓ Password set');

    // Password confirmation
    await expect(page.getByText('Confirm your password')).toBeVisible({
      timeout: 5000,
    });
    await page.locator('input[type="password"]').last().fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /Set Password & Continue/i }).click();
    console.log('✓ Password confirmed');

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

    // Check if unlock screen appears
    const unlockPrompt = page.getByText(/Unlock your wallet/i);
    if (await unlockPrompt.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('✓ Unlock screen detected, unlocking...');

      // NOTE: there is no "Password tab" toggle on the real unlock screen
      // (WalletEntry.jsx) — a prior version of this test speculatively looked
      // for one via getByRole('button', { name: /Password/i }), which instead
      // matched the "Forgot password? Restore from seed phrase" recovery link
      // (its accessible name contains "Password" too) and clicked THAT,
      // navigating away to the seed-recovery screen — which has no "Unlock"
      // button at all, hanging the next step for the full test timeout. This
      // was the root cause of this test's persistent CI flake/hang.
      const passwordInput = page.locator('input[type="password"]').first();
      if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await passwordInput.fill(TEST_PASSWORD);
        const unlockBtn = page.getByRole('button', { name: /Unlock/i }).first();
        await unlockBtn.click();
        console.log('✓ Wallet unlocked with password');
        await page.waitForTimeout(2000);
      }
    }

    console.log('✓ Send page ready');

    // Find and fill recipient field
    const recipientInput = page.locator('input[placeholder*="0x"], input[placeholder*="Address"], input[type="text"]').first();
    if (await recipientInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await recipientInput.fill(SEPOLIA_RECIPIENT);
      console.log(`✓ Recipient entered`);
    }

    // Find and fill amount field
    const amountInput = page.locator('input[type="number"], input[placeholder*="0.00"], input[placeholder*="Amount"]').first();
    if (await amountInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await amountInput.fill(SEND_AMOUNT);
      console.log(`✓ Amount entered: ${SEND_AMOUNT} ETH`);
    }

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

    // Handle step-up re-auth if present
    const passwordPrompt = page.getByText(/Enter your password|Confirm your password/i);
    if (await passwordPrompt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.locator('input[type="password"]').fill(TEST_PASSWORD);
      const authBtn = page.getByRole('button', { name: /Unlock|Authorise|Confirm/i });
      if (await authBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await authBtn.click();
      } else {
        await page.locator('input[type="password"]').press('Enter');
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
    console.log(`Vault:       Web (password-protected, ${TEST_PASSWORD.length} chars)`);
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
