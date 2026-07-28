---
name: veyrnox-brace-expansion-watch
description: Weekly evidence-based watch for the Veyrnox brace-expansion HIGH residual — functionally probes whether the ^5.0.8 override still breaks minimatch/eslint
---

Upstream watcher for the Veyrnox wallet's accepted `brace-expansion` security residual (advisory GHSA-mh99-v99m-4gvg — DoS via unbounded expansion length causing an out-of-memory process crash, vulnerable `<= 5.0.7`, patched in `5.0.8`).

Read-only. Do NOT modify anything in `C:\Users\aljob\Downloads\Veyrnox` — no `npm install` in the repo, no edits to `package.json`, `package-lock.json`, or any repo file, no `npm audit fix`. All work happens in scratch directories. Use the Bash tool (Git Bash) for npm commands.

## Background — why the obvious fix does not work

This advisory accounts for 28 of the 32 HIGH findings `npm audit` reports on main (measured 2026-07-28; the other 4 are the `shell-quote` chain, tracked separately — see the scope note). Context, not a trigger: report the count the run actually produces. A patched `5.0.8` exists, so an `overrides` entry of `^5.0.8` looks like the fix, and npm's `fixAvailable: false` is misleading (it means npm cannot reach the patch through existing ranges, not that no patch was published).

**At the lockfile level the override looks perfect**: it collapses every installed copy onto a single `5.0.8`, takes `npm audit` from 32 HIGH to 3, and leaves the appium subtree intact.

Copy census — REFRESHED 2026-07-28, and it has moved since this task was written: **9** copies, of which **2 are ALREADY on the patched `5.0.8`** (`appium-uiautomator2-driver`, `readdir-glob`) and 7 are still vulnerable (`2.1.2` x5 under `@wdio/config`, `archiver-utils`, `filelist`, `mocha`, `webdriverio`; `1.1.16` x1 hoisted at the root; `5.0.7` x1 under `glob`). At task creation this read "8 copies (`5.0.7` x2, `2.1.2` x5, `1.1.16` x1)" — i.e. one `5.0.7` has since resolved forward to `5.0.8` and a ninth copy appeared. All 9 are dev-scoped. Treat this census as context only; Probes A and B are functional and do not depend on it being current.

**It breaks at runtime.** `brace-expansion` 5.x silently changed its CommonJS export shape with no advisory-visible signal:
- `1.x` and `2.x` do `module.exports = expand` — a BARE FUNCTION
- `5.0.8` `dist/commonjs` exports an OBJECT `{ expand }`

Every consumer written against the old shape throws `TypeError: expand is not a function` on first use. Verified 2026-07-27 on a real install: `npm run lint` dies at `node_modules/minimatch/minimatch.js:271 braceExpand`, called from `@eslint/config-array`.

Scope: 6 of the 9 `minimatch` copies in the tree declare the old shape and break — root `minimatch 3.1.5` (`^1.1.7`), 3x `minimatch 5.1.9` (`^2.0.1`), 2x `minimatch 9.0.9` (`^2.0.2`). Only the 3 `minimatch 10.2.5` copies declare `^5.0.5` and are genuinely compatible. The root `3.1.5` is what `eslint`, `@eslint/eslintrc`, `@eslint/config-array`, `eslint-plugin-react`, `multimatch` (-> `javascript-obfuscator`) and `recursive-readdir` all resolve to.

Note that `npm run build` still PASSES under the override (vite/rollup never touches that path) — so a green build is NOT evidence the override is safe. Do not use it as one.

**A version number is not evidence. Only a functional probe or the resolved tree is evidence.** Never report a trigger merely because a new `brace-expansion` release exists.

## The check

### Probe A — does the override still break minimatch? (the decisive test)

In a fresh scratch dir, write a `package.json` containing exactly:
`{"name":"probe","version":"1.0.0","dependencies":{"minimatch":"3.1.2"},"overrides":{"brace-expansion":"latest"}}`
Run `npm install --no-audit --no-fund`, then run:
`node -e "const mm=require('minimatch'); console.log(mm('abd','a{b,c}d'))"`

- Throws `TypeError: expand is not a function` -> incompatibility PERSISTS.
- Prints `true` -> incompatibility RESOLVED -> **TRIGGER**.

Also record `node -e "console.log(typeof require('brace-expansion'))"` in that dir: `object` means the old shape is still broken, `function` means compat was restored.

### Probe B — are the old-shape consumers gone?

Copy ONLY `package.json` and `package-lock.json` from the repo into a second scratch dir. Run `npm install --package-lock-only` (do NOT pass `--legacy-peer-deps` — PR #1372 fixed the peer conflict that used to require it, and the flag drops `appium` and ~30 packages, corrupting the result). Sanity-check that `node_modules/appium` is still present; if it is missing the resolve is corrupt — report that and stop.

Then enumerate every lockfile entry whose path ends in `node_modules/minimatch` and record the `brace-expansion` range each one declares. If NO entry declares a `^1.` or `^2.` range, every consumer is on the 5.x-compatible shape -> **TRIGGER**.

### Probe C — published lines and audit state

Run `npm view brace-expansion versions --json` and note the newest release in each of the 1.x, 2.x, 4.x and 5.x lines. If a release now exists in the 1.x or 2.x line that falls OUTSIDE the advisory's vulnerable range (i.e. a backport of the DoS fix to an old-shape line) -> **TRIGGER**, because an override to that version would patch the old-shape consumers without breaking them.

Run `npm audit --json` in the Probe B scratch dir. If `brace-expansion` no longer appears as an advisory root -> **TRIGGER**.

## Decision

TRIGGER FIRED if ANY of: Probe A prints `true`; Probe A reports `typeof` as `function`; Probe B finds no `^1.`/`^2.` consumer; Probe C finds a patched 1.x or 2.x release; or Probe C's audit no longer lists `brace-expansion`.

NO CHANGE otherwise. Do NOT treat as a trigger on its own: a new `brace-expansion` release; npm reporting `fixAvailable` either way; the advisory text changing; or a green `npm run build`.

Report separately (not as the trigger) if the advisory is re-rated ABOVE high — that is an escalation worth surfacing immediately.

## Output

- If NO CHANGE: one or two lines, low-noise. For example: "brace-expansion residual: unchanged. Override probe still throws `expand is not a function`; 6 minimatch copies still declare old-shape ranges; no 1.x/2.x backport. No action." Do not pad it.
- If a resolve looked corrupt: say so plainly and report nothing else.
- If TRIGGER FIRED: state which probe fired and show its evidence. Then give remediation steps to hand to the developer — do NOT apply them yourself, this is a report:
  1. On a new branch, add the appropriate `overrides` entry for `brace-expansion` (`^5.0.8` if compat was restored; the backported 1.x/2.x version if that is what fired).
  2. `npm install` then `npm audit` — confirm the ~28-29 HIGH findings drop.
  3. **`npm run lint` is the acceptance test, not `npm run build`.** The build passes even when the override is broken. Lint is what exercises the broken path.
  4. Run the full test suite as well.
  5. Update the `brace-expansion` entry in `package.json` `//overrides-audit-notes` to record the fix.
  6. If the fix lands, this watcher can be retired.

## Scope note

This watcher covers ONLY the `brace-expansion` advisory. The appium/`shell-quote`/`body-parser` chain is tracked by `veyrnox-appium-shellquote-watch`; the `elliptic` LOW residual by `veyrnox-elliptic-upstream-watch`.