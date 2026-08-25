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
