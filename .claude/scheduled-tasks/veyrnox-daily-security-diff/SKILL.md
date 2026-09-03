---
name: veyrnox-daily-security-diff
description: Daily scan of security-sensitive file changes in Veyrnox — flags key material and signing path touches
---

You are running the daily security diff scan for the Veyrnox wallet codebase. Veyrnox is a self-custody, coercion-resistant crypto wallet (Vite + React + Capacitor; ethers v6; @noble/@scure). Mainnet is live.

Working directory: /Users/aljobson/Documents/GitHub/veyrnox

## Security invariants
- I1: keys never leave the device
- I2: no silent data egress  
- I3: deniability mode → zero backend calls
- I4: fail honest, fail closed
- I5: backend untrusted

## Your job

### Step 0 — Set up an isolated worktree on a throwaway per-day branch

Reports land in **`main`**, via a disposable per-day branch and a PR. There is no
long-lived log branch.

**Why not commit straight to `main`:** the `Veyrnox Code Review` ruleset
(id `17946638`) carries a `pull_request` rule, so direct pushes to `main` are
rejected. Only an admin bypass could push directly, and that would skip the
`verify` and `mainnet-flag-gate` required checks — the exact behaviour recorded
as finding A-4 in the 2026-07-19 report. Use a PR.

**Why not a long-lived branch:** the previous design kept every report on a
standing `security-diffs` branch that was never merged. On 2026-07-19 that
branch was deleted from origin during what looked like a bulk cleanup (remote
branches went 16 → 3), and the entire day's log survived only because the commit
objects happened to still be in a local object store. A log a routine branch
sweep can erase is not a log. Per-day branches are disposable *after* the
content is safely in `main`.

**Never switch the shared working tree.** This repo is frequently worked by
several agents at once — on 2026-07-19 the tree was dirty with another agent's
staged files and was switched to a different branch *mid-command*, twice. A
`git checkout` in the shared tree either fails or drags unrelated work across. A
worktree sidesteps this: it is a second checkout in its own directory, so the
shared tree is never touched and its dirty/clean state is irrelevant.

```bash
git fetch origin main

branch="security-diff/<DATE>"             # e.g. security-diff/2026-07-20
wt="${TMPDIR:-/tmp}/veyrnox-security-diff"

# Clean up a stale worktree from a previous crashed run, if any.
git worktree prune
[ -d "$wt" ] && git worktree remove --force "$wt"

# Re-run on the same day: reuse the existing branch rather than failing.
# --no-track is REQUIRED. Without it git sets upstream to origin/main, and a
# later `git push` from this branch would target MAIN. Verified 2026-07-19:
# a plain `git branch <name> origin/main` set .remote=origin /
# .merge=refs/heads/main. The same applies to `git branch -f`.
git show-ref --verify --quiet "refs/heads/$branch" || \
  git branch --no-track "$branch" origin/main
git config --get "branch.$branch.merge" >/dev/null && \
  git branch --unset-upstream "$branch"

git worktree add "$wt" "$branch"
```

Branch off **`origin/main`** each day, so the PR is a one-file diff against
current `main` rather than carrying stale history.

The worktree is where Steps 4–5 write and commit. Do **not** `cd` into it for
the analysis — see Step 1.

**If `git worktree add` fails**, do not fall back to `git checkout`. Report the
failure and stop; a failed scan is fine, a disturbed working tree is not.

### Step 1 — Get today's date and the last 24h of commits on main
Run in bash:
```bash
date +%F
git log origin/main --since="24 hours ago" --oneline --name-only
```

**Run Steps 1–3 from the main repo directory** (`/Users/aljobson/Documents/GitHub/veyrnox`),
not the worktree. All of it is read-only git plumbing, so a dirty tree is harmless.

Scan `origin/main` explicitly rather than the current branch, so the report is
deterministic regardless of which branch happens to be checked out. Use
`origin/main` (not `main`) as the ref throughout Steps 1–3 — it needs no checkout
and is unaffected by concurrent agents.

