#!/usr/bin/env node
// scripts/btc-testnet-send.mjs
//
// Hands-on Bitcoin TESTNET verification harness — the BTC counterpart to the
// real Sepolia send that earned ETH its `live` status. Drives the SAME
// wallet-core/btc modules the app uses (no separate logic), so a green run here
// proves the production code path end-to-end on a live indexer.
//
// USAGE (testnet by default; add --network signet to use signet):
//   node scripts/btc-testnet-send.mjs derive  ["<mnemonic>"]
//   node scripts/btc-testnet-send.mjs balance  "<mnemonic>"
//   node scripts/btc-testnet-send.mjs plan     "<mnemonic>" <toAddress> <amountSats|max>
//   node scripts/btc-testnet-send.mjs send     "<mnemonic>" <toAddress> <amountSats|max>
//
// SAFETY: testnet/signet only — mainnet is gated in btc/networks.js and this
// script never selects it. Use a THROWAWAY mnemonic. The default mnemonic is the
// public BIP-39 test vector (fine to derive/read; never fund a public seed).

import { deriveBtcAccount } from '../src/wallet-core/btc/derivation.js';
import { getUtxos, getBalanceSats, getFeeRate } from '../src/wallet-core/btc/provider.js';
import { signAndBroadcastBtc, estimateBtcSend } from '../src/wallet-core/btc/send.js';
import { getBtcNetworkInfo } from '../src/wallet-core/btc/networks.js';

const PUBLIC_TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// --- arg parsing -------------------------------------------------------------
const argv = process.argv.slice(2);
let network = 'testnet';
const niCmd = argv.indexOf('--network');
if (niCmd !== -1) { network = argv[niCmd + 1]; argv.splice(niCmd, 2); }
const [cmd, mnemonicArg, toAddress, amountArg] = argv;
const mnemonic = mnemonicArg || PUBLIC_TEST_MNEMONIC;

if (!getBtcNetworkInfo(network)?.isTestnet) {
  console.error(`Refusing: "${network}" is not a testnet. This harness is testnet/signet only.`);
  process.exit(1);
}

function fmt(sats) { return `${sats} sats (${(Number(sats) / 1e8).toFixed(8)} BTC)`; }

function printPlan(plan) {
  console.log('  inputs:');
  for (const i of plan.inputs) console.log(`    - ${i.txid}:${i.vout}  ${fmt(i.value)}`);
  console.log('  outputs:');
  for (const o of plan.outputs) console.log(`    - ${o.address}  ${fmt(o.value)}${o.isChange ? '  <-- CHANGE (back to you)' : ''}`);
  console.log(`  fee:      ${fmt(plan.feeSats)}  (vsize ~${plan.vsize} vB @ ${plan.feeRate} sat/vB)`);
  if (plan.droppedToFeeSats > 0n) console.log(`  note:     ${fmt(plan.droppedToFeeSats)} of dust change folded into the fee`);
  const inSum = plan.inputs.reduce((s, i) => s + i.value, 0n);
  const outSum = plan.outputs.reduce((s, o) => s + o.value, 0n);
  console.log(`  CHECK:    inputs(${inSum}) === outputs(${outSum}) + fee(${plan.feeSats})  -> ${inSum === outSum + plan.feeSats ? 'OK ✅' : 'FAILED ❌'}`);
}

async function main() {
  const acct = deriveBtcAccount(mnemonic, { networkKey: network });
  const info = getBtcNetworkInfo(network);

  if (cmd === 'derive' || !cmd) {
    console.log(`network: ${info.name}`);
    console.log(`path:    ${acct.path}`);
    console.log(`address: ${acct.address}`);
    return;
  }

  if (cmd === 'balance') {
    const [utxos, bal, rate] = await Promise.all([
      getUtxos(network, acct.address),
      getBalanceSats(network, acct.address),
      getFeeRate(network),
    ]);
    console.log(`address: ${acct.address}`);
    console.log(`confirmed balance: ${fmt(bal)}`);
    console.log(`fee rate (6-block): ${rate} sat/vB`);
    console.log(`UTXOs (${utxos.length}):`);
    for (const u of utxos) console.log(`  - ${u.txid}:${u.vout}  ${fmt(u.value)}  ${u.confirmed ? 'confirmed' : 'UNCONFIRMED'}`);
    return;
  }

  if (cmd === 'plan' || cmd === 'send') {
    if (!toAddress || !amountArg) { console.error('Need: <toAddress> <amountSats|max>'); process.exit(1); }
    const sendMax = amountArg === 'max';

    if (cmd === 'plan') {
      // Dry-run via the SAME selection the send path uses (no broadcast).
      const { plan } = await estimateBtcSend({
        networkKey: network, fromAddress: acct.address, toAddress,
        amountSats: sendMax ? undefined : BigInt(amountArg), sendMax,
      });
      console.log(`DRY-RUN plan — sending ${sendMax ? 'MAX' : fmt(BigInt(amountArg))} to ${toAddress}:`);
      printPlan(plan);
      console.log('\nNo broadcast. Re-run with `send` to broadcast for real.');
      return;
    }

    // send: build -> sign locally -> broadcast.
    const res = await signAndBroadcastBtc({
      networkKey: network,
      privateKey: acct.privateKey,
      publicKey: acct.publicKey,
      fromAddress: acct.address,
      toAddress,
      amountSats: sendMax ? undefined : BigInt(amountArg),
      sendMax,
    });
    console.log('BROADCAST ✅');
    printPlan(res.plan);
    console.log(`\ntxid:     ${res.txid}`);
    console.log(`explorer: ${res.explorerUrl}`);
    return;
  }

  console.error(`Unknown command: ${cmd}. Use derive | balance | plan | send.`);
  process.exit(1);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
