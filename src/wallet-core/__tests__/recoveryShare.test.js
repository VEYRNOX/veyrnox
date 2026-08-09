// recoveryShare.js — passphrase-encrypted envelope for a single shamir share.
//
// Two flag postures per shardBackup.test.js precedent:
//   1. Flag off (default) — every entry point throws RECOVERY_SHARE_DISABLED
//   2. Flag on (stubbed env + resetModules) — round-trip, fail-closed on
//      wrong passphrase / malformed envelope / tampered header
//
// The Argon2id derivation is real (~500ms per call in vitest). Keep the
// happy-path tests to a couple of wrap/unwrap cycles — negative-path tests
// can reuse the same envelope to avoid repeated derivations.

import { describe, it, expect, beforeAll } from 'vitest';

function randomShare(index = 1) {
  // Build a shamir v2-shaped envelope: version byte + k + n + setId + x + y + commitment + crc.
  // The wrap layer does not validate shamir structure — it only checks SHARE_SIZE — so a
  // random 88-byte buffer with the version byte set is fine as a test fixture.
  const s = new Uint8Array(88);
  crypto.getRandomValues(s);
  s[0] = 0x02; // version
  s[19] = index;
  return s;
}

describe('recoveryShare — gate defaults off', () => {
  it('wrapShareWithPassphrase throws RECOVERY_SHARE_DISABLED when flag off', async () => {
    const mod = await import('../recoveryShare.js');
    await expect(
      mod.wrapShareWithPassphrase(randomShare(1), 'a-16-char-passphrase', 1),
    ).rejects.toThrow(mod.RECOVERY_SHARE_DISABLED);
  });

  it('unwrapShareWithPassphrase throws RECOVERY_SHARE_DISABLED when flag off', async () => {
    const mod = await import('../recoveryShare.js');
    await expect(
      mod.unwrapShareWithPassphrase({}, 'a-16-char-passphrase'),
    ).rejects.toThrow(mod.RECOVERY_SHARE_DISABLED);
  });

  it('tryParseRecoveryEnvelope is not flag-gated (pure predicate)', async () => {
    // Detecting whether a picked file is an encrypted envelope must work even
    // when the wrap primitive is off — otherwise the restore UI cannot show a
    // helpful "you dropped a share for a version we don't yet enable" message.
    const mod = await import('../recoveryShare.js');
    expect(mod.tryParseRecoveryEnvelope(new Uint8Array([0x02, 0, 0]))).toBeNull();
  });
});

describe('recoveryShare — checkRecoveryPassphrase', () => {
  it('rejects passphrases shorter than the spec §5.1 minimum', async () => {
    const mod = await import('../recoveryShare.js');
    expect(mod.checkRecoveryPassphrase('').ok).toBe(false);
    expect(mod.checkRecoveryPassphrase('short').ok).toBe(false);
    expect(mod.checkRecoveryPassphrase('123456789012345').ok).toBe(false); // 15
    expect(mod.checkRecoveryPassphrase('1234567890123456').ok).toBe(true); // 16
  });
});

