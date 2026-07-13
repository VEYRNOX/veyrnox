// ─────────────────────────────────────────────────────────────────────────────
// Vault/settings desync screen — stale native vault on cold mount (I4).
//
// On native, the OS secure store (iOS Keychain / Android Keystore-backed
// SecureStorage) survives an app delete/reinstall, so a cold mount can find a
// stale vault with NO 'veyrnox-auth-model' marker. The OLD behaviour silently
// clearVault()'d that vault on mount — destroying recoverable key material with
// no user sign-off (an I4 violation). WalletEntry now routes to an explicit
// desync CHOICE screen: Restore from recovery phrase, or a typed-"WIPE"
// confirmation. clearVault() is NEVER called silently, and a completed wipe
// raises the loud "This device was wiped" notice (fail honest).
//
// HARNESS NOTE — how the native-only screen is reached in a browser:
//   The desync guard is `Capacitor.isNativePlatform() && vault && !authModel`.
//   We force native by setting `window.CapacitorCustomPlatform = { name: … }`
//   BEFORE any page script (addInitScript). @capacitor/core's own
//   `isNativePlatform()` then returns true (getPlatform() !== 'web'). Because the
//   custom name is NOT one of {web,ios,android}, the @aparajita SecureStorage
//   plugin falls back to its WEB implementation, which is backed by localStorage
//   under the keystore's `veyrnox_` prefix. So the stale vault is seeded by
//   writing a non-null JSON blob to localStorage key `veyrnox_vault_v1` (this is
//   what the native keystore facade's hasVault() reads — NOT IndexedDB, which
//   only backs the WEB keystore that this forced-native run does not use). The
//   demo banner renders (dev server: DEV && native ⇒ demo), but demo does NOT
//   bypass the WalletEntry desync gate — the desync screen renders regardless.
//
// Fully offline: no real vault, no relay, no on-chain tx. Runs in the standard
// suite (no RUN_SUPERVISED_E2E gate).
//
// Run:  npx playwright test e2e/vault-desync-screen.spec.js
// ─────────────────────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
// The keystore facade's native SecureStorage key (KEY_PREFIX 'veyrnox_' + 'vault_v1').
const VAULT_LS_KEY = 'veyrnox_vault_v1';

async function seedStaleVault(page) {
  // Force native BEFORE any page JS so @capacitor/core resolves isNativePlatform()===true
  // and the SecureStorage plugin uses its localStorage web-fallback.
  await page.addInitScript(() => {
    window.CapacitorCustomPlatform = { name: 'veyrnox-e2e-native' };
  });
  await page.goto(BASE);
  // Seed a stale vault the native keystore facade will see, and clear the auth-model
  // marker + demo persistence, then reload so WalletEntry's cold-mount effect fires
  // with the desync condition met.
  await page.evaluate((k) => {
    localStorage.setItem(k, JSON.stringify({ ct: 'x', iv: 'y', salt: 'z' }));
    localStorage.removeItem('veyrnox-auth-model');
    localStorage.removeItem('veyrnox-demo');
  }, VAULT_LS_KEY);
  await page.reload();
}

test.describe('Vault desync screen — stale native vault on cold mount', () => {
  test.setTimeout(30 * 1000);

  test('renders the desync screen (not silent clearVault, not normal unlock)', async ({ page }) => {
    await seedStaleVault(page);

    // The honest desync choice screen — NOT a silent wipe, NOT the unlock/PIN pad.
    await expect(page.getByRole('heading', { name: /wallet found, settings missing/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /restore from recovery phrase/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /wipe and start fresh/i })).toBeVisible();

    // The stale vault must still be present: no silent destruction on mount (I4).
    const vault = await page.evaluate((k) => localStorage.getItem(k), VAULT_LS_KEY);
    expect(vault).not.toBeNull();
  });

  test('Restore from seed routes to seed-recovery view (no wipe)', async ({ page }) => {
    await seedStaleVault(page);
    await page.getByRole('button', { name: /restore from recovery phrase/i }).click();

    // Seed-recovery step renders (a textarea for the phrase); vault untouched.
    await expect(page.getByText(/restore from your seed phrase/i)).toBeVisible();
    await expect(page.getByRole('textbox', { name: /recovery seed phrase/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /wipe and start fresh/i })).toHaveCount(0);

    const vault = await page.evaluate((k) => localStorage.getItem(k), VAULT_LS_KEY);
    expect(vault).not.toBeNull();
  });

  test('Wipe requires typing WIPE — confirm button disabled until confirmed', async ({ page }) => {
    await seedStaleVault(page);
    await page.getByRole('button', { name: /wipe and start fresh/i }).click();

    // Destructive button exists but is disabled until "WIPE" is typed, and the
    // vault is NOT yet cleared.
    const confirmBtn = page.getByRole('button', { name: /permanently wipe/i });
    await expect(confirmBtn).toBeVisible();
    await expect(confirmBtn).toBeDisabled();
    expect(await page.evaluate((k) => localStorage.getItem(k), VAULT_LS_KEY)).not.toBeNull();

    // Wrong text keeps it disabled.
    await page.getByLabel(/type wipe to confirm/i).fill('nope');
    await expect(confirmBtn).toBeDisabled();
  });

  test('Wipe button enabled and triggers wipe when WIPE is typed', async ({ page }) => {
    await seedStaleVault(page);
    await page.getByRole('button', { name: /wipe and start fresh/i }).click();

    await page.getByLabel(/type wipe to confirm/i).fill('WIPE');
    const confirmBtn = page.getByRole('button', { name: /permanently wipe/i });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // I4 (fail honest): a completed wipe raises the loud "device was wiped" notice…
    await expect(page.getByRole('heading', { name: /this device was wiped/i })).toBeVisible();
    // …the desync screen is gone…
    await expect(page.getByRole('heading', { name: /wallet found, settings missing/i })).toHaveCount(0);
    // …the stale vault really was cleared…
    await expect.poll(async () => page.evaluate((k) => localStorage.getItem(k), VAULT_LS_KEY)).toBeNull();
    // …and the auth-model marker is still absent (nothing forged).
    expect(await page.evaluate(() => localStorage.getItem('veyrnox-auth-model'))).toBeNull();

    // "Start a new wallet" advances to PIN-create onboarding.
    await page.getByRole('button', { name: /start a new wallet/i }).click();
    await expect(page.getByText(/choose an 8-digit pin/i)).toBeVisible();
  });
});
