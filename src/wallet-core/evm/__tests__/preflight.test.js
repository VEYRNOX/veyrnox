// wallet-core/evm/__tests__/preflight.test.js
//
// Issue #972 P2 (post-#963): when hw-send removed the UI's hardcoded
// 21000n/65000n gasLimit hint, provider.estimateGas rejections stopped being
// papered over by ethers' auto-fill — hw-send has no ethers.Wallet auto-fill.
// The consequence was a downstream `toHex(undefined)` crash with the confusing
// message "Cannot convert undefined to a BigInt" on any Trezor send during an
// RPC hiccup.
//
// I4 fail-closed: when estimation fails AND the caller did not supply a
// gasLimit override, applyEstimatedGasLimit must throw a specific
// GAS_ESTIMATE_FAILED error rather than leave overrides.gasLimit undefined.
// When the caller DID supply a gasLimit override, keep the (clamped) override
// so send.js / token-send.js callers continue to work as before.

import { describe, it, expect, vi } from 'vitest';
import { applyEstimatedGasLimit } from '../preflight.js';

function makeProvider({ estimate }) {
  return {
    estimateGas: vi.fn(async (req) => {
      if (typeof estimate === 'function') return estimate(req);
      if (estimate instanceof Error) throw estimate;
      return estimate;
    }),
  };
}

describe('applyEstimatedGasLimit — estimation-failure fail-closed (issue #972 P2)', () => {
  it('throws GAS_ESTIMATE_FAILED when estimateGas rejects AND no gasLimit override is present', async () => {
    const provider = makeProvider({ estimate: new Error('RPC error') });
    const overrides = { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n };

    await expect(applyEstimatedGasLimit(provider, { to: '0x0', value: 0n }, overrides))
      .rejects.toMatchObject({ code: 'GAS_ESTIMATE_FAILED' });

    // Fail-closed: overrides.gasLimit must remain undefined (never a silent
    // undefined that flows into toHex()).
    expect(overrides.gasLimit).toBeUndefined();
  });

  it('keeps the (clamped) caller-supplied override when estimateGas rejects', async () => {
    const provider = makeProvider({ estimate: new Error('RPC error') });
    const overrides = { gasLimit: 100_000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n };

    const result = await applyEstimatedGasLimit(provider, { to: '0x0', value: 0n }, overrides);
    expect(result.gasLimit).toBe(100_000n);
  });

  it('applies the +20% headroom on a successful estimate (regression guard)', async () => {
    const provider = makeProvider({ estimate: 60_000n });
    const overrides = { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n };
    await applyEstimatedGasLimit(provider, { to: '0x0', value: 0n }, overrides);
    expect(overrides.gasLimit).toBe(72_000n); // 60000 * 12/10
  });
});
