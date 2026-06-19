// wallet-core/btc/send.js
//
// High-level BTC send: fetch UTXOs -> select coins + change (coinselect.js) ->
// build a PSBT/tx with @scure/btc-signer -> sign LOCALLY -> broadcast. The REAL
// replacement for any simulated send, and the BTC counterpart to evm/send.js.
//
// SECURITY / CORRECTNESS
//   - The signing key is supplied transiently by the caller (e.g. via
//     WalletProvider.withBtcPrivateKey) and used only inside this call. Never
//     persisted, never logged.
//   - Change handling lives entirely in coinselect.js and is RE-VERIFIED here:
//     after the tx is built we assert sum(inputs) === sum(outputs) + fee against
//     the bytes we're about to broadcast (tx.fee), so a build-time mismatch is
//     caught BEFORE any broadcast. This is the anti-fund-burn backstop.
//   - All UTXOs belong to the single wallet address, so every input's prevout
//     script is this key's P2WPKH script (witnessUtxo). One sign() call signs
//     them all; finalize() assembles the witnesses.
//   - The mainnet gate is enforced at broadcast (provider.broadcastTx) and the
//     network params come from the gated-aware registry.

import { hex } from '@scure/base';
import { Transaction, p2wpkh } from '@scure/btc-signer';
import { getBtcNetwork } from './networks.js';
import { assertValidBtcAddress } from './validate.js';
import { getUtxos, getFeeRate, broadcastTx } from './provider.js';
import { selectCoins, assertPlanConserves } from './coinselect.js';

/**
 * Build, sign, and finalize a transaction from a coin-selection plan. PURE — no
 * network — so the whole change-output pipeline is unit-testable without
 * broadcasting (see __tests__/btc-coinselect.test.js).
 *
 * RE-VERIFIES the anti-fund-burn invariant against the ACTUAL signed bytes: the
 * library-computed fee (sum(input amounts) − sum(output amounts)) must equal the
 * plan's fee. If a change output were dropped/miscomputed they would diverge.
 *
 * @returns {{ tx: import('@scure/btc-signer').Transaction, hex: string, txid: string, fee: bigint }}
 */
export function buildAndSignTx({ plan, privateKey, publicKey, params }) {
  assertPlanConserves(plan);
  // All UTXOs are controlled by this single key, so every input's prevout script
  // is this key's P2WPKH script.
  const owner = p2wpkh(publicKey, params);
  const tx = new Transaction();
  for (const input of plan.inputs) {
    tx.addInput({
      txid: hex.decode(input.txid), // display-order; lib stores little-endian
      index: input.vout,
      // P2WPKH spend: prove the input value + script being spent.
      witnessUtxo: { script: owner.script, amount: BigInt(input.value) },
    });
  }
  for (const out of plan.outputs) {
    tx.addOutputAddress(out.address, BigInt(out.value), params);
  }
  tx.sign(privateKey);
  tx.finalize();
  if (tx.fee !== plan.feeSats) {
    throw new Error(`Built-tx fee ${tx.fee} != planned fee ${plan.feeSats}; refusing (change-output mismatch).`);
  }
  return { tx, hex: tx.hex, txid: tx.id, fee: tx.fee };
}

/**
 * Estimate a send WITHOUT signing — for a confirm screen. Fetches live UTXOs and
 * fee rate, runs coin selection, and returns the plan (amounts in sats).
 */
export async function estimateBtcSend({ networkKey, fromAddress, toAddress, amountSats, sendMax = false, feeRate = undefined, changeAddress = undefined }) {
  const net = getBtcNetwork(networkKey); // gate-aware
  // Reject a wrong-network / malformed recipient EARLY (before any UTXO/fee fetch)
  // with a legible error — network-correct via the same library used at sign time.
  assertValidBtcAddress(toAddress, net.params);
  const [utxos, rate] = await Promise.all([
    getUtxos(networkKey, fromAddress),
    feeRate != null ? Promise.resolve(feeRate) : getFeeRate(networkKey),
  ]);
  const plan = selectCoins({
    utxos,
    toAddress,
    amountSats: sendMax ? undefined : BigInt(amountSats),
    changeAddress: changeAddress || fromAddress, // change-to-self (see coinselect.js)
    feeRate: rate,
    sendMax,
  });
  return { plan, network: net };
}

/**
 * Sign locally and broadcast a real testnet transaction.
 *
 * @param {object} params
 * @param {string} params.networkKey
 * @param {Uint8Array} params.privateKey  - LIVE SECRET (transient).
 * @param {Uint8Array} params.publicKey   - 33-byte compressed pubkey for the from address.
 * @param {string} params.fromAddress     - the wallet's P2WPKH address (owns the UTXOs).
 * @param {string} params.toAddress
 * @param {bigint|number|string} [params.amountSats]
 * @param {boolean} [params.sendMax=false]
 * @param {number} [params.feeRate]       - override sat/vB; else fetched.
 * @param {string} [params.changeAddress] - defaults to fromAddress (change-to-self).
 * @returns {Promise<{ txid:string, hex:string, explorerUrl:string, plan:object }>}
 */
export async function signAndBroadcastBtc({
  networkKey,
  privateKey,
  publicKey,
  fromAddress,
  toAddress,
  amountSats,
  sendMax = false,
  feeRate,
  changeAddress,
}) {
  const net = getBtcNetwork(networkKey); // throws if mainnet gated / disabled
  // Reject a wrong-network / malformed recipient EARLY, before any UTXO/fee fetch.
  assertValidBtcAddress(toAddress, net.params);

  // The single owned address' P2WPKH script — the prevout script of every UTXO.
  const owner = p2wpkh(publicKey, net.params);
  if (owner.address !== fromAddress) {
    // Defense-in-depth: the supplied key must actually control fromAddress, or
    // the witnessUtxo scripts wouldn't match and signing/relay would fail.
    throw new Error('Provided key does not control the from address');
  }

  const [utxos, rate] = await Promise.all([
    getUtxos(networkKey, fromAddress),
    feeRate != null ? Promise.resolve(feeRate) : getFeeRate(networkKey),
  ]);

  const plan = selectCoins({
    utxos,
    toAddress,
    amountSats: sendMax ? undefined : BigInt(amountSats),
    changeAddress: changeAddress || fromAddress,
    feeRate: rate,
    sendMax,
  });

  // Build + sign + finalize, with the fee/change backstop baked in.
  const { hex: rawHex, txid: localTxid } = buildAndSignTx({
    plan, privateKey, publicKey, params: net.params,
  });

  const txid = await broadcastTx(networkKey, rawHex);

  return {
    txid: txid || localTxid,
    hex: rawHex,
    explorerUrl: `${net.explorer}/tx/${txid || localTxid}`,
    plan,
  };
}
