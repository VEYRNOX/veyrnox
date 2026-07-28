---
name: veyrnox-elliptic-upstream-watch
description: Weekly watch for upstream resolution of the Veyrnox elliptic low-severity residual (patched elliptic, or Ledger/Trezor dropping the elliptic path)
---

Upstream watcher for the Veyrnox wallet's accepted `elliptic` security residual. Run entirely with read-only `npm view` registry queries — do NOT modify files, run `npm install`, or touch the repo at `C:\Users\aljob\Downloads\Veyrnox`. Use the Bash tool (Git Bash) for npm commands.

> **Shared-checkout note (2026-07-28): this task needs no worktree, deliberately.** The
> primary checkout is shared by ~10 worktrees and several other scheduled tasks, so
> sibling watchers now read `package.json`/`package-lock.json` from `origin/main` rather
> than its working tree. This task reads **no repo file at all** — every signal comes from
> the npm registry — so it has no exposure to that state and nothing to pin. Do not add
> worktree ceremony here to match the others; it would be noise, not safety. If a future
> check ever needs the lockfile, pin it to the ref
> (`git show origin/main:package-lock.json`, with `MSYS_NO_PATHCONV=1` set) rather than
> reading the checkout.

## Background (why this task exists)
The Veyrnox `npm audit` shows ~18 LOW findings all rooted in ONE advisory: `elliptic` GHSA-848j-6mx2-7j84 ("Uses a Cryptographic Primitive with a Risky Implementation", vulnerable `<= 6.6.1`). There is currently NO patched `elliptic` at any version — latest published is `6.6.1`, which is itself inside the vulnerable range. The project already pins `elliptic` to `^6.6.1` via a package.json override (the only available mitigation). `elliptic` is OFF the wallet's own signing path (wallet-core uses `@noble`/`@scure`); it reaches the tree solely through two hardware-wallet transport dependencies:
  - Ledger: `@ledgerhq/hw-app-eth` -> `@ethersproject/transactions` (v5) -> `signing-key` -> `elliptic`
  - Trezor: `@trezor/connect-web` -> `@trezor/utxo-lib` -> `tiny-secp256k1` (v1) -> `elliptic`
It's a documented accepted residual (`package.json` `//overrides-audit-notes`; Dependabot alert #1 dismissed as `tolerable_risk`). This task watches for any upstream change that would let the residual be reduced or cleared.

## Baseline at task creation (2026-07-21)
- SIGNAL 1 — `elliptic@latest` = `6.6.1` (still vulnerable; no patched release exists).
- SIGNAL 2a (Ledger) — `@ledgerhq/hw-app-eth@latest` = `7.8.9` (= the version the repo depends on, `^7.8.9`), STILL declares `@ethersproject/abi`, `@ethersproject/rlp`, `@ethersproject/transactions` at `^5.7.0` (the v5 chain that pulls elliptic).
- SIGNAL 2b (Trezor) — `@trezor/connect-web@latest` = `9.7.3` (= installed). Our tree resolves `tiny-secp256k1@1.1.7` (old, uses elliptic) via `@trezor/utxo-lib`. NOTE: `tiny-secp256k1@latest` (2.2.4) has already DROPPED elliptic (WASM/@noble), so this path clears as soon as `@trezor/utxo-lib` bumps to a tiny-secp256k1 v2.x line.

## The check (run these)
1. `npm view elliptic version`  (SIGNAL 1)
2. `npm view @ledgerhq/hw-app-eth@latest version` and `npm view @ledgerhq/hw-app-eth@latest dependencies --json` — inspect for any `@ethersproject/*` keys.  (SIGNAL 2a)
3. `npm view @trezor/connect-web@latest version`, and `npm view @trezor/utxo-lib@latest dependencies.tiny-secp256k1` — check whether the utxo-lib tiny-secp256k1 pin has moved to `>= 2.0.0`.  (SIGNAL 2b)

## Decision
- SIGNAL 1 FIRED (best outcome — clears ALL ~18 at once) if `elliptic@latest` resolves to `> 6.6.1`. Remediation: bump the `elliptic` override in `package.json` from `^6.6.1` to the patched range, `npm install --legacy-peer-deps`, `npm audit` to confirm the elliptic LOWs drop to 0.
- SIGNAL 2a FIRED (partial — clears the Ledger sub-tree, ~9 findings) if `@ledgerhq/hw-app-eth@latest` NO LONGER declares any `@ethersproject/*` dependency (migrated to ethers v6 or dropped the signing-key path). Remediation: bump `@ledgerhq/hw-app-eth`, reinstall, re-audit.
- SIGNAL 2b FIRED (partial — clears the Trezor sub-tree) if `@trezor/utxo-lib@latest` now pins `tiny-secp256k1` at `>= 2.0.0`, OR a new `@trezor/connect-web` release above `9.7.3` exists. Remediation: bump `@trezor/connect-web`, reinstall, re-audit.
- Otherwise NO CHANGE.
- IMPORTANT: `elliptic` is only fully removed when BOTH 2a AND 2b clear (or when SIGNAL 1 ships a patched elliptic). A single partial signal reduces the count but the `elliptic` finding itself persists via the other path — say so explicitly.

## Output
- If NO CHANGE: one or two low-noise lines — e.g. "elliptic residual: no upstream movement. elliptic still 6.6.1 (no patch); hw-app-eth still on @ethersproject v5; @trezor/utxo-lib still on tiny-secp256k1 v1. No action."
- If ANY signal FIRED: state which signal(s), show the old vs new versions/deps, whether it's a FULL or PARTIAL fix, and the remediation steps to hand to the developer (do NOT apply them yourself — this is a report). Always apply changes on a new branch, run `npm audit` to confirm, keep the lockfile diff surgical (restore the committed lock and do in-place `--package-lock-only` updates rather than a full regeneration), update `//overrides-audit-notes`, and note Dependabot alert #1 will reconcile automatically.
- Do NOT run `npm audit fix`, do NOT edit files. Read-only report only.