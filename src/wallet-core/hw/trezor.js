import TrezorConnect from '@trezor/connect-web';
import { ethers } from 'ethers';
import { getTransport } from './transport.js';

const EVM_PATH = "m/44'/60'/0'/0/0";
const BTC_TESTNET_PATH = "m/84'/1'/0'/0/0";
const BTC_MAINNET_PATH = "m/84'/0'/0'/0/0";
const SOL_PATH = "m/44'/501'/0'/0'";

let initialized = false;

function ensureInit() {
  if (initialized) return;
  TrezorConnect.init({
    lazyLoad: true,
    manifest: {
      email: 'al.jobson@21stclick.co.uk',
      appUrl: 'https://veyrnox.app',
      appName: 'Veyrnox',
    },
  });
  initialized = true;
}

function requireWebUsb() {
  const transport = getTransport();
  if (transport.type !== 'webusb') {
    throw new Error('TREZOR_UNSUPPORTED');
  }
  ensureInit();
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
  requireWebUsb();

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
    vNorm = vNorm % 2 === 0 ? 1 : 0;
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

// BTC and SOL stubs — implemented in Task 3
export async function trezorSignBtcTx(_params) {
  throw new Error('trezorSignBtcTx: not yet implemented');
}

export async function trezorSignSolTx(_params) {
  throw new Error('trezorSignSolTx: not yet implemented');
}
