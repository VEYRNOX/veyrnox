// wallet-core/__tests__/vault-kdf-192-migration.test.js
//
// Argon2id at-rest cost raise: 64 MiB -> 192 MiB (m=196608 KiB).
//
// RATIONALE: on web/native the seed vault is single-factor at rest against an
// EXFILTRATED ciphertext blob (offline, GPU/ASIC-crackable). Now that Face ID /
// biometric unlock is available to absorb the added latency, we can afford a more
// memory-hard cost. Memory is the lever against parallel cracking hardware.
//
// These tests pin the raise WITHOUT locking anyone out of an existing vault:
//   1. a NEW vault created with default params records m=192 MiB;
//   2. an OLD vault encrypted at m=64 MiB STILL decrypts (decrypt uses the blob's
//      OWN recorded params — the M3 migration contract, unchanged);
//   3. lazy migration: changing the password on a 64 MiB vault re-encrypts it at
//      the current (192 MiB) params.
//
// We forge the old-params blob with hash-wasm argon2id directly (the exact
// construction encryptVault used at 64 MiB), since encryptVault now always emits
// the new default.

import { describe, it, expect, beforeEach } from 'vitest';
import { argon2id } from 'hash-wasm';
import { encryptVault, decryptVault, vaultNeedsRekey, KDF_PARAMS } from '../vault.js';
import { webKeyStore } from '../keystore/web.js';
import { saveVault, loadVault, clearVault } from '../evm/vaultStore.js';

const NEW_MEMORY_KIB = 196608; // 192 * 1024 == 192 MiB
const OLD_64_PARAMS = { parallelism: 1, iterations: 3, memorySize: 65536, hashLength: 32 };
const enc = new TextEncoder();

function b64(u8) { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); }
function rnd(n) { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; }

// Encrypt exactly as vault.js does, but at arbitrary params — to forge a vault
// written under the old 64 MiB default.
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

describe('Argon2id raise to 192 MiB — default params', () => {
  it('CASE 1: the current default KDF params are 192 MiB (m=196608 KiB)', () => {
    expect(KDF_PARAMS.memorySize).toBe(NEW_MEMORY_KIB);
    expect(KDF_PARAMS.memorySize).toBe(192 * 1024);
  });

  it('CASE 1: a freshly encrypted vault records the 192 MiB params and round-trips', async () => {
    const blob = await encryptVault(SECRET, PASSWORD);
    expect(blob.kdf.memorySize).toBe(NEW_MEMORY_KIB);
    expect(await decryptVault(blob, PASSWORD)).toBe(SECRET);
  });
});

describe('Argon2id raise to 192 MiB — backward compat with 64 MiB vaults', () => {
  it('CASE 2: an OLD 64 MiB vault still decrypts after the default is raised', async () => {
    const oldBlob = await encryptAtParams(SECRET, PASSWORD, OLD_64_PARAMS);
    expect(oldBlob.kdf.memorySize).toBe(65536);
    // Decrypt must use the blob's OWN params (64 MiB), not the new default — no lockout.
    expect(await decryptVault(oldBlob, PASSWORD)).toBe(SECRET);
    // A wrong password still fails generically (no oracle).
    await expect(decryptVault(oldBlob, 'wrong')).rejects.toThrow(/wrong password or corrupted/i);
  });

  it('CASE 2: vaultNeedsRekey flags a 64 MiB blob and not a fresh 192 MiB one', async () => {
    const oldBlob = await encryptAtParams(SECRET, PASSWORD, OLD_64_PARAMS);
    const newBlob = await encryptVault(SECRET, PASSWORD);
    expect(vaultNeedsRekey(oldBlob)).toBe(true);
    expect(vaultNeedsRekey(newBlob)).toBe(false);
  });
});

describe('Argon2id raise to 192 MiB — lazy migration on password change', () => {
  beforeEach(async () => {
    await clearVault();
  });

  it('CASE 3: changing the password on a 64 MiB vault re-encrypts it at 192 MiB', async () => {
    const NEW_PW = 'a-different-much-longer-passphrase-9931';
    await saveVault(await encryptAtParams(SECRET, PASSWORD, OLD_64_PARAMS));
    expect(vaultNeedsRekey(await loadVault())).toBe(true);

    await webKeyStore.changePassword(PASSWORD, NEW_PW);

    const after = await loadVault();
    expect(after.kdf.memorySize).toBe(NEW_MEMORY_KIB);
    expect(vaultNeedsRekey(after)).toBe(false);
    expect(await decryptVault(after, NEW_PW)).toBe(SECRET);
  });

  it('CASE 3 (bonus): unlocking a 64 MiB vault lazily migrates it to 192 MiB', async () => {
    await saveVault(await encryptAtParams(SECRET, PASSWORD, OLD_64_PARAMS));
    expect(await webKeyStore.unlock(PASSWORD)).toBe(SECRET);
    const migrated = await loadVault();
    expect(migrated.kdf.memorySize).toBe(NEW_MEMORY_KIB);
    expect(vaultNeedsRekey(migrated)).toBe(false);
    expect(await decryptVault(migrated, PASSWORD)).toBe(SECRET);
  });
});
