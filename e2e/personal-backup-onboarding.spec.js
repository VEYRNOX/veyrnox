// Personal Backup — headless onboarding UI drive with owner-supplied fixtures.
//
// Companion to src/wallet-core/__tests__/personalBackup.e2e.test.js (crypto
// round-trip). This one drives the REAL React UI in a real browser via
// Playwright:
//   1. Fresh open → EntryTiles picker
//   2. Click "New wallet" → PinPad → 30081977 → confirm 30081977
//   3. Wait for authed shell (Send nav link)
//   4. Reload → PinPad returns → 30081977 unlocks → authed shell again
//
// Uses PIN 30081977 (8 digits, passes checkPinStrength — verified via node).
//
// Does NOT drive PersonalBackup.jsx itself (route gated on
// VITE_ENABLE_PERSONAL_BACKUP_SHARDS=1; separate spec when the dev server is
// built with that flag). This spec proves the ONBOARDING leg — the "Start from
// the 1st time onboarding PIN 30081977" that the shard round-trip presumes.

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const PIN = '30081977'; // owner-supplied, DDMMYYYY-shaped, passes checkPinStrength

async function freshLocalBuild(page) {
  await page.goto(`${BASE}/?demo=0`);
  await page.evaluate(() => {
    try {
      localStorage.clear();
      localStorage.setItem('veyrnox-telemetry-consent', 'granted');
    } catch {}
  });
  await page.evaluate(async () => {
    try {
      for (const db of (await indexedDB.databases?.()) || []) {
        indexedDB.deleteDatabase(db.name);
      }
    } catch {}
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

test.describe('Personal Backup — onboarding with owner PIN 30081977', () => {
  test('New wallet → PIN 30081977 → confirm → authed shell; reload → same PIN unlocks', async ({
    page,
  }) => {
    await freshLocalBuild(page);

    await expect(page.getByRole('button', { name: /new wallet/i })).toBeVisible();
    await page.getByRole('button', { name: /new wallet/i }).click();

    await expect(page.getByText('Choose an 8-digit PIN')).toBeVisible();
    await enterPin(page, PIN);

    await expect(page.getByText('Confirm your PIN')).toBeVisible();
    await enterPin(page, PIN);

    // Slice C FirstReceiveCard may appear ("You're set") before the authed
    // shell. Race both locators — same pattern as onboarding.spec.js.
    const dismiss = page.getByRole('button', { name: "You're set" });
    const sendLink = page.getByRole('link', { name: 'Send', exact: true });
    await expect(dismiss.or(sendLink)).toBeVisible({ timeout: 30000 });
    if (await dismiss.isVisible()) await dismiss.click();
    await expect(sendLink).toBeVisible({ timeout: 30000 });

    // Reload proves the vault persisted and the SAME PIN unlocks it.
    await page.reload();
    await expect(page.getByRole('group', { name: /PIN entry/i })).toBeVisible();
    await enterPin(page, PIN);
    await expect(sendLink).toBeVisible({ timeout: 30000 });
  });
});
