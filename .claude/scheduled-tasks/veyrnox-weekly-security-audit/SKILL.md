---
name: veyrnox-weekly-security-audit
description: Weekly parallel security audit of Veyrnox across RASP, WalletConnect, KEK, and Auth surfaces
---

You are running the weekly internal security audit of the Veyrnox wallet codebase. Veyrnox is a self-custody, coercion-resistant crypto wallet (Vite + React + Capacitor; ethers v6; @noble/@scure). Mainnet is live as of 2026-06-17.

Working directory: /Users/aljobson/Documents/GitHub/veyrnox (macOS; bash/zsh)
Repo: `VEYRNOX/veyrnox`

## Step 0 — Isolated worktree on a per-run branch (DO THIS FIRST)

**This repo is racy.** ~13 branches are checked out across separate worktrees,
several other scheduled tasks touch it concurrently, and the primary checkout is
frequently on a detached HEAD or an unrelated feature branch. Never `git checkout`
in the shared tree.

Pinning to `origin/main` also makes the audit deterministic: the four agents
below must read the same tree, not whatever branch the shared checkout happens
to be on.

```bash
git fetch origin main

BR="security-audit/$(date +%Y-%m-%d)"
WT="${TMPDIR:-/tmp}/veyrnox-weekly-audit"

git worktree prune
[ -d "$WT" ] && git worktree remove --force "$WT"

# --no-track is REQUIRED, or `git push` from this branch would target MAIN.
git show-ref --verify --quiet "refs/heads/$BR" || git branch --no-track "$BR" origin/main
git config --get "branch.$BR.merge" >/dev/null 2>&1 && git branch --unset-upstream "$BR"

git worktree add "$WT" "$BR"
git rev-parse origin/main   # record this in the report header
```

**Point all four subagents at `$wt`**, and record the audited commit
(`git rev-parse origin/main`) in the report header. "Branch audited" was
previously whatever the shared tree was on — which was frequently not `main`.

If `git worktree add` fails, do NOT fall back to `git checkout`. Report and stop.

## Security invariants (never violate)
- I1: keys never leave the device
- I2: no silent data egress
- I3: deniability mode makes zero backend calls
- I4: fail honest, fail closed — never mock a security control
- I5: backend untrusted by design

## Your job

Run a static code analysis audit across four surfaces in parallel, then write a dated findings report and commit it to main.

### Step 1 — Recon
Run: `git log --oneline -10` and `git status` to understand what has changed since the last audit. Check `docs/` for the most recent audit report to understand what was already known.

### Step 2 — Parallel audit
Dispatch four subagents in parallel (one per surface) using the Agent tool:

| Surface | `subagent_type` |
|---|---|
| A — RASP | `Penetration Tester` |
| B — WalletConnect / EIP-712 | `Blockchain Security Auditor` |
| C — Hardware KEK | `Penetration Tester` |
| D — Auth gates | `Application Security Engineer` |

