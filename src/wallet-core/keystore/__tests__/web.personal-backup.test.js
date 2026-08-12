// webKeyStore Personal Backup — round-trip through the real KEK-wrapped
// vault path (createVault → enrollKek → export → restore → unlock).
//
// Purpose: prove the new web.js exportPersonalBackupShares +
// restoreFromPersonalBackupShares methods honour the same fail-closed
// contract as native.js, and produce shares that actually reconstruct the
// DEK that unwraps the on-disk vault.
//
// The hardware factor H is a fixed 32-byte fixture — legitimate because
// WalletProvider passes getHardwareFactor as an opt. On real web this hook
// runs WebAuthn PRF; in tests we hand it a deterministic stub so the crypto
// chain is exercised end-to-end without an authenticator.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

const PIN = '30081977';
const NEW_PIN = '19770830';
const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Deterministic stub H. Same instance each call — real getHardwareFactor is
// device-bound so its output is deterministic across calls for a given salt.
const HF = () => Promise.resolve(new Uint8Array(32).fill(7));
const HF_OPTS = { getHardwareFactor: HF };

describe('webKeyStore — Personal Backup round-trip', () => {
  let webKeyStore;
  let clearVault;

  beforeAll(async () => {
    const { vi } = await import('vitest');
    vi.stubEnv('VITE_ENABLE_PERSONAL_BACKUP_SHARDS', '1');
    vi.resetModules();
    ({ webKeyStore } = await import('../web.js'));
    ({ clearVault } = await import('../../evm/vaultStore.js'));
  });

  beforeEach(async () => {
    await clearVault();
  });

  it('exportPersonalBackupShares → 3 shares that combine back to unlock the vault, and restoreFromPersonalBackupShares lets a new PIN unlock', async () => {
    // Onboard: fresh vault under the wallet PIN.
    await webKeyStore.createVault(MNEMONIC, PIN);
    // Enroll KEK — turns the vault into a kek-dek blob with kekWrap/kekSalt.
    await webKeyStore.enrollKek(PIN, HF_OPTS);
    // Sanity: unlock under the original PIN + H returns the mnemonic.
    expect(await webKeyStore.unlock(PIN, HF_OPTS)).toBe(MNEMONIC);

    // Export 3 shares.
    const shares = await webKeyStore.exportPersonalBackupShares(PIN, HF_OPTS);
    expect(shares).toHaveLength(3);
    for (const s of shares) expect(s.length).toBe(88);

    // Restore with 2 of 3 (skip middle → prove 2-of-3, not 1+2 only) and a NEW PIN.
    await webKeyStore.restoreFromPersonalBackupShares(
      [shares[0], shares[2]],
      NEW_PIN,
      HF_OPTS,
    );

    // Old PIN no longer unlocks; new PIN does; seed is unchanged.
    await expect(webKeyStore.unlock(PIN, HF_OPTS)).rejects.toThrow();
    expect(await webKeyStore.unlock(NEW_PIN, HF_OPTS)).toBe(MNEMONIC);
  });

  it('export throws NO_HARDWARE_FACTOR on a non-KEK vault (bare createVault)', async () => {
    await webKeyStore.createVault(MNEMONIC, PIN);
    // No enrollKek — vault has no kekWrap.
    await expect(
      webKeyStore.exportPersonalBackupShares(PIN, HF_OPTS),
    ).rejects.toThrow(/NO_HARDWARE_FACTOR/);
  });

  it('export throws NO_HARDWARE_FACTOR when getHardwareFactor is missing', async () => {
    await webKeyStore.createVault(MNEMONIC, PIN);
    await webKeyStore.enrollKek(PIN, HF_OPTS);
    await expect(
      webKeyStore.exportPersonalBackupShares(PIN, {}),
    ).rejects.toThrow(/NO_HARDWARE_FACTOR/);
  });

  it('restore rejects 1-of-3 (combine requires ≥2)', async () => {
    await webKeyStore.createVault(MNEMONIC, PIN);
    await webKeyStore.enrollKek(PIN, HF_OPTS);
    const shares = await webKeyStore.exportPersonalBackupShares(PIN, HF_OPTS);
    await expect(
      webKeyStore.restoreFromPersonalBackupShares(
        [shares[0]],
        NEW_PIN,
        HF_OPTS,
      ),
    ).rejects.toThrow();
  });

  it('restore fails closed when shares are from a different vault (AES-GCM tag rejects wrong DEK)', async () => {
    // Vault A: export shares.
    await webKeyStore.createVault(MNEMONIC, PIN);
    await webKeyStore.enrollKek(PIN, HF_OPTS);
    const foreignShares = await webKeyStore.exportPersonalBackupShares(PIN, HF_OPTS);

    // Vault B: fresh, different seed under the SAME PIN + H.
    await clearVault();
    const otherMnemonic =
      'legal winner thank year wave sausage worth useful legal winner thank yellow';
    await webKeyStore.createVault(otherMnemonic, PIN);
    await webKeyStore.enrollKek(PIN, HF_OPTS);

    // Restoring vault B with vault A's shares must throw — the combined DEK
    // will not decrypt vault B's ciphertext. The vault must remain openable
    // under its ORIGINAL PIN.
    await expect(
      webKeyStore.restoreFromPersonalBackupShares(
        [foreignShares[0], foreignShares[1]],
        NEW_PIN,
        HF_OPTS,
      ),
    ).rejects.toThrow();
    expect(await webKeyStore.unlock(PIN, HF_OPTS)).toBe(otherMnemonic);
  });
});
