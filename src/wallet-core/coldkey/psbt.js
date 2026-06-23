// wallet-core/coldkey/psbt.js
//
// COLD-KEY SIGNING (Feature 5) — BTC unsigned PSBT builder.
//
// Builds a BIP-174 PSBT for a coin-selection plan WITHOUT signing it. The wallet
// shows this PSBT (as a QR / file) to an EXTERNAL air-gapped signer; the signer
// holds the key, signs + finalizes, and returns signed bytes the wallet broadcasts.
//
// I1 — keys never leave the device: this artifact carries ONLY the public key,
// prevout scripts, amounts, and outputs. No private key, no secret. The signer is
// the only place the BTC key exists.
//
// Mirrors btc/send.js#buildAndSignTx exactly, MINUS tx.sign()/tx.finalize() — same
// inputs, same change/anti-fund-burn structure, so the unsigned PSBT a cold signer
// receives is byte-for-byte what the in-app path would have built.

import { hex, base64 } from '@scure/base';
import { Transaction, p2wpkh } from '@scure/btc-signer';

/**
 * Build an UNSIGNED PSBT from a coin-selection plan. PURE — no network, no signing.
 *
 * @param {object} args
 * @param {object} args.plan        coinselect.js plan: { inputs[], outputs[], feeSats }
 * @param {Uint8Array} args.publicKey  33-byte compressed pubkey controlling the inputs.
 * @param {object} args.params       @scure/btc-signer network params (net.params).
 * @returns {{ psbtBase64: string, psbtHex: string, inputCount: number, outputCount: number }}
 */
export function buildUnsignedPsbt({ plan, publicKey, params }) {
  if (!plan || !Array.isArray(plan.inputs) || !Array.isArray(plan.outputs)) {
    throw new Error('buildUnsignedPsbt: invalid plan');
  }
  // All UTXOs are controlled by this single key, so every input's prevout script is
  // this key's P2WPKH script — identical to the in-app signing path.
  const owner = p2wpkh(publicKey, params);
  const tx = new Transaction();
  for (const input of plan.inputs) {
    tx.addInput({
      txid: hex.decode(input.txid), // display-order; lib stores little-endian
      index: input.vout,
      witnessUtxo: { script: owner.script, amount: BigInt(input.value) },
    });
  }
  for (const out of plan.outputs) {
    tx.addOutputAddress(out.address, BigInt(out.value), params);
  }
  // DELIBERATELY NOT signing/finalizing — that happens on the external signer.
  const psbtBytes = tx.toPSBT();
  return {
    psbtBase64: base64.encode(psbtBytes),
    psbtHex: hex.encode(psbtBytes),
    inputCount: plan.inputs.length,
    outputCount: plan.outputs.length,
  };
}
