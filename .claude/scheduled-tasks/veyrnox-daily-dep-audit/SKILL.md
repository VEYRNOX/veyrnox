---
name: veyrnox-daily-dep-audit
description: Daily npm audit summary for Veyrnox wallet dependencies
---

Run a dependency security audit for the Veyrnox wallet project and present the results as a visual widget.

## Objective
Check the Veyrnox wallet project at `C:\Users\aljob\Downloads\Veyrnox` for npm dependency vulnerabilities and display a clear daily summary.

## Steps

1. Audit `origin/main`'s dependency state — **not the shared checkout's working tree**.

   The primary checkout at `C:\Users\aljob\Downloads\Veyrnox` is used concurrently by ~10
   worktrees and several other scheduled tasks, and is frequently on a detached HEAD or an
   unrelated feature branch. Running `npm audit` there audits whatever that branch happens
   to carry — and then reports it as the project's state. Resolve from the ref instead:

   ```bash
   export MSYS_NO_PATHCONV=1      # MSYS rewrites the ':' and the command fails SILENTLY
   cd "C:/Users/aljob/Downloads/Veyrnox" && git fetch origin main
   SCRATCH="$TEMP/veyrnox-dep-audit"; mkdir -p "$SCRATCH"
   git show origin/main:package.json      > "$SCRATCH/package.json"
   git show origin/main:package-lock.json > "$SCRATCH/package-lock.json"
   git cat-file -s origin/main:package-lock.json   # must be non-zero; a silent MSYS
                                                   # failure yields an empty file, which
                                                   # audits as 0 vulnerabilities
   cd "$SCRATCH" && npm audit --json
   ```

   Record the `origin/main` SHA you audited in the report, so a later reader can tell what
   was actually measured. Never run `npm install` or `npm audit fix` in the primary
   checkout — that mutates shared state other sessions are mid-way through using.

