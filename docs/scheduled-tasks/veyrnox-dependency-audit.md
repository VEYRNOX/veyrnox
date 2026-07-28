---
name: veyrnox-dependency-audit
description: Weekly npm audit for Veyrnox — flags CVEs in crypto/wallet dependencies and spawns fix agents for CRITICAL/HIGH
---

You are running the weekly dependency security audit for the Veyrnox wallet. Veyrnox is a self-custody crypto wallet (Vite + React + Capacitor; ethers v6; @noble/@scure). Mainnet is live.

Working directory: C:\Users\aljob\Downloads\Veyrnox
Repo: `VEYRNOX/veyrnox`

## Step 0 — Isolated worktree on a per-run branch (DO THIS FIRST)

**This repo is racy.** ~13 branches are checked out across separate worktrees,
several other scheduled tasks touch it concurrently, and the primary checkout is
frequently on a detached HEAD or an unrelated feature branch. Never `git checkout`
in the shared tree — it either fails or drags another agent's work across.

```powershell
git fetch origin main

$branch = "dep-audit/<DATE>"
$wt     = "$env:TEMP\veyrnox-dep-audit"

git worktree prune
if (Test-Path $wt) { git worktree remove --force $wt }

# --no-track is REQUIRED. Without it git sets upstream to origin/main and a
# later `git push` from this branch would target MAIN.
if (-not (git show-ref --verify --quiet "refs/heads/$branch"; $?)) {
  git branch --no-track $branch origin/main
}
if (git config --get "branch.$branch.merge") { git branch --unset-upstream $branch }

git worktree add $wt $branch
```

Write the report **inside the worktree**. Run `npm audit` in the primary
directory (it needs the installed `node_modules`) — that is read-only and safe.

If `git worktree add` fails, do NOT fall back to `git checkout`. Report the
failure and stop. A failed audit is fine; a disturbed working tree is not.

## Security-critical packages to watch closely
- `@noble/hashes`, `@noble/curves`, `@noble/secp256k1` — ECC and hash primitives
- `@scure/bip32`, `@scure/bip39`, `@scure/base` — HD derivation and mnemonics
- `ethers` — EVM signing and ABI encoding
- `@walletconnect/web3wallet`, `@walletconnect/core` — dApp connector
- `@capacitor/*` — native bridge (key export surface)
- `vite` — build tool (supply chain risk)
- `vitest` — test runner (dev only but supply chain risk)

## Your job

### Step 1 — Run npm audit
```
npm audit --json 2>&1
```

Parse the JSON output. Extract all vulnerabilities with:
- Package name
- Severity (critical/high/moderate/low)
- CVE ID if available
- Vulnerable version range
- Fixed version (if available)
- Whether it's a direct dependency or transitive

### Step 1b — Read the accepted-residuals list BEFORE deciding anything (MANDATORY)

Read `C:\Users\aljob\.claude\scheduled-tasks\veyrnox-daily-dep-audit\SKILL.md` and find
its "## Accepted residuals" section. It is the single source of truth for which advisories
have already been reviewed and consciously accepted, and it carries the reasoning, the
revisit trigger, and the watcher for each. This task previously had no knowledge of it,
which is how it could have opened a PR "fixing" a finding whose fix is known to be broken.

As of 2026-07-28 four roots are accepted — `brace-expansion` (28 high), `shell-quote`
(4 high), `elliptic` (18 low), `body-parser` (1 low) — which is **all 51** advisories
`npm audit` currently reports. Do not treat that list as fixed; read it each run.

Rules, in order of importance:

1. **Never spawn a fix agent, open a PR, or propose a remediation for an advisory whose
   root package is on that list.** Suppression is scoped by ROOT package name: if a
   finding traces back to an accepted root through its `via` chain, it is covered.
2. **`brace-expansion` specifically: the obvious fix is known to be broken.** An
   `overrides` entry of `^5.0.8` collapses the lockfile onto the patched version and takes
   `npm audit` from 32 high to 3 — and then `npm run lint` dies with
   `TypeError: expand is not a function`, because 5.x changed its CommonJS export shape and
   6 `minimatch` copies declare the old one. `npm run build` still PASSES, so a green build
   is NOT evidence the override is safe. Do not propose this override.
