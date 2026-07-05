# VEYRNOX Internal Security Review — Executive Summary

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

**Date**: 2026-07-05 (re-baselined against post-#598 `main`)

---

## 🎯 VERDICT: ✅ FINDINGS REMEDIATED OR RE-SCOPED

**Mainnet-gate impact**: none — the gate decision (2026-06-17) stands, unaffected.
**Open work**: one assurance decision (issue #611) + non-blocking follow-ups.

An earlier revision of this summary said "CONDITIONAL MAINNET READY, 3-4 weeks,
$15K-25K, ~40 person-days". That framing was written against a pre-#598 snapshot and is
withdrawn. The remediation it budgeted for was largely merged the same day in PR #598.

---

## ⚡ HEADLINE FINDINGS — STATUS

| # | Finding | Original rating | Status now |
|---|---------|----------------|------------|
| 1 | CI ring-import enforcement inactive | CRITICAL | ✅ **REMEDIATED** — PR #598 (`eslint/rules/ring-import-lint.js` + CI + tests) |
| 2 | Vault cipher diverges from design spec (AES-256-GCM vs XChaCha20-Poly1305) | CRITICAL | 🟡 **RE-SCOPED** — issue #611, HIGH assurance (not a gate) |
| 3 | Mainnet chain-key flip manual, ungated | CRITICAL | ✅ **REMEDIATED** — PR #598 (`scripts/detect-mainnet-flag-changes.js` + CI + docs) |

### What the design review confirmed (internal assessment)

- All 5 security invariants (I1–I5) hold at design level
- All 7 deniability properties (D1–D7) hold at design level, byte-level schema parity
  included — with one known open item (A-2, pre-M3 KDF-param timing, tracked in
  `docs/audit-triage/`)
- All 6 threat actors (T1–T6) mapped; T6 (rooted OS) honestly disclosed as a design limit
- No custom cryptography: `@noble` ecosystem, Argon2id, WebCrypto AES-256-GCM

---

## 💰 THE ONE OPEN DECISION

**Issue #611** — engage an external cryptographer (~$15K–25K, 1 week) to adjudicate the
AES-256-GCM vs XChaCha20-Poly1305 divergence, validate current Argon2id parameters
(note: reverted 192→64 MiB post-audit, commit `1226085e`), assess ECC finding L-4
(KDF params not in GCM AAD), and review open item A-2?

This is a **risk-appetite decision for the security team**, not a launch condition. The
ECC audit already confirmed the Argon2id + AES-256-GCM construction in the backup path.

---

## 📋 NON-BLOCKING FOLLOW-UPS

1. Execute the 74-case penetration test suite (`PENETRATION-TEST-EXECUTION-GUIDE.md`)
2. End-to-end verification that #598's ring-import rule and mainnet-flag gate each
   block a deliberate violation in CI
3. Signed releases (T5 supply chain — still TODO)
4. Post-mainnet hardening: OS-level RASP, hardware-backed biometric, per-set 2FA

---

## 📁 DOCUMENT SET

- **VEYRNOX-INTERNAL-SECURITY-REVIEW-2026-07-05.md** — full re-baselined report
- **CRITICAL-FINDINGS-DEEP-DIVE.md** — original detailed blocker analysis (historical;
  carries its own provenance banner; blockers since fixed in #598)
- **SECURITY-RECOMMENDATIONS.md** — original roadmap (historical; same provenance)
- **PENETRATION-TEST-EXECUTION-GUIDE.md** — 74 executable test cases (still current)
- `docs/audit-triage/ecc-independent-audit-2026-06-23.md` — the actual independent audit

---

**Prepared by**: Claude Code security-audit agent (internal, AI-assisted)
**Re-baselined**: 2026-07-05, against `main` after PR #598
