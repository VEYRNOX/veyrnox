// ─────────────────────────────────────────────────────────────────────────────
// Duress PIN / decoy-wallet routing — fully automated, no human interaction.
//
// Automates what docs/Feature-Status.md §6 calls "not device-verified" for the
// app-layer routing (as distinct from the Secure Enclave / StrongBox hardware
// claim, which genuinely cannot be automated — see the iOS-F9/H-2/iOS-F11
// entries). This proves the ROUTING LOGIC only:
//   - real password  -> real wallet
//   - Emergency PIN  -> hidden/decoy wallet (a DIFFERENT address)
//   - wrong password -> explicit "Incorrect PIN"-class error, no silent decoy
//
// CORRECTION (found while making this runnable): the plan was to import the
// documented throwaway BIP-39 UAT seed (VITE_TEST_THROWAWAY_SEED from .env.test)
// via the normal onboarding flow, THEN flip on demo mode to reach DuressPin's
// built-in "Live demonstration" panel. That combination is impossible:
// `?demo=1` does not layer on top of a real vault — it replaces onboarding
// entirely with a pre-seeded demo dashboard (confirmed by running this test:
// visiting `/?demo=1` on a fresh browser lands directly on a canned
// "$25,454.68 / 2.4831 ETH" dashboard, never the "Get Started" screen).
//
// So this test uses DuressPin.jsx's own DEMO-gated "Live demonstration" panel
// as designed: it calls the REAL wallet-core `createWallet()` under the hood
// (not the fake demo API layer) with a FRESH throwaway mnemonic each run —
// the same class of throwaway, disposable, no-real-value wallet as the
// documented UAT seed, using the exact harness the app's own authors built
// for this purpose (DuressPin.jsx: "Exercises the REAL unlock flow"). It does
// not literally use the documented VITE_TEST_THROWAWAY_SEED phrase — that phrase
// cannot survive contact with demo mode's onboarding bypass.
//
// Honest scope: this is app-layer routing proof (real crypto, real vault code,
// real IndexedDB), NOT a hardware-KEK / Secure Enclave verification, and it
// never asserts "verified" in the strict on-chain-txid sense (CLAUDE.md).
//
// Run:
//   npx playwright test e2e/duress-decoy-routing.spec.js
// ─────────────────────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

async function freshDemoState(page) {
  await page.goto(`${BASE}/duress-pin?demo=1`);
  await page.evaluate(() => {
    try { localStorage.clear(); indexedDB.deleteDatabase('veyrnox'); } catch { /* best-effort */ }
  });
  await page.goto(`${BASE}/duress-pin?demo=1`);
}

test.describe('Duress PIN / decoy-wallet routing (throwaway real vault, app-layer, no human)', () => {
  test.setTimeout(60 * 1000);

  test('real password opens the real wallet; Emergency PIN opens a different decoy wallet', async ({ page }) => {
    await freshDemoState(page);
    await expect(page.getByText('Live demonstration (demo mode)')).toBeVisible({ timeout: 15000 });

    // demoSetup(): creates a fresh REAL vault (real Argon2id+AES-GCM, real
    // IndexedDB) if none exists, sets the Emergency PIN / decoy vault on top of
    // it, seeds a demo decoy balance, then locks. All real wallet-core code.
    await page.getByRole('button', { name: /Set up real \+ funded hidden wallet/i }).click();
    await expect(page.getByText(/Locked\. Unlock above/i)).toBeVisible({ timeout: 15000 });
    console.log('✓ Real vault + Emergency PIN / decoy vault created; locked');

    // ── Real password -> REAL WALLET ─────────────────────────────────────────
    await page.getByRole('button', { name: /Unlock with REAL PIN/i }).click();
    await expect(page.getByText('REAL WALLET', { exact: true })).toBeVisible({ timeout: 10000 });
    const realAddrText = await page.locator('p.font-mono.text-xs', { hasText: 'Address:' }).innerText();
    console.log(`✓ Real password opened REAL WALLET (${realAddrText})`);

    await page.getByRole('button', { name: /^Lock$/ }).click();
    await expect(page.getByText(/Locked\. Unlock above/i)).toBeVisible({ timeout: 10000 });

    // ── Emergency PIN -> HIDDEN (decoy) WALLET, a DIFFERENT address ──────────
    await page.getByRole('button', { name: /Unlock with EMERGENCY PIN/i }).click();
    await expect(page.getByText('HIDDEN WALLET', { exact: true })).toBeVisible({ timeout: 10000 });
    const decoyAddrText = await page.locator('p.font-mono.text-xs', { hasText: 'Address:' }).innerText();
    console.log(`✓ Emergency PIN opened HIDDEN WALLET (${decoyAddrText})`);

    expect(decoyAddrText).not.toEqual(realAddrText);

    // The demo oracle panel proves the decoy session never surfaces the real address.
    const oracleLine = page.getByText(/demo oracle — real wallet address:/i);
    await expect(oracleLine).toBeVisible();
    await expect(oracleLine).toContainText('✓ hidden in this hidden wallet session');
    console.log('✓ Decoy session confirmed NOT to expose the real address');

    // ── Wrong password -> explicit error, never a silent third decoy ─────────
    await page.getByRole('button', { name: /^Lock$/ }).click();
    await page.locator('#duress-try-pw').fill('totally-wrong-password-guess');
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page.getByText(/wrong PINs show an error/i)).toBeVisible({ timeout: 10000 });
    console.log('✓ Wrong password surfaced an explicit error (v2 no-silent-decoy model)');
  });
});
