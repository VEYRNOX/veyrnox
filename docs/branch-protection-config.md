# `main` branch-protection change log

Durable record of changes to what gates a merge into `main`, with the exact payload needed
to restore each prior state.

**Why this file exists.** The 2026-08-08 `strict` change recorded its backup at
`%TEMP%\veyrnox-protection-backup\main-protection-before.json` — a path that does not
survive a reboot and is not visible to anyone else. A rollback plan that only exists on one
machine's temp directory is not a rollback plan. Prior JSON goes here instead.

**Read both layers before concluding anything.** `main` is gated by ruleset
`Veyrnox Code Review` (`17946638`) AND classic branch protection, and neither is uniformly
the tighter one. The effective gate is the UNION.

```bash
gh api repos/VEYRNOX/veyrnox/rulesets/17946638
gh api repos/VEYRNOX/veyrnox/branches/main/protection
gh api repos/VEYRNOX/veyrnox/rulesets   # lists BOTH rulesets; querying one hides the other
```

See CLAUDE.md's two-layer note for the current context table and the traps
(`staging-gate`'s docs-only escape hatch, the `okx-candles` flake, why `--admin` is a
regression signal rather than a workflow).

---

## 2026-09-19 — decision: `xcuitest` advisory residual ACCEPTED, #2543 closed

**Change.** None, again. `xcuitest` is not a required context on either layer and is not
being added. What changed is the *status of the question*: the 2026-09-14 entry below
left it open pending stability data. The data now exists, and the owner has accepted the
residual rather than pay for the fix.

**The data.** 43 runs created after the warm-up removal (`1578c5608a`, #2573, merged
2026-09-14T14:27Z): 29 success, 8 failure, 4 cancelled, 2 in progress — **37
non-cancelled**.

| window | completed | failures | rate |
|---|---|---|---|
| since #2481, measured 2026-09-13 | 40 | 15 | 37.5% |
| since warm-up removal, measured 2026-09-19 | 37 | 8 | 21.6% |

**The improvement is real-looking and not demonstrated.** Two-proportion test on those
two windows gives z = 1.52, two-sided p = 0.128; the Wilson 95% interval on the current
rate is 11.4%–37.2%, whose upper bound still contains the old rate. Do not write this up
as "materially improved" — write it as "observed to roughly halve, with n too small to
exclude no change".

**All 8 failures classified from `xcodebuild-log` artifacts.** Three signatures, all
harness or runner:

1. PinSetup never advances past 'Choose an 8-digit PIN' — 5 of 8. The assertion at
   `AppUITests.swift:388` states in its own message that this is a harness failure
   against a slow WKWebView and not evidence about secure-store handling.
2. `Failed to terminate com.veyrnox.app:<pid>` at `AppUITests.swift:40` — 2 of 8.
3. `Timed out while evaluating UI query` — 2 occurrences (one run hit both 2 and 3).

Two absences matter as much as the signatures. **The #2477 entry-tile wait has not
recurred once in 37 runs**, and **the security assertion has not failed once** — the
`XCTAssertTrue ... must fail closed with a visible error banner` signature from run
34622660295, the only non-harness item in #2543, does not appear in this window. Nothing
in these failures is evidence about the fail-closed path.

**Why accepted rather than fixed.** Every remaining failure is a slow or wedged
CoreSimulator on the standard macOS runner — the same two tests swing from 76 s to 558 s.
The alternative on the table was a larger paid macOS runner; the owner declined the spend
on 2026-09-19 and accepted the residual. This extends the same reasoning as the #1960
Play Pre-launch waiver (2026-09-04) and the FTL Robo waiver (2026-09-10): an automated
gate that fails for infrastructure reasons is kept as a signal, not a gate, and the
release evidence is the owner's stock-device walkthrough.

**Promotion criterion — UNCHANGED and still unmet.** The 2026-09-14 rule below stands: 20
*consecutive* clean completed runs, any failure resetting the count. 8 failures in the
last 37 runs means the count has never got near it. Accepting the residual is not a
weakening of that bar; it is a decision to stop waiting at it.

**What would reopen this.** A failure signature that is not one of the three above,
particularly any failure of a fail-closed assertion — that is an app finding, not runner
noise, and `xcuitest` being advisory is exactly the condition under which such a
regression would be ignored. Read the test-level `error:` line in `xcodebuild-log` before
dismissing any new red run.

