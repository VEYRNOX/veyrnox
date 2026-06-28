// wallet-core/__tests__/change-password.test.js
//
// S1 — Account Access / Reset. The non-custodial "change my vault password"
// path re-encrypts the EXISTING vault under a new password WITHOUT changing the
// seed it protects, and WITHOUT weakening the crypto. These tests pin the
// contract of webKeyStore.changePassword:
//   - after a change, the NEW password decrypts to the SAME secret;
//   - the OLD password no longer decrypts;
//   - a wrong CURRENT password throws the generic error and rewrites NOTHING;
//   - changing the password also upgrades a legacy-params blob to current params
//     (same migration the unlock path performs), since encryptVault records them;
//   - with no vault present it throws the same "No wallet found" error as unlock.
//
// This is intentionally a sibling of vault-migration.test.js: change-password is
// decrypt-then-re-encrypt over the unchanged ../vault.js crypto, so it shares the
// same forged-old-blob helper to prove the param-upgrade property.

import { describe, it, expect, beforeEach } from 'vitest';
import { argon2id } from 'hash-wasm';
import { decryptVault, encryptVault, vaultNeedsRekey, KDF_PARAMS } from '../vault.js';
import { webKeyStore } from '../keystore/web.js';
import { saveVault, loadVault, clearVault } from '../evm/vaultStore.js';

const OLD_PARAMS = { parallelism: 1, iterations: 3, memorySize: 196608, hashLength: 32 };
const enc = new TextEncoder();

function b64(u8) { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); }
function rnd(n) { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; }

// Forge a vault encrypted at arbitrary (e.g. legacy) params — same helper shape
// as vault-migration.test.js, used to prove change-password upgrades params.
async function encryptAtParams(secret, password, params) {
  const salt = rnd(16);
  const iv = rnd(12);
  const raw = await argon2id({
    password: enc.encode(password.normalize('NFKC')),
    salt, ...params, outputType: 'binary',
  });
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(secret));
  return {
    v: 1,
    kdf: { name: 'argon2id', ...params },
    salt: b64(salt),
    iv: b64(iv),
    ct: b64(new Uint8Array(ct)),
  };
}

const SECRET = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const OLD_PW = 'correct horse battery staple';
const NEW_PW = 'a-different-much-longer-passphrase-9931';

describe('S1 — change vault password (non-custodial re-wrap)', () => {
  beforeEach(async () => {
    await clearVault();
  });

  it('re-encrypts so the NEW password decrypts to the SAME secret', async () => {
    await saveVault(await encryptVault(SECRET, OLD_PW));
    await webKeyStore.changePassword(OLD_PW, NEW_PW);

    const after = await loadVault();
    // Same seed, now under the new password.
    expect(await decryptVault(after, NEW_PW)).toBe(SECRET);
    // And the live unlock path agrees.
    expect(await webKeyStore.unlock(NEW_PW)).toBe(SECRET);
  });

  it('the OLD password no longer decrypts after a change', async () => {
    await saveVault(await encryptVault(SECRET, OLD_PW));
    await webKeyStore.changePassword(OLD_PW, NEW_PW);
    await expect(webKeyStore.unlock(OLD_PW)).rejects.toThrow(/wrong password or corrupted/i);
  });

  it('produces a fresh ciphertext (new salt/iv), not the same bytes', async () => {
    await saveVault(await encryptVault(SECRET, OLD_PW));
    const before = await loadVault();
    await webKeyStore.changePassword(OLD_PW, NEW_PW);
    const after = await loadVault();
    expect(after.ct).not.toBe(before.ct);
    expect(after.salt).not.toBe(before.salt);
    expect(after.iv).not.toBe(before.iv);
  });

  it('a WRONG current password throws and rewrites NOTHING', async () => {
    await saveVault(await encryptVault(SECRET, OLD_PW));
    const before = await loadVault();
    await expect(webKeyStore.changePassword('not-the-password', NEW_PW))
      .rejects.toThrow(/wrong password or corrupted/i);
    const after = await loadVault();
    // Untouched: same ciphertext, and the original password still works.
    expect(after.ct).toBe(before.ct);
    expect(await webKeyStore.unlock(OLD_PW)).toBe(SECRET);
  });

  it('with no vault on the device, it throws the same "No wallet found" error', async () => {
    await expect(webKeyStore.changePassword(OLD_PW, NEW_PW))
      .rejects.toThrow(/no wallet found/i);
  });

  it('upgrades a legacy-params vault to the current KDF params on change', async () => {
    await saveVault(await encryptAtParams(SECRET, OLD_PW, OLD_PARAMS));
    expect(vaultNeedsRekey(await loadVault())).toBe(true);

    await webKeyStore.changePassword(OLD_PW, NEW_PW);

    const after = await loadVault();
    expect(after.kdf.memorySize).toBe(KDF_PARAMS.memorySize);
    expect(vaultNeedsRekey(after)).toBe(false);
    expect(await decryptVault(after, NEW_PW)).toBe(SECRET);
  });

  it('re-importing the SAME seed under a new password is the recovery path (overwrites the vault)', async () => {
    // Models "forgot password -> recover by re-import": createVault overwrites
    // the primary blob, and the new password opens the same seed. No escrow.
    await saveVault(await encryptVault(SECRET, OLD_PW));
    await webKeyStore.createVault(SECRET, NEW_PW); // re-import flow uses createVault
    await expect(webKeyStore.unlock(OLD_PW)).rejects.toThrow(/wrong password or corrupted/i);
    expect(await webKeyStore.unlock(NEW_PW)).toBe(SECRET);
  });
});
