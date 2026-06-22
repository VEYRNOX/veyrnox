// wallet-core/__tests__/sol-poison.test.js
//
// SOL recipient burn-address guard. isValidSolAddress only checks FORMAT, so the
// System Program address (32 zero bytes, base58 "111…1") passes it — assertSolRecipient
// must additionally reject it so a send there cannot silently destroy funds.

import { describe, it, expect } from 'vitest';
import { isSolFlagged, assertSolRecipient, SOL_FLAGGED } from '../sol/poison.js';
import { isValidSolAddress } from '../sol/derivation.js';

const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const GOOD = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';

describe('sol burn-address guard', () => {
  it('the System Program address passes FORMAT validation (why a separate guard is needed)', () => {
    expect(isValidSolAddress(SYSTEM_PROGRAM)).toBe(true);
  });

  it('flags the System Program / null sink', () => {
    expect(isSolFlagged(SYSTEM_PROGRAM)).toBe(true);
    expect(SOL_FLAGGED.has(SYSTEM_PROGRAM)).toBe(true);
  });

  it('does not flag a normal address', () => {
    expect(isSolFlagged(GOOD)).toBe(false);
  });

  it('assertSolRecipient throws on the burn address', () => {
    expect(() => assertSolRecipient(SYSTEM_PROGRAM)).toThrow(/burn address/i);
  });

  it('assertSolRecipient throws on a malformed address', () => {
    expect(() => assertSolRecipient('not-an-address')).toThrow(/Invalid Solana recipient/i);
  });

  it('assertSolRecipient accepts a well-formed, non-flagged address', () => {
    expect(() => assertSolRecipient(GOOD)).not.toThrow();
  });
});
