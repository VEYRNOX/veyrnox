// src/pages/__tests__/CryptoSigning.stateLeak.test.js
//
// C6 (strengthened by the real-wallet rewrite): the page must never hold key
// material AT ALL. Previously it held the ephemeral key in refs; now it holds
// NO key — signing is scoped inside useWallet().withPrivateKey(index, fn), which
// hands the private key to the signer and lets it go out of scope. There is no
// wallet object, no mnemonic, and no privateKey anywhere in this component's
// state OR refs.
//
// Source-scan structural tests (mirroring the prior pattern): read the component
// source as text and assert how it does — and does not — touch key material.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../CryptoSigning.jsx'), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(src);

describe('CryptoSigning C6 — the page holds no key material', () => {
  it('does NOT hold a wallet/mnemonic/private key in useState', () => {
    expect(code).not.toMatch(/\[\s*wallet\s*,\s*setWallet\s*\]\s*=\s*useState/);
    expect(code).not.toMatch(/\[\s*mnemonic\s*,\s*setMnemonic\s*\]\s*=\s*useState/);
    expect(code).not.toMatch(/privateKey/);
  });

  it('does NOT hold key material in refs (no walletRef/mnemonicRef/derivedRef)', () => {
    expect(code).not.toMatch(/walletRef/);
    expect(code).not.toMatch(/mnemonicRef/);
    expect(code).not.toMatch(/derivedRef/);
  });

  it('obtains the signing key ONLY transiently via withPrivateKey', () => {
    expect(code).toMatch(/withPrivateKey\s*\(\s*0\s*,/);
    // the ethers Wallet is constructed inside the scoped callback, from the pk
    // argument — never stored.
    expect(code).toMatch(/new ethers\.Wallet\s*\(\s*pk\s*\)/);
  });

  it('does not generate or import any key locally', () => {
    expect(code).not.toMatch(/createRandom/);
    expect(code).not.toMatch(/fromPhrase/);
    expect(code).not.toMatch(/isValidMnemonic/);
  });
});
