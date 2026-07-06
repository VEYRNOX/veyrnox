# Vault cipher external-review decision (issue #611) — 2026-07-06

> **WHAT THIS IS:** the audit-trail record for the CLOSED decision on issue #611 —
> whether to commission a standalone external cryptographer engagement (~$15K–25K,
> 1 week) to review the vault seed-encryption path (Argon2id → AES-256-GCM) and the
> claimed "divergence" from an XChaCha20-Poly1305 design spec.
>
> **PROVENANCE — INTERNAL, OWNER-DIRECTED.** The decision was made by the repository
> owner on 2026-07-06, on the recommendation of a Claude Code (AI) session, based on
> internal verification evidence plus two independent ECC audit passes (cited below).
> Per project rule I4 this record does not present internal evidence as independent.

| | |
|---|---|
| **Date** | 2026-07-06 |
| **Issue** | #611 (closed as completed; closing comment is the source record) |
| **Decision** | **Do NOT commission the standalone external crypto engagement.** Accept AES-256-GCM with written rationale; fold residual vault-crypto items into the scope of the next full independent audit. |
| **Decision class** | Defer-and-bundle. NOT "no external review ever" — the vault cipher path MUST be in the next independent audit's scope. |
| **Launch impact** | None. Mainnet unlocked 2026-06-17 (`internal-audit-2026-06-17.md`); this was never a gate. |

---

## Background

Issue #611 originated in the 2026-07-05 internal AI audit behind PR #609, which was
found by security review to be mislabeled "independent" and stale (see PR #609's
review thread). The issue was re-scoped 2026-07-05 to a genuine question: given the
existing evidence, does residual risk justify a paid external review of the vault
cipher path?

## Rationale

1. **The founding premise is unsupported.** `docs/crypto-implementation-verification.md`
   (2026-07-05, INTERNAL) established that **no XChaCha20-Poly1305 design spec exists
   in the codebase**. The only XChaCha20 references on main are the backend LLD
   (explicitly "sensible defaults, NOT audited choices") and
   `docs/cipher-migration-analysis.md`. There is no spec to have diverged from;
   AES-256-GCM *is* the construction.

2. **Migration would be actively harmful.** `docs/cipher-migration-analysis.md` prices
   the hypothetical AES-256-GCM → XChaCha20-Poly1305 migration at 4–6 weeks, HIGH
   complexity, mandatory re-audit — and XChaCha20 is unsupported by Apple APIs and
   WebCrypto, so adopting it would drop native iOS Secure Enclave ECIES and degrade
   the hardware-binding guarantee.

3. **The original technical questions are answered with file-level evidence**
   (`docs/crypto-implementation-verification.md`):
   - Argon2id 192 MiB / t=3 / p=1 (~10× OWASP 2023 memory minimum), with bounded
     param validation in `src/wallet-core/vault.js` ([1 MiB, 1 GiB] ceiling —
     KDF-bomb protection)
   - No-HKDF pipeline matches libsodium's canonical `pwhash` → `secretbox` pattern;
     HKDF is used where it belongs (KEK combine, domain
     `veyrnox/kek/v1/combine(H||C)`)
   - 96-bit fresh nonce per encryption, fresh key per unlock (nonce-reuse risk zero),
     128-bit tag; browser-native WebCrypto, no hand-rolled cipher code

4. **Independent coverage already exists where it matters.** ECC audit 2026-06-23
   (`ecc-independent-audit-2026-06-23.md`) confirmed the Argon2id + AES-256-GCM
   construction in the backup key-custody path (finding L-4 only). ECC KEK audit
   2026-07-01 (`ecc-hardware-kek-audit-2026-07-01.md`) resolved the one real
   divergence found (M1, KEK combine XOR→concatenation: "code is correct & stronger,
   doc-only").

5. **Better spend.** A full independent audit is already outstanding (KEK v3 fix
   chain, iOS device-gated items). One engagement with vault crypto IN SCOPE beats
   two engagements.

## Residual items carried into the next independent audit's scope

- **L-4** (ECC 2026-06-23): KDF params not bound into GCM AAD — future format version
- **A-2** (`a2-deniability-kdf-param-timing-2026-06-23.md`): pre-M3 KDF-param timing
  oracle — OPEN, device-gated, deliberately not blind-fixed
- JS-string heap zeroization limits (`vault.js` header note)
- Short-PIN offline resistance (mitigated by Hardware KEK Phase 2)
- Per-enrollment salt distinctness on device (unit-proven; one enrollment observed)

## Revisit triggers

Reopen this decision if any of the following occurs:
1. The next independent audit flags the vault cipher path
2. A WebCrypto AES-GCM implementation flaw surfaces in target browsers/WebViews
3. The threat model stops accepting T6 (rooted/jailbroken OS)

## Evidence index

- `docs/crypto-implementation-verification.md` — INTERNAL verification, 2026-07-05
- `docs/cipher-migration-analysis.md` — migration cost/feasibility analysis
- `docs/audit-triage/ecc-independent-audit-2026-06-23.md` — independent (ECC)
- `docs/audit-triage/ecc-hardware-kek-audit-2026-07-01.md` — independent (ECC), M1
- Issue #611 closing comment (2026-07-06) — decision record with full rationale
- PR #609 review thread — provenance correction of the originating audit