**When you need to read a source file's contents** (e.g. to confirm a guard is
present), read it out of the ref, not off disk:
```
git show origin/main:src/api/referralApi.js
```
The shared checkout's on-disk copy may carry another agent's uncommitted edits —
on 2026-07-19 it held staged changes to `referralApi.js` and `Subscription.jsx`
belonging to a concurrent session. Reading from the ref is deterministic; reading
from disk is not.

(The per-day worktree *is* branched from `origin/main`, so its files do match the
scanned ref. Reading via `git show origin/main:` is still the rule — it keeps
Steps 1–3 runnable from the shared checkout, which is where they run.)

If there are no commits in the last 24 hours, write a one-line "No security-relevant commits in last 24h" entry and commit it — then still push the branch and open the PR per Step 5, so the log stays continuous. Done.

### Step 2 — Identify security-sensitive changes

> **THIS LIST IS A FLOOR, NOT A CEILING.** Matching a pattern means a file
> *must* get deep analysis. Not matching means nothing — if you judge a changed
> file security-relevant, analyse it anyway and say why. The list encodes where
> risk was *known* to be; it always lags where risk actually is.
>
> **Maintenance rule:** if a real finding comes from a file no pattern below
> matches, record the pattern to add in a `## Scan-list maintenance` section of
> that day's report, naming the file, the finding, and why the current shape
> missed it.
>
> **This rule used to say "add the pattern in the same session" — which the
> hard constraints forbid** (the report file is the only file this task may
> write). So for four consecutive runs the list was never widened, every one of
> those runs produced findings from unmatched files, and each report dutifully
> noted the omission it was not permitted to fix. The instruction was
> unfollowable, not ignored. Writing it into the report puts it in front of a
> human who CAN edit this file — that is the handoff, and it works the same way
> a `.skip` with an un-skip condition written into the test file did on
> 2026-07-28. If several runs in a row carry the same maintenance note, that is
> the signal to escalate it rather than repeat it.

From the commit list, flag any file matching these patterns:

**Crypto / key / wallet core** — all of `wallet-core`, not two files of it.
Covers `vault.js`, `keystore/kek.js`, `panic.js`, `deniabilitySession.js`,
`deniabilityUnlock.js`, `duress.js`, `stealth.js`, `multiVault.js`,
`vaultBackup.js`, `evm/walletconnect/**`.
- `src/wallet-core/**`

**Gating / risk / runtime attestation**
- `src/rasp/**`
- `src/sign-gate/**`
- `src/risk/**`
- `src/lib/twoFactorGate.js`
- `src/lib/pinAttemptGuard.js`
- `src/lib/useKekEnrollmentGate.js`
- `src/components/KekEnrollmentGate.jsx`

**Auth / secrets handling**
- `src/lib/biometricUnlock.js`
- `src/lib/duressBiometricGuard.js`
- `src/lib/passkey.js`
- `src/lib/copySecret.js`
- `src/lib/kekPinNotice.js`
- `src/lib/vaultErrors.js`
- `src/components/WalletEntry.jsx`
- `src/components/security/**`

**Backend, DB and egress (I2 / I5)** — the surface that produced most of the
2026-07-26 and 2026-07-27 findings: anon-callable SECURITY DEFINER RPCs, RLS
policy regressions, missing `search_path`, edge-function auth, orphaned
function overloads.
- `sql/**`
- `supabase/**`
- `src/lib/supabaseClient.js`
- `src/api/trackEvent.js`
- `src/api/referralApi.js`

**Telemetry / consent / deniability (I2 / I3)**
- `src/lib/analytics.js`
- `src/lib/consent.js`
- `src/lib/deviceId.js`
- `src/lib/tracking-integration.jsx`
- `src/notify/**`

