// STATUS: BUILT — Trezor WebUSB address derivation. Not device-verified on testnet yet.
// I2/I3 note: deniability guard blocks all calls when veyrnox-demo=1 (I3). In dev,
// connectSrc points to self-hosted localhost bundle (no CDN). In prod, connectSrc is
// omitted and connect.trezor.io CDN is used (disclosed; corsValidator blocks bare paths).

import TrezorConnect from '@trezor/connect-web';
import { ethers } from 'ethers';
import { getTransport } from './transport.js';
import { isDeniabilitySessionActive } from '../deniabilitySession.js';

const EVM_PATH = "m/44'/60'/0'/0/0";
const SOL_PATH = "m/44'/501'/0'/0'";
const BTC_MAINNET_PATH = "m/84'/0'/0'/0/0";
const BTC_TESTNET_PATH = "m/84'/1'/0'/0/0";

export const TREZOR_PATHS = Object.freeze({
  evm: EVM_PATH,
  sol: SOL_PATH,
  btcMainnet: BTC_MAINNET_PATH,
  btcTestnet: BTC_TESTNET_PATH,
});

// Fix 1 — memoize init. Real TrezorConnect throws on a second init() call, so the
// promise is created at most once and every caller awaits the same one.
let _initPromise = null;
async function ensureInit() {
  if (!_initPromise) {
    // connectSrc: @trezor/connect corsValidator only accepts *.trezor.io,
    // localhost:5xxx/8xxx, and *.sldev.cz — bare paths are silently dropped.
    // In dev we pass a full localhost URL so the self-hosted bundle loads (no CDN).
    // In prod connectSrc is omitted; the CDN (connect.trezor.io/9/) is used, which
    // is disclosed. The deniability guard above (checkDeniability) ensures zero
    // network calls when I3 is active regardless of the connectSrc setting.
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

// Fix 2 — deniability guard (I3). @trezor/connect-web reaches out to
// connect.trezor.io; in deniability mode the app must make ZERO backend calls, so
// we refuse before init/transport is ever touched. TWO signals are checked:
//   1. A REAL decoy (duress) or hidden (stealth) session, surfaced in-memory by
//      WalletProvider via deniabilitySession.js. It is deliberately NOT persisted
//      to localStorage (that would be a forensic deniability tell), so this is the
//      only way wallet-core can see it. Previously only the demo flag was checked,
//      so a coerced decoy/hidden session could still reach connect.trezor.io.
//   2. The persisted `veyrnox-demo=1` demo/tour flag (see api/demoClient.js).
function deniabilityActive() {
  try {
    if (isDeniabilitySessionActive()) return true;
  } catch {
    return true; // Fail closed (I4).
  }
  try {
    return (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('veyrnox-demo') === '1'
    );
  } catch {
    // Fail closed (I4): if we cannot read the flag, do NOT assume it is safe to
    // emit network calls — treat it as deniability-active.
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

export async function getTrezorEvmAddress() {
  await requireWebUsb();
  const result = await TrezorConnect.ethereumGetAddress({
    path: EVM_PATH,
    showOnTrezor: true,
  });
  if (!result.success) throw new Error(/** @type {any} */ (result.payload).error);
  const raw = /** @type {any} */ (result.payload).address;
  return ethers.getAddress(raw.toLowerCase());
}

export async function getTrezorBtcAddress(networkKey) {
  await requireWebUsb();
  const isMainnet = networkKey === 'btc-mainnet';
  const result = await TrezorConnect.getAddress({
    path: isMainnet ? BTC_MAINNET_PATH : BTC_TESTNET_PATH,
    coin: isMainnet ? 'btc' : 'tbtc',
    showOnTrezor: true,
  });
  if (!result.success) throw new Error(/** @type {any} */ (result.payload).error);
  return /** @type {any} */ (result.payload).address;
}

export async function getTrezorSolAddress() {
  await requireWebUsb();
  const result = await TrezorConnect.solanaGetAddress({
    path: SOL_PATH,
    showOnTrezor: true,
  });
  if (!result.success) throw new Error(/** @type {any} */ (result.payload).error);
  return /** @type {any} */ (result.payload).address;
}
