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

  it('maps fixed non-zero entropy to its known mnemonic (regression anchor)', () => {
    const entropy = new Uint8Array(16).fill(7);
    const m = mnemonicFromEntropy(entropy);
    expect(m).toBe('alpha deal scrub asthma idea logic bright thought alpha deal scrub autumn');
    expect(validateMnemonic(m)).toBe(true);
  });
});
