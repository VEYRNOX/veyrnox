# Cipher Migration Analysis: AES-256-GCM → XChaCha20-Poly1305

**Date:** 2026-07-05  
**Status:** Analysis (NOT RECOMMENDED without compelling reason)  
**Scope:** Web, iOS, Android — all Veyrnox encryption contexts

---

## Executive Summary

Migrating Veyrnox's core AEAD cipher from AES-256-GCM to XChaCha20-Poly1305 is **technically feasible but HIGH complexity**, estimated **4–6 weeks of implementation + device verification**, with mandatory re-audit before mainnet shipping.

**Key blockers:**
1. XChaCha20-Poly1305 is not in the WebCrypto standard; requires a 3rd-party JS library.
2. iOS Secure Enclave does not support XChaCha20 in any Apple API variant—adopting it would require dropping native SE ECIES, degrading iOS's hardware-binding guarantee.
3. The KEK module is already tagged UNAUDITED-PROVISIONAL; any AEAD swap re-opens the audit gate.
4. Backwards-compatibility migration is non-trivial and requires device-verified txids on both platforms.
5. This is the first core-cipher migration in Veyrnox; no existing patterns apply.

**Recommendation:** Not recommended unless driven by a specific audit finding or threat model not addressed by AES-256-GCM + proper nonce discipline. If required, defer until post-mainnet (Q4 2026+) and budget for full re-audit.

---

## Current Architecture

### Canonical Implementation: Single Source of Truth

**`src/wallet-core/vault.js`** is the only place in the codebase where AEAD keys and nonces are constructed. All other modules are downstream consumers.

#### Seed Encryption (Password-Based)

```javascript
// vault.js:272–286: encryptVault(secret, password)
– Fresh 16-byte salt: randomBytes(16)
– Derive key: Argon2id(password, salt, KDF_PARAMS) → 32-byte key
– Fresh 12-byte nonce: randomBytes(12)  // GCM-specific
– Encrypt: crypto.subtle.encrypt({name:'AES-GCM', iv}, key, seedBytes)
– Output format: {v:1, kdf, salt, iv, ct} (all base64)

// vault.js:293–312: decryptVault(vault, password)
– Re-derive key with vault's recorded KDF params
– Decrypt: crypto.subtle.decrypt({name:'AES-GCM', iv}, key, ctBytes)
– Wrong password & tampered blob throw indistinguishably (deniability by design)
```

#### Seed Encryption (KEK-Based, Hardware-Bound)

```javascript
// vault.js:323–330: encryptVaultWithDek(secret, dek)
– Key is raw 32-byte DEK (no KDF, direct consumption of `dek` from KEK layer)
– Fresh 12-byte nonce: randomBytes(12)
– Encrypt: crypto.subtle.encrypt({name:'AES-GCM', iv}, dek, seedBytes)

// vault.js:338–348: decryptVaultWithDek(vault, dek)
– Inverse of above
```

### DEK-Wrap Layer (KEK → DEK)

**`src/wallet-core/keystore/kek.js`** wraps the DEK under the KEK (derived from hardware factor H + password factor C).

```javascript
// kek.js:68: KEK_LEN = 32  // 256-bit for AES-256-GCM wrap

// kek.js:186–239: combineKek(H, C)
– HKDF-SHA256(salt='veyrnox/kek/v1/combine(H||C)', IKM=H||C) → 32-byte KEK
– Not AEAD itself; feeds the wrap layer below

// kek.js:264–273: wrapDek(kek, dek)
– Fresh 12-byte nonce: randomBytes(12)
– Encrypt: crypto.subtle.encrypt({
    name:'AES-GCM',
    iv,
    additionalData: WRAP_AAD_V2  // Version-bound; L7 audit mitigation
  }, kek, dek)

// kek.js:290–317: unwrapDek(kek, wrapped)
– Version-dispatch on AAD: v1 (legacy, no AAD), v2 (current, WRAP_AAD_V2)
– Decrypt with appropriate AAD
```

### Consumers (All Downstream of vault.js)