---

## 2026-09-14 — decision: `xcuitest` stays advisory (no change)

**Change.** None. `xcuitest` (`.github/workflows/ios-xcuitest-smoke.yml`) is NOT a
required context on either layer, and it is not being added. Verified 2026-09-14:
the ruleset `17946638` requires `verify`, `mainnet-flag-gate`, `unit-tests`,
`Release-cert guard rejects wrong fingerprints` and `staging-gate`, and classic protection
requires `verify`, `unit-tests` and `Release-cert guard rejects wrong fingerprints`.

**Why.** Recorded for #2543. After the harness fixes (#2544, #2545, #2557), stability is
not demonstrated:

| window | completed runs | pass | failures |
|---|---|---|---|
| before #2544 (since #2481) | 40 | 25 | 15 (37.5%), five test-level signatures |
| #2544/#2545, before #2557 | 15 | 11 | 2 simulator warm-up timeouts, plus 2 `npm ci` ERESOLVE (the ESLint 10 bump in #2555, not iOS) |
| with #2557 | 2 | 1 | 1 wedged-CoreSimulator warm-up recovery (run 34777838366, fix in #2560) |

None of the five test-level signatures recurred after #2544. The remaining failures are
all simulator provisioning. A required check that fails for runner reasons blocks every
PR and trains `--admin`, which this repo treats as a regression signal.

**Promotion criterion.** Add `xcuitest` to BOTH layers only after 20 consecutive
completed `xcuitest` runs across `main` and PRs pass with no simulator or provisioning
failure. Count from the warm-up removal (#2543 experiment, 2026-09-14): #2560's warm-up
recovery no longer exists, so runs before that change do not count. Any failure inside the window resets the
count. Even 20 clean runs only rules out a failure rate above about 14% (95% confidence,
rule of three). Ruling out 5% takes about 60.

**Apply.** To promote, add `{"context": "xcuitest"}` to the ruleset's
`required_status_checks` and to the classic `required_status_checks.checks` array in the
same session, and record it here.

---

## 2026-08-21 — retire stale `web-e2e-tests` gate

**Change.** Removed `web-e2e-tests` from both protection layers:

- ruleset `17946638` required checks
- classic `main` branch protection required checks

**Why.** By 2026-08-21 there was no active workflow job or required pipeline lane
reporting a `web-e2e-tests` status. Keeping it in branch protection blocked mobile PRs
behind a check they could never satisfy. The deployed-preview lane still runs
`e2e/staging-smoke.spec.js`, but that is a scoped smoke check inside `deploy-preview.yml`,
not a standalone `web-e2e-tests` pipeline.

**Result.** The effective required-check union returned to the checks that actually report:

- `verify`
- `mainnet-flag-gate`
- `unit-tests`
- `Release-cert guard rejects wrong fingerprints`
- `staging-gate`

**Follow-through.** Comments in `deploy-preview.yml` and `e2e/staging-smoke.spec.js` were
updated the same day so the repo no longer claims a retired `web-e2e-tests` lane exists.

---

## 2026-08-15 — `web-e2e-tests` added as a required check (both layers)

**Change.** `web-e2e-tests` added to `required_status_checks` on ruleset `17946638`
(five contexts → six) and to classic branch protection (three → four). Effective union:
**six** contexts.

**Why.** `web-e2e-tests` was not required, so `main` sat RED on it for ~10 commits
(`22feabc5` → `38b3d127`) while several PRs merged straight through. The failure was not a
flake: #1783 (`cac2e0b6`) added `clearConsent()` to `createWallet`/`importWallet`, which
runs on the auto-fire onboarding path where `WalletEntry.finishCreate()` never executes.
The e2e harness pre-seeds `veyrnox-telemetry-consent='granted'`; that in-flow clear wiped
it, so after a reload-and-unlock the one-time consent screen rendered INSTEAD of the wallet
and the `Send` link never appeared (`e2e/onboarding.spec.js:228`).

That is a real user-facing behaviour change, and #1783's message claimed "No user-facing
behaviour change beyond honest defaults" — which is why the red read as a test problem for
~10 commits. Fixed in #1793 by dismissing the consent screen (choosing **No thanks**, never
grant — a test must not switch real telemetry egress on; see CLAUDE.md on the run that
wrote 126 events to production Supabase).

