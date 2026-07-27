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
3. **Analyse a clean snapshot of `main`, not the live checkout.** Create a throwaway worktree:
   ```
   git worktree add --detach C:\Users\aljob\AppData\Local\Temp\veyrnox-audit-snapshot origin/main
   ```
   Run **all** Step 1 doc reads and Step 2 code greps inside that snapshot directory.
4. When finished, remove it:
   ```
   git worktree remove C:\Users\aljob\AppData\Local\Temp\veyrnox-audit-snapshot --force
   ```
5. If the worktree cannot be created (e.g. path already exists from a crashed run — try `git worktree prune` first), fall back to reading individual files with `git show origin/main:<path>` and **state in the report that the fallback was used**.

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

Write `docs/audit-findings-tracker.md` **into the primary working directory** (C:\Users\aljob\Downloads\Veyrnox), overwriting each week:

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

## Step 4 — Commit, then VERIFY the result actually landed

**Do not trust a local commit or branch to survive in this repo.** On a previous run, a commit was made and a branch created; concurrent activity clobbered the branch pointer within minutes and the commit was left dangling. The work only survived because another process happened to sweep the file into an unrelated PR. Verify, don't assume.

1. Record the content hash of what you wrote:
   ```
   git hash-object docs/audit-findings-tracker.md
   ```
2. **Check whether identical content is already on `main`:**
   ```
   git rev-parse origin/main:docs/audit-findings-tracker.md
   ```
   If that blob hash matches step 1, the tracker is already current on `main` — **report that and skip the commit entirely.** Do not create a redundant commit.
3. Otherwise commit:
   ```
   git add docs/audit-findings-tracker.md
   git commit -m "docs(audit): update findings tracker <DATE>"
   ```
4. **Verify durability and report it honestly.** Determine which of these is true and say so explicitly in your output:
   - `git symbolic-ref -q HEAD` — is HEAD on a branch, or detached?
   - `git merge-base --is-ancestor <commit> origin/main` — is the commit reachable from main?

   Report exactly one of:
   - ✅ "Content is on origin/main" (blob verified identical)
   - ⚠️ "Committed on branch `<name>` — NOT on main; needs merging to land"
   - 🔴 "Committed on a DETACHED HEAD — not durable, may be garbage-collected"

   If the state is ⚠️ or 🔴, say so plainly in the summary. **Never describe a local commit or a newly created branch as 'safe', 'anchored', or 'durable'** — branch pointers here have been clobbered by concurrent activity.

## Hard constraints
- Do NOT push to remote (`git fetch` is allowed; `git push` is not)
- Do NOT open a PR
- Do NOT modify any source files — read-only analysis + docs only
- Do NOT `git checkout` / `git switch` in the primary working directory (breaks concurrent worktrees)
- Do NOT run `git gc --prune` or `git prune` — this repo carries 7,000+ unreachable commits belonging to other concurrent agents; pruning would destroy their recoverable work
- Do NOT mark anything verified without real on-chain txid or on-device evidence
- FIXED means the code change is present; it does NOT mean the control is verified working