| Module | What it encrypts | Key derivation |
|--------|------------------|-----------------|
| `src/wallet-core/panic.js:327` | Panic PIN marker | Argon2id(panicPassword, salt) |
| `src/wallet-core/stealth.js:413,486,613` | Multi-seed container (real + chaff) | Argon2id(secret, salt) |
| `src/wallet-core/auditLog.js:333` | Audit log JSON | Argon2id(auditSecret, salt) |
| `src/wallet-core/multiVault.js` | Multi-seed container (via vault.js) | Argon2id |
| `src/wallet-core/vaultBackup.js:216–217` | Backup container (dual encryption: password + PIN) | Two Argon2id derivations |
| `src/lib/seedQr.js:26,39` | QR-encoded seed | Argon2id(backup password, salt) |
| `src/wallet-core/keystore/web.js` | Vault/DEK management | Delegates to vault.js + kek.js |
| `src/wallet-core/keystore/native.js` | Vault/DEK management on mobile | Delegates to vault.js + kek.js |

**Key architecture fact:** None of these modules re-implement AEAD; they all call `encryptVault()` / `decryptVault()` or `wrapDek()` / `unwrapDek()`. This centralization is **good for migration** (one code change point) but reveals **IV hardcoding** (see below).

### Native Hardware Layers

**Android** (`HardwareKekPlugin.kt:311`):
- Uses **HMAC-SHA256** only, backed by `AndroidKeyStore` (StrongBox-preferred).
- Returns the 32-byte H factor to JS (base64-encoded across the Capacitor bridge).
- Does NOT perform AES-GCM natively; encryption happens in JS (`vault.js` / `kek.js`).

**iOS** (`HardwareKekPlugin.m:62`):
- Uses Apple's `kSecKeyAlgorithmECIESEncryptionCofactorX963SHA256AESGCM` — a **black-box composite primitive** (ephemeral ECDH + X9.63-SHA256 KDF + **AES-GCM** internally).
- The AES-GCM step is **non-configurable**; it's baked into Apple's ECIES composite.
- Wraps/unwraps the 32-byte H factor; returns H to JS (base64-encoded across the bridge).
- JS-side encryption is still `crypto.subtle.encrypt` (AES-GCM) in `vault.js` / `kek.js`.

**Bottom line:** Android's native layer is cipher-agnostic (HMAC only); iOS's native layer has an **embedded AES-GCM** that cannot be swapped without abandoning the Secure Enclave ECIES mechanism.

---

## Complexity Analysis

### I. Core Codebase Changes

#### 1. IV/Nonce Length Coupling (⚠️ HIGH RISK)

The 12-byte nonce is **hardcoded in 4 separate places**, not centralized in a single helper:

| File:line | Context |
|-----------|---------|
| `vault.js:274` | `encryptVault()` seed encryption (password path) |
| `vault.js:324` | `encryptVaultWithDek()` seed encryption (KEK path) |
| `kek.js:266` | `wrapDek()` DEK wrap |
| `vaultBackup.js` | Backup container dual-encryption (not located yet but exists) |

**Migration impact:**
- XChaCha20-Poly1305 requires 24-byte nonces.
- Each call site must be updated independently.
- Each update must be tested (new test fixtures for 24-byte nonces).
- **Effort: 2–3 days.**

#### 2. KDF Output Length Coupling (✅ COMPATIBLE)

```javascript
// vault.js:50
KDF_PARAMS.hashLength = 32  // "256-bit key for AES-256"
```

**Migration impact:**
- XChaCha20-Poly1305 also uses 32-byte keys. ✅ **No change needed.**
- Comment should be updated to "256-bit key for AEAD" to remove AES specificity.
- **Effort: 0 days (comment-only).**

#### 3. Chaff Indistinguishability (⚠️ CRITICAL FOR I3)

**`src/wallet-core/stealth.js:306–311`** generates decoy ciphertext blobs:

```javascript
// Generate decoy blobs that are indistinguishable from real AES-GCM output
const decoyBlob = randomBytes(seedLength + 16)  // +16 for GCM tag
```

