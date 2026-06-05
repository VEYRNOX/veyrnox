# Veyrnox — Real Encrypted Seed-Backup: Design Spec

**Date:** 2026-06-05 · **Status:** DESIGN SPEC — build GATED on independent audit.
**Scope:** Encrypted seed export to a user-stored file/QR, password-derived key; and restore.

> ⚠️ HIGHEST-STAKES FEATURE IN THE WALLET. This handles the seed directly — the asset whose
> compromise or loss is CATASTROPHIC and UNRECOVERABLE (A1). This document is a REQUIREMENTS
> + THREAT brief, NOT a finished cryptographic design. It deliberately does NOT fix the final
> KDF parameters, cipher, or encoding as authoritative — those MUST be chosen and reviewed by
> a qualified cryptographer / the independent audit BEFORE any build. Shipping unaudited crypto
> on this feature is the exact risk the audit blocker exists to prevent. A spec existing here
> does NOT mean the crypto is "designed."
>
> CONTEXT: This replaces the FAKE seed-QR removed in #87 (a decorative canvas that encoded
> nothing but was printable as a "backup" → fund loss on restore). The bar: a real backup must
> never be able to silently fail to restore.

## 1. Why this is dangerous (failure modes that lose funds or seeds)
- Silent restore failure — a backup that looks valid but can't reconstruct the seed (the #87 sin). MUST be impossible by construction (verify-on-create, below).
- Weak/again-the-#87 encoding — QR/file that doesn't actually contain recoverable data.
- Weak key derivation — password → key with too-cheap KDF → brute-forceable backup → seed theft.
- Cipher misuse — nonce reuse, missing authentication (tamper/partial-corruption undetected), wrong mode.
- Plaintext leakage — seed in memory/disk/logs/clipboard during export; temp files; swap.
- Backup confusion — restoring the wrong/old backup; no way to tell which wallet without leaking which wallet.
- Deniability interaction — a backup that reveals the existence of a hidden/decoy wallet (A3) defeats the deniability stack.

## 2. Invariants (non-negotiable — a design violating any is rejected)
- B1 — No silent restore failure. The system MUST verify, at creation time, that the backup actually round-trips to the exact seed (decrypt + derive + compare) BEFORE telling the user it succeeded. If it can't prove restorability, it fails honestly and produces nothing.
- B2 — Confidentiality at rest. The backup artifact is useless without the user's password. Key derived from password with an audited, deliberately-expensive KDF (parameters = audit decision).
- B3 — Authenticated. Tampering or corruption is DETECTED on restore (authenticated encryption), never silently producing a wrong seed.
- B4 — No plaintext seed egress. Seed plaintext never written to disk, logs, analytics, clipboard history, temp files, or any backend. All crypto on-device. (Ties to backend invariants I1/I2.)
- B5 — Deniability-safe. A backup of a normal wallet must not reveal the existence of hidden/decoy wallets. Backup in deniability/duress context follows the deniability rules (likely: disabled, or backs up only the decoy). Exact behaviour = a deniability-design decision, flagged for review.
- B6 — Honest UX. The user is told, in plain language: this protects the backup with their PASSWORD; if they lose BOTH the backup and the password, funds are gone; the password is not recoverable. No false reassurance.
- B7 — Versioned format. The artifact carries a clear version/format identifier so future formats can be distinguished and migrated without ambiguity.

## 3. Functional requirements
- Export: user authenticates to the vault → chooses "encrypted backup" → sets a backup password (with strength guidance) → system produces an encrypted artifact (file and/or QR) → VERIFIES it round-trips (B1) → presents it for the user to store.
- Restore: user supplies the artifact + password → system authenticates + decrypts → validates (B3) → reconstructs seed → confirms by deriving the expected address(es) before adopting.
- Format: self-describing (version, KDF id + params, cipher id, salt, nonce, ciphertext, auth tag). Human-portable for QR (size limits — may require compact encoding or multi-part QR; a known constraint to design around, NOT by inventing a fragile scheme).
- No partial success: either a fully-verified backup is produced, or nothing is.

## 4. Threat model (who attacks the backup)
| Actor | Threat | Defended by |
|---|---|---|
| Thief who finds the file/QR | Brute-force the password → seed | B2 (expensive KDF) + strong-password guidance |
| Tamperer | Corrupt backup → wrong seed on restore | B3 (authenticated encryption) |
| Malware on-device during export | Capture plaintext seed | B4 + minimise plaintext lifetime in memory |
| Coercion (the persona) | Forced to reveal backup + password | Deniability interaction (B5); duress rules |
| Cloud/backup-sync (if user stores in cloud) | Provider reads artifact | B2 makes artifact opaque; warn user where they store it |
| Shoulder-surf / screen capture of QR | Read the backup visually | UX: warn; treat displayed QR as sensitive as the seed itself |

## 5. Design options (tradeoffs — selection is an AUDIT decision, not fixed here)
- KDF: memory-hard (argon2-family) vs PBKDF2-family. Memory-hard generally preferred; PARAMETERS (memory, iterations, parallelism) are an audit/perf decision targeting deliberately-slow derivation on target devices. DO NOT hardcode from this doc.
- Cipher: an authenticated mode (AEAD). Specific construction = audit decision; the REQUIREMENT is authentication (B3), not a particular algorithm picked here.
- RNG: salt/nonce from a CSPRNG only — crypto.getRandomValues, NEVER Math.random. (Extends the existing check:rng guard; hard rule, not an option.)
- Encoding: standard, well-tested encoding; for QR, respect capacity (compact binary + error correction, or multi-part). Avoid bespoke encoding schemes.
- Verification: round-trip check at creation (B1) is REQUIRED in every option.

## 6. Out of scope (this spec)
- Social recovery / shard-based recovery (separate, harder spec).
- Cloud auto-backup (conflicts with the wedge; if ever considered, client-encrypted only, opt-in, per the backend security architecture).
- The exact, final cryptographic parameters (audit decides).

## 7. Build gate (REQUIRED order)
1. This spec → reviewed/extended by a qualified cryptographer / the independent audit.
2. Cryptographic construction (KDF, AEAD, params, encoding) chosen and reviewed BEFORE coding.
3. Implementation against B1–B7, with round-trip verification (B1) and CSPRNG guard enforced in code + tests.
4. Audit of the implementation (test vectors, restore-failure tests, tamper tests, KDF cost).
5. Only then: ship — marketed as provisional until the broader audit completes.
DO NOT build the crypto from this document alone. It is the brief, not the design.

## 8. Acceptance criteria (what "done safely" looks like)
- Every created backup is proven to round-trip before the user is told it worked (B1) — tested.
- Tampered/corrupted backups are rejected on restore, never yield a wrong seed (B3) — tested.
- No seed plaintext appears in disk/logs/clipboard/temp/backend (B4) — verified.
- Deniability behaviour decided and tested (B5).
- UX copy reviewed for honest loss/recovery messaging (B6).
- All crypto choices carry an audit sign-off (build gate).

## Related
- (#87 fake seed-QR removal — the reason this exists) · docs/Production-readiness.md (audit blocker) ·
  docs/Backend-security-architecture.md (I1/I2 on-device, no egress) · wallet-core RNG (check:rng).
