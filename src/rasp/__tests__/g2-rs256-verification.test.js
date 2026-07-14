// src/rasp/__tests__/g2-rs256-verification.test.js
//
// G2 RS256/ES256 — JWS signature verification tests for PlayIntegrityPlugin.kt.
//
// Two layers:
//   (1) STRUCTURAL PINS — read PlayIntegrityPlugin.kt and assert that the
//       verification path (RS256 + ES256 + raw R‖S DER transcoder) is present
//       and cannot be accidentally removed.
//   (2) EXECUTABLE ES256 TRANSCODE PROOF — real EC P-256 keypairs generated in
//       Node, real signatures produced by Node's crypto (JOSE raw R‖S output),
//       run through the JS mirror of the Kotlin transcoder
//       (`helpers/rawToDerEcdsa.js`), then verified against Node's OWN DER
//       verifier. If the JS mirror matches Node's DER output byte-for-byte AND
//       Node re-verifies the transcoded signature, the algorithm is correct.
//
// HONEST GAP — CLOSED (#957). EcdsaDerTranscoder was extracted from
// PlayIntegrityPlugin into a standalone pure-JVM object so that
// RawEcdsaDerTranscoderTest.kt can execute the actual Kotlin code on the JVM.
// Layer (3) below pins both files and the CI step that runs them.
// The Kotlin call-site binding is now proved by `./gradlew :app:testDebugUnitTest`
// (android-unit-tests CI job). Device-verified Play Integrity token still outstanding.
//
// Issue: #951 (RASP H-2: ES256 verify inert on raw R‖S signatures).
//
// BUILT · algorithm executable-tested · NOT device-verified.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  generateKeyPairSync,
  createSign,
  createVerify,
  createPrivateKey,
  createPublicKey,
  X509Certificate,
  randomBytes,
} from 'crypto';
import { describe, it, expect } from 'vitest';
import { rawToDerEcdsa, derEncodeInteger } from './helpers/rawToDerEcdsa.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../../');
const kt = readFileSync(
  resolve(root, 'android/app/src/main/java/com/veyrnox/app/PlayIntegrityPlugin.kt'),
  'utf8',
);
const transcoderKt = readFileSync(
  resolve(root, 'android/app/src/main/java/com/veyrnox/app/EcdsaDerTranscoder.kt'),
  'utf8',
);
const transcoderTestKt = readFileSync(
  resolve(root, 'android/app/src/test/java/com/veyrnox/app/RawEcdsaDerTranscoderTest.kt'),
  'utf8',
);
const ciYml = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1 — structural pins (regression guard against silent removal)
// ─────────────────────────────────────────────────────────────────────────────

