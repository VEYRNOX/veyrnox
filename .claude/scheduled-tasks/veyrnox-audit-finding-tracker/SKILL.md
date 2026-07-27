---
name: veyrnox-audit-finding-tracker
description: Weekly tracker that reads all Veyrnox audit docs and updates a findings closure report
---

You are running the weekly audit findings tracker for the Veyrnox wallet. Veyrnox is a self-custody crypto wallet (Vite + React + Capacitor). Mainnet is live.

Working directory: C:\Users\aljob\Downloads\Veyrnox

## Your job

Synthesise all audit findings across every audit document in `docs/`, compare them against the current codebase **as it exists on `main`**, and produce an updated closure report at `docs/audit-findings-tracker.md`.

---

## Step 0 — Pin the analysis to `main` (DO THIS FIRST)

**This repo is racy.** ~13 branches are checked out across separate git worktrees, several other scheduled tasks (daily security-diff, daily branch-review, weekly security audit) touch it, and the primary checkout is frequently on a **detached HEAD or an unrelated feature branch**. A previous run of this task analysed a detached HEAD off the `security-diffs` line and reported results as if they were `main`. Never assume the working tree is `main`.

1. Fetch (fetch only — never push):
   ```
   git fetch origin main
   ```
2. Record the exact commit under analysis and put it in the report header:
   ```
   git rev-parse origin/main
   ```
3. **Analyse a clean snapshot of `main`, not the live checkout** — and make that
   snapshot the write target too, so the report never touches the shared tree.
   Use a **branch** worktree, not `--detach`: the same checkout then serves as
   both the analysis snapshot and the branch the PR is opened from.

   ```powershell
   $branch = "audit-tracker/<DATE>"
   $wt     = "$env:TEMP\veyrnox-audit-snapshot"

   git worktree prune
   if (Test-Path $wt) { git worktree remove --force $wt }

   # --no-track is REQUIRED. Without it git sets upstream to origin/main and a
   # later `git push` from this branch would target MAIN.
   if (-not (git show-ref --verify --quiet "refs/heads/$branch"; $?)) {
     git branch --no-track $branch origin/main
   }
   if (git config --get "branch.$branch.merge") { git branch --unset-upstream $branch }

   git worktree add $wt $branch
   ```

   Run **all** Step 1 doc reads and Step 2 code greps inside `$wt`. Because the
   branch is cut from `origin/main`, its contents ARE the pinned snapshot.
4. Remove it at the end of Step 4 — after the PR is open, not before.
5. If the worktree cannot be created (e.g. path already exists from a crashed run — try `git worktree prune` first), fall back to reading individual files with `git show origin/main:<path>` and **state in the report that the fallback was used**. Do NOT fall back to `git checkout`.

Never `git checkout main` in the primary working directory — that would disrupt concurrent worktrees and other running sessions.

---

### Step 1 — Read all audit docs
List all files matching `docs/audit-*.md` and `docs/audit-*-weekly.md` (inside the pinned snapshot). Read each one in full. Also check `docs/audit-triage/` and `docs/security-audits/` for additional finding sources.

Extract every finding with:
- ID (e.g. C3, H7, H-NEW-3, M-NEW-4)
- Severity (CRITICAL/HIGH/MEDIUM/LOW)
- Area
- File:line
- Description (one sentence)
- Audit date first reported

### Step 2 — Check current fix status
For each finding, do a targeted check against the pinned `main` snapshot:

**Quick structural checks (grep/read):**
- C3: does `WalletConnectProvider.jsx` import `presignGate`? Does each handler call it?
- C4: does `RequestApprovalModal.jsx` read from active session peer metadata (not `proposer`)?
- C6: does `CryptoSigning.jsx` use `useRef` for key material (not `useState`)?
- H7: does `handleSignTypedData` validate `domain.chainId`?
- H6: are `eth_signTypedData` and `eth_signTypedData_v3` in `BLOCKED_METHODS`?
- H13: does `CryptoSigning.jsx` call `copySecret()` for key material?
- H-NEW-3: does `copySecret.js` use a non-empty wipe sentinel and `visibilitychange`?
- H-NEW-4: does `web.js` call `.fill(0)` on H/C/dek after `combineKek`?
- H3: is `PRIMARY_UNLOCK_EQUALIZER_MS` ≥ 1500?
- H4: does `twoFactorGate.js` return an opaque error (not per-factor codes)?
- H11: does `ColdSign.jsx` hardcode `TIER.ALLOW`? (if yes → still open)
- H15: does `HardwareKekPlugin.kt` call `setIsStrongBoxBacked(true)`?
- H16: does `HardwareKekPlugin.kt` include `AUTH_DEVICE_CREDENTIAL`? (if yes → still open)
- H-NEW-1: is `EXPECTED_CERT_SHA256` still a placeholder string?
- M20/H-NEW-4: does `kek.js combineKek` zero `ikm`?
- H10: are the SPKI pins in `rpc/pinning.js` still `PLACEHOLDER_*_REPLACE_ON_DEVICE`? (if yes → still open)
- RASP-A2: does `SendCrypto.jsx` fall back to `TIER.BLOCK` (not `TIER.ALLOW`)?

