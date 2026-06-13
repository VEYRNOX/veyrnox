// lib/devSendOverride.js
//
// DEV-ONLY send ungate — for hands-on per-asset testnet verification.
//
// During multi-asset verification a developer must send a `receive_only` asset
// on TESTNET through the real send path to get an on-chain txid. The production
// `canSend()` gate (assets.js) blocks that by design. This flag bypasses ONLY the
// UI gate decision — it does NOT change any asset's status, and `canSend()` stays
// the production source of truth. No asset becomes `live` because of this flag.
//
// THREE INDEPENDENT LOCKS — every one must hold for the ungate to be active:
//   1. import.meta.env.DEV — true only under `vite` / `vite serve`. A production
//      `vite build` statically replaces this with `false`, so the bypass branch
//      is dead-code-eliminated from any shipped bundle. It cannot reach prod.
//   2. VITE_DEV_UNGATE_SEND === '1' — explicit opt-in env, OFF by default. A plain
//      `npm run dev` does nothing; the developer must set it deliberately.
//   3. Mainnet stays independently gated in evm/networks.js (getNetwork throws
//      unless ALLOW_MAINNET, which is false). Even fully ungated, a send can only
//      ever reach a TESTNET — this flag can never move real funds.
//
// Because (1) is build-time and (3) is enforced deeper in the stack, the worst a
// misused flag can do is let a dev send testnet funds — never mainnet, never in a
// production build, and never by silently relabeling an asset as live.

/**
 * Is the dev-only send ungate active? PURE — a boolean of the `env` the CALLER
 * injects, with NO ambient reach. There is deliberately no `= import.meta.env`
 * default: a missing/empty `env` fails closed (returns false) instead of silently
 * falling back to the surrounding `import.meta.env`. The one runtime caller
 * (SendCrypto.jsx) passes `import.meta.env` explicitly; tests inject a controlled
 * env. Keeping the function pure means the closed-on-absence contract is genuinely
 * assertable — an absent-env test exercises THIS logic, not the runner's ambient env.
 * @param {{ DEV?: boolean, VITE_DEV_UNGATE_SEND?: string }} [env]
 * @returns {boolean}
 */
export function isDevSendUngated(env) {
  return env?.DEV === true && env?.VITE_DEV_UNGATE_SEND === '1';
}
