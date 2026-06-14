// wallet-core/evm/provider.js
//
// Swappable RPC provider for reads + broadcast. The provider is treated as
// UNTRUSTED infrastructure: it can be slow, lie about balances, or refuse to
// broadcast, but it can never see keys or forge signatures (those are local).
//
// A user-supplied RPC override is supported; default falls back to the
// network's public RPC. Per-network providers are cached.

import { JsonRpcProvider, formatEther } from 'ethers';
import { getNetwork } from './networks.js';

const _overrides = {}; // networkKey -> rpcUrl
const _cache = {};      // networkKey -> JsonRpcProvider

/** User override for a network's RPC URL. Pass null to clear. */
export function setRpcUrl(networkKey, url) {
  if (url) _overrides[networkKey] = url;
  else delete _overrides[networkKey];
  delete _cache[networkKey]; // force rebuild
}

export function getProvider(networkKey) {
  const net = getNetwork(networkKey); // throws if gated/disabled
  if (_cache[networkKey]) return _cache[networkKey];
  const url = _overrides[networkKey] || net.defaultRpcUrl;
  // staticNetwork avoids an extra eth_chainId round-trip and pins the chainId.
  //
  // batchMaxCount: 1 DISABLES JSON-RPC request batching. ethers v6 batches calls
  // into a single `[...]` POST by default; several public testnet RPCs (incl.
  // Arbitrum Sepolia) return a batched response that ethers cannot map in the
  // browser, throwing "could not coalesce error" from inside sendTransaction —
  // which surfaced as a Send that span forever and never broadcast (nonce never
  // advanced). Node tolerated the batch; the browser did not. One call per POST
  // costs a little latency but is correct everywhere. (Verified: Arbitrum Sepolia
  // tx 0x87ca786e… broadcast + confirmed from the browser with batching off.)
  const provider = new JsonRpcProvider(
    url,
    { chainId: net.chainId, name: net.name },
    { staticNetwork: true, batchMaxCount: 1 },
  );
  _cache[networkKey] = provider;
  return provider;
}

/** Read native balance (in ETH, as a string) from the chain — source of truth. */
export async function getBalanceEth(networkKey, address) {
  const provider = getProvider(networkKey);
  const wei = await provider.getBalance(address);
  return formatEther(wei);
}
