// ─────────────────────────────────────────────────────────────────────────────
// Web Phase 1 KEK — Tier 1 fully-automated WebAuthn PRF regression suite
//
// Runs UNATTENDED in CI (included in `npm run test:e2e` — no testIgnore entry).
// Uses the Chrome DevTools Protocol virtual authenticator WITH the PRF option
// (`hasPrf: true` — the tier-2 harness predates this and omits it, which is why
// its PRF eval cannot return output). Covers the fail-closed matrix from
// docs/uat-web-phase1-prf-checklist.md sections C–E at the keystore boundary,
// plus the UI unlock path.
//
// HONESTY SCOPE: a CDP virtual authenticator is a SOFT authenticator. A green
// run here proves the web KEK code paths fail closed and round-trip correctly
// against a real browser WebAuthn stack — it does NOT prove hardware binding
// and does NOT satisfy any UAT item in the checklist (those need real Windows
// Hello / a real platform authenticator + an owner-supplied txid). This suite
// is the permanent regression net UNDER the human UAT, not a substitute.
//
// Two layers:
//   - Keystore-boundary tests drive `webKeyStore` inside the real page via the
//     Vite dev server's module graph (real WebAuthn, real Argon2id, real
//     IndexedDB/localStorage) — exactly the wiring HardwareKekSettings.jsx and
//     WalletProvider.jsx use (same getHardwareFactor thunk shape).
//   - UI tests drive the real unlock screen (vault seeded at the keystore
//     boundary, since onboarding leaves an unpersisted "explore mode" shell).
//
// TWO DEFECTS SURFACED WHILE BUILDING THIS SUITE (both marked `fixme`, both
// tracked as findings — see the inline notes at each test):
//   1. KEK-DOWNGRADE (HIGH): webKeyStore.saveVaultContents drops the kek-dek
//      wrap on web, silently downgrading an enrolled vault to bare on any content
//      re-persist. Phase-1 offline-seizure regression; web sibling of Android bug 3.
//   2. UI-DEFECT (MED): the settings enrollment card renders an 8-digit PinPad for
//      the web credential, but the web credential is a ≥12-char password, so web
//      enrollment through the card can never succeed.
// ─────────────────────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery-12'; // ≥12 chars (H-A web vault minimum)
const WRONG_PASSWORD = 'wrong-horse-battery-00';
const SECRET =
  'test test test test test test test test test test test junk';
const CRED_KEY = 'veyrnox-prf-cred-id';

// Argon2id at production params runs several times per test; CI runners are slow.
test.setTimeout(300_000);

// ── CDP virtual authenticator ────────────────────────────────────────────────
async function addAuthenticator(page, { hasPrf = true } = {}) {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf, // REQUIRED for the prf/hmac-secret extension to return output
    },
  });
  return { client, authenticatorId };
}

// ── Fresh app state (mirrors e2e/onboarding.spec.js) ─────────────────────────
async function freshState(page) {
  await page.goto(`${BASE}/?demo=0`);
  await page.evaluate(async () => {
    try { localStorage.clear(); } catch {}
    try {
      for (const db of (await indexedDB.databases?.()) || []) {
        indexedDB.deleteDatabase(db.name);
      }
    } catch {}
  });
  await page.goto(`${BASE}/?demo=0`);
}

// ── Keystore-boundary helpers (run inside the page, Vite module graph) ───────
// The app ships a strict CSP (no 'unsafe-eval'), so no dynamic code — ksCall is
// a fixed dispatcher over named operations. Serializable result contract:
// { ok, value?, code?, message? } — page.evaluate cannot return an Error intact.
function ksCall(page, op, arg) {
  return page.evaluate(
    async ([opName, a]) => {
      const { webKeyStore: ks } = await import('/src/wallet-core/keystore/web.js');
      const getHF = () => ks.getHardwareFactor();
      const ops = {
        createVault: () => ks.createVault(a.secret, a.password).then(() => true),
        enrollKek: () => ks.enrollKek(a, { getHardwareFactor: getHF }).then(() => true),
        unlock: () => ks.unlock(a, { getHardwareFactor: getHF }),
        unlockBare: () => ks.unlock(a),
        unenrollKek: () => ks.unenrollKek(a, { getHardwareFactor: getHF }).then(() => true),
      };
      try {
        const value = await ops[opName]();
        return { ok: true, value: value === undefined ? null : value };
      } catch (e) {
        return { ok: false, code: e?.code ?? null, message: String(e?.message ?? e) };
      }
    },
    [op, arg ?? null],
  );
}