**Migration impact:**
- XChaCha20-Poly1305 has a **128-bit (16-byte) authentication tag**, same as AES-GCM. ✅ **Tag length compatible.**
- However, the comment and logic must verify the new cipher's output distribution is truly indistinguishable without the key.
- **Deniability (I3) depends on this property**; any visual or statistical difference between real and decoy breaks deniability.
- **Effort: 3–5 days (generator refactoring + cryptographic review).**

#### 4. Backwards Compatibility & Migration Path (⚠️ MAJOR)

**Current state:**
- `vault.js` format version is `v: 1` only; no version-2 yet exists.
- `vaultBackup.js` has binary versioning (`BIN_VERSION`) and legacy text format support.
- `kek.js` has wrap format versioning (v1 legacy/no-AAD, v2 current/AAD-bound), both AES-GCM.
- `hardwareKekVersion` (stamped on vault blob) has protocol versions (1/2/3) for HMAC salt binding, but all use AES-GCM for DEK wrap.

**Migration path required:**
- **Vault format v2:** New seed-vault blobs use XChaCha20-Poly1305; old v1 blobs remain AES-GCM.
- **Lazy re-encryption on unlock:** When user unlocks a v1 vault, re-encrypt to v2 on save (amortize cost, no forced migration).
- **Dual-cipher decryption:** `decryptVault()` must support both v1 (AES-GCM) and v2 (XChaCha20-Poly1305) as input.
- **Dual-cipher encryption:** `encryptVault()` produces v2 by default; v1 production ceases.
- **All downstream consumers** must respect the format version and dispatch correctly.

**Precedent in codebase:**
- Similar to `hardwareKekVersion: 1→2→3` lazy upgrade pattern.
- Wrap AAD versioning (v1/v2) exists but doesn't swap the cipher, only AAD binding.
- **This is the first core-cipher migration; no exact pattern to follow.**

**Effort: 1–2 weeks (design versioning scheme, implement dual-cipher decrypt, lazy re-encrypt on unlock, test all paths).**

#### 5. Test Fixtures & Coverage

All existing unit tests construct AES-GCM ciphertexts manually to simulate legacy blobs:

| Test file | Fixture type |
|-----------|--------------|
| `tests/wallet-core/vault-migration.test.js` | Legacy v1 vaults + migration scenarios |
| `tests/wallet-core/kek.wrap-aad.test.js` | Wrap v1 (no AAD) + v2 (AAD-bound) |
| `tests/wallet-core/change-password.test.js` | Password derivation + re-encryption |
| `tests/panic.test.js` | Panic PIN encryption |
| `tests/stealth.test.js` | Decoy blob generation + indistinguishability |

**Migration impact:**
- Each test file must have **dual-cipher fixtures** (v1 = AES-GCM; v2 = XChaCha20-Poly1305).
- Tests for lazy re-encryption path (`v1 unlock → v2 save`).
- Tests for both platforms (web + mobile, via mocks).
- **Effort: 1 week (test refactoring + new fixture generation).**

---

### II. Platform-Specific Challenges

#### Web Platform

**Current:**
- `crypto.subtle.encrypt()` with `{name:'AES-GCM'}`.

**XChaCha20-Poly1305 availability:**
- **NOT in WebCrypto standard** as of 2026.
- Must use a 3rd-party library: `libsodium.js` (best compatibility, ~200KB gzipped), `TweetNaCl.js` (minimal, ~20KB), or `sodium-plus` (Sodium modern bindings).

**Migration path:**
```javascript
// Current
crypto.subtle.encrypt({name:'AES-GCM', iv}, key, plaintext)

// New (example: libsodium.js)
sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, null, key, nonce)
```

**Blockers:**
- Adds external dependency (audit gate on the library).
- Browser support: LibSodium.js works in all modern browsers but adds 200KB to the bundle.
- Key import/export different (raw Uint8Array vs. WebCrypto `CryptoKey` interface).

**Effort: 1 week (integrate library, test in-browser, audit dependency).**

#### Android Platform

**Current:**
- **JS side:** `crypto.subtle.encrypt()` (WebCrypto, falls back to polyfill on older Android).
- **Native side:** `Cipher.getInstance("AES/GCM/NoPadding")` in `HardwareKekPlugin.kt` (HMAC-only, no AEAD on native).

