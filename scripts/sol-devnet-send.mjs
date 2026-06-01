#!/usr/bin/env node
// scripts/sol-devnet-send.mjs
//
// Hands-on Solana DEVNET verification harness — the SOL counterpart to the real
// Sepolia / Bitcoin-testnet sends that earned ETH/BTC their status. Drives the
// SAME wallet-core/sol modules the app uses (no separate logic), so a green run
// here proves the production code path end-to-end on a live RPC — including the
// two Solana traps: fresh-blockhash-at-send (with expiry retry) and the
// rent-exempt minimum guard.
//
// Runs in NODE (where `Buffer` is native, so @solana/web3.js works without a
// browser polyfill). This is the intended verification path before flipping SOL
// to `live`.
//
// USAGE (devnet by default; add --network testnet to use Solana testnet):
//   node scripts/sol-devnet-send.mjs derive   ["<mnemonic>"]
//   node scripts/sol-devnet-send.mjs balance   "<mnemonic>"
//   node scripts/sol-devnet-send.mjs airdrop   "<mnemonic>" [sol]     # devnet faucet
//   node scripts/sol-devnet-send.mjs plan      "<mnemonic>" <toAddress> <amountSol|max>
//   node scripts/sol-devnet-send.mjs send      "<mnemonic>" <toAddress> <amountSol|max>
//
// Add `--rpc <url>` to point at an ALTERNATE devnet/testnet RPC (e.g. a free
// Helius/QuickNode endpoint) when the public faucet is dry/rate-limited:
//   node scripts/sol-devnet-send.mjs airdrop "<mnemonic>" 1 --rpc https://<your-devnet-rpc>
//
// SAFETY: devnet/testnet only — mainnet is gated in sol/networks.js and this
// script never selects it. Use a THROWAWAY mnemonic. The default mnemonic is the
// public BIP-39 test vector (fine to derive/read; never fund a public seed for
// real value).

import { deriveSolAccount } from '../src/wallet-core/sol/derivation.js';
import {
  getBalanceLamports,
  getRentExemptMinimum,
  getLamportsPerSignature,
  getConnection,
  LAMPORTS_PER_SOL,
} from '../src/wallet-core/sol/provider.js';
import { estimateSolSend, signAndBroadcastSol } from '../src/wallet-core/sol/send.js';
import { getSolNetworkInfo, solExplorerUrl } from '../src/wallet-core/sol/networks.js';
import { setSolRpcUrl } from '../src/wallet-core/sol/provider.js';
import { PublicKey } from '@solana/web3.js';

const PUBLIC_TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// --- arg parsing -------------------------------------------------------------
const argv = process.argv.slice(2);
let network = 'devnet';
const niCmd = argv.indexOf('--network');
if (niCmd !== -1) { network = argv[niCmd + 1]; argv.splice(niCmd, 2); }
// Optional --rpc <url> override: point the SAME provider at an alternate
// devnet/testnet RPC (e.g. a Helius/QuickNode endpoint whose faucet/airdrop
// isn't dry like the public api.devnet.solana.com one). Routed through the
// production setSolRpcUrl, so reads/broadcast use it too. The mainnet gate is
// UNAFFECTED — getSolNetwork() still refuses mainnet regardless of the URL.
let rpcUrl = null;
const riCmd = argv.indexOf('--rpc');
if (riCmd !== -1) { rpcUrl = argv[riCmd + 1]; argv.splice(riCmd, 2); }
const [cmd, mnemonicArg, toAddress, amountArg] = argv;
const mnemonic = mnemonicArg || PUBLIC_TEST_MNEMONIC;

if (!getSolNetworkInfo(network)?.isTestnet) {
  console.error(`Refusing: "${network}" is not a testnet/devnet. This harness is devnet/testnet only.`);
  process.exit(1);
}

if (rpcUrl) setSolRpcUrl(network, rpcUrl);

