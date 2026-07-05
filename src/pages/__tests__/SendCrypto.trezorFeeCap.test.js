// src/pages/__tests__/SendCrypto.trezorFeeCap.test.js
//
// F-08-TREZOR (2026-07-04 internal audit, LOW): the Trezor EVM branch built
// maxFeePerGas from provider.getFeeData() with no ceiling. A hostile/misreporting
// RPC (I5: backend untrusted) could inflate the fee and burn funds on a hardware
// signer that shows only raw values. This source scan pins that the Trezor branch
// applies the MAX_BASE_FEE_GWEI ceiling from wallet-core/evm/fees.js.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../SendCrypto.jsx'), 'utf8');

describe('SendCrypto — F-08-TREZOR maxFeePerGas ceiling', () => {
  it('imports MAX_BASE_FEE_GWEI from wallet-core/evm/fees.js', () => {
    expect(src).toMatch(/MAX_BASE_FEE_GWEI/);
    expect(src).toMatch(/from\s+['"]@\/wallet-core\/evm\/fees(\.js)?['"]/);
  });

  it('applies a ceiling to the Trezor maxFeePerGas before signing', () => {
    // The Trezor branch must clamp: cap gwei * 1e9, then min() against the value.
    expect(src).toMatch(/MAX_BASE_FEE_GWEI\[[^\]]*\]/);
    expect(src).toMatch(/cappedMaxFeePerGas|maxFeePerGasCap|1_000_000_000n|1000000000n/);
  });
});
