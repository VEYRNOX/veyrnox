/**
 * trezorAddress.js
 *
 * STATUS: HONEST-DISABLED — Trezor connect-web fetches from connect.trezor.io (I2/I3 violation).
 * Re-enable only after self-hosting the connect bundle or verifying egress is fully contained.
 *
 * @trezor/connect-web bootstraps a remote iframe from https://connect.trezor.io on
 * every call (silent off-device egress). This violates I2 (no silent data egress)
 * and I3 (deniability mode makes zero backend calls). All three entry-points fail
 * closed with code 'HONEST_DISABLED' so the UI can show a clear, honest "not yet
 * available" rather than silently reaching out to a remote origin. (I4: fail honest,
 * fail closed.) Showing the address on the device (showOnTrezor: true) keeps I1 — only
 * derived public addresses ever return to the app — but that does not cure the egress.
 *
 * The original implementation is preserved (gated) below so it can be re-enabled
 * properly once the egress is contained. The deniability guard runs BEFORE the
 * HONEST-DISABLED throw, so it survives re-enable.
 */
import TrezorConnect from '@trezor/connect-web';
import { ethers } from 'ethers';
import { getTransport } from './transport.js';

/** Derivation paths — exported so tests can pin them as a forward contract. */
export const TREZOR_PATHS = {
  evm: "m/44'/60'/0'/0/0",
  // SOL: matches the app's own derivation — wallet-core/sol/derivation.js solPath(0)
  // === "m/44'/501'/0'/0'" (Phantom/Solflare 4-level path). Asserted in tests.
  sol: "m/44'/501'/0'/0'",
  btcMainnet: "m/84'/0'/0'/0/0",
  btcTestnet: "m/84'/1'/0'/0/0",
};

function makeError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Guard: fail closed when deniability/demo mode is active (I3). Runs FIRST in every
 * entry-point, before the HONEST-DISABLED throw, so it remains in force after the
 * feature is re-enabled. Mirrors the app's demo/deniability signal
 * (api/demoClient.js writes `veyrnox-demo` = '1').
 */
function checkDeniability() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('veyrnox-demo') === '1') {
      throw makeError(
        'Trezor address fetch is blocked in deniability/demo mode (I3).',
        'DENIABILITY_BLOCKED',
      );
    }
  } catch (e) {
    if (e && e.code === 'DENIABILITY_BLOCKED') throw e;
    // localStorage unavailable (SSR / node) — nothing to read, safe to continue.
  }
}

/** Guard: feature disabled pending I2/I3 egress review (I4: fail honest, fail closed). */
function assertEnabled() {
  throw makeError(
    'Trezor integration is disabled: connect.trezor.io egress violates I2/I3. See STATUS comment.',
    'HONEST_DISABLED',
  );
}

// Memoize a single awaited init promise so TrezorConnect.init is only ever called
// once across all entry-points (re-enable correctness).
let _initPromise = null;
function ensureInit() {
  if (!_initPromise) {
    _initPromise = TrezorConnect.init({
      lazyLoad: true,
      manifest: {
        email: 'al.jobson@21stclick.co.uk',
        appUrl: 'https://veyrnox.app',
        appName: 'Veyrnox',
      },
    });
  }
  return _initPromise;
}

async function requireWebUsb() {
  const transport = getTransport();
  if (transport.type !== 'webusb') {
    throw new Error('TREZOR_UNSUPPORTED');
  }
  await ensureInit();
}

/**
 * Returns the checksummed EVM address from the Trezor (m/44'/60'/0'/0/0).
 * Displays the address on the device screen before returning (showOnTrezor: true).
 *
 * HONEST-DISABLED — see STATUS comment.
 */
export async function getTrezorEvmAddress() {
  checkDeniability();
  assertEnabled();

  /* istanbul ignore next — dead code while HONEST-DISABLED */
  await requireWebUsb();
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
 * HONEST-DISABLED — see STATUS comment.
 *
 * @param {'btc-mainnet' | 'btc-testnet'} networkKey
 */
export async function getTrezorBtcAddress(networkKey) {
  checkDeniability();
  assertEnabled();

  /* istanbul ignore next — dead code while HONEST-DISABLED */
  await requireWebUsb();
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
 * HONEST-DISABLED — see STATUS comment.
 */
export async function getTrezorSolAddress() {
  checkDeniability();
  assertEnabled();

  /* istanbul ignore next — dead code while HONEST-DISABLED */
  await requireWebUsb();
  const result = await TrezorConnect.solanaGetAddress({
    path: TREZOR_PATHS.sol,
    showOnTrezor: true,
  });
  if (!result.success) throw new Error(/** @type {any} */ (result.payload).error);
  return /** @type {any} */ (result.payload).address;
}
