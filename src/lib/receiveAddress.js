// lib/receiveAddress.js
//
// Resolve the CORRECT receive address + network label for a given asset, pulling
// the address straight from the already-derived WalletProvider accounts. This is
// fund-safety logic, not cosmetics: the address shown (and QR-encoded) for an
// asset MUST belong to that asset's chain, or a user loses funds.
//
// HARD RULES enforced here:
//   - EVM family (native EVM coins + ERC-20 tokens) all share ONE secp256k1
//     address (accounts[0]); the per-asset chain only changes the LABEL, never
//     the address. An ERC-20 receive address is the same EVM address — the UI
//     must make the network unmistakable so a token isn't sent on the wrong chain.
//   - BTC uses the separately-derived bech32 address (btcAccount).
//   - SOL uses the separately-derived base58 address (solAccount).
//   - We NEVER re-derive or touch wallet-core crypto here; we only read the public
//     addresses the provider already exposes. A locked wallet (or a not-yet-derived
//     chain account) yields address: null, and the UI shows the locked state.
//   - `coming_soon` assets (canReceive === false) NEVER expose an address.

import { getAsset, canReceive, isEvmFamily } from '@/wallet-core/assets';
import { getNetworkInfo } from '@/wallet-core/evm/networks';
import { getBtcNetworkInfo } from '@/wallet-core/btc/networks';
import { getSolNetworkInfo } from '@/wallet-core/sol/networks';

/**
 * @param {string} symbol  asset symbol (e.g. 'ETH', 'USDC', 'BTC', 'SOL')
 * @param {object} wallet  the live WalletProvider value (or a subset):
 *                         { accounts, btcAccount, solAccount }
 * @returns {null | {
 *   asset, family, isErc20, receivable,
 *   network: null | { key, name, isTestnet },
 *   address: string | null   // null while locked / not derived / coming_soon
 * }}
 */
export function resolveReceive(symbol, { accounts, btcAccount, solAccount } = {}) {
  const asset = getAsset(symbol);
  if (!asset) return null;

  const receivable = canReceive(asset);
  const isErc20 = asset.family === 'erc20';

  let network = null;
  let address = null;

  if (isEvmFamily(asset)) {
    // Display-only network lookup (never gated) for the chain LABEL. The address
    // is the single shared EVM account; every EVM chain derives the same one.
    const net = getNetworkInfo(asset.chain);
    network = net ? { key: net.key, name: net.name, isTestnet: net.isTestnet } : null;
    address = receivable ? (accounts?.[0]?.address ?? null) : null;
  } else if (asset.family === 'btc') {
    const net = getBtcNetworkInfo(asset.chain);
    network = net ? { key: net.key, name: net.name, isTestnet: net.isTestnet } : null;
    address = receivable ? (btcAccount?.address ?? null) : null;
  } else if (asset.family === 'solana') {
    const net = getSolNetworkInfo(asset.chain);
    network = net ? { key: net.key, name: net.name, isTestnet: net.isTestnet } : null;
    address = receivable ? (solAccount?.address ?? null) : null;
  }

  return { asset, family: asset.family, isErc20, receivable, network, address };
}
