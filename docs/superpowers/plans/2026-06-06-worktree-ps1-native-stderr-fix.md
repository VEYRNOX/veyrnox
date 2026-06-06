# Fix `worktree.ps1` Native-Stderr Crash — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `scripts/worktree.ps1 new` work in non-interactive PowerShell by stopping the `git fetch` line from turning native stderr into a terminating `NativeCommandError`.

**Architecture:** One-line change to `scripts/worktree.ps1` line 79 — replace the `| Out-Null` pipe (which makes native stderr fatal under `$ErrorActionPreference='Stop'`) with `$null = & git …` assignment (stderr flows harmlessly, stdout discarded, fetch stays best-effort). Plus an explanatory comment.

**Tech Stack:** PowerShell 5.1. No app code; no test harness for PS in this repo — verified by running the helper.

**Note on shape:** not testable code (a shell script). Verification = (a) the script still parses, and (b) running `worktree.ps1 new` non-interactively now succeeds where it used to throw.

Spec: `docs/superpowers/specs/2026-06-06-worktree-ps1-native-stderr-fix-design.md`

---

### Task 1: Fix line 79 and validate the script parses

**Files:**
- Modify: `scripts/worktree.ps1` (line 79)

- [ ] **Step 1: Replace the fetch line**

In `scripts/worktree.ps1`, find this exact line (line 79, two-space indent, inside `Invoke-New`):

```powershell
  & git fetch origin --prune | Out-Null
```

Replace it with (comment + assignment):

```powershell
  # `$null = & git ...` (NOT `| Out-Null` or `2>$null`): piping/redirecting a
  # native command's stderr while $ErrorActionPreference='Stop' turns git's
  # progress output (e.g. "From <url>") into a terminating NativeCommandError in
  # non-interactive PowerShell, aborting `new` before any worktree is created.
  # Assignment discards stdout and lets stderr flow harmlessly. Fetch is
  # best-effort (exit code ignored) so an offline `new` still works.
  $null = & git fetch origin --prune
```

Change nothing else in the file.

- [ ] **Step 2: Verify the script still parses (no syntax errors)**

Run (PowerShell):

```powershell
$errs = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path scripts/worktree.ps1), [ref]$null, [ref]$errs) > $null
"parse errors: $($errs.Count)"
```

Expected: `parse errors: 0`.

- [ ] **Step 3: Confirm the diff is exactly the one line (+ comment)**

Run: `git diff --stat scripts/worktree.ps1`
Expected: `scripts/worktree.ps1` changed; ~7 insertions, 1 deletion (the comment
block + new line replacing the old line). No other file changed.

- [ ] **Step 4: Commit**

```bash
git add scripts/worktree.ps1
git commit -m "fix(worktree): keep git fetch stderr from aborting 'new' in non-interactive PowerShell"
```

---

### Task 2: Verify the helper now runs non-interactively

Prove the real bug is gone: run the MODIFIED script in a non-interactive shell
(the failing context). It resolves the main repo root and creates the test
worktree under the main repo's `.worktrees/`; the `rm` cleans it up.

**Files:** none (verification only; the temp worktree/branch is created then removed).

- [ ] **Step 1: Run `new` with the fixed script (non-interactive)**

Run (PowerShell), using the FULL path to the fixed copy so it is the one tested:

```powershell
& "C:\Users\aljob\Downloads\Veyrnox\.worktrees\fix+worktree-stderr\scripts\worktree.ps1" new tmp/wt-smoketest -NoInstall
```

Expected: it prints the `From …` fetch line (stderr now flows, not fatal), then
`Creating new branch 'tmp/wt-smoketest' off origin/main -> …`, then `Ready.` —
and **no** `NativeCommandError`. Exit code 0.

- [ ] **Step 2: Confirm the worktree was created**

Run: `git worktree list`
Expected: a line for `.worktrees/tmp+wt-smoketest [tmp/wt-smoketest]`.

- [ ] **Step 3: Remove the test worktree with the helper**

Run (PowerShell):

```powershell
& "C:\Users\aljob\Downloads\Veyrnox\.worktrees\fix+worktree-stderr\scripts\worktree.ps1" rm tmp/wt-smoketest
```

Expected: prints `Removed: …tmp+wt-smoketest`. (`rm` also deletes the worktree
dir; the branch `tmp/wt-smoketest` remains — delete it next.)

- [ ] **Step 4: Delete the temp branch and confirm clean state**

Run:
```bash
git branch -D tmp/wt-smoketest
git worktree list
```
Expected: `tmp/wt-smoketest` deleted; `git worktree list` no longer shows the
smoketest worktree. The only worktrees left are the main checkout and
`.worktrees/fix+worktree-stderr` (this branch's own worktree).

---

## Notes for the implementer

- Only `scripts/worktree.ps1` changes (one line + comment). If you touch anything
  else, stop.
- Do NOT "simplify" the fix to `| Out-Null` or add `2>$null` — both reintroduce
  the crash (verified). The assignment form is deliberate; the comment says so.
- The smoketest creates a real (temp) worktree under the MAIN repo root, not
  under this branch's worktree, because the script resolves the main repo root.
  Steps 3–4 clean it up fully.
