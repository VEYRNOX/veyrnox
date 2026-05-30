#!/usr/bin/env node
// scripts/sepolia-send-proof.mjs
//
// Manual Sepolia (testnet) send proof. Exercises the SAME integrated wallet-core
// path the app uses — BIP-44 derivation -> local signing -> broadcast -> confirm —
// and prints the REAL chain tx hash. Testnet only; mainnet stays gated.
//
// Keys NEVER leave this process and are NEVER logged or persisted.
//
// Usage (PowerShell):
//   $env:MNEMONIC = "<your 12/24 word testnet seed>"   # OR $env:PRIVATE_KEY = "0x..."
//   $env:TO_ADDRESS = "0x..."                          # recipient (defaults to self)
//   $env:AMOUNT_ETH = "0.0001"
//   $env:SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com"  # optional override
//   node scripts/sepolia-send-proof.mjs
//
// With no funds, it derives + prints your address and a faucet hint, then exits.

import { deriveEvmAccount } from '../src/wallet-core/derivation.js';
import { setRpcUrl, getProvider, getBalanceEth } from '../src/wallet-core/evm/provider.js';
import { signAndBroadcast } from '../src/wallet-core/evm/send.js';
import { Wallet } from 'ethers';

const NETWORK = 'sepolia';

function fail(msg) { console.error(`\n✗ ${msg}`); process.exit(1); }

const rpc = process.env.SEPOLIA_RPC_URL;
if (rpc) setRpcUrl(NETWORK, rpc);

const mnemonic = process.env.MNEMONIC?.trim();
const pkEnv = process.env.PRIVATE_KEY?.trim();
const amountEth = process.env.AMOUNT_ETH?.trim() || '0.0001';

if (!mnemonic && !pkEnv) fail('Set MNEMONIC or PRIVATE_KEY (testnet only).');

// Resolve the signing key + sender address from the integrated derivation path.
let privateKey, from;
if (mnemonic) {
  const acct = deriveEvmAccount(mnemonic, 0);
  privateKey = acct.privateKey;
  from = acct.address;
} else {
  privateKey = pkEnv.startsWith('0x') ? pkEnv : `0x${pkEnv}`;
  from = new Wallet(privateKey).address;
}

const to = process.env.TO_ADDRESS?.trim() || from; // default: send to self (round-trip proof)

console.log('Network        :', NETWORK);
console.log('Sender address :', from);
console.log('Recipient      :', to);
console.log('Amount (ETH)   :', amountEth);

// Prove the provider reaches the chain and report the on-chain balance (truth).
const provider = getProvider(NETWORK);
const live = await provider.getNetwork();
console.log('Live chainId   :', Number(live.chainId), '| block', await provider.getBlockNumber());

const balEth = await getBalanceEth(NETWORK, from);
console.log('Balance (chain):', balEth, 'ETH');

if (parseFloat(balEth) <= parseFloat(amountEth)) {
  console.log(`\nThis address is not funded enough to send ${amountEth} ETH.`);
  console.log('Fund it from a Sepolia faucet, then re-run:');
  console.log('  • https://sepoliafaucet.com');
  console.log('  • https://www.alchemy.com/faucets/ethereum-sepolia');
  console.log('  • https://faucet.quicknode.com/ethereum/sepolia');
  console.log(`\nFund this address: ${from}`);
  process.exit(2);
}

console.log('\nSigning locally and broadcasting…');
const tx = await signAndBroadcast({ networkKey: NETWORK, privateKey, to, amountEth });
console.log('\n✓ Broadcast. REAL tx hash:', tx.hash);
console.log('  Explorer:', tx.explorerUrl);

console.log('\nWaiting for 1 confirmation…');
const receipt = await tx.wait(1);
console.log('✓ Confirmed in block', receipt.blockNumber, '| status', receipt.status === 1 ? 'success' : 'failed');
console.log('\nTX_HASH=' + tx.hash);
