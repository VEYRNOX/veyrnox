// recoveryShare.js — passphrase-encrypted envelope for a whole recovery
// BUNDLE (Codex P1 fix: PersonalBackup.jsx runSplit wired encryptOne into the
// UI but never used it — bundle #2 was always saved raw). Mirrors
// recoveryShare.test.js's share-wrap coverage but for arbitrary bundle bytes
// under a DISTINCT envelope type so the two are never cross-parseable.

import { describe, it, expect, beforeAll } from 'vitest';
import { SHARE_SIZE } from '../shamir.js';

function bundleBytes(marker = 'RAWMARKER123==') {
  const fake = JSON.stringify({
    v: 1,
    shareIndex: 2,
    shareBytes: marker,
    vault: { ct: 'x', salt: 'y', iv: 'z', kdf: {} },
    vaultHash: 'deadbeef',
    meta: { createdAt: '2026-01-01T00:00:00.000Z' },
  });
  return new TextEncoder().encode(fake);
}

describe('recoveryShare — bundle-wrap gate defaults off', () => {
  it('wrapBundleWithPassphrase throws RECOVERY_SHARE_DISABLED when flag off', async () => {
    const mod = await import('../recoveryShare.js');
    await expect(
      mod.wrapBundleWithPassphrase(bundleBytes(), 'a-16-char-passphrase', 2),
    ).rejects.toThrow(mod.RECOVERY_SHARE_DISABLED);
  });

  it('unwrapBundleWithPassphrase throws RECOVERY_SHARE_DISABLED when flag off', async () => {
    const mod = await import('../recoveryShare.js');
    await expect(
      mod.unwrapBundleWithPassphrase({}, 'a-16-char-passphrase'),
    ).rejects.toThrow(mod.RECOVERY_SHARE_DISABLED);
  });
});

describe('recoveryShare — bundle-wrap behaviour under flag stubbed on', () => {
  let mod;
  let envelope;
  const plaintext = bundleBytes();
  const passphrase = 'correct-horse-battery-staple';

  beforeAll(async () => {
    const { vi } = await import('vitest');
    vi.stubEnv('VITE_ENABLE_PERSONAL_BACKUP_SHARDS', '1');
    vi.resetModules();
    mod = await import('../recoveryShare.js');
    envelope = await mod.wrapBundleWithPassphrase(plaintext, passphrase, 2);
  }, 60_000);

  it('wrap produces a JSON envelope with a DISTINCT type from the share envelope', () => {
    const obj = JSON.parse(envelope);
    expect(obj.app).toBe('veyrnox');
    expect(obj.type).toBe('recovery-bundle-v1');
    expect(obj.type).not.toBe('recovery-share');
    expect(obj.shareIndex).toBe(2);
    expect(obj.kdf.memorySize).toBe(196608);
    expect(typeof obj.salt).toBe('string');
    expect(typeof obj.iv).toBe('string');
    expect(typeof obj.ct).toBe('string');
    // The envelope must not carry the plaintext bundle's own fields in the
    // clear — that would defeat the point of the wrap.
    expect(obj.shareBytes).toBeUndefined();
    expect(obj.vault).toBeUndefined();
  });

  it('round-trip: unwrap with the correct passphrase reproduces the exact bundle bytes', async () => {
    const back = await mod.unwrapBundleWithPassphrase(envelope, passphrase);
    expect(back).toEqual(plaintext);
    expect(new TextDecoder().decode(back)).toContain('RAWMARKER123==');
  }, 60_000);

  it('accepts either a JSON string or a pre-parsed object', async () => {
    const back = await mod.unwrapBundleWithPassphrase(JSON.parse(envelope), passphrase);
    expect(back).toEqual(plaintext);
  }, 60_000);

  it('wrong passphrase fails with RECOVERY_SHARE_UNWRAP_FAILED (no oracle) — never returns plaintext', async () => {
    await expect(
      mod.unwrapBundleWithPassphrase(envelope, 'wrong-but-long-enough-passphrase'),
    ).rejects.toThrow(mod.RECOVERY_SHARE_UNWRAP_FAILED);
  }, 60_000);

  it('flipped ct byte fails to decrypt', async () => {
    const obj = JSON.parse(envelope);
    const ctBytes = Uint8Array.from(atob(obj.ct), (c) => c.charCodeAt(0));
    ctBytes[0] ^= 0xff;
    obj.ct = btoa(String.fromCharCode(...ctBytes));
    await expect(
      mod.unwrapBundleWithPassphrase(obj, passphrase),
    ).rejects.toThrow(mod.RECOVERY_SHARE_UNWRAP_FAILED);
  }, 60_000);

  it('flipped shareIndex in the header is detected by AAD binding', async () => {
    const obj = JSON.parse(envelope);
    obj.shareIndex = 3;
    await expect(
      mod.unwrapBundleWithPassphrase(obj, passphrase),
    ).rejects.toThrow(mod.RECOVERY_SHARE_UNWRAP_FAILED);
  }, 60_000);

  it('Argon2id params not matching KDF_PARAMS are rejected', async () => {
    const obj = JSON.parse(envelope);
    obj.kdf.memorySize = 999_999_999;
    await expect(
      mod.unwrapBundleWithPassphrase(obj, passphrase),
    ).rejects.toThrow(mod.RECOVERY_SHARE_MALFORMED);
  });

  it('a bundle-unwrap rejects a SHARE-type envelope (recovery-share)', async () => {
    const rawShare = new Uint8Array(SHARE_SIZE);
    crypto.getRandomValues(rawShare);
    rawShare[0] = 0x02;
    const shareEnvelope = await mod.wrapShareWithPassphrase(rawShare, passphrase, 2);
    await expect(
      mod.unwrapBundleWithPassphrase(shareEnvelope, passphrase),
    ).rejects.toThrow(mod.RECOVERY_SHARE_MALFORMED);
  }, 60_000);

  it('a share-unwrap rejects a BUNDLE-type envelope (recovery-bundle-v1)', async () => {
    await expect(
      mod.unwrapShareWithPassphrase(envelope, passphrase),
    ).rejects.toThrow(mod.RECOVERY_SHARE_MALFORMED);
  });
});
