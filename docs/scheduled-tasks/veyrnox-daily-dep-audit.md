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

    **Only entries under `## Accepted residuals` suppress anything.** Entries under
    `## Retired residuals` are history: same `###` shape, same backticked root name,
    same "Accounted for N findings" line, and they must never match. A retired
    advisory reappearing in the resolved tree is a NEW finding that surfaces
    normally — see the retired entry's own "If it comes back" line. Match on the
    section, not on the entry shape; suppressing 12 high findings because a root
    name appears somewhere in this file is exactly the silent vanishing that I4
    forbids.

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

### `elliptic` — max severity: low — accepted 2026-07-19, re-scoped 2026-08-25

- **Advisory:** GHSA-848j-6mx2-7j84, "Elliptic Uses a Cryptographic Primitive with a
  Risky Implementation".
- **Why accepted:** no upstream fix exists at any version. `package.json` `overrides`
  already pins `elliptic` to `^6.6.1`, and 6.6.1 is still `latest` (checked
  2026-08-25) — the only available mitigation is already applied.
- **Blast radius — ONE chain, and it now runs through `src/wallet-core/`:**
  `@keystonehq/keystone-sdk` → `@keystonehq/bc-ur-registry-eth` → `hdkey` →
  `secp256k1` → `elliptic`. The Trezor and Ledger chains this entry used to name are
  GONE — `@trezor/connect-web`, `@trezor/utxo-lib`, `tiny-secp256k1`,
  `@ledgerhq/hw-app-eth` and `@ethersproject/signing-key` are all absent from
  `origin/main`'s lockfile at `24333ad9`.
- **The old "not on the wallet's signing path" line was retired, not reworded —
  it stopped being true.** `src/wallet-core/hw/digitalShield.js:12` imports
  `ETHSignature` from `@keystonehq/bc-ur-registry-eth`, and the repo's own
  `src/wallet-core/hw/__tests__/digitalShield.deps.test.js` calls that package a
  "signing-path dependency pin". The package's ESM build carries a module-level
  `import HDKey from 'hdkey'` (verified by unpacking 0.22.1, 2026-08-25), so
  `elliptic` is in the wallet-core import graph.
  **What keeps it low, stated precisely rather than as a slogan:** `digitalShield.js`
  calls only `ETHSignature.fromCBOR`. `hdkey` backs `generateAddressFromXpub` and
  `findHDPathFromAddress`, neither of which appears anywhere in `src/`. The Keystone
  device performs the signing; nothing here derives or holds a key. Veyrnox key
  material is still `@noble`/`@scure`/ethers v6 only.
- **Accounts for** 5 findings as of 2026-08-25 at `origin/main` `24333ad9` (1 advisory
  root + 4 transitive dependents: `secp256k1`, `hdkey`,
  `@keystonehq/bc-ur-registry-eth`, `@keystonehq/keystone-sdk`). It was 22 on
  2026-08-22; the drop is the Trezor/Ledger removal above, not a fix. A count that
  moves for an unexplained reason is a revisit trigger — re-derive the chain from
  `npm audit --json` before trusting this number.
- **Revisit trigger:** a fixed `elliptic` release ships; OR the advisory is re-rated
  above low; OR the surviving chain drops it (`@keystonehq/bc-ur-registry-eth` moving
  off `hdkey`, or `hdkey` moving off `secp256k1`/`elliptic`); OR `digitalShield.js`
  starts calling `generateAddressFromXpub` / `findHDPathFromAddress`, or any other
  `src/` code reaches an `elliptic`-backed API; OR a Trezor/Ledger integration returns
  and reintroduces a second chain. On any of these, re-derive before acting — retire
  the entry only if the vulnerable package is actually gone from the resolved tree.
- **The "gains a path into `src/wallet-core/`" trigger already fired, on 2026-08-25,
  and this entry was re-scoped rather than retired.** That is a judgment call and is
  recorded as one: severity is unchanged (low), no fix exists at any version, and the
  reachable-API analysis above says no `elliptic` code path is called. The daily audit
  of 2026-08-25 therefore suppressed NOTHING and listed all 5 findings in full. Doing
  that once is honest; doing it every day would turn "accepted residual" into
  "permanently ignored". If the reachability analysis above ever stops holding, this
  entry goes.
