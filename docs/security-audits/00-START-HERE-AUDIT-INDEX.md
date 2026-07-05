# 🔒 VEYRNOX Internal Security Review (2026-07-05) — START HERE

> **PROVENANCE — INTERNAL AI-ASSISTED REVIEW, NOT INDEPENDENT.** This document set was
> produced by a Claude Code (AI) security-audit agent operated by the Veyrnox project
> itself. Per project rule I4, an internal review must never be presented as
> "independent." The only independent audit of Veyrnox to date is the third-party ECC
> audit (`docs/audit-triage/ecc-independent-audit-2026-06-23.md`). Mainnet was unlocked
> on 2026-06-17 via the internal audit gate
> (`docs/audit-triage/internal-audit-2026-06-17.md`); nothing in this document set
> amends or reopens that decision. The review's three original "critical blockers" were
> remediated in PR #598 (merged 2026-07-05); the crypto-divergence item is re-scoped in
> issue #611.

---

## 🎯 Quick Answer

**Verdict**: ✅ **FINDINGS REMEDIATED OR RE-SCOPED**
**Mainnet-gate impact**: none (gate decided 2026-06-17; unaffected)
**Open decision**: issue #611 — whether to fund an external crypto review (~$15K–25K)
**Non-blocking follow-ups**: pentest execution, #598 end-to-end verification, signed
releases, post-mainnet hardening

An earlier revision of this index said "CONDITIONAL MAINNET READY — 3-4 weeks — 3
critical blockers". That was written against a pre-#598 snapshot and is withdrawn: two
blockers were fixed in PR #598 the same day, and the third is re-scoped as a
non-blocking assurance task (issue #611).

---

## 📋 How to Use This Document Set

### 👔 Leadership/Product (10 min read)
→ Read: **INTERNAL-REVIEW-EXECUTIVE-SUMMARY.md**
- Findings status after PR #598
- The one open decision (issue #611)
- Non-blocking follow-up list

### 🔒 Security/Architecture (1-2 hours)
→ Read: **VEYRNOX-INTERNAL-SECURITY-REVIEW-2026-07-05.md**
- Re-baselined findings with remediation evidence
- Design-level verification of invariants, deniability, threat model
- Cryptographic design notes and open items (A-2, L-4)

### 👨‍💻 Engineering (historical context, 1-2 hours)
→ Read: **SECURITY-RECOMMENDATIONS.md** then **CRITICAL-FINDINGS-DEEP-DIVE.md**
- The original detailed blocker analysis and remediation guidance
- **Historical**: the blockers described were fixed in PR #598; read these for the
  reasoning and verification ideas, not as an open work list
- Both carry their own provenance banners

### 🧪 QA/Tester (1-2 hours — still current)
→ Read: **PENETRATION-TEST-EXECUTION-GUIDE.md**
- 74 test cases across 6 coercion-resistance scenarios
- Ready to execute; recommended non-blocking follow-up

### 🔐 Cryptographer
→ Read: **issue #611** (re-scoped statement of work), then
`docs/audit-triage/a2-deniability-kdf-param-timing-2026-06-23.md` and the ECC audit's
L-4 finding. There is no standalone crypto deep-dive document in this set — an earlier
revision advertised one, but the file was empty and has been removed.

### 🛠️ DevOps
→ Read: `docs/MAINNET_ACTIVATION.md` and `docs/MAINNET_GATE_DESIGN.md` (merged in
PR #598). There is no standalone supply-chain analysis in this set — an earlier revision
advertised one, but the file was empty and has been removed.

---

## 📁 Complete Document Set

1. **VEYRNOX-INTERNAL-SECURITY-REVIEW-2026-07-05.md** ⭐ — re-baselined full report
2. **INTERNAL-REVIEW-EXECUTIVE-SUMMARY.md** — stakeholder summary
3. **CRITICAL-FINDINGS-DEEP-DIVE.md** — historical detailed blocker analysis
4. **SECURITY-RECOMMENDATIONS.md** — historical roadmap
5. **PENETRATION-TEST-EXECUTION-GUIDE.md** — 74 executable test cases (current)

External references:
- `docs/audit-triage/ecc-independent-audit-2026-06-23.md` — the independent audit
- `docs/audit-triage/internal-audit-2026-06-17.md` — the mainnet gate decision
- PR #598 — remediation of this review's blockers
- Issue #611 — re-scoped crypto assurance task

---

## ✅ FINDINGS STATUS

| # | Finding | Status |
|---|---------|--------|
| 1 | CI ring-import enforcement | ✅ REMEDIATED — PR #598 |
| 2 | Vault cipher divergence (AES-256-GCM vs XChaCha20-Poly1305) | 🟡 RE-SCOPED — issue #611 (HIGH, assurance) |
| 3 | Mainnet deployment gate | ✅ REMEDIATED — PR #598 |

## 🚀 NEXT STEPS

1. **Security team**: decide issue #611 (fund external crypto review or accept residual
   risk with written rationale)
2. **QA**: schedule execution of the 74-case pentest suite
3. **Engineering**: end-to-end verification that #598's two gates block deliberate
   violations in CI
4. **DevOps**: signed releases (T5 — still TODO)

---

**Internal AI-Assisted Security Review** | **2026-07-05** | re-baselined post-#598