**Security Advisor egress (I2 / I5)** — the largest client-side egress sink in
the app, and it matched NO pattern until 2026-09-02, when it produced both of
that day's regressions. `SecurityAdvisor` merges every published page snapshot
into `effectivePageSnapshot` and POSTs it to `tip-chat` as
`context.page_snapshot` **next to a persistent `device_id`**, so anything a page
publishes becomes a durable, per-device disclosure to a backend I5 declares
untrusted. Consent gates the transmission; it does not make a fact safe to send.
- `src/components/SecurityAdvisor.jsx`
- `src/lib/advisorBridge.js`
- **any file calling `publishAdvisorContext`** — this is the rule that matters,
  because the publisher set grows. It was 1 file, then 6 within a week. Find them
  with `git grep -l publishAdvisorContext -- src`, and diff the payload, not just
  the import.

  What to look for in a payload: does any key state a fact about the user's
  DENIABILITY setup (duress configured, stealth/hidden pool present, decoy
  state), or identify them on-chain (own wallet address)? #2256 removed
  `duress_configured` and `stealth_pool_present` for exactly this. The standing
  guard is `src/pages/__tests__/advisorContext.noCoercionOracles.test.js` — if a
  finding here is not already caught by it, widen that test in the same session.

**Outbound network calls outside `src/api/**`** — `src/lib/analytics.js` was
listed for years while its neighbours were not.
- `src/lib/coinGecko.js`
- `src/hooks/usePortfolioMarketData.js`
- `src/hooks/useAnalytics.js`
- more generally: a new `fetch(` outside `src/api/**` is a new egress path.
  Check it is fixed-shape (never derived from holdings), decoy/demo-gated (I3),
  and fail-honest on error (I4) — the `usePortfolioMarketData` shape.

**Credential floors and coercion state** — files that decide how strong a
credential must be, or that read/write duress/stealth configuration. None of
these matched before 2026-09-02; two produced findings that day.
- `src/pages/RestoreFromShares.jsx` (cross-device seed recovery + re-wrap floor)
- `src/pages/PersonalBackup.jsx` (backup export password/PIN floors)
- `src/pages/Settings.jsx` (consent, duress, KEK and biometric posture)
- `src/lib/walletMeta.js` (persists `enabledAssets`; migration surface)

**Signing and money-movement UI**
- `src/lib/WalletConnect*`
- `src/lib/WalletProvider.jsx`
- `src/pages/CryptoSigning.jsx`
- `src/pages/ColdSign.jsx`
- `src/pages/SendCrypto.jsx`
- `src/pages/WalletConnect.jsx`
- `src/pages/DuressPin.jsx`
- `src/pages/PanicWipe.jsx`
- `src/pages/StealthWallets.jsx`

**Native**
- `android/app/src/main/**`
- `ios/App/App/**`
- `capacitor.config.json`

**Build, CI and supply chain** — a control that never runs is not a control.
`rollback.yml` carried a command injection; `deploy-preview.yml` handed a
deploy token to PR-authored code; `build.gradle`'s release-cert guard regressed
four times; `vitest.config.js` once let the test suite write to **production**
Supabase.
- `.github/workflows/**`
- `android/app/build.gradle`
- `vite.config.js`
- `vitest.config.js`
- `package.json`, `package-lock.json`
- `scripts/**` (the `check-*.mjs` guards ARE security controls)

**Tests are not automatically "non-security."** A deleted or weakened test for a
security control is a removed control — diff test files that cover anything
above, and say so if an assertion disappeared.

**Docs are not automatically "non-security" either.** A doc that RECORDS what a
security change does is part of that change. On 2026-09-02 the scan filed a
46-insertion `docs/Feature-Status.md` diff under "Non-security changes" — and
that diff was the record of the very commit the scan was rating a REGRESSION,
including the device-verification result that would have corrected the severity.
**If a commit in the window is being rated, read every file its PR touched,
docs included, before writing the rating.** `docs/Feature-Status.md`,
`docs/audit-*.md` and `docs/security-diffs/**` are where this repo keeps the
"what was actually verified" half of a change.

Genuinely non-security files (UI copy, styling, unrelated tests, and docs that
describe none of the above) can be noted briefly in the summary and do not need
deep analysis.

