// src/lib/__tests__/WalletProvider.btcPortfolioNetwork.test.js
//
// Bug: deriveAllAddresses() hardcoded networkKey: 'testnet' so the portfolio
// balance query hit mempool.space with a tb1... testnet address, returning 0
// even when real BTC was confirmed at the bc1... mainnet address shown on the
// Receive screen.
//
// Fix: deriveAllAddresses() must use 'mainnet' so the portfolio address matches
// the Receive address and the balance fetch resolves against the correct UTXO set.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../WalletProvider.jsx'), 'utf8');

const fnStart = src.indexOf('const deriveAllAddresses = useCallback');
const fnEnd = src.indexOf('}, []);', fnStart) + 7;
const body = src.slice(fnStart, fnEnd);

describe('deriveAllAddresses — BTC network alignment', () => {
  it('defines deriveAllAddresses', () => {
    expect(fnStart).toBeGreaterThan(-1);
  });

  it('derives BTC with mainnet so portfolio balance matches the Receive address', () => {
    expect(body).toMatch(/deriveBtcAccount\([^)]*networkKey:\s*'mainnet'/);
  });

  it('does not derive BTC with testnet in the portfolio path', () => {
    expect(body).not.toMatch(/deriveBtcAccount\([^)]*networkKey:\s*'testnet'/);
  });
});
