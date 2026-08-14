// Personal Backup — full UI round-trip, headless.
//
// Drives the REAL PersonalBackup.jsx page (route /personal-backup) end-to-end:
//   1. Onboard fresh with PIN 30081977
//   2. Nav to /personal-backup → Recovery shares tab (only rendered when
//      VITE_ENABLE_PERSONAL_BACKUP_SHARDS=1)
//   3. Enter wallet PIN + toggle "Encrypt one share with a passphrase" +
//      recovery passphrase S0cR4Te530081977!
//   4. Click "Split & save 3 shares" — Playwright captures 3 real browser
//      downloads to $TMPDIR (files 1, 3 raw; file 2 wrapped JSON envelope)
//   5. Flip to Restore mode → feed 2 of 3 files via filechooser event →
//      recovery passphrase → new PIN 30081977 twice → "Restore wallet"
//   6. Assert success toast + re-unlock at / with 30081977
//
// Requires: dev server started with VITE_ENABLE_PERSONAL_BACKUP_SHARDS=1
// and BASE_URL pointed at it (Playwright config skips its own webServer when
// BASE_URL is set). Run with:
//   VITE_ENABLE_PERSONAL_BACKUP_SHARDS=1 npm run dev -- --port 5199 --strictPort &
//   BASE_URL=http://localhost:5199 npx playwright test e2e/personal-backup-ui-roundtrip.spec.js --project=chromium

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = process.env.BASE_URL || 'http://localhost:5199';
const PIN = '30081977';
const PASSPHRASE = 'S0cR4Te530081977!'; // 17 chars, ≥16 required

