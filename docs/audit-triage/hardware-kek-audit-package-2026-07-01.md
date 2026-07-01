# Hardware KEK (H-NEW-D) — Independent Audit Package

**Date:** 2026-07-01
**Status:** BUILT / device-verified (PARTIAL) / **UNAUDITED-PROVISIONAL**
**Scope target:** the native mobile Hardware Key-Encryption-Key (KEK) that binds the
PIN-derived vault key to platform hardware — **iOS Secure Enclave (ECIES)** and
**Android StrongBox/Keystore (HMAC)**. This is the §24 audit gate for Phase 2 native KEK.

> This package consolidates everything an independent reviewer needs to assess H-NEW-D.
> It is deliberately honest about what is proven vs. assumed. Nothing here promotes the
> feature to "verified" — that requires this audit's sign-off plus the outstanding
> device tests in §7.

---

## 1. What is being audited

The offline-seizure threat: an 8-digit PIN over Argon2id is exhaustible offline on a
seized, seized-at-rest device in hours–days. H-NEW-D closes that by wrapping the vault's
data-encryption key (DEK) under a KEK that requires a **hardware factor H** which never
leaves the secure element and is released only per-use behind biometric auth.

| Platform | Hardware factor H | Binding | PR |
|---|---|---|---|
| **iOS** | Secure Enclave P-256 key; H = ECIES-decrypt(ciphertext) | `.biometryCurrentSet` ACL, non-extractable, Face ID per-use | #495, #502 |
| **Android** | AndroidKeyStore HMAC-SHA256 key (StrongBox-preferred) | `setUserAuthenticationRequired`, `setInvalidatedByBiometricEnrollment` | #366, #389, #496, #497 |

**Not in scope of this package:** the web WebAuthn-PRF KEK (Phase 1, separate), the
audited BIP-39/-32/-44 derivation and signing primitives, and RASP/network hardening
(covered by their own audit docs).

---

## 2. Threat model

**Closes (design intent):**
- Offline PIN exhaustion on a seized device — the DEK cannot be unwrapped without H, and
  H requires the live secure element + a fresh biometric. PIN guesses can't be validated
  offline.
- Cross-device migration of the vault blob — the SE/StrongBox key is device-bound and
  non-extractable; copying the encrypted blob to another device yields no H.

**Explicitly does NOT close (honest limits):**
- A compromised, unlocked, running device (in-context code after a successful unlock).
- Coercion (covered separately by duress PIN / deniability, not KEK).
- Android devices without StrongBox — H15 falls back to TEE / software AndroidKeyStore and
  **honestly reports the true tier** (`securityLevel`); it does NOT enforce StrongBox.
- The **password/PIN remains THE recovery secret** — KEK is a *layer on top*, never the
  sole gate (a biometric reset must not permanently destroy the vault → fund loss).

---

## 3. Design & security invariants

**I6 — Hardware binding.** `KEK = HKDF-SHA256(ikm = H ‖ C, salt, info)`, DEK wrapped under KEK.
- **H** = hardware factor (iOS SE-ECIES output / Android Keystore HMAC), 32 bytes.
- **C** = `Argon2id(PIN, salt, 64 MiB, t=3)`, 32 bytes.
- Both H and C are REQUIRED; missing either throws (fail-closed, I4).

**I4 — fail honest / fail closed.** Every failure path (biometric cancel, wrong PIN, missing
SE key, key-invalidated, delete failure) rejects; H is never fabricated and the seed is never
decrypted on a partial success.

**Key lifetime.** H, C, the derived KEK, and the recovered DEK are zeroed on every path
(try/finally), including throw paths (H-NEW-6b, M20). Verified in `combineKek` and the
`native.js` KEK paths.

> ⚠️ **Reviewer item — doc/code divergence.** `CLAUDE.md` §I6 states `KEK = HKDF(H ⊕ C)`
> (XOR), but the code (`kek.js` `combineKek`, L109-131) uses `ikm = H ‖ C`
> (**concatenation**). Concatenation is the standard/stronger choice for HKDF IKM; the code
> is believed correct and the CLAUDE.md text imprecise. Please confirm and we will fix the
> doc. No other spec references XOR.

---

## 4. Code map (exact locations for review)

**KEK crypto primitives** — `src/wallet-core/keystore/kek.js`
- `combineKek(H, C)` L109 — HKDF-SHA256 over `H ‖ C`; zeroes IKM + inputs.
- `wrapDek(kek, dek)` L170 / `unwrapDek(kek, wrapped)` L186 — AES-GCM DEK wrap/unwrap.
- `KEK_HKDF_SALT` L67, `KEK_DOMAIN` info — fixed, reproducibility rationale in header.

**Native keystore orchestration** — `src/wallet-core/keystore/native.js`
- `_unlockInner` L221 — the KEK-gated unlock; `blob.kekWrap` present ⇒ requires
  `getHardwareFactor()` (H) + PIN (C); `unwrapDek` throws on wrong PIN/device (L249).