const toSol = (lamports) => (Number(lamports) / LAMPORTS_PER_SOL).toFixed(9);
const fmt = (lamports) => `${lamports} lamports (${toSol(lamports)} SOL)`;
const solToLamports = (sol) => BigInt(Math.round(Number(sol) * LAMPORTS_PER_SOL));

function printPlan(plan) {
  console.log(`  amount:    ${fmt(plan.amountLamports)}`);
  console.log(`  fee:       ${fmt(plan.feeLamports)}`);
  console.log(`  remainder: ${fmt(plan.remainderLamports)}${plan.remainderLamports === 0n ? '  (account emptied)' : ''}`);
  console.log(`  sendMax:   ${plan.sendMax}`);
}

async function main() {
  const acct = deriveSolAccount(mnemonic);
  const info = getSolNetworkInfo(network);

  if (cmd === 'derive' || !cmd) {
    console.log(`network: ${info.name}`);
    console.log(`path:    ${acct.path}`);
    console.log(`address: ${acct.address}`);
    console.log(`explorer: ${solExplorerUrl(network, 'address', acct.address)}`);
    return;
  }

  if (cmd === 'balance') {
    const [bal, rentMin, fee] = await Promise.all([
      getBalanceLamports(network, acct.address),
      getRentExemptMinimum(network, 0),
      getLamportsPerSignature(network),
    ]);
    console.log(`address: ${acct.address}`);
    console.log(`confirmed balance:   ${fmt(bal)}`);
    console.log(`rent-exempt minimum: ${fmt(rentMin)}`);
    console.log(`fee per signature:   ${fmt(fee)}`);
    console.log(`explorer: ${solExplorerUrl(network, 'address', acct.address)}`);
    return;
  }

  if (cmd === 'airdrop') {
    // Devnet faucet. testnet airdrops are often rate-limited; devnet is reliable.
    const sol = Number(toAddress || amountArg || '1'); // positional reuse: "<mnemonic>" [sol]
    const amt = Number.isFinite(sol) && sol > 0 ? sol : 1;
    const conn = getConnection(network);
    console.log(`requesting airdrop of ${amt} SOL to ${acct.address} on ${info.name} …`);
    const sig = await conn.requestAirdrop(new PublicKey(acct.address), Math.round(amt * LAMPORTS_PER_SOL));
    const bh = await conn.getLatestBlockhash('confirmed');
    await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
    console.log(`airdrop ✅  ${solExplorerUrl(network, 'tx', sig)}`);
    console.log(`new balance: ${fmt(await getBalanceLamports(network, acct.address))}`);
    return;
  }

  if (cmd === 'plan' || cmd === 'send') {
    if (!toAddress || !amountArg) { console.error('Need: <toAddress> <amountSol|max>'); process.exit(1); }
    const sendMax = amountArg === 'max';
    const amountLamports = sendMax ? undefined : solToLamports(amountArg);

    if (cmd === 'plan') {
      const { plan } = await estimateSolSend({
        networkKey: network, fromAddress: acct.address, toAddress, amountLamports, sendMax,
      });
      console.log(`DRY-RUN plan — sending ${sendMax ? 'MAX' : `${amountArg} SOL`} to ${toAddress}:`);
      printPlan(plan);
      console.log('\nNo broadcast. Re-run with `send` to broadcast for real.');
      return;
    }

    const res = await signAndBroadcastSol({
      networkKey: network,
      privateKey: acct.privateKey,
      fromAddress: acct.address,
      toAddress,
      amountLamports,
      sendMax,
    });
    console.log(`BROADCAST ✅  (after ${res.attempts} blockhash attempt${res.attempts > 1 ? 's' : ''})`);
    printPlan(res.plan);
    console.log(`\nsignature: ${res.signature}`);
    console.log(`explorer:  ${res.explorerUrl}`);
    return;
  }

  console.error(`Unknown command: ${cmd}. Use derive | balance | airdrop | plan | send.`);
  process.exit(1);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
