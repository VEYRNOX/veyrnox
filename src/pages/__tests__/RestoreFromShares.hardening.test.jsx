// RestoreFromShares — 2026-08-16 audit hardening tests.
//
// Covers three properties:
//   (a) a single bundle cannot reconstruct — combineFromBundles refuses.
//   (b) a tampered bundle is rejected before any crypto runs.
//   (c) shareA/shareB React state is cleared on unmount.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Public BIP-39 test vector — never a user secret.
const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

let shardBackup;
let encryptVaultWithDek;
let multiVault;
let bundleOne;
let bundleTwo;
let goodDek;

beforeEach(async () => {
  vi.stubEnv('VITE_ENABLE_PERSONAL_BACKUP_SHARDS', '1');
  vi.resetModules();
  shardBackup = await import('@/wallet-core/shardBackup.js');
  ({ encryptVaultWithDek } = await import('@/wallet-core/vault.js'));
  multiVault = await import('@/wallet-core/multiVault.js');

  goodDek = new Uint8Array(shardBackup.SECRET_SIZE).fill(0x5a);
  const { container } = multiVault.migrateLegacyMnemonic(MNEMONIC);
  const dekEncryptedVault = await encryptVaultWithDek(
    multiVault.serializeContainer(container),
    goodDek,
  );
  const encryptedVault = { ...dekEncryptedVault, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' };
  const shares = shardBackup.splitDekForPersonalBackup(goodDek);
  bundleOne = JSON.stringify(shardBackup.encodeShareBundle(shares[0], 1, encryptedVault));
  bundleTwo = JSON.stringify(shardBackup.encodeShareBundle(shares[1], 2, encryptedVault));
  for (const s of shares) s.fill(0);
}, 30_000);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  cleanup();
});

describe('shardBackup — 1 bundle cannot reconstruct (2026-08-16 audit)', () => {
  it('combineFromBundles refuses a single bundle', () => {
    expect(() => shardBackup.combineFromBundles([bundleOne]))
      .toThrow(shardBackup.SHARD_BUNDLE_INVALID);
  });

  it('combineFromBundles refuses two copies of the SAME bundle (same-index)', () => {
    expect(() => shardBackup.combineFromBundles([bundleOne, bundleOne]))
      .toThrow(shardBackup.SHARD_BUNDLE_MISMATCH);
  });
});

describe('shardBackup — tampered bundle rejected (2026-08-16 audit)', () => {
  it('rejects a bundle whose vaultHash has been altered', () => {
    const obj = JSON.parse(bundleOne);
    obj.vaultHash = '0'.repeat(64); // valid hex, wrong value
    const tampered = JSON.stringify(obj);
    expect(() => shardBackup.combineFromBundles([tampered, bundleTwo]))
      .toThrow(shardBackup.SHARD_BUNDLE_MISMATCH);
  });

  it('rejects a bundle whose vault ciphertext has been mutated (hash mismatch)', () => {
    const obj = JSON.parse(bundleOne);
    obj.vault.ct = obj.vault.ct.split('').reverse().join('');
    const tampered = JSON.stringify(obj);
    expect(() => shardBackup.combineFromBundles([tampered, bundleTwo]))
      .toThrow(shardBackup.SHARD_BUNDLE_MISMATCH);
  });
});

describe('RestoreFromShares — shareA/shareB state cleared on unmount (2026-08-16 audit)', () => {
  // Round 4 (2026-08-16) audit: the previous version asserted
  // `document.body.textContent` after `unmount()` — always empty, so it proved
  // nothing (test theater). The obvious rewrite (wrap React.useState via
  // vi.spyOn to observe setter calls) is blocked by "Cannot spy on export
  // 'useState'. Module namespace is not configurable in ESM." Vitest ESM
  // limitation. `vi.mock('react', ...)` risks breaking React's internal hook
  // dispatcher for the render itself.
  //
  // The cleanup effect in RestoreFromShares.jsx is 6 straight-line setters
  // covered by code review; skip until we adopt a browser mode or a react
  // internals shim that lets us observe the setter calls honestly. Do NOT
  // reinstate the textContent-after-unmount assertion.
  it.skip('unmount clears both share textareas via the cleanup effect (see r4 audit skip note)', () => {});
});