For each check: FIXED / STILL OPEN / REGRESSED (was fixed, now broken) / UNVERIFIABLE (needs on-device).

**Label every row with its evidence method:** `(grep)` for findings you re-verified against source this run, `(doc)` for findings whose status you took from an audit doc or PR history without re-checking. Do not blur the two.

### Step 3 — Write the tracker
Get today's date (PowerShell: `Get-Date -Format "yyyy-MM-dd"`).

Write `docs/audit-findings-tracker.md` **into the worktree** (`$wt` from Step 0),
overwriting each week. Not into the primary working directory — that is the
shared checkout other agents are using, and a stray uncommitted file there is
exactly what this task must not create:

```markdown
# Audit Findings Tracker
Last updated: <DATE>
Analysed against: origin/main @ <SHA>

## Summary
- Total findings: <N>
- Fixed (code-confirmed): <N>
- Still open: <N>
- Regressed: <N>
- Needs on-device verification: <N>

## Fixed ✅
| ID | Severity | Finding | Fixed in | Confirmed by |
|---|---|---|---|---|
| H4 | HIGH | twoFactorGate factor leak | <branch/PR> | grep: opaque WRONG code |
...

## Still Open ⚠️
| ID | Severity | Finding | File:Line | First reported |
|---|---|---|---|---|
...

## Needs On-Device Verification 📱
| ID | Finding | Why on-device needed |
|---|---|---|
...

## Regressed 🔴
| ID | Finding | What broke |
|---|---|---|
...

---
*Automated weekly tracker. Static analysis only — does not substitute for on-device or on-chain verification.*
```

---

## Step 4 — Commit, push, open a PR, then VERIFY it actually landed

**Changed 2026-07-27** (was: commit locally, "do NOT push", "do NOT open a PR").
That is the root cause of the dangling-commit incident this section was written
around: the commit was never blocked — a ruleset gates the push, not the commit —
so the tracker only ever existed in a local checkout, where a clobbered branch
pointer could and did strand it. A PR makes the work durable on the remote the
moment it is pushed, which is the actual fix. The verification below is kept
because a pushed branch is still not `main`.

1. Record the content hash of what you wrote (inside `$wt`):
   ```
   git hash-object docs/audit-findings-tracker.md
   ```
2. **Check whether identical content is already on `main`:**
   ```
   git rev-parse origin/main:docs/audit-findings-tracker.md
   ```
   If that blob hash matches step 1, the tracker is already current on `main` — **report that, skip the commit and the PR entirely, and remove the worktree.** Do not open a no-op PR.
3. Otherwise commit and push:
   ```powershell
   cd $wt
   git add docs/audit-findings-tracker.md
   git commit -o docs/audit-findings-tracker.md `
     -m "docs(audit): update findings tracker <DATE>"
   git push -u origin $branch

   gh pr create --base main --head $branch `
     --title "docs(audit): update findings tracker <DATE>" `
     --body "Automated weekly findings tracker, re-checked against origin/main @ <SHA>. Static analysis only — FIXED means the code change is present, NOT that the control is verified working. INTERNAL."

   gh pr merge --squash --auto
   ```
   `git add` must come first (`git commit -o` errors on an untracked path). Keep
   the `-o` pathspec — stray-artifact guard, `scripts/check-stray-files.mjs`.
   Never `git add -A`, `git add .`, or `commit -a`.

   **Use `--auto`, never `--admin`.** If `main` is red the PR waits — correct.
4. **Verify where it actually is, and report it honestly.** Pushing makes the
   work durable; it does not make it `main`.
   ```powershell
   git ls-remote --heads origin $branch          # pushed?
   gh pr view <PR#> --json state,mergeCommit     # merged?
   ```
   Report exactly one of:
   - ✅ "Merged to `main` as `<sha>`" — only after `state` is `MERGED`
   - ⚠️ "PR #<n> open, auto-merge armed — pushed and durable, NOT yet on `main`"
   - 🔴 "PR #<n> blocked by a failing check: `<check>`"
   - ⏭️ "Skipped — blob already identical on `main`"

   **Never describe an open PR as landed**, and never call a local-only commit
   'safe', 'anchored', or 'durable'. Branch pointers in the local repo have been
   clobbered by concurrent activity; a pushed remote branch has not.
5. Remove the worktree — after the PR is open, and including when the run aborts:
   ```powershell
   cd "C:\Users\aljob\Downloads\Veyrnox"
   git worktree remove "$env:TEMP\veyrnox-audit-snapshot" --force
   ```

## Hard constraints
- Push ONLY the per-run `audit-tracker/<DATE>` branch. NEVER push to `main`.
- NEVER merge with `--admin` or bypass a required check
- Do NOT delete a branch whose PR has not merged — it is the only copy
- Do NOT modify any source files — read-only analysis + docs only
- Do NOT `git checkout` / `git switch` in the primary working directory (breaks concurrent worktrees)
- Do NOT run `git gc --prune` or `git prune` — this repo carries 7,000+ unreachable commits belonging to other concurrent agents; pruning would destroy their recoverable work
- Do NOT mark anything verified without real on-chain txid or on-device evidence
- FIXED means the code change is present; it does NOT mean the control is verified working