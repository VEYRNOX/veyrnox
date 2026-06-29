import TrezorConnect from '@trezor/connect-web';
import { ethers } from 'ethers';
import { getTransport } from './transport.js';
import { isDeniabilitySessionActive } from '../deniabilitySession.js';

const EVM_PATH = "m/44'/60'/0'/0/0";
const SOL_PATH = "m/44'/501'/0'/0'";

// Gap C — memoize init (mirrors trezorAddress.js). Real TrezorConnect throws on a
// second init() call, so the promise is created at most once and every caller awaits
// the same one; concurrent sign calls no longer double-init.
let _initPromise = null;
async function ensureInit() {
  if (!_initPromise) {
    // connectSrc: corsValidator only accepts *.trezor.io / localhost:5xxx/8xxx.
    // In dev, pass localhost so the self-hosted bundle loads (no CDN call).
    // In prod, omit — CDN (connect.trezor.io) is used and is disclosed.
    // I3 is enforced upstream via checkDeniability() in requireWebUsb().
    const connectSrc = (typeof import.meta !== 'undefined' && import.meta.env?.DEV)
      ? `http://localhost:${import.meta.env.VITE_PORT ?? 5173}/trezor-connect/`
      : undefined;
    _initPromise = TrezorConnect.init({
      lazyLoad: true,
      ...(connectSrc ? { connectSrc } : {}),
      manifest: {
        email: 'al.jobson@21stclick.co.uk',
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
  return /** @type {any} */ (result.payload).serializedTx;
}

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
