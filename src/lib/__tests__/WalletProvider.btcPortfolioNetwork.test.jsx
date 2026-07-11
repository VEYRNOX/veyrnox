// src/lib/__tests__/WalletProvider.btcPortfolioNetwork.test.jsx
//
// Bug: deriveAllAddresses() hardcoded networkKey: 'testnet' so the portfolio
// balance query hit mempool.space with a tb1... testnet address, returning 0
// even when real BTC was confirmed at the bc1... mainnet address shown on the
// Receive screen.
//
// Fix: deriveAllAddresses() must use 'mainnet' so the portfolio address matches
// the Receive address and the balance fetch resolves against the correct UTXO set.
//
// This is a BEHAVIOURAL test, not a source-text matcher. It runs the REAL BTC
// derivation and the REAL WalletProvider import path:
//   1. deriveBtcAccount() actually derives — mainnet ⇒ bc1…, testnet ⇒ tb1…,
//      and the two differ, so using the wrong network yields the wrong address.
//   2. importWallet() into a live provider populates walletAddresses (the exact
//      portfolio map the balance query reads); we assert the derived btc address
//      is the mainnet bc1… value — so a regression back to 'testnet' fails here.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

import { WalletProvider, useWallet } from '@/lib/WalletProvider';
import { deriveBtcAccount } from '@/wallet-core/btc/derivation.js';
import { clearVault } from '@/wallet-core/evm/vaultStore.js';

// Fixed BIP-39 test vector (a funds-less public phrase). Its derived P2WPKH
// (BIP-84) addresses are deterministic, so we can pin the exact values.
const TEST_MNEMONIC =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';
// ≥12 chars — H-A web vault password minimum on mainnet builds.
const PASSWORD = 'correct horse battery staple';

// Derived once from src/wallet-core/btc/derivation.js for TEST_MNEMONIC at
// m/84'/{coin}'/0'/0/0. These are the ground truth the app must reproduce.
const EXPECTED_MAINNET = 'bc1qgkju4yvvtuz0s8vqn837q396jezu2h8ex7gk98';
const EXPECTED_TESTNET = 'tb1qjgx204hxfwuse548jc34fjzg6ffq8pvrqwlex4';

describe('deriveBtcAccount — network selects the address family', () => {
  it('derives a mainnet bc1… P2WPKH address for networkKey: mainnet', () => {
    const { address } = deriveBtcAccount(TEST_MNEMONIC, { networkKey: 'mainnet' });
    expect(address).toBe(EXPECTED_MAINNET);
    expect(address.startsWith('bc1')).toBe(true);
  });

  it('derives a testnet tb1… address for networkKey: testnet (proving the key is honoured)', () => {
    const { address } = deriveBtcAccount(TEST_MNEMONIC, { networkKey: 'testnet' });
    expect(address).toBe(EXPECTED_TESTNET);
    expect(address.startsWith('tb1')).toBe(true);
  });

  it('mainnet and testnet addresses differ, so the wrong network queries the wrong UTXO set', () => {
    expect(EXPECTED_MAINNET).not.toBe(EXPECTED_TESTNET);
  });
});

// Capture the live wallet context so the test can drive provider methods and
// read the resulting portfolio address map.
let ctx;
function Capture() {
  ctx = useWallet();
  return null;
}
async function renderProvider() {
  await act(async () => {
    render(
      <WalletProvider>
        <Capture />
      </WalletProvider>,
    );
  });
}

describe('WalletProvider portfolio derivation — BTC network alignment', () => {
  beforeEach(async () => {
    try {
      localStorage.clear();
    } catch {
      /* shimmed */
    }
    await clearVault();
  });
  afterEach(async () => {
    cleanup();
    await clearVault();
    ctx = undefined;
  });

  it('importWallet derives the portfolio BTC address on MAINNET (bc1…), matching the Receive path', async () => {
    await renderProvider();
    await act(async () => {
      await ctx.importWallet(TEST_MNEMONIC, PASSWORD);
    });

    // walletAddresses is the exact map the unified-portfolio balance query reads.
    const entries = Object.values(ctx.walletAddresses);
    expect(entries.length).toBeGreaterThan(0);
    const { btc } = entries[0];

    // The regression assertion: the portfolio address must be the mainnet bc1…
    // value. If deriveAllAddresses ever reverts to 'testnet', btc becomes tb1…
    // and both of these fail.
    expect(btc).toBe(EXPECTED_MAINNET);
    expect(btc.startsWith('bc1')).toBe(true);
    expect(btc.startsWith('tb1')).toBe(false);
  });
});
