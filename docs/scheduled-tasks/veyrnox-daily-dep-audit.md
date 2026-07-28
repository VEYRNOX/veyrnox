---
name: veyrnox-daily-dep-audit
description: Daily npm audit summary for Veyrnox wallet dependencies
---

Run a dependency security audit for the Veyrnox wallet project and present the results as a visual widget.

## Objective
Check the Veyrnox wallet project at `C:\Users\aljob\Downloads\Veyrnox` for npm dependency vulnerabilities and display a clear daily summary.

## Steps

1. Run `npm audit --json` in `C:\Users\aljob\Downloads\Veyrnox` (use PowerShell or Bash).

1b. Check the `elliptic` blast-radius claim (revisit trigger 4). The `elliptic` residual is
    accepted ONLY because `elliptic` stays on the hardware-wallet transport path and off
    the software signing path — so that has to be verified, not assumed. Read-only, three
    commands, run in the repo:

    - `npm ls elliptic --all` — collect the top-level packages that reach `elliptic`.
      Expected exactly: `@trezor/connect-web` and `@ledgerhq/hw-app-eth`. **Any third
      entry point fires trigger 4.**
    - `grep -rniE "require\(['\"]elliptic|from ['\"]elliptic" src/` — expected: no matches.
      **Any direct import in `src/` fires trigger 4.**
    - `grep -rlE "from ['\"](@trezor/connect-web|@ledgerhq/hw-app-eth)" src/wallet-core/` —
      expected only the hardware-transport modules: `btc/hw-send.js`, `evm/hw-send.js`,
      `sol/hw-send.js`, `hw/trezor.js`, `hw/trezorAddress.js` (plus the two `hw/__tests__`
      files). **An import from any OTHER wallet-core module — anything under `keystore/`,
      `vault.js`, `derivation.js`, `coldkey/`, or a `send.js` that is not `hw-send.js` —
      fires trigger 4**, because that is `elliptic` reaching code that signs in software.

    Baseline confirmed 2026-07-28: 2 entry points, 0 direct imports, 7 files all in the
    expected transport set. If trigger 4 fires, do NOT suppress the `elliptic` findings —
    report them normally and say the blast-radius claim no longer holds. Being dev-only
    is not a defence here; this path is production code.

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

### `brace-expansion` — max severity: high — accepted 2026-07-28

- **Advisory:** GHSA-mh99-v99m-4gvg — DoS via unbounded expansion causing an
  out-of-memory process crash (CWE-400/770; vulnerable `<= 5.0.7`, patched `5.0.8`).
  Dependabot alert **#19**, auto-dismissed.
- **Owner decision, 2026-07-28.** This entry was added on the owner's explicit
  instruction after being surfaced as a normal finding and flagged as needing a decision.
  It is the largest suppression in this file — 28 of the 32 high findings — so the daily
  widget will now report close to zero and attribute nearly everything to residuals. That
  is the intended effect, but it means the suppression line on the widget is doing almost
  all of the reporting: never omit it, and never soften it to "no significant findings".
- **Why accepted:** there is no fix that works. The obvious one — an `overrides` entry of
  `^5.0.8` — is a trap: at the lockfile level it collapses every copy onto the patched
  `5.0.8` and takes `npm audit` from 32 high to 3, but `brace-expansion` 5.x silently
  changed its CommonJS export from a bare function to `{ expand }`. The 6 `minimatch`
  copies declaring `^1.`/`^2.` ranges then throw `TypeError: expand is not a function`.
  Verified on a real install 2026-07-27: `npm run lint` dies at
  `minimatch/minimatch.js:271`, called from `@eslint/config-array`. There is no patched
  1.x or 2.x line to override to instead. Upstream has published `5.0.8` and `3.0.4`; the
  `1.1.16` and `2.1.2` releases in our tree are NOT fixes for this advisory.
- **`npm run build` passing is NOT evidence the override is safe** — vite/rollup never
  touches that path. `npm run lint` is the acceptance test.
