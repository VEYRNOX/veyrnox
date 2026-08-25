---
name: veyrnox-elliptic-upstream-watch
description: Weekly watch for upstream resolution of the Veyrnox elliptic low-severity residual (patched elliptic, or the Keystone chain dropping the elliptic path)
---

Upstream watcher for the Veyrnox wallet's accepted `elliptic` security residual. Run entirely with read-only `npm view` registry queries — do NOT modify files, run `npm install`, or touch the repo working tree. Use the Bash tool for npm commands.

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

The Veyrnox `npm audit` reports 5 LOW findings, all rooted in ONE advisory: `elliptic`
GHSA-848j-6mx2-7j84 ("Uses a Cryptographic Primitive with a Risky Implementation",
vulnerable `<= 6.6.1`). There is NO patched `elliptic` at any version — `latest` is
`6.6.1`, itself inside the vulnerable range. The project already pins `elliptic` to
`^6.6.1` via a `package.json` override, which is the only available mitigation.

**Re-pointed 2026-08-25. This task used to watch the Ledger and Trezor chains; both are
gone.** `@trezor/connect-web`, `@trezor/utxo-lib`, `tiny-secp256k1`,
`@ledgerhq/hw-app-eth` and `@ethersproject/signing-key` are all ABSENT from
`origin/main`'s `package-lock.json` (checked at `24333ad9`). The old SIGNAL 2a/2b probed
packages the tree no longer contains, so they could never fire — and a "no upstream
movement" report from them read as coverage while covering nothing. That is the
`brace-expansion` failure mode recorded in the daily audit's retired-residuals section:
a watcher existing is not evidence it watches the thing you care about.

`elliptic` now reaches the tree through exactly ONE chain:

```
@keystonehq/keystone-sdk -> @keystonehq/bc-ur-registry-eth -> hdkey
  -> secp256k1 -> elliptic
```

**This chain is in `src/wallet-core/`, unlike the two it replaced.**
`src/wallet-core/hw/digitalShield.js:12` imports `ETHSignature` from
`@keystonehq/bc-ur-registry-eth`, and `src/wallet-core/hw/__tests__/digitalShield.deps.test.js`
calls that package a signing-path dependency pin. What keeps the residual at low is
narrower than "off the signing path": only `ETHSignature.fromCBOR` is called; `hdkey`
backs `generateAddressFromXpub` / `findHDPathFromAddress`, neither of which appears
anywhere in `src/`; the Keystone device performs the signing. Full reasoning lives in the
`elliptic` entry of `.claude/scheduled-tasks/veyrnox-daily-dep-audit/SKILL.md` — read it
before acting on any signal here.

## Baseline (re-measured 2026-08-25, registry `latest`)

