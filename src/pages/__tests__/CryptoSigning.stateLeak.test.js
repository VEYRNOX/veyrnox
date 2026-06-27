// src/pages/__tests__/CryptoSigning.stateLeak.test.js
//
// C6: Private keys must NOT live in React useState. React state is snapshotable
// by DevTools and readable from the console by any script with devtools access,
// and the value is retained in the component closure for the component's full
// lifetime. On a mainnet-live wallet that is a direct key-exfiltration vector.
//
// These are source-scan structural tests (mirroring useReceiveDetector.test.js):
// we read the component source as text and assert structural properties of how
// key material is held, rather than rendering the component.
//
//   - No useState holds `privateKey`, `mnemonic`, or a `wallet` ethers object.
//   - useRef (or equivalent) is used for key material.
//   - A useEffect cleanup zeros / clears the key-material refs on unmount.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../CryptoSigning.jsx'), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(src);

describe('CryptoSigning C6 — key material is not in React state', () => {
  it('does NOT hold the ethers wallet object in useState', () => {
    // i.e. no `const [wallet, setWallet] = useState(...)`
    expect(code).not.toMatch(/\[\s*wallet\s*,\s*setWallet\s*\]\s*=\s*useState/);
  });

  it('does NOT hold the mnemonic phrase in useState', () => {
    expect(code).not.toMatch(/\[\s*mnemonic\s*,\s*setMnemonic\s*\]\s*=\s*useState/);
  });

  it('does NOT hold derivedWallets (which carry privateKey) in useState', () => {
    expect(code).not.toMatch(/\[\s*derivedWallets\s*,\s*setDerivedWallets\s*\]\s*=\s*useState/);
  });

  it('does not store a `privateKey` field into any useState-backed setter', () => {
    // The derived array carrying privateKey must not be placed into state.
    // Display state may carry address/label/path but never privateKey.
    // Scan each source line that contains a state setter call; none may carry
    // privateKey on the same statement/line.
    const leaks = code
      .split('\n')
      .filter((line) => /\bset[A-Z]\w*\s*\(/.test(line) && /privateKey/.test(line));
    expect(leaks).toEqual([]);
  });

  it('uses useRef (or equivalent) to hold key material', () => {
    expect(code).toMatch(/useRef\s*\(/);
    // The wallet object is reached via a ref, not via state.
    expect(code).toMatch(/\w*[Ww]alletRef\b/);
  });

  it('zeros / clears key-material refs in a useEffect cleanup on unmount', () => {
    // There must be a useEffect whose returned cleanup nulls the key refs.
    expect(code).toMatch(/useEffect\s*\(/);
    // cleanup returns a function that clears a ref carrying key material.
    expect(code).toMatch(/return\s*\(\s*\)\s*=>\s*\{[\s\S]*Ref\.current\s*=\s*null/);
  });
});
