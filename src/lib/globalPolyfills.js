// src/lib/globalPolyfills.js
//
// Buffer/process polyfills for Node-shaped wallet-core deps (bn.js, hash-base,
// readable-stream v2, Keystone/bc-ur-registry) that assume a Node-like global.
//
// MUST be the FIRST import in main.jsx. ES `import` declarations are hoisted,
// so a shim written as inline top-level statements in main.jsx (interleaved
// between imports) actually runs AFTER every static import in that file has
// already been evaluated -- including transitive deps that install their own
// PARTIAL `process` shim first.
//
// Concretely (RSP-05/A11Y-04/MNY-01/MNY-02/RTE-01/SET-01, 2026-09-21):
// @reown/appkit-polyfills sets `window.process = { env: {} }` during Vite's
// dev-server prebundle (node_modules/.vite/deps/...), which evaluates before
// main.jsx's own inline `if (typeof globalThis.process === 'undefined')`
// guard ever ran -- the guard saw an object already there and skipped, so
// `process.browser` stayed undefined. hash-base's readable-stream v2 then
// throws on `!process.browser && [...].indexOf(process.version.slice(0, 5))`
// the moment a lazy chunk (Send/Receive/Digital Shield) first touches it.
// Never reproduces in a production `vite build`: the dev prebundle step
// doesn't run there, so a shim that only fires on `undefined` was enough --
// but "enough in prod" isn't "correct", and it broke the dev server outright.
//
// Fix: MERGE into whatever's already on globalThis.process (fill in only the
// fields that are missing) instead of skipping whenever something is there,
// and be the very first import in main.jsx so this runs before ANY
// transitive import -- including appkit-polyfills -- can install its own
// partial shim first.
import { Buffer as NodeBuffer } from 'buffer'

// CONSOLE-1 (#179): see main.jsx history. bn.js (bundled via @solana/web3.js)
// probes `typeof window.Buffer !== 'undefined' ? window.Buffer : require('buffer').Buffer`
// at module-init; without a global Buffer it hits Vite's externalized stub.
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = NodeBuffer
}

// Merges default process fields into whatever object already occupies
// globalThis.process (or {} if nothing does), never overwriting a field a
// prior shim already set. Exported (pure, no global reads/writes) so the
// merge logic itself is unit-testable without touching globalThis.
export function mergeProcessPolyfill(existing) {
  const base = typeof existing === 'object' && existing !== null ? existing : {}
  return {
    ...base,
    env: base.env ?? {},
    browser: base.browser ?? true,
    versions: base.versions ?? {},
    version: base.version ?? '',
    platform: base.platform ?? 'browser',
  }
}

globalThis.process = mergeProcessPolyfill(globalThis.process)
