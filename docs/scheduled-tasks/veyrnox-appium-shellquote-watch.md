---
name: veyrnox-appium-shellquote-watch
description: Weekly evidence-based watch for the Veyrnox appium/shell-quote residual — re-resolves the tree and checks whether the nested vulnerable copy is actually gone
---

Upstream watcher for the Veyrnox wallet's accepted `shell-quote` / `body-parser` security residual (advisories GHSA-395f-4hp3-45gv and GHSA-v422-hmwv-36x6).

Read-only. Do NOT modify anything in `C:\Users\aljob\Downloads\Veyrnox` — no `npm install` in the repo, no edits to `package.json`, `package-lock.json`, or any repo file, no `npm audit fix`. All work happens in a scratch directory. Use the Bash tool (Git Bash) for npm commands.

## Why this watcher was rebuilt (read before changing the trigger)

An earlier version of this watcher triggered on VERSION NUMBERS — "has `@appium/support@latest` dropped its exact `shell-quote@1.8.4` pin?". On 2026-07-27 that fired: `@appium/support@7.2.6` shipped with the pin moved to a patched `1.10.0`, and `npm audit` began reporting `fixAvailable: true`. Both facts were real. **The finding was still completely unfixable**, the residual was wrongly retired, and it had to be reinstated the same day.

The reason: the patched copies were already hoisted at the tree root, while the flagged copies live in a ~258-package DUPLICATE subtree nested under `node_modules/appium-uiautomator2-driver/node_modules/` that keeps `@appium/support 7.2.5` -> `shell-quote 1.8.4` and `@appium/base-driver 10.7.1` -> `body-parser 2.2.2`. Four remediation routes were tested and all failed: a version bump (everything in the chain is already at latest), `npm update`, `overrides` of `^7.2.6`/`^10.7.2` (silently ignored), and deleting the 295 nested lockfile entries then re-resolving (npm re-derived them byte-identically). `npm audit fix --dry-run` is a no-op that prints "fix available" and changes nothing.

So: **a version number is not evidence. Only the resolved tree is evidence.** Never report a trigger because a new `@appium/*` or `appium-*` release exists.

## The check

1. Make a scratch dir (use the session scratchpad or `$TEMP`). Copy ONLY `package.json` and `package-lock.json` from `C:\Users\aljob\Downloads\Veyrnox` into it. Never copy or create `node_modules` in the repo.
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
- If TRIGGER FIRED: state which specific condition fired and show the evidence (the key that disappeared, or the new resolved version). Then give remediation steps to hand to the developer — do NOT apply them yourself, this is a report:
  1. On a new branch in `C:\Users\aljob\Downloads\Veyrnox`, refresh the lockfile so the nested subtree picks up the patched copies.
  2. `npm install` then `npm audit` — confirm the `shell-quote`, `@appium/support`, `@appium/base-driver` HIGH findings and the `body-parser` LOW finding all drop to 0.
  3. Verify the Android E2E harness still passes (the repo's `e2e-emulator` CI job) before merging — the whole chain is that harness's dependency tree.
  4. Update the `appium-uiautomator2-driver chain` entry in `package.json` `//overrides-audit-notes` to record the fix.
  5. Remove the `shell-quote` and `body-parser` entries from the accepted-residuals list in the `veyrnox-daily-dep-audit` scheduled task, and change their "Tracked" lines accordingly.
  6. Dependabot alerts #12 and #14 resolve on the fix.

## Scope note

This watcher covers ONLY the appium/`shell-quote`/`body-parser` chain. The separate `elliptic` LOW residual is tracked by `veyrnox-elliptic-upstream-watch`, and the `brace-expansion` HIGH residual by `veyrnox-brace-expansion-watch` (added 2026-07-27; its override was tested and rejected the same day because `brace-expansion` 5.x changed its CommonJS export shape from a bare function to `{ expand }`, which breaks eslint — see the `brace-expansion` entry in `package.json` `//overrides-audit-notes`).