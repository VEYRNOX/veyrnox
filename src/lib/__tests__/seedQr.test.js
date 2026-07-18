// src/lib/__tests__/seedQr.test.js
//
// B1 ("no silent restore failure") is the centerpiece: a created backup MUST
// round-trip to the exact mnemonic before anyone is told it worked. Also covers
// B2/B3 (wrong password / tamper rejected) and the B7 format check.
import { describe, it, expect, beforeAll } from 'vitest';
import {
  encryptSeedBackup,
  decryptSeedBackup,
  artifactToImageData,
  decodeArtifactQr,
} from '@/lib/seedQr';

// Trezor BIP-39 test vectors (12 & 24 words). Slice 1 is crypto+encoding only —
// it does not validate BIP-39, so these just need to be stable strings.
const MN12 = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const MN24 = 'letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic bless';
const PW = 'correct horse battery staple T3st!';

// Argon2id @64 MiB is ~0.5-1s per derivation; encrypt ONCE per mnemonic and reuse.
let art12, art24;
beforeAll(async () => {
  art12 = await encryptSeedBackup(MN12, PW);
  art24 = await encryptSeedBackup(MN24, PW);
}, 60000);

function flipFirstChar(s) {
  const repl = s[0] === 'A' ? 'B' : 'A';
  return repl + s.slice(1);
}

describe('seedQr artifact seam', () => {
  it('produces a versioned, self-describing artifact (B7)', () => {
    expect(art12).toMatchObject({ fmt: 'veyrnox-seed-backup', v: 1 });
    expect(art12.blob).toMatchObject({ v: 2, kdf: { name: 'argon2id' } });
  });

  it('B1: round-trips a 12-word mnemonic (encrypt -> QR -> decode -> decrypt)', async () => {
    const decoded = decodeArtifactQr(artifactToImageData(art12));
    expect(decoded).not.toBeNull();
    expect(await decryptSeedBackup(decoded, PW)).toBe(MN12);
  });

  it('B1: round-trips a 24-word mnemonic', async () => {
    const decoded = decodeArtifactQr(artifactToImageData(art24));
    expect(decoded).not.toBeNull();
    expect(await decryptSeedBackup(decoded, PW)).toBe(MN24);
  });

  it('B2/B3: a wrong password is rejected', async () => {
    await expect(decryptSeedBackup(art12, 'the wrong password')).rejects.toThrow();
  });

  it('B3: a tampered ciphertext is rejected', async () => {
    const tampered = { ...art12, blob: { ...art12.blob, ct: flipFirstChar(art12.blob.ct) } };
    await expect(decryptSeedBackup(tampered, PW)).rejects.toThrow();
  });

  it('rejects a non-Veyrnox artifact (B7 format check)', async () => {
    await expect(decryptSeedBackup({ fmt: 'other', v: 1, blob: art12.blob }, PW)).rejects.toThrow('Not a Veyrnox');
  });

  it('uses fresh CSPRNG salt/iv per encryption (no nonce reuse)', () => {
    expect(art12.blob.salt).not.toBe(art24.blob.salt);
    expect(art12.blob.iv).not.toBe(art24.blob.iv);
  });

  it('decodeArtifactQr returns null for a non-Veyrnox QR', () => {
    const foreign = artifactToImageData({ fmt: 'not-veyrnox', v: 1, blob: { hello: 'world' } });
    expect(decodeArtifactQr(foreign)).toBeNull();
  });

  it('decodeArtifactQr returns null for garbage image data', () => {
    expect(decodeArtifactQr({ data: new Uint8ClampedArray(64 * 64 * 4).fill(255), width: 64, height: 64 })).toBeNull();
  });
});