- `enrollKek` L481 — wraps DEK under KEK, writes `kekWrap`/`kekSalt`, `kdf:'kek-dek'` (L506-509).
- `unenrollKek` L524 — re-wraps DEK bare BEFORE deleting the credential (fail-closed ordering).
- `changePassword` L416 — KEK-preserving PIN rotation (re-wrap under new C) L426-458.
- `saveVaultContents` L348 — **KEK-preserving re-persist** (fix for the "unlock rewrites bare"
  bug, #497); never silently downgrades a kek-dek vault to bare (L356-377).
- `hasVaultKekWrap` L312 — the **source of truth** for "is the vault actually KEK-protected"
  (drives the settings badge after #497; replaces the old credential-existence check).

**Native plugins**
- iOS: `ios/App/App/HardwareKekPlugin.m` (297 L) + `.h` + `HardwareKekPluginBridge.m`
  (registration). ECIES via `SecKeyCreateEncryptedData/DecryptedData`, SE P-256 key,
  `.biometryCurrentSet` ACL. `clearCredential` fails honest on `SecItemDelete` failure (#502).
- Android: `android/app/src/main/java/com/veyrnox/app/HardwareKekPlugin.kt` — HMAC-SHA256
  key, StrongBox-preferred (`setIsStrongBoxBacked`), `setInvalidatedByBiometricEnrollment`,
  biometric-only auth (H16, no device-credential fallback), `securityLevel` tier probe (H15).

**JS bridge / UI**
- `src/wallet-core/keystore/hardware.js` — `getHardwareFactor`, `isHardwareEnrolled`,
  `clearHardwareCredential` (plugin wrappers).
- `src/components/security/HardwareKekSettings.jsx` — enroll / unenroll UI; badge now keys
  off `hasVaultKekWrap()` and reconciles stale credentials on mount.

---

## 5. Key flows (for reviewer tracing)

- **Enroll:** create SE/StrongBox key (no biometric) → `getHardwareFactor()` (biometric) →
  `combineKek(H, C)` → `wrapDek` → persist `kekWrap`. Rollback clears credential on failure.
- **Unlock (KEK vault):** `getHardwareFactor()` (biometric → H) + `Argon2id(PIN)` (C) →
  `combineKek` → `unwrapDek` → decrypt seed. Any leg fails ⇒ reject, seed never available.
- **Unenroll:** recover DEK → re-encrypt bare → write → THEN delete credential (order matters).
- **Re-persist on unlock:** `saveVaultContents` re-wraps under the existing DEK/KEK; the
  `lastUnlockAt` metadata stamp is skipped on KEK vaults to avoid a bare downgrade / extra
  biometric prompt (#497).

---

## 6. Device-verified evidence (what IS proven)

**iOS (iPhone 17 Pro Max):**
- Real SE-ECIES plugin device-verified; binary `superclass = CAPPlugin` (discovery bug fixed).
- Two Sepolia sends from a KEK-enrolled vault, both SUCCESS:
  `0xf09c036c…a926f37` (nonce 27, block 11178961) and `0x0b13d553…f85f4f9` (nonce 28, block
  11179002). Proof basis: fail-closed architecture — a KEK-wrapped vault cannot produce a
  valid signature without a successful SE-KEK unlock. (See `verified-evidence.json` →
  `_ios_hardware_kek_device_verification`, a non-promoting META key.)
- Badge-persistence bug fixed + device-confirmed (enroll→remove→force-stop→reopen ⇒ OFF).

**Android (Pixel 10 Pro XL, StrongBox):**
- H15: `enroll` lands the key in StrongBox (`securityLevel=2`), reproduced across cycles.
- H16: unlock prompt is `BIOMETRIC_STRONG`, no device-credential fallback.
- #497: enroll survives cold force-stop restart; StrongBox KEK gates unlock; badge stays ON.

---

## 7. Outstanding before "VERIFIED" (auditor should treat as open)

1. **Biometric re-enrollment invalidation test** — NOT done on either platform. Add/remove a
   biometric ⇒ the SE/StrongBox key must invalidate ⇒ unlock must fail-closed to password
   fallback (no silent bypass). This is the core I6 property and the last device leg.
2. **iOS live `getHardwareFactor` SE-unlock trace** tied to a send — proof to date is
   architectural, not an observed SE-unlock log line.
3. **Android Sepolia send** from a KEK-enrolled vault (iOS has txids; Android does not yet).
4. **Independent audit sign-off** — this document is the handoff; no third-party review yet.

---

## 8. Test coverage (JS layer)

- `src/wallet-core/keystore/__tests__/` — KEK suite (combine/wrap/unwrap, enroll/unenroll,
  KEK-preserving re-persist, unenroll reconcile, safe-write durability). Note: unit tests
  mock the native plugin — they prove the JS orchestration + fail-closed logic, NOT the
  native SE/StrongBox behavior (that is device-only, §7).
- KEK honesty tests enforce the "no fake security" / real-ECIES documentation contract.

---

## 9. Questions we most want the auditor to answer

1. Confirm the `H ‖ C` vs `H ⊕ C` intent (§3) and that concatenation is acceptable.
2. Is the fail-closed ordering in `unenrollKek` / `saveVaultContents` sound against a
   crash/kill mid-operation (no window where the vault is unreadable or silently bare)?
3. iOS Keychain persists across app uninstall — is the `hasVaultKekWrap`-driven badge +
   stale-credential reconcile a complete mitigation, or are there residual states?
4. Android StrongBox is preferred but not enforced (H15) — is the honest tier-reporting an
   acceptable posture, or should non-StrongBox devices be refused for KEK?
5. Key-material zeroing completeness (H, C, KEK, DEK) across all throw paths.
6. Is binding H to `.biometryCurrentSet` (iOS) / `setInvalidatedByBiometricEnrollment`
   (Android) sufficient to guarantee invalidation on biometric change, given §7.1 is untested?
