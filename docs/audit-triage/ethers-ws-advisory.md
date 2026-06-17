# Dependency advisory triage — `ws` via `ethers` (ETH path)

> Triaged 2026-06-17 as part of the ETH internal-audit flow. This is an honest
> reachability analysis of a real `npm audit` finding, not a dismissal. It records
> WHY the advisory is accepted (not fixed) and the exact condition that would make
> it live again.

## The finding

`npm audit --omit=dev` reports, in the production dependency tree, `ws` 8.0.0–8.20.1
pulled in via `ethers@6 → ws`:

- `GHSA-96hv-2xvq-fx4p` — **HIGH** — ws: memory-exhaustion DoS from many tiny frames
- `GHSA-58qx-3vcg-4xpx` — **moderate** — ws: uninitialised memory disclosure

(Earlier notes called both HIGH; per `npm audit`, only `GHSA-96hv` is high.)

The advisory's offered "fix" is `npm audit fix --force`, which installs **`ethers@5.8.0`**
— a BREAKING major downgrade of the wallet's core signing library. NOT applied.

## Reachability analysis (why it is not exploitable here)

Both `ws` advisories require the `ws` library to **process attacker-controlled
WebSocket data** (server or client). For that to matter, the app must (a) use the
`ws` package, via (b) ethers' `WebSocketProvider`. Neither is true:

1. **No `WebSocketProvider` in code.** Every EVM provider is built in
   `src/wallet-core/evm/provider.js` as `new JsonRpcProvider(httpsUrl, …)` — RPC
   over HTTPS only. A repo-wide search finds zero `WebSocketProvider` usages; all
   reads/broadcasts go through `getProvider()` → `JsonRpcProvider`.
2. **`ws` is Node-only.** ethers pulls `ws` solely for `WebSocketProvider` in a
   Node runtime; in the browser/Capacitor target ethers uses the native
   `WebSocket` global, never the npm package.
3. **Absent from the shipped bundle (empirical).** A production `vite build`
   (`dist/`, 4.9 MB) was grepped:
   - `ws`-package internals (`sec-websocket-key`, `permessage-deflate`,
     `PerMessageDeflate`, `_isServer`, `websocket.js`) → **0 matches**
   - `WebSocketProvider` symbol → **0 matches** (tree-shaken out)
   - 45 `WebSocket` occurrences = the native browser global (feature-detection),
     not the vulnerable package.

The vulnerable code is therefore neither bundled nor reachable in the deployed
web/Capacitor app. It is a transitive Node-path advisory only.

## Verdict

- **Severity in this product: not exploitable** in the shipped client.
- **Disposition: accepted exception.** Do NOT run `npm audit fix --force`
  (breaking ethers downgrade). Tracked in the `audit:eth` harness allowlist
  (`ACCEPTED_ADVISORIES`, keyed to the two GHSA ids, referencing this doc).
- **Residual risk / re-triage trigger:** if any feature ever constructs an
  ethers `WebSocketProvider` (e.g. subscription/`eth_subscribe` RPC), this
  advisory becomes LIVE — remove the exception and remediate (pin a patched
  `ws`, or keep HTTPS-only). The harness allowlist comment carries this warning.
- **Upstream fix path (non-breaking):** when `ethers@6` ships a release that
  depends on `ws ≥ 8.21` (patched), upgrade ethers and drop this exception.

## Also surfaced: dev-only high advisories (`lodash`, `picomatch`) — not shipped

The first per-advisory harness run also flagged two HIGH advisories that are NOT
in the production tree at all:

- `lodash` — `GHSA-r5fr-rjxr-66jc` (high)
- `picomatch` — `GHSA-c2c7-rcm5-vvqj` (high)

`npm ls lodash` and `npm ls picomatch` (with and without `--omit=dev`) both return
`(empty)`, and neither is imported under `src/`. They are **devDependency toolchain
transitives** (Vite/Tailwind globbing, lint/build tooling) that `npm audit
--omit=dev` over-reports from the lockfile. They are not in the client bundle and
cannot reach end users. The `audit:eth` harness now cross-checks every high/critical
package against `npm ls <pkg> --omit=dev` and classifies these as **dev-only (not
production-reachable)** rather than blocking. Disposition: accepted as dev-only;
bump when the dev toolchain pulls patched versions. No code/runtime exposure.

## Note — separate, lower-severity finding (SOL path, NOT triaged here)

`npm audit` also flags `@solana/web3.js → jayson → uuid` (moderate). That is the
SOL stack, which is `receive_only` and whose `ws`/Buffer-touching code is confined
to `provider.js`/`send.js` per `docs/Audit.scope.md` §2c. It is out of scope for
this ETH triage and needs its own reachability pass before SOL's gate.