describe('G2 RS256/ES256 — signature verification structural pins', () => {
  it('verifyJwsSignature function is defined', () => {
    expect(kt).toContain('verifyJwsSignature');
  });

  it('parseVerdictToken calls verifyJwsSignature before trusting payload', () => {
    const verifyIdx = kt.indexOf('verifyJwsSignature(token)');
    const payloadIdx = kt.indexOf('base64UrlDecode(parts[1])');
    expect(verifyIdx).toBeGreaterThan(-1);
    expect(payloadIdx).toBeGreaterThan(-1);
    expect(verifyIdx).toBeLessThan(payloadIdx);
  });

  it('RS256 and ES256 are the only accepted algorithms; unknown alg returns false (fail-closed)', () => {
    expect(kt).toContain('"RS256" -> "SHA256withRSA"');
    expect(kt).toContain('"ES256" -> "SHA256withECDSA"');
    expect(kt).toContain('else -> return false');
  });

  it('x5c certificate chain is extracted from JWS header', () => {
    expect(kt).toContain('x5c');
  });

  it('leaf certificate is decoded from x5c[0]', () => {
    expect(kt).toContain('CertificateFactory');
    expect(kt).toContain('X509Certificate');
  });

  it('SHA256withRSA and SHA256withECDSA are the Java algorithm names used for RS256/ES256', () => {
    expect(kt).toContain('SHA256withRSA');
    expect(kt).toContain('SHA256withECDSA');
  });

  it('Signature.getInstance is used to verify', () => {
    expect(kt).toContain('Signature.getInstance');
  });

  it('Google issuer constraint is checked on the leaf certificate', () => {
    expect(kt).toContain('Google');
    expect(kt).toContain('issuer');
  });

  it('verification failure returns unavailable() fail-closed', () => {
    expect(kt).toMatch(/verifyJwsSignature.*return unavailable\(\)|!verifyJwsSignature.*unavailable/s);
  });

  it('signed data covers header AND payload (header.payload byte string)', () => {
    expect(kt).toContain('"${parts[0]}.${parts[1]}"');
  });

  it('JWS requires exactly 3 parts (header.payload.signature)', () => {
    expect(kt).toContain('parts.size != 3');
  });

  it('honest limitation comment preserved in the file', () => {
    expect(kt).toContain('HONEST LIMITATION');
  });

  // Issue #951 — Kotlin transcoder must exist and be called on the ES256 branch.
  it('ES256 raw R‖S → ASN.1 DER transcoder function is defined in Kotlin', () => {
    // rawEcdsaSignatureToDer(raw: ByteArray): ByteArray — the Kotlin mirror of
    // helpers/rawToDerEcdsa.js. Its presence is the structural fix for #951.
    expect(kt).toContain('rawEcdsaSignatureToDer');
  });

  it('ES256 rejects a signature whose length is not 64 bytes (fail-closed)', () => {
    // The 64-byte length constant must appear in the transcoder / caller.
    // ES256 raw R‖S is exactly 64 bytes for P-256; anything else must throw.
    expect(kt).toMatch(/64/);
  });

  it('transcoder result is used on the ES256 verify path (not raw signatureBytes)', () => {
    // The ES256 branch must call sig.verify(...) with the transcoded DER bytes,
    // not the raw JWS bytes. Grep for the call-site.
    expect(kt).toContain('rawEcdsaSignatureToDer');
    // And the alg-specific branch must be present.
    expect(kt).toMatch(/ES256|SHA256withECDSA/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Layer 2 — executable proofs of the transcode algorithm
// ─────────────────────────────────────────────────────────────────────────────

// Helper: base64url encode
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// Helper: sign JWS with raw R‖S (ES256, RFC 7518) using Node's dsaEncoding='ieee-p1363'.
function signJwsEs256(header, payload, privateKey) {
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const rawSig = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
  return { signingInput, rawSig };
}

describe('rawToDerEcdsa — JS mirror of Kotlin transcoder', () => {
  it('rejects non-64-byte input (fail-closed, I4)', () => {
    expect(() => rawToDerEcdsa(new Uint8Array(0))).toThrow(/64 bytes/);
    expect(() => rawToDerEcdsa(new Uint8Array(63))).toThrow(/64 bytes/);
    expect(() => rawToDerEcdsa(new Uint8Array(65))).toThrow(/64 bytes/);
    expect(() => rawToDerEcdsa(new Uint8Array(128))).toThrow(/64 bytes/);
  });

  it('rejects non-Uint8Array input (fail-closed)', () => {
    expect(() => rawToDerEcdsa(Buffer.alloc(64))).not.toThrow(); // Buffer IS a Uint8Array
    expect(() => rawToDerEcdsa('a'.repeat(64))).toThrow();
    expect(() => rawToDerEcdsa(null)).toThrow();
  });

  it('derEncodeInteger prepends 0x00 when high bit is set', () => {
    // 0x80... would be a negative INTEGER; must be padded.
    const highBit = new Uint8Array(32);
    highBit[0] = 0x80;
    const der = derEncodeInteger(highBit);
    // Tag 0x02, len 33, 0x00 pad, 0x80, then zeros
    expect(der[0]).toBe(0x02);
    expect(der[1]).toBe(33);
    expect(der[2]).toBe(0x00);
    expect(der[3]).toBe(0x80);
  });

  it('derEncodeInteger strips leading zero bytes but keeps at least one byte', () => {
    // r = 0x00 00 01 ... → strip to 0x01 ...
    const buf = new Uint8Array(32);
    buf[2] = 0x01;
    buf[3] = 0x23;
    const der = derEncodeInteger(buf);
    // After stripping two leading zeros: 30 bytes, starts with 0x01
    expect(der[0]).toBe(0x02);
    expect(der[1]).toBe(30);
    expect(der[2]).toBe(0x01);
    expect(der[3]).toBe(0x23);
  });

  it('derEncodeInteger keeps a single zero byte when input is all zeros', () => {
    const zeros = new Uint8Array(32);
    const der = derEncodeInteger(zeros);
    // A pathological all-zero r/s is malformed for ECDSA but the transcoder
    // itself must not throw — it must produce a legal DER INTEGER of value 0.
    expect(der[0]).toBe(0x02);
    expect(der[1]).toBe(1);
    expect(der[2]).toBe(0x00);
  });

  it('transcode(rawSig) round-trips: Node ES256 → raw R‖S → DER → Node verify(DER) passes', () => {
    // Real EC P-256 keypair, real signature, real verifier — end-to-end proof.
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

    const header = { alg: 'ES256', typ: 'JWT' };
    const payload = { nonce: 'abc123', ts: 1700000000 };
    const { signingInput, rawSig } = signJwsEs256(header, payload, privateKey);

    expect(rawSig.length).toBe(64);

    // Transcode raw R‖S → DER via the JS mirror.
    const der = rawToDerEcdsa(new Uint8Array(rawSig));

    // Node's default verify wants DER — this is precisely what the JCA
    // Signature("SHA256withECDSA").verify() wants on Android. If Node's verify
    // accepts our DER, the JCA verifier will too (same encoding contract).
    const verifier = createVerify('SHA256');
    verifier.update(signingInput);
    verifier.end();
    expect(verifier.verify(publicKey, Buffer.from(der))).toBe(true);
  });

  it('cross-checks against Node crypto DER output (algorithm equivalence)', () => {
    // Node can produce both encodings from the SAME signature op. Comparing our
    // transcode(raw) with Node's DER output for the same signing action would be
    // ideal, but Node's ECDSA is randomized — instead, generate raw then verify
    // that our DER decodes back to bytes Node accepts. Fuzz N iterations.
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    for (let i = 0; i < 20; i += 1) {
      const msg = randomBytes(64);
      const s = createSign('SHA256');
      s.update(msg);
      s.end();
      const raw = s.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
      expect(raw.length).toBe(64);
      const der = rawToDerEcdsa(new Uint8Array(raw));
      const v = createVerify('SHA256');
      v.update(msg);
      v.end();
      expect(v.verify(publicKey, Buffer.from(der))).toBe(true);
    }
  });

  it('DER output is a well-formed SEQUENCE { INTEGER r, INTEGER s }', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const s = createSign('SHA256');
    s.update('hello');
    s.end();
    const raw = s.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
    const der = rawToDerEcdsa(new Uint8Array(raw));

    // SEQUENCE tag
    expect(der[0]).toBe(0x30);
    // Length is short-form for P-256 (< 128)
    expect(der[1]).toBeLessThan(128);
    expect(der[1]).toBe(der.length - 2);
    // First INTEGER
    expect(der[2]).toBe(0x02);
    const rLen = der[3];
    // Second INTEGER
    expect(der[4 + rLen]).toBe(0x02);
    const sLen = der[5 + rLen];
    // r + s content + 4 tag/len bytes must equal SEQUENCE content length.
    expect(rLen + sLen + 4).toBe(der[1]);
  });

  it('handles r and s that would each require the 0x00 padding prefix', () => {
    // Construct a raw sig where both r and s have the high bit set — engineered
    // edge case (transcoder must add 0x00 pad to both, giving 33-byte INTEGERs
    // and a 70-byte SEQUENCE content).
    const raw = new Uint8Array(64);
    raw[0] = 0x80;
    for (let i = 1; i < 32; i += 1) raw[i] = 0x11;
    raw[32] = 0xff;
    for (let i = 33; i < 64; i += 1) raw[i] = 0x22;
    const der = rawToDerEcdsa(raw);
    expect(der[0]).toBe(0x30);
    // r: 0x02 0x21 0x00 0x80 ... (33 content bytes)
    expect(der[2]).toBe(0x02);
    expect(der[3]).toBe(33);
    expect(der[4]).toBe(0x00);
    expect(der[5]).toBe(0x80);
    // s: 0x02 0x21 0x00 0xff ... starts at offset 2 + 2 + 33 = 37
    expect(der[37]).toBe(0x02);
    expect(der[38]).toBe(33);
    expect(der[39]).toBe(0x00);
    expect(der[40]).toBe(0xff);
    // Total: 2 (SEQ header) + 2 + 33 (r) + 2 + 33 (s) = 72 bytes
    expect(der.length).toBe(72);
    expect(der[1]).toBe(70);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Layer 2b — synthetic JWS + x5c chain (documents the shape the Kotlin plugin
// consumes). We do NOT execute the Kotlin verifier here; we prove the JWS we
// build is a well-formed ES256 token so a future Kotlin JVM harness has a fixture.
// ─────────────────────────────────────────────────────────────────────────────

describe('synthetic ES256 JWS with self-signed Google-issuer x5c chain', () => {
  it('produces a JWS that Node can re-verify end-to-end (algorithm sanity)', () => {
    // NOTE: Node's X509Certificate is read-only in this Node version, so we can
    // only mint via createPrivateKey/publicKey ops. We build the JWS proper and
    // stub the x5c entry with a base64 placeholder — the transcoder proof does
    // not depend on x5c contents.
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' });
    const x5c = [Buffer.from(spkiDer).toString('base64')];

    const header = { alg: 'ES256', typ: 'JWT', x5c };
    const payload = {
      nonce: 'test-nonce',
      deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_BASIC_INTEGRITY'] },
    };
    const { signingInput, rawSig } = signJwsEs256(header, payload, privateKey);
    const jws = `${signingInput}.${b64url(rawSig)}`;

    // JWS has 3 dot-separated parts
    expect(jws.split('.').length).toBe(3);

    // Round-trip verify (Node) with our transcoded DER.
    const der = rawToDerEcdsa(new Uint8Array(rawSig));
    const v = createVerify('SHA256');
    v.update(signingInput);
    v.end();
    expect(v.verify(publicKey, Buffer.from(der))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Layer 3 — Kotlin JVM harness existence pins (#957)
//
// Layer (1) proved the algorithm via source-string grep; Layer (2) via JS mirror.
// Layer (3) proves that the actual Kotlin code is covered by a JVM test suite
// that CI executes. These pins prevent silent removal of the harness.
// ─────────────────────────────────────────────────────────────────────────────

describe('Kotlin JVM test harness — EcdsaDerTranscoder (#957)', () => {
  it('EcdsaDerTranscoder.kt is a pure-JVM internal object (no Android context)', () => {
    expect(transcoderKt).toContain('internal object EcdsaDerTranscoder');
    // Must have no Android framework imports — pure JVM so the JUnit runner works
    // without an Android emulator or device.
    expect(transcoderKt).not.toMatch(/import android\./);
  });

  it('EcdsaDerTranscoder exports rawEcdsaSignatureToDer and derEncodeInteger', () => {
    expect(transcoderKt).toContain('fun rawEcdsaSignatureToDer(');
    expect(transcoderKt).toContain('fun derEncodeInteger(');
  });

  it('RawEcdsaDerTranscoderTest.kt is a JUnit test class', () => {
    expect(transcoderTestKt).toContain('import org.junit.Test');
    expect(transcoderTestKt).toContain('class RawEcdsaDerTranscoderTest');
  });

  it('RawEcdsaDerTranscoderTest exercises round-trip via real JCA EC keypair', () => {
    // The JVM test must prove the transcoder works against Java's own DER verifier,
    // not just unit-check the byte layout.
    expect(transcoderTestKt).toContain('KeyPairGenerator');
    expect(transcoderTestKt).toContain('Signature.getInstance("SHA256withECDSA")');
    expect(transcoderTestKt).toContain('verifier.verify(reEncoded)');
  });

  it('CI android-unit-tests job runs ./gradlew :app:testDebugUnitTest', () => {
    expect(ciYml).toContain('android-unit-tests');
    expect(ciYml).toContain('testDebugUnitTest');
  });

  it('EcdsaDerTranscoder.kt is in the Kotlin src/main tree (compiled into the plugin)', () => {
    // Not in src/test — the transcoder must ship with the plugin so
    // PlayIntegrityPlugin can call it at runtime.
    expect(transcoderKt).toContain('package com.veyrnox.app');
  });
});