*Widened 2026-07-27.* The previous list held 15 patterns and matched **none** of
the surfaces that produced the actual findings of the two preceding reports. On
2026-07-27, of 33 files correctly assessed as security-sensitive, only two
matched it — and both were import-path-only changes rated SAFE. A run following
that list literally would have reported a quiet day while missing anon-callable
SQL RPCs, an unauthenticated edge function, and telemetry egress.

*Widened again 2026-09-02*, after a **fourth consecutive** run whose findings
came from unmatched files — that day both regressions did. Added: the Security
Advisor egress sink and its publisher set, outbound calls outside `src/api/**`,
and the credential-floor / coercion-state pages.

**Why the list kept lagging, structurally.** It was organised by MODULE ROLE
(`wallet-core`, `rasp`, `sign-gate`) and by NAMED FILE. Two whole categories cut
across both and were therefore invisible until someone remembered to name them:

- **Egress sinks.** Where data LEAVES the device is a property of what a file
  calls, not where it lives. `src/pages/Settings.jsx` is a settings screen by
  location and an egress source by behaviour.
- **Credential-floor owners.** A file that decides "16 chars" or "8 digits" is
  security-critical regardless of directory.

So prefer a BEHAVIOURAL question over a path match when triaging a changed file:
*does it send data off-device, decide a credential floor, gate an action, or
record what a security change does?* Any yes → deep analysis, whether or not a
pattern above matches. The paths are a fast index, not the definition.

### Step 3 — For each flagged file, read the diff
Run: `git diff <oldest-in-window>~1 origin/main -- <file>`.

Do not assume the window is one commit — `HEAD~1 HEAD` is wrong whenever more
than one commit landed. Establish the range first:
```
git log origin/main --since="24 hours ago" --format="%H" | Select-Object -Last 1
```
then diff that commit's parent against `origin/main`. On 2026-07-19 the window
held 49 commits, so a single-commit range would have missed nearly everything.

**Read the file. Do not grep it.** The pattern list is only half the failure
mode; the other half is reaching a flagged file and skimming it. On 2026-09-02
this happened THREE times in one run:

- `WalletAssetPickerSheet.jsx` reached the flagged list and was skimmed. It was
  fine only because an unrelated PR had already fixed it.
- `docs/Feature-Status.md` was categorised as non-security (see Step 2).
- `KekEnrollmentGate.jsx` — a CONTEXT file, not in the window — was consulted
  with `grep -n "onSkip\|Skip\|skip\|Not now\|later"`. That found a Skip button
  and the scan stopped, concluding the gate was skippable. It could not surface
  `if (autoEnrolling)` twenty lines earlier, which suppresses that button on
  exactly the path being rated. The grep answered the question asked, and was
  treated as answering the question that mattered. The finding shipped a
  severity too high and needed a public correction.

The rule, concretely: **when a verdict depends on how a component BEHAVES, open
the component.** A grep can prove a string is present; it cannot prove the
absence of an earlier return, a guard, or a branch that makes the string
unreachable. `CLAUDE.md` states this generally — *a search list is a floor, not
a ceiling* — and the 2026-09-02 run demonstrates that knowing the rule is not
enough: it was quoted in that same report's own maintenance section.

Cost check before skipping a read: these files are 200–900 lines. Reading one
costs a fraction of the run. Publishing a wrong severity costs a correction PR,
and a reader who believed it in between.

For each changed security file, assess:
- Does the change ADD or REMOVE a security control?
- Does it touch key material, signing, RASP gates, or authentication?
- Does it introduce a potential I1–I5 violation?
- Does it claim something is "verified" without evidence?
- Rate: SAFE / NEEDS-REVIEW / REGRESSION

### Step 4 — Write the daily diff report
Get today's date. Create or append to `docs/security-diffs/diff-<DATE>.md`:

