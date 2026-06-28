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

export async function getTrezorEvmAddress() {
  requireWebUsb();
  const result = await TrezorConnect.ethereumGetAddress({
    path: EVM_PATH,
    showOnTrezor: true,
  });
  if (!result.success) throw new Error(/** @type {any} */ (result.payload).error);
  const raw = /** @type {any} */ (result.payload).address;
  return ethers.getAddress(raw.toLowerCase());
}

export async function getTrezorBtcAddress(networkKey) {
  requireWebUsb();
  const isMainnet = networkKey === 'btc-mainnet';
  const result = await TrezorConnect.getAddress({
    path: isMainnet ? "m/84'/0'/0'/0/0" : "m/84'/1'/0'/0/0",
    coin: isMainnet ? 'btc' : 'tbtc',
    showOnTrezor: true,
  });
  if (!result.success) throw new Error(/** @type {any} */ (result.payload).error);
  return /** @type {any} */ (result.payload).address;
}

export async function getTrezorSolAddress() {
  requireWebUsb();
  const result = await TrezorConnect.solanaGetAddress({
    path: SOL_PATH,
    showOnTrezor: true,
  });
  if (!result.success) throw new Error(/** @type {any} */ (result.payload).error);
  return /** @type {any} */ (result.payload).address;
}
