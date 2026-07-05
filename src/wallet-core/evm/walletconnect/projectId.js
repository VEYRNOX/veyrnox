// wallet-core/evm/walletconnect/projectId.js
//
// The WalletConnect (Reown) project ID — a PUBLIC client identifier that ships in
// every bundle. It is NOT a secret: it only authorises the encrypted relay
// transport (WalletConnect's WebSocket), never touches keys, seed, or balances
// (I1/I2). It is committed here as a DEFAULT so EVERY build enables the dApp
// Connector out of the box.
//
// WHY A COMMITTED DEFAULT (the recurring "Project ID required" bug):
//   The ID used to live ONLY in git-ignored `.env.local` (one machine) plus a CI
//   variable. So any APK built from a git worktree, a fresh clone, a teammate's
//   machine, or a CI path that missed the variable baked in an EMPTY id and shipped
//   the "Project ID required" honest-disable card — on essentially every rebuild.
//   A public client identifier is safe to commit and is the intended production
//   relay config, so we bake it in here. `VITE_WALLETCONNECT_PROJECT_ID` (from
//   `.env.local` or a CI variable) still OVERRIDES this default, so a different
//   Reown project can be swapped in per-environment without a code change.

const DEFAULT_WALLETCONNECT_PROJECT_ID = 'f9d8b6cc36e18684ac1d2a76cdf54bea';

/**
 * Resolved at build time: the `VITE_WALLETCONNECT_PROJECT_ID` env override if set
 * (and non-empty), otherwise the committed public default. Always non-empty, so a
 * build never ships an unconfigured connector.
 * @type {string}
 */
export const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || DEFAULT_WALLETCONNECT_PROJECT_ID;
