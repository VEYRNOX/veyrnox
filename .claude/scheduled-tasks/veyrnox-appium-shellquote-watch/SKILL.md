---
name: veyrnox-appium-shellquote-watch
description: Weekly evidence-based watch for the Veyrnox appium/shell-quote residual — re-resolves the tree and checks whether the nested vulnerable copy is actually gone
---

Upstream watcher for the Veyrnox wallet's accepted `shell-quote` / `body-parser` security residual (advisories GHSA-395f-4hp3-45gv and GHSA-v422-hmwv-36x6).

Read-only **against the primary checkout**. Do NOT modify anything in the shared checkout — no `npm install` in the repo, no edits to `package.json`, `package-lock.json`, or any repo file there, no `npm audit fix`. All inspection happens in a scratch directory. Use the Bash tool for npm commands.

**One exception, added 2026-08-22 on owner instruction:** when the trigger fires, this watcher now OPENS A RETIREMENT PULL REQUEST rather than only printing remediation steps. It still never edits the shared checkout, never merges, and never enables auto-merge — the PR is cut from `origin/main` in its own worktree and left for the owner. See "If TRIGGER FIRED" below for the preconditions, all of which must hold or it falls back to reporting only. Everything else about this watcher stays read-only: a corrupt resolve, a severity re-rating, and NO CHANGE all report and stop.

## Why this watcher was rebuilt (read before changing the trigger)

An earlier version of this watcher triggered on VERSION NUMBERS — "has `@appium/support@latest` dropped its exact `shell-quote@1.8.4` pin?". On 2026-07-27 that fired: `@appium/support@7.2.6` shipped with the pin moved to a patched `1.10.0`, and `npm audit` began reporting `fixAvailable: true`. Both facts were real. **The finding was still completely unfixable**, the residual was wrongly retired, and it had to be reinstated the same day.

The reason: the patched copies were already hoisted at the tree root, while the flagged copies live in a ~258-package DUPLICATE subtree nested under `node_modules/appium-uiautomator2-driver/node_modules/` that keeps `@appium/support 7.2.5` -> `shell-quote 1.8.4` and `@appium/base-driver 10.7.1` -> `body-parser 2.2.2`. Four remediation routes were tested and all failed: a version bump (everything in the chain is already at latest), `npm update`, `overrides` of `^7.2.6`/`^10.7.2` (silently ignored), and deleting the 295 nested lockfile entries then re-resolving (npm re-derived them byte-identically). `npm audit fix --dry-run` is a no-op that prints "fix available" and changes nothing.

So: **a version number is not evidence. Only the resolved tree is evidence.** Never report a trigger because a new `@appium/*` or `appium-*` release exists.

## The check

1. Make a scratch dir (use the session scratchpad or `${TMPDIR:-/tmp}`). Get `package.json` and `package-lock.json` into it **from `origin/main`, not from the checkout's working tree**:

   ```bash
   cd "/Users/aljobson/Documents/GitHub/veyrnox" && git fetch origin main
   git show origin/main:package.json      > "$SCRATCH/package.json"
   git show origin/main:package-lock.json > "$SCRATCH/package-lock.json"
   ```

   **Why the ref and not the files.** The primary checkout is shared by ~10 worktrees and
   several other scheduled tasks, and is frequently on a detached HEAD or an unrelated
   feature branch. Copying its working tree means auditing whatever dependency state that
   branch happens to carry, then reporting it as `main` — the same class of error that had
   a previous tracker run analyse a detached HEAD and report it as `main`. It also picks up
   any uncommitted lockfile edit another session is mid-way through.

   Sanity-check both files are non-empty before trusting them (`git cat-file -s
   origin/main:package-lock.json`) — a silent failure of that read yields a zero-byte file,
   which resolves to an empty tree and looks like "the residual is gone". Never copy or
   create `node_modules` in the repo.
2. In the scratch dir run `npm install --package-lock-only`. Do NOT pass `--legacy-peer-deps` — PR #1372 fixed the peer conflict that used to require it, and that flag drops `appium` and ~30 packages, which would corrupt the result.
3. Sanity-check the resolve before trusting it: confirm `node_modules/appium` is still present in the resulting lockfile. If it is missing, the resolve is corrupt — report that and stop, do not draw conclusions from it.
4. Inspect the freshly resolved lockfile for these keys and their versions:
   - `node_modules/appium-uiautomator2-driver/node_modules/@appium/support`
   - `node_modules/appium-uiautomator2-driver/node_modules/shell-quote`
   - `node_modules/appium-uiautomator2-driver/node_modules/@appium/base-driver`
   - `node_modules/appium-uiautomator2-driver/node_modules/body-parser`
5. Run `npm audit --json` in the scratch dir and record the counts, plus which advisory roots remain.
6. Separately, check whether the COMMITTED lockfile on `origin/main` still contains the nested `@appium/support` key — someone may have fixed it directly. Use `git fetch origin main` then read the file from `origin/main` (read-only; do not check anything out).

## Decision — trigger ONLY on resolved-tree evidence

