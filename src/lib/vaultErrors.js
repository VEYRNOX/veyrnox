// lib/vaultErrors.js — R2 facade for vault error MACHINE CODES used by UI.
//
// UI components must not import from wallet-core/* directly (ring-import lint,
// issue #627). These are the stable machine codes a UI layer branches on; the
// string VALUES must stay byte-for-byte identical to what
// src/wallet-core/keystore/web.js exports as WEB_VAULT_ERR — they are the
// contract between the keystore (which throws) and the UI (which catches). If
// the keystore ever changes a code, this facade must change with it.
export const WEB_VAULT_ERR = Object.freeze({
  PASSWORD_TOO_SHORT: 'WEB_VAULT_PASSWORD_TOO_SHORT',
});

// Native (iOS/Android) vault machine codes the UI branches on. Same facade
// contract: string VALUES must stay byte-for-byte identical to what
// src/wallet-core/keystore/native.js throws. DEVICE_NOT_SECURE fires on a
// Create Wallet attempt when KeyguardManager.isDeviceSecure() === false —
// hardware KEK cannot bind a Keystore user-auth key without a device lock,
// so vault creation refuses. Recoverable: user sets a lock and retries.
export const NATIVE_VAULT_ERR = Object.freeze({
  DEVICE_NOT_SECURE: 'DEVICE_NOT_SECURE',
});

// KEK machine codes the UI branches on during unlock. Same facade contract as
// above: the string VALUES must stay byte-for-byte identical to what
// src/wallet-core/keystore/kek.js exports as KEK_ERR (which throws them), and
// src/wallet-core/keystore/hardware.js for HARDWARE_FACTOR_DEGENERATE. If the
// keystore ever changes a code, this facade must change with it.
export const KEK_UI_ERR = Object.freeze({
  NO_HARDWARE_FACTOR: 'KEK_NO_HARDWARE_FACTOR',
  KEY_PERMANENTLY_INVALIDATED: 'KEK_KEY_PERMANENTLY_INVALIDATED',
  USER_CANCELLED: 'KEK_USER_CANCELLED',
  HARDWARE_FACTOR_DEGENERATE: 'HARDWARE_FACTOR_DEGENERATE',
  MALFORMED_VAULT: 'KEK_MALFORMED_VAULT',
});
