// src/rasp/__tests__/g2-rs256-verification.test.js
//
// G2 RS256 — structural regression pins for on-device JWS signature verification.
//
// These tests read PlayIntegrityPlugin.kt and assert that the RS256 verification
// path is present and cannot be accidentally removed. They start RED (before the
// implementation) and turn GREEN once it lands.
//
// BUILT · structural pins only · NOT device-verified.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../../');
const kt = readFileSync(
  resolve(root, 'android/app/src/main/java/com/veyrnox/app/PlayIntegrityPlugin.kt'),
  'utf8'
);

describe('G2 RS256 — signature verification structural pins', () => {
  it('verifyJwsSignature function is defined', () => {
    expect(kt).toContain('verifyJwsSignature');
  });

  it('parseVerdictToken calls verifyJwsSignature before trusting payload', () => {
    // The call must come before payload parsing (fail-closed gate)
    const verifyIdx = kt.indexOf('verifyJwsSignature(token)');
    const payloadIdx = kt.indexOf('base64UrlDecode(parts[1])');
    expect(verifyIdx).toBeGreaterThan(-1);
    expect(payloadIdx).toBeGreaterThan(-1);
    expect(verifyIdx).toBeLessThan(payloadIdx);
  });

  it('only RS256 algorithm is accepted (alg check)', () => {
    expect(kt).toContain('"RS256"');
  });

  it('x5c certificate chain is extracted from JWS header', () => {
    expect(kt).toContain('x5c');
  });

  it('leaf certificate is decoded from x5c[0]', () => {
    expect(kt).toContain('CertificateFactory');
    expect(kt).toContain('X509Certificate');
  });

  it('SHA256withRSA signature algorithm is used for verification', () => {
    expect(kt).toContain('SHA256withRSA');
  });

  it('Signature.getInstance is used to verify', () => {
    expect(kt).toContain('Signature.getInstance');
  });

  it('Google issuer constraint is checked on the leaf certificate', () => {
    expect(kt).toContain('Google');
    expect(kt).toContain('issuer');
  });

  it('verification failure returns unavailable() fail-closed', () => {
    // verifyJwsSignature returning false must map to unavailable(), not clean
    expect(kt).toMatch(/verifyJwsSignature.*return unavailable\(\)|!verifyJwsSignature.*unavailable/s);
  });

  it('signed data covers header AND payload (header.payload byte string)', () => {
    // The RS256 signature is over base64url(header) + "." + base64url(payload)
    expect(kt).toContain('parts[0]');
    expect(kt).toContain('parts[1]');
    // Both segments must appear together in the signed-data construction
    const signedDataIdx = kt.indexOf('parts[0]');
    const part1Idx = kt.lastIndexOf('parts[1]');
    // They must be within 200 chars of each other (the signed-data line)
    expect(Math.abs(signedDataIdx - part1Idx)).toBeLessThan(200);
  });

  it('JWS requires exactly 3 parts (header.payload.signature)', () => {
    expect(kt).toContain('parts.size != 3');
  });

  it('honest limitation comment preserved in the file', () => {
    expect(kt).toContain('HONEST LIMITATION');
  });
});
