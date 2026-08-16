// @ts-nocheck
import TrezorConnect from '@trezor/connect-web';
import { ethers } from 'ethers';
import { Transaction, Address, OutScript } from '@scure/btc-signer';
import { hex } from '@scure/base';
import { getTransport } from './transport.js';
import { BTC_NETWORKS } from '../btc/networks.js';
import { isDeniabilitySessionActive } from '../deniabilitySession.js';

const EVM_PATH = "m/44'/60'/0'/0/0";
const SOL_PATH = "m/44'/501'/0'/0'";

// Codex P1 2026-08-15: resolve the TrezorConnect iframe URL.
//
//   1. VITE_TREZOR_CONNECT_SRC (build-time)  — operator wires the self-hosted
//      hash-pinned bundle produced by scripts/bundle-trezor-connect.mjs.
//      Recommended value on a production deploy that has verified the local
//      bundle boots against the current @trezor/connect-web:
//        VITE_TREZOR_CONNECT_SRC=/trezor-connect/
//      corsValidator lives inside @trezor/connect-web and rejects same-origin
//      URLs by default, so setting this env is deliberately opt-in — the
//      operator must confirm the library version accepts the local bundle
//      (test on a staging deploy). When it fails, TrezorConnect.init throws
//      and requireWebUsb() surfaces the error, so a bad wiring fails LOUDLY
//      at first use rather than silently falling back to the CDN.
//   2. Dev fallback — localhost bundle on `http://localhost:<VITE_PORT>/trezor-
//      connect/`. This has always worked because the corsValidator explicitly
//      allowlists localhost:5xxx/8xxx.
//   3. Otherwise — dev only falls back to a console.error; a PROD build hard-
//      fails at module init so a shipped bundle never silently loads the
//      connect.trezor.io CDN.
//
// Whichever URL is used, I3 is enforced upstream via checkDeniability() in
// requireWebUsb(); a deniable session never even reaches this init.

// 2026-08-16 audit remediation (LOW): if VITE_TREZOR_CONNECT_SRC is unset in a
// production build, HARD-FAIL at module init — mirrors src/rasp/useRaspArtifact.js's
// BYPASS_RASP-in-prod throw. Loading connect.trezor.io from a shipped bundle
// silently ships a third-party iframe into every user's browser; that is a
// build defect the app must not run under. Dev builds are unaffected: the
// fallback to `http://localhost:<port>/trezor-connect/` still applies.
if (
  typeof import.meta !== 'undefined' &&
  import.meta.env?.PROD &&
  !import.meta.env?.VITE_TREZOR_CONNECT_SRC
) {
  throw new Error('[trezor] VITE_TREZOR_CONNECT_SRC is unset in a production build -- refusing to load. Wire the self-hosted bundle produced by scripts/bundle-trezor-connect.mjs (e.g. VITE_TREZOR_CONNECT_SRC=/trezor-connect/) before deploying.');
}

function resolveConnectSrc() {
  try {
    const envSrc = typeof import.meta !== 'undefined' && import.meta.env?.VITE_TREZOR_CONNECT_SRC;
    if (envSrc) return String(envSrc);
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
      return `http://localhost:${import.meta.env.VITE_PORT ?? 5173}/trezor-connect/`;
    }
    // Unreachable in a normal PROD build (the module-init throw above catches
    // this case). Kept as a defense-in-depth error log for test harnesses or
    // any environment where PROD is false but VITE_TREZOR_CONNECT_SRC is also
    // unset — surfacing loudly rather than silently loading the CDN.
    if (!globalThis.__veyrnoxTrezorCdnWarned) {
      globalThis.__veyrnoxTrezorCdnWarned = true;
      try {
        console.error('[trezor] VITE_TREZOR_CONNECT_SRC unset — @trezor/connect-web would fall back to connect.trezor.io. Wire scripts/bundle-trezor-connect.mjs and set VITE_TREZOR_CONNECT_SRC=/trezor-connect/.');
      } catch { /* noop */ }
    }
    return null;
  } catch { return null; }
}

// Gap C — memoize init (mirrors trezorAddress.js). Real TrezorConnect throws on a
// second init() call, so the promise is created at most once and every caller awaits
// the same one; concurrent sign calls no longer double-init.
let _initPromise = null;
async function ensureInit() {
  if (!_initPromise) {
    _initPromise = TrezorConnect.init({
      lazyLoad: true,
      ...(resolveConnectSrc() ? { connectSrc: resolveConnectSrc() } : {}),
      manifest: {
        email: 'security@veyrnox.com',
        appUrl: 'https://veyrnox.app',
        appName: 'Veyrnox',
      },
    });
  }
  return _initPromise;
}

