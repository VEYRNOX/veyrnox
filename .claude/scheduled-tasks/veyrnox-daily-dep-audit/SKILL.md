---
name: veyrnox-daily-dep-audit
description: Daily npm audit summary for Veyrnox wallet dependencies
---

Run a dependency security audit for the Veyrnox wallet project and present the results as a visual widget.

## Objective
Check the Veyrnox wallet project at `/Users/aljobson/Documents/GitHub/veyrnox` for npm dependency vulnerabilities and display a clear daily summary.

## Steps

1. Audit `origin/main`'s dependency state — **not the shared checkout's working tree**.

   The primary checkout at `/Users/aljobson/Documents/GitHub/veyrnox` is used concurrently
   by ~10 worktrees and several other scheduled tasks, and is frequently on a detached HEAD
   or an unrelated feature branch. Running `npm audit` there audits whatever that branch
   happens to carry — and then reports it as the project's state. Resolve from the ref
   instead:

   ```bash
   cd "/Users/aljobson/Documents/GitHub/veyrnox" && git fetch origin main
   SCRATCH="${TMPDIR:-/tmp}/veyrnox-daily-dep-audit"; rm -rf "$SCRATCH"; mkdir -p "$SCRATCH"
   git show origin/main:package.json      > "$SCRATCH/package.json"
   git show origin/main:package-lock.json > "$SCRATCH/package-lock.json"
   git cat-file -s origin/main:package-lock.json   # must be non-zero, and must match
                                                   # `wc -c` on the written file — an empty
                                                   # or truncated lockfile audits as 0
                                                   # vulnerabilities and looks like good news
   cd "$SCRATCH" && npm audit --json
   ```

   **`SCRATCH` must not be `${TMPDIR}/veyrnox-dep-audit` — that path belongs to the
   WEEKLY task (`veyrnox-dependency-audit`), which uses it as a git WORKTREE.** Renamed
   2026-09-07 after the collision fired. It breaks both ways, and the `rm -rf` above is
   the dangerous direction: if this task runs while a weekly worktree is live there, it
   deletes that worktree — including an uncommitted audit report, which is the exact
   loss the weekly runbook's "push, don't just commit" step exists to prevent. The other
   direction is merely noisy: leftover scratch here makes the weekly `git worktree add`
   fail with `already exists` (observed 2026-09-07, that run aborted at its Step 0).
   Keep the two paths distinct; do not shorten this one back.

   **This block was Windows/Git-Bash until 2026-09-03** and carried an
   `export MSYS_NO_PATHCONV=1` guard, because MSYS rewrote the `:` in
   `git show origin/main:path` and the command failed silently. That guard is a no-op on
   macOS and has been removed. The byte-count check is NOT part of that guard and stays:
   it catches an empty or truncated lockfile from any cause, and a lockfile that audits as
   zero vulnerabilities is indistinguishable from a clean one.

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

