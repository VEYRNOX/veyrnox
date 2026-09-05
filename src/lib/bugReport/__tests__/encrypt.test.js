import { describe, it, expect } from 'vitest';
import { x25519 } from '@noble/curves/ed25519';
import {
  encrypt,
  decrypt,
  FORMAT_TAG,
  PLACEHOLDER_SUPPORT_PUBLIC_KEY,
} from '../encrypt';

// Slice 1e-1 — sealed-box-equivalent encryption. Pins the crypto contract
// slice 1e-3 will build on. Consumers do not exist yet; tests exercise the
// module directly with generated keypairs so the placeholder-key refuse
// branch stays testable AND the real branch stays covered.
//
// Mutation targets:
//   - placeholder-key refuse dropped → placeholder-key round-trip goes RED
//     (would produce ciphertext no one can decrypt if released)
//   - IV reused across encrypts → determinism test goes RED (envelope
//     ciphertexts must differ for identical plaintext)
//   - HKDF info dropped → NOT tested here (fresh ECDH already varies the
//     shared secret, so cross-envelope decrypt fails regardless of the
//     info binding). The info binding is defense-in-depth against future
//     shared-secret reuse scenarios; keep the comment honest.
//   - format tag mismatch → decrypt goes RED
//
// Note: WebCrypto's SubtleCrypto is required. Vitest's happy-dom + node
// runtimes both provide crypto.subtle; if a future test env doesn't, this
// file will fail loudly rather than silently pass with a stubbed impl.

function makeTestKeypair() {
  const sk = x25519.utils.randomPrivateKey();
  return { sk, pk: x25519.getPublicKey(sk) };
}

const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);

describe('encrypt() — happy path with a real keypair', () => {
  it('produces an envelope with the expected shape', async () => {
    const { pk } = makeTestKeypair();
    const env = await encrypt(enc('hello world'), pk);
    expect(env.v).toBe(FORMAT_TAG);
    expect(env.epk).toBeInstanceOf(Uint8Array);
    expect(env.epk.length).toBe(32);
    expect(env.iv).toBeInstanceOf(Uint8Array);
    expect(env.iv.length).toBe(12);
    expect(env.ct).toBeInstanceOf(Uint8Array);
    // Ciphertext = plaintext len + 16-byte auth tag
    expect(env.ct.length).toBe('hello world'.length + 16);
  });

  it('round-trips through decrypt() with the recipient private key', async () => {
    const { sk, pk } = makeTestKeypair();
    const env = await encrypt(enc('the quick brown fox'), pk);
    const pt = await decrypt(env, sk);
    expect(dec(pt)).toBe('the quick brown fox');
  });

  it('produces different ciphertext on repeated encrypts (fresh IV + fresh epk)', async () => {
    // Mutation defence: reused IV or missing crypto.getRandomValues would
    // yield identical envelopes for identical plaintext — catastrophic in
    // GCM (nonce reuse = key recovery).
    const { pk } = makeTestKeypair();
    const [a, b] = await Promise.all([
      encrypt(enc('same message'), pk),
      encrypt(enc('same message'), pk),
    ]);
    expect(a.iv).not.toEqual(b.iv);
    expect(a.epk).not.toEqual(b.epk);
    expect(a.ct).not.toEqual(b.ct);
  });
});

describe('encrypt() — placeholder-key refuse (I4)', () => {
  it('throws when called with the all-zeros placeholder support key', async () => {
    // Mutation defence: without this refuse, a shipped build with the
    // flag on but the placeholder key still in place would produce
    // ciphertext no one holds the secret for — silent data loss dressed
    // as success. Slice 3 replaces the placeholder AND the flag flip in
    // the same commit; this refuse is the belt-and-braces if that
    // ordering is ever broken.
    await expect(encrypt(enc('hi'), PLACEHOLDER_SUPPORT_PUBLIC_KEY))
      .rejects.toThrow(/PLACEHOLDER_KEY/);
  });

  it('the placeholder constant IS all zeros', () => {
    // Belt-and-braces: if the placeholder is ever accidentally overwritten
    // with a REAL public key here (e.g. a "quick test" commit), the refuse
    // above stops firing on placeholder AND every real ephemeral message
    // gets sent to whoever holds THAT key. Pin the constant.
    expect(PLACEHOLDER_SUPPORT_PUBLIC_KEY.length).toBe(32);
    expect(PLACEHOLDER_SUPPORT_PUBLIC_KEY.every((b) => b === 0)).toBe(true);
  });
});

describe('encrypt() — input validation', () => {
  it('rejects non-Uint8Array plaintext', async () => {
    const { pk } = makeTestKeypair();
    await expect(encrypt('a string', pk)).rejects.toThrow(TypeError);
    await expect(encrypt(new ArrayBuffer(4), pk)).rejects.toThrow(TypeError);
  });

  it('rejects a support key of the wrong length', async () => {
    await expect(encrypt(enc('hi'), new Uint8Array(31))).rejects.toThrow(TypeError);
    await expect(encrypt(enc('hi'), new Uint8Array(33))).rejects.toThrow(TypeError);
  });
});

describe('decrypt() — resistance to envelope tampering', () => {
  it('rejects an envelope with a wrong format tag', async () => {
    const { sk, pk } = makeTestKeypair();
    const env = await encrypt(enc('hi'), pk);
    const tampered = { ...env, v: 'br0' };
    await expect(decrypt(tampered, sk)).rejects.toThrow(/UNKNOWN_FORMAT/);
  });

  it('cannot decrypt envelope A with envelope B\'s ephemeral pk (HKDF info binds them)', async () => {
    const { sk, pk } = makeTestKeypair();
    const envA = await encrypt(enc('secret A'), pk);
    const envB = await encrypt(enc('secret B'), pk);
    // Swap ephemeral pks between envelopes — auth tag verification must
    // fail because the derived AEAD key mixes the epk in via HKDF info.
    const crossed = { ...envA, epk: envB.epk };
    await expect(decrypt(crossed, sk)).rejects.toThrow();
  });

  it('rejects ciphertext with a flipped bit (GCM auth)', async () => {
    const { sk, pk } = makeTestKeypair();
    const env = await encrypt(enc('integrity test'), pk);
    const tamperedCt = new Uint8Array(env.ct);
    tamperedCt[0] ^= 0x01;
    await expect(decrypt({ ...env, ct: tamperedCt }, sk)).rejects.toThrow();
  });

  it('rejects an envelope decrypted with the wrong recipient key', async () => {
    const { pk: pkA } = makeTestKeypair();
    const { sk: skB } = makeTestKeypair();
    const env = await encrypt(enc('hi'), pkA);
    // skB is not the counterpart to pkA — decrypt with it must fail.
    await expect(decrypt(env, skB)).rejects.toThrow();
  });
});
