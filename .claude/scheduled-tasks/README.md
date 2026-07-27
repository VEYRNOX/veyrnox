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

| Task | Purpose |
|---|---|
| `veyrnox-daily-security-diff` | Daily security scan of the last 24h of `main`; writes `docs/security-diffs/diff-<DATE>.md` via a PR |

Nine other Veyrnox scheduled tasks exist in `~/.claude/scheduled-tasks/` and are
**not** mirrored yet: `daily-veyrnox-branch-review`,
`veyrnox-appium-shellquote-watch`, `veyrnox-audit-finding-tracker`,
`veyrnox-brace-expansion-watch`, `veyrnox-daily-dep-audit`,
`veyrnox-dependency-audit`, `veyrnox-elliptic-upstream-watch`,
`veyrnox-weekly-security-audit`, `watch-risk-wire-merge`. Add them the same way
if they are worth keeping.

## Note on contents

These files describe process, not secrets. They do contain the author's local
working path (`C:\Users\aljob\Downloads\Veyrnox`), which already appears in
`.claude/launch.json`. Do not add credentials, keys, or tokens to a task
definition — this repository is public.
