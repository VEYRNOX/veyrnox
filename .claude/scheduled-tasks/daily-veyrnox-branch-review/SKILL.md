---
name: daily-veyrnox-branch-review
description: Daily branch-review workflow on the Veyrnox repo
---

Run the branch-review workflow on the Veyrnox repository located at /Users/aljobson/Documents/GitHub/veyrnox.

Objective: Review the current branch vs main across four dimensions — correctness, security/honesty, design-system compliance, and accessibility — then report findings.

## Step 0 — decide WHAT you are reviewing, and do it off the shared checkout

**The primary checkout is shared.** ~10 worktrees are typically live, several other
scheduled tasks touch it, and it is frequently sitting on a detached HEAD or somebody
else's feature branch. "The current branch" of that checkout is therefore **not a
meaningful target** — it is whatever the last session happened to leave there.

Two real failures on 2026-07-28 came from this: PRs #1414/#1415 duplicated the same
finding 92 seconds apart, and PR #1423 picked up an unrelated commit from a concurrent
session and had to be abandoned (force-pushing would have destroyed work seconds old).

1. Fetch, never push to main:
   ```
   git fetch origin main
   ```
2. **Identify the review target explicitly.** Do not infer it from the checkout's HEAD.
   Prefer, in order: (a) a branch named in the run's prompt; (b) the most recent open PR
   (`gh pr list --state open --json number,headRefName,updatedAt`); (c) if neither yields a
   target, **report "no branch to review" and stop** — do not review whatever HEAD happens
   to be, and do not review `main` against itself.
3. Cut a **read-only snapshot worktree** of the target and run the review inside it:
   ```
   git worktree prune
   git worktree add "${TMPDIR:-/tmp}/veyrnox-branch-review" <target-branch>
   ```
   Everything the workflow reads must come from that path. If it cannot be created, fall
   back to `git show origin/main:<path>` / `git diff origin/main...<target>` and **say in
   the report that the fallback was used**.
4. Remove it when the report is written:
   `git worktree remove "${TMPDIR:-/tmp}/veyrnox-branch-review" --force`

**Never** `git checkout` / `git switch` / `git stash` in `/Users/aljobson/Documents/GitHub/veyrnox`
— that reaches into every other running session at once. Never edit a file there; an
uncommitted change in the shared tree can be swept into an unrelated PR.

**Sanity-check every `git show <ref>:<path>`** with `git cat-file -s <ref>:<path>` before
trusting the output. A read that returns nothing is indistinguishable from "the file is
empty" or "no matches", and every failure mode of this command is silent.
(This replaced a Windows/Git-Bash `MSYS_NO_PATHCONV=1` note on 2026-09-03 — MSYS used to
rewrite the `:` and swallow the command. That guard is a no-op on macOS; the byte check
is not, and catches the same class of silent-empty read on any platform.)

Steps:
1. Work inside the Step 0 snapshot worktree, NOT /Users/aljobson/Documents/GitHub/veyrnox
2. Run the `branch-review` workflow (via the Workflow tool with name "branch-review") against the target branch identified in Step 0
3. Each finding should be adversarially verified before being reported
4. Output a structured report with sections: Correctness, Security/Honesty, Design System, Accessibility
5. For each finding include: file path + line number, severity (critical/major/minor), description, and recommended fix

## Fixing findings (NOT part of a scheduled run) — always a NEW PR cut from main

A scheduled run only reports. But when a session is asked to fix what the review found,
the fixes go in a **new PR cut from `origin/main`** — **never** as extra commits pushed
onto the branch of the PR that was reviewed.

```bash
git fetch origin main
git branch --no-track fix/<slug> origin/main   # --no-track: a bare push must not target main
git worktree add "${TMPDIR:-/tmp}/<slug>" fix/<slug>
# fix + test there, then open a PR referencing the reviewed PR and its finding IDs
```

**Why (two failures on 2026-08-15, in one session).** Reviewed PRs routinely carry
auto-merge armed, and `main` moves 10+ times a day across many concurrent sessions:

- PR #1774 auto-merged *before* the follow-up commits were pushed. The pushes succeeded —
  pushing to the branch of an already-merged PR is not an error — so nothing looked wrong
  until `main` was checked and contained none of the fixes.
- PR #1789 was merged by another actor *after* its auto-merge had been explicitly disabled
  and confirmed `DISABLED`. So disabling auto-merge is **not** sufficient protection, and
  holding someone else's PR open to buy time interferes with their work.

Recovery in both cases was identical — branch from `main`, cherry-pick, open a new PR — so
going there first skips the detour entirely. Do NOT arm auto-merge on the follow-up PR
unless the user explicitly asks for the merge.

### Verification habits these failures produced (apply regardless of branch strategy)

- **A PR's `headRefOid` FREEZES at merge time.** A head SHA that does not match the branch
  ref is therefore *not* proof of API lag — it is equally the signature of a merged PR.
  Read `state` and `mergedAt`; only those disambiguate:
  `gh pr view <n> --json state,mergedAt,headRefOid`.
- **A successful `git push` is not proof the change shipped.** Confirm by reading the
  content back out of the ref — `git show origin/main:<path> | grep -qF '<marker>'` — not
  from the push output, a green check, or a merge notification. Same rule for a background
  watcher: if it announces a merge, it must verify content before calling it done.
- If you write a pre-push state check, **gate on it** (`||` / early exit). An informational
  `echo` chained with `&&` buys early detection, not prevention.

Constraints:
- Never flip an asset status to "live" or write "verified" without a real explorer-confirmed txid supplied by the user
- Never mock a security control — if something can't be delivered honestly, flag it as HONEST-DISABLED
- Status tags: BUILT (code complete), TARGET (audit-gated), PLANNED (roadmap), HONEST-DISABLED
- The Veyrnox design system uses: near-black surfaces (#050608 → #1D222B), teal accent (#4ADAC2), Schibsted Grotesk for prose, IBM Plex Mono for addresses/amounts/fees

Success criteria: A clear, actionable findings report the developer can act on immediately.