- SIGNAL 1 — `elliptic@latest` = `6.6.1`. Still vulnerable; no patched release exists.
- SIGNAL 2 — `@keystonehq/bc-ur-registry-eth@latest` = `0.22.1` (= the repo's exact pin)
  and STILL declares `hdkey: ^2.0.1`.
- SIGNAL 3 — `hdkey@latest` = `2.1.0` (= the resolved version) and STILL declares
  `secp256k1: ^4.0.0`.
- SIGNAL 4 — `secp256k1@latest` = `5.0.2`; the tree resolves `4.0.5`. **`5.0.2` STILL
  declares `elliptic: ^6.5.7`**, so the newer major does not clear anything. Recorded
  explicitly because it is the exact shape of trap this file keeps hitting: a version
  number ahead of ours looks like progress and is not.
- Context — `@keystonehq/keystone-sdk@latest` = `0.12.3` (= the repo's exact pin),
  depending on `@keystonehq/bc-ur-registry-eth: ^0.22.0`.

## The check (run these)

1. `npm view elliptic version` — (SIGNAL 1)
2. `npm view @keystonehq/bc-ur-registry-eth@latest version` and
   `npm view @keystonehq/bc-ur-registry-eth@latest dependencies --json` — is the `hdkey`
   key still there? (SIGNAL 2)
3. `npm view hdkey@latest version` and `npm view hdkey@latest dependencies --json` — is
   the `secp256k1` key still there? (SIGNAL 3)
4. `npm view secp256k1@latest version` and `npm view secp256k1@latest dependencies --json`
   — is the `elliptic` key still there? (SIGNAL 4)
5. `npm view @keystonehq/keystone-sdk@latest version` — CONTEXT ONLY, never a trigger.

## Decision

**Every signal below fires on a dependency KEY DISAPPEARING, never on a version number
moving.** A new release of any of these packages that still declares the same dependency
has not fired anything. Say "no movement" and give the version as context.

- **SIGNAL 1 FIRED** (best outcome — clears all 5 findings at once) if `elliptic@latest`
  resolves to `> 6.6.1`. Remediation: bump the `elliptic` override in `package.json` from
  `^6.6.1` to the patched range, regenerate with `npm install --package-lock-only` (NOT
  `--legacy-peer-deps` — it strips the appium subtree), `npm audit` to confirm the LOWs
  drop to 0.
- **SIGNAL 2 FIRED** (FULL — clears all 5) if `@keystonehq/bc-ur-registry-eth@latest` NO
  LONGER declares `hdkey`. Remediation is NOT a plain bump — see "Remediation is
  pin-aware" below.
- **SIGNAL 3 FIRED** (FULL — clears all 5) if `hdkey@latest` NO LONGER declares
  `secp256k1`. **A bump to a `secp256k1` v5 line does NOT fire this** — `5.0.2` still
  carries `elliptic` (see baseline). The trigger is the key being gone, or the pin moving
  to a `secp256k1` range that itself no longer declares `elliptic`, which you must verify
  with check 4 rather than assume.
- **SIGNAL 4 FIRED** (FULL — clears all 5) if `secp256k1@latest` NO LONGER declares
  `elliptic`. Remediation: an `overrides` entry forcing `secp256k1` to that version, then
  regenerate and re-audit. Note `secp256k1` is a native module (`node-gyp-build`), so
  confirm the install still builds before proposing the override.
- **Otherwise NO CHANGE.**
- Unlike the old two-chain shape, **any one of signals 1-4 clears the residual
  completely** — there is no partial outcome any more, because there is only one chain.
  Do not describe a fired signal as "partial".

### Remediation is pin-aware (SIGNAL 2 and 3)

The Keystone packages are pinned EXACTLY in `package.json` (`@keystonehq/keystone-sdk`
`0.12.3`, `@keystonehq/bc-ur-registry` `0.8.0`, `@keystonehq/bc-ur-registry-eth`
`0.22.1`, `@keystonehq/bc-ur-registry-sol` `0.9.5`) and are excluded from grouped
Dependabot bumps. `src/wallet-core/hw/__tests__/digitalShield.deps.test.js` asserts both
facts. So a remediation that bumps one of these pins MUST also update that test's
expected versions in the same PR, or CI goes red for the right reason. Say this in the
report — do not hand over a bump instruction that looks like a one-line change.

## Out of scope for this task

A Trezor or Ledger integration returning would reintroduce a second chain. That is not a
registry signal and this watcher cannot see it; the daily dep-audit's blast-radius check
covers it. Do not add repo-reading ceremony here to chase it.

## Output

- If NO CHANGE: one or two low-noise lines — e.g. "elliptic residual: no upstream
  movement. elliptic still 6.6.1 (no patch); bc-ur-registry-eth still declares hdkey;
  hdkey still declares secp256k1; secp256k1 latest still declares elliptic. No action."
- If ANY signal FIRED: state which, show old vs new dependency declarations (not just
  versions), say it is a FULL clear, and give the remediation steps — including the
  pin-aware note above where it applies. Always on a new branch, `npm audit` to confirm,
  keep the lockfile diff surgical, update `//overrides-audit-notes` and the `elliptic`
  entry in the daily-dep-audit runbook in the same commit.
- Do NOT run `npm audit fix`, do NOT edit files. Read-only report only.