**XChaCha20-Poly1305 availability:**
- **Native:** Available in Android API ≥28 via `Cipher.getInstance("ChaCha20/Poly1305")`.
- **API <28 fallback:** Not natively available; would require Conscrypt or a custom BoringSSL build (high friction).
- **JS side:** Same WebCrypto issue as web (not standard; requires 3rd-party library).

**Migration path:**
```kotlin
// Current (HMAC for H, but seed wrap is JS-side AES-GCM)
Mac.getInstance("HmacSHA256")  // on native (H generation)

// New (native HMAC unchanged, but seed wrap JS-side would be XChaCha20)
// No changes needed on native for cipher swap; only JS sees the change
```

**Architecture detail:** Android native only does HMAC (H factor); the DEK wrap happens in JS (vault.js/kek.js). So **Android native doesn't need changes**, only the JS-side library integration.

**Effort: 1.5 weeks (library integration for both platforms, API gating for API <28 fallback, testing on real devices).**

#### iOS Platform (BLOCKER)

**Current:**
- **JS side:** `crypto.subtle.encrypt()` (WebCrypto polyfill on iOS Safari/Capacitor).
- **Native side:** Apple's `kSecKeyAlgorithmECIESEncryptionCofactorX963SHA256AESGCM` in `HardwareKekPlugin.m`.

**XChaCha20-Poly1305 availability:**
- **WebCrypto:** Not in standard; requires 3rd-party library (same as web/Android).
- **Native:** NO Apple API variant supports XChaCha20 composite ECIES. Apple's ECIES composites all use AES-GCM (e.g., `kSecKeyAlgorithmECIESEncryptionStandardX963SHA256AESGCM`). ❌ **HARD BLOCKER.**

**Why this matters:**
- The Secure Enclave (SE) H factor is wrapped/unwrapped via ECIES in `HardwareKekPlugin.m:178` / `:291`.
- The SE H is non-extractable and biometric-gated (when biometric ACL is set).
- If we drop the native ECIES and derive H in JS instead, we lose the SE binding guarantee and regress to "H is derived in JS" (same as web, but we wanted mobile hardware binding specifically).

**Migration scenarios:**

| Scenario | Trade-off | Impact |
|----------|-----------|--------|
| **A: Drop iOS native ECIES entirely** | Adopt XChaCha20 everywhere. | iOS H = JS-derived (loses hardware binding, biometric ACL enforcement). Vault security downgrades from "KEK = HKDF(SE-locked H ‖ C)" to "KEK = HKDF(JS H ‖ C)". Per CLAUDE.md hardware KEK phase goals, this is a regression. |
| **B: Keep iOS ECIES, use AES-GCM on native** | iOS uses AES-GCM (current); web/Android use XChaCha20. | Three different ciphers in the same wallet (unnecessary complexity, audit surface area increases). Defeats the purpose of swapping. |
| **C: Wait for Apple to add XChaCha20 variant** | Do not adopt XChaCha20. | Indefinite wait (unlikely, Apple favors AES-NI). |

**Effort (Scenario A, if chosen):** 2–3 weeks (drop ECIES, derive H in JS via a fallback path, update comments to reflect "J-only H" not "SE-locked", update audit findings to reflect the regression, device testing on iPhone).

**Effort (Scenario B):** 3+ weeks (not worth the complexity; dual-cipher maintenance nightmare).

**Recommendation:** Neither scenario is attractive. **iOS is a blocker for adopting XChaCha20 wallet-wide without accepting a security regression.**

---

### III. Audit & Verification Gates

#### 1. KEK Module is UNAUDITED-PROVISIONAL

From `src/wallet-core/keystore/kek.js:1–8`:
```javascript
// UNAUDITED-PROVISIONAL: cannot drop until an independent audit reviews
// the combine construction, the AEAD choice, and the deniability properties.
```

**Impact of cipher swap:**
- The phrase "**the AEAD choice**" explicitly calls out the cipher as in-scope for audit.
- Changing the cipher re-opens this audit gate.
- **Mainnet unlock (2026-06-17) was gated on the internal audit (complete, 2026-07-01) and is now LIVE.**
- **Any change to the AEAD requires independent re-audit before shipping the change to mainnet.**

