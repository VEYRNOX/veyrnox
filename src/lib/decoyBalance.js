// lib/decoyBalance.js
//
// DECOY BALANCE helper (S3 — duress decoy plausibility).  PROVISIONAL.
//
// A decoy wallet is only convincing under coercion if it holds a SMALL, REAL,
// block-explorer-verifiable balance — a coercer can paste the decoy address into
// Etherscan, so a faked/hardcoded UI number would expose the decoy instantly.
//
// This module resolves the decoy's native testnet balance with a strict split:
//   - REAL / native / web (DEMO === false): read the balance straight from the
//     chain via the EXISTING provider path (`getBalanceEth('sepolia', addr)` =
//     `eth_getBalance`). This is the SAME source of truth the rest of the wallet
//     uses, so the number always matches what the coercer sees on the explorer.
//   - DEMO (DEMO === true): a freshly generated decoy address cannot actually
//     hold live funds on a simulator, so we read a SEEDED amount from
//     localStorage and label it clearly as a demo simulation. The seed is keyed
//     by address, so "funding" the decoy in the demo persists per-address and
//     behaves like a real top-up — but it is explicitly NOT an on-chain read.
//
// This module performs READS ONLY and never touches keys, signing, or vault
// crypto. Testnet only (`getBalanceEth` routes through the mainnet-gated
// networks.js, so it can never read a mainnet balance pre-audit).

import { DEMO } from '@/api/demoClient';
import { getBalanceEth } from '@/wallet-core/evm/provider';
import { isDeniabilitySessionActive } from '@/wallet-core/deniabilitySession.js';

// The chain the decoy's native balance is read from / funded on. Sepolia is the
// app's default enabled testnet; one address serves every EVM chain, so the
// decoy address shown here is the same one a coercer would check.
export const DECOY_NETWORK_KEY = 'sepolia';

// localStorage namespace for the DEMO seeded balances (address -> ETH string).
// DEMO-only: in real/native builds the balance is never read from here.
const DEMO_SEED_KEY = 'veyrnox-decoy-demo-balances';

function readDemoSeeds() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_SEED_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

/** DEMO ONLY: seed/replace a plausible decoy balance (ETH string) for an address. */
export function seedDemoDecoyBalance(address, eth) {
  if (!DEMO || !address) return;
  try {
    const all = readDemoSeeds();
    all[address.toLowerCase()] = String(eth);
    localStorage.setItem(DEMO_SEED_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable — demo seeding is best-effort, non-fatal. */
  }
}

/** DEMO ONLY: the seeded balance for an address as an ETH string ('0' if none). */
export function getDemoDecoyBalance(address) {
  if (!address) return '0';
  const all = readDemoSeeds();
  return all[address.toLowerCase()] || '0';
}

/**
 * Resolve the decoy's native testnet balance as an ETH string.
 *   - DEMO  : the seeded amount (simulated; see header).  source: 'demo-seed'
 *   - real  : a live on-chain `eth_getBalance` read.       source: 'chain'
 * @param {string} address
 * @returns {Promise<{ eth: string, source: 'demo-seed'|'chain' }>}
 */
export async function resolveDecoyBalance(address) {
  // I3: this function performs a live eth_getBalance RPC. It must never run
  // inside a deniability session — fail closed on the exported function itself,
  // not just on some callers, so a future caller can't leak egress.
  if (isDeniabilitySessionActive()) throw new Error('I3: no egress in deniability session');
  if (!address) return { eth: '0', source: DEMO ? 'demo-seed' : 'chain' };
  if (DEMO) {
    return { eth: getDemoDecoyBalance(address), source: 'demo-seed' };
  }
  const eth = await getBalanceEth(DECOY_NETWORK_KEY, address);
  return { eth, source: 'chain' };
}