**And "the resolved tree" means the INSTALLED tree, not the lockfile — they can
disagree.** Verified 2026-09-06 while fixing the `qs` / `@xmldom/xmldom` advisories
(PR #2384): deleting the two vulnerable entries under
`node_modules/appium-uiautomator2-driver/node_modules/` took `npm audit` from 4 moderate
to 2, and a subsequent `npm ci` reinstalled `qs 6.15.3` and `@xmldom/xmldom 0.9.11` on
disk anyway, with the nested `express` / `plist` still resolving to them. The advisory
went quiet; the code did not move. A `package.json` `overrides` pin to patched versions
was equally inert.

The cause is that **`appium-uiautomator2-driver` publishes its own
`npm-shrinkwrap.json`** (`hasShrinkwrap: true` on its lockfile entry). A published
shrinkwrap outranks both our `package-lock.json` and our `overrides`, so nothing in this
repo can move the contents of that ~257-entry nested subtree except changing which
version of the driver we resolve. This is the single most misleading surface in the whole
dependency tree, because it is the one place where a green `npm audit` is compatible with
the vulnerable package still being installed.

Two consequences worth carrying:
- **For a nested finding under a shrinkwrapped package, the remediation is a version bump
  of the shrinkwrap OWNER**, never an `overrides` entry and never a lockfile edit. In
  #2384 that was `appium-uiautomator2-driver` 8.5.0 → 8.6.1, inside the declared `^8.5.0`
  range, whose shrinkwrap carries the patched `qs 6.16.0` / `@xmldom/xmldom 0.9.12`.
- **Retirement evidence must include an `npm ci` and an on-disk version check**, not only
  an `npm audit` on a resolved lockfile. The retirement evidence recorded for
  `shell-quote` and `body-parser` below is lockfile-only and predates this understanding;
  its conclusion happens to be right (see the corrected mechanism in those entries) but
  the method would not have caught the failure above.

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
  **That arrow is a PATH, not a parentage claim (annotated 2026-09-08, issue #2445).**
  `@keystonehq/bc-ur-registry-eth` has two requirers in the lockfile: the root package,
  via an exact `"0.22.1"` pin in `package.json`, and `keystone-sdk` via `^0.22.0`. npm
  resolves the root's exact pin. Any remediation that bumps only `keystone-sdk` leaves
  `elliptic` resolved — the direct pin has to move too, and it is asserted by
  `src/wallet-core/hw/__tests__/digitalShield.deps.test.js`, so that is a deliberate
  `package.json` + test change.
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
  reachable-API analysis above says no `elliptic` code path is called. If the
  reachability analysis ever stops holding, this entry goes.
- **What each run should DO about that — unambiguous, because the previous wording was
  not.** On 2026-08-25, the day the trigger fired, the audit suppressed NOTHING and
  listed all 5 findings in full, so a reader that day saw the changed blast radius
  rather than a one-line suppression note. **That was a one-off for the day of the
  finding. From 2026-08-26 onward, suppress and state, per step 2a** — this entry is
  under `## Accepted residuals`, its root is `elliptic`, its severity is still low, so
  2a applies with no exception. The earlier wording ("doing that once is honest; doing
  it every day would turn 'accepted residual' into 'permanently ignored'") left "that"
  pointing at either behaviour and made the next run a coin flip; both readings produce
  a defensible-looking widget, which is precisely how a rule stops constraining
  anything. The guard against "permanently ignored" is the revisit-trigger list above
  and the watcher, not a refusal to suppress.
- **Tracked:** `veyrnox-elliptic-upstream-watch`, registered and enabled, weekly on
  Tuesdays 09:34 (not "Mondays ~10am" as this entry claimed until 2026-08-25).
  **Re-pointed at the Keystone chain 2026-08-25 by PR #2084** — its signals are now a
  patched `elliptic` (SIGNAL 1), `secp256k1` dropping `elliptic` (2a), `hdkey` dropping
  `secp256k1` (2b), and `@keystonehq/bc-ur-registry-eth` dropping `hdkey` (2c), each
  firing on a dependency key disappearing rather than a version moving, and its step 0
  re-derives the chain from the lockfile before probing. Until that PR it checked the
  Trezor and Ledger chains, which no longer exist — it could not have fired, while
  still reporting "no upstream movement". Treat the first report under the new brief as
  the confirmation, per the `brace-expansion` lesson below that a watcher existing is not
  evidence it watches the thing you care about.
- **It HAS now run under the new brief — verified 2026-09-06. This bullet said "It has
  not yet RUN under the new brief" until then, and had been false for five days.**
  `lastRunAt` is `2026-09-01T08:51:20Z`, seven days after PR #2084 merged
  (`2026-08-25T09:26:29Z`), so that run resolved the re-pointed runbook. Confirmed the
  runbook on `origin/main` is the Keystone version: it probes SIGNAL 1 / 2a / 2b / 2c and
  documents the Ledger and Trezor chains as retired rather than probing them.
  **Its output HAS now been read — collected 2026-09-08.** This bullet said "What is NOT
  established: what that run actually reported ... the confirmation this entry asks for is
  *available* but not yet *collected*", which was true when written and is now discharged.
  What the 2026-09-01 run reported, verbatim in substance:
  - **Verdict: no upstream movement, no action.** Run against `origin/main` `666effe9`.
  - **Step 0 re-derived the chain from that lockfile and it matched this entry exactly** —
    one requirer only: `secp256k1@4.0.5` (declares `elliptic ^6.5.7`) → `hdkey@2.1.0`
    (declares `secp256k1 ^4.0.0`) → `@keystonehq/bc-ur-registry-eth@0.22.1` (declares
    `hdkey ^2.0.1`), the last being both a direct pin and reached via
    `@keystonehq/keystone-sdk@0.12.3`. `elliptic@6.6.1` resolved. No Ledger/Trezor chain,
    no undocumented chain.
  - **All four signals NOT fired.** SIGNAL 1: `elliptic@latest` = `6.6.1` and the
    published version list ends there — the newest release is inside the advisory range.
    2a: `secp256k1@latest` = `5.0.2`, still declares `elliptic ^6.5.7` (moot regardless —
    `hdkey` pins `^4.0.0`). 2b: `hdkey@latest` = `2.1.0`, = resolved, still declares
    `secp256k1 ^4.0.0`. 2c: `bc-ur-registry-eth@latest` = `0.22.1`, = resolved, still
    declares `hdkey ^2.0.1`. Every link is already at latest published; no upstream
    escape hatch exists.
  **Where to find it, because this cost a search:** the watcher writes NO report file — its
  `## Output` section specifies chat output only. So "read the watcher's report" means
  searching session transcripts (`search_session_transcripts`), not opening a path. That
  asymmetry is exactly what let this entry know *that* it ran for five days without knowing
  *what it said*: `lastRunAt` is queryable state, the verdict is not. The 2026-09-01 run is
  session `local_85b0b5ed-8855-42b1-9b11-c865030ab230`, titled "Veyrnox elliptic upstream
  watch". The scheduler is enabled and the cron is `30 9 * * 2`; for the next fire time read
  `nextRunAt` from `list_scheduled_tasks` rather than any date written here (see the
  bullet below for why).
- **SECOND confirmation, 2026-09-08 — identical on every axis, so the "treat the first
  report as the confirmation" caveat above is now discharged.** The watcher ran at
  `2026-09-08T08:34:09Z` against `origin/main` `53a35f38` (lockfile 1,122,449 bytes) and
  again reported **no upstream movement, no action**. Every probe matched the 2026-09-01
  run at `666effe9` exactly: `elliptic@latest` 6.6.1 with the published list still ending
  there; `secp256k1@latest` 5.0.2 still declaring `elliptic ^6.5.7`; `hdkey@latest` 2.1.0
  still declaring `secp256k1 ^4.0.0`; `bc-ur-registry-eth@latest` 0.22.1 still declaring
  `hdkey ^2.0.1`; `keystone-sdk@latest` 0.12.3. Step 0 re-derived the same four edges with
  `secp256k1 4.0.5` as the sole requirer, and confirmed the `"elliptic": "^6.6.1"` override
  is still present in `package.json`. Nothing moved in seven days.
  That run also surfaced the two-requirer correction now recorded on the Blast-radius
  bullet above ("That arrow is a PATH, not a parentage claim") — same finding, issue
  #2445, stated once there rather than twice here.
- **Its `lastRunAt` moved on 2026-08-25 and that run does NOT count as the
  confirmation.** The scheduler records a run at `2026-08-25T08:52:21Z`; PR #2084 —
  the re-point — merged at `2026-08-25T09:26:29Z`, i.e. **34 minutes later**. The task
  resolves its runbook from `origin/main`, so that run executed the OLD two-chain
  version and probed `@ledgerhq/hw-app-eth` and `@trezor/utxo-lib`, packages absent
  from the tree. Whatever it reported, it cannot have been evidence about the Keystone
  chain. This bullet exists because a bare `lastRunAt` of today's date is exactly the
  thing a future reader will take as "it ran, we're covered" — check the timestamp
  against the merge, not the date against the calendar. That check is the whole point of
  this bullet, and it is what the 2026-09-06 correction above is built on: the
  2026-09-01 run passes it (7 days after the merge), the 2026-08-25 one fails it by 34
  minutes. **This bullet used to end "The next genuine run is Tue 2026-09-01 09:34" — a
  forward-looking date, which is the one kind of claim guaranteed to go stale on its own
  with nothing to signal it.** Do not write the next scheduled date down here; read
  `nextRunAt` from `list_scheduled_tasks`, which is the only copy that updates itself.
- **Note:** the old `@ledgerhq/hw-app-eth@6.40.3` `fixAvailable` warning is retired
  with the Ledger chain. Kept as one line in case Ledger support returns: that version
  is a major *downgrade* and still declares `@ethersproject/*` v5, so it never cleared
  this advisory. Evaluated and rejected 2026-07-19.

### `braces` — max severity: high — accepted 2026-10-03

- **Advisory:** GHSA-vfj7-8cjw-p6xm (CVSS 7.5, CWE-674) — stack-exhaustion Denial of
  Service through deeply nested brace patterns. Vulnerable `<= 3.0.3`. Published
  2026-09-18; first reported by this audit on 2026-10-03.
- **Why accepted — there is no patched release.** `3.0.3` is `latest` and the last
  published version (checked 2026-10-03), and the GitHub advisory record carries
  `first_patched_version: null`. No range resolution and no `overrides` entry can reach
  a fix that does not exist. npm's `fixAvailable` is `true` on every finding and is not
  a fix on any of them: it offers `tailwindcss` `4.3.3` (a semver-major framework
  migration), `patch-package` `6.0.7` and `@wdio/mocha-framework` `5.18.6` (both major
  DOWNGRADES).
- **Chains — three, all through one root copy, `node_modules/braces@3.0.3`:**
  1. `tailwindcss@3.4.19` (direct, listed under `dependencies`) → `micromatch@4.0.8` /
     `fast-glob@3.3.3` / `chokidar@3.6.0` → `braces`.
  2. `@wdio/mocha-framework@9.32.0` (direct, dev) → `mocha@10.8.2` → `chokidar@3.6.0` →
     `braces`. `@wdio/mocha-framework` declares `mocha ^10.8.2`; mocha only left
     `chokidar` 3 in later majors, outside that range.
  3. `patch-package@8.0.1` (direct, dev; runs as `postinstall`) →
     `find-yarn-workspace-root@2.0.0` → `micromatch` → `braces`. `8.0.1` is `latest`.
- **Reachability — build and test tooling only, and the patterns are ours.** npm counts
  chain 1 as production because `tailwindcss` sits in `dependencies`, but Tailwind runs
  at build time as a PostCSS plugin. The patterns `braces` expands are the `content`
  globs in `tailwind.config.js`, mocha's watch globs and `patch-package`'s workspace
  lookup: all repo-controlled, none attacker-supplied. The realistic impact is a
  developer crashing their own build.
  **Measured 2026-10-03 at `origin/main` `238ce2bb`, not assumed:** nothing under `src/`,
  `functions/` or `supabase/` imports `braces`, `micromatch`, `chokidar` or `fast-glob`;
  and a production `npm run build` was grepped across all 557 `dist/assets/*.js` chunks
  for `micromatch`, `fast-glob`, `chokidar`, `picomatch`, `fill-range`, `to-regex-range`
  and `expandRange` — zero matches for all seven (control: `ethers` matches 12 chunks).
  The word `braces` matches exactly one chunk, as prose ("belt-and-braces") in a
  sanctions-source label, not the library.
- **Accounts for** 9 high findings as of 2026-10-03 at `origin/main` `238ce2bb`:
  `braces` as the advisory root, plus `micromatch`, `fast-glob`, `chokidar`,
  `tailwindcss`, `mocha`, `@wdio/mocha-framework`, `find-yarn-workspace-root` and
  `patch-package` as dependents. A count that moves for an unexplained reason is a
  revisit trigger.
- **Revisit trigger:** a patched `braces` release ships (then it is a plain lockfile
  update: `micromatch` declares `^3.0.3`, `chokidar` `~3.0.2`); OR the advisory is
  re-rated; OR a chain drops it (Tailwind 4 adoption, `@wdio/mocha-framework` admitting a
  mocha major that uses `chokidar >= 4`, `patch-package` dropping
  `find-yarn-workspace-root`); OR any code in `src/`, `functions/` or `supabase/`, or any
  runtime dependency, starts importing `braces`/`micromatch` on user- or
  network-supplied patterns — re-run the bundle grep above before assuming it still
  holds.
- **Tracked:** not tracked — no watcher. This audit may not create one (see
  Constraints); the owner decides whether one is worth adding. Until then the only
  thing that will notice a patched `braces` is someone reading the advisory.

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
  ever added. The nested subtree was re-resolved and now duplicates PATCHED copies instead
  of vulnerable ones. Note the shape of that: the entry's own condition 1 — "the nested
  `@appium/support` key disappears" — never fired and was the wrong trigger. The key is
  still there; its contents changed underneath it. That is exactly why conditions 2, 3 and
  4 were added after the 2026-07-27 false positive, and all three are what fired here.
- **CORRECTED 2026-09-06 — "a side effect of routine lockfile regeneration" was the wrong
  mechanism, and the right one changes what to do if this recurs.** The nested contents
  are not reached by ordinary range resolution at all: `appium-uiautomator2-driver`
  publishes an `npm-shrinkwrap.json`, so the subtree is whatever the resolved DRIVER
  version pins. Measured across this entry's own history — nested `shell-quote` tracks the
  driver version one-to-one at every point:

  | commit | driver | nested `shell-quote` |
  |---|---|---|
  | `87e9897b` | 8.2.0 | 1.10.0 (patched) |
  | `ff78ac99` | 8.1.2 | 1.8.4 (vulnerable) |
  | `0295fd40` | 8.2.1 | 1.10.0 (patched) |
  | `8b3d3fb` (retirement) | 8.4.0 | 1.10.0 |
  | `7d28be38` (2026-09-06) | 8.5.0 | 1.10.0 |
  | `e17a200e` (after #2384) | 8.6.1 | 1.10.0 |

  So the "transient regression" described below was a driver **downgrade** 8.2.0 → 8.1.2
  and the restore was a bump to 8.2.1 — not the lockfile churning of its own accord. The
  retirement conclusion is unaffected; only the explanation was wrong.
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
  was still registered and enabled on 2026-08-23. A retirement recorded in one file and
  not the other is indistinguishable from no retirement at all to whichever reader opens
  the other file. If you retire a residual, change every place that names it in the same
  commit.
- **The watcher IS gone now — verified 2026-09-06, and that makes three different states
  this one line has claimed.** `veyrnox-appium-shellquote-watch` is absent from the
  scheduler registry. First this file's sibling note said it was deleted when it was not
  (2026-08-03), then this bullet said it was still registered when that was true
  (2026-08-23), and then it kept saying so after the deletion actually happened. The date
  of the deletion is unrecoverable — the scheduler registry is not in git — so it is
  recorded here as "gone by 2026-09-06" rather than guessed. Both `SKILL.md` copies
  survive as intended: the loader at
  `~/.claude/scheduled-tasks/veyrnox-appium-shellquote-watch/SKILL.md` and the real
  runbook on `origin/main` under `.claude/scheduled-tasks/`.
  **The general lesson is about the shape of the claim, not this watcher.** "X is
  registered" is state living somewhere this repo cannot see, so it decays with no
  signal and no diff. Re-derive it from `list_scheduled_tasks` before acting on it, the
  same way a claim about another PR's status has to be re-read rather than trusted.
- **If it comes back:** *we* are not pinning this — no `overrides` entry holds the nested
  subtree at patched versions, and it could regress (it already did once, transiently, on
  2026-07-29: patched at `87e9897b`, back to `1.8.4` at `ff78ac99` 12 minutes later,
  restored at `0295fd40`). A reappearance is a NEW finding that must surface normally, not
  a reinstatement of this entry — re-derive the chain before assuming this history applies.
  **This bullet read "nothing is pinning this" until 2026-09-06, which is false and points
  at the wrong fix.** Something *is* pinning it: `appium-uiautomator2-driver`'s published
  shrinkwrap (see the corrected mechanism above). That distinction is the actionable part —
  if this regresses, an `overrides` entry CANNOT fix it and a lockfile edit only quiets
  `npm audit`; the fix is a driver version bump. Confirm with `npm ci` and an on-disk
  version check, not with the audit.
- **Watcher:** `veyrnox-appium-shellquote-watch` produced this retirement, became
  redundant, and is now **DELETED** — confirmed absent from the scheduler on 2026-09-06.
  Both `SKILL.md` copies were retained, the way `veyrnox-extract-zip-watch`'s were, in
  case the prompt is wanted back. Nothing further is owed here; the daily audit is what
  covers a regression now, and it surfaces nested findings unsuppressed (it did exactly
  that for `qs` / `@xmldom/xmldom` on 2026-09-06). This bullet read "recommend deleting
  the scheduled task ... so the owner acts" after the deletion had already happened —
  see the corrected drift bullet above.
- Dependabot alert #12 was dismissed as `tolerable_risk` and should now resolve.

### `body-parser` — accepted 2026-07-21, reinstated 2026-07-27, RETIRED 2026-08-23

- **Advisory:** GHSA-v422-hmwv-36x6 — DoS when an invalid `limit` value silently disables
  size enforcement (vulnerable `2.0.0 - 2.2.x`, patched `2.3.0`). Same nested-duplicate
  mechanism as `shell-quote` above, reached via the nested `@appium/base-driver`.
  Accounted for 1 low finding.
- **How it cleared and retirement evidence:** identical to `shell-quote` above and
  measured in the same run — the nested `body-parser` resolves to the patched `2.3.0`,
  and `npm audit` at `origin/main` `8b3d3fb` no longer lists it as an advisory root.
- **If it comes back:** as above — not pinned BY US, so a regression is possible and would
  be a new finding rather than a reinstatement. Same correction as `shell-quote`
  (2026-09-06): the nested copy is pinned by `appium-uiautomator2-driver`'s published
  shrinkwrap, so the fix for a regression is a driver bump, not an `overrides` entry.
- **Watcher:** same `veyrnox-appium-shellquote-watch` — deleted, confirmed 2026-09-06.
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

### `morgan` — max severity: moderate — accepted 2026-09-09, RETIRED 2026-10-01

- **Advisory:** GHSA-jxfw-x594-9x9m — log forging via unescaped Unicode line separators.
  A request field that reaches a log line can carry U+2028/U+2029, which several log
  viewers treat as a line break, so an attacker-influenced request can forge additional
  log entries. Vulnerable `< 1.12.0`; the tree carried `1.11.0`.
- **Chain — dev-only, and TWO copies that behaved differently.** Both were reached through
  the appium E2E harness:
  - **root** `node_modules/morgan`, required by `@appium/base-driver@10.8.0`;
  - **nested** `node_modules/appium-uiautomator2-driver/node_modules/morgan`, inside that
    driver's published shrinkwrap.
- **Accounted for** 7 moderate findings as of 2026-09-09 at `origin/main` `2d97a064`
  (`morgan` as the advisory root, plus `@appium/base-driver`, `@appium/base-plugin`,
  `appium`, `appium-android-driver`, `appium-chromedriver` and
  `appium-uiautomator2-driver` as dependents).
- **How it cleared — two independent PRs, each clearing one copy:**
  1. **Root copy — PR #2786 (dependabot, merged):** bumped `appium` `3.7.0` → `3.8.0` and
     `morgan` `1.11.0` → `1.12.1`. `@appium/base-driver` moved to `10.8.1`, which declares
     `morgan: "1.12.1"` (patched) as its own `dependencies` entry — the exact-pin blocker
     from the acceptance writeup was removed by the upstream bump, not routed around.
  2. **Nested copy — PR #2800 (owner, merged):** repointed `appium-uiautomator2-driver` in
     `package.json` from the npm-registry range `^8.7.0` to a pinned git source —
     `git+https://github.com/appium/appium-uiautomator2-driver.git#7a54db007aa8a44f5df21cd0b52afc13c0d277ae`.
     npm installs a git dependency by building the ref directly rather than fetching the
     published tarball, so the published `npm-shrinkwrap.json` — the mechanism that pinned
     the nested copy and outranked both `package-lock.json` and `overrides` — is never
     consulted at all. This is not a driver version bump; it is removal of the shrinkwrap
     pinning mechanism itself, which the original "only a driver bump clears this" revisit
     trigger did not anticipate.
- **Retirement evidence (2026-10-01, `origin/main` `a51d1707`, `npm ci` in a fresh
  worktree — per this file's own rule that an `npm audit` verdict is not evidence):**
  1. `node -e "console.log(require('./node_modules/morgan/package.json').version)"` →
     `1.12.1`.
  2. `find node_modules -type d -name morgan` → exactly one match
     (`node_modules/morgan`); no `node_modules/appium-uiautomator2-driver/node_modules/morgan`.
  3. `npm audit --json` on the installed tree: `morgan` absent from the `vulnerabilities`
     object entirely; 0 moderate-or-above findings anywhere (down from the 7 this entry
     accounted for). The tree carries only pre-existing low-severity findings unrelated to
     this chain.
- **If it comes back:** both fixes depend on state that can regress independently.
  `@appium/base-driver` re-pinning `morgan` below `1.12.0` reopens the root copy;
  `appium-uiautomator2-driver` reverting from the git source back to a registry range
  reopens the nested copy (and brings its shrinkwrap pinning mechanism back with it). A
  reappearance is a new finding — re-derive the chain rather than assuming this writeup
  still applies.
- **Watcher:** `veyrnox-morgan-upstream-watch` (weekly) was built to watch for exactly the
  upstream movement that has now landed. Flagged as an open follow-up (not acted on here,
  per this file's own constraint that the daily audit must not create, edit, or trigger
  scheduled tasks) to decide whether it should be disabled or repurposed now that there is
  no more upstream movement left to watch for.

### `stream-json` — max severity: moderate — accepted 2026-09-03, RETIRED 2026-10-03

- **RETIRED 2026-10-03. Everything below this bullet is the acceptance-era record, kept
  as written; where it says "keep this residual accepted" or "Tracked", read it as
  history.** The candidate described in the next bullet landed as PR #2799
  (`f52f7a4e`): `package.json` scopes `@solana/web3.js` to `jayson` `5.0.0`, which has no
  `stream-json` dependency at all.
  **Retirement evidence (2026-10-03, `origin/main` `238ce2bb`, `npm ci` in a fresh
  worktree, per this file's rule that the INSTALLED tree is the evidence):**
  1. `find node_modules -type d -name stream-json` → no match anywhere.
  2. Exactly one installed `jayson`, `node_modules/jayson`, version `5.0.0`.
  3. `npm audit --json` on the installed tree: `stream-json`, `jayson` and
     `@solana/web3.js` are all absent from `vulnerabilities`; 0 moderate findings.
  **If it comes back:** the scoped `jayson` override is the only thing holding this —
  `@solana/web3.js` `1.99.0` still declares `jayson ^4.3.0`. Dropping the override, or a
  Solana bump that changes how the scope applies, reopens all 3 findings. A reappearance
  is a NEW finding that surfaces normally, not a reinstatement.
  **Watcher:** `veyrnox-stream-json-upstream-watch` has nothing left to watch. It was
  DISABLED in the scheduler on 2026-10-03 by the session that wrote this retirement, on
  the owner's instruction; its runbook is retained and marked RETIRED. As everywhere in
  this file, confirm with `list_scheduled_tasks` rather than trusting this line.

- **Candidate remediation, 2026-09-30; not a retirement or merge claim.**
  Published `jayson@5.0.0` removes `stream-json` entirely. The scoped
  `@solana/web3.js` override in this candidate selects that exact release and removes
  the obsolete Jayson UUID override. Solana `1.99.0` still declares `jayson ^4.3.0`,
  so ordinary resolution cannot select it. Jayson 5 requires Node >=20 and changes
  server stream framing; Solana uses its browser client, whose request IDs now use
  Web Crypto (`randomUUID`, falling back to `getRandomValues`). Regression coverage
  in `src/wallet-core/__tests__/sol-rpc-dependency.test.js` exercises real Connection
  HTTP single/batch/error paths and WebSocket subscriptions on loopback, plus the
  browser client's HTTP notifications (Connection has no HTTP notification API).
  Local candidate evidence: `npm ci` passed; Solana resolves installed Jayson 5.0.0
  and a recursive installed-manifest scan found no `stream-json`. All nine new
  compatibility tests passed, including browser-entry `getRandomValues` fallback
  and missing-crypto failure before transport. The existing Solana suite, core
  typecheck, targeted lint and `npm run build:release` passed. Only four lockfile
  package entries change (Jayson, plus removed eyes/stream-chain/stream-json);
  all bundled entries remain byte-for-byte equivalent as parsed JSON.
  Keep this residual accepted on main until the change lands and its installed
  dependency tree is checked. No on-chain transaction, real-device verification,
  independent audit, or feature-status promotion is claimed. The historical
  no-fix rationale below describes the Jayson 4 chain; it does not rule out this
  newly available owner migration. The bundled Appium residuals are unaffected.

- **Advisory:** GHSA-528h-pc64-c93x — `pick`/`ignore`/`filter`/`replace` filters are
  O(depth²) on nested input, so small crafted JSON blocks the event loop for seconds to
  minutes (DoS). Vulnerable `<= 3.4.0`; the tree carries `1.9.1`.
- **Chain:** `@solana/web3.js@1.99.0` → `jayson@4.3.0` → `stream-json@1.9.1`. A production
  dependency, not dev. The head of the chain read `1.98.4` from acceptance until
  2026-09-19; `jayson` and `stream-json` have not moved.
- **`jayson` is not separately vulnerable.** It has no advisory of its own and appears in
  `npm audit` only as `stream-json`'s `effects` entry. Fixing `stream-json` clears both;
  there is nothing to do to `jayson` itself.
- **Why accepted — no reachable fix, and the obvious one is actively harmful.**
  1. **No backport.** `1.9.1` is the last release on the 1.x line and the fix landed only
     in `3.5.0`. `jayson` declares `stream-json: ^1.9.1`, so no range resolution reaches a
     patched version. This is NOT the `brace-expansion` shape, where the fix was
     backported into the old lines and ordinary resolution picked it up.
  2. **An `overrides` entry to `^3.6.0` BREAKS `jayson`. Measured 2026-09-03, do not
     re-derive.** `stream-json` 3.x removed the `streamers/` tree entirely — there is no
     `StreamValues` file at any path in `3.6.0` — while
     `jayson/lib/utils.js:3` still does `require('stream-json/streamers/StreamValues')`.
     Under the override, `require('jayson')` throws
     `Cannot find module .../stream-json/src/streamers/StreamValues`.
     **`npm run build` still exits 0 and `npm audit` gets CLEANER (4 moderate → 2), so a
     green build and a quiet audit are NOT evidence this override is safe.** Same trap as
     the retired `brace-expansion` entry, which is worth re-reading before touching this.
  3. **The vulnerable code is not reachable in any build of this app.** Every
     `@solana/web3.js` entry point — `index.browser.cjs.js`, `index.browser.esm.js`,
     `index.cjs.js`, `index.esm.js`, `index.native.js` — imports
     `jayson/lib/client/browser`. That module's complete require closure is two files
     (`client/browser/index.js`, `generateRequest.js`) plus `uuid`; it never reaches
     `lib/utils.js`, the only file in `jayson` that touches `stream-json`. Verified
     empirically as well as by reading: a production build was grepped across all 544
     `dist/assets/*.js` chunks for `stream-json`, `streamValues`, `makeFilter` and
     `jsonFilter` — **zero matches for all four**.
     **Re-verified against `1.99.0` on 2026-09-19, because this whole acceptance rests on
     it and the chain head moved a minor.** The published `1.99.0` tarball was unpacked and
     all five entry points still import `jayson/lib/client/browser` and nothing else;
     `lib/*.js` carries no `require('jayson')` or `from 'jayson'` at any path, so the main
     entry — the only route to `lib/utils.js` and thus to `stream-json` — is still never
     loaded. The bundle grep above was NOT re-run; the import-graph check is what was
     redone. A future minor bump earns the same check rather than inheriting this one.
- **Accounts for** 3 moderate findings as of 2026-09-19 at `origin/main` `62b46df2`
  (`stream-json` as the advisory root, plus `jayson` and `@solana/web3.js` as dependents).
  **It was 2 on 2026-09-03, and the reason the count moved is the only interesting part.**
  No new advisory and no severity change: `@solana/web3.js` resolved up from `1.98.4` to
  `1.99.0`, which lands inside npm's flagged-dependent range
  (`1.99.0-beta.0 - 1.99.0`), so the chain head is now reported as a finding in its own
  right rather than only as an `effects` entry. Per the `elliptic` entry's rule, a count
  that moves for an unexplained reason is a revisit trigger — this one is explained, and
  re-derived from `npm audit --json` rather than assumed.
- **Revisit trigger:** `jayson` removes `stream-json` (FIRED by 5.0.0; evaluate the
  major-version compatibility and Solana range before adoption); OR `jayson` widens
  its `stream-json` range to admit `>= 3.5.0` (then
  the fix is a plain lockfile update, no override); OR `stream-json` backports the fix to
  a 1.x release; OR `@solana/web3.js` drops `jayson`; OR any code in `src/` or any new
  dependency imports `jayson`'s main entry rather than `jayson/lib/client/browser`, which
  would both make the advisory reachable AND be broken by the override — check the bundle
  grep above before assuming either still holds.
- **Tracked:** `veyrnox-stream-json-upstream-watch`, weekly. Added 2026-09-10; this entry
  said **Not tracked — no watcher** from acceptance until then. Its runbook lands in the
  same PR as this line; the scheduler registration is separate, because the task resolves
  its runbook from `origin/main` and registering it first would give it nothing to resolve.
  **The scheduler registry is not in git, so this line is exactly the kind of claim this
  file keeps recording as decaying silently** — confirm with `list_scheduled_tasks` (check
  `enabled`, and check `lastRunAt` against the merge time of any runbook change) rather
  than trusting it. See the `brace-expansion` entry for a watcher whose "Tracked" claim was
  false for four weeks because it was registered DISABLED and never ran once, and the
  `elliptic` entry for one whose `lastRunAt` predated its own re-pointed brief by 34
  minutes.

### `brace-expansion` (nested, `appium-uiautomator2-driver`) — max severity: high — accepted 2026-09-30, RETIRED 2026-10-03

- **RETIRED 2026-10-03. Everything below this bullet is the acceptance-era record, kept
  as written.** The nested copy no longer exists. PR #2800 (`2fb40065`) repointed
  `appium-uiautomator2-driver` from the registry tarball to a pinned git source
  (`#7a54db007aa8a44f5df21cd0b52afc13c0d277ae`), which is not built with
  `bundleDependencies`, so the subtree this entry called immutable is resolved by our own
  lockfile like any other dependency. Same mechanism as the `morgan` retirement below.
  **Retirement evidence (2026-10-03, `origin/main` `238ce2bb`, `npm ci` in a fresh
  worktree):**
  1. `node_modules/appium-uiautomator2-driver/node_modules/` holds 18 entries and none
     is `brace-expansion`.
  2. Every installed copy is at or above its line's patched floor: root `1.1.21`;
     `2.1.7` under `filelist`, `mocha`, `@wdio/config`; `5.0.12` under `glob`, `eslint`,
     `@eslint/config-array`, `readdir-glob`. No `5.0.9` anywhere.
  3. `npm audit --json` on the installed tree: `brace-expansion` is absent from
     `vulnerabilities`.
  **If it comes back:** reverting the driver from the git source to a registry range
  brings the bundle, and whatever `brace-expansion` it carries, back with it. A
  reappearance is a NEW finding that surfaces normally.
  **Watcher:** none existed, none needed.

- **Advisory — three GHSAs stacked on the same version:** `GHSA-q2hr-2g5m-vwhr` (moderate,
  quadratic-time `{a},b}` expansion, patched `>=5.0.12` on this line), `GHSA-qhr7-859c-m2p7`
  (high, DoS via unbounded recursion on nested brace groups, patched `>=5.0.11`), and
  `GHSA-6j4f-fj2g-mc7p` (high, DoS via unbounded recursion in `parseCommaParts`, patched
  `>=5.0.10`). The resolved copy is `5.0.9`, below all three floors, so it carries the
  worst of the three: high.
- **Chain — verified 2026-09-30 with `npm ls brace-expansion --all`, entirely inside a
  bundled devDependency:** `appium-uiautomator2-driver@8.7.0` (bundled) →
  `appium-adb@16.0.5` (bundled) → `@appium/support@7.2.7` → `glob@13.0.6` →
  `minimatch@10.2.6` → `brace-expansion@5.0.9`. This is deeper than earlier notes on this
  same path assumed (they didn't need the full chain because the remediation — a driver
  bump — doesn't depend on it); recorded here so a future run doesn't have to re-derive it
  from scratch.
- **Why accepted — the immobilising mechanism changed, and the practical answer didn't.**
  Through driver `8.6.1`, this nested subtree was governed by a published
  `npm-shrinkwrap.json` (see the `appium-uiautomator2-driver` mechanism note under
  `## Retired residuals` → `shell-quote`, and `package.json`'s
  `//overrides-audit-notes`). **At `8.7.0` that shrinkwrap is gone — verified 2026-09-30:
  no `npm-shrinkwrap.json` in the installed tarball, and `hasShrinkwrap` is absent from
  this lockfile entry.** The driver now ships the same subtree via `bundleDependencies`
  instead (`@appium/css-locator-to-native`, `appium-adb`, `appium-android-driver`,
  `appium-uiautomator2-server`, `asyncbox`, `axios`, `io.appium.settings`, `portscanner`,
  `teen_process`), which is equally immutable from this repo: neither `overrides` nor a
  `package-lock.json` edit can reach inside a bundled dependency's own `node_modules`.
  **Tested directly, not assumed:** an `overrides["brace-expansion"] = "^1.1.21"` entry
  was added and regenerated with `npm install --package-lock-only` — every OTHER copy in
  the tree moved to `1.1.21`, and this one nested copy stayed at `5.0.9`. The entry was
  reverted (never committed) once that confirmed it. The remediation is therefore
  unchanged in shape from the shrinkwrap era — bump the driver — and `8.7.0` is already
  `latest`, checked 2026-09-30 (`8.6.1` → `8.6.2` → `8.6.3` → `8.6.4` → `8.7.0`, nothing
  newer published).
- **Reachability:** dev-only. `appium-uiautomator2-driver` is a devDependency used only by
  the Android E2E harness (`android:test*` scripts). The whole chain lives inside
  `node_modules/appium-uiautomator2-driver`'s own bundle and is never imported by `src/`
  or reached by the production `vite build` — confirmed by the same build that shipped
  PR #2783 (`npm run build` succeeded with this copy still at `5.0.9`, because it was
  never in the bundle graph to begin with).
- **Accounts for** 1 high finding as of 2026-09-30 (single node:
  `node_modules/appium-uiautomator2-driver/node_modules/brace-expansion`) — the only
  survivor after PR #2783 cleared the other 10 nested/root `brace-expansion` copies (root,
  `@eslint/config-array`, `@wdio/config`, `archiver-utils`, `eslint`, `filelist`, `glob`,
  `mocha`, `readdir-glob`, `webdriverio`) with a plain `npm install --package-lock-only` —
  every one of those resolved to a patched version already inside its consumer's existing
  declared range, so none of them needed an override either. Those 10 were a **regression**
  of the `brace-expansion` entry retired 2026-08-22 under `## Retired residuals`: the
  lockfile had drifted back to unpatched floors (`1.1.18`, `2.1.4`, `5.0.9`) even though
  every declared range already permitted the patched version. Per that entry's own "if it
  comes back" clause, the regression surfaced as a normal unsuppressed finding rather than
  a silent reinstatement — this entry covers only what's left after fixing it.
- **Revisit trigger:** a newer `appium-uiautomator2-driver` release ships whose bundle
  carries `brace-expansion >= 5.0.12`; OR the driver stops bundling this subtree and goes
  back to a resolvable dependency (shrinkwrapped or plain); OR any of the three advisories
  is re-rated; OR the chain shortens (`appium-adb` or `@appium/support` drops
  `glob`/`minimatch`); OR the Android E2E harness is dropped from `devDependencies`
  entirely. On any of these, re-derive the chain with `npm ls brace-expansion --all`
  first — per this file's own rule, retire only once the vulnerable package is actually
  gone from the INSTALLED tree, not merely absent from a version number or a `fixAvailable`
  flag.
- **Tracked:** not tracked — no watcher. None of the three existing dep-audit watchers
  (`elliptic`, `stream-json`, `morgan`) cover this chain, and this audit may not create one
  (see Constraints) — it reports the gap, the owner decides whether one is worth adding.
- **Cross-reference:** also noted in `package.json`'s `//overrides-audit-notes` (search
  `appium-uiautomator2-driver`). That 2026-08-10 note already tracked this exact nested
  path at `5.0.9` and called it settled — correctly, against the two advisories known at
  the time (`GHSA-mh99-v99m-4gvg`, `GHSA-rgw5-rvv9-x895`). It stopped being settled when
  `GHSA-qhr7-859c-m2p7` and `GHSA-6j4f-fj2g-mc7p` were published afterward against the same
  version. If either file is updated for this chain, update the other in the same
  commit — see the `shell-quote`/`body-parser` entries under `## Retired residuals` for
  what three weeks of drift between these two files looks like.

## Constraints
- Do NOT run `npm audit fix` or modify any files — read-only audit only.
- Suppression is a **reporting** decision only. Never edit `package.json`,
  `overrides`, or any repo file to make a finding disappear.
- Do NOT create, edit, or trigger scheduled tasks/watchers from this audit — only
  reference them by name in the report.
- If the project directory doesn't exist or npm fails, output a widget showing the error clearly rather than silently failing.
- Use the Bash tool for the npm command (zsh on macOS).