2. Parse the JSON output to extract:
   - Count of vulnerabilities by severity: critical, high, moderate, low, info
   - For each **critical** and **high** vulnerability: name, severity, affected direct dependency, and whether a fix is available
   - For moderate: name, severity, fix availability
   - Total vulnerable package count
   - Date of the audit (today's date)

2a. Apply the accepted-residuals list (see below). An advisory is suppressed only
    if its **root package** matches an entry AND its severity is still at or below
    the severity recorded there. Suppressed advisories are excluded from the
    findings tables — but never from the counts, and never silently: the widget
    must always state how many were suppressed and why (step 3, last bullets).

    If a listed residual ever appears at a **higher severity** than recorded, do
    NOT suppress it. Surface it as a normal finding and say the severity changed.
    That is the whole point of scoping by package rather than by severity level.

3. Render a widget using `show_widget` (call `read_me` first with modules: ["data_viz"]) that displays:
   - A header: "Veyrnox · Dependency Audit · {date}"
   - Severity breakdown as coloured badge chips (critical=red, high=orange, moderate=yellow, low=grey, info=blue)
   - A table of critical + high findings (if any), otherwise a green "No critical or high vulnerabilities" banner
   - A collapsible or compact list of moderate findings
   - A footer note: "Low severity findings omitted for brevity. Run `npm audit` for full output."
   - If anything was suppressed by step 2a, a visible line naming each suppressed
     root package and its one-line reason, e.g. "1 advisory suppressed as an
     accepted residual: elliptic (no upstream fix at any version)." Never omit
     this line when a suppression occurred — a security finding that vanishes
     without a trace is exactly what I4 (fail honest) forbids.
   - For each suppressed residual that has a dedicated upstream watcher (see the
     "Tracked" line in its entry below), also name the watcher and its next run,
     e.g. "tracked by veyrnox-elliptic-upstream-watch (next Mon)". This tells the
     reader the residual is actively monitored, not merely ignored.
   - Residuals whose entry says **Not tracked** must be shown as "not tracked — no
     watcher" rather than left ambiguous. Silence reads as "someone is watching this",
     and for these nobody is. Never invent a watcher name to fill the gap.

4. After the widget, write a 2–3 sentence plain-English summary of the most important finding (or "All clear — no NEW high/critical issues today; the only high/low findings are the tracked accepted residuals." if the only findings are suppressed residuals).

## Accepted residuals

Advisories that have been reviewed, understood, and consciously accepted. They are
suppressed from the findings tables but still counted, and the suppression is always
stated on the widget. Suppression is scoped by **root package name**, never by
severity band — a new low-severity advisory in some other package must still surface.
Residuals with a dedicated upstream watcher carry a **Tracked** line; ones without carry
a **Not tracked** line and are nobody's job until someone looks.

Do not add an entry here without a reason and a revisit trigger. "It's noisy" is not
a reason.

**A fired revisit trigger is a prompt to VERIFY, not a licence to retire.** On
2026-07-27 the `shell-quote` entry was retired on a trigger that had genuinely fired —
the upstream pin moved to a patched version and npm reported `fixAvailable: true` — and
the finding turned out to be entirely unfixable anyway; it was reinstated the same day.
Before removing any entry, confirm the vulnerable package is actually gone from the
resolved tree. Neither an upstream release nor npm's `fixAvailable` field is evidence on
its own.

### `elliptic` — max severity: low — accepted 2026-07-19

- **Advisory:** "Elliptic Uses a Cryptographic Primitive with a Risky Implementation".
- **Why accepted:** no upstream fix exists at any version. `package.json` `overrides`
  already pins `elliptic` to `^6.6.1`, the latest published release — the only
  available mitigation is already applied.
- **Blast radius:** not on the wallet's signing path. `src/wallet-core/` uses
  `@noble`/`@scure` and ethers v6. `elliptic` reaches the tree solely through
  hardware-wallet transport/APDU code, via two direct dependencies:
  `@trezor/connect-web` → `@trezor/utxo-lib` → `tiny-secp256k1` → `elliptic`, and
  `@ledgerhq/hw-app-eth` → `@ethersproject/transactions` → `signing-key` → `elliptic`.
  The physical device performs the signing.
- **Accounts for** ~18 findings (1 root + its transitive dependents, which include
  `@trezor/connect` and `@trezor/connect-web` now that the protobufjs moderate is fixed).
- **Revisit trigger:** a fixed `elliptic` release ships; OR the advisory is
  re-rated above low; OR either direct dependency drops it (e.g. `@ledgerhq/hw-app-eth`
  migrating off `@ethersproject/*` v5, or `@trezor/utxo-lib` moving to
  `tiny-secp256k1 >= 2.0.0`, which already dropped elliptic); OR `elliptic` gains a
  path into `src/wallet-core/`. On any of these, remove this entry and report normally.
- **Tracked:** watcher `veyrnox-elliptic-upstream-watch` (weekly, Mondays ~10am) checks
  all three signals above and reports remediation steps when any fires.
- **Note:** npm's `fixAvailable` for the Ledger chain suggests
  `@ledgerhq/hw-app-eth@6.40.3`. That is a major *downgrade* from the installed 7.8.x
  and still declares `@ethersproject/{abi,rlp,transactions}` v5, so it does not clear
  this advisory. Evaluated and rejected 2026-07-19. Do not propose it again.

### `shell-quote` — max severity: high — accepted 2026-07-21, reinstated 2026-07-27

- **Advisory:** GHSA-395f-4hp3-45gv — quadratic-complexity Denial of Service in
  `shell-quote` `parse()` (vulnerable `<= 1.8.4`, patched in `1.9.0`).
- **Retired and reinstated the same day — read this before acting on any "fix
  available" signal.** It was retired on 2026-07-27 because `@appium/support@7.2.6`
  shipped with its `shell-quote` pin moved from an exact `1.8.4` to a patched `1.10.0`,
  and npm flipped to `fixAvailable: true`. Both facts are real. Both are useless here,
  and the retirement was wrong.
- **Why accepted:** the patched copies are ALREADY hoisted at the tree root
  (`node_modules/{@appium/support 7.2.6, @appium/base-driver 10.7.2, shell-quote 1.10.0,
  body-parser 2.3.0}`). What `npm audit` flags is a separate 258-package DUPLICATE
  subtree under `node_modules/appium-uiautomator2-driver/node_modules/` still holding
  `@appium/support 7.2.5` → `shell-quote 1.8.4` and `@appium/base-driver 10.7.1` →
  `body-parser 2.2.2`. Four remediation routes were tested on a clean worktree off
  `main` (2026-07-27) and all four failed: (1) a version bump is impossible — every
  package in the chain is already at latest (`appium-uiautomator2-driver@8.1.2`,
  `appium-android-driver@14.0.2`, `@appium/base-driver@10.7.2`); (2) `npm update` on the
  four packages left the nested copies untouched; (3) `overrides` of `^7.2.6` / `^10.7.2`
  on `@appium/support` and `@appium/base-driver` were silently ignored, extending the
  original shell-quote override finding to the parent packages that carry the exact pins;
  (4) deleting all 295 nested lockfile entries and re-resolving made npm re-derive them
  byte-identically. `npm audit fix --dry-run` is a NO-OP — it prints "fix available via
  `npm audit fix`", changes zero lockfile lines, and still reports 51 vulnerabilities.
- **Blast radius:** DoS-only, confined to the `appium-uiautomator2-driver` devDependency
  (the Android E2E test harness). Never imported by `src/`, never bundled in the
  production wallet. `npm audit --omit=dev` reports 0 high / 0 critical. Not
  attacker-reachable — the harness parses trusted local test fixtures.
- **Accounts for** 3 high findings: `shell-quote`, `@appium/support`,
  `@appium/base-driver`. (The chain was ~8 when first accepted; it shrank as the root
  copies got patched.) Suppress the whole chain under this root.
- **Revisit trigger — evidence, NOT a version number.** A version-based trigger is what
  produced the false positive above. Trigger only on: the lockfile no longer containing
  `node_modules/appium-uiautomator2-driver/node_modules/@appium/support`; OR the Android
  E2E harness being retired; OR the advisory being re-rated above high. A new
  `@appium/*` release is NOT sufficient on its own — verify the nested entry is actually
  gone before retiring this again.
- **Tracked:** watcher `veyrnox-appium-shellquote-watch` (weekly, Mondays ~9am),
  deleted and REBUILT 2026-07-27. The original watched version numbers and produced the
  false positive above; the rebuilt one ignores version numbers entirely and triggers
  only on resolved-tree evidence — it copies `package.json` + `package-lock.json` to a
  scratch dir, runs `npm install --package-lock-only`, and checks whether
  `node_modules/appium-uiautomator2-driver/node_modules/@appium/support` is actually
  gone. If a future run reports a trigger on the strength of a release number or an
  `npm audit` `fixAvailable: true`, that is the old failure recurring — verify the
  nested entry yourself before retiring anything.
- Dependabot alert #12 dismissed as `tolerable_risk`.

### `body-parser` — max severity: low — accepted 2026-07-21, reinstated 2026-07-27

- **Advisory:** GHSA-v422-hmwv-36x6 — DoS when an invalid `limit` value silently
  disables size enforcement (vulnerable `2.0.0 - 2.2.x`, patched `2.3.0`).
- **Why accepted:** the same nested-duplicate mechanism as `shell-quote` above, and
  unfixable for the same four reasons. The root `body-parser` is already the patched
  `2.3.0`; the flagged `2.2.2` is pinned exactly by the nested
  `@appium/base-driver@10.7.1`. DoS-only, dev-only, never bundled.
- **Accounts for** 1 low finding (`body-parser` under the appium subtree).
- **Revisit trigger:** as `shell-quote` above — the nested entry actually disappearing.
  Retired and reinstated 2026-07-27 alongside it; do not retire this one on an
  `npm audit` `fixAvailable: true` either, which was verified to be a no-op.
- **Tracked:** covered by the same rebuilt `veyrnox-appium-shellquote-watch` (weekly,
  Mondays ~9am), which checks the nested `body-parser` resolution alongside
  `shell-quote`.
- Dependabot alert #14 auto-dismissed (low-severity dev dependency). That dismissal is
  not itself a reason to suppress here; the rationale above is.

### `extract-zip` — max severity: high — accepted 2026-08-16

- **Advisory:** GHSA-jmr9-qjv8-65gv — unvalidated symlink path traversal in `extract-zip`
  (CVSS 8.1, CWE-22, vulnerable `<= 2.0.1`).
- **Why accepted:** no upstream fix exists at any version. `2.0.1` is the latest
  published release (`npm view extract-zip dist-tags` → `latest: 2.0.1`) and the advisory
  range covers it, so there is no version bump that clears this.
- **Blast radius:** dev-only. Reaches the tree solely through the WebdriverIO E2E test
  harness: `@wdio/*` devDependencies (`^9.30.1`) → `@wdio/utils` → `@puppeteer/browsers`
  → `extract-zip`. Never imported by `src/`, never bundled in the production wallet.
  `npm audit --omit=dev` reports 0 high / 0 critical. Exploitation requires the harness to
  extract an attacker-controlled zip; in practice `@puppeteer/browsers` extracts browser
  builds from Google's Chrome for Testing endpoints.
- **Accounts for** 12 high findings — the root plus its transitive dependents:
  `extract-zip`, `@puppeteer/browsers`, `@wdio/utils`, `@wdio/config`, `@wdio/globals`,
  `@wdio/runner`, `@wdio/cli`, `@wdio/local-runner`, `@wdio/mocha-framework`,
  `expect-webdriverio`, `webdriver`, `webdriverio`. Suppress the whole chain under this
  root.
- **Revisit trigger:** an `extract-zip` release ships outside the `<= 2.0.1` range; OR
  `@puppeteer/browsers` drops `extract-zip`; OR the WebdriverIO E2E harness is retired;
  OR `extract-zip` gains a path into a production dependency. Verify the resolved tree
  before retiring — an npm `fixAvailable: true` is not evidence.
- **Tracked:** watcher `veyrnox-extract-zip-watch` (weekly, Mondays ~11am), created
  2026-08-16. Checks for a patched `extract-zip`, for `@wdio/utils` moving its
  `@puppeteer/browsers` pin to a range admitting `>= 3.0.0`, and for the E2E harness being
  retired.
- **PENDING RETIREMENT (2026-08-16) — the override below was taken, and the findings are
  gone from the resolved tree.** `overrides` now pins `@puppeteer/browsers` to `^3`;
  `npm install --package-lock-only` resolves it to `3.2.0` under `@wdio/utils`, and
  `extract-zip` is absent from the lockfile entirely. `npm audit` drops from 12 high to
  **0 high** (21 total: 18 low elliptic + 3 moderate uuid/xcode chain). The appium subtree
  is byte-identical — no entries added or removed — so the `--legacy-peer-deps` collateral
  hazard did not recur. **Do not retire this entry on that evidence alone.** The open
  question is not whether the advisory clears — it does — but whether the harness still
  launches its browser drivers under a semver-major `@puppeteer/browsers`. Retire only
  once the E2E jobs have passed on the PR carrying the override. If they fail, the override
  is reverted and this entry stands unchanged.
- **The candidate remediation, as evaluated before it was taken:**
  `@puppeteer/browsers@3.2.0` has already DROPPED `extract-zip` (its dependencies are now
  `{yargs, modern-tar}`). The chain does not clear only because `@wdio/utils@9.30.1` —
  which is also `@latest` — pins `@puppeteer/browsers: ^2.2.0`, and `3.x` is outside that
  caret. A `package.json` `overrides` entry forcing `@puppeteer/browsers` to `^3` would
  clear all 12 findings without waiting for upstream. It is a semver-MAJOR override of a
  transitive dependency inside the test harness, so it can break browser-driver launch in
  a way `npm audit` will not show. It needs a real E2E run to validate, which is why this
  is an accepted residual rather than a fix. Do not apply it from the audit task.
- **Note:** npm's `fixAvailable` suggests `@wdio/cli@8.14.6`, a major *downgrade* from the
  installed 9.30.1. `@wdio/utils@8.x` still depends on `@puppeteer/browsers` →
  `extract-zip`, so it does not clear the advisory. Evaluated and rejected 2026-08-16.
  Do not propose it again.
- Tracked as issue #1851.

## Constraints
- Do NOT run `npm audit fix` or modify any files — read-only audit only.
- Suppression is a **reporting** decision only. Never edit `package.json`,
  `overrides`, or any repo file to make a finding disappear.
- Do NOT create, edit, or trigger scheduled tasks/watchers from this audit — only
  reference them by name in the report.
- If the project directory doesn't exist or npm fails, output a widget showing the error clearly rather than silently failing.
- Use the Bash tool for the npm command (Git Bash is available on this Windows machine).