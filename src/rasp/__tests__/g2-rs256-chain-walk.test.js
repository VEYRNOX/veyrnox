// G2 RS256 — x5c chain-walk regression pin.
//
// Asserts that verifyJwsSignature() walks the full x5c chain (each cert verified
// by the next cert's key) before trusting the signature. This closes the
// "injected random cert" attack: a forged x5c that includes an unrelated Google
// root alongside a forger-controlled leaf cannot pass the chain walk.
//
// Chain-walk is a distinct improvement from root-cert fingerprint pinning
// (G2-ROOTCERT-PIN, follow-up PR): it verifies chain INTEGRITY without needing
// the pinned root fingerprint captured from a real device token.
//
// Status: BUILT (chain walk in verifyJwsSignature(), PlayIntegrityPlugin.kt).
// NOT independently audited. Device-verify: pending (Play Services call required).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');

// The JWS verification path (chain walk, alg dispatch, cert decode, signature
// verify) was extracted from PlayIntegrityPlugin.kt into PlayIntegrityJwsVerifier.kt
// for pure-JVM unit-testability (issue #957). PlayIntegrityPlugin.verifyJwsSignature
// is now a one-line delegate. These structural pins therefore scan the verifier file
// where the logic actually lives; the JVM harness (PlayIntegrityJwsVerifierTest.kt)
// executes it against real EC/RSA keypairs.
describe('G2 RS256 — x5c chain-walk (PlayIntegrityJwsVerifier.kt regression pin)', () => {
  let src;
  let pluginSrc;

  beforeAll(() => {
    src = readFileSync(
      path.join(root, 'android/app/src/main/java/com/veyrnox/app/PlayIntegrityJwsVerifier.kt'),
      'utf8',
    );
    pluginSrc = readFileSync(
      path.join(root, 'android/app/src/main/java/com/veyrnox/app/PlayIntegrityPlugin.kt'),
      'utf8',
    );
  });

  it('PlayIntegrityPlugin delegates verifyJwsSignature to PlayIntegrityJwsVerifier', () => {
    expect(pluginSrc).toMatch(/PlayIntegrityJwsVerifier\.verify\s*\(/);
  });

  it('buildcerts the full chain from x5c array', () => {
    // chain built via List<X509Certificate> mapping over x5c indices
    expect(src).toMatch(/val chain.*List<X509Certificate>/);
  });

  it('chain walk verifies cert[i] against cert[i+1].publicKey', () => {
    expect(src).toMatch(/chain\[i\]\.verify\s*\(\s*chain\[i\s*\+\s*1\]\.publicKey\s*\)/);
  });

  it('chain walk is guarded — a verification failure returns false (fail-closed)', () => {
    // The chain walk must return false on verify() exception, not throw
    const walkStart = src.indexOf('for (i in 0 until chainLen');
    expect(walkStart).toBeGreaterThan(-1);
    const walkBlock = src.slice(walkStart, src.indexOf('// 4.', walkStart));
    expect(walkBlock.length).toBeGreaterThan(0);
    expect(walkBlock).toContain('return false');
    expect(walkBlock).toContain('catch');
  });

  it('root cert (chain[chainLen - 1]) is passed to verifyRootCertFingerprint', () => {
    // Per issue #1097, the weak issuer.contains("Google") fallback was REMOVED —
    // root-cert trust is now the SHA-256 fingerprint pin ONLY (stricter). The last
    // cert in the chain must be extracted and pinned via verifyRootCertFingerprint;
    // pin-miss fails closed (no issuer-string bypass).
    expect(src).toContain('chain[chainLen - 1]');
    expect(src).toMatch(/verifyRootCertFingerprint\s*\(\s*rootCert\s*\)/);
    // Regression guard: the removed issuer-string fallback must not sneak back in.
    expect(src).not.toContain('.subjectX500Principal');
    expect(src).not.toMatch(/issuer[^\n]*\.contains\("Google"/);
  });

  it('leaf cert public key (chain[0]) is used for RS256 verification', () => {
    // Must use the leaf cert's key, not a hardcoded or unverified key
    expect(src).toContain('sig.initVerify(chain[0].publicKey)');
  });

  it('debug extraction method is NOT present in production code', () => {
    // debugExtractTokenHeader() was a temporary method for root-cert capture.
    // It must never ship — it exposes the raw JWS x5c header to the JS layer.
    expect(src).not.toContain('debugExtractTokenHeader');
  });

  it('only RS256 and ES256 alg values are accepted; all others return false (fail-closed)', () => {
    // The alg field dispatches to the correct Signature instance; any unknown alg
    // hits the `else -> return false` branch (I4 fail-closed). Google's Play Integrity
    // documentation cites ES256; the predecessor SafetyNet API used RS256; both are
    // accepted until a real production token confirms which is in use.
    expect(src).toContain('"RS256" -> "SHA256withRSA"');
    expect(src).toContain('"ES256" -> "SHA256withECDSA"');
    expect(src).toContain('else -> return false');
  });

  it('JWS must have exactly 3 parts (header.payload.signature)', () => {
    // Strict check — `parts.size != 3` catches malformed tokens
    expect(src).toContain('if (parts.size != 3) return false');
  });
});
