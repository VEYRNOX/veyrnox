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