```markdown
# Security Diff — <DATE>

Commits scanned: <count> in last 24h
Security-sensitive files changed: <count>

## Flagged changes

### <file:line> — <SAFE|NEEDS-REVIEW|REGRESSION>
**Commit:** <hash> <message>
**Change summary:** <1-2 sentences>
**Assessment:** <why safe or why needs review>

## Non-security changes (summary)
<one line listing non-security files changed>

---
*Automated daily scan. Static analysis only — no dynamic testing.*
```

If rating is REGRESSION: add a `## ⚠️ REGRESSION DETECTED` section at the top with the file and a brief description.

### Step 4b — Re-check `origin/main` (FIRST of three checkpoints)

The scan window closes at the `origin/main` tip you captured in Step 1, but the
report is not published until Step 5. Anything landing in between is invisible
to the diff range, so a finding can already be fixed by the time the PR opens.

**Only matters when you are carrying an open item** — a NEEDS-REVIEW, a
REGRESSION, or anything phrased as "outstanding", "still", or "carried forward".
A report that is all-SAFE with no open items needs no re-check; skip straight to
Step 5.

> **A single pre-commit check does NOT close this window — three staleness
> events across two consecutive reports proved it.** The check below runs
> before the commit; the PR merges
> later, asynchronously, whenever `--auto` sees the required checks pass —
> which on this repo means up to ~20 minutes (`unit-tests` alone runs 18m).
> Everything landing in that gap is invisible here.
>
> - `diff-2026-07-26.md` went stale by **83 seconds** (PR #1346 resolved its
>   REGRESSION between window close and PR merge).
> - `diff-2026-07-27.md` went stale by **39 seconds** — and then its own
>   *amendment* went stale the same way, because the amendment re-checked
>   before committing too.
>
> So this is checkpoint 1 of 3. Do all three:
> 1. **here**, before committing (cheap, catches the common case);
> 2. **Step 5**, immediately before arming auto-merge (narrows the window);
> 3. **Step 6**, after the PR actually merges (the only one that can close it).
>
> Never report "no amendment needed" on the strength of checkpoint 1 alone.

```bash
git fetch origin main
git log <tip-from-step-1>..origin/main --oneline
```

Scan those subjects for anything that resolves an open item. If one does, read
its diff to confirm before believing the subject line, then fold it into the
report **as a dated amendment** — do not silently rewrite the finding:

```markdown
## Amendment (<DATE>, post-scan)

<item> was resolved by <hash> (PR #<n>), which landed after the scan window
closed at <tip>. Outside the diff range, so the scan could not see it.
<what the fix actually does, verified from its diff>
```

Keep the original finding in place and mark it `— **RESOLVED, see amendment
below.**` The point of the log is an accurate record of what was true when, not
a tidy final state. Never delete a finding to make the report look clean.

If nothing resolves it, say so — no amendment section, and the item stands.

Whether or not you amend, **record what you verified against** so a reader can
tell how wide the staleness window is:

```markdown
## Post-scan re-check

Verified against `origin/main` at `<tip>` (<UTC timestamp>). <Nothing landed
between window close and this check | <hash> landed and is folded in above.>
```

A bare "nothing had landed" with no tip and no time is unfalsifiable a day
later — it reads as a guarantee when it is only a snapshot.

