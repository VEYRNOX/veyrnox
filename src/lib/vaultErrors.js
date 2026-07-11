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
