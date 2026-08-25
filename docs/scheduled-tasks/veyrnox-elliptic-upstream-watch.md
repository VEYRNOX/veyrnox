---
name: veyrnox-elliptic-upstream-watch
description: Weekly watch for upstream resolution of the Veyrnox elliptic low-severity residual (patched elliptic, or the Keystone chain dropping the elliptic path)
---

Upstream watcher for the Veyrnox wallet's accepted `elliptic` security residual. Run entirely with read-only `npm view` registry queries — do NOT modify files, run `npm install`, or touch the repo working tree. Use the Bash tool for npm commands.

> **Shared-checkout note: this task needs no worktree, deliberately.** The primary
> checkout is shared by ~10 worktrees and several other scheduled tasks, so anything read
> from it is of unknown provenance. This task reads exactly ONE repo file — the lockfile
> in step 0 — and reads it from the ref
> (`MSYS_NO_PATHCONV=1 git show origin/main:package-lock.json`), never the working tree.
> Every other input comes from the npm registry. Do not add worktree ceremony to match
> the sibling tasks; it would be noise, not safety.
>
> (Until 2026-08-25 this task read no repo file at all, and the note here said so. That
> is exactly how it spent weeks probing two chains the tree no longer contained: with no
> lockfile read, a watcher cannot notice that what it watches has moved. Step 0 is the
> fix for that class of failure, not a convenience.)

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

## Step 0 — re-derive the chain from the lockfile BEFORE probing anything

The signals below are hard-coded to one chain. If the tree's chain has changed, they are
probing the wrong packages and a "no upstream movement" report is worthless. So derive
the chain first, from `origin/main`'s lockfile, and compare it to what this runbook
claims:

```bash
MSYS_NO_PATHCONV=1 git show origin/main:package-lock.json > "${TMPDIR:-/tmp}/veyrnox-lock.json"
git cat-file -s origin/main:package-lock.json   # must be non-zero; a silent MSYS
                                                # failure yields an empty file
node -e '
const pk = require(process.env.TMPDIR + "/veyrnox-lock.json").packages;
const name = p => p.replace(/^.*node_modules\//, "");
const deps = v => Object.keys({ ...(v.dependencies || {}), ...(v.optionalDependencies || {}) });
const dependents = t => Object.entries(pk)
  .filter(([k, v]) => k && v && deps(v).includes(t)).map(([k]) => name(k));
let layer = ["elliptic"], seen = new Set(layer), edges = [];
while (layer.length) {
  const next = [];
  for (const t of layer) for (const d of dependents(t)) {
    edges.push(d + " -> " + t);
    if (!seen.has(d)) { seen.add(d); next.push(d); }
  }
  layer = next;
}
console.log(edges.join("\n") || "elliptic is ABSENT from the tree");
const root = { ...(pk[""].dependencies || {}), ...(pk[""].devDependencies || {}) };
console.log("direct deps in the chain:", Object.keys(root).filter(d => seen.has(d)).join(", ") || "(none)");
'
```

Expected output as of 2026-08-25 — exactly these four edges and two direct dependencies:

```
secp256k1 -> elliptic
hdkey -> secp256k1
@keystonehq/bc-ur-registry-eth -> hdkey
@keystonehq/keystone-sdk -> @keystonehq/bc-ur-registry-eth
direct deps in the chain: @keystonehq/bc-ur-registry-eth, @keystonehq/keystone-sdk
```

- **Matches** → run the signals below as written.
- **`elliptic` is ABSENT** → the residual has cleared entirely. Do NOT report it cleared
  on this evidence alone and do NOT retire anything yourself: say the lockfile no longer
  contains `elliptic`, and hand it to the daily dep-audit's retirement rule, which
  requires an `npm audit` on the resolved tree. A package missing from the lockfile is a
  strong hint, not the retirement evidence that file demands.
- **A different or additional chain** → the signals below are stale in exactly the way
  the Ledger/Trezor ones were. Report the derived chain, say which signals no longer
  apply, and recommend re-pointing this runbook. Do NOT silently probe the old packages
  and report "no movement".

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

## A second chain returning

A Trezor or Ledger integration coming back would reintroduce a second chain. That is not
a registry signal, but step 0 DOES see it — it derives every path to `elliptic` from the
lockfile, not just the one this runbook names. Report it and recommend re-pointing; do
not try to probe it with the signals below, which are specific to the Keystone chain.
The daily dep-audit's blast-radius check covers the same ground from the other side.

## Output

- Always state the step 0 result first, in the NO CHANGE case too — "chain unchanged
  (4 edges, Keystone only)" is the sentence that makes the rest of the report mean
  anything. A report that omits it cannot be told apart from one probing dead packages.
- If NO CHANGE: one or two low-noise lines — e.g. "elliptic residual: chain unchanged
  (Keystone only, 4 edges); no upstream movement. elliptic still 6.6.1 (no patch);
  bc-ur-registry-eth still declares hdkey; hdkey still declares secp256k1; secp256k1
  latest still declares elliptic. No action."
- If ANY signal FIRED: state which, show old vs new dependency declarations (not just
  versions), say it is a FULL clear, and give the remediation steps — including the
  pin-aware note above where it applies. Always on a new branch, `npm audit` to confirm,
  keep the lockfile diff surgical, update `//overrides-audit-notes` and the `elliptic`
  entry in the daily-dep-audit runbook in the same commit.
- Do NOT run `npm audit fix`, do NOT edit files. Read-only report only.
