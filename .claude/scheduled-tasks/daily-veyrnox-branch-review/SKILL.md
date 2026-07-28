---
name: daily-veyrnox-branch-review
description: Daily branch-review workflow on the Veyrnox repo
---

Run the branch-review workflow on the Veyrnox repository located at C:\Users\aljob\Downloads\Veyrnox.

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
   git worktree add "$TEMP/veyrnox-branch-review" <target-branch>
   ```
   Everything the workflow reads must come from that path. If it cannot be created, fall
   back to `git show origin/main:<path>` / `git diff origin/main...<target>` and **say in
   the report that the fallback was used**.
4. Remove it when the report is written:
   `git worktree remove "$TEMP/veyrnox-branch-review" --force`

**Never** `git checkout` / `git switch` / `git stash` in `C:\Users\aljob\Downloads\Veyrnox`
— that reaches into every other running session at once. Never edit a file there; an
uncommitted change in the shared tree can be swept into an unrelated PR.

**Windows/Git-Bash trap:** MSYS rewrites the `:` in `git show origin/main:path`, so the
command fails silently and prints nothing — indistinguishable from "no matches". Export
`MSYS_NO_PATHCONV=1` before any `git show <ref>:<path>`.

Steps:
1. Work inside the Step 0 snapshot worktree, NOT C:\Users\aljob\Downloads\Veyrnox
2. Run the `branch-review` workflow (via the Workflow tool with name "branch-review") against the target branch identified in Step 0
3. Each finding should be adversarially verified before being reported
4. Output a structured report with sections: Correctness, Security/Honesty, Design System, Accessibility
5. For each finding include: file path + line number, severity (critical/major/minor), description, and recommended fix

Constraints:
- Never flip an asset status to "live" or write "verified" without a real explorer-confirmed txid supplied by the user
- Never mock a security control — if something can't be delivered honestly, flag it as HONEST-DISABLED
- Status tags: BUILT (code complete), TARGET (audit-gated), PLANNED (roadmap), HONEST-DISABLED
- The Veyrnox design system uses: near-black surfaces (#050608 → #1D222B), teal accent (#4ADAC2), Schibsted Grotesk for prose, IBM Plex Mono for addresses/amounts/fees

Success criteria: A clear, actionable findings report the developer can act on immediately.