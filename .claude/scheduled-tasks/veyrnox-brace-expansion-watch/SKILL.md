---
name: veyrnox-brace-expansion-watch
description: RETIRED 2026-08-22 — the brace-expansion residual cleared via backported 1.x/2.x releases; kept as a record, not scheduled
---

# RETIRED 2026-08-22 — do not re-enable without re-reading this header

The residual this watcher existed for has cleared, and the scheduled task was deleted on
2026-08-22. This file is kept as the evidence record, and because its probes are the right
ones if the advisory ever recurs. **Nothing below the "The check" heading should be acted
on without first re-running Probe C2 — the remediation section is now actively wrong, see
"Why the remediation is now harmful".**

## What cleared it

Not an override, and not the 5.x route this file was built around. The advisory was
re-scoped into per-line ranges and the fix was BACKPORTED to the old-shape lines, so
ordinary range resolution reached it with no intervention at all.

- Advisory GHSA-mh99-v99m-4gvg, HIGH — DoS via unbounded expansion length causing an
  out-of-memory process crash.
- **Vulnerable ranges, as published (read from the GitHub advisory API 2026-08-22):**
  `< 1.1.17`; `>= 2.0.0 < 2.1.3`; `>= 3.0.0 < 3.0.3`; `>= 4.0.0 < 5.0.8`.
- **This file used to say "vulnerable `<= 5.0.7`, patched in `5.0.8`"** — a single flat
  range. That was the shape of the advisory when this watcher was written, and it is what
  made a 5.x `overrides` entry look like the only possible fix. It is no longer accurate,
  and the difference is the whole reason the residual cleared. Probe C1 below was written
  to detect exactly this and it is what fired.
- **Resolved tree on `origin/main` at `b8f0127` (2026-08-22):** copies at `1.1.18`,
  `2.1.4` x5 and `5.0.9` x3 — every one at or above its line's patched floor.

## Retirement evidence

Two of the five trigger conditions fired; the other three did not, and that split is
itself the finding — the incompatibility was never fixed, it was routed around.

1. **Probe C1 — TRIGGER.** 1.x is published at `1.1.18` and 2.x at `2.1.4`, both outside
   the vulnerable ranges. Backports to the old-shape lines exist.
2. **Probe C2 — TRIGGER.** `npm audit` on a re-resolved `origin/main` lockfile lists
   `elliptic` as the only advisory root. `brace-expansion` is absent; 0 high, 0 critical.
   The ~28-29 HIGH findings are gone.
3. **Probe A — did NOT fire.** `brace-expansion@5.0.9` under a `latest` override still
   throws `TypeError: expand is not a function` at `minimatch.js:269`; the export is still
   an `object`, not a function. The 5.x shape break is unfixed upstream.
4. **Probe B — did NOT fire.** 6 of 9 `minimatch` copies still declare `^1.`/`^2.` ranges
   (root `3.1.5` `^1.1.7`; 3x `5.1.9` `^2.0.1`; 2x `9.0.9` `^2.0.2`).
5. **No override was ever added.** `package.json` has no `brace-expansion` entry in
   `overrides` and no `//overrides-audit-notes` entry for it. Nothing was applied here.

## Why the remediation is now harmful

The remediation steps below tell a developer to add a `brace-expansion` override. Do not.
Probe A still fails today, so adding a 5.x override would reintroduce the exact
`minimatch`/`eslint` breakage this watcher was built to prevent — and it would fix nothing,
because there are no findings left to fix. If a future advisory brings this back, re-derive
the remediation from fresh probe output rather than reusing the steps below.

## If it recurs

A new `brace-expansion` advisory is a NEW finding, not a reinstatement of this one. The
probes stay valid; the conclusions do not. Re-run Probe C2 first — if `brace-expansion` is
not an advisory root, there is nothing to do regardless of what any version number says.

---

*Original watcher runbook follows, unchanged except the header, retained for its probe
method.*

Upstream watcher for the Veyrnox wallet's accepted `brace-expansion` security residual (advisory GHSA-mh99-v99m-4gvg — DoS via unbounded expansion length causing an out-of-memory process crash; per-line vulnerable ranges `< 1.1.17`, `>= 2.0.0 < 2.1.3`, `>= 3.0.0 < 3.0.3`, `>= 4.0.0 < 5.0.8`).

Read-only. Do NOT modify anything in `C:\Users\aljob\Downloads\Veyrnox` — no `npm install` in the repo, no edits to `package.json`, `package-lock.json`, or any repo file, no `npm audit fix`. All work happens in scratch directories. Use the Bash tool (Git Bash) for npm commands.

## Background — why the obvious fix does not work

**Everything in this section is HISTORICAL — written 2026-07-27, false as of 2026-08-22.**
The counts, the installed versions and the "no patch reachable" premise all describe the
tree before the 1.x/2.x backports landed. Read it for the shape of the trap, not for
current state.

This advisory accounts for roughly 28-29 of the ~32 HIGH findings `npm audit` reports on main. A patched `5.0.8` exists, so an `overrides` entry of `^5.0.8` looks like the fix, and npm's `fixAvailable: false` is misleading (it means npm cannot reach the patch through existing ranges, not that no patch was published).

**At the lockfile level the override looks perfect**: it collapses all 8 installed copies (`5.0.7` x2, `2.1.2` x5, `1.1.16` x1) onto a single `5.0.8`, takes `npm audit` from 32 HIGH to 3, and leaves the appium subtree intact.

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

Get `package.json` and `package-lock.json` into a second scratch dir **from `origin/main`, not from the checkout's working tree** — the primary checkout is shared by ~10 worktrees and other scheduled tasks and is frequently on a detached HEAD or an unrelated branch, so its tree is of unknown provenance and may carry another session's uncommitted lockfile edit:

```bash
export MSYS_NO_PATHCONV=1      # MSYS rewrites the ':' and the command fails SILENTLY
cd "C:/Users/aljob/Downloads/Veyrnox" && git fetch origin main
git show origin/main:package.json      > "$SCRATCH2/package.json"
git show origin/main:package-lock.json > "$SCRATCH2/package-lock.json"
```

Confirm both are non-empty before use (`git cat-file -s origin/main:package-lock.json`) — a silent MSYS failure leaves a zero-byte file, which resolves to an empty tree and reads as "the residual is gone". Then run `npm install --package-lock-only` (do NOT pass `--legacy-peer-deps` — PR #1372 fixed the peer conflict that used to require it, and the flag drops `appium` and ~30 packages, corrupting the result). Sanity-check that `node_modules/appium` is still present; if it is missing the resolve is corrupt — report that and stop.

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