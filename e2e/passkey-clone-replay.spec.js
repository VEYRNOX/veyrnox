// ─────────────────────────────────────────────────────────────────────────────
// M-K — cloned/replayed passkey authenticator detection, fully automated.
//
// docs/Feature-Status.md F-09/M-K entry: "BUILT (2026-06-30): WebAuthn signCount
// persistence + cloned authenticator detection... Ready for device verification
// with real clone attempt." This is that verification, without a human or a
// physical second authenticator: Chrome DevTools Protocol's WebAuthn domain lets
// us EXPORT the exact credential material from one virtual authenticator and
// IMPORT it onto a second one with a rolled-back signCount — precisely the
// FIDO2-defined clone signal src/lib/passkey.js:verifyPasskeyAssertion() checks
// for (signCount must strictly increase vs. the last persisted value).
//
// This drives src/lib/passkey.js DIRECTLY (via a page-context dynamic import of
// the real module Vite is already serving), not through UI text, because the
// UI intentionally swallows the specific PasskeyClonedError into a generic
// fail-closed gate failure (src/components/security/useActionGuard.jsx:94 —
// `try { passkeyOk = (await verifyPasskeyAssertion()) === true; } catch { passkeyOk = false; }`).
// Testing the module directly is the precise, non-guessed way to prove M-K.
//
// Steps:
//   1. Virtual authenticator A registers the passkey (registerPasskeyCredential).
//   2. A legitimate assertion succeeds (verifyPasskeyAssertion) -> signCount N persisted.
//   3. CDP exports A's credential and imports it onto a NEW authenticator B with
//      signCount reset below N (simulating an exported/cloned soft authenticator
//      replaying stale state).
//   4. Authenticator A is removed so the browser can only answer via the "clone" B.
//   5. A second assertion attempt MUST throw PasskeyClonedError and must NOT
//      advance the persisted signCount (fail-closed, I4).
//
// Run:
//   npx playwright test e2e/passkey-clone-replay.spec.js
// ─────────────────────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

// Chrome allows only ONE 'internal' (platform) virtual authenticator per
// browser context at a time — the second one (the "clone") must use a
// different transport. This mirrors reality: a cloned/exported credential
// blob replayed from different hardware (e.g. a roaming security key) is
// exactly the scenario M-K's signCount check exists to catch — the assertion
// path itself doesn't enforce authenticatorAttachment, only registration does.
async function addVirtualAuthenticator(client, transport = 'internal') {
  const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport,
      hasUserVerification: true,
      hasResidentKey: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return authenticatorId;
}

test.describe('Passkey clone/replay detection (M-K) — CDP dual-authenticator, no human', () => {
  test.setTimeout(60 * 1000);

  test('a cloned authenticator with a rolled-back signCount is rejected, and the stored counter is not advanced', async ({ page }) => {
    // Real (non-demo) build: registerPasskeyCredential/verifyPasskeyAssertion take
    // the real WebAuthn branch only outside demo mode (passkey.js:422 DEMO check).
    await page.goto(`${BASE}/?demo=0`);
    await page.evaluate(() => { try { localStorage.clear(); } catch { /* noop */ } });
    await page.goto(`${BASE}/?demo=0`);

    const client = await page.context().newCDPSession(page);
    await client.send('WebAuthn.enable');
    const authA = await addVirtualAuthenticator(client);
    console.log(`✓ Virtual authenticator A created (${authA})`);

    // ── Step 1: register the passkey on A ────────────────────────────────────
    const regResult = await page.evaluate(async () => {
      const m = await import('/src/lib/passkey.js');
      return m.registerPasskeyCredential({ label: 'clone-test' });
    });
    expect(regResult.ok).toBe(true);
    console.log(`✓ Passkey registered on authenticator A (credentialId=${regResult.credentialId})`);

    // ── Step 2: one legitimate assertion -> persists signCount N ─────────────
    const firstAssertionOk = await page.evaluate(async () => {
      const m = await import('/src/lib/passkey.js');
      try { return await m.verifyPasskeyAssertion(); } catch (e) { return { threw: true, message: e?.message }; }
    });
    expect(firstAssertionOk).toBe(true);
    const signCountAfterFirst = await page.evaluate(async () => {
      const m = await import('/src/lib/passkey.js');
      return m.getPasskeySignCount();
    });
    console.log(`✓ Legitimate assertion succeeded; persisted signCount = ${signCountAfterFirst}`);
    expect(signCountAfterFirst).toBeGreaterThan(0);

    // ── Step 3: export A's credential, clone it onto a fresh authenticator B
    // with signCount rolled back to 0 — the exact "exported/replayed soft
    // authenticator" scenario M-K's doc comment describes. ───────────────────
    const { credentials } = await client.send('WebAuthn.getCredentials', { authenticatorId: authA });
    expect(credentials.length).toBeGreaterThan(0);
    const original = credentials[0];

    const authB = await addVirtualAuthenticator(client, 'usb');
    await client.send('WebAuthn.addCredential', {
      authenticatorId: authB,
      credential: {
        ...original,
        signCount: 0, // rolled back — below the already-persisted signCountAfterFirst
      },
    });
    console.log(`✓ Cloned credential imported onto authenticator B (${authB}) with signCount reset to 0`);

    // ── Step 4: remove A so the ONLY authenticator that can answer is the clone B ──
    await client.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: authA });

    // ── Step 5: the clone's assertion must be rejected as PasskeyClonedError,
    // and the persisted signCount must remain unchanged (fail-closed, I4). ───
    const cloneResult = await page.evaluate(async () => {
      const m = await import('/src/lib/passkey.js');
      try {
        const ok = await m.verifyPasskeyAssertion();
        return { threw: false, ok };
      } catch (e) {
        return { threw: true, message: e?.message, isCloned: m.isPasskeyClonedError(e) };
      }
    });

    expect(cloneResult.threw).toBe(true);
    expect(cloneResult.isCloned).toBe(true);
    console.log(`✓ Cloned/replayed authenticator REJECTED: ${cloneResult.message}`);

    const signCountAfterClone = await page.evaluate(async () => {
      const m = await import('/src/lib/passkey.js');
      return m.getPasskeySignCount();
    });
    expect(signCountAfterClone).toBe(signCountAfterFirst);
    console.log(`✓ Persisted signCount unchanged after the rejected clone attempt (${signCountAfterClone})`);
  });
});
