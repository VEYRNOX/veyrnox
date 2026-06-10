// src/lib/__tests__/address.test.js
//
// Truncated-middle address display helper (design system §6: "mono for truth",
// addresses truncated-middle like 0x8F3a…b9c4). A pure presentational helper,
// matching the existing inline `shorten` in TransactionPreview.jsx so the whole
// app renders addresses identically.

import { describe, it, expect } from 'vitest';
import { shortenAddress } from '../address.js';

const ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

describe('shortenAddress — truncated-middle (§6)', () => {
  it('truncates a full address to head…tail with an ellipsis', () => {
    const out = shortenAddress(ADDR);
    expect(out).toContain('…');
    expect(out.startsWith(ADDR.slice(0, 8))).toBe(true);
    expect(out.endsWith(ADDR.slice(-6))).toBe(true);
    expect(out.length).toBeLessThan(ADDR.length);
  });

  it('leaves short strings (<= 16 chars) unchanged', () => {
    expect(shortenAddress('0x1234')).toBe('0x1234');
  });

  it('passes non-string values through untouched (defensive)', () => {
    expect(shortenAddress(null)).toBeNull();
    expect(shortenAddress(undefined)).toBeUndefined();
    expect(shortenAddress(123)).toBe(123);
  });
});