async function freshLocalBuild(page) {
  await page.goto(`${BASE}/?demo=0`);
  await page.evaluate(() => {
    try {
      localStorage.clear();
      localStorage.setItem('veyrnox-telemetry-consent', 'granted');
      // Pre-mark tour as seen so the modal never opens and blocks clicks.
      localStorage.setItem('veyrnox-first-run-tour-seen', '1');
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

async function onboard(page) {
  await freshLocalBuild(page);
  await page.getByRole('button', { name: /new wallet/i }).click();
  await expect(page.getByText('Choose an 8-digit PIN')).toBeVisible();
  await enterPin(page, PIN);
  await expect(page.getByText('Confirm your PIN')).toBeVisible();
  await enterPin(page, PIN);

  const dismiss = page
    .getByRole('button', { name: /skip for now/i })
    .or(page.getByRole('button', { name: "You're set" }));
  const sendLink = page.getByRole('link', { name: 'Send', exact: true });
  await expect(dismiss.or(sendLink)).toBeVisible({ timeout: 30000 });
  if (await dismiss.isVisible()) await dismiss.click();
  await expect(sendLink).toBeVisible({ timeout: 30000 });
}

test.describe('Personal Backup — UI round-trip with PIN 30081977', () => {
  test.setTimeout(180_000);

  test('export 3 shares → restore from 2 → new PIN unlocks', async ({ page }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veyrnox-ui-e2e-'));
    const downloaded = [];
    // Surface app-side errors so a failed split doesn't just look like 0 downloads.
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[browser error]', msg.text());
    });
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));

    // Capture every browser download for the whole test.
    page.on('download', async (dl) => {
      const dest = path.join(tmpDir, dl.suggestedFilename());
      await dl.saveAs(dest);
      downloaded.push(dest);
    });

    await onboard(page);

    // Dismiss the FirstRunTour modal if it opened — it's modal + blocks clicks.
    const tourSkip = page.getByRole('button', { name: /^Skip$/ });
    if (await tourSkip.isVisible().catch(() => false)) {
      await tourSkip.click();
    }

    // Programmatically enroll KEK with a deterministic hardware-factor stub.
    // On real web this is a WebAuthn PRF ceremony; headless Chromium has no
    // authenticator, so we stub H directly. The KEK crypto (Argon2id + wrap)
    // is real — this is the same technique the vitest suite uses. The stub
    // also overrides webKeyStore.getHardwareFactor so subsequent UI calls
    // (which take the bound reference at call time) see it too.
    await page.evaluate(async (pin) => {
      const mod = await import('/src/wallet-core/keystore/web.js');
      const HF = () => Promise.resolve(new Uint8Array(32).fill(7));
      mod.webKeyStore.getHardwareFactor = HF;
      await mod.webKeyStore.enrollKek(pin, { getHardwareFactor: HF });
    }, PIN);

    // ── Export leg ──────────────────────────────────────────────────────
    // Navigate via SPA (React Router). Full page load wipes in-memory unlock;
    // clicking the topbar gear is fragile at viewport edges. dispatchEvent a
    // click on the <a> — same handler React Router registers, no scroll dance.
    await page.evaluate(() => {
      const a = document.querySelector('a[href="/settings"]');
      if (a) a.click();
    });
    await page.getByRole('link', { name: /Encrypted Personal Backup/i }).click();
    await expect(
      page.getByRole('heading', { name: /Encrypted Personal Backup/i }),
    ).toBeVisible();

    // Tab exists only when VITE_ENABLE_PERSONAL_BACKUP_SHARDS=1.
    await page.getByRole('button', { name: /Recovery shares/i }).click();
    await expect(page.getByText(/2-of-3 recovery shares/i)).toBeVisible();

    // Wallet password field.
    await page.getByPlaceholder('Your wallet password').fill(PIN);

    // Encrypt-one toggle + passphrase (share 2 will be JSON envelope).
    await page
      .getByLabel('Encrypt one share with a recovery passphrase')
      .check();
    await page
      .getByPlaceholder(/Recovery passphrase/i)
      .fill(PASSPHRASE);

    await page.getByRole('button', { name: /Split & save 3 shares/i }).click();

    // Wait until all 3 shares landed on disk.
    await expect
      .poll(() => downloaded.length, { timeout: 30_000 })
      .toBe(3);

    await expect(page.getByText(/All 3 recovery shares saved/i)).toBeVisible({
      timeout: 15_000,
    });

    // Sanity — expected filenames.
    const names = downloaded.map((p) => path.basename(p)).sort();
    expect(names).toContain('veyrnox-recovery-1-of-3.veyrnox-share');
    expect(names).toContain('veyrnox-recovery-2-of-3.veyrnox-recovery.json');
    expect(names).toContain('veyrnox-recovery-3-of-3.veyrnox-share');

    // The wrapped envelope must be JSON with the spec §5.3 shape.
    const envelopePath = downloaded.find((p) =>
      p.endsWith('.veyrnox-recovery.json'),
    );
    const env = JSON.parse(fs.readFileSync(envelopePath, 'utf8'));
    expect(env.app).toBe('veyrnox');
    expect(env.type).toBe('recovery-share');
    expect(env.shareIndex).toBe(2);

    // ── Restore leg (skip middle → pick shares 1 + 3) ───────────────────
    // RecoveryShareTab short-circuits to the success card while `done` is
    // true, so a mode-toggle click has no visible effect until we leave that
    // state via "Export another set". After that, the INNER Restore mode
    // toggle (index 1; outer page tab is index 0) reaches the restore panel.
    await page.getByRole('button', { name: /Export another set/i }).click();
    await page
      .getByRole('button', { name: /^Restore$/, exact: true })
      .nth(1)
      .click();
    await expect(page.getByText(/Restore from 2 recovery shares/i)).toBeVisible();

    const share1 = downloaded.find((p) =>
      p.endsWith('veyrnox-recovery-1-of-3.veyrnox-share'),
    );
    const share3 = downloaded.find((p) =>
      p.endsWith('veyrnox-recovery-3-of-3.veyrnox-share'),
    );
    expect(share1 && share3).toBeTruthy();

    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Choose 2 share files/i }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles([share1, share3]);

    await expect(page.getByText(/2 files loaded/i)).toBeVisible();

    await page.getByPlaceholder('New PIN (digits only)').fill(PIN);
    await page.getByPlaceholder('Confirm new PIN').fill(PIN);

    await page.getByRole('button', { name: /Restore wallet/i }).click();

    // Success toast, then RecoveryShareTab's onFinish → lock() + navigate('/').
    await expect(page.getByText(/Wallet recovered/i)).toBeVisible({
      timeout: 30_000,
    });

    // Re-unlock at / with the same PIN — proves the restore actually wrote
    // a working vault under the new PIN, not just showed a toast.
    await expect(page.getByRole('group', { name: /PIN entry/i })).toBeVisible({
      timeout: 15_000,
    });
    await enterPin(page, PIN);
    await expect(page.getByRole('link', { name: 'Send', exact: true })).toBeVisible({
      timeout: 30_000,
    });
  });
});
