// wallet-core/btc/hw-send.js
//
// Hardware-wallet BTC signing for Ledger and Trezor.
// BUILT — unverified pending real-device testnet confirmation (no txid yet).
//
// Coin selection and the anti-fund-burn backstop (assertPlanConserves) are
// identical to btc/send.js. The only change is signing:
//
//   Ledger  — uses the @ledgerhq/hw-app-btc legacy API (createPaymentTransaction
//             with segwit=true). Fetches each input's raw tx from Esplora so the
//             device can validate input amounts.
//
//   Trezor  — maps the coin-selection plan to Trezor's input/output format and
//             calls TrezorConnect.signTransaction(). The returned serializedTx is
//             broadcast directly.
//
// No private key ever touches this module. I1 preserved.

import AppBtc from '@ledgerhq/hw-app-btc';
import TrezorConnect from '@trezor/connect-web';
import { p2wpkh } from '@scure/btc-signer';
import { hex, bech32 } from '@scure/base';
import { getBtcNetwork } from './networks.js';
import { getUtxos, getFeeRate, broadcastTx } from './provider.js';
import { selectCoins, assertPlanConserves } from './coinselect.js';
import { btcTxidFromHex } from './send.js';

// BIP-84 P2WPKH paths
const BTC_PATH_TESTNET = "84'/1'/0'/0/0";
const BTC_PATH_MAINNET = "84'/0'/0'/0/0";

// BIP32 hardened flag
const H = 0x80000000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function btcPath(isTestnet) {
  return isTestnet ? BTC_PATH_TESTNET : BTC_PATH_MAINNET;
}

// BIP32 path as uint32 array (change=1 for change outputs)
function pathArray(isTestnet, change = 0) {
  return isTestnet
    ? [H | 84, H | 1, H | 0, change, 0]
    : [H | 84, H | 0, H | 0, change, 0];
}

// Resolve the Esplora base URL for raw-tx fetches
function esploraBaseUrl(networkKey) {
  const net = getBtcNetwork(networkKey);
  return net.defaultEsploraUrl;
}

// Fetch the raw tx hex from Esplora for a given txid
async function getRawTxHex(networkKey, txid) {
  const base = esploraBaseUrl(networkKey);
  const res = await fetch(`${base}/tx/${txid}/hex`);
  if (!res.ok) throw new Error(`Esplora ${res.status} fetching raw tx ${txid}`);
  return res.text();
}

// ── Shared: coin selection ────────────────────────────────────────────────────

async function buildPlan({ networkKey, fromAddress, toAddress, amountSats, sendMax, feeRate, changeAddress }) {
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
  assertPlanConserves(plan);
  return plan;
}

// ── Script helpers ────────────────────────────────────────────────────────────

/**
 * Decode a native segwit (bech32) address → P2WPKH scriptPubKey bytes.
 * Only P2WPKH (witness v0, 20-byte hash) is needed for BIP-84 send.
 */
function p2wpkhScriptFromAddress(address) {
  const { words } = bech32.decode(address);
  const version = words[0];
  const hash = new Uint8Array(bech32.fromWords(words.slice(1)));
  if (version !== 0 || hash.length !== 20) {
    throw new Error(`Unsupported address for Ledger signing: ${address}`);
  }
  // OP_0 OP_PUSHBYTES_20 <hash>
  return new Uint8Array([0x00, 0x14, ...hash]);
}

/** Encode an integer as a Bitcoin varint (hex string). */
function varintHex(n) {
  if (n < 0xfd) return Buffer.from([n]).toString('hex');
  if (n <= 0xffff) {
    const b = Buffer.alloc(3);
    b[0] = 0xfd;
    b.writeUInt16LE(n, 1);
    return b.toString('hex');
  }
  const b = Buffer.alloc(5);
  b[0] = 0xfe;
  b.writeUInt32LE(n, 1);
  return b.toString('hex');
}

/**
 * Serialize the plan's outputs in raw-tx output format as a hex string.
 * Ledger's createPaymentTransaction expects this (NOT a full raw tx).
 */
function buildOutputScriptHex(outputs) {
  const parts = [];
  for (const out of outputs) {
    const script = p2wpkhScriptFromAddress(out.address);
    const valueBuf = Buffer.alloc(8);
    valueBuf.writeBigInt64LE(BigInt(out.value));
    parts.push(valueBuf.toString('hex'));
    parts.push(varintHex(script.length));
    parts.push(Buffer.from(script).toString('hex'));
  }
  return parts.join('');
}

// ── Ledger ────────────────────────────────────────────────────────────────────

/**
 * Sign and broadcast via a connected Ledger using the legacy
 * createPaymentTransaction API (compatible with old and new Bitcoin apps).
 *
 * Each input's raw transaction is fetched from Esplora so the device can
 * verify the input amounts (required for segwit signing security).
 *
 * @param {{ transport, networkKey, fromAddress, btcPublicKeyHex, toAddress, amountSats?, sendMax?, feeRate?, changeAddress? }} params
 * @returns {Promise<{ txid: string, explorerUrl: string, plan: object }>}
 */
