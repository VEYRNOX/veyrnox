---
name: veyrnox-weekly-security-audit
description: Weekly parallel security audit of Veyrnox across RASP, WalletConnect, KEK, and Auth surfaces
---

You are running the weekly internal security audit of the Veyrnox wallet codebase. Veyrnox is a self-custody, coercion-resistant crypto wallet (Vite + React + Capacitor; ethers v6; @noble/@scure). Mainnet is live as of 2026-06-17.

Working directory: C:\Users\aljob\Downloads\Veyrnox

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
Dispatch four subagents in parallel (one per surface) using the Agent tool with `subagent_type: "secskills:mobile-pentester"` for RASP/KEK surfaces, `subagent_type: "secskills:web3-auditor"` for WalletConnect/EIP-712, and `subagent_type: "secskills:pentester"` for Auth/keystore. Brief each agent with:

**Agent A — RASP + RaspIntegrityPlugin (secskills:mobile-pentester)**
Audit: `android/app/src/main/java/com/veyrnox/app/RaspIntegrityPlugin.kt`, `src/rasp/` (all files), `src/sign-gate/presign.js`, `src/sign-gate/compose.js`, `src/pages/ColdSign.jsx`. Check: detection chain correctness, tamper-cert placeholder status, WARN-tier biometric enforcement gap, ColdSign hardcoded ALLOW, Magisk/Zygisk bypass exposure. Rate findings CRITICAL/HIGH/MEDIUM/LOW. Flag I4 violations.

**Agent B — WalletConnect + EIP-712 (secskills:web3-auditor)**
Audit: `src/lib/WalletConnectProvider.jsx`, `src/wallet-core/evm/walletconnect/router.js`, `src/components/walletconnect/RequestApprovalModal.jsx`, `src/wallet-core/evm/typed-data.js`, `src/wallet-core/evm/walletconnect/session.js`. Check: presignGate in all signing handlers, phishing metadata lookup, chainId validation, v1/v3 blocking, topic-to-session binding, gas cap, fee griefing, domainless Permit acceptance. Rate findings CRITICAL/HIGH/MEDIUM/LOW.

**Agent C — Hardware KEK (secskills:mobile-pentester)**
Audit: `android/app/src/main/java/com/veyrnox/app/HardwareKekPlugin.kt`, `ios/App/App/HardwareKekPlugin.swift`, `src/wallet-core/keystore/kek.js`, `src/wallet-core/keystore/web.js`. Check: StrongBox backing, DEVICE_CREDENTIAL auth, iOS SE vs Keychain naming (I4), H/C/dek zeroing after combineKek, biometric invalidation on enrollment change. Rate findings CRITICAL/HIGH/MEDIUM/LOW.

**Agent D — Auth gates + keystore (secskills:pentester)**
Audit: `src/lib/WalletProvider.jsx`, `src/lib/biometricUnlock.js`, `src/lib/pinAttemptGuard.js`, `src/lib/twoFactorGate.js`, `src/wallet-core/credentialVerifier.js`, `src/lib/copySecret.js`. Check: timing equalizer vs current KDF cost, PIN counter in localStorage, biometric cache invalidation, captureVerifierSafe OOM handling, copySecret wipe sentinel and visibilitychange. Rate findings CRITICAL/HIGH/MEDIUM/LOW.

### Step 3 — Write the report
Get today's date from the system (use PowerShell: `Get-Date -Format "yyyy-MM-dd"`).

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

### Step 4 — Commit to main
```
git add docs/audit-<DATE>-weekly.md
git commit -m "docs(audit): weekly internal security audit <DATE>"
```

## Hard constraints
- Do NOT mark anything "verified" without a real on-chain txid or on-device evidence
- Do NOT flip any asset status or feature status
- Do NOT push to remote or open a PR — commit to main only
- Do NOT mock or stub any security control
- Status tags: BUILT (code present, tests green), TARGET (designed, not confirmed shipped), PLANNED (roadmap)
- This is an INTERNAL audit — never describe it as "independent" in the report header