- **Blast radius:** DoS-only and dev-only. All 9 resolved copies are dev-scoped and every
  affected package is a devDependency; `npm audit --omit=dev` reports 0 high / 0 critical,
  so none of it reaches the shipped wallet bundle. This is the argument that carried the
  decision — it is NOT an argument that the finding is unreal.
- **Accounts for** 28 high findings on 2026-07-28: `brace-expansion` itself plus 27
  dependents reached through `minimatch`, including the 7 direct devDependencies `eslint`,
  `eslint-plugin-react`, `javascript-obfuscator`, `@wdio/cli`, `@wdio/local-runner`,
  `@wdio/mocha-framework` and `webdriverio`. Suppress the whole chain under this root. As
  with the other entries the count is descriptive, not a gate: report the number the run
  actually produces rather than assuming this line is right.
- **Revisit trigger — evidence, NOT a version number.** Do NOT retire this on a new
  `brace-expansion` release, on npm's `fixAvailable` flipping, or on a green build. The
  triggers are the ones `veyrnox-brace-expansion-watch` probes for: the `^5.0.8` override
  no longer throwing `expand is not a function`; OR no `minimatch` copy still declaring a
  `^1.`/`^2.` range; OR a patched release appearing in the 1.x or 2.x line (an old-shape
  backport, which could be overridden safely); OR `brace-expansion` no longer appearing as
  an advisory root. Also surface immediately, without waiting for the watcher, if the
  advisory is re-rated ABOVE high, or if any affected package stops being dev-only — the
  dev-only scope is load-bearing for this decision in a way it is not for the others.
- **Tracked:** watcher `veyrnox-brace-expansion-watch` (weekly). It is the strongest of
  the three watchers — it runs a functional probe in a scratch dir rather than reading
  version numbers, and it explicitly refuses release numbers, `fixAvailable`, and green
  builds as evidence.
- **Watch the copy census drift.** Two of the 9 copies have already resolved forward to
  the patched `5.0.8` on their own (`appium-uiautomator2-driver`, `readdir-glob`), up from
  0 when the watcher was written. Copies migrating unaided is the most likely route by
  which this clears without any override, so a shrinking vulnerable count is a signal to
  check the trigger, not just a smaller number.

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
- **Accounts for** 18 low findings (1 root + 17 transitive dependents: the six
  `@ethersproject/*`, `@ledgerhq/{evm-tools,hw-app-eth}`, the five `@trezor/*` including
  `connect` and `connect-web` now that the protobufjs moderate is fixed, plus
  `tiny-secp256k1`, `browserify-sign`, `create-ecdh` and `crypto-browserify`). Confirmed
  at exactly 18 on 2026-07-28. As with `shell-quote`, the count is descriptive, not a
  gate: suppress by root, and report a count that differs from this line rather than
  assuming the line is right.
- **Revisit trigger:** a fixed `elliptic` release ships; OR the advisory is
  re-rated above low; OR either direct dependency drops it (e.g. `@ledgerhq/hw-app-eth`
  migrating off `@ethersproject/*` v5, or `@trezor/utxo-lib` moving to
  `tiny-secp256k1 >= 2.0.0`, which already dropped elliptic); OR `elliptic` becomes
  reachable from `src/wallet-core/` code OTHER than the hardware-transport modules
  (trigger 4 — restated 2026-07-28, see below). On any of these, remove this entry and
  report normally.
- **Trigger 4 was unfalsifiable as originally written, and that is why it never fired.**
  It used to read "`elliptic` gains a path into `src/wallet-core/`". That condition has
  been TRUE since before this residual was accepted: `src/wallet-core/btc/hw-send.js`,
  `evm/hw-send.js`, `sol/hw-send.js`, `hw/trezor.js` and `hw/trezorAddress.js` all import
  `@trezor/connect-web` or `@ledgerhq/hw-app-*` directly, and `@trezor/connect-web` is one
  of the two entry points that pull `elliptic`. Anyone who actually checked the trigger as
  worded would have concluded the residual must be retired — wrongly, because those files
  ARE the hardware-wallet transport code the blast-radius bullet already describes; the
  physical device still does the signing. The condition that genuinely matters is
  `elliptic` reaching the SOFTWARE signing/derivation path, so trigger 4 is now scoped to
  that. Verified 2026-07-28: no direct `elliptic` import anywhere in `src/`, and
  `derivation.js`, `btc/derivation.js`, `btc/send.js` and `coldkey/psbt.js` all use
  `@noble`/`@scure` — the blast-radius claim holds.