(These replace `secskills:mobile-pentester` / `secskills:web3-auditor` / `secskills:pentester`, which are NOT registered in this environment. The 2026-08-17 and 2026-08-25 runs both had to substitute silently — if the names above stop resolving, pick the closest registered specialist and SAY SO in the report's deviations section rather than failing.)

Point every agent at the worktree from Step 0 and tell it to work ONLY there — never in the primary checkout, whose branch is unknown. Instruct each to cite `file:line`, to try to REFUTE its own finding before reporting it, and to state the refutations it discarded. Brief each with:

**Agent A — RASP + RaspIntegrityPlugin**
Audit: `android/app/src/main/java/com/veyrnox/app/RaspIntegrityPlugin.kt`, `ios/App/App/RaspIntegrityPlugin.m`, `src/rasp/` (all files), `src/sign-gate/presign.js`, `src/sign-gate/compose.js`. Check: detection chain correctness, tamper-cert placeholder status, WARN-tier biometric enforcement gap, Magisk/Zygisk bypass exposure, fail-open paths where a probe error/timeout yields ALLOW, and whether every chokepoint reads the right field of the gate's return value (the historic bug was reading `gate.blocked`/`gate.sentence` when it returns `proceedAllowed`). Rate findings CRITICAL/HIGH/MEDIUM/LOW. Flag I4 violations.

**Agent B — WalletConnect + EIP-712**
Audit: `src/lib/WalletConnectProvider.jsx`, `src/wallet-core/evm/walletconnect/router.js`, `src/components/walletconnect/RequestApprovalModal.jsx`, `src/wallet-core/evm/typed-data.js`, `src/wallet-core/evm/walletconnect/session.js`. Check: presignGate in all signing handlers, phishing metadata lookup, chainId validation, v1/v3 blocking, topic-to-session binding, gas cap, fee griefing, domainless Permit acceptance. Rate findings CRITICAL/HIGH/MEDIUM/LOW.

**Agent C — Hardware KEK**
Audit: `android/app/src/main/java/com/veyrnox/app/HardwareKekPlugin.kt`, `android/app/src/main/java/com/veyrnox/app/AndroidBiometricCachePlugin.kt`, `ios/App/App/HardwareKekPlugin.m` (Objective-C — there is NO `HardwareKekPlugin.swift`), `ios/App/CapApp-SPM/Sources/CapApp-SPM/EnclaveKeyService.swift`, `src/wallet-core/keystore/kek.js`, `src/wallet-core/keystore/native.js`, `src/wallet-core/keystore/fastpathDekCache.js`, `src/wallet-core/keystore/web.js`. Check: StrongBox backing, DEVICE_CREDENTIAL auth, iOS SE vs Keychain naming (I4), H/C/dek zeroing after combineKek, biometric invalidation on enrollment change. Rate findings CRITICAL/HIGH/MEDIUM/LOW.

**Agent D — Auth gates + keystore**
Audit: `src/lib/WalletProvider.jsx`, `src/lib/biometricUnlock.js`, `src/lib/pinAttemptGuard.js`, `src/lib/twoFactorGate.js`, `src/wallet-core/credentialVerifier.js`, `src/lib/copySecret.js`. Check: timing equalizer vs current KDF cost, PIN counter in localStorage, biometric cache invalidation, captureVerifierSafe OOM handling, copySecret wipe sentinel and visibilitychange. Rate findings CRITICAL/HIGH/MEDIUM/LOW.

### Step 3 — Write the report
Get today's date from the system: `date +%Y-%m-%d`.

Write the findings to `docs/audit-<DATE>-weekly.md` using this structure:

```markdown
# Internal Security Audit — <DATE>
## Scope: RASP · WalletConnect · Hardware KEK · Auth Gates (Weekly)

> **Internal static-analysis pass.** Conducted by internal Claude specialist agents.
> Static code review only — no dynamic testing, no on-device verification.
> An independent third-party audit remains RECOMMENDED (see CLAUDE.md §Hard rules).

Conducted: <DATE>
Method: Static code analysis via parallel specialist agents (4 agents × 4 surfaces)
Branch audited: `<current branch at time of audit>`
Status: **Findings only — nothing fixed. Do not mark anything verified without on-chain txid or on-device evidence.**

---

## Changes since last audit
<summarise recent git commits that affect security-relevant files>

## CRITICAL / HIGH / MEDIUM / LOW findings
<structured findings from all four agents — severity, area, file:line, description, recommended fix>

## Status vs prior audit
<for each prior finding: FIXED / STILL PRESENT / REGRESSED>

## INFO / PASS
<controls confirmed working>
```

### Step 4 — Commit, push, open a PR, then remove the worktree

**Changed 2026-07-27** (was: "commit to main only — do NOT push or open a PR").
Direct commits to `main` are not possible: the `Veyrnox Code Review` ruleset
requires a pull request. The commit itself was never blocked — a ruleset gates
the push — so the audit landed as a local commit in whatever checkout the task
ran in and never reached `origin/main`. A weekly security audit nobody can read
is not an audit.

```bash
cd "${TMPDIR:-/tmp}/veyrnox-weekly-audit"
DATE=$(date +%Y-%m-%d)
git add "docs/audit-$DATE-weekly.md"
git commit -o "docs/audit-$DATE-weekly.md" \
  -m "docs(audit): weekly internal security audit $DATE"
git push -u origin "security-audit/$DATE"

gh pr create --base main --head "security-audit/$DATE" \
  --title "docs(audit): weekly internal security audit $DATE" \
  --body "Automated weekly internal audit. Static code analysis by internal Claude specialist agents — no dynamic testing, no on-device verification, no on-chain confirmation. INTERNAL: this is NOT the outstanding independent third-party audit."

gh pr merge --squash --auto

cd /Users/aljobson/Documents/GitHub/veyrnox
git worktree remove --force "${TMPDIR:-/tmp}/veyrnox-weekly-audit"
```

`git add` must come first — `git commit -o` errors on an untracked path and the
report is new every run. Keep the `-o` pathspec (stray-artifact guard; see
`scripts/check-stray-files.mjs`). Never `git add -A`, `git add .`, or `commit -a`.

**Use `--auto`, never `--admin`.** If `main` is red the PR waits — correct.

**Which red actually blocks you.** Five contexts gate `main` (union of the ruleset and
classic protection): `verify`, `unit-tests`, `Release-cert guard rejects wrong
fingerprints`, `mainnet-flag-gate`, `staging-gate`. `xcuitest` and `monkey` are NOT among
them and both go red on `main` for reasons unrelated to any given PR — do not treat either
as a blocker, and do not "fix" a PR because of them. Equally: if a required check fails on
a report-only PR, suspect that `main` itself is broken before suspecting the report; on
2026-08-25 an inherited failure from an unrelated merge looked like a defect in two PRs
that had none.

### Step 5 — Confirm it landed

A findings report that stops at "committed" is the failure this task just had.
Do not report success until the PR merges. Arm a watcher rather than polling
(bash, via the Monitor or Bash tool):

```bash
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

Report exactly one of: ✅ merged to `main` (give the squash commit); ⚠️ PR open,
awaiting checks; 🔴 PR blocked by a failing check (name it). **Never describe an
unmerged PR as landed.**

Always remove the worktree, including when the run aborts.

## Hard constraints
- Do NOT mark anything "verified" without a real on-chain txid or on-device evidence
- Do NOT flip any asset status or feature status
- Push ONLY the per-run `security-audit/<DATE>` branch. NEVER push to `main`.
- NEVER merge with `--admin` or bypass a required check
- Do NOT `git checkout`/`git switch` in the primary working directory
- Do NOT delete a branch whose PR has not merged — it is the only copy
- Do NOT mock or stub any security control
- Status tags: BUILT (code present, tests green), TARGET (designed, not confirmed shipped), PLANNED (roadmap)
- This is an INTERNAL audit — never describe it as "independent" in the report header