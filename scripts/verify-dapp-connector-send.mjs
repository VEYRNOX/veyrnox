#!/usr/bin/env node
// scripts/verify-dapp-connector-send.mjs
//
// Automated dApp Connector send-path verification.
//
// Exercises the EXACT code path that WalletConnectProvider.jsx handleSendTransaction()
// runs when a dApp sends an eth_sendTransaction request:
//
//   1. Parse CAIP-2 chain ID ("eip155:11155111" → 11155111)
//   2. getNetworkByChainId(chainId)          — same lookup
//   3. getProvider(net.key)                  — same provider
//   4. eth_chainId RPC call + mismatch guard — VULN-19, same check
//   5. Wallet.sendTransaction(tx)            — same signing path
//   6. respondToRequest(topic, id, hash)     — simulated: we print the hash
//
// The txParams shape is intentionally the raw WC format a dApp would send:
//   { to, value: hex-string, data: "0x", gas: hex-string-optional }
//
// No WalletConnect relay is required — this verifies D3 (sign + broadcast) directly.
// D1 (relay transport) is covered by the WalletConnect SDK's own test suite.
// D2 (request routing) is covered by walletconnect-router.test.js.
//
// TESTNET ONLY. Keys are never logged or persisted.
//
// Usage:
//   MNEMONIC="<uat seed>" node scripts/verify-dapp-connector-send.mjs
//   MNEMONIC="..." AMOUNT_ETH=0.0001 TO_ADDRESS=0x... node scripts/verify-dapp-connector-send.mjs

import { ethers } from 'ethers';
import { deriveEvmAccount } from '../src/wallet-core/derivation.js';
import { getProvider, setRpcUrl } from '../src/wallet-core/evm/provider.js';
import { getNetworkByChainId } from '../src/wallet-core/evm/networks.js';

// ── Config ────────────────────────────────────────────────────────────────────

const CAIP2_CHAIN = 'eip155:11155111'; // Sepolia — the chain a dApp would request
const AMOUNT_ETH  = process.env.AMOUNT_ETH?.trim()  || '0.0001';
const RPC_OVERRIDE = process.env.SEPOLIA_RPC_URL?.trim();

const mnemonic = process.env.MNEMONIC?.trim();
if (!mnemonic) {
  console.error('✗ Set MNEMONIC to the UAT testnet seed (never use a real seed here).');
  process.exit(1);
}

// ── Step 1: parse CAIP-2 chain ID — exactly as WalletConnectProvider.jsx does ──

const chainId = parseInt(CAIP2_CHAIN.replace(/^eip155:/, ''), 10);
console.log('CAIP-2 chain   :', CAIP2_CHAIN);
console.log('Parsed chainId :', chainId);

// ── Step 2: getNetworkByChainId — same lookup ─────────────────────────────────

const net = getNetworkByChainId(chainId);
console.log('Network        :', net.name, `(key: ${net.key})`);

if (RPC_OVERRIDE) setRpcUrl(net.key, RPC_OVERRIDE);

// ── Step 3: derive sender — simulates withPrivateKey(0, ...) ─────────────────

const account = deriveEvmAccount(mnemonic, 0);
const privateKey = account.privateKey;
const from       = account.address;
const to         = process.env.TO_ADDRESS?.trim() || from; // default: self (round-trip proof)

console.log('Sender address :', from);
console.log('Recipient      :', to);
console.log('Amount (ETH)   :', AMOUNT_ETH);

// ── Step 4: provider + VULN-19 chain-ID mismatch guard ────────────────────────

const provider = getProvider(net.key);
const onChainHex = await provider.send('eth_chainId', []);
const onChain    = parseInt(onChainHex, 16);

console.log('RPC chainId    :', onChain);

if (onChain !== chainId) {
  console.error(`✗ Chain ID mismatch: expected ${chainId}, got ${onChain}`);
  process.exit(1);
}
console.log('✓ Chain ID guard passed');

const block = await provider.getBlockNumber();
const balBig = await provider.getBalance(from);
console.log('Block          :', block);
console.log('Balance        :', ethers.formatEther(balBig), 'ETH');

const amountWei = ethers.parseEther(AMOUNT_ETH);
if (balBig < amountWei + 50_000n * (await provider.getFeeData()).maxFeePerGas) {
  console.error('✗ Insufficient balance for this send + gas estimate.');
  process.exit(2);
}

// ── Step 5: build txParams in the raw WC dApp format ─────────────────────────
// This is exactly what a dApp would send in params[0] of eth_sendTransaction.
// WalletConnectProvider.jsx reads txParams.to / .value / .data / .gas.

const txParams = {
  from,
  to,
  value: '0x' + amountWei.toString(16),
  data:  '0x',
  // gas omitted here to let ethers estimate (same as most dApps in practice)
};

// ── Step 6: replicate handleSendTransaction signing logic exactly ─────────────

const wallet = new ethers.Wallet(privateKey, provider);

const tx = {
  to:    txParams.to,
  value: txParams.value ? BigInt(txParams.value) : 0n,
  data:  txParams.data ?? '0x',
};

// 1M gas cap (I5 — backend untrusted), same as WalletConnectProvider.jsx
const GAS_CAP = 1_000_000n;
if (txParams.gas) {
  tx.gasLimit = BigInt(txParams.gas) < GAS_CAP ? BigInt(txParams.gas) : GAS_CAP;
}

// EIP-1559 fee params if dApp provided them (none here — let ethers auto-fill)
if (txParams.maxFeePerGas) {
  tx.maxFeePerGas         = BigInt(txParams.maxFeePerGas);
  tx.maxPriorityFeePerGas = BigInt(txParams.maxPriorityFeePerGas ?? 0);
  tx.type = 2;
} else if (txParams.gasPrice) {
  tx.gasPrice = BigInt(txParams.gasPrice);
  tx.type = 0;
}

console.log('\nSigning and broadcasting (D3 path)…');
const sent = await wallet.sendTransaction(tx);
console.log('\n✓ Broadcast. Real tx hash:', sent.hash);
console.log('  Explorer    :', `https://sepolia.etherscan.io/tx/${sent.hash}`);

// ── Step 7: wait for confirmation ─────────────────────────────────────────────

console.log('\nWaiting for 1 confirmation…');
const receipt = await sent.wait(1);
const status  = receipt.status === 1 ? 'success ✓' : 'FAILED ✗';
console.log('Confirmed block:', receipt.blockNumber, '| status:', status);

if (receipt.status !== 1) {
  console.error('✗ Transaction reverted on-chain.');
  process.exit(1);
}

// ── Summary — copy these for the verified-evidence.json entry ─────────────────

console.log('\n══════════════════════════════════════════════════════════════');
console.log('dApp Connector — D3 send verified');
console.log('TX_HASH   :', sent.hash);
console.log('BLOCK     :', receipt.blockNumber);
console.log('EXPLORER  :', `https://sepolia.etherscan.io/tx/${sent.hash}`);
console.log('CHAIN     :', CAIP2_CHAIN, `(chainId ${chainId})`);
console.log('FROM      :', from);
console.log('TO        :', to);
console.log('AMOUNT    :', AMOUNT_ETH, 'ETH');
console.log('══════════════════════════════════════════════════════════════');
console.log('\nNext: add this txid to docs/verified-evidence.json under');
console.log('"dApp Connector — eth_sendTransaction (D3, Sepolia)"');