- **Tracked — but the watcher's brief is stale, so treat this as PARTIAL tracking.**
  `veyrnox-elliptic-upstream-watch` is registered and enabled (weekly, Tuesdays 09:34
  — not "Mondays ~10am" as this entry claimed until 2026-08-25; last ran 2026-08-18).
  Its runbook checks the Trezor and Ledger chains, both of which no longer exist, and
  it was never taught the Keystone chain. Until it is re-pointed, it can only catch
  the upstream-`elliptic`-release signal. Per the `brace-expansion` lesson below: a
  watcher existing is not evidence it watches the thing you care about.
- **Note:** the old `@ledgerhq/hw-app-eth@6.40.3` `fixAvailable` warning is retired
  with the Ledger chain. Kept as one line in case Ledger support returns: that version
  is a major *downgrade* and still declares `@ethersproject/*` v5, so it never cleared
  this advisory. Evaluated and rejected 2026-07-19.

## Retired residuals

Entries that were accepted, then genuinely cleared. Kept as a record so a future reader
can tell "this was fixed" from "this was never looked at", and so the evidence that
justified each retirement is on file rather than in a PR description.

### `shell-quote` — accepted 2026-07-21, reinstated 2026-07-27, RETIRED 2026-08-23

- **Advisory:** GHSA-395f-4hp3-45gv — quadratic-complexity Denial of Service in
  `shell-quote` `parse()` (vulnerable `<= 1.8.4`, patched in `1.9.0`). Reached the tree
  dev-only, through a ~257-package duplicate subtree under
  `node_modules/appium-uiautomator2-driver/node_modules/` that carried its own
  `@appium/support` → `shell-quote` pair, separate from the already-patched copies
  hoisted at the tree root. Accounted for 3 high findings at retirement time, ~8 when
  first accepted.
- **How it cleared:** nothing was deliberately remediated, and no `overrides` entry was
  ever added. The nested subtree was re-resolved as a side effect of routine lockfile
  regeneration, and now duplicates PATCHED copies instead of vulnerable ones. Note the
  shape of that: the entry's own condition 1 — "the nested `@appium/support` key
  disappears" — never fired and was the wrong trigger. The key is still there; its
  contents changed underneath it. That is exactly why conditions 2, 3 and 4 were added
  after the 2026-07-27 false positive, and all three are what fired here.
- **Retirement evidence — resolved tree, measured this run, per this file's own rule that
  a version number and an npm `fixAvailable` are not evidence:**
  1. Fresh `npm install --package-lock-only` (no `--legacy-peer-deps`) in a scratch dir,
     from `origin/main` at `8b3d3fb`. Sanity check passed: `node_modules/appium` present
     at `3.6.0`, so the resolve is not the corrupt/stripped kind that flag produces.
  2. The nested subtree still exists (257 entries) and resolves PATCHED:
     `@appium/support 7.2.6`, `shell-quote 1.10.0`, `@appium/base-driver 10.7.2`,
     `body-parser 2.3.0`. Root copies match. Condition 2 (`shell-quote > 1.8.4`) and
     condition 3 (`body-parser >= 2.3.0`) both true.
  3. **Condition 4, the one retirement actually requires:** `npm audit` on that resolve
     reports 22 low / 0 moderate / 0 high / 0 critical, with `elliptic` as the sole
     advisory root. None of `shell-quote`, `@appium/support`, `@appium/base-driver`, or
     `body-parser` appears as a root. A trigger from condition 1 or 5 alone would not
     have been sufficient.
  4. The fresh resolve is byte-identical in size to the committed lockfile (1,239,773
     bytes), so this is `main`'s real state and not a scratch artifact.
