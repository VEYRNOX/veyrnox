---
name: veyrnox-extract-zip-watch
description: Weekly watch for upstream resolution of the Veyrnox extract-zip high-severity residual (patched extract-zip, or @wdio/utils moving to a @puppeteer/browsers release that dropped extract-zip)
---

Upstream watcher for the Veyrnox wallet's accepted `extract-zip` security residual. Run
almost entirely with read-only `npm view` registry queries — do NOT modify files, run
`npm install`, or run `npm audit fix`. Use the Bash tool for npm commands.

> **Shared-checkout note.** Signals 1 and 2 read the npm registry only and touch no repo
> file. Signal 3 needs `package.json`, which must be read from the ref rather than the
> working tree — the primary checkout is shared by many worktrees and scheduled tasks and
> is frequently on an unrelated branch. Use
> `git show origin/main:package.json`, and confirm a non-zero byte count with
> `git cat-file -s origin/main:package.json` — that read fails silently, and an empty
> result reads as "the harness was retired", a false trigger. (An `MSYS_NO_PATHCONV=1`
> Git-Bash caveat was dropped here 2026-09-03; the byte check covers the same failure on
> any platform.)

## Background (why this task exists)

The Veyrnox `npm audit` shows 12 HIGH findings all rooted in ONE advisory: `extract-zip`
GHSA-jmr9-qjv8-65gv ("unvalidated symlink path traversal", CVSS 8.1, CWE-22, vulnerable
`<= 2.0.1`). There is no patched `extract-zip` at any version — latest published is
`2.0.1`, itself inside the vulnerable range.

`extract-zip` is dev-only. It reaches the tree solely through the WebdriverIO E2E test
harness:

    @wdio/* (devDependencies, ^9.30.1) -> @wdio/utils -> @puppeteer/browsers -> extract-zip

It is never imported by `src/` and never bundled in the production wallet;
`npm audit --omit=dev` reports 0 high / 0 critical. Documented as an accepted residual in
`.claude/scheduled-tasks/veyrnox-daily-dep-audit/SKILL.md`; tracking issue #1851.

## Baseline at task creation (2026-08-16)

- SIGNAL 1 — `extract-zip@latest` = `2.0.1` (still vulnerable; no patched release exists).
- SIGNAL 2 — **already half-fired upstream, and this is the live signal.**
  `@puppeteer/browsers@latest` = `3.2.0` and has **already dropped `extract-zip`** — its
  dependencies are now `{yargs, modern-tar}`. The installed `2.13.2` still declares
  `extract-zip: ^2.0.1`. The chain does not clear today only because
  `@wdio/utils@9.30.1` (which is also `@latest`) pins `@puppeteer/browsers: ^2.2.0`, and
  `3.x` is outside that caret range.
- SIGNAL 3 — the harness is present: `@wdio/cli`, `@wdio/local-runner`,
  `@wdio/mocha-framework`, `webdriverio` are all devDependencies on `origin/main`.

## The check (run these)

1. `npm view extract-zip version` (SIGNAL 1)
2. `npm view @wdio/utils@latest version` and
   `npm view @wdio/utils@latest dependencies.@puppeteer/browsers` — check whether the pin
   has moved to a range admitting `>= 3.0.0`. Also re-confirm
   `npm view @puppeteer/browsers@latest dependencies --json` still lacks an `extract-zip`
   key. (SIGNAL 2)
3. `git show origin/main:package.json` and check whether any `@wdio/*` or `webdriverio`
   devDependency still exists. (SIGNAL 3)

## Decision

- **SIGNAL 1 FIRED** (best outcome — clears all 12 at once) if `extract-zip@latest`
  resolves above `2.0.1` **and** the advisory range no longer covers it. Remediation: the
  chain picks it up on a plain reinstall, since `@puppeteer/browsers@2.13.2` declares
  `extract-zip: ^2.0.1`. Confirm with `npm audit`.
- **SIGNAL 2 FIRED** (clears all 12) if `@wdio/utils@latest` pins `@puppeteer/browsers` at
  a range admitting `>= 3.0.0`. Remediation: bump the `@wdio/*` devDependencies, reinstall,
  re-audit.
- **SIGNAL 3 FIRED** (residual becomes moot) if the WebdriverIO E2E harness has been
  removed from `package.json`. Remediation: none — retire the residual entry instead.
- Otherwise NO CHANGE.
- **UPDATE 2026-08-16, same day as creation — the override WAS taken.** `overrides` now
  pins `@puppeteer/browsers` to `^3`; it resolves to `3.2.0` under `@wdio/utils` and
  `extract-zip` is gone from the lockfile (`npm audit`: 12 high → 0 high). This watcher is
  therefore no longer watching for a way to clear the advisory — it is watching for the
  point at which the **override can be dropped**, i.e. when `@wdio/utils` moves its own
  pin to admit `>= 3.0.0` (SIGNAL 2 below). Until then the override is load-bearing: do
  not remove it to "tidy" the overrides block. If the E2E jobs ever revert the override,
  restore the original reading of this file. The paragraph below is kept as the record of
  what was evaluated and why.
- **The candidate remediation, as evaluated before it was taken.** Because
  `@puppeteer/browsers@3.2.0` has already dropped `extract-zip`, a `package.json`
  `overrides` entry forcing `@puppeteer/browsers` to `^3` would clear all 12 findings
  without waiting for `@wdio/utils`. It is a semver-MAJOR override of a transitive
  dependency inside the test harness, so it can break browser-driver launch in a way
  `npm audit` will not show. If reporting this, present it as a candidate for a developer
  to test against a real E2E run — never as a done deal, and never apply it here.

## Output

- If NO CHANGE: one or two low-noise lines — e.g. "extract-zip residual: no upstream
  movement. extract-zip still 2.0.1 (no patch); @wdio/utils still pins
  @puppeteer/browsers ^2.2.0. No action."
- If ANY signal FIRED: state which signal(s), show old vs new versions/deps, whether it is
  a FULL or PARTIAL fix, and the remediation steps to hand to a developer. Do NOT apply
  them — this is a report.
- **Verify the resolved tree before recommending retirement of the residual.** Neither an
  upstream release number nor an npm `fixAvailable: true` is evidence on its own; the
  2026-07-27 `shell-quote` false positive was produced by exactly that mistake. The
  evidence is `extract-zip` being absent from the resolved lockfile, or the advisory range
  no longer covering the resolved version.
- Do NOT run `npm audit fix`, do NOT edit files. Read-only report only.
