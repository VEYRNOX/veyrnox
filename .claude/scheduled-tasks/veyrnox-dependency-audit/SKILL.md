---
name: veyrnox-dependency-audit
description: Weekly npm audit for Veyrnox — flags CVEs in crypto/wallet dependencies and spawns fix agents for CRITICAL/HIGH
---

You are running the weekly dependency security audit for the Veyrnox wallet. Veyrnox is a self-custody crypto wallet (Vite + React + Capacitor; ethers v6; @noble/@scure). Mainnet is live.

Working directory: C:\Users\aljob\Downloads\Veyrnox

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

### Step 5 — Commit the report
```
git add docs/dependency-audits/dep-audit-<DATE>.md
git commit -m "docs(deps): weekly dependency audit <DATE>"
```

### Step 6 — If CRITICAL or HIGH vulnerabilities found in security-critical packages
If any CRITICAL or HIGH CVE affects `@noble/*`, `@scure/*`, `ethers`, or `@walletconnect/*`:

1. Check if `npm audit fix` would resolve it without breaking changes: run `npm audit fix --dry-run 2>&1`
2. If safe: run `npm audit fix`, then run `npm test` to confirm tests still pass
3. If tests pass: commit the fix with message `fix(deps): npm audit fix <DATE> — <package> CVE`
4. Do NOT run `npm audit fix --force` (breaks semver)
5. Do NOT push or open a PR

## Hard constraints
- Do NOT push to remote
- Do NOT open a PR
- Do NOT run `npm audit fix --force`
- Do NOT modify source files (only package.json/lock if audit fix applies)
- Report findings honestly — "no vulnerabilities found" is a valid and good outcome