*Added 2026-07-20:* that day's report carried a `setAttributes` doc-drift item
already closed by `da1e1973` (PR #1251), which landed between window close and
PR open. The report needed a follow-up commit to correct itself.

### Step 5 — Commit, push the branch, open a PR, then remove the worktree

Write the report file (Step 4) **inside the worktree**, at
`${TMPDIR:-/tmp}/veyrnox-security-diff/docs/security-diffs/diff-<DATE>.md`, then:

```bash
cd "${TMPDIR:-/tmp}/veyrnox-security-diff"
git add docs/security-diffs/diff-<DATE>.md
git commit -o docs/security-diffs/diff-<DATE>.md -m "docs(security-diff): daily scan <DATE>"
git push -u origin "$branch"

gh pr create --base main --head "$branch" \
  --title "docs(security-diff): daily scan <DATE>" \
  --body "Automated daily security diff for <DATE>. INTERNAL static analysis only — no dynamic testing, no device verification, no on-chain confirmation. Not the outstanding independent third-party audit."

# CHECKPOINT 2 — re-check AFTER the commit, immediately before arming
# auto-merge. Carrying an open item? Anything landing since checkpoint 1 is
# already invisible to the committed report.
git fetch origin main
git log <tip-from-step-4b>..origin/main --oneline

# If something here resolves an open item: amend the report NOW, on the same
# branch, and push before arming auto-merge. It costs one extra commit and
# saves publishing a finding you already know is closed.

# Lands by itself once `verify` and `mainnet-flag-gate` pass.
gh pr merge --squash --auto

cd "/Users/aljobson/Documents/GitHub/veyrnox"
git worktree remove "${TMPDIR:-/tmp}/veyrnox-security-diff"
```

**Do NOT remove the worktree before checkpoint 2.** Amending on the same
branch needs it, and re-creating one costs a full checkout.

The `git add` is REQUIRED and must come first. `git commit -o` (`--only`) errors
with `pathspec ... did not match any file(s) known to git` on an untracked path,
and the report file is new every run. Verified 2026-07-19 — the add-less form
fails 100% of the time. (`-o` works without `add` only for already-tracked files.)

Keep the `-o` pathspec even though the worktree index is isolated: it is what
stops a stray zero-byte shell-redirection artifact riding along (see
`scripts/check-stray-files.mjs`). Verified the same day — with `unrelated.txt`
deliberately staged, `commit -o` committed only the report file. Never use
`git add -A`, `git add .`, or `git commit -a`.

**Use `--auto`, never a direct merge.** Auto-merge waits for the required checks.
Do NOT merge with `--admin` or otherwise bypass: `main` has been red more than
once (2026-07-19 saw two separate typecheck breakages), and a docs PR quietly
merged over a red `main` is how that goes unnoticed. If the PR does not merge
because `main` is broken, that is the correct outcome — the report waits, and
the next day's run is unaffected because each day branches fresh from
`origin/main`.

**Always remove the worktree**, including when the scan aborts early or finds
nothing. A left-behind worktree makes the next run's `git worktree add` fail;
the `git worktree prune` + `remove --force` in Step 0 is the recovery path.

**Leave the per-day branch alone after the PR is open.** Do not delete it — the
PR needs it, and until the PR merges that branch is the only copy of the report.
Deleting a not-yet-merged report branch destroyed a day's log once already
(2026-07-19); it was recoverable only by luck.

Reports accumulate in `main` under `docs/security-diffs/`. To read the log:
`git log origin/main --oneline -- docs/security-diffs/`.

### Step 6 — Verify AFTER the PR merges (the checkpoint that actually closes it)

**Skip only if the report carries no open item.** Otherwise this step is not
optional: with `--auto` the merge is asynchronous, so checkpoints 1 and 2 are
both snapshots taken before publication. Neither can see the gap between them
and the merge. This is the only checkpoint that observes the published state.

Do not poll in a sleep loop. Arm a watcher and keep working. Run it through the
Monitor tool (or the Bash tool with `run_in_background`), which notifies you on
each emitted line:

```bash
# Emits one line when the PR merges, closes, or a required check fails.
# Covers every terminal state on purpose: a watcher that greps only for
# "MERGED" stays silent through a failed check, and silence is
# indistinguishable from "still waiting".
for i in $(seq 1 80); do
  s=$(gh pr view <PR#> --json state 2>/dev/null || true)
  case "$s" in
    *'"state":"MERGED"'*) echo "PR #<PR#> MERGED"; exit 0 ;;
    *'"state":"CLOSED"'*) echo "PR #<PR#> CLOSED unmerged"; exit 0 ;;
  esac
  f=$(gh pr checks <PR#> 2>/dev/null | grep -E "fail" || true)
  if [ -n "$f" ]; then echo "FAILING checks:"; echo "$f"; exit 0; fi
  sleep 60
done
```

Once merged, re-check the full window — window close through the merge commit:

```bash
git fetch origin main
git log <tip-from-step-1>..origin/main --oneline
```

For anything that resolves an open item, **read its diff to confirm before
believing the subject line**, then add a **dated correction** on a NEW branch.
Step 5 removed the worktree, so build a fresh one exactly as in Step 0 — same
`--no-track` rule, same "never switch the shared tree" rule:

```bash
branch="security-diff/<DATE>-amend"      # NOT the per-day branch: its PR has
                                         # merged and it may already be deleted
wt="${TMPDIR:-/tmp}/veyrnox-security-diff-amend"
git fetch origin main
git branch --no-track "$branch" origin/main
git worktree add "$wt" "$branch"
```

Branch from `origin/main` — which now contains the merged report — so the
correction is a one-file diff against the published text. Same rules as an
amendment: keep the original finding standing, mark it, append the correction
beneath. Never rewrite. Then commit with `git add` + `git commit -o`, open a PR,
`--auto` it, and remove the worktree — all as in Step 5.

**If the correction is caught while the report's own PR is still OPEN**, fix it
on that branch instead and push before it merges — correcting a document before
publication is not rewriting history, and it beats publishing something you
already know is false. Still append rather than substitute, so the original
point-in-time record survives.

*Added 2026-07-27:* this step exists because 2026-07-26 and 2026-07-27 were
both overtaken between their final re-check and their merge (83s and 39s), and
the 07-27 *amendment* was overtaken the same way — it re-checked before
committing, then #1399 merged 39 seconds before its auto-merge was armed. Three
staleness events, one root cause: every check ran before publication and none
after.

## Hard constraints
- Push ONLY the per-day `security-diff/<DATE>` branch. NEVER push to `main`.
- Open a PR for the report and set `--auto`. NEVER merge with `--admin`, and
  never bypass a required check — see the Step 5 note.
- Do NOT modify any source files — read-only analysis only. The report file
  under `docs/security-diffs/` is the ONLY file this task may ever write.
  That includes THIS runbook: when the scan list needs widening, write the
  proposed patterns into the report's `## Scan-list maintenance` section (Step 2
  maintenance rule) rather than editing `SKILL.md`. A scheduled task that can
  rewrite its own instructions is a worse problem than a stale pattern list.