- **This was already recorded elsewhere 20 days earlier, and the drift is the finding.**
  `package.json` `//overrides-audit-notes` has said "RESOLVED 2026-08-03 — no longer an
  accepted residual" since 2026-08-03, with the same lockfile evidence. That note also
  states "WATCHER RETIRED: veyrnox-appium-shellquote-watch deleted 2026-08-03". **Both
  halves were out of step with reality:** this file kept both entries under
  `## Accepted residuals` for three more weeks, and the watcher was never deleted — it
  is still registered and enabled. A retirement recorded in one file and not the other
  is indistinguishable from no retirement at all to whichever reader opens the other
  file. If you retire a residual, change every place that names it in the same commit.
- **If it comes back:** nothing is pinning this. No `overrides` entry holds the nested
  subtree at patched versions — it landed there through ordinary range resolution and
  could regress the same way (it already did once, transiently, on 2026-07-29: patched at
  `87e9897b`, back to `1.8.4` at `ff78ac99` 12 minutes later, restored at `0295fd40`).
  A reappearance is a NEW finding that must surface normally, not a reinstatement of this
  entry — re-derive the chain before assuming this history applies.
- **Watcher:** `veyrnox-appium-shellquote-watch` produced this retirement and is now
  redundant. Recommend deleting the scheduled task; this task may not delete scheduled
  tasks itself (see Constraints), so the owner acts. Its `SKILL.md` should be retained
  the way `veyrnox-extract-zip-watch`'s was, in case the prompt is wanted back.
- Dependabot alert #12 was dismissed as `tolerable_risk` and should now resolve.

### `body-parser` — accepted 2026-07-21, reinstated 2026-07-27, RETIRED 2026-08-23

- **Advisory:** GHSA-v422-hmwv-36x6 — DoS when an invalid `limit` value silently disables
  size enforcement (vulnerable `2.0.0 - 2.2.x`, patched `2.3.0`). Same nested-duplicate
  mechanism as `shell-quote` above, reached via the nested `@appium/base-driver`.
  Accounted for 1 low finding.
- **How it cleared and retirement evidence:** identical to `shell-quote` above and
  measured in the same run — the nested `body-parser` resolves to the patched `2.3.0`,
  and `npm audit` at `origin/main` `8b3d3fb` no longer lists it as an advisory root.
- **If it comes back:** as above — unpinned, so a regression is possible and would be a
  new finding rather than a reinstatement.
- **Watcher:** same `veyrnox-appium-shellquote-watch`, same deletion recommendation.
- Dependabot alert #14 was auto-dismissed (low-severity dev dependency) and should now
  resolve. That dismissal was never the reason for suppression, and is not the reason for
  retirement either.

### `extract-zip` — accepted 2026-08-16, RETIRED 2026-08-22

- **Advisory:** GHSA-jmr9-qjv8-65gv — unvalidated symlink path traversal (CVSS 8.1,
  CWE-22, vulnerable `<= 2.0.1`). Reached the tree dev-only, via the WebdriverIO E2E
  harness: `@wdio/*` → `@wdio/utils` → `@puppeteer/browsers` → `extract-zip`. Accounted
  for 12 high findings.
- **How it cleared:** not an upstream fix — `2.0.1` is still `latest` and still in range.
  `@puppeteer/browsers@3.2.0` had already dropped `extract-zip` (deps are now
  `{yargs, modern-tar}`), but `@wdio/utils@9.30.1` pinned `^2.2.0`. PR #1852 added a
  `package.json` `overrides` entry forcing `@puppeteer/browsers` to `^3`.
- **Retirement evidence — resolved tree plus a real E2E run, per this file's own rule
  that a version number and an npm `fixAvailable` are not evidence:**
  1. `extract-zip` is ABSENT from `origin/main`'s `package-lock.json` (verified
     2026-08-22 at `b8f0127` by resolving the lockfile from the ref, not a working tree).
  2. `npm audit` on that lockfile reports 0 high / 0 critical; the 12 findings are gone,
     not merely suppressed.
  3. The open question was never whether the advisory cleared but whether a semver-MAJOR
     override broke browser-driver launch — invisible to `npm audit`. PR #1852 merged
     2026-08-16 with `e2e-emulator-tests (31, google_apis)`, `web-e2e-tests` and `e2e`
     all SUCCESS, which is the condition the entry set for itself.
  4. The appium subtree was byte-identical across the override, so the
     `--legacy-peer-deps` collateral hazard did not recur.