**Preconditions checked BEFORE making it required** — both matter, and skipping either is
how you brick every PR:

1. **The job always runs and always reports.** `web-e2e-tests` in
   `.github/workflows/android-e2e-emulator.yml` has no `if:`, no `needs:`, and no `paths:`
   filter, and the workflow triggers on every `pull_request` to `main`. A required check
   that can be SKIPPED blocks every PR forever — that is exactly how `release-cert-guard`
   bricked merges (it was required under its job *id* while GitHub matches on the display
   *name*, so the context never reported).
2. **`main` was green on it.** Verified `success` at `3adba8ab` before writing. Making a
   check required while `main` is red blocks every open PR instantly.

**Known cost, stated plainly.** This suite drives a real browser and takes ~5 min, so it
will be flakier than the unit suites and it now blocks merges. When it flakes, re-run it —
do NOT reach for `--admin`. Per CLAUDE.md, reaching for `--admin` is a signal the config
regressed, and the `#1310 → #1313 → #1325 → #1338 → #1386/#1391` debug-cert saga is what
habituating to it looks like.

### Restore the prior state

Ruleset `17946638` — read the current ruleset, drop `web-e2e-tests` from the
`required_status_checks` rule, and `PUT` it back (the endpoint needs the whole rules array,
not a patch):

```bash
gh api repos/VEYRNOX/veyrnox/rulesets/17946638 \
  | jq '{name, target, enforcement, conditions, bypass_actors,
         rules: [.rules[] | if .type=="required_status_checks"
                 then (.parameters.required_status_checks |=
                       map(select(.context != "web-e2e-tests")))
                 else . end]}' > /tmp/ruleset-restore.json
gh api -X PUT repos/VEYRNOX/veyrnox/rulesets/17946638 --input /tmp/ruleset-restore.json
```

Prior ruleset contexts (2026-08-15, before the change):

```json
[{"context":"verify"},{"context":"mainnet-flag-gate"},{"context":"unit-tests"},
 {"context":"Release-cert guard rejects wrong fingerprints"},{"context":"staging-gate"}]
```

Classic protection — send `strict` AND the full `checks` array together. Sending `strict`
alone risks dropping the required-check list:

```bash
cat > /tmp/classic-restore.json <<'JSON'
{"strict":false,"checks":[
  {"context":"verify","app_id":15368},
  {"context":"unit-tests","app_id":15368},
  {"context":"Release-cert guard rejects wrong fingerprints","app_id":15368}]}
JSON
gh api -X PATCH repos/VEYRNOX/veyrnox/branches/main/protection/required_status_checks \
  --input /tmp/classic-restore.json
```

**Verify any restore by RE-READING the API, not by trusting the write's response.**

---

## Earlier changes (recorded retrospectively from CLAUDE.md)

- **2026-08-08 — classic `strict` set `true` → `false`.** GitHub's auto-merge does not
  update a behind branch, it only waits, so on a repo merging 10+/day any merge landing
  inside a PR's check cycle re-blocked it. The failure is SILENT: every check green, the PR
  simply never merges. Now matches the ruleset, which was already `strict: false`. Honest
  cost: a PR can merge having passed checks against an older base, so a semantic
  (non-textual) conflict can land untested.
- **2026-08-03 — classic required-context name corrected** to
  `Release-cert guard rejects wrong fingerprints` (was the job *id* `release-cert-guard`,
  which never reported), and approvals set to `0` with code-owner review off. Before this,
  `required_approving_review_count: 1` on a repo where one account authors every PR was
  unsatisfiable — GitHub forbids self-approval — which is why the history is full of
  `--admin`.
- **2026-07-26 — `code_scanning` rule REMOVED** from the ruleset (issue #1375). CodeQL still
  scans and still files alerts; it no longer blocks merges. Removed because the rule gates
  on the CodeQL *tool* with no per-language granularity, so scoping the expensive Swift
  scan to iOS PRs left every other PR permanently BLOCKED on an incomplete result set.
  Three alternative fixes were tried and are all impossible — do not re-attempt them; the
  reasons are in CLAUDE.md and issue #1375.