- Do NOT delete a report branch whose PR has not merged — it is the only copy.
- Do NOT call the scan finished at `gh pr merge --auto`. If the report carries
  an open item, Step 6 (post-merge re-check) is part of the run — three
  staleness events came from stopping at publication.
- Do NOT stash, revert, force-checkout, or otherwise move another agent's
  uncommitted work. If the tree is dirty, work around it (Step 0) — never clean it.
- Do NOT mark anything verified without a real on-chain txid
- This is internal analysis — label it as such

**Changed 2026-07-19** (was: commit to a long-lived `security-diffs` branch, no
push, no PR). That branch was deleted from origin in a bulk cleanup and the day's
log was nearly lost; and because it was never merged, the reports were not
durable anywhere. Per-day branch + PR into `main` fixes both. Direct commits to
`main` are not possible — the ruleset requires a pull request.

**Changed 2026-07-27** (was: a single re-check in Step 4b, before committing).
One pre-commit check cannot cover the commit→merge gap, which on this repo runs
to ~20 minutes because `--auto` waits on `unit-tests` (18m). Three reports went
stale through that gap — `diff-2026-07-26.md` by 83s, `diff-2026-07-27.md` by
39s, and 07-27's own amendment by 39s, since it also re-checked before
committing. The re-check is now three checkpoints: before commit (4b), before
arming auto-merge (5), and **after the merge (6)** — only the last observes the
published state. Step 4b also now requires recording the tip and timestamp the
report was verified against, so "nothing had landed" is falsifiable rather than
a bare assurance.