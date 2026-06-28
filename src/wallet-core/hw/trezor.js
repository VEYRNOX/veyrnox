import TrezorConnect from '@trezor/connect-web';
import { ethers } from 'ethers';
import { getTransport } from './transport.js';

const EVM_PATH = "m/44'/60'/0'/0/0";
const SOL_PATH = "m/44'/501'/0'/0'";

function ensureInit() {
  TrezorConnect.init({
    lazyLoad: true,
    manifest: {
      email: 'al.jobson@21stclick.co.uk',
      appUrl: 'https://veyrnox.app',
      appName: 'Veyrnox',
    },
  });
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
  const isMainnet = networkKey === 'btc-mainnet';
  // BIP32 hardened path: 84'/coin'/0'/0/0
  const coinType = isMainnet ? 0x80000000 : 0x80000001; // 0' or 1'
  return [0x80000054, coinType, 0x80000000, 0, 0];
}

export async function trezorSignBtcTx({ plan, networkKey }) {
  requireWebUsb();

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
      script_type: 'PAYTOP2SHWITNESS',
    });
  }

  const result = await TrezorConnect.signTransaction({ inputs, outputs, coin });
  if (!result.success) throw new Error(/** @type {any} */ (result.payload).error);
  return /** @type {any} */ (result.payload).serializedTx;
}

export async function trezorSignSolTx({ serializedTxBase64 }) {
  requireWebUsb();

  const serializedTxHex = Buffer.from(serializedTxBase64, 'base64').toString('hex');

  const result = await TrezorConnect.solanaSignTransaction({
    path: SOL_PATH,
    serializedTx: serializedTxHex,
  });
  if (!result.success) throw new Error(/** @type {any} */ (result.payload).error);

  // Trezor returns signature hex; caller attaches it to the transaction
  return /** @type {any} */ (result.payload).signature;
}