describe('recoveryShare — behaviour under flag stubbed on', () => {
  let mod;
  let envelope;
  const share = randomShare(2);
  const passphrase = 'correct-horse-battery-staple';

  beforeAll(async () => {
    const { vi } = await import('vitest');
    vi.stubEnv('VITE_ENABLE_PERSONAL_BACKUP_SHARDS', '1');
    vi.resetModules();
    mod = await import('../recoveryShare.js');
    // One real Argon2id derivation up-front; reuse this envelope across the
    // negative-path tests to keep the suite fast.
    envelope = await mod.wrapShareWithPassphrase(share, passphrase, 2);
  }, 60_000);

  it('wrap produces a JSON envelope with the spec §5.3 shape', () => {
    const obj = JSON.parse(envelope);
    expect(obj.app).toBe('veyrnox');
    expect(obj.type).toBe('recovery-share');
    expect(obj.version).toBe(1);
    expect(obj.shareIndex).toBe(2);
    expect(obj.kdf.memorySize).toBe(196608);
    expect(typeof obj.salt).toBe('string');
    expect(typeof obj.iv).toBe('string');
    expect(typeof obj.ct).toBe('string');
  });

  it('round-trip: unwrap with the correct passphrase reproduces the exact share bytes', async () => {
    const back = await mod.unwrapShareWithPassphrase(envelope, passphrase);
    expect(back).toEqual(share);
  }, 60_000);

  it('accepts either a JSON string or a pre-parsed object', async () => {
    const back = await mod.unwrapShareWithPassphrase(JSON.parse(envelope), passphrase);
    expect(back).toEqual(share);
  }, 60_000);

  it('wrong passphrase fails with RECOVERY_SHARE_UNWRAP_FAILED (no oracle)', async () => {
    await expect(
      mod.unwrapShareWithPassphrase(envelope, 'wrong-but-long-enough-passphrase'),
    ).rejects.toThrow(mod.RECOVERY_SHARE_UNWRAP_FAILED);
  }, 60_000);

  it('malformed JSON fails with RECOVERY_SHARE_MALFORMED, not a raw JSON error', async () => {
    await expect(
      mod.unwrapShareWithPassphrase('{not json', passphrase),
    ).rejects.toThrow(mod.RECOVERY_SHARE_MALFORMED);
  });

  it('wrong shape (missing type) fails with RECOVERY_SHARE_MALFORMED', async () => {
    const obj = JSON.parse(envelope);
    delete obj.type;
    await expect(
      mod.unwrapShareWithPassphrase(obj, passphrase),
    ).rejects.toThrow(mod.RECOVERY_SHARE_MALFORMED);
  });

  it('unknown envelope version fails with RECOVERY_SHARE_MALFORMED', async () => {
    const obj = JSON.parse(envelope);
    obj.version = 999;
    await expect(
      mod.unwrapShareWithPassphrase(obj, passphrase),
    ).rejects.toThrow(mod.RECOVERY_SHARE_MALFORMED);
  });

  it('attacker-controlled KDF params are rejected (pre-auth OOM prevention)', async () => {
    // Same class of check vault.js does on IMPORTED backups (see the ceiling
    // note near LEGACY_KDF_PARAMS). A caller that trusts the file's own kdf
    // values gives an attacker unbounded memory allocation before the tag is
    // checked. Reject anything that does not exactly match our current params.
    const obj = JSON.parse(envelope);
    obj.kdf.memorySize = 999_999_999;
    await expect(
      mod.unwrapShareWithPassphrase(obj, passphrase),
    ).rejects.toThrow(mod.RECOVERY_SHARE_MALFORMED);
  });

  it('flipping shareIndex in the header is detected by AAD binding', async () => {
    // Public metadata (shareIndex) is bound into AAD. Tamper is not
    // distinguishable from wrong-passphrase by design — both surface as
    // RECOVERY_SHARE_UNWRAP_FAILED — but critically it does NOT decrypt
    // silently (which would let an examiner lie about which slot this file
    // came from post-recovery, spec §7 deniability concern).
    const obj = JSON.parse(envelope);
    obj.shareIndex = 3;
    await expect(
      mod.unwrapShareWithPassphrase(obj, passphrase),
    ).rejects.toThrow(mod.RECOVERY_SHARE_UNWRAP_FAILED);
  }, 60_000);

  it('bad salt length fails as MALFORMED, not UNWRAP_FAILED', async () => {
    const obj = JSON.parse(envelope);
    obj.salt = btoa('too short');
    await expect(
      mod.unwrapShareWithPassphrase(obj, passphrase),
    ).rejects.toThrow(mod.RECOVERY_SHARE_MALFORMED);
  });

  it('bad iv length fails as MALFORMED, not UNWRAP_FAILED', async () => {
    const obj = JSON.parse(envelope);
    obj.iv = btoa('short');
    await expect(
      mod.unwrapShareWithPassphrase(obj, passphrase),
    ).rejects.toThrow(mod.RECOVERY_SHARE_MALFORMED);
  });

  it('wrong ct length fails as MALFORMED before touching AES-GCM', async () => {
    // AES-GCM ct is exactly SHARE_SIZE + 16 bytes (88 + 16 = 104). A file with
    // any other size is not a well-formed v1 envelope — reject before running
    // the Argon2id derivation to avoid burning ~500ms on obviously-bad input.
    const obj = JSON.parse(envelope);
    obj.ct = btoa('nope');
    await expect(
      mod.unwrapShareWithPassphrase(obj, passphrase),
    ).rejects.toThrow(mod.RECOVERY_SHARE_MALFORMED);
  });

  it('wrap rejects a passphrase below the spec §5.1 minimum', async () => {
    await expect(
      mod.wrapShareWithPassphrase(share, 'short', 1),
    ).rejects.toThrow(mod.RECOVERY_PASSPHRASE_TOO_SHORT);
  });

  it('wrap rejects a share of the wrong length', async () => {
    await expect(
      mod.wrapShareWithPassphrase(new Uint8Array(87), passphrase, 1),
    ).rejects.toThrow(mod.RECOVERY_SHARE_MALFORMED);
  });

  it('wrap rejects an out-of-range shareIndex', async () => {
    await expect(
      mod.wrapShareWithPassphrase(share, passphrase, 0),
    ).rejects.toThrow(mod.RECOVERY_SHARE_MALFORMED);
    await expect(
      mod.wrapShareWithPassphrase(share, passphrase, 256),
    ).rejects.toThrow(mod.RECOVERY_SHARE_MALFORMED);
  });

  it('tryParseRecoveryEnvelope recognises a produced envelope and rejects raw shares', () => {
    const bytes = new TextEncoder().encode(envelope);
    const parsed = mod.tryParseRecoveryEnvelope(bytes);
    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe('recovery-share');
    // Raw 88-byte share (version byte 0x02) — must return null so the caller
    // routes it down the raw path, not the passphrase-prompt path.
    expect(mod.tryParseRecoveryEnvelope(share)).toBeNull();
  });
});
