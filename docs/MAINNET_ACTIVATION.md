# Mainnet Activation — process and history

**Status: mainnet is already live.** This document records the actual, historical
process by which Veyrnox unlocked mainnet, and the process any FUTURE change to a
mainnet activation flag must go through. It is not a forward-looking proposal — it
is the process that was followed, kept as the reference for the next time one of
these flags moves.

## What "mainnet activation flag" means here

A small, fixed set of flags gate whether the app can move real (non-testnet) funds:

| Flag | File | Purpose |
|---|---|---|
| `ALLOW_MAINNET` | `src/wallet-core/evm/networks.js` | Master switch for all EVM mainnet chains (Ethereum, Polygon, Arbitrum, Optimism, Avalanche, BNB). |
| `ALLOW_BTC_MAINNET` | `src/wallet-core/btc/networks.js` | Master switch for Bitcoin mainnet. |
| `ALLOW_SOL_MAINNET` | `src/wallet-core/sol/networks.js` | Master switch for Solana mainnet-beta. |
| `enabled: true/false` | per-chain entries in the three files above | Per-chain kill switch (independent of the master switch — both must be true for a mainnet chain to be reachable). |
| `isTestnet: true/false` | per-chain entries in the three files above | Marks whether a chain entry is subject to the mainnet gate at all. Flipping this on an existing entry changes which gate (if any) applies to it. |

These are deliberately the ONLY flags this process (and the CI gate below) cares
about. They are the single source of truth `getNetwork()` / `getBtcNetwork()` /
`getSolNetwork()` check before returning a live RPC/provider (see the `SECURITY
RATIONALE` comment block at the top of each `networks.js`).

## Historical activation — 2026-06-17

1. **Internal security audit completed and signed off.**
   `docs/audit-triage/internal-audit-2026-06-17.md` — all GATE-CRITICAL automated
   checks passed, 0 CRITICAL/HIGH/MEDIUM findings in code review. Owner sign-off is
   recorded in that document.
2. **All implementation PRs required for the audited surface were merged to `main`**
   before the flags were flipped — the audit reviewed the code that would actually
   ship, not a future state.
3. **CI was green** (`npm run typecheck`, `npm test`, `npm run build`, lint, and the
   supply-chain gate all passing) at the commit the flags were flipped on.
4. **The flags were flipped in a single, reviewable commit**: `ALLOW_MAINNET`,
   `ALLOW_BTC_MAINNET`, `ALLOW_SOL_MAINNET` all set `true`, and every EVM chain's
   `enabled` also set `true` — see the `// unlocked 2026-06-17 owner sign-off`
   comment attached to each flipped line in all three `networks.js` files.
5. **Independent third-party audit** (`docs/audit-triage/ecc-independent-audit-2026-06-23.md`,
   2026-06-23) was performed for additional depth after the internal gate had
   already opened mainnet. Per `CLAUDE.md` / `docs/Audit.scope.md`, the internal
   audit is the hard gate that opens mainnet; the independent audit is
   recommended but does not itself gate. All findings from the independent audit's
   review round were fixed (see PR #340).
6. A follow-up 2026-06-27 independent review of unvalidated audit claims
   (`docs/audit-2026-06-27-unvalidated-claims.md`) found 3 HIGH + 5 MEDIUM findings
   in claims made ABOUT the audit (not new code vulnerabilities) — mitigations
   landed in PRs #421–#426. This did not reopen or reverse the mainnet gate
   decision; it hardened claims made around it.

## Process for any FUTURE change to a mainnet activation flag

Mainnet being live does not mean these flags are "done" — a future PR could still
legitimately need to touch one (e.g. adding a new EVM chain, temporarily disabling
a single chain for an incident, or a protocol-level change). The process:

1. **Verify the audit sign-off record still applies.** Re-read
   `docs/audit-triage/internal-audit-2026-06-17.md` (the gate) and confirm nothing
   in the new PR contradicts an assumption it relied on. If the change is
   substantial (e.g. a new mainnet chain), a fresh internal audit pass may be
   needed before flipping the flag for that chain — this is a judgment call for
   the owner, not automated.
2. **Ensure all implementation PRs the flag change depends on are merged first.**
   Flag changes should land in their own reviewable commit/PR, not bundled
   invisibly inside a larger feature PR.
3. **CI must be green** — `npm run typecheck`, `npm test`, `npm run build`, lint,
   and the supply-chain gate (`scripts/audit-gate.mjs`) all passing.
4. **The diff-based mainnet flag gate will flag the PR automatically.** Any PR
   whose diff touches `ALLOW_MAINNET`, `ALLOW_BTC_MAINNET`, `ALLOW_SOL_MAINNET`, or
   an `enabled`/`isTestnet` value in `src/wallet-core/{evm,btc,sol}/networks.js` or
   `src/wallet-core/assets.js` gets:
   - the `mainnet-gate-required` label, and
   - a PR comment listing exactly which flag(s) changed, in which file, at which
     line, old value → new value.
   See `scripts/detect-mainnet-flag-changes.js` and the `mainnet-flag-gate` job in
   `.github/workflows/ci.yml`.
5. **A flagged PR requires explicit approval** — code review from another
   contributor AND owner sign-off — before merge. The gate does not block the
   merge button itself (see `docs/MAINNET_GATE_DESIGN.md` for why); the label and
   comment exist so a reviewer cannot miss that the PR touches this surface.
6. **Merge, then deploy.** Once approved, merge follows the normal `main`-branch
   pipeline (`.github/workflows/ci.yml` `android-release` job for the Android
   artifact; web deploys via the existing Vercel pipeline).

## References

- `docs/audit-triage/internal-audit-2026-06-17.md` — the internal audit; owner
  sign-off; the hard gate that opened mainnet.
- `docs/audit-triage/ecc-independent-audit-2026-06-23.md` — the independent
  third-party audit (additional depth, not itself a gate).
- `docs/MAINNET_GATE_DESIGN.md` — design rationale for the CI gate that watches
  these flags going forward.
- `scripts/detect-mainnet-flag-changes.js` — the detector.
- `src/wallet-core/evm/networks.js`, `src/wallet-core/btc/networks.js`,
  `src/wallet-core/sol/networks.js` — the flags themselves, with the
  `// unlocked 2026-06-17 owner sign-off` provenance comment on each flipped line.
