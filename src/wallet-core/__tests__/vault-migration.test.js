// wallet-core/__tests__/vault-migration.test.js
//
// SAST M3 — changing the at-rest Argon2id params must NOT lock users out of
// existing vaults. These tests assert the migration contract:
//   - a vault encrypted with the OLD (192 MiB) params still decrypts after the
//     default is lowered to 64 MiB (decrypt uses the blob's OWN recorded params);
//   - new encryptions use the current (64 MiB) params;
//   - vaultNeedsRekey flags an old blob and not a current one;
//   - webKeyStore.unlock transparently re-encrypts an old vault at the new params
//     on first unlock, while still returning the secret, and is a no-op after.
//
// We craft an old-params blob with hash-wasm argon2id directly (the exact
// construction encryptVault used at 64 MiB), since encryptVault now always emits
// the new params.

import { describe, it, expect, beforeEach } from 'vitest';
import { argon2id } from 'hash-wasm';
import { encryptVault, decryptVault, vaultNeedsRekey, KDF_PARAMS } from '../vault.js';
import { webKeyStore } from '../keystore/web.js';
import { saveVault, loadVault, clearVault } from '../evm/vaultStore.js';

const OLD_PARAMS = { parallelism: 1, iterations: 3, memorySize: 196608, hashLength: 32 };
const enc = new TextEncoder();

function b64(u8) { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); }
function rnd(n) { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; }

// Encrypt exactly as vault.js does, but at arbitrary params — to forge an
// "old vault" written before M3.
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
const PASSWORD = 'correct horse battery staple';

describe('SAST M3 — KDF parameter migration', () => {
  beforeEach(async () => {
    await clearVault();
  });

  it('the current default params are 64 MiB (lowered from 192 MiB for device perf)', () => {
    expect(KDF_PARAMS.memorySize).toBe(65536);
    expect(KDF_PARAMS.memorySize).toBeLessThan(OLD_PARAMS.memorySize);
  });

  it('an OLD-params (64 MiB) vault still decrypts after the default is raised', async () => {
    const oldBlob = await encryptAtParams(SECRET, PASSWORD, OLD_PARAMS);
    expect(oldBlob.kdf.memorySize).toBe(196608);
    // Decrypt must use the blob's OWN params, not the new default — no lockout.
    expect(await decryptVault(oldBlob, PASSWORD)).toBe(SECRET);
    // A wrong password still fails generically.
    await expect(decryptVault(oldBlob, 'wrong')).rejects.toThrow(/wrong password or corrupted/i);
  });

  it('a freshly encrypted vault records the NEW params', async () => {
    const blob = await encryptVault(SECRET, PASSWORD);
    expect(blob.kdf.memorySize).toBe(KDF_PARAMS.memorySize);
    expect(await decryptVault(blob, PASSWORD)).toBe(SECRET);
  });

  it('vaultNeedsRekey flags an old blob and not a current one', async () => {
    const oldBlob = await encryptAtParams(SECRET, PASSWORD, OLD_PARAMS);
    const newBlob = await encryptVault(SECRET, PASSWORD);
    expect(vaultNeedsRekey(oldBlob)).toBe(true);
    expect(vaultNeedsRekey(newBlob)).toBe(false);
  });

  it('webKeyStore.unlock migrates an old vault to the new params on first unlock', async () => {
    const oldBlob = await encryptAtParams(SECRET, PASSWORD, OLD_PARAMS);
    await saveVault(oldBlob);

    // First unlock returns the secret AND rewrites the stored blob at new params.
    expect(await webKeyStore.unlock(PASSWORD)).toBe(SECRET);

    const migrated = await loadVault();
    expect(migrated.kdf.memorySize).toBe(KDF_PARAMS.memorySize);
    expect(vaultNeedsRekey(migrated)).toBe(false);
    // The migrated blob is a DIFFERENT ciphertext (fresh salt/iv) but same secret.
    expect(migrated.ct).not.toBe(oldBlob.ct);
    expect(await decryptVault(migrated, PASSWORD)).toBe(SECRET);
  });

  it('a current-params vault is NOT rewritten on unlock (migration is one-shot)', async () => {
    await saveVault(await encryptVault(SECRET, PASSWORD));
    const before = await loadVault();
    expect(await webKeyStore.unlock(PASSWORD)).toBe(SECRET);
    const after = await loadVault();
    // No rekey: same ciphertext bytes (would differ if re-encrypted).
    expect(after.ct).toBe(before.ct);
  });

  it('a wrong password does not migrate or expose anything', async () => {
    await saveVault(await encryptAtParams(SECRET, PASSWORD, OLD_PARAMS));
    await expect(webKeyStore.unlock('nope')).rejects.toThrow(/wrong password or corrupted/i);
    // Still the old blob — a failed unlock must not rewrite the vault.
    expect((await loadVault()).kdf.memorySize).toBe(OLD_PARAMS.memorySize);
  });
});
