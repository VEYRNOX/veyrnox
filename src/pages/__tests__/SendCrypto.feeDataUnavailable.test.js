// #1115 (P2): when the provider's getFeeData() returns both maxFeePerGas AND
// gasPrice as nullish (a rare but real provider response), cappedMaxFeePerGas
// is undefined before this fix. Verified against the real
// resolveMaxPriorityFeePerGas implementation: a BigInt `>` comparison against
// `undefined` does NOT throw in JS (undefined coerces to NaN, and any
// comparison with NaN is `false`) — so the observed failure is not the
// TypeError itself firing inside resolveMaxPriorityFeePerGas, it is that the
// L-2 cap is silently bypassed (`parsed > undefined` is always `false`, so the
// raw unclamped dApp/provider-supplied priority fee is returned unbounded).
// Either way the vault must fail closed (I4) here rather than proceed with a
// fee-data cap that could not be established. assertFeeDataAvailable() throws
// a coded, user-legible error BEFORE that comparison is ever reached.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assertFeeDataAvailable } from '../SendCrypto.jsx';
import { resolveMaxPriorityFeePerGas } from '@/lib/WalletConnectProvider';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../SendCrypto.jsx'), 'utf8');

describe('#1115 — RED: the underlying gap this guard closes', () => {
  it('resolveMaxPriorityFeePerGas does NOT cap the priority fee when resolvedMaxFee is undefined (silent L-2 bypass)', () => {
    // Without assertFeeDataAvailable() gating this call first, an undefined
    // cappedMaxFeePerGas means the "cap" is never enforced — the raw priority
    // fee passes through unbounded instead of being rejected.
    const raw = 1_000_000_000n;
    expect(resolveMaxPriorityFeePerGas(raw, undefined)).toBe(raw);
  });
});

describe('#1115 — GREEN: assertFeeDataAvailable fails closed with a coded, friendly error', () => {
  it('throws FEE_DATA_UNAVAILABLE when cappedMaxFeePerGas is undefined', () => {
    let caught;
    try {
      assertFeeDataAvailable(undefined);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.code).toBe('FEE_DATA_UNAVAILABLE');
    expect(caught.message).toMatch(/network fee data unavailable/i);
  });

  it('throws FEE_DATA_UNAVAILABLE when cappedMaxFeePerGas is null', () => {
    expect(() => assertFeeDataAvailable(null)).toThrow(/network fee data unavailable/i);
  });

  it('does not throw when cappedMaxFeePerGas is a valid BigInt (including 0n)', () => {
    expect(() => assertFeeDataAvailable(1_000_000_000n)).not.toThrow();
    expect(() => assertFeeDataAvailable(0n)).not.toThrow();
  });
});

describe('#1115 — structural pin: the guard runs before resolveMaxPriorityFeePerGas in the Trezor branch', () => {
  it('SendCrypto.jsx calls assertFeeDataAvailable(cappedMaxFeePerGas) before resolveMaxPriorityFeePerGas', () => {
    const guardIdx = src.indexOf('assertFeeDataAvailable(cappedMaxFeePerGas)');
    const callIdx = src.indexOf('resolveMaxPriorityFeePerGas(', guardIdx);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(guardIdx);
  });
});
