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

**Check which runbook you resolved before probing anything.** The re-pointed version has a step 0 that re-derives the chain from the lockfile; the old one does not. Tell them apart by the PACKAGES the signals name, not by the signal numbers — both versions number signals `2a`/`2b`, and they mean different things. The stale version probes `@ledgerhq/hw-app-eth` and `@trezor/utxo-lib`; the current one probes `@keystonehq/bc-ur-registry-eth`, `hdkey` and `secp256k1`.

- **Step 0 present** — follow the runbook as written. Step 0's lockfile read is expected; any other repo file access is not, and the lockfile must come from the ref (`MSYS_NO_PATHCONV=1 git show origin/main:package-lock.json`), never the working tree.
- **Step 0 absent, or a signal names `@ledgerhq/hw-app-eth` or `@trezor/utxo-lib`** — you have a pre-#2084 ref (the re-point landed in #2084, `b9d6abb8`). Do NOT run those probes: they name packages the tree no longer contains, so they cannot fire and a "no upstream movement" verdict from them is worthless. Report that the resolved runbook is the stale two-chain version, and give the one signal still meaningful at any ref: `npm view elliptic version` (a result `> 6.6.1` clears the residual entirely).

Verified 2026-08-25: the four documented edges reproduce exactly from the lockfile, and none of the signals fired (`elliptic` 6.6.1; `bc-ur-registry-eth` 0.22.1 still declares `hdkey`; `hdkey` 2.1.0 still declares `secp256k1`; `secp256k1` `latest` 5.0.2 still declares `elliptic ^6.5.7` — a major ahead of our resolved 4.0.5 and still carrying it).

Two corrections to how that verification was originally recorded here, kept rather than reworded because the shape of the error is the point:

- It said the re-pointed runbook was run "against `origin/main` `a9f86d94`". It cannot have been. `a9f86d94` is `Fix open issues #2076-#2080 (#2086)`, which predates the re-point — the re-pointed runbook reached `main` at `b9d6abb8` (#2084). Whatever was run at `a9f86d94` was a branch copy, not `main`'s.
- It credited the re-point to **#2083**. #2083 is a duplicate re-point written concurrently by another session, and although GitHub shows it MERGED, **its content never reached `main`**: it was stacked on `chore/elliptic-residual-keystone-only` and merged into that branch 13 seconds after that branch had already merged to `main`. `git branch -r --contains 94f501c9` returns only the dead branch. Nothing was lost — #2083 and #2084 reach identical conclusions on the same four edges — but the PR number to cite is #2084.

The registry findings themselves stand; they were re-derived independently against `origin/main`'s lockfile. Only the attribution was wrong.