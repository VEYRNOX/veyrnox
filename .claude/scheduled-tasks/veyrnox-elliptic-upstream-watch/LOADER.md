---
name: veyrnox-elliptic-upstream-watch
description: Weekly watch for upstream resolution of elliptic residual
---

Read and execute this task's runbook, resolved from the `origin/main` REF — not from the checkout's working tree.

```bash
cd /Users/aljobson/Documents/GitHub/veyrnox && git fetch origin main
RUNBOOK=".claude/scheduled-tasks/veyrnox-elliptic-upstream-watch/SKILL.md"
OUT="${TMPDIR:-/tmp}/veyrnox-elliptic-upstream-watch-runbook.md"
git cat-file -s "origin/main:$RUNBOOK"   # must print a non-zero byte count
git show "origin/main:$RUNBOOK" > "$OUT"
```

If that byte count is missing or zero, STOP and report that the runbook could not be resolved. Do NOT fall back to the working-tree copy. Otherwise read "$OUT" and follow it verbatim — read-only `npm view` queries plus the single lockfile read in step 0, no worktree. See the note at the bottom for which runbook version you should expect and what to do if you get the older one.

Why the ref and not the path: this checkout is shared by ~10 worktrees and several other scheduled tasks, and is frequently on a detached HEAD or an unrelated feature branch. Reading the runbook from its working tree executes whichever version that branch happens to carry, including another session's uncommitted edits.

Note for this run: as of 2026-08-25 the elliptic residual reaches the tree through ONE chain only — `@keystonehq/keystone-sdk` -> `@keystonehq/bc-ur-registry-eth` -> `hdkey` -> `secp256k1` -> `elliptic`. The Trezor and Ledger chains are gone from `origin/main`'s lockfile.

**Check which runbook you resolved before probing anything.** The re-pointed version opens with a "Step 0 — re-derive the chain from the lockfile" section; the old one does not, and instead carries SIGNAL 2a/2b probing `@ledgerhq/hw-app-eth` and `@trezor/utxo-lib`. Both are packages the tree no longer contains, so those probes cannot fire and a "no upstream movement" report from them is worthless.

- **Step 0 present** — follow the runbook as written. Step 0's lockfile read is expected; any other repo file access is not, and the lockfile must come from the ref (`MSYS_NO_PATHCONV=1 git show origin/main:package-lock.json`), never the working tree.
- **Step 0 absent** — you have a pre-#2083 ref. Do NOT run SIGNAL 2a/2b. Report that the resolved runbook is the stale two-chain version, and give the one signal that is still meaningful: `npm view elliptic version` (a result `> 6.6.1` clears the residual entirely).

Verified 2026-08-25 by running the re-pointed runbook against `origin/main` `a9f86d94`: step 0 reproduced the documented four edges exactly, and none of the four signals fired (`elliptic` 6.6.1; `bc-ur-registry-eth` 0.22.1 still declares `hdkey`; `hdkey` 2.1.0 still declares `secp256k1`; `secp256k1` `latest` 5.0.2 still declares `elliptic ^6.5.7` — a major ahead of our resolved 4.0.5 and still carrying it).