- **If it comes back:** the override is the only thing holding this. Dropping
  `overrides["@puppeteer/browsers"]`, or `@wdio/utils` widening its own pin in a way that
  re-resolves to `2.x`, reopens all 12 findings. A reappearance is a new finding, not a
  reinstatement — re-derive the chain before assuming this history still applies.
- **No watcher — none needed.** `veyrnox-extract-zip-watch` (weekly, Mondays ~11am) was
  deleted 2026-08-22, on owner instruction, once this entry was retired. Its `SKILL.md`
  survives at `~/.claude/scheduled-tasks/veyrnox-extract-zip-watch/SKILL.md` if the prompt
  is ever wanted back. Note the audit task itself may not delete scheduled tasks (see
  Constraints) — it reports them and the owner acts.
- **Issue #1851 was already closed** as COMPLETED on 2026-08-16, auto-closed by PR #1852
  merging. An earlier draft of this entry said it "can be closed"; that was taken from the
  old entry's `Tracked as issue #1851` line without checking the issue. Stated here because
  it is the same mistake this file keeps recording in other forms: a tracking reference
  ages into a claim about current state. Check the issue, not the line that names it.

### `brace-expansion` — RETIRED 2026-08-22 (never an entry in this file)

Recorded here because it was a real HIGH residual with its own watcher, and because a
reader of this file would otherwise have no trace of it. It was never in the accepted-
residuals list above — its rationale lived only in the watcher's runbook, which is how it
stayed invisible to the daily audit for weeks.

- **Advisory:** GHSA-mh99-v99m-4gvg, HIGH — DoS via unbounded expansion length causing an
  out-of-memory crash. Accounted for ~28-29 of ~32 HIGH findings at its peak.
- **How it cleared:** the advisory was re-scoped into per-line ranges (`< 1.1.17`,
  `>= 2.0.0 < 2.1.3`, `>= 3.0.0 < 3.0.3`, `>= 4.0.0 < 5.0.8`) and the fix was BACKPORTED to
  the old-shape 1.x and 2.x lines. Ordinary range resolution then reached it — no
  `overrides` entry was ever added, and none is needed.
- **Retirement evidence (2026-08-22, `origin/main` at `b8f0127`):** re-resolved lockfile
  carries `1.1.18`, `2.1.4` x5, `5.0.9` x3, all at or above their line's patched floor;
  `npm audit` lists `elliptic` as the sole advisory root, 0 high / 0 critical.
- **The 5.x incompatibility was never fixed — it was routed around.** A `latest` override
  still throws `TypeError: expand is not a function` at `minimatch.js:269`, and 6 of 9
  `minimatch` copies still declare `^1.`/`^2.` ranges. So the old remediation advice
  ("add a `^5.0.8` override") is now actively harmful: it would reintroduce the
  `minimatch`/`eslint` breakage while fixing nothing.
- **Watcher deleted** 2026-08-22. Its runbook is retained at
  `.claude/scheduled-tasks/veyrnox-brace-expansion-watch/SKILL.md`, marked RETIRED, with
  the corrected ranges and the probe method intact.
- **Why it sat unnoticed:** the watcher was rebuilt 2026-07-27 and left DISABLED, so it
  never ran once — no `lastRunAt` at all. Its "Tracked" claim was false for ~4 weeks. If a
  residual's only tracking is a watcher, confirm the watcher is enabled, not merely that it
  exists.

## Constraints
- Do NOT run `npm audit fix` or modify any files — read-only audit only.
- Suppression is a **reporting** decision only. Never edit `package.json`,
  `overrides`, or any repo file to make a finding disappear.
- Do NOT create, edit, or trigger scheduled tasks/watchers from this audit — only
  reference them by name in the report.
- If the project directory doesn't exist or npm fails, output a widget showing the error clearly rather than silently failing.
- Use the Bash tool for the npm command (Git Bash is available on this Windows machine).