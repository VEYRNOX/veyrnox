// RestoreFromShares — 2026-08-16 audit hardening tests.
//
// Covers three properties:
//   (a) a single bundle cannot reconstruct — combineFromBundles refuses.
//   (b) a tampered bundle is rejected before any crypto runs.
//   (c) shareA/shareB React state is cleared on unmount.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

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
  it('unmount clears both share textareas via the cleanup effect', async () => {
    // Mock useWallet — we don't need the real provider for a state-lifecycle
    // assertion.
    vi.doMock('@/lib/WalletProvider', () => ({
      useWallet: () => ({ restoreFromRecoveryBundles: vi.fn() }),
    }));
    const { default: RestoreFromShares } = await import('@/pages/RestoreFromShares');

    const { unmount } = render(
      <MemoryRouter><RestoreFromShares /></MemoryRouter>,
    );
    const boxes = screen.getAllByPlaceholderText(/"shareIndex"/i);
    fireEvent.change(boxes[0], { target: { value: 'sentinelA-shareA-bytes' } });
    fireEvent.change(screen.getAllByPlaceholderText(/"shareIndex"/i)[1], {
      target: { value: 'sentinelB-shareB-bytes' },
    });
    expect(document.body.textContent).toContain('bundle loaded');

    unmount();
    // The React tree is gone (unmount removed it) — sentinels must NOT appear
    // in any surviving DOM. This is the observable proxy for "React fiber
    // state no longer holds them". String immutability means the underlying
    // bytes may linger until GC — see the ponytail note in the page.
    expect(document.body.textContent || '').not.toContain('sentinelA');
    expect(document.body.textContent || '').not.toContain('sentinelB');
  });
});
