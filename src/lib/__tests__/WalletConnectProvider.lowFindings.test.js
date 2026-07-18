// LOW-severity WalletConnect hardening (2026-07-11):
//
//   L-1: eth_sendTransaction must validate the requested chain against the
//        approved session namespace, mirroring the typed-data path. The
//        handleSendTransaction delegator must resolve the CAIP-2 chain via
//        resolveSessionCaip2() from the live session store BEFORE delegating to
//        _handleSendTransaction (fail closed, I4). Structural pin: the guard
//        must appear before the _handle* key path.
//
//   L-2: maxPriorityFeePerGas must be clamped so it can never exceed the capped
//        maxFeePerGas. Under EIP-1559 a priority fee above the max fee is an
//        invalid tx. Pure helper resolveMaxPriorityFeePerGas(raw, resolvedMaxFee)
//        is the contract.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { resolveMaxPriorityFeePerGas } from '../WalletConnectProvider.jsx';

const GWEI = 1_000_000_000n;

// ---- L-2: maxPriorityFeePerGas clamped to the resolved (capped) max fee ------

describe('resolveMaxPriorityFeePerGas (L-2 — priority fee never exceeds max fee)', () => {
  it('clamps a priority fee above the resolved max fee down to the max fee', () => {
    const maxFee = 3n * GWEI;
    expect(resolveMaxPriorityFeePerGas(100n * GWEI, maxFee)).toBe(maxFee);
  });

  it('passes a priority fee below the max fee through unchanged', () => {
    const maxFee = 3n * GWEI;
    expect(resolveMaxPriorityFeePerGas(1n * GWEI, maxFee)).toBe(1n * GWEI);
  });

  it('treats an absent priority fee as 0 (EIP-1559 default)', () => {
    expect(resolveMaxPriorityFeePerGas(undefined, 3n * GWEI)).toBe(0n);
    expect(resolveMaxPriorityFeePerGas(null, 3n * GWEI)).toBe(0n);
  });

  it('treats an unparseable priority fee as 0 (fail closed, I4)', () => {
    expect(resolveMaxPriorityFeePerGas('not-a-number', 3n * GWEI)).toBe(0n);
  });

  it('accepts hex-string priority fees', () => {
    const maxFee = 100n * GWEI;
    expect(resolveMaxPriorityFeePerGas('0x3B9ACA00' /* 1 gwei */, maxFee)).toBe(1n * GWEI);
  });

  it('clamps a negative priority fee up to 0', () => {
    expect(resolveMaxPriorityFeePerGas(-5n, 3n * GWEI)).toBe(0n);
  });

  // #1115: nullish resolvedMaxFee guard
  it('returns null when resolvedMaxFee is nullish (#1115, fail-closed I4)', () => {
    expect(resolveMaxPriorityFeePerGas(1n * GWEI, undefined)).toBeNull();
    expect(resolveMaxPriorityFeePerGas(1n * GWEI, null)).toBeNull();
    expect(resolveMaxPriorityFeePerGas(undefined, undefined)).toBeNull();
    expect(resolveMaxPriorityFeePerGas(0n, null)).toBeNull();
  });
});

// ---- L-1: handleSendTransaction validates the session chain before signing ---

describe('L-1 — handleSendTransaction resolves the session chain before the key path', () => {
  const raw = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../WalletConnectProvider.jsx'),
    'utf8',
  );
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  function delegatorBody(name) {
    const start = src.indexOf(`const ${name} = useCallback(`);
    expect(start, `${name} not found`).toBeGreaterThan(-1);
    const after = src.indexOf('const handle', start + 1);
    return src.slice(start, after === -1 ? undefined : after);
  }

  it('calls resolveSessionCaip2 before delegating to _handleSendTransaction', () => {
    const body = delegatorBody('handleSendTransaction');
    const guardIdx = body.indexOf('resolveSessionCaip2');
    const keyIdx = body.indexOf('_handleSendTransaction');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(keyIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(keyIdx);
  });

  it('rejects with SESSION_CHAINID_INVALID when the chain is not approved', () => {
    const body = delegatorBody('handleSendTransaction');
    expect(body).toContain('SESSION_CHAINID_INVALID');
  });
});
