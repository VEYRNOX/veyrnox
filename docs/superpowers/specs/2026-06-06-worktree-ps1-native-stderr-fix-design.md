# Fix `worktree.ps1` native-stderr crash

**Date:** 2026-06-06
**Branch:** `fix/worktree-native-stderr` (off `main`)
**Status:** Approved design — ready for implementation plan

## Problem

`scripts/worktree.ps1 new <branch>` aborts before creating any worktree when run
in **non-interactive** PowerShell (how agents / CI invoke it). Line 79:

```powershell
& git fetch origin --prune | Out-Null
```

`git fetch` writes informational progress (`From https://github.com/...`) to
**stderr**. Piping a native command's output to `Out-Null` while
`$ErrorActionPreference = 'Stop'` (set at line 56) causes PowerShell to wrap each
stderr line as a terminating `NativeCommandError`, so the script throws at the
fetch and never reaches `git worktree add`.

Observed failure:

```
git.exe : From https://github.com/aljobson/veyrnox-secure
At scripts/worktree.ps1:79 char:3
+   & git fetch origin --prune | Out-Null
    + FullyQualifiedErrorId : NativeCommandError
```

This bites non-interactive callers only; interactive runs typically do not hit
it (PowerShell handles native stderr differently when attached to a console).
The fix makes the documented helper robust for agent/CI/non-interactive use with
no change to interactive behavior.

## Root cause (empirically verified)

Tested under `$ErrorActionPreference = 'Stop'` in this environment:

| Pattern | Result |
|---|---|
| `$out = & git …` (assignment; the `Invoke-Git` form) | no throw |
| `$null = & git …` (assignment, stdout discarded) | no throw |
| `& git … \| Out-Null` (pipe native output) | **throws** `NativeCommandError` |
| `& git … 2>$null` (redirect native stderr) | **throws** `RemoteException` |

So the trigger is *piping/redirecting native output* under `Stop`; **assignment
lets stderr flow harmlessly to the host without throwing.** The fix must use
assignment and must **not** add a `2>$null` / `2>&1` redirect (those also throw).

## Scope

**Only line 79 is affected.** Every other native git call in the script already
uses the safe form:
- `Invoke-Git` (`$out = & git @args`) — assignment.
- `[bool](& git -C $RepoRoot branch --list …)` / `… ls-remote …` — subexpression
  capture (assignment-like).
- `Invoke-Git … | Out-Null` (lines 86/90/94) — pipes `Invoke-Git`'s **PowerShell**
  return value, not native output → safe.
- `rm`/`list` paths use `& git …` to host or subexpression capture → safe.

No other line needs changing.

## Fix

Replace line 79:

```powershell
# before
  & git fetch origin --prune | Out-Null

# after
  $null = & git fetch origin --prune
```

- Discards stdout (`$null = …`).
- Lets the harmless `From …` progress print to the host (informative; no throw).
- Ignores the exit code — fetch stays **best-effort**, exactly as before, so an
  offline `new` still falls through to the local/remote branch checks. (Do NOT
  route this through `Invoke-Git`, which would `throw` on a non-zero fetch and
  break offline use.)

Add a short inline comment explaining why it is `$null = & git …` and not
`| Out-Null`, so the pattern is not "tidied" back into the bug later.

## Error handling / edge cases

- Offline / fetch failure: stderr prints, exit code ignored, script continues to
  `branch --list` / `ls-remote` — unchanged from current behavior.
- Real errors that matter (e.g. `worktree add` failure) are still caught by
  `Invoke-Git`'s `$LASTEXITCODE` check — untouched.

## Affected files

- `scripts/worktree.ps1` — line 79 only (plus an explanatory comment). No other
  files.

## Testing / verification

No PowerShell test harness exists in the repo. Verify by running the helper in a
non-interactive shell (the failing context):

1. `.\scripts\worktree.ps1 new tmp/eol-fix-smoketest -NoInstall` → completes,
   prints "Ready", and creates `.worktrees/tmp+eol-fix-smoketest` with **no**
   `NativeCommandError`.
2. `git worktree list` shows the new worktree.
3. `.\scripts\worktree.ps1 rm tmp/eol-fix-smoketest` → removes it cleanly.
4. (Sanity) the `new` run's output still shows the `From …` fetch line — proving
   stderr now flows instead of aborting.
