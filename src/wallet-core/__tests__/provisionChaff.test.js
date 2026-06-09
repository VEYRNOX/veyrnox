// Tests for provisionDeniabilityChaff(): always-provision both deniability slots
// with chaff that is STRUCTURALLY INDISTINGUISHABLE from a personalized blob, via
// the identical encryptVault path. Runs against real crypto (vault.js) + fake IDB.
import { describe, it, expect, beforeEach } from 'vitest';
import { provisionDeniabilityChaff } from '../provisionChaff.js';
import { hasDuressVault, setDuressVault, tryDuressUnlock } from '../duress.js';
import { hasPanicVault, setPanicVault, tryPanicUnlock } from '../panic.js';
import { generateMnemonic } from '../mnemonic.js';
import { KDF_PARAMS } from '../vault.js';
import { clearVault } from '../evm/vaultStore.js';
import { panicWipeLocal } from '../panic.js';

function unb64(str) {
  const s = atob(str); const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
function getBlob(key) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('veyrnox-vault', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault');
    };
    req.onsuccess = () => {
      const db = req.result;
      const r = db.transaction('vault', 'readonly').objectStore('vault').get(key);
      r.onsuccess = () => { db.close(); resolve(r.result ?? null); };
      r.onerror = () => { db.close(); reject(r.error); };
    };
    req.onerror = () => reject(req.error);
  });
}

describe('provisionDeniabilityChaff', () => {
  beforeEach(async () => {
    try { await clearVault(); } catch { /* noop */ }
    try { await panicWipeLocal(); } catch { /* noop */ }
  });

  it('provisions both slots (secondary + tertiary present)', async () => {
    expect(await hasDuressVault()).toBe(false);
    expect(await hasPanicVault()).toBe(false);
    await provisionDeniabilityChaff();
    expect(await hasDuressVault()).toBe(true);
    expect(await hasPanicVault()).toBe(true);
  });

  it('chaff blobs are STRUCTURALLY indistinguishable from personalized blobs', async () => {
    // Device A: simple onboarding (chaff only).
    await provisionDeniabilityChaff();
    const chaffDuress = await getBlob('secondary');
    const chaffPanic = await getBlob('tertiary');

    // Device B: a user later personalized both slots (real credentials).
    await setDuressVault(generateMnemonic(128), 'real-duress-1357');
    await setPanicVault('burn-everything-0000');
    const realDuress = await getBlob('secondary');
    const realPanic = await getBlob('tertiary');

    for (const [chaff, real] of [[chaffDuress, realDuress], [chaffPanic, realPanic]]) {
      // Same field set — no extra marker on chaff.
      expect(Object.keys(chaff).sort()).toEqual(Object.keys(real).sort());
      // Same KDF params (the timing/forensic-relevant fields), equal to KDF_PARAMS.
      expect(chaff.kdf).toEqual(real.kdf);
      expect(chaff.kdf).toEqual({ name: 'argon2id', ...KDF_PARAMS });
      // Same salt/iv byte-lengths as a real vault (16 / 12).
      expect(unb64(chaff.salt).length).toBe(unb64(real.salt).length);
      expect(unb64(chaff.iv).length).toBe(unb64(real.iv).length);
      expect(unb64(chaff.salt).length).toBe(16);
      expect(unb64(chaff.iv).length).toBe(12);
      // ct is a real AES-GCM ciphertext of a 12-word mnemonic (tag + plaintext).
      // Byte-exact ct length legitimately varies by mnemonic CONTENT for BOTH
      // chaff and personalized blobs, so that variance is itself non-distinguishing;
      // we assert it is a non-empty ciphertext, not an exact length.
      expect(unb64(chaff.ct).length).toBeGreaterThan(16);
    }
  });

  it('is idempotent and NEVER overwrites a personalized blob', async () => {
    // Personalize first, then a later chaff pass must not clobber it.
    await setDuressVault(generateMnemonic(128), 'real-duress-1357');
    await setPanicVault('burn-everything-0000');
    const before = { d: await getBlob('secondary'), p: await getBlob('tertiary') };

    await provisionDeniabilityChaff(); // slots already filled → no-op

    expect(await getBlob('secondary')).toEqual(before.d);
    expect(await getBlob('tertiary')).toEqual(before.p);
    // Personalized credentials still open their slots.
    expect(await tryDuressUnlock('real-duress-1357')).not.toBeNull();
    expect(await tryPanicUnlock('burn-everything-0000')).toBe(true);
  });

  it('backfills only the missing slot', async () => {
    await setDuressVault(generateMnemonic(128), 'real-duress-1357'); // only duress set
    const realDuress = await getBlob('secondary');
    expect(await hasPanicVault()).toBe(false);

    await provisionDeniabilityChaff();

    expect(await getBlob('secondary')).toEqual(realDuress); // untouched
    expect(await hasPanicVault()).toBe(true);               // backfilled
  });

  it('chaff slots are not openable by guessable passwords (throwaway pw is unrecoverable)', async () => {
    await provisionDeniabilityChaff();
    // The chaff blobs exist...
    expect(await hasDuressVault()).toBe(true);
    expect(await hasPanicVault()).toBe(true);
    // ...but no guessable PIN opens them — they are pure unrecoverable chaff.
    expect(await tryDuressUnlock('')).toBeNull();
    expect(await tryDuressUnlock('000000')).toBeNull();
    expect(await tryDuressUnlock('123456')).toBeNull();
    expect(await tryPanicUnlock('')).toBe(false);
    expect(await tryPanicUnlock('000000')).toBe(false);
    expect(await tryPanicUnlock('123456')).toBe(false);
  });
});