// Gap B — deniability guard (I3), mirrors trezorAddress.js. @trezor/connect-web
// reaches out to connect.trezor.io; in deniability mode the app must make ZERO
// backend calls, so we refuse before init/transport is ever touched.
//
// TWO signals are checked:
//   1. A REAL decoy (duress) or hidden (stealth) session — the coercion case that
//      matters most. This is held in-memory by WalletProvider (isDecoy/isHidden)
//      and surfaced to wallet-core via deniabilitySession.js (it is deliberately
//      NOT persisted to localStorage, which would be a forensic deniability tell).
//      Previously ONLY the demo flag was checked, so a real coerced decoy/hidden
//      session could still reach connect.trezor.io — a genuine I2/I3 violation.
//   2. The persisted `veyrnox-demo=1` flag (demo/tour mode).
function deniabilityActive() {
  // (1) Real decoy/hidden session — in-memory, no localStorage dependency.
  try {
    if (isDeniabilitySessionActive()) return true;
  } catch {
    // Fail closed (I4): if the session marker cannot be read, block.
    return true;
  }
  // (2) Demo/tour flag.
  try {
    return (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('veyrnox-demo') === '1'
    );
  } catch {
    // Fail closed (I4): if we cannot read the flag, treat deniability as active.
    return true;
  }
}

function checkDeniability() {
  if (deniabilityActive()) throw new Error('TREZOR_DENIABILITY_BLOCKED');
}

async function requireWebUsb() {
  checkDeniability();
  const transport = getTransport();
  if (transport.type !== 'webusb') {
    throw new Error('TREZOR_UNSUPPORTED');
  }
  await ensureInit();
}

export async function trezorSignEvmTx({
  chainId,
  nonce,
  to,
  value,
  gasLimit,
  maxFeePerGas,
  maxPriorityFeePerGas,
  data = '0x',
}) {
  await requireWebUsb();

  const result = await TrezorConnect.ethereumSignTransaction({
    path: EVM_PATH,
    transaction: {
      to,
      value: ethers.toBeHex(value),
      data,
      chainId,
      nonce: ethers.toBeHex(nonce),
      gasLimit: ethers.toBeHex(gasLimit),
      maxFeePerGas: ethers.toBeHex(maxFeePerGas),
      maxPriorityFeePerGas: ethers.toBeHex(maxPriorityFeePerGas),
    },
  });

  if (!result.success) throw new Error(/** @type {any} */ (result.payload).error);

  const { v, r, s } = /** @type {{ v: string, r: string, s: string }} */ (result.payload);
  const vNum = typeof v === 'string' ? parseInt(v, 16) : v;

  // secp256k1 half-order — s must be <= this for canonical form (EIP-2).
  const SECP256K1_HALF = BigInt('0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0');
  let sBig = BigInt(s);
  let vNorm = vNum;
  if (sBig > SECP256K1_HALF) {
    // Normalise by flipping s and toggling parity (v)
    const SECP256K1_ORDER = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
    sBig = SECP256K1_ORDER - sBig;
    vNorm = vNorm ^ 1;
  }
  const sHex = '0x' + sBig.toString(16).padStart(64, '0');
  const sig = ethers.Signature.from({ v: vNorm, r, s: sHex });

  const tx = ethers.Transaction.from({
    type: 2,
    chainId,
    nonce,
    to,
    value,
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    data,
  });
  tx.signature = sig;
  return tx.serialized;
}

function btcPathArray(networkKey) {
  if (networkKey !== 'btc-mainnet' && networkKey !== 'btc-testnet') {
    throw new Error(`Unknown BTC networkKey: ${networkKey}`);
  }
  const isMainnet = networkKey === 'btc-mainnet';
  const coinType = isMainnet ? 0x80000000 : 0x80000001;
  return [0x80000054, coinType, 0x80000000, 0, 0];
}

