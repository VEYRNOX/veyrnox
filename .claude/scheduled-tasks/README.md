# Scheduled task definitions (mirror)

These are **mirrors**, kept here for version control and review. They are not
what runs.

## Which copy is live

The Claude Code harness reads scheduled tasks from the user's home directory:

```
~/.claude/scheduled-tasks/<task-name>/SKILL.md
```

That is the **live** copy. Editing a file in this repo changes nothing about
what the scheduled task does until it is copied back:

```powershell
# repo -> live
Copy-Item ".claude/scheduled-tasks/<task>/SKILL.md" `
          "$env:USERPROFILE/.claude/scheduled-tasks/<task>/SKILL.md"

# live -> repo (what to run after editing the task)
Copy-Item "$env:USERPROFILE/.claude/scheduled-tasks/<task>/SKILL.md" `
          ".claude/scheduled-tasks/<task>/SKILL.md"
```

Check for drift before trusting the mirror:

```powershell
Get-FileHash ".claude/scheduled-tasks/<task>/SKILL.md",
             "$env:USERPROFILE/.claude/scheduled-tasks/<task>/SKILL.md"
```

## Why mirror instead of symlink

A directory junction from `~/.claude/scheduled-tasks/<task>` into a repo
worktree would remove the drift risk, but it couples a daily automation to a
working tree that gets branched, cleaned and re-cloned. A stale or missing
worktree would silently break the task. The mirror is manual but cannot fail
closed on someone else's `git clean`.

## Why version control these at all

`~/.claude` is not a git repository and cannot easily become one — it holds
credentials, session transcripts and machine-local state. Committing task
definitions here gives them history, review and recovery without exposing any
of that.

## What is mirrored

All ten Veyrnox scheduled tasks.

| Task | Cadence | Purpose | Writes |
|---|---|---|---|
| `veyrnox-daily-security-diff` | daily | Security scan of the last 24h of `main` | `docs/security-diffs/diff-<DATE>.md` via PR |
| `daily-veyrnox-branch-review` | daily | Branch-vs-main review: correctness, security/honesty, design system, a11y | report only |
| `veyrnox-daily-dep-audit` | daily | `npm audit` summary as a widget, with an accepted-residuals suppression list | nothing (widget only) |
| `veyrnox-dependency-audit` | weekly | Deeper `npm audit` focused on crypto/wallet packages | `docs/dependency-audits/dep-audit-<DATE>.md` |
| `veyrnox-weekly-security-audit` | weekly | Four parallel specialist agents over RASP / WalletConnect / KEK / Auth | `docs/audit-<DATE>-weekly.md` |
| `veyrnox-audit-finding-tracker` | weekly | Re-checks every historical finding against `main` | `docs/audit-findings-tracker.md` |
| `veyrnox-appium-shellquote-watch` | weekly | Upstream watch: `shell-quote` / `body-parser` nested-duplicate residual | report only |
| `veyrnox-brace-expansion-watch` | weekly | Upstream watch: `brace-expansion` HIGH residual | report only |
| `veyrnox-elliptic-upstream-watch` | weekly | Upstream watch: `elliptic` LOW residual | report only |
| `watch-risk-wire-merge` | — | One-shot notify when a branch merges; self-disabling | nothing |

### Known staleness in the mirrored copies

Mirrored **verbatim**, including these. Fix them in `~/.claude` first, then
re-mirror — editing only the copy here would create drift without changing
anything that runs.

- **`watch-risk-wire-merge`** targets `--repo aljobson/veyrnox-secure`. The repo
  is now **`VEYRNOX/veyrnox`**; the old path still resolves by GitHub redirect,
  so the task works, but the reference is stale. It also watches
  `feat/wire-risk-score-send-flow` and references PRs #166/#167 — long since
  overtaken. This task is probably retirable.
- ~~**Three tasks commit locally and never push.**~~ **FIXED 2026-07-27.**
  `veyrnox-dependency-audit`, `veyrnox-weekly-security-audit` and
  `veyrnox-audit-finding-tracker` each ran `git add` + `git commit` and then
  forbade both `git push` and opening a PR. The commit was never blocked — a
  ruleset gates the push, not the commit — but the result never reached
  `origin/main`, so each report existed only in whatever local checkout the task
  happened to run in. `veyrnox-audit-finding-tracker` documents a run whose
  commit was left dangling after a branch pointer was clobbered.

  All three now follow the `veyrnox-daily-security-diff` pattern: isolated
  worktree on a per-run branch cut from `origin/main` with `--no-track`, `git
  add` + `git commit -o`, push, `gh pr create`, `--auto` merge, worktree removed.
  None of them may push to `main` or bypass a required check.

  Two deliberate departures from a straight copy:
  - `veyrnox-dependency-audit`'s `npm audit fix` path gets its **own branch and
    PR**, and is **not** auto-merged. A lockfile change and a docs report have
    different review needs and must not share a merge decision.
  - `veyrnox-audit-finding-tracker` keeps its blob-hash check and now skips the
    commit *and* the PR when content is already identical on `main`, rather than
    opening a no-op PR every week. Its durability reporting is retained, since a
    pushed branch is still not `main`.

## Note on contents

These files describe process, not secrets. They do contain the author's local
working path (`C:\Users\aljob\Downloads\Veyrnox`), which already appears in
`.claude/launch.json`. Do not add credentials, keys, or tokens to a task
definition — this repository is public.
