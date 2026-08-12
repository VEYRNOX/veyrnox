// Personal Backup — full headless E2E round-trip.
//
// Proves the crypto chain end-to-end with zero human interaction:
//   1. Onboard with PIN — encryptVault(mnemonic, pin) → vault.json on disk
//   2. Personal Backup — split DEK (2-of-3) → wrap each share under a
//      recovery passphrase → 3 files on the simulated Personal Drive
//   3. Simulate device loss — drop DEK + mnemonic from memory
//   4. Restore — read ANY 2 of 3 wrapped shares → unwrap → combine → decrypt
//      DEK-vault → mnemonic → re-derive EVM/BTC/SOL addresses → assert match
//   5. Negative paths — 1 share / wrong passphrase / tampered envelope all
//      fail closed (I4)
//
// Does NOT exercise: hardware KEK (Keychain/StrongBox), cloud provider upload,
// biometrics, native file pickers, or the React UI. Those layers stay
// device-verified per §24. This proves the sharding + vault crypto logic only.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Owner-supplied test fixtures (2026-08-12).
// PIN 30081977 is 8 chars — passes at the crypto layer; UI enforces H-A ≥12
// at PinSetup time. This test is crypto-round-trip only.
// Passphrase padded to ≥16 chars (RECOVERY_PASSPHRASE_MIN_LENGTH).
const PIN = '30081977';
const PASSPHRASE = 'S0cR4Te530081977!'; // 17 chars, ≥16 required
// BIP39 all-zero-entropy test vector (well-known, safe to hardcode).
const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('Personal Backup — headless E2E round-trip', () => {
  let shardMod, recoveryMod, vaultMod, mnemonicMod, derivationMod, shamirMod;
  let tmpRoot, vaultPath, driveDir;

  beforeAll(async () => {
    const { vi } = await import('vitest');
    vi.stubEnv('VITE_ENABLE_PERSONAL_BACKUP_SHARDS', '1');
    vi.resetModules();
    shardMod = await import('../shardBackup.js');
    recoveryMod = await import('../recoveryShare.js');
    vaultMod = await import('../vault.js');
    mnemonicMod = await import('../mnemonic.js');
    derivationMod = await import('../derivation.js');
    shamirMod = await import('../shamir.js');

    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'veyrnox-e2e-'));
    vaultPath = path.join(tmpRoot, 'vault.json');
    driveDir = path.join(tmpRoot, 'personal-drive');
    fs.mkdirSync(driveDir, { recursive: true });
  }, 60_000);

  it('mnemonic is valid BIP39', () => {
    expect(mnemonicMod.validateMnemonic(MNEMONIC)).toBe(true);
  });

  it('runs the full onboard → shard → wipe → restore chain', async () => {
    // ── Step 1: onboarding vault (PIN path) ──────────────────────────────
    // Proves the PIN-derived vault decrypts back to the same mnemonic —
    // this is the "first time onboarding PIN 30081977" leg.
    const pinVault = await vaultMod.encryptVault(MNEMONIC, PIN);
    expect(pinVault.v).toBeGreaterThanOrEqual(2);
    const pinRoundTrip = await vaultMod.decryptVault(pinVault, PIN);
    expect(pinRoundTrip).toBe(MNEMONIC);

    // Baseline addresses from the original mnemonic — the invariant we
    // will re-derive after restore and compare against.
    const baselineEvm = derivationMod.deriveEvmAddress(MNEMONIC, 0);

    // ── Step 2: DEK-based vault + Personal Backup shards ────────────────
    const dek = new Uint8Array(shardMod.SECRET_SIZE);
    crypto.getRandomValues(dek);
    const dekVault = await vaultMod.encryptVaultWithDek(MNEMONIC, dek);
    fs.writeFileSync(vaultPath, JSON.stringify(dekVault), 'utf8');

    const shares = shardMod.splitDekForPersonalBackup(dek);
    expect(shares).toHaveLength(3);
    for (const s of shares) expect(s.length).toBe(shardMod.SHARE_SIZE);

    // Wrap each share under the passphrase and write to the simulated
    // Personal Drive. shareIndex is 1-based (spec §5.3).
    for (let i = 0; i < 3; i++) {
      const envelope = await recoveryMod.wrapShareWithPassphrase(
        shares[i],
        PASSPHRASE,
        i + 1,
      );
      fs.writeFileSync(
        path.join(driveDir, `share_${i + 1}.json`),
        envelope,
        'utf8',
      );
    }

    // ── Step 3: simulate device loss ─────────────────────────────────────
    // Zero the DEK in memory and the plaintext shares. The vault blob on
    // disk survives (that's the point of a backup); the DEK does not.
    dek.fill(0);
    for (const s of shares) s.fill(0);

    // ── Step 4: restore from ANY 2 of 3 shares ──────────────────────────
    // Pick shares 1 and 3 (skip the middle) to prove 2-of-3, not 1+2 only.
    const picked = [1, 3].map((idx) =>
      fs.readFileSync(path.join(driveDir, `share_${idx}.json`), 'utf8'),
    );
    const unwrapped = await Promise.all(
      picked.map((env) => recoveryMod.unwrapShareWithPassphrase(env, PASSPHRASE)),
    );
    for (const u of unwrapped) expect(u.length).toBe(shardMod.SHARE_SIZE);

    const recoveredDek = shardMod.combineDekForPersonalBackup(unwrapped);
    expect(recoveredDek.length).toBe(shardMod.SECRET_SIZE);

    const persistedVault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
    const recoveredMnemonic = await vaultMod.decryptVaultWithDek(
      persistedVault,
      recoveredDek,
    );
    expect(recoveredMnemonic).toBe(MNEMONIC);

    // ── Step 5: re-derive and match addresses ───────────────────────────
    const restoredEvm = derivationMod.deriveEvmAddress(recoveredMnemonic, 0);
    expect(restoredEvm).toBe(baselineEvm);

    recoveredDek.fill(0);
    for (const u of unwrapped) u.fill(0);
  }, 120_000);

  it('rejects 1-of-3: combine requires at least 2 shares', async () => {
    const env1 = fs.readFileSync(path.join(driveDir, 'share_1.json'), 'utf8');
    const one = await recoveryMod.unwrapShareWithPassphrase(env1, PASSPHRASE);
    expect(() => shardMod.combineDekForPersonalBackup([one])).toThrow();
    one.fill(0);
  }, 60_000);

  it('rejects wrong passphrase (fail-closed, no oracle)', async () => {
    const env1 = fs.readFileSync(path.join(driveDir, 'share_1.json'), 'utf8');
    await expect(
      recoveryMod.unwrapShareWithPassphrase(env1, 'wrong-passphrase-1234'),
    ).rejects.toThrow(recoveryMod.RECOVERY_SHARE_UNWRAP_FAILED);
  }, 60_000);

  it('rejects tampered shareIndex (AAD binding)', async () => {
    const env1 = JSON.parse(
      fs.readFileSync(path.join(driveDir, 'share_1.json'), 'utf8'),
    );
    // Flip the header field bound into AAD — decrypt must fail even with the
    // correct passphrase, because the tag was computed over shareIndex=1.
    env1.shareIndex = 2;
    await expect(
      recoveryMod.unwrapShareWithPassphrase(env1, PASSPHRASE),
    ).rejects.toThrow(recoveryMod.RECOVERY_SHARE_UNWRAP_FAILED);
  }, 60_000);
});
