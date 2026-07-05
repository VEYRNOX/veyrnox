# VEYRNOX Wallet: Internal Security Review (AI-Assisted)

> **PROVENANCE — INTERNAL AI-ASSISTED REVIEW, NOT INDEPENDENT.** This document was
> produced by a Claude Code (AI) security-audit agent operated by the Veyrnox project
> itself. Per project rule I4, an internal review must never be presented as
> "independent." The only independent audit of Veyrnox to date is the third-party ECC
> audit (`docs/audit-triage/ecc-independent-audit-2026-06-23.md`). Mainnet was unlocked
> on 2026-06-17 via the internal audit gate
> (`docs/audit-triage/internal-audit-2026-06-17.md`); nothing in this document amends or
> reopens that decision. This review's three original "critical blockers" were
> remediated in PR #598 (merged 2026-07-05 19:31 UTC); the crypto-divergence item is
> re-scoped in issue #611.

**Date**: 2026-07-05 (re-baselined against post-#598 `main` on 2026-07-05)
**Review Type**: Internal, AI-assisted, design-level
**Scope**: Architecture, threat model, cryptographic design, feature assessment
**Status**: Findings remediated (PR #598) or re-scoped (issue #611)

---

## VERDICT

### ✅ FINDINGS REMEDIATED OR RE-SCOPED — no new mainnet-gate implications

This review's design-level verification found VEYRNOX architecturally strong for
coercion-resistant self-custody. The three findings originally rated critical were
fixed in PR #598 the same day this review concluded; the cryptographic divergence
question is tracked as an assurance task in issue #611. The mainnet gate decision
(2026-06-17) is unaffected.

An earlier revision of this document carried the verdict "CONDITIONAL MAINNET READY
(3-4 weeks)". That verdict was written against a pre-#598 snapshot and without awareness
of the 2026-06-17 gate decision; it is withdrawn, not amended.

---

## FINDINGS — STATUS AFTER PR #598

### Finding #1: CI Invariant Enforcement — ✅ REMEDIATED (PR #598)

**Original severity**: CRITICAL — the ESLint ring-import rule protecting the R0/R1
crypto-core boundary was never implemented; violations could merge undetected.

**Remediation evidence** (PR #598, merged 2026-07-05):
- `eslint/rules/ring-import-lint.js` — the ring-boundary rule
- `eslint.config.js` — rule wired into lint config
- `src/__tests__/ring-boundary-enforcement.test.js` — enforcement is test-pinned
- `.github/workflows/ci.yml` — runs in CI

**Residual work**: none identified at review level. Any follow-up should be a
verification task confirming the rule blocks a deliberate violation in CI.

### Finding #2: Crypto Implementation Divergence — 🟡 RE-SCOPED (issue #611)

**Original claim**: AES-256-GCM (implementation) vs XChaCha20-Poly1305 (design spec),
with no external review — rated CRITICAL blocker.

**Corrections against current `main`**:
- The ECC independent audit (2026-06-23) already confirmed "Argon2id (192 MiB) +
  AES-256-GCM" in the cloud-backup key-custody path and logged finding L-4 (KDF params
  not bound into GCM AAD). "Zero external review" was inaccurate.
- The Argon2id parameters cited in the original finding (m=192MB) are stale: the KDF
  was reverted to 64 MiB post-audit (commit `1226085e`; see
  `docs/audit-triage/a2-deniability-kdf-param-timing-2026-06-23.md`).
- Related open item A-2 (pre-M3 KDF-param timing oracle, deliberately not blind-fixed)
  belongs in the same cryptographer engagement.

**Disposition**: downgraded to HIGH assurance/hardening; full re-scoped statement of
work in issue #611. The divergence itself is real and a written accept-or-migrate
adjudication by an external cryptographer remains recommended — on its own merits, not
as a launch gate.

### Finding #3: Mainnet Deployment Gate — ✅ REMEDIATED (PR #598)

**Original severity**: CRITICAL — the testnet→mainnet chain-key flip was a manual edit
with no approval gate or audit trail.

**Remediation evidence** (PR #598, merged 2026-07-05):
- `scripts/detect-mainnet-flag-changes.js` — detects chain-key changes
- `docs/MAINNET_ACTIVATION.md`, `docs/MAINNET_GATE_DESIGN.md` — documented process
- `.github/workflows/ci.yml` — wired into CI

**Residual work**: none identified at review level. Any follow-up should be an
end-to-end verification that an unauthorized flip is actually blocked.

---

## DESIGN-LEVEL VERIFICATION (INTERNAL)

The following are **internal, design-level** assessments by this AI-assisted review.
They are not third-party assurance; the ECC audit (2026-06-23) is the independent
reference for the areas it covered.

### Security Invariants (I1–I5)

| Invariant | Internal assessment |
|-----------|--------------------|
| I1: Keys never leave device | On-device seed generation and signing; no key serialization found |
| I2: No silent egress | Deny-all egress allowlist; per-feature opt-in; no background telemetry found |
| I3: Deniability sacred | Duress PIN routes to decoy with hard egress cut; byte-level schema parity |
| I4: Fail honest, fail closed | Feature gates distinguish disabled from faked; non-fingerprinting errors |
| I5: Backend untrusted | Client-side encryption; no backend key knowledge; no addr↔acct mapping |

### Deniability Properties (D1–D7)

| Property | Internal assessment |
|----------|--------------------|
| D1: Decoy functionally identical | Same balance/UI/transaction surfaces |
| D2: Decoy↔primary byte-parity | 8192B JSON serialization, identical schema |
| D3: Hidden non-provable | No walletMeta entry; chaff masking |
| D4: No forensic oracle | No existence indicators in dumps reviewed |
| D5: Panic irreversible | Key destruction ordered before backup |
| D6: Audit log non-fingerprinting | No mode indicators; opt-in default |
| D7: Zero backend calls in duress | Hard egress cut in state machine |

**Known open deniability item**: A-2 (pre-M3 KDF-param timing divergence,
`docs/audit-triage/a2-deniability-kdf-param-timing-2026-06-23.md`) — a narrow,
audit-gated timing oracle on devices onboarded before the M3 param migration. Not
resolved by this review; folded into issue #611 scope.

### Threat Actor Coverage (T1–T6)

| Actor | Internal assessment | Residual risk |
|-------|--------------------|--------------|
| T1: Network observer | Egress allowlist, user RPC selection | LOW |
| T2: Backend breach | Client-side encryption, no backend keys | LOW |
| T3: Compromised device (pre-unlock) | Biometric + PIN, hardware keystore | MEDIUM (hardware varies) |
| T4: Physical coercion | Duress PIN, panic wipe, hidden/stealth | MEDIUM (user-dependent) |
| T5: Supply chain | Ring-import lint **ACTIVE via PR #598**; dependency pinning; signed releases still TODO | MEDIUM |
| T6: Rooted/jailbroken OS | Honest disclosed design limit | MEDIUM (disclosed) |

### Feature Assessment

| Feature | Internal assessment |
|---------|--------------------|
| Duress PIN & decoy wallet | Byte-parity and egress cut confirmed at design level; timing-disclosure test added in PR #598 |
| Audit log | Encryption design sound; opt-in; deniability-disclosure test added in PR #598 |
| Stealth/hidden wallets | Chaff pool and atomic reveal confirmed at design level |
| Panic wipe | Key-destruction-before-backup confirmed; ECC audit found residue gap CLOSED and test-pinned |
| Biometric unlock | App-layer only — honest T6 limit; app-layer disclosure test added in PR #598 |
| Hardware wallets | Trezor/Ledger integration with on-device address verification |

---

## CRYPTOGRAPHIC DESIGN NOTES

- **KDF**: Argon2id. Current at-rest parameters must be read from source — the review's
  original m=192MB figure was reverted to 64 MiB post-audit (commit `1226085e`).
  Parameter adequacy vs OWASP guidance is in issue #611 scope.
- **Vault cipher**: AES-256-GCM (WebCrypto). Diverges from the XChaCha20-Poly1305
  design spec; accept-or-migrate adjudication is issue #611.
- **KDF pipeline**: direct Argon2id → cipher key, no HKDF step. Soundness review is
  issue #611 scope.
- **AAD binding**: ECC finding L-4 — KDF params not bound into GCM AAD; noted for a
  future format version.
- **Signing**: ECDSA/EdDSA via `@noble/curves`; BIP-44 derivation; no custom crypto.

This review did **not** produce a standalone cryptography deep-dive or supply-chain
analysis. Earlier revisions of this document set advertised both as completed
deliverables while the files were empty; those files have been removed and the claims
withdrawn. The dependency and CI/CD assessments in this document are design-level only.

---

## RECOMMENDED FOLLOW-UP (NON-BLOCKING)

1. **Decide issue #611** — security team decides whether residual risk justifies the
   external cryptographer engagement (~$15K–25K, 1 week) given ECC audit coverage.
2. **Execute the penetration test suite** — 74 test cases across 6 coercion scenarios,
   `PENETRATION-TEST-EXECUTION-GUIDE.md` (restored in this document set).
3. **Verify #598 enforcement end-to-end** — confirm the ring-import rule and the
   mainnet-flag gate each block a deliberate violation in CI.
4. **Signed releases** — still TODO under T5; unchanged by #598.
5. **Post-mainnet hardening** — OS-level RASP, hardware-backed biometric, per-set 2FA
   (tracked in `SECURITY-RECOMMENDATIONS.md`).

---

**Review conducted by**: Claude Code security-audit agent (internal, AI-assisted),
operated by the Veyrnox project
**Re-baselined**: 2026-07-05, against `main` after PR #598
**Independent reference**: ECC third-party audit, 2026-06-23
(`docs/audit-triage/ecc-independent-audit-2026-06-23.md`)
