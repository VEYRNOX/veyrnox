// wallet-core/rpcConfig.js
//
// Reads optional VITE_* env vars at startup and applies them as RPC overrides
// for each chain family. All three setters treat the endpoint as UNTRUSTED
// infrastructure (reads + broadcast only; signing is always local).
//
// Usage: import and call applyRpcEnvOverrides() once, before any wallet-core
// functions run (e.g. at the top of main.jsx).

import { setRpcUrl } from './evm/provider.js';
import { setEsploraUrl } from './btc/provider.js';
import { setSolRpcUrl } from './sol/provider.js';

export function applyRpcEnvOverrides() {
  // EVM — one override per network key (sepolia, mainnet, polygon, …)
  // e.g. VITE_EVM_RPC_URL_SEPOLIA=https://eth-sepolia.g.alchemy.com/v2/…
  const evmPrefix = 'VITE_EVM_RPC_URL_';
  for (const [key, val] of Object.entries(import.meta.env)) {
    if (key.startsWith(evmPrefix) && val) {
      const networkKey = key.slice(evmPrefix.length).toLowerCase();
      try { setRpcUrl(networkKey, val); } catch { /* unknown key — ignore */ }
    }
  }

  // BTC Esplora — VITE_BTC_ESPLORA_URL_<NETWORK> (e.g. _TESTNET, _MAINNET)
  const btcPrefix = 'VITE_BTC_ESPLORA_URL_';
  for (const [key, val] of Object.entries(import.meta.env)) {
    if (key.startsWith(btcPrefix) && val) {
      const networkKey = key.slice(btcPrefix.length).toLowerCase();
      try { setEsploraUrl(networkKey, val); } catch { /* unknown key — ignore */ }
    }
  }

  // Solana — VITE_SOL_RPC_URL_<NETWORK> (e.g. _DEVNET, _MAINNET)
  const solPrefix = 'VITE_SOL_RPC_URL_';
  for (const [key, val] of Object.entries(import.meta.env)) {
    if (key.startsWith(solPrefix) && val) {
      const networkKey = key.slice(solPrefix.length).toLowerCase();
      try { setSolRpcUrl(networkKey, val); } catch { /* unknown key — ignore */ }
    }
  }
}
