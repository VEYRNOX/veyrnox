import { describe, it, expect } from 'vitest';
import { mnemonicFromEntropy, validateMnemonic } from '../mnemonic.js';

describe('mnemonicFromEntropy', () => {
  it('maps the canonical all-zero 128-bit entropy to the known BIP-39 mnemonic', () => {
    const entropy = new Uint8Array(16); // all zeros
    const m = mnemonicFromEntropy(entropy);
    expect(m).toBe(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    );
    expect(validateMnemonic(m)).toBe(true);
  });

  it('is deterministic and produces a valid mnemonic for arbitrary entropy', () => {
    const entropy = new Uint8Array(16).fill(7);
    expect(mnemonicFromEntropy(entropy)).toBe(mnemonicFromEntropy(entropy));
    expect(validateMnemonic(mnemonicFromEntropy(entropy))).toBe(true);
  });
});