export async function signAndBroadcastBtcLedger({
  transport,
  networkKey,
  fromAddress,
  btcPublicKeyHex,
  toAddress,
  amountSats,
  sendMax = false,
  feeRate = null,
  changeAddress = null,
}) {
  const net    = getBtcNetwork(networkKey);
  const isTest = net.key !== 'mainnet';
  const pubKey = hex.decode(btcPublicKeyHex);
  const owner  = p2wpkh(pubKey, net.params);

  if (owner.address !== fromAddress) {
    throw new Error('Hardware wallet public key does not match from address');
  }

  const plan = await buildPlan({ networkKey, fromAddress, toAddress, amountSats, sendMax, feeRate, changeAddress });

  const btcApp = new AppBtc({ transport, currency: isTest ? 'bitcoin_testnet' : 'bitcoin' });
  const path   = btcPath(isTest);

  // Fetch raw tx hex for each UTXO so Ledger can validate amounts
  const rawTxHexes = await Promise.all(plan.inputs.map(u => getRawTxHex(networkKey, u.txid)));

  // Split each input tx into Ledger's internal format
  const inputs = /** @type {[any, number, string | undefined, number | undefined][]} */ (plan.inputs.map((utxo, i) => [
    btcApp.splitTransaction(rawTxHexes[i], true /* isSegwit */),
    utxo.vout,
    undefined, // redeemScript — not needed for native segwit P2WPKH
    undefined, // sequence
  ]));

  const outputScriptHex = buildOutputScriptHex(plan.outputs);

  const signedHex = await btcApp.createPaymentTransaction(/** @type {any} */ ({
    inputs,
    associatedKeysets:  plan.inputs.map(() => path),
    outputScriptHex,
    segwit:             true,
    sigHashType:        0x01, // SIGHASH_ALL
    transactionVersion: 2,
  }));

  // 2026-07-14 audit LOW: mirror btc/send.js — derive txid LOCALLY from the signed
  // bytes rather than trusting the untrusted indexer's POST /tx echo. A hostile /
  // MITMed indexer could return a fabricated txid that the UI/explorer link would
  // then follow (delayed detection of the real send).
  const txid = btcTxidFromHex(signedHex);
  await broadcastTx(networkKey, signedHex);

  return {
    txid,
    explorerUrl: `${net.explorer}/tx/${txid}`,
    plan,
  };
}

// ── Trezor ────────────────────────────────────────────────────────────────────

/**
 * Sign and broadcast via Trezor Connect.
 *
 * @returns {Promise<{ txid: string, explorerUrl: string, plan: object }>}
 */
export async function signAndBroadcastBtcTrezor({
  networkKey,
  fromAddress,
  btcPublicKeyHex,
  toAddress,
  amountSats,
  sendMax = false,
  feeRate = null,
  changeAddress = null,
}) {
  const net    = getBtcNetwork(networkKey);
  const isTest = net.key !== 'mainnet';
  const pubKey = hex.decode(btcPublicKeyHex);
  const owner  = p2wpkh(pubKey, net.params);

  if (owner.address !== fromAddress) {
    throw new Error('Hardware wallet public key does not match from address');
  }

  const plan = await buildPlan({ networkKey, fromAddress, toAddress, amountSats, sendMax, feeRate, changeAddress });

  const externalPath = pathArray(isTest, 0);
  const changePath   = pathArray(isTest, 1);
  const effectiveChangeAddress = changeAddress || fromAddress;

  const inputs = plan.inputs.map(utxo => ({
    address_n:   externalPath,
    prev_hash:   utxo.txid,
    prev_index:  utxo.vout,
    amount:      String(utxo.value),
    script_type: /** @type {'SPENDWITNESS'} */ ('SPENDWITNESS'),
  }));

  const outputs = plan.outputs.map(out => {
    const isChange = out.address === effectiveChangeAddress;
    if (isChange) {
      return {
        address_n:   changePath,
        amount:      String(out.value),
        script_type: /** @type {'PAYTOWITNESS'} */ ('PAYTOWITNESS'),
      };
    }
    return {
      address:     out.address,
      amount:      String(out.value),
      script_type: /** @type {'PAYTOADDRESS'} */ ('PAYTOADDRESS'),
    };
  });

  const result = await TrezorConnect.signTransaction({
    inputs,
    outputs,
    coin:  isTest ? 'test' : 'btc',
    push:  false,
  });
  if (!result.success) throw new Error((result.payload && 'error' in result.payload ? result.payload.error : null) ?? 'Trezor BTC signing failed');

  const { serializedTx } = result.payload;
  // 2026-07-14 audit LOW: local txid derivation (see Ledger branch note above).
  const txid = btcTxidFromHex(serializedTx);
  await broadcastTx(networkKey, serializedTx);

  return {
    txid,
    explorerUrl: `${net.explorer}/tx/${txid}`,
    plan,
  };
}