- **Tracked — all four triggers, split across two places (as of 2026-07-28).** Watcher
  `veyrnox-elliptic-upstream-watch` (weekly, Mondays ~10am) runs three registry-only
  `npm view` checks: SIGNAL 1 (`elliptic@latest` above 6.6.1), SIGNAL 2a
  (`@ledgerhq/hw-app-eth@latest` no longer declaring any `@ethersproject/*`), SIGNAL 2b
  (`@trezor/utxo-lib` pinning `tiny-secp256k1` at `>= 2.0.0` — that is the WHOLE of 2b;
  a new `@trezor/connect-web` release is context only and does NOT fire it, see the
  watcher's Decision section). Those cover trigger 1 and trigger 3. The other two:
  - Trigger 2 (re-rated above low) — covered instead by step 2a of THIS audit, which
    refuses to suppress a residual that appears above its recorded severity.
  - Trigger 4 (restated: `elliptic` reaching the software signing path) — now checked by
    step 1b of THIS audit, daily. It cannot live in the watcher, which is chartered
    registry-only and never reads the repo. Before 2026-07-28 nothing checked it at all.
- **Note:** npm's `fixAvailable` for the Ledger chain suggests
  `@ledgerhq/hw-app-eth@6.40.3`. That is a major *downgrade* from the installed 7.8.x
  and still declares `@ethersproject/{abi,rlp,transactions}` v5, so it does not clear
  this advisory. Evaluated and rejected 2026-07-19. Do not propose it again.

### `shell-quote` — max severity: high — accepted 2026-07-21, reinstated 2026-07-27

- **Advisory:** GHSA-395f-4hp3-45gv — quadratic-complexity Denial of Service in
  `shell-quote` `parse()` (vulnerable `<= 1.8.4`; `1.9.0` is the FIRST fixed release, so
  anything `>= 1.9.0` is clear). The hoisted root copy below is `1.10.0` — a later
  release on the same fixed line, not a second patch level and not a discrepancy.
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
  `npm audit fix`", changes zero lockfile lines, and leaves the advisory count unchanged
  (51 at the time of the 2026-07-27 test; the absolute total is not the evidence here —
  the zero-line diff and the surviving nested entries are, and a total that has since
  moved for unrelated reasons says nothing about this residual either way).
- **Blast radius:** DoS-only, confined to the `appium-uiautomator2-driver` devDependency
  (the Android E2E test harness). Never imported by `src/`, never bundled in the
  production wallet. `npm audit --omit=dev` reports 0 high / 0 critical. Not
  attacker-reachable — the harness parses trusted local test fixtures.
- **Accounts for** 4 high findings: `shell-quote`, `@appium/support`,
  `@appium/base-driver`, `@appium/docutils`. (The chain was ~8 when first accepted; it
  shrank to 3 as the root copies got patched, then `@appium/docutils` rejoined it —
  observed 2026-07-28.) Suppress the whole chain under this root. The count is
  descriptive, not a gate: the chain membership moves as the tree re-resolves, so
  suppress by root, and report a count that differs from this line rather than
  assuming the line is right.
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

## Constraints
- Do NOT run `npm audit fix` or modify any files — read-only audit only.
- Suppression is a **reporting** decision only. Never edit `package.json`,
  `overrides`, or any repo file to make a finding disappear.
- Do NOT create, edit, or trigger scheduled tasks/watchers from this audit — only
  reference them by name in the report.
- If the project directory doesn't exist or npm fails, output a widget showing the error clearly rather than silently failing.
- Use the Bash tool for the npm command (Git Bash is available on this Windows machine).