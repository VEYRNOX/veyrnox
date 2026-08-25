---
name: veyrnox-elliptic-upstream-watch
description: Weekly watch for upstream resolution of the Veyrnox elliptic low-severity residual (a patched elliptic, or the surviving Keystone chain dropping the elliptic path)
---

Upstream watcher for the Veyrnox wallet's accepted `elliptic` security residual
(GHSA-848j-6mx2-7j84). Signals come from read-only `npm view` registry queries plus one
read of `origin/main`'s committed lockfile. Do NOT modify files, run `npm install`, or
read the shared checkout's working tree.

> **Shared-checkout note.** The primary checkout is shared by ~10 worktrees and several
> other scheduled tasks, and is frequently on a detached HEAD or an unrelated branch. This
> task needs no worktree, but as of 2026-08-25 it DOES read one repo file — the lockfile —
> and it must read it from the ref, never the tree:
> `MSYS_NO_PATHCONV=1 git show origin/main:package-lock.json`. Sanity-check with
> `git cat-file -s origin/main:package-lock.json` that the byte count is non-zero; on
> Git Bash the `:` gets path-rewritten without `MSYS_NO_PATHCONV`, and the command then
> fails silently in a way that looks exactly like "no matches found".

## Background (why this task exists)
`elliptic` GHSA-848j-6mx2-7j84 ("Uses a Cryptographic Primitive with a Risky
Implementation", vulnerable `<= 6.6.1`) has NO patched release at any version — the newest
published is `6.6.1`, itself inside the vulnerable range. `package.json` already pins
`elliptic` to `^6.6.1` via an override, which is the only available mitigation and is
already fully applied. It is a documented accepted residual (`package.json`
`//overrides-audit-notes`; the `### elliptic` entry in
`.claude/scheduled-tasks/veyrnox-daily-dep-audit/SKILL.md`; Dependabot alert #1 dismissed
as `tolerable_risk`). This task watches for any upstream change that would let the
residual be reduced or cleared.

**Re-pointed 2026-08-25 — read this before trusting any older run of this task.** Until
today this runbook watched two chains, Ledger (`@ledgerhq/hw-app-eth` →
`@ethersproject/transactions` → `signing-key` → `elliptic`) and Trezor
(`@trezor/connect-web` → `@trezor/utxo-lib` → `tiny-secp256k1` → `elliptic`). **Both are
gone from the tree** — `@ledgerhq/hw-app-eth`, `@ethersproject/signing-key`,
`@trezor/connect-web`, `@trezor/utxo-lib` and `tiny-secp256k1` are all ABSENT from
`origin/main`'s lockfile (verified 2026-08-25 at `44b6d70e`). A third chain,
Keystone, arrived around 2026-08-22 and was never added here. So for some weeks this task
was probing two dead paths and had no probe at all for the live one: its "no upstream
movement" verdicts were true about packages that no longer mattered. Runs from 2026-08-22
to 2026-08-25 should be read as covering SIGNAL 1 only.

**The surviving chain, and it reaches `src/wallet-core/`:**
```
@keystonehq/keystone-sdk 0.12.3
  └─ @keystonehq/bc-ur-registry-eth 0.22.1   (hdkey ^2.0.1)
     └─ hdkey 2.1.0                          (secp256k1 ^4.0.0)
        └─ secp256k1 4.0.5                   (elliptic ^6.5.7)
           └─ elliptic 6.6.1                 GHSA-848j-6mx2-7j84
```
`src/wallet-core/hw/digitalShield.js` imports `ETHSignature` from
`@keystonehq/bc-ur-registry-eth`, so this is no longer the "off the signing path" story
the retired chains had. What keeps it low is a reachability argument, not the old slogan:
`digitalShield.js` calls only `ETHSignature.fromCBOR`, and the `hdkey`-backed APIs
(`generateAddressFromXpub`, `findHDPathFromAddress`) appear nowhere in `src/`. The full
analysis lives in the daily-audit residual entry — do not restate or re-litigate it here;
if it changes, that entry is the source of truth.

## Baseline — re-pointed and verified 2026-08-25
Each signal carries its own verification date. Re-verify rather than trusting the line; a
baseline nobody re-queries is how a signal silently goes stale, which is precisely what
happened to the Ledger and Trezor signals this runbook used to carry.
- SIGNAL 1 — verified 2026-08-25, unchanged since task creation: `elliptic@latest` =
  `6.6.1`, the newest version published at all and itself inside the advisory range. NOT
  fired. There is nothing to bump to.
- SIGNAL 2a (`secp256k1` drops `elliptic`) — verified 2026-08-25: `secp256k1@latest` =
  `5.0.2` and **still declares `elliptic: ^6.5.7`**. NOT fired. The tree resolves
  `secp256k1@4.0.5` via `hdkey`'s `^4.0.0`.
- SIGNAL 2b (`hdkey` drops `secp256k1`) — verified 2026-08-25: `hdkey@latest` = `2.1.0`
  (= the resolved version) and still declares `secp256k1: ^4.0.0`. NOT fired.
- SIGNAL 2c (`bc-ur-registry-eth` drops `hdkey`) — verified 2026-08-25:
  `@keystonehq/bc-ur-registry-eth@latest` = `0.22.1` (= the resolved version) and still
  declares `hdkey: ^2.0.1`. NOT fired. `@keystonehq/keystone-sdk@latest` = `0.12.3`
  (= resolved).

**Structural note, and it is the important one: this chain has no pre-baked escape
hatch.** The retired Trezor signal was cheap to fire because `tiny-secp256k1@2.x` had
ALREADY dropped elliptic upstream — only a parent pin had to move. Nothing equivalent
exists here. `secp256k1`'s newest major still depends on `elliptic`, and every link in the
chain is already at its latest published version. Short of SIGNAL 1, clearing this
requires a package that does not exist yet.

## The check (run these)
0. Re-derive the chain before probing anything, so this runbook cannot go stale the way it
   just did:
   ```bash
   MSYS_NO_PATHCONV=1 git -C <repo> show origin/main:package-lock.json > /tmp/vx-lock.json
   node -e 'const p=JSON.parse(require("fs").readFileSync("/tmp/vx-lock.json","utf8")).packages||{};
     for(const [k,v] of Object.entries(p)){const d={...v.dependencies,...v.optionalDependencies};
       if(d&&d.elliptic)console.log("requires elliptic:",k,v.version);}'
   ```
   Then walk parents up from each `elliptic` requirer to a direct dependency. If the chain
   you find is NOT the Keystone one described above — a link changed, a chain vanished, or
   a new one appeared — **stop and say so in the report**, and treat steps 1–4 as covering
   only the paths they actually name. Do not report a clean result for a path you did not
   examine. Re-pointing the signals is a follow-up for the owner, not something to
   improvise mid-run.

   **If the command prints NOTHING, `elliptic` is absent from the tree entirely.** That is
   a distinct outcome from "the chain changed", and it has its own instruction, because it
   is the one case where the tempting conclusion is also the dangerous one:

   - Say the lockfile at `origin/main` no longer contains any requirer of `elliptic`, and
     give the SHA you read.
   - Do NOT report the residual as cleared, and do NOT retire anything. Retirement belongs
     to the daily dep-audit's rule, which requires `npm audit` on a resolved tree — see
     the "Retired residuals" section of
     `.claude/scheduled-tasks/veyrnox-daily-dep-audit/SKILL.md`, where `shell-quote` was
     retired on a fired trigger in 2026-07 and reinstated the same day. **An absent
     lockfile entry is a strong hint, not that evidence.**
   - Skip signals 1–4 rather than running them: with no chain in the tree, "no upstream
     movement" describes nothing. Steps 1–4 answer whether upstream moved; they cannot
     tell you whether the residual still exists here.
   - Hand it to the owner as "candidate for retirement, needs an `npm audit` on the
     resolved tree", not as a result.
1. `npm view elliptic version` — and confirm it is the newest published, not just the
   `latest` tag: `npm view elliptic versions --json | tail -5`.  (SIGNAL 1)
2. `npm view secp256k1@latest version` and `npm view secp256k1@latest dependencies.elliptic`.  (SIGNAL 2a)
3. `npm view hdkey@latest version` and `npm view hdkey@latest dependencies.secp256k1`.  (SIGNAL 2b)
4. `npm view @keystonehq/bc-ur-registry-eth@latest version` and
   `npm view @keystonehq/bc-ur-registry-eth@latest dependencies.hdkey`; record
   `npm view @keystonehq/keystone-sdk@latest version` as context.  (SIGNAL 2c)

## Decision
The chain is LINEAR and is now the only one, so breaking any single link clears `elliptic`
from the tree entirely. That is the opposite of the old two-chain arithmetic, where a
partial signal only reduced the count — do not carry the old "PARTIAL fix" wording over.

- **SIGNAL 1 FIRED** if `elliptic@latest` resolves to `> 6.6.1` **and** that release is
  outside the advisory range. Full clear, and the cheapest one. Remediation: bump the
  `elliptic` override in `package.json` from `^6.6.1` to the patched range, regenerate
  with `npm install --package-lock-only` (do NOT pass `--legacy-peer-deps` — it strips the
  entire `appium` peer subtree, ~3,700 lockfile lines), then `npm audit` to confirm the
  elliptic LOWs drop to 0.
- **SIGNAL 2a FIRED** only if BOTH halves hold: `secp256k1` publishes a version with no
  `elliptic` dependency, AND that version is admitted by `hdkey`'s declared range (today
  `^4.0.0`). A fix landing only in `secp256k1@5.x` does NOT fire 2a on its own — `hdkey`
  would have to move its pin first, which makes it a 2b-shaped wait. Say which half is
  missing rather than reporting a bare version bump.
- **SIGNAL 2b FIRED** if `hdkey@latest` no longer declares `secp256k1` (moved to
  `@noble/secp256k1` or equivalent), AND `@keystonehq/bc-ur-registry-eth`'s `^2.0.1`
  admits that release.
- **SIGNAL 2c FIRED** if `@keystonehq/bc-ur-registry-eth@latest` no longer declares
  `hdkey`.
- Remediation for any of 2a/2b/2c, once one genuinely fires: on a new branch, bump the
  relevant direct dependency (`@keystonehq/bc-ur-registry-eth` and/or
  `@keystonehq/keystone-sdk`), regenerate with `npm install --package-lock-only`, then
  `npm audit` to confirm, and verify the resolved tree contains no `elliptic` at all.
  Note that `src/wallet-core/hw/__tests__/digitalShield.deps.test.js` asserts EXACT
  Keystone versions, so any bump there is a deliberate test change, not incidental churn.
  Keep the lockfile diff surgical.
- Otherwise **NO CHANGE**.
- **A version number is not evidence.** Neither is npm's `fixAvailable`. On 2026-07-27 the
  `shell-quote` residual was retired on a trigger that had genuinely fired and had to be
  reinstated the same day. Confirm against the resolved tree before recommending that
  anything be retired.
- There is also a non-upstream exit this task cannot observe: Veyrnox dropping Keystone
  hardware-wallet support would remove the chain outright. Out of scope here; named so a
  reader does not conclude SIGNAL 1 is the only possible end state.

## Output
- If NO CHANGE: one or two low-noise lines — e.g. "elliptic residual: no upstream
  movement. elliptic still 6.6.1 (no patch); secp256k1@latest 5.0.2 still declares
  elliptic; hdkey 2.1.0 and bc-ur-registry-eth 0.22.1 both still at latest with the chain
  intact. No action."
- If step 0 found a chain this runbook does not describe: report that FIRST, before any
  signal verdict, and state plainly which paths went unexamined.
- If ANY signal FIRED: state which, show old vs new versions/deps, and hand the
  remediation steps to the developer — do NOT apply them yourself. Always on a new branch,
  `npm audit` to confirm, lockfile diff surgical, update `//overrides-audit-notes` and the
  daily-audit residual entry, and note Dependabot alert #1 will reconcile automatically.
- Do NOT run `npm audit fix`, do NOT edit files. Read-only report only.