// Codex P1 2026-08-15: parse the signed tx returned by the Trezor device and
// assert it matches the plan the host asked for. Before this, a malicious /
// buggy connector or device response with the change output dropped (or a
// recipient amount mutated) would still be broadcast, and the remainder would
// be burned as miner fee. Assertions:
//   - every non-change plan output has an exact (address, amountSats) match
//     in the signed tx (order-independent — Trezor may sort/relocate change)
//   - if plan.changeAmountSats > 0, the total of ALL other outputs equals the
//     sum of non-change plan outputs — anything else means the change amount
//     was tampered with (address is device-derived and cannot be re-verified
//     against a plan value, so we check the amount by subtraction, which is
//     mutation-proof for the value the host asked to keep)
// Fail closed (I4): throws BTC_TREZOR_TX_MISMATCH on any drift; the caller
// never reaches broadcastBtcTx.
function _verifyBtcSignedTxMatchesPlan(signedTxHex, plan, networkKey) {
  const netInfo = BTC_NETWORKS[networkKey === 'btc-mainnet' ? 'mainnet' : 'testnet'];
  if (!netInfo) throw new Error(`BTC_TREZOR_TX_MISMATCH: unknown networkKey ${networkKey}`);
  const tx = Transaction.fromRaw(hex.decode(signedTxHex), { allowUnknownOutputs: true });

  const wanted = plan.outputs
    .filter((o) => !o.isChange)
    .map((o) => ({ address: o.address, amount: BigInt(o.amountSats) }));

  const actual = [];
  for (let i = 0; i < tx.outputsLength; i++) {
    const out = tx.getOutput(i);
    let addr = null;
    try {
      // @scure/btc-signer Address.encode takes a decoded payment descriptor,
      // not a raw script — pipe through OutScript.decode first.
      const decoded = OutScript.decode(out.script);
      addr = decoded ? Address(netInfo.params).encode(decoded) : null;
    } catch { /* non-standard */ }
    actual.push({ address: addr, amount: BigInt(out.amount) });
  }

  // Every wanted recipient must appear exactly once (address + amount match).
  const usedActual = new Set();
  for (const w of wanted) {
    const idx = actual.findIndex((a, i) => !usedActual.has(i) && a.address === w.address && a.amount === w.amount);
    if (idx === -1) {
      throw new Error(`BTC_TREZOR_TX_MISMATCH: recipient ${w.address} amount ${w.amount} not present in signed tx`);
    }
    usedActual.add(idx);
  }

  // Change verification by amount only — the address is device-derived and
  // cannot be re-derived here without the xpub. If the caller expected change
  // > 0, the sum of "everything else" MUST equal what the plan expected.
  if (plan.changeAmountSats > 0n) {
    const remainder = actual.reduce((sum, a, i) => usedActual.has(i) ? sum : sum + a.amount, 0n);
    if (remainder !== BigInt(plan.changeAmountSats)) {
      throw new Error(`BTC_TREZOR_TX_MISMATCH: change amount ${remainder} does not match plan ${plan.changeAmountSats}`);
    }
  } else {
    const leftover = actual.reduce((sum, a, i) => usedActual.has(i) ? sum : sum + a.amount, 0n);
    if (leftover !== 0n) {
      throw new Error(`BTC_TREZOR_TX_MISMATCH: signed tx has unexpected leftover output amount ${leftover} (plan had no change)`);
    }
  }
}

export async function trezorSignBtcTx({ plan, networkKey }) {
  await requireWebUsb();

  const isMainnet = networkKey === 'btc-mainnet';
  const coin = isMainnet ? 'btc' : 'tbtc';
  const pathArray = btcPathArray(networkKey);

  const inputs = plan.inputs.map((inp) => ({
    address_n: pathArray,
    prev_hash: inp.txid,
    prev_index: inp.vout,
    amount: String(inp.amountSats),
    script_type: 'SPENDWITNESS',
  }));

  const outputs = plan.outputs.map((out) => ({
    address: out.address,
    amount: String(out.amountSats),
    script_type: 'PAYTOADDRESS',
  }));

  if (plan.changeAmountSats > 0n) {
    outputs.push({
      address_n: pathArray,
      amount: String(plan.changeAmountSats),
      script_type: 'PAYTOWITNESS',
    });
  }

  const result = await TrezorConnect.signTransaction({ inputs, outputs, coin });
  if (!result.success) throw new Error(/** @type {any} */ (result.payload).error);
  const serializedTx = /** @type {any} */ (result.payload).serializedTx;
  _verifyBtcSignedTxMatchesPlan(serializedTx, plan, networkKey);
  return serializedTx;
}

// Exported for tests only — pure verifier, no I/O.
export const __test_verifyBtcSignedTxMatchesPlan = _verifyBtcSignedTxMatchesPlan;

export async function trezorSignSolTx({ serializedTxBase64 }) {
  await requireWebUsb();

  const serializedTxHex = Buffer.from(serializedTxBase64, 'base64').toString('hex');

  const result = await TrezorConnect.solanaSignTransaction({
    path: SOL_PATH,
    serializedTx: serializedTxHex,
  });
  if (!result.success) throw new Error(/** @type {any} */ (result.payload).error);

  // Trezor returns signature hex; caller attaches it to the transaction
  return /** @type {any} */ (result.payload).signature;
}