#### 2. Hardware KEK Phase Status

From `CLAUDE.md` Hardware KEK Phase 1/2 Rollout:
- **Phase 1 (Web PIN via WebAuthn PRF):** ✅ BUILT, unit-tested, browser UAT pending testnet txids.
- **Phase 2 (Native Hardware KEK on iOS/Android):** 🟡 BUILT, device-verified (PARTIAL on iOS, FULL on Android per C-1 v3 fix on 2026-07-05).
- **Status:** BUILT + device-verified on unlock FLOW; NOT independently audited.
- **Outstanding:** Independent audit remains on the critical path for "verified" status (real explorer-confirmed txid per CLAUDE.md verify rule).

**Impact of cipher swap:**
- Any change to the DEK-wrap cipher (currently AES-256-GCM in `wrapDek`/`unwrapDek`) forces a re-audit of the KEK phase before it can be promoted to independent audit sign-off.
- This delays the Hardware KEK phase's path to "verified" status.

#### 3. Deniability Proof (I3 / Chaff Indistinguishability)

The stealth module generates decoy vaults that are cryptographically **indistinguishable** from real AES-GCM vaults without the key.

**Impact of cipher swap:**
- XChaCha20-Poly1305 and AES-256-GCM have **different output structures** (different nonce/IV sizes, potentially different tag formats to the naked eye).
- Must prove XChaCha20-Poly1305 chaff blobs are equally indistinguishable from real vaults.
- This is a **proof obligation**, not just a code change.
- Independent audit will verify this property; if it's not proven, I3 (deniability) is compromised.

---

### IV. Backwards-Compatibility Verification

Per CLAUDE.md "verify, don't assert": every migration path must be confirmed with a real on-chain testnet txid.

**Required device verification scenarios:**

1. **Web platform:**
   - Create a v1 (AES-GCM) vault on testnet.
   - Unlock and re-save as v2 (XChaCha20-Poly1305) — verify balance matches.
   - Send ETH from the v2 vault, confirm txid on block explorer.
   - Repeat on fresh XChaCha20 vault (non-migrated).

2. **Android platform:**
   - Create a hardware-KEK-enrolled v1 vault (StrongBox-wrapped DEK under AES-GCM `wrapDek`).
   - Unlock and re-save as v2 with StrongBox still active (verify StrongBox tier preserved).
   - Send on Sepolia, confirm txid + `hardwareKekVersion` field on the vault blob.
   - Test on older API (API <28) to ensure fallback works.

3. **iOS platform (if scenario A is chosen):**
   - Create a non-SE vault on v2 (JS H derivation).
   - Send on Sepolia, confirm txid.
   - If scenario A is chosen, drop the ECIES path entirely and confirm biometric unlock still works (but no longer SE-backed; just password + biometric OS ACL).

**Effort: 2–3 weeks of parallel device testing across 3 platforms (Appium for Android, XCTest for iOS, browser automation for web).**

---

## Summary: Effort & Blockers

### Timeline Estimate

| Phase | Web | Android | iOS | Total |
|-------|-----|---------|-----|-------|
| Cipher swap + test fixtures | 2w | 1.5w | 2–3w (Scenario A) | 2–3w (parallelizable) |
| Vault migration + lazy re-encryption | 2w (shared across all platforms) | 2w | 2w | 2w (shared) |
| Backwards-compatibility device verification | 1.5w | 1.5w | 1.5–2w | 2–3w (parallelizable) |
| Independent re-audit | 4–6w (external; blocks mainnet deployment) | — | — | 4–6w (critical path) |
| **Total wall-clock (parallel work)** | — | — | — | **6–8 weeks** |

### Critical Blockers

1. **iOS Secure Enclave incompatibility** ❌
   - No Apple API supports XChaCha20 in ECIES.
   - Scenario A (drop ECIES) causes a security regression.
   - **Resolution:** Either accept the iOS regression or do not adopt XChaCha20.

2. **WebCrypto standard absence** ⚠️
   - XChaCha20-Poly1305 is not in WebCrypto; requires 3rd-party library.
   - Adds external dependency to audit scope.
   - **Resolution:** Choose a library (libsodium.js recommended), audit it, add to bundle.

