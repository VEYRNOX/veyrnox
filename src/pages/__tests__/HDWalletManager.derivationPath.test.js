// Regression guard: BTC and SOL rows must NOT display the EVM derivation path.
//
// Bug (branch eaf7361a): shortPath() hardcodes m/44'/60'/0'/0/{index}. The
// "Technical path (for advanced users)" row is gated on `{address && (...)}`.
// Before that commit `address` was always null for BTC/SOL so the row never
// rendered for them; the commit made it non-null, so BTC and SOL rows began
// showing a correct bech32/base58 address paired with the ETHEREUM coin type 60'.
//
// Real paths differ per chain:
//   BTC  m/84'/0'/0'/0/0      (BIP-84, btc/derivation.js)
//   SOL  m/44'/501'/0'/0'     (SLIP-0010 ed25519, sol/derivation.js)
//   EVM  m/44'/60'/0'/0/{i}
//
// Impact is display-only (the address shown is correct), but an advanced user
// re-deriving from the stated path in another wallet lands on an empty account
// and may conclude the funds are gone.
//
// I4 (fail honest): when the real path is not known, render NOTHING rather than
// a fabricated-but-plausible path.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveAssetPath } from '../HDWalletManager.jsx';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../HDWalletManager.jsx'), 'utf8');

const ETH = { symbol: 'ETH', family: 'evm' };
const USDC = { symbol: 'USDC', family: 'erc20' };
const BTC = { symbol: 'BTC', family: 'btc' };
const SOL = { symbol: 'SOL', family: 'solana' };

const BTC_PATH = "m/84'/0'/0'/0/0";
const SOL_PATH = "m/44'/501'/0'/0'";

describe('resolveAssetPath — per-asset derivation path', () => {
  it('returns the EVM path for native EVM assets', () => {
    expect(resolveAssetPath(ETH, { evmIndex: 0 })).toBe("m/44'/60'/0'/0/0");
    expect(resolveAssetPath(ETH, { evmIndex: 3 })).toBe("m/44'/60'/0'/0/3");
  });

  it('returns the EVM path for ERC-20 assets (they share the secp256k1 account)', () => {
    expect(resolveAssetPath(USDC, { evmIndex: 2 })).toBe("m/44'/60'/0'/0/2");
  });

  it('defaults the EVM index to 0 when undefined', () => {
    expect(resolveAssetPath(ETH, {})).toBe("m/44'/60'/0'/0/0");
  });

  // The actual bug.
  it('returns the BIP-84 BTC path for BTC — never the EVM path', () => {
    const got = resolveAssetPath(BTC, { evmIndex: 0, btcPath: BTC_PATH });
    expect(got).toBe(BTC_PATH);
    expect(got).not.toMatch(/44'\/60'/);
  });

  it('returns the SLIP-0010 SOL path for SOL — never the EVM path', () => {
    const got = resolveAssetPath(SOL, { evmIndex: 0, solPath: SOL_PATH });
    expect(got).toBe(SOL_PATH);
    expect(got).not.toMatch(/44'\/60'/);
  });

  // I4: fail honest rather than fabricate.
  it('returns null for BTC/SOL when the real path is unknown', () => {
    expect(resolveAssetPath(BTC, { evmIndex: 0 })).toBeNull();
    expect(resolveAssetPath(SOL, { evmIndex: 0 })).toBeNull();
    expect(resolveAssetPath(BTC, { evmIndex: 0, btcPath: '' })).toBeNull();
  });

  it('never falls back to the EVM path for a non-EVM family', () => {
    for (const asset of [BTC, SOL, { symbol: 'XYZ', family: 'cosmos' }]) {
      const got = resolveAssetPath(asset, { evmIndex: 5 });
      expect(got === null || !/44'\/60'/.test(got)).toBe(true);
    }
  });

  it('returns null for an unknown family and for a missing asset', () => {
    expect(resolveAssetPath({ symbol: 'XYZ', family: 'cosmos' }, { evmIndex: 0 })).toBeNull();
    expect(resolveAssetPath(undefined, { evmIndex: 0 })).toBeNull();
  });

  it('tolerates being called with no options object', () => {
    expect(() => resolveAssetPath(BTC)).not.toThrow();
    expect(resolveAssetPath(BTC)).toBeNull();
  });
});

describe('HDWalletManager — technical-path render site', () => {
  it('the asset row resolves its path per asset, not via a bare shortPath call', () => {
    // The per-asset row must go through resolveAssetPath so BTC/SOL get their
    // own path. A bare shortPath(...) inside the asset row is the bug.
    expect(src).toMatch(/resolveAssetPath\s*\(/);
  });

  it('passes the real btc/sol paths from the wallet accounts', () => {
    expect(src).toMatch(/btcPath:\s*btcAccount\?\.path/);
    expect(src).toMatch(/solPath:\s*solAccount\?\.path/);
  });

  it('renders the technical-path row only when a path is known (I4 fail honest)', () => {
    // Guard must be on the resolved path, not merely on `address`.
    expect(src).toMatch(/assetPath\s*&&/);
  });
});
