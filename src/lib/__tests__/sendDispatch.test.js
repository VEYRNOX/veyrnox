// src/lib/__tests__/sendDispatch.test.js
//
// The only NEW logic the BTC/SOL send-dispatch slice introduces: converting a
// human-entered decimal amount to a chain's integer base unit WITHOUT floating-
// point error, and mapping each family's distinct send-result shape to one record
// shape. Both are pure — no React, no network.
import { describe, it, expect } from 'vitest';
import { toBaseUnits, normalizeSendResult } from '@/lib/sendDispatch';

describe('toBaseUnits — precision-safe decimal -> integer base units', () => {
  it('converts whole and fractional BTC (8 dp) to sats', () => {
    expect(toBaseUnits('1', 8)).toBe(100000000n);
    expect(toBaseUnits('0.0005', 8)).toBe(50000n);
    expect(toBaseUnits('0.00000001', 8)).toBe(1n); // 1 satoshi
  });

  it('converts SOL (9 dp) to lamports', () => {
    expect(toBaseUnits('1.5', 9)).toBe(1500000000n);
    expect(toBaseUnits('0.000000001', 9)).toBe(1n); // 1 lamport
  });

  it('normalizes trailing zeros and a bare leading dot', () => {
    expect(toBaseUnits('1.50', 8)).toBe(150000000n);
    expect(toBaseUnits('.5', 9)).toBe(500000000n);
  });

  it('throws on more fractional digits than the asset supports (no silent truncation)', () => {
    expect(() => toBaseUnits('0.000000001', 8)).toThrow(/decimal/i); // 9 dp into 8-dp BTC
  });

  it('throws on zero, negative, empty, and non-numeric input', () => {
    expect(() => toBaseUnits('0', 8)).toThrow();
    expect(() => toBaseUnits('-1', 8)).toThrow();
    expect(() => toBaseUnits('', 8)).toThrow();
    expect(() => toBaseUnits('abc', 8)).toThrow();
    expect(() => toBaseUnits('1.2.3', 8)).toThrow();
    expect(() => toBaseUnits('.', 8)).toThrow();
  });
});

describe('normalizeSendResult — one record shape across families', () => {
  it('maps EVM / ERC-20 hash', () => {
    expect(normalizeSendResult('evm', { hash: '0xabc', explorerUrl: 'u' })).toEqual({ hash: '0xabc', explorerUrl: 'u' });
    expect(normalizeSendResult('erc20', { hash: '0xdef', explorerUrl: 'u2' })).toEqual({ hash: '0xdef', explorerUrl: 'u2' });
  });

  it('maps BTC txid -> hash', () => {
    expect(normalizeSendResult('btc', { txid: 'deadbeef', explorerUrl: 'b' })).toEqual({ hash: 'deadbeef', explorerUrl: 'b' });
  });

  it('maps SOL signature -> hash', () => {
    expect(normalizeSendResult('solana', { signature: 'sig123', explorerUrl: 's' })).toEqual({ hash: 'sig123', explorerUrl: 's' });
  });

  it('throws on an unknown family (never records an undefined hash)', () => {
    expect(() => normalizeSendResult('dogecoin', { hash: 'x' })).toThrow();
  });
});
