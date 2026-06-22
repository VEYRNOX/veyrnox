// wallet-core/__tests__/btc-broadcast.test.js
//
// A Bitcoin broadcast acknowledgement must be a real 64-hex txid. A 200 with an
// empty body (seen on some Esplora forks) used to be treated as success, so the
// caller presented an unbroadcast tx as confirmed (double-send risk).
// isBroadcastTxid is the pure guard; broadcastTx now throws on an empty/garbage body.

import { describe, it, expect } from 'vitest';
import { isBroadcastTxid } from '../btc/provider.js';

describe('isBroadcastTxid', () => {
  it('accepts a 64-hex txid (either case)', () => {
    expect(isBroadcastTxid('a'.repeat(64))).toBe(true);
    expect(isBroadcastTxid('0123456789abcdef'.repeat(4))).toBe(true);
    expect(isBroadcastTxid('0123456789ABCDEF'.repeat(4))).toBe(true);
  });

  it('rejects empty / short / long / non-hex / 0x-prefixed / non-string', () => {
    expect(isBroadcastTxid('')).toBe(false);
    expect(isBroadcastTxid('a'.repeat(63))).toBe(false);
    expect(isBroadcastTxid('a'.repeat(65))).toBe(false);
    expect(isBroadcastTxid('z'.repeat(64))).toBe(false);
    expect(isBroadcastTxid('0x' + 'a'.repeat(64))).toBe(false);
    expect(isBroadcastTxid(null)).toBe(false);
    expect(isBroadcastTxid(undefined)).toBe(false);
  });
});