TRIGGER FIRED if ANY of these is true:
- the nested `node_modules/appium-uiautomator2-driver/node_modules/@appium/support` key is ABSENT from the fresh resolve; OR
- the nested `shell-quote` resolves to a version greater than `1.8.4`; OR
- the nested `body-parser` resolves to `2.3.0` or greater; OR
- `npm audit` on the fresh resolve no longer reports `shell-quote`, `@appium/support`, `@appium/base-driver`, or `body-parser` as advisory roots; OR
- the committed lockfile on `origin/main` no longer contains the nested `@appium/support` key.

NO CHANGE otherwise. Specifically, do NOT treat any of the following as a trigger on its own: a new `@appium/support`, `@appium/base-driver`, `appium-android-driver`, or `appium-uiautomator2-driver` release; `npm audit` reporting `fixAvailable: true`; or the advisory text changing. Those were all true on 2026-07-27 while the finding remained unfixable.

Also report (but do not treat as the trigger) if the advisory severity is re-rated ABOVE high — that is a separate escalation worth surfacing immediately.

## Output

- If NO CHANGE: one or two lines, low-noise. For example: "appium/shell-quote residual: unchanged. Fresh resolve still nests @appium/support 7.2.5 -> shell-quote 1.8.4 and @appium/base-driver 10.7.1 -> body-parser 2.2.2; npm audit still 3 high + 1 low from this chain. No action." Do not pad it.
- If the resolve looked corrupt (step 3 failed): say so plainly and report nothing else.
- If TRIGGER FIRED: state which specific condition fired and show the evidence (the key that disappeared, or the new resolved version), then open the retirement PR described below.

  **Expected state as of 2026-08-22 — read this before following any step that assumes a lockfile fix is still needed.** The nested subtree on `origin/main` is ALREADY patched: `@appium/support 7.2.6`, `@appium/base-driver 10.7.2`, `shell-quote 1.10.0`, `body-parser 2.3.0`, verified at `b8f01272`. `npm audit` there reports 22 low / 0 moderate / 0 high / 0 critical, all `elliptic`-rooted, with none of these four as an advisory root. So conditions 2, 3 and 4 are already true and this watcher is expected to fire on its next run. There is **nothing to fix in the dependency tree** — the retirement is a DOCS change. Do not refresh the lockfile, do not run `npm install` in the repo, and do not gate on the Android E2E job: no dependency is changing, so there is nothing for it to prove. (The old steps 1–3 here told the developer to refresh the lockfile so the nested subtree picks up the patched copies. That work is done; following it now would produce a no-op diff and imply a change that is not happening.)

  **Preconditions — ALL must hold, or fall back to reporting only and say which one failed:**
  - step 3's sanity check passed (`node_modules/appium` present in the fresh resolve). A corrupt resolve never opens a PR;
  - `npm audit` on the fresh resolve reports NONE of `shell-quote`, `@appium/support`, `@appium/base-driver`, `body-parser` as advisory roots — i.e. condition 4 specifically. A trigger from condition 1 or 5 alone (a key disappearing) is NOT sufficient to retire, because a key can move without the advisory clearing;
  - no OPEN pull request modifies `.claude/scheduled-tasks/veyrnox-daily-dep-audit/SKILL.md`. Check with `gh pr list --state open --json number,files`. If one exists, report its number and stop — two PRs editing the same residual entries is how the 2026-07-28 duplicate-finding collision happened;
  - the advisory has NOT been re-rated above high. A re-rating is an escalation, not a retirement.

  **The PR, if the preconditions hold:**
  1. Cut a branch from `origin/main` in its own worktree — never work in the shared checkout:
     `git fetch origin main && git branch --no-track chore/retire-appium-residuals origin/main && git worktree add <scratch> chore/retire-appium-residuals`
  2. In `.claude/scheduled-tasks/veyrnox-daily-dep-audit/SKILL.md`, move the `shell-quote` and `body-parser` entries out of `## Accepted residuals` and into `## Retired residuals`, following the shape the `extract-zip` entry set: advisory, how it cleared, retirement evidence, an "If it comes back" line, and what happened to the watcher. Record the evidence you actually measured this run — the fresh-resolve versions, the `npm audit` counts, and the `origin/main` SHA — not the numbers written above.
  3. Update the `appium-uiautomator2-driver chain` entry in `package.json` `//overrides-audit-notes` to record that the chain cleared.
  4. Note in the PR body that Dependabot alerts #12 and #14 should resolve, and that **this watcher is now redundant** — recommend deleting the scheduled task, but do NOT delete it yourself (this task may not delete scheduled tasks; the owner acts on the recommendation, exactly as the `extract-zip` retirement did).
  5. Open the PR with `gh pr create`. Do NOT merge it and do NOT enable auto-merge. State plainly in the body that the retirement is docs-only and that no dependency, lockfile, or CI-relevant file changed.
  6. Remove the worktree.

  If any step of the PR flow fails, say so and fall back to reporting the evidence — a failed PR attempt must never be reported as a completed retirement.

## Scope note

This watcher covers ONLY the appium/`shell-quote`/`body-parser` chain. The separate `elliptic` LOW residual is tracked by `veyrnox-elliptic-upstream-watch`, and the `brace-expansion` HIGH residual by `veyrnox-brace-expansion-watch` (added 2026-07-27; its override was tested and rejected the same day because `brace-expansion` 5.x changed its CommonJS export shape from a bare function to `{ expand }`, which breaks eslint — see the `brace-expansion` entry in `package.json` `//overrides-audit-notes`).