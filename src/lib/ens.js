// src/lib/ens.js
//
// On-chain ENS (.eth) name resolution using the ENS registry contract directly.
// Uses the caller-supplied ethers v6 provider — no third-party lookup service;
// all traffic goes to the user's configured RPC (same server used for tx broadcast).
//
// ENS registry is deployed at the same address on mainnet and Sepolia:
//   https://docs.ens.domains/learn/deployments
//
// Usage: pass a provider for the Ethereum network (mainnet or Sepolia).
//   On testnet (ALLOW_MAINNET=false) → pass getProvider('sepolia')
//   On mainnet (ALLOW_MAINNET=true)  → pass getProvider('mainnet')

import { Contract, namehash } from 'ethers';

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
const REGISTRY_ABI = ['function resolver(bytes32) view returns (address)'];
const RESOLVER_ABI = ['function addr(bytes32) view returns (address)'];
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

/**
 * Resolve an ENS name to an EVM address on-chain.
 *
 * Returns the resolved address (checksummed), or null if the name has no
 * resolver or no addr(60) record. Throws on RPC error — let the caller toast.
 *
 * @param {import('ethers').Provider} provider - ethers v6 provider (Ethereum network)
 * @param {string} name - ENS name, e.g. 'vitalik.eth'
 * @returns {Promise<string|null>}
 */
export async function resolveEnsName(provider, name) {
  const node = namehash(name);
  const registry = new Contract(ENS_REGISTRY, REGISTRY_ABI, provider);
  const resolverAddr = await registry.resolver(node);
  if (!resolverAddr || resolverAddr === ZERO_ADDR) return null;
  const resolver = new Contract(resolverAddr, RESOLVER_ABI, provider);
  const addr = await resolver.addr(node);
  return (addr && addr !== ZERO_ADDR) ? addr : null;
}