3. **Report accepted residuals as accepted, never as new.** Name each suppressed root, its
   count, and its watcher. Never omit the suppression — a finding that vanishes without a
   trace is what I4 (fail honest) forbids.
4. **Escalate rather than suppress** if a listed residual appears ABOVE its recorded max
   severity, or if a NEW root appears that is not on the list. Those are the cases this
   task exists for, and they keep the full fix-agent and PR flow.
5. If reading that file fails, say so and suppress NOTHING — report everything and note
   the residuals list was unreadable. Fail honest, fail closed.

### Step 1c — Short-circuit when there is nothing new (added 2026-07-28)

Evaluate this immediately after Step 1b, BEFORE Step 2. Short-circuit if ALL of:

- every advisory `npm audit` reported traces to a root on the accepted-residuals list; AND
- none of them exceeds its recorded max severity; AND
- no new root appeared.

**An advisory can trace to MORE THAN ONE root — handle that explicitly.** It is covered if
**ANY** of its mapped roots permits its severity. It has escalated only if its severity
exceeds **EVERY** one of them. Comparing against each root independently is wrong and
produces false escalations. Verified case, 2026-07-28: `@appium/base-driver` is HIGH and
traces to both `shell-quote` (recorded high) and `body-parser` (recorded low) — it is
covered by `shell-quote`, and a per-root comparison wrongly flags it as
"high > recorded low". That false positive was produced by a first cut of this very step,
so do not re-derive the simpler rule.

If so: report the counts, name each suppressed root with its count and watcher, state
plainly that nothing new was found — then **stop**. Do NOT continue to Steps 2–5, do NOT
commit, push, or open a PR. Clean up instead, from the primary directory:

```powershell
cd "C:\Users\aljob\Downloads\Veyrnox"
git worktree remove "$env:TEMP\veyrnox-dep-audit"
git branch -D "dep-audit/<DATE>"
```

Use the LITERAL branch name with `<DATE>` substituted, exactly as Step 0 built it — not
`$branch`. Shell state does not survive between steps, so `$branch` is empty here and
`git branch -D` would run with no argument: it errors harmlessly, the branch is never
deleted, and the cleanup silently does not happen. (`git worktree remove` is fine — its
path is a literal.)

Removing the branch matters: Step 0 reuses `dep-audit/<DATE>` if it already exists, so an
abandoned branch left behind would be picked up by a later run. Run `git worktree prune`
too if the remove reports the worktree was already gone.

**Why this exists.** Since 2026-07-28 all 51 advisories are accepted residuals, so a
no-change run is now the EXPECTED outcome most weeks. Without this step the task would
open a report-only PR every Wednesday forever, and a recurring no-op PR trains reviewers
to stop reading these — which costs exactly the attention the escalation cases need.

**This is a reporting short-circuit, not a silencer.** Still run and still produce the
full report-and-PR flow whenever anything is genuinely new: a residual above its recorded
severity, a root not on the list, any advisory in a security-critical package from the
list above, or an unreadable residuals file (Step 1b rule 5). When in doubt, do NOT
short-circuit — a redundant PR is a much cheaper mistake than a silent one.

Note that Step 2 (`npm outdated` on security-critical packages) is skipped by this
short-circuit. That is deliberate — it is an advisory-driven task — but it does mean a
newly outdated `@noble`/`@scure`/`ethers` with no advisory attached will not be reported
on a short-circuited week. If that becomes the thing you care about, move Step 2 above
this gate rather than weakening the gate.

### Step 2 — Check for outdated critical packages
```
npm outdated --json 2>&1
```

Flag any of the security-critical packages listed above that have a newer version available.

### Step 3 — Cross-reference with known crypto CVEs
Check if any of these specific packages appear in the vulnerability list:
- Any `@noble/*` or `@scure/*` package
- `ethers` < 6.0 (v5 has known issues)
- `@walletconnect/*` packages

### Step 4 — Write the report
Get today's date (PowerShell: `Get-Date -Format "yyyy-MM-dd"`).

Write `docs/dependency-audits/dep-audit-<DATE>.md`:

```markdown
# Dependency Security Audit — <DATE>

## Summary
- Total vulnerabilities: <N> (critical: <N>, high: <N>, moderate: <N>, low: <N>)
- Security-critical packages with updates: <N>
- Action required: YES / NO

## Critical / High Vulnerabilities
| Package | CVE | Severity | Vulnerable range | Fix available |
|---|---|---|---|---|
...

## Security-critical package updates available
| Package | Current | Latest | Risk if outdated |
|---|---|---|---|
...

## Moderate / Low (summary)
<brief list — no table needed>

## Recommended actions
<prioritised list: update X to Y, pin Z, etc.>

---
*Automated weekly scan via npm audit. Verify CVE applicability before treating as exploitable.*
```

### Step 5 — Commit, push, open a PR, then remove the worktree

**Changed 2026-07-27** (was: `git commit` with "do NOT push, do NOT open a PR").
The commit was never blocked — a ruleset gates the push, not the commit — but
the report never reached `origin/main`. It survived only in whatever local
checkout the task happened to run in, which in this repo is how work gets lost.

```powershell
cd "$env:TEMP\veyrnox-dep-audit"
git add docs/dependency-audits/dep-audit-<DATE>.md
git commit -o docs/dependency-audits/dep-audit-<DATE>.md `
  -m "docs(deps): weekly dependency audit <DATE>"
git push -u origin $branch

gh pr create --base main --head $branch `
  --title "docs(deps): weekly dependency audit <DATE>" `
  --body "Automated weekly npm audit. INTERNAL — static advisory review only; CVE applicability not verified by exploitation."

gh pr merge --squash --auto

cd "C:\Users\aljob\Downloads\Veyrnox"
git worktree remove "$env:TEMP\veyrnox-dep-audit"
```

`git add` is REQUIRED and must come first — `git commit -o` errors on an
untracked path, and the report file is new every run. Keep the `-o` pathspec: it
is what stops a stray shell-redirection artifact riding along (see
`scripts/check-stray-files.mjs`). Never `git add -A`, `git add .`, or `commit -a`.

**Use `--auto`, never `--admin`.** Auto-merge waits for the required checks. If
`main` is red the PR correctly waits rather than landing over a broken build.

**Always remove the worktree**, including when the run aborts or finds nothing.

### Step 6 — If CRITICAL or HIGH vulnerabilities found in security-critical packages
If any CRITICAL or HIGH CVE affects `@noble/*`, `@scure/*`, `ethers`, or `@walletconnect/*`:

1. Check if `npm audit fix` would resolve it without breaking changes: run `npm audit fix --dry-run 2>&1`
2. If safe: run `npm audit fix`, then run `npm test` to confirm tests still pass
3. If tests pass, put the fix on its **own branch and its own PR** — never in the
   report PR. A lockfile change and a docs file have different review needs and
   must not share a merge decision.

```powershell
$fixBranch = "fix/dep-audit-<DATE>"
# fresh worktree, same Step 0 pattern, then:
git add package.json package-lock.json
git commit -o package.json package-lock.json `
  -m "fix(deps): npm audit fix <DATE> — <package> CVE"
git push -u origin $fixBranch
gh pr create --base main --head $fixBranch `
  --title "fix(deps): npm audit fix <DATE> — <package> CVE" `
  --body "Automated `npm audit fix` for <CVE>. Tests pass locally. NOT auto-merged — a dependency change needs human review before landing."
```

4. **Do NOT `--auto` the dependency PR.** The report is docs and can land itself;
   a lockfile change cannot. Leave it open for a human, and say so in the run
   output so the PR is not forgotten.
5. Do NOT run `npm audit fix --force` (breaks semver).
6. Never regenerate the lockfile wholesale — `npm install --package-lock-only`
   without the committed lock produces a ~3800-line diff and silently drops
   `appium` and ~30 packages. Keep the diff surgical.

## Hard constraints
- Push ONLY the per-run `dep-audit/<DATE>` (and `fix/dep-audit-<DATE>`) branches.
  NEVER push to `main`.
- NEVER merge with `--admin` or bypass a required check.
- Do NOT `--auto` a PR that changes `package.json` or `package-lock.json`.
- Do NOT run `npm audit fix --force`
- Do NOT modify source files (only package.json/lock if audit fix applies)
- Do NOT `git checkout`/`git switch` in the primary working directory
- Do NOT delete a branch whose PR has not merged — it is the only copy
- Report findings honestly — "no vulnerabilities found" is a valid and good outcome