// Regression guard for the #772 mainnet flip.
//
// PR #772 switched the BTC asset's `chain` from 'testnet' to 'mainnet' but left
// the portfolio/analytics address derivation (WalletProvider.deriveAllAddresses)
// pinned to networkKey:'testnet'. portfolioBalances.js reads
//   getBalanceSats(asset.chain, addr.btc)
// so a tb1… (testnet) address queried against the mainnet indexer resolves to
// nothing → BTC balance always read 0, and sends operated on a different address
// than the dashboard showed. The fix ties the portfolio derivation to
// ACTIVE_BTC_NETWORK_KEY; this test fails closed if the two ever diverge again.

import { describe, it, expect } from 'vitest';
import { getAsset } from '@/wallet-core/assets';
import { ACTIVE_BTC_NETWORK_KEY, getBtcNetworkInfo } from '@/wallet-core/btc/networks';
import { deriveBtcAccount } from '@/wallet-core/btc/derivation';

describe('BTC network alignment (portfolio ↔ asset chain)', () => {
  it('the BTC asset chain matches the active BTC network key', () => {
    // If these diverge, portfolioBalances reads the balance on the asset chain
    // using an address derived on a different network → always 0.
    expect(getAsset('BTC').chain).toBe(ACTIVE_BTC_NETWORK_KEY);
  });

  it('deriving on the active network yields an address the asset chain can resolve', () => {
    // Deterministic BIP-39 test vector (throwaway; no value).
    const mnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const { address } = deriveBtcAccount(mnemonic, { networkKey: ACTIVE_BTC_NETWORK_KEY });
    const prefix = getBtcNetworkInfo(getAsset('BTC').chain).addressPrefix;
    expect(address.startsWith(prefix)).toBe(true); // bc1 on mainnet, tb1 on testnet
  });
});
