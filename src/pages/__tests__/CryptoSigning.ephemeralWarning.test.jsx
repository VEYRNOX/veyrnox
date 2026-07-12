// @ts-nocheck
// CryptoSigning.ephemeralWarning.test.jsx
//
// OBSOLETE-BY-DESIGN: the /crypto-signing page no longer generates or imports a
// TEMPORARY ephemeral key — it signs with the user's REAL wallet via
// useWallet().withPrivateKey (see CryptoSigning.realWallet.test.jsx). The former
// "Keys on this page are temporary" warning banner is therefore FALSE now and
// must be REMOVED. This test pins that removal, and that no key-material demo
// affordances (random-wallet generation, mnemonic import, private-key reveal)
// remain in the source.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '..', 'CryptoSigning.jsx'), 'utf-8');
const lower = src.toLowerCase();

describe('CryptoSigning — ephemeral-key demo removed (real-wallet rewrite)', () => {
  it('no longer claims keys are temporary', () => {
    expect(lower.includes('keys on this page are temporary')).toBe(false);
    expect(lower.includes('temporary')).toBe(false);
  });

  it('no random-wallet generation (createRandom) remains', () => {
    expect(src.includes('createRandom')).toBe(false);
  });

  it('no mnemonic import / phrase handling remains', () => {
    expect(src.includes('isValidMnemonic')).toBe(false);
    expect(src.includes('fromPhrase')).toBe(false);
    expect(src.includes('importMnemonic')).toBe(false);
    expect(src.includes('mnemonicRef')).toBe(false);
  });

  it('no private-key reveal control remains', () => {
    expect(src.includes('privateKey')).toBe(false);
    expect(src.includes('showKey')).toBe(false);
  });

  it('signs via the real wallet withPrivateKey primitive', () => {
    expect(src.includes('withPrivateKey')).toBe(true);
    expect(src.includes('useWallet')).toBe(true);
  });
});