3. **Audit gate re-opened** ⚠️
   - KEK module is UNAUDITED-PROVISIONAL; AEAD choice is in-scope.
   - Mainnet is live; any change requires independent re-audit before deployment.
   - **Resolution:** Budget 4–6 weeks for external audit after implementation; coordinate with audit firm.

4. **Deniability proof (I3)** ⚠️
   - Must independently verify chaff indistinguishability property.
   - Proof is part of the independent audit scope.
   - **Resolution:** Included in the independent re-audit.

---

## Recommendation

### Current Status (AES-256-GCM)

- ✅ Shipping on mainnet (2026-06-17 unlock, live).
- ✅ BUILT, internal audit complete (2026-07-01), unit-tested.
- ✅ Device-verified on unlock path (Android full, iOS partial per C-1 fix 2026-07-05).
- ⚠️ NOT independently audited (internal + independent audit both in-scope for "verified" status, per `kek.js` UNAUDITED-PROVISIONAL).
- ⚠️ Nonce size is 12 bytes; safe up to ~2^48 encryptions with random nonces (well within practical limits).

### Reasons to Swap

1. **Audit finding against AES-256-GCM** — None currently. The internal audit (2026-07-01, 1C/9H/12M/6L) reviewed the KEK construction and found no cipher-level issues.
2. **Nonce exhaustion threat** — Not a practical concern for this wallet; 2^48 random nonces is eons away.
3. **Hardware acceleration dependency** — AES-GCM is fast with AES-NI; without it, slower. But web/Android/iOS all have fast paths (WebCrypto or native crypto libraries).
4. **Simplicity** — XChaCha20 is simpler in some respects (larger nonce = less nonce-management discipline). But AES-256-GCM + proper random nonces is equally solid.

### Reasons NOT to Swap

1. **iOS Secure Enclave blocker** — Swapping ciphers requires either dropping native ECIES (security regression) or maintaining three different ciphers (web/Android = XChaCha20, iOS = AES-GCM; audit nightmare).
2. **Audit gate re-opens** — Fresh independent audit required; 4–6 weeks external critical path.
3. **No compelling threat model** — AES-256-GCM is a cryptographically sound AEAD; the internal audit found no issues.
4. **First core-cipher migration in the codebase** — Unprecedented; higher risk of introducing regressions.
5. **Mainnet is live** — Any change is a post-ship, high-scrutiny task; risk/reward is poor.

### Final Recommendation

**Do not adopt XChaCha20-Poly1305 without a specific audit finding, regulatory requirement, or threat model that AES-256-GCM does not address.**

If a compelling reason emerges (e.g., independent audit flags AES-256-GCM), **defer the swap until Q4 2026 (post-mainnet stabilization) and plan for:**

1. Independent re-audit (4–6 weeks, external).
2. Full implementation + device verification (2–3 weeks, parallel).
3. iOS compromise decision (accept security regression or maintain dual-cipher architecture).
4. Staged rollout: testnet first (verify txids on both old/new paths), then gradual mainnet migration (lazy re-encryption on unlock).

The wallet's current AES-256-GCM + proper nonce discipline is solid and audited (at internal level); swapping for XChaCha20 is a "nice-to-have" optimization, not a security requirement.

---

## References

- `src/wallet-core/vault.js` — Canonical AEAD implementation.
- `src/wallet-core/keystore/kek.js` — KEK/DEK wrap layer.
- `src/wallet-core/keystore/hardware.js` — JS bridge to native H factors.
- `ios/App/App/HardwareKekPlugin.m:62` — iOS ECIES composite (AES-GCM inside).
- `android/app/src/main/java/com/veyrnox/app/HardwareKekPlugin.kt:311` — Android HMAC (no AEAD).
- `src/wallet-core/stealth.js:306–311` — Chaff blob generation (deniability).
- `src/wallet-core/keystore/CLAUDE.md` — Hardware KEK phase plan & audit status.
- `docs/Feature-Status.md` §4 — Hardware KEK phase status.
- `docs/audit-2026-07-01-kek-internal.md` — Internal static-analysis audit findings.
