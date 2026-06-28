/**
 * trezorAddress.js
 *
 * Fetches addresses from a Trezor device and displays them on-screen for
 * user confirmation (showOnTrezor: true on every call — I1: keys never enter
 * the app; only derived public addresses are returned).
 *
 * HONEST_DISABLED: @trezor/connect-web bootstraps a remote iframe from
 * https://connect.trezor.io on every call (silent off-device egress). This
 * violates I2 (no silent data egress) and I3 (deniability mode makes zero
 * backend calls). The feature is honest-disabled until the egress risk is
 * reviewed and mitigated. All three entry-points throw with code
 * 'HONEST_DISABLED' so UI can show a clear, honest "not yet available"
 * rather than silently misbehaving. (I4: fail honest, fail closed.)
 */
import TrezorConnect from '@trezor/connect-web';
import { ethers } from 'ethers';
import { getTransport } from './transport.js';

/** Derivation paths — exported so tests can pin them as a forward contract. */
export const TREZOR_PATHS = {
  evm: "m/44'/60'/0'/0/0",
  sol: "m/44'/501'/0'/0'",
  btcMainnet: "m/84'/0'/0'/0/0",
  btcTestnet: "m/84'/1'/0'/0/0",
};

function makeError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/** Guard: fail closed when deniability/demo mode is active. */
function checkDeniability() {
  try {
    if (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('veyrnox-demo') === '1'
    ) {
      throw makeError(
        'Trezor address fetch is blocked in deniability/demo mode (I3).',
        'DENIABILITY_BLOCKED',
      );
    }
  } catch (e) {
    if (e.code === 'DENIABILITY_BLOCKED') throw e;
    // localStorage unavailable (SSR / node) — safe to continue
  }
}

/** Guard: feature disabled pending I2/I3 egress review. */
function assertEnabled() {
  throw makeError(
    'Trezor address fetch is HONEST_DISABLED pending I2/I3 egress review. ' +
      '@trezor/connect-web bootstraps a remote iframe (https://connect.trezor.io) ' +
      'on every call, violating the no-silent-egress and deniability invariants.',
    'HONEST_DISABLED',
  );
}

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

/**
 * Returns the checksummed EVM address from the Trezor (m/44'/60'/0'/0/0).
 * Displays the address on the device screen before returning (showOnTrezor: true).
 *
 * HONEST_DISABLED — see module header.
 */
export async function getTrezorEvmAddress() {
  checkDeniability();
  assertEnabled();

  /* istanbul ignore next — dead code while HONEST_DISABLED */
  requireWebUsb();
  const result = await TrezorConnect.ethereumGetAddress({
    path: TREZOR_PATHS.evm,
    showOnTrezor: true,
  });
  if (!result.success) throw new Error(/** @type {any} */ (result.payload).error);
  const raw = /** @type {any} */ (result.payload).address;
  return ethers.getAddress(raw.toLowerCase());
}

/**
 * Returns the bech32 BTC address from the Trezor (native segwit m/84').
 * Displays the address on the device screen before returning (showOnTrezor: true).
 *
 * HONEST_DISABLED — see module header.
 *
 * @param {'btc-mainnet' | 'btc-testnet'} networkKey
 */
export async function getTrezorBtcAddress(networkKey) {
  checkDeniability();
  assertEnabled();

  /* istanbul ignore next — dead code while HONEST_DISABLED */
  requireWebUsb();
  const isMainnet = networkKey === 'btc-mainnet';
  const result = await TrezorConnect.getAddress({
    path: isMainnet ? TREZOR_PATHS.btcMainnet : TREZOR_PATHS.btcTestnet,
    coin: isMainnet ? 'btc' : 'tbtc',
    showOnTrezor: true,
  });
  if (!result.success) throw new Error(/** @type {any} */ (result.payload).error);
  return /** @type {any} */ (result.payload).address;
}

/**
 * Returns the base58 Solana public key from the Trezor (m/44'/501'/0'/0').
 * Displays the address on the device screen before returning (showOnTrezor: true).
 *
 * HONEST_DISABLED — see module header.
 */
export async function getTrezorSolAddress() {
  checkDeniability();
  assertEnabled();

  /* istanbul ignore next — dead code while HONEST_DISABLED */
  requireWebUsb();
  const result = await TrezorConnect.solanaGetAddress({
    path: TREZOR_PATHS.sol,
    showOnTrezor: true,
  });
  if (!result.success) throw new Error(/** @type {any} */ (result.payload).error);
  return /** @type {any} */ (result.payload).address;
}