function readVaultMeta(page) {
  return page.evaluate(async () => {
    const { loadVault } = await import('/src/wallet-core/evm/vaultStore.js');
    const blob = await loadVault();
    if (!blob) return null;
    return {
      kdf: blob.kdf ?? null,
      hasKekWrap: !!blob.kekWrap,
      kekSaltLen: typeof blob.kekSalt === 'string' ? blob.kekSalt.length : 0,
      kekSalt: typeof blob.kekSalt === 'string' ? blob.kekSalt : null,
    };
  });
}

const readCredId = (page) => page.evaluate((k) => localStorage.getItem(k), CRED_KEY);

async function createAndEnroll(page) {
  const created = await ksCall(
    page,
    'createVault',
    { secret: SECRET, password: PASSWORD },
  );
  expect(created.ok, `createVault failed: ${created.message}`).toBe(true);
  const enrolled = await ksCall(
    page,
    'enrollKek',
    PASSWORD,
  );
  expect(enrolled.ok, `enrollKek failed: ${enrolled.message}`).toBe(true);
}

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Web KEK PRF — keystore boundary (fail-closed matrix)', () => {
  test('C: enroll happy path — kek-dek wrap, 44-char salt, cred id persisted only after PRF output', async ({ page }) => {
    await freshState(page);
    await addAuthenticator(page);

    expect(await readCredId(page)).toBeNull();
    await createAndEnroll(page);

    const meta = await readVaultMeta(page);
    expect(meta.kdf).toBe('kek-dek');
    expect(meta.hasKekWrap).toBe(true);
    expect(meta.kekSaltLen).toBe(44); // 32 random bytes, base64
    expect(await readCredId(page)).toBeTruthy(); // F-05: persisted post-PRF-output

    // D1: unlock round-trips the exact secret with BOTH factors present.
    const unlocked = await ksCall(
      page,
      'unlock',
      PASSWORD,
    );
    expect(unlocked.ok, `unlock failed: ${unlocked.message}`).toBe(true);
    expect(unlocked.value).toBe(SECRET);
  });

  test('D2: wrong password + valid PRF assertion fails closed (KEK_UNWRAP_FAILED)', async ({ page }) => {
    await freshState(page);
    await addAuthenticator(page);
    await createAndEnroll(page);

    const r = await ksCall(
      page,
      'unlock',
      WRONG_PASSWORD,
    );
    expect(r.ok).toBe(false);
    expect(`${r.code} ${r.message}`).toContain('KEK_UNWRAP_FAILED');

    // Vault untouched — still unlockable with the right password.
    const again = await ksCall(
      page,
      'unlock',
      PASSWORD,
    );
    expect(again.ok).toBe(true);
  });

  test('D3: denied assertion (UV fails) → unlock fails, NO bare-password fallback', async ({ page }) => {
    await freshState(page);
    const { client, authenticatorId } = await addAuthenticator(page);
    await createAndEnroll(page);

    // Simulate the user failing/cancelling verification at the authenticator.
    await client.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });
    const denied = await ksCall(
      page,
      'unlock',
      PASSWORD,
    );
    // The security property: correct password alone must NEVER open a KEK vault
    // when the hardware factor is unavailable. Failure was the H factor, not C —
    // so bare unlock (password only, no getHardwareFactor) must ALSO be refused.
    expect(denied.ok).toBe(false);
    const bare = await ksCall(page, 'unlockBare', PASSWORD);
    expect(bare.ok).toBe(false);
    expect(`${bare.code} ${bare.message}`).toContain('KEK_NO_HARDWARE_FACTOR');
  });

  test('D4: credential id lost → PRF_CREDENTIAL_LOST, never silently mints a new credential', async ({ page }) => {
    await freshState(page);
    await addAuthenticator(page);
    await createAndEnroll(page);

    await page.evaluate((k) => localStorage.removeItem(k), CRED_KEY);
    const r = await ksCall(
      page,
      'unlock',
      PASSWORD,
    );
    expect(r.ok).toBe(false);
    expect(r.message).toContain('PRF_CREDENTIAL_LOST');
    // A silent re-create would repopulate the key (and derive a WRONG H).
    expect(await readCredId(page)).toBeNull();
  });

  test('C: double-enroll rejected with KEK_ALREADY_ENROLLED, vault untouched', async ({ page }) => {
    await freshState(page);
    await addAuthenticator(page);
    await createAndEnroll(page);
    const before = await readVaultMeta(page);

    const r = await ksCall(
      page,
      'enrollKek',
      PASSWORD,
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe('KEK_ALREADY_ENROLLED');

    const after = await readVaultMeta(page);
    expect(after).toEqual(before);
  });

  test('F (Safari-shape): authenticator without PRF → honest enroll failure, no orphan cred id, vault stays bare', async ({ page }) => {
    await freshState(page);
    await addAuthenticator(page, { hasPrf: false });

    const created = await ksCall(
      page,
      'createVault',
      { secret: SECRET, password: PASSWORD },
    );
    expect(created.ok).toBe(true);

    const r = await ksCall(
      page,
      'enrollKek',
      PASSWORD,
    );
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/PRF|hmac-secret/i); // honest capability error, not a crash

    // F-05: no orphan credential id, vault not half-enrolled.
    expect(await readCredId(page)).toBeNull();
    const meta = await readVaultMeta(page);
    expect(meta.kdf).not.toBe('kek-dek');
    expect(meta.hasKekWrap).toBe(false);

    // Password-only unlock still works — the documented fallback path.
    const unlocked = await ksCall(page, 'unlockBare', PASSWORD);
    expect(unlocked.ok).toBe(true);
    expect(unlocked.value).toBe(SECRET);
  });

  test('E: unenroll → bare vault + cred id removed; re-enroll mints fresh credential AND fresh salt', async ({ page }) => {
    await freshState(page);
    await addAuthenticator(page);
    await createAndEnroll(page);

    const firstCred = await readCredId(page);
    const firstSalt = (await readVaultMeta(page)).kekSalt;

    const un = await ksCall(
      page,
      'unenrollKek',
      PASSWORD,
    );
    expect(un.ok, `unenrollKek failed: ${un.message}`).toBe(true);
    expect(await readCredId(page)).toBeNull();
    const bare = await readVaultMeta(page);
    expect(bare.hasKekWrap).toBe(false);

    const re = await ksCall(
      page,
      'enrollKek',
      PASSWORD,
    );
    expect(re.ok, `re-enroll failed: ${re.message}`).toBe(true);
    const secondCred = await readCredId(page);
    const secondSalt = (await readVaultMeta(page)).kekSalt;
    expect(secondCred).toBeTruthy();
    expect(secondCred).not.toBe(firstCred);
    expect(secondSalt).not.toBe(firstSalt); // per-enrollment salt distinctness (web)
  });

  // ── KEK-DOWNGRADE finding (found while building this suite, 2026-07-06) ─────
  // webKeyStore.saveVaultContents() does NOT preserve the kek-dek wrap: it always
  // writes a bare Argon2id vault (web.js saveVaultContents, "always a plain bare
  // write"). WalletProvider routes every primary-content re-persist through this
  // method SPECIFICALLY to be KEK-preserving (the native "KEK downgrade fix"), and
  // its comments assert "on web it is undefined and ignored (no KEK at rest)" —
  // but a PRF-enrolled web vault DOES have a KEK at rest. So any content re-persist
  // of an enrolled web vault (legacy single-seed→container migration on first
  // unlock, padding migration, or any add/import/rename-wallet mutation) silently
  // downgrades it to a bare vault, unlockable by password ALONE with no PRF — the
  // web sibling of the Android "bug 3" and a Phase-1 offline-seizure regression.
  // Verified at the keystore boundary (this call passes getHardwareFactor, exactly
  // as WalletProvider does, and the wrap is STILL dropped). This test asserts the
  // CORRECT behavior and is `fixme` until saveVaultContents preserves the wrap on
  // web (re-encrypt content under the existing DEK, keep kekWrap/kekSalt).
  test.fixme('KEK-DOWNGRADE: saveVaultContents must preserve the kek-dek wrap on an enrolled web vault', async ({ page }) => {
    await freshState(page);
    await addAuthenticator(page);
    await createAndEnroll(page);
    expect((await readVaultMeta(page)).hasKekWrap).toBe(true);

    const r = await page.evaluate(async ([s, p]) => {
      const { webKeyStore: ks } = await import('/src/wallet-core/keystore/web.js');
      await ks.saveVaultContents(s, p, { getHardwareFactor: () => ks.getHardwareFactor() });
      return true;
    }, [SECRET, PASSWORD]);
    expect(r).toBe(true);

    const meta = await readVaultMeta(page);
    expect(meta.kdf).toBe('kek-dek'); // currently 'argon2id' (bare) — the bug
    expect(meta.hasKekWrap).toBe(true); // currently false — offline-seizure gap reopened
  });

  test('H-A: web vault password under 12 chars rejected before any ciphertext exists', async ({ page }) => {
    await freshState(page);
    const r = await ksCall(
      page,
      'createVault',
      { secret: SECRET, password: 'short-pw-11' }, // 11 chars
    );
    expect(r.ok).toBe(false);
    expect(`${r.code} ${r.message}`).toContain('WEB_VAULT_PASSWORD_TOO_SHORT');
    expect(await readVaultMeta(page)).toBeNull(); // nothing written (I4)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UI unlock path. The onboarding shell leaves the app in "explore mode" where no
// real vault is persisted until a separate Create-Wallet step, so these seed the
// vault directly at the keystore boundary (the SAME API onboarding ultimately
// calls) and then drive the REAL unlock screen — which is the surface under test.
// authModel defaults to 'password' on web (authModel.js), so reload lands on the
// password unlock branch.
test.describe('Web KEK PRF — UI unlock path', () => {
  async function seedVault(page, { enroll }) {
    await freshState(page);
    await addAuthenticator(page);
    const c = await ksCall(page, 'createVault', { secret: SECRET, password: PASSWORD });
    expect(c.ok, `createVault failed: ${c.message}`).toBe(true);
    if (enroll) {
      const e = await ksCall(page, 'enrollKek', PASSWORD);
      expect(e.ok, `enrollKek failed: ${e.message}`).toBe(true);
    }
  }

  async function reloadToUnlockScreen(page) {
    await page.goto(`${BASE}/?demo=0`);
    const pw = page.locator('input[type="password"]').first();
    await expect(pw).toBeVisible({ timeout: 20000 });
    return pw;
  }

  // Navigate to Settings via IN-APP SPA routing (a hard page.goto reload re-locks
  // the vault — unlock state is in-memory in WalletProvider — so the KEK card
  // would never mount). The Layout header has a Link aria-labelled "Settings".
  async function gotoSettingsInApp(page) {
    await page.getByRole('link', { name: 'Settings' }).first().click();
    await expect(page.getByRole('heading', { name: 'Hardware Protection' })).toBeVisible({ timeout: 15000 });
  }

  test('B: settings card is honest on a bare vault (OFF, provisional disclosure, no protection claim)', async ({ page }) => {
    await seedVault(page, { enroll: false });
    const pw = await reloadToUnlockScreen(page);
    await pw.fill(PASSWORD);
    await pw.press('Enter');
    await expect(page.getByRole('link', { name: /^Send$/i })).toBeVisible({ timeout: 60000 });

    await gotoSettingsInApp(page);
    await expect(page.getByText('UNAUDITED-PROVISIONAL')).toBeVisible();
    // I4: the "WebAuthn Protected" badge is EARNED by enrollment, never shown
    // structurally on a bare vault.
    await expect(page.getByText('WebAuthn Protected')).toHaveCount(0);
  });

  test('D1-UI: KEK vault unlocks through the real unlock screen (password submit drives the PRF assertion)', async ({ page }) => {
    await seedVault(page, { enroll: true });
    const pw = await reloadToUnlockScreen(page);
    // WalletProvider.unlock passes getHardwareFactor on web, so this submit must
    // trigger navigator.credentials.get() (CDP auto-approves). Reaching the app
    // (Send link) is the security property under test: a KEK vault CANNOT open
    // without a successful PRF assertion, so this proves both factors ran.
    await pw.fill(PASSWORD);
    await pw.press('Enter');
    await expect(page.getByRole('link', { name: /^Send$/i })).toBeVisible({ timeout: 60000 });
    // NOTE: the settings "WebAuthn Protected" badge is intentionally NOT asserted
    // here — see the KEK-DOWNGRADE finding below. This test's vault was seeded from
    // a legacy bare mnemonic, so the first unlock fires the single-seed→container
    // migration, whose saveVaultContents re-persist silently strips the kek-dek
    // wrap on web. The unlock itself is honest; the downgrade is a separate defect.
  });

  test('D4-UI: KEK vault with a lost credential never opens through the unlock screen', async ({ page }) => {
    await seedVault(page, { enroll: true });
    await page.evaluate((k) => localStorage.removeItem(k), CRED_KEY);
    const pw = await reloadToUnlockScreen(page);
    await pw.fill(PASSWORD);
    await pw.press('Enter');

    // Must NOT reach the app, and must surface feedback rather than hang silently.
    await expect(page.getByRole('link', { name: /^Send$/i })).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByRole('alert').or(page.locator('[role="status"]')).first())
      .toBeVisible({ timeout: 30000 });
  });

  // ── UI-DEFECT (found while building this suite, 2026-07-06) ────────────────
  // HardwareKekSettings.jsx renders the WEB enrollment credential input as
  // <PinPad length={8}> — a digits-only 8-slot pad (PinPad.jsx KEYS array).
  // But the web vault credential is a ≥12-char PASSWORD (H-A minimum, enforced
  // by validateWebVaultPassword), and webKeyStore.enrollKek(pin) verifies the
  // input against that password via decryptVault. A ≥12-char alphanumeric
  // password cannot be entered on an 8-digit numeric pad, so web enrollment
  // through the settings card ALWAYS fails with the wrong-PIN message. The
  // keystore API itself is fine (proven by the enroll tests above) — the defect
  // is the input surface. Fix tracked separately; when the card gains a proper
  // password input on web, un-fixme this test.
  test.fixme('C-UI: enroll through the settings card with the vault password', async ({ page }) => {
    await seedVault(page, { enroll: false });
    const pw = await reloadToUnlockScreen(page);
    await pw.fill(PASSWORD);
    await pw.press('Enter');
    await expect(page.getByRole('link', { name: /^Send$/i })).toBeVisible({ timeout: 60000 });
    await gotoSettingsInApp(page);
    // Intended flow once fixed: enter the VAULT PASSWORD on the card's input,
    // submit "Enable hardware protection", expect success toast + badge.
    await expect(page.getByText('WebAuthn Protected')).toBeVisible({ timeout: 30000 });
  });
});
