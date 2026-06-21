# Copilot instructions for Veyrnox

Veyrnox is a self-custody, **coercion-resistant crypto wallet** (Vite + React +
Capacitor; ethers v6; @noble / @scure). The seed is the identity; the app never
holds keys server-side. Web + mobile (iOS/Android via Capacitor).

These instructions apply to **Copilot code review, the coding agent, and Copilot
Chat**. The authoritative project guide is `CLAUDE.md` — follow it. This file
summarizes the rules most relevant to automated changes and reviews.

## Build, test, and gates — run before claiming anything works

Toolchain: **Node 22, npm 11**. The lockfile requires npm 11, so run
`npm install -g npm@11` first, then `npm ci`. Then:

- `npm run lint` — ESLint, must be clean
- `npm run typecheck` — whole-tree checkJs held at zero errors
- `npm run check:rng` — CSPRNG guard (security-critical; must pass)
- `npm run build` — Vite build
- `npm test` — Vitest

CI (`.github/workflows/ci.yml`) runs all of these on every PR. A change is not
"done" until they pass. Report real results, never assumed ones.

## Hard rules (never violate)

1. **Verify, don't assert.** "Verified" or asset `status: live` requires a REAL
   on-chain testnet transaction confirmed on a block explorer with a txid the
   user supplied. Passing tests, clean review, or green CI are **not**
   verification. Never flip an asset to `live` or write "verified" in code,
   comments, docs, or PR text.
2. **Status tags.** Every feature is BUILT (in code, testnet/provisional),
   TARGET (designed, audit-gated), PLANNED (roadmap), or HONEST-DISABLED
   (present but off on principle). Code-complete + tests green = BUILT at most,
   never "verified".
3. **No fake security.** Never mock or stub a security control to look real. If
   it can't be delivered honestly, honest-disable it (fail honest, fail closed).
4. **Internal ≠ independent.** The completed audit is internal. Never present it
   as an independent third-party audit.
5. **Don't flip gate flags as a side effect.** `ALLOW_MAINNET`,
   `ALLOW_BTC_MAINNET`, `ALLOW_SOL_MAINNET`, and asset `status` must never change
   as part of an unrelated edit.

## Security invariants (treat as review blockers)

- **I1** keys never leave the device. **I2** no silent data egress. **I3**
  deniability mode makes zero backend calls. **I4** fail honest, fail closed.
  **I5** backend is untrusted by design.

Flag any change that: transmits seed / private-key / mnemonic material anywhere;
adds network calls on deniability paths; introduces silent telemetry or egress;
or weakens the CSPRNG guard (`scripts/check-crypto-rng.mjs`).

## Demo mode (known trap)

Demo mode triggers on `?demo=1`, `VITE_DEMO_MODE=1`, native dev, OR a persisted
`veyrnox-demo=1` in localStorage. It shows fake balances and fake sends. Never
let demo behavior leak into real paths or be presented as real.

## Conventions

- Env flags go in `.env.local` (git-ignored), never inline shell vars (breaks on
  Windows/PowerShell).
- Prefer pure helpers + unit tests where logic can be extracted (codebase pattern).
- One moving part per change. Recon before changing; state root cause before fixing.
- Never commit secrets — `.env*`, `*.key`, `*.pem`, `*.mnemonic`, `*.seed` are
  git-ignored; keep it that way.

## Wallet model (orientation)

One HD seed derives per-chain accounts (Model B). EVM assets (ETH, MATIC, ARB,
OP, AVAX, BNB) share one secp256k1 `m/44'/60'` address; ERC-20s (USDC/USDT) are
contract calls on it; BTC (`m/84'`/PSBT) and SOL (ed25519/SLIP-0010) have their
own addresses. Per-chain gotchas and asset status live in
`src/wallet-core/assets.js` and `CLAUDE.md`.

## For the coding agent specifically

- Keep PRs small and single-purpose. Never auto-resolve review threads.
- Be **extra conservative in `src/wallet-core/**`** (seed / key / derivation /
  signing). Prefer proposing a plan over making large edits there.
- Never weaken or remove a security control to make a test pass.
- Always run the gate commands above and report the real output.
