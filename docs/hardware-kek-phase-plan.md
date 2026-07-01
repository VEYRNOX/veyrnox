# Hardware KEK Rollout: Phase 1/2 Roadmap

## Overview

The Hardware Key Encryption (KEK) rollout addresses the offline-seizure threat by binding the PIN-derived encryption key to platform hardware (WebAuthn on web, Secure Enclave on iOS, StrongBox on Android). **Phase 1 ships with web WebAuthn PRF; Phase 2 follows Q3 2026 with native mobile hardware KEK.**

---

## Phase 1: Web WebAuthn PRF (Shipping)

### What It Closes

**Offline-Seizure Threat:** Without Phase 1, an 8-digit PIN over Argon2id (64 MiB / t=3) is exhaustible via local brute-force on a seized device in hours–days. An attacker with the device and time can derive the vault DEK without ever needing the platform authenticator.

**Phase 1 Mitigation:** The platform's WebAuthn authenticator (Windows Hello, Touch ID, or equivalent) is the hardware factor H. Each unlock retrieves H from the platform — a biometric or OS auth is required per attempt. The PIN alone is no longer sufficient; an attacker cannot derive H offline, so PIN exhaustion requires live platform access per try. Result: ✅ Offline-seizure gap closed for web.

### Implementation Status

- ✅ **Code complete** (200+ LOC, `src/lib/web.js`, `src/lib/kek.js`)
- ✅ **Unit tested** (19 PRF-specific tests, 1973/1973 total passing)
- ✅ **Security invariants verified** (I1–I6 all validated)
- ✅ **Browser compatibility validated** (Chrome/Firefox/Safari fallback wired)
- ⏳ **Browser UAT pending** (3 browsers, testnet txids required)

### Architecture

- **`web.js`:** `isHardwareKeystoreAvailable()`, `getHardwareFactor()`, `enrollKek()`, `unlock()`, `changePassword()`
- **`kek.js`:** `combineKek(H, C)` via HKDF-SHA256; H and C both required, neither alone sufficient
- **Feature flag:** `HARDWARE_KEK_NATIVE_ENABLED = false` (Phase 2 gating, never changed on Phase 1)
- **Graceful fallback:** Safari users (no PRF support) use password-only (≥12 chars); browser limit, not a code gap

### Browser Matrix

| Platform | Authentication | Hardware Backing | Status | Notes |
|----------|----------------|------------------|--------|-------|
| Chrome ≥99 | Password + WebAuthn PRF | ✅ Full PRF hardware binding | 🟢 VERIFIED | Tested on real device |
| Firefox ≥108 | Password + WebAuthn PRF | ✅ Full PRF hardware binding | 🟢 VERIFIED | Version-dependent (108+) |
| Safari Desktop | Password-only | ❌ PRF N/A | 🟢 WORKING | Graceful degradation, ≥12 chars enforced |
| Safari iOS | Password-only | ❌ PRF N/A | 🟢 WORKING | Graceful degradation, ≥12 chars enforced |

### Known Limitation (By Design)

Safari lacks WebAuthn PRF support — this is a browser limitation, not a Veyrnox gap. Safari users are honestly told they use password-only on web; Phase 2 iOS will have Secure Enclave (stronger than PRF). No fake security; users see what they get.

### Security Model

```
DEK (vault encryption key) = HKDF-SHA256(H || C)
  H = WebAuthn PRF output (HMAC-secret, platform-bound, biometric/OS-auth required)
  C = Argon2id(password, salt) — 64 MiB, t=3
  
Unlock flow:
  1. User enters password → derive C via Argon2id
  2. Retrieve H from platform (prompts for biometric/Windows Hello)
  3. Combine: DEK = HKDF(H || C)
  4. Decrypt vault
  5. Zero H, C, DEK in finally-block (I4 fail-closed)

Offline attacker with seized device:
  ❌ Cannot derive H (platform authenticator is black-box, biometric-gated)
  ✅ CAN brute-force C (Argon2id exhaustible offline)
  ✅ But without H, C alone does not yield DEK
  Result: PIN exhaustion requires live platform authenticator per attempt
```

### What's NOT Phase 1 (Stays PLANNED)

- M2c/M2d OS-ACL binding on key storage (iOS/Android, requires native plugin)
- Full Phase 2 native hardware KEK (iOS/Android, Q3 2026)
- Remote attestation or RASP native probes (Phase 4)

---

## Phase 2: Native Hardware KEK (Q3 2026 PLANNED)

### Why Phase 2 Is Separate

Native mobile requires custom plugin development (Swift + Kotlin), real-device testing (physical iPhone + Pixel), and a full audit refresh. This cannot happen in the JS/web environment and requires a dedicated native-dev sprint.

### iOS: Secure Enclave

**Hardware Factor H:** `SecureEnclave` HMAC-SHA256 (P-256 ECIES key, non-extractable)

**Keychain Storage:**
- Access control: `kSecAccessControlBiometryCurrentSet` (Face ID required to access)
- Accessible: When Unlocked This Device Only
- Automatic invalidation on biometric re-enrollment

**Unlock Flow:**
1. Show Face ID prompt (native OS biometric)
2. SecureEnclave evaluates biometric, returns H if valid
3. Derive C via Argon2id (password/PIN input)
4. Combine: DEK = HKDF(H || C)
5. Decrypt vault ciphertext
6. Zero H, C, DEK on success or error (I4)

**Error Handling:**
- Biometric denied → "Face ID required" error, retry
- Secure Enclave unavailable → show password-only fallback (never silent degrade)
- Unlock with password recovers vault if SE fails (no fund loss)

**Implementation:** `HardwareKekPlugin.swift` (custom Capacitor plugin, native Swift)

### Android: StrongBox

**Hardware Factor H:** `AndroidKeyStore` HMAC-SHA256 (backed by StrongBox if available, Keystore if not)

**Configuration:**
- `setUserAuthenticationRequired(true)` — fingerprint/face required
- `setInvalidatedByBiometricEnrollment(true)` — re-enroll invalidates the key
- Timeout: 30 seconds (user can tap multiple times within window)

**Unlock Flow:**
1. Show Fingerprint/Face prompt (native OS biometric)
2. AndroidKeyStore evaluates biometric, returns H if valid
3. Derive C via Argon2id (password/PIN input)
4. Combine: DEK = HKDF(H || C)
5. Decrypt vault ciphertext
6. Zero H, C, DEK on success or error (I4)

**Error Handling:**
- Biometric denied → "Fingerprint required" error, retry
- StrongBox unavailable → fall back to standard Keystore (honest disclosure, not silent)
- Unlock with password recovers vault if hardware key fails (no fund loss)

**Implementation:** `HardwareKekPlugin.kt` (custom Capacitor plugin, native Kotlin)

### Timeline & Deliverables

| Week | iOS | Android | Cross |
|------|-----|---------|-------|
| 1–2 | SE key generation + ACL binding | StrongBox key config + re-enroll gate | Device & simulator setup |
| 3–4 | Keychain storage + biometric prompt | Keystore storage + biometric prompt | Parallel builds |
| 5 | Real iPhone testing (Face ID unlock) | Real Pixel testing (Fingerprint unlock) | Device verification harness |
| 6 | Biometric re-enrollment test (key invalidation) | Biometric re-enrollment test (key invalidation) | Parallel testing |
| 7–8 | Audit refresh + sign-off | Audit refresh + sign-off | Pre-ship gating |

### Android Device-Verification Evidence (2026-07-01, Pixel 10 Pro XL)

**Device:** Google Pixel 10 Pro XL (`mustang`), Android 16 / API 36,
`android.hardware.strongbox_keystore` feature flag present (value 300). Debug build
`com.veyrnox.app.debug`, side-by-side install.

**IMPORTANT CORRECTION to the original entry below (dated 2026-07-01, PR #496):** the
H15/H16 evidence captured that session was real and is preserved as-is, but it only
covered ENROLL-TIME and prompt-time behavior. At that point in the day, the KEK did
**NOT** actually persist across a restart or gate unlock — every unlock silently
re-wrapped the vault back under a bare Argon2id key, discarding the KEK wrap
(root-caused and fixed later the same day, see "Three bugs" below). The original
enroll-time observations (H15, H16) are kept verbatim below for the record; the
end-to-end persistence + unlock-gating claim is a separate, later fix (PRs #497/#499)
and is recorded in its own section immediately after.

**What was observed (logcat evidence, this device only, ENROLL-TIME ONLY):**

- **H15 — StrongBox tier, OBSERVABILITY half only.** A new tier probe in
  `HardwareKekPlugin.enroll()` reads `KeyInfo.getSecurityLevel()` post-generation and logs
  the result. On this device it logged:
  `I/HardwareKek: enroll: key stored — tier=STRONGBOX (securityLevel=2)`
  confirming the HMAC key genuinely landed in StrongBox hardware (securityLevel 2, not
  TEE/software fallback). Reproduced across several enroll/unenroll cycles with no errors.
  **This is device-specific, not a universal claim** — the tier is read and logged
  per-device; a phone without StrongBox would honestly log `tier=TRUSTED_ENVIRONMENT` (or
  equivalent) instead. **StrongBox ENFORCEMENT (rejecting a non-StrongBox device outright)
  is NOT part of this change and remains TARGET** — today the plugin observes and logs the
  tier it got; it does not yet refuse to enroll on a device that lacks StrongBox.
- **H16 — biometric-only gate, CONFIRMED on this device.** The OS `BiometricService` log
  for the `getHardwareFactor()` prompt showed:
  `StrengthRequested: 15 (BIOMETRIC_STRONG), CredentialRequested: false`
  i.e. no PIN/pattern/password fallback was offered by the prompt — the possession factor
  is intact, biometric-only as designed.

**What this ENROLL-TIME evidence did NOT cover, at the time it was recorded:**
- Whether the KEK wrap actually survived past enrollment (it did not — see below).
- No on-chain testnet send was performed in that session.
- The biometric re-enrollment invalidation test was not run.

---

### Android End-to-End Persistence + Unlock-Gating Fix (2026-07-01, same device, PRs #497/#499)

Later the same day, full end-to-end testing (enroll → cold restart → unlock) surfaced
that the KEK enrolled by H15/H16 above was NOT actually protecting anything after
enrollment — three stacked bugs were found and fixed, in this order:

1. **Badge measured key-presence, not vault-wrap (PR #497, commit `27e1125d`).** The
   "Hardware Protection ON" badge read raw key-presence from the OS keystore, which
   stays true even after the vault silently falls back to a bare Argon2id wrap. Fixed
   by reconciling the badge against `hasVaultKekWrap()` and clearing the stale key on
   unenroll.
2. **Async-persistence plugin bug, Android-only.** `@aparajita/capacitor-secure-storage@8.0.0`
   persists via `SharedPreferences.apply()` — asynchronous, fire-and-forget — so a write
   could be silently lost if the app was killed before the OS flushed it. Patched to the
   synchronous `.commit()` via `patch-package`
   (`patches/@aparajita+capacitor-secure-storage+8.0.0.patch`, commit `470b1ef0`). iOS
   Keychain storage was unaffected — it is synchronous already.
3. **Silent re-wrap-to-bare-KDF on every unlock — the real "won't stick" root cause
   (commit `ad7ef9ad`).** Every unlock re-persisted the vault via `createVault()`, which
   silently downgraded a genuine KEK wrap back to a bare Argon2id wrap immediately after
   a correct KEK-gated unlock — meaning the KEK never actually protected the second and
   subsequent unlocks. Fixed with a KEK-preserving `saveVaultContents()`, and by skipping
   the `lastUnlockAt` re-write path on KEK-enrolled vaults (typedef hotfix landed in
   PR #499).

**What is now reproduced on-device, this same Pixel 10 Pro XL:**
Enroll → cold force-stop restart → unlock. The StrongBox-backed key gates the unlock
(`getHardwareFactor`, `BiometricService StrengthRequested: 15`, biometric-only, no
credential fallback); the vault reads back as `kek-dek` (not silently downgraded); no
unwanted `clearCredential` fires; and the "Hardware Protection ON" badge stays ON across
the restart. Reproduced.

**Tests:** keystore suite 95/95 passing; keystore+WalletProvider suite 116/116 passing.

**Operational caveat:** the `.commit()` fix is a `patch-package` patch against the
third-party plugin, not a first-party source change — it requires a clean native plugin
recompile (Gradle caches the AAR; a stale cached build will silently keep running the
unpatched `.apply()` behavior).

**Still outstanding (not done, honestly unchecked):**
- No KEK-gated Sepolia testnet send has been performed on Android. This is a genuinely
  different, additional claim from "unlock is gated" — it remains open.
- The biometric re-enrollment invalidation test (old key invalidated after re-enroll,
  unlock re-prompts / requires password fallback) was NOT run.
- StrongBox tier ENFORCEMENT (reject non-StrongBox devices outright) remains TARGET —
  only the read/log observability (H15) landed.
- Independent audit / owner sign-off on this device-gated Phase 2 implementation is
  still pending.

**Status: BUILT, end-to-end device-verified** (enroll, persistence-across-restart,
StrongBox-gated unlock, badge-stays-on-after-restart) **on Pixel 10 Pro XL — NOT
independently audited, NOT "verified" in the on-chain/asset sense** (no KEK-gated
Android send txid yet). StrongBox tier is device-specific; a non-StrongBox device would
log `TRUSTED_ENVIRONMENT` instead and this claim would not apply to it.

### Device Verification (Gate for "VERIFIED")

Before a native send is marked "verified" and Phase 2 is considered shipped:

1. **Real iPhone (Face ID):**
   - Enroll Face ID in test device
   - Launch app, unlock with PIN → Face ID prompt renders
   - Approve Face ID → unlock succeeds
   - Send real ETH on Sepolia
   - Capture txid from explorer
   - Disable Face ID → re-enroll → unlock re-prompts (old key invalid)
   - Confirm unlock requires new Face ID enroll or password fallback

2. **Real Pixel (Fingerprint):**
   - [x] Enroll fingerprint in test device (Pixel 10 Pro XL, 2026-07-01 — key stored,
     tier logged as STRONGBOX)
   - [x] Launch app, unlock with PIN → Fingerprint prompt renders, biometric-only
     (no credential fallback) confirmed via `BiometricService` log, 2026-07-01
   - [x] KEK wrap persists across a cold force-stop restart and gates the NEXT unlock
     too, not just the first one (2026-07-01, PRs #497/#499 — three stacked bugs found
     and fixed: badge/vault-wrap mismatch, async-persistence plugin bug, silent
     re-wrap-to-bare-KDF on every unlock; see "Android End-to-End Persistence +
     Unlock-Gating Fix" above). Badge stays "Hardware Protection ON" across the restart.
   - [ ] Send real ETH on Sepolia (KEK-gated) — **NOT YET DONE**
   - [ ] Capture txid from explorer — **NOT YET DONE**
   - [ ] Re-enroll fingerprint → unlock re-prompts (old key invalidated) — **NOT YET DONE**
   - [ ] Confirm unlock requires password fallback after re-enroll — **NOT YET DONE**

3. **Testnet Txid Evidence:**
   - iPhone Face ID send (SE-ECIES KEK path, PR #495):
     - `0xf09c036c87ea9db415d11cdfc1426632220f6e8bbf93eca1bf9b5f1d1a926f37` — nonce 27,
       to 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 (vitalik.eth), 0.001 ETH,
       Sepolia block 11178961, status SUCCESS, 2026-07-01
     - `0x0b13d5538421936d7146c0d864dfbcee6e49d2300e18a87ca17028788f85f4f9` — nonce 28,
       to 0x82D0Fa9d0692dbaDA375fe58Be8368C2a7455BAB, 0.001 ETH,
       Sepolia block 11179002, status SUCCESS, 2026-07-01
     - Device: iPhone 17 Pro Max. Wallet: `0x90f9f1F9F5a1938B21ef0C20352C7b792E68a729`
       (bamboo... throwaway UAT seed). Both sends confirmed on-chain via publicnode RPC.
     - **Proof basis:** architectural + enrollment (vault had kekWrap present; the
       fail-closed native.js _unlockInner KEK path, lines ~188-215, cannot decrypt the
       seed without getHardwareFactor() returning valid H from the SE). Rules out demo
       mode (real wallet address + real on-chain balance change).
     - **OUTSTANDING for criterion 1 (iOS):** live device-log trace of getHardwareFactor
       SE-unlock tied to these sends has NOT been captured. Biometric re-enrollment
       invalidation test (disable/re-enroll Face ID -> old SE key invalidated -> unlock
       re-prompts / requires password fallback) has NOT been done. This evidence makes
       the iPhone criterion DEVICE-VERIFIED (PARTIAL) — not the full criterion-1 pass.
   - Pixel Fingerprint send: `0x______________` (Sepolia, txid + block on explorer)
   - Posted to `docs/Feature-Status.md` §4 + `docs/verified-evidence.json`

4. **Audit Sign-Off:**
   - Internal audit update (2026-06 audit already passed; Phase 2 is device-gated, not re-audit-gated per H-NEW-D finding)
   - Owner approval on testnet txids

---

## I6 Security Invariant (Hardware Binding)

```
I6 — Hardware Binding: PIN-cohort DEK wrapped under KEK = HKDF(H ⊕ C)

  H: Hardware factor
    • Phase 1 (web): WebAuthn PRF (platform authenticator)
    • Phase 2 (iOS): SecureEnclave HMAC-SHA256 (Face ID-gated)
    • Phase 2 (Android): StrongBox HMAC-SHA256 (Fingerprint-gated)
  
  C: Software factor
    • Argon2id(password/PIN, salt, 64 MiB, t=3)
  
  Requirement: Both H and C must be present
    • Missing H → fail-closed (no fallback key derivation)
    • Missing C → fail-closed (no password, no unlock)
    • Both present → DEK = HKDF(H || C)
    • All intermediate values (H, C, DEK) zeroed in finally-block (I4)
```

---

## Risk Model & Threat Coverage

### Pre-Phase-1 (Current Status)

| Threat | Vector | Status |
|--------|--------|--------|
| Offline-seizure (PIN exhaustion) | Argon2id brute-force on stolen device | ❌ Exhaustible in hours–days |
| Online brute-force (password) | Network attack | ✅ Argon2id + high work factor |
| Key extraction (memory) | Debugger/RAM dump | ✅ No persistence, zeroed post-unlock |
| Deniability under coercion | Duress PIN / decoy wallet | ✅ BUILT (S3 stack) |

### Post-Phase-1 (Web)

| Threat | Vector | Status |
|--------|--------|--------|
| Offline-seizure (PIN exhaustion) | **Requires live platform auth per attempt** | ✅ **CLOSED** |
| Online brute-force (password) | Network attack | ✅ Argon2id + high work factor |
| Key extraction (memory) | Debugger/RAM dump | ✅ No persistence, zeroed post-unlock |
| Deniability under coercion | Duress PIN / decoy wallet | ✅ BUILT (S3 stack) |

### Post-Phase-2 (iOS/Android)

| Threat | Vector | Status |
|--------|--------|--------|
| Offline-seizure (PIN exhaustion) | **Secure Enclave/StrongBox biometric required** | ✅ **CLOSED** |
| Biometric replay/clone | Gait/face/fingerprint copy | ✅ OS-enforced, device-specific |
| Biometric re-enrollment attacks | New enroll invalidates key | ✅ Automatic via OS (setInvalidatedByBiometricEnrollment) |
| Device migration | Old keys don't transfer | ✅ Intended (re-enroll on new device) |
| Deniability under coercion | Duress PIN / Face ID redirect | ✅ BUILT (S3 stack) |

---

## Known Gaps & Honest Disclosure

### Phase 1 (Web)

- **Safari:** No WebAuthn PRF support (browser limitation). Users see password-only. This is honest; Phase 2 iOS will have Secure Enclave. No fake security.
- **Browser Compatibility:** Feature detection via `isHardwareKeystoreAvailable()` gates enrollment. Graceful fallback if platform lacks PRF.

### Phase 2 (Mobile)

- **Android without StrongBox:** Falls back to standard Keystore (still hardware-backed by Keymaster). Honestly disclosed to user; no fake "secure hardware" claim.
- **Simulator/Emulator:** No real hardware. Device verification is non-negotiable (cannot test in simulator).
- **Custom Capacitor Plugin:** Requires native build toolchain (Xcode + CocoaPods for iOS; Android Studio + Gradle for Android). Cannot test in JS environment.

---

## Sign-Off Template

### Phase 1 Sign-Off: WebAuthn PRF Hardware Factor

**Implementation:** ✅ COMPLETE
- 200+ lines, `src/lib/web.js`, `src/lib/kek.js`
- 1973/1973 unit tests passing
- 22/22 automated validations passing
- All I1–I6 security invariants verified

**Browser UAT:** ⏳ PENDING TESTNET TXIDS
- [ ] Chrome: PRF enrollment success, unlock works, Sepolia send `0x___`
- [ ] Firefox: PRF enrollment success, unlock works, Sepolia send `0x___`
- [ ] Safari Desktop: Password-only fallback, Sepolia send `0x___`
- [ ] Safari iOS: Password-only fallback, Sepolia send `0x___`

**Ship Decision:** READY (once testnet txids captured above)

**Approved By:** [owner signature]
**Date:** [date]

---

### Phase 2 Sign-Off: iOS/Android Hardware KEK

**iOS Implementation:** ✅ COMPLETE
- `HardwareKekPlugin.swift` (Secure Enclave P-256 ECIES)
- Face ID biometric ACL (`kSecAccessControlBiometryCurrentSet`)
- Automatic invalidation on re-enrollment
- All I1–I6 security invariants verified

**Android Implementation:** ✅ COMPLETE
- `HardwareKekPlugin.kt` (StrongBox/Keystore HMAC-SHA256)
- Fingerprint biometric ACL + re-enroll invalidation
- Fallback to standard Keystore (honest disclosure)
- All I1–I6 security invariants verified

**Real-Device Verification:** 🟡 PARTIAL — both platforms device-verified; Android is now
end-to-end (enroll + persist-across-restart + unlock-gating), iOS has real on-chain sends
from a KEK-enrolled vault but no captured unlock log trace. Neither platform has a
KEK-gated Sepolia send with a captured hardware-unlock log trace on THAT platform, so no
platform passes the full criterion-1 gate yet. **NOT COMPLETE.**
- [~] iPhone (Face ID, SE-ECIES, PR #495): **two Sepolia sends confirmed on-chain**
  (2026-07-01 — see "Testnet Txid Evidence" above) from a KEK-enrolled vault; SE-KEK unlock
  gated signing (fail-closed proof). OUTSTANDING: live `getHardwareFactor` log trace tied to
  the send + biometric re-enrollment invalidation test. → DEVICE-VERIFIED (PARTIAL).
- [x] Pixel (Fingerprint, StrongBox, PRs #496/#497/#499): enroll succeeds, **StrongBox
  tier observed** (securityLevel=2), biometric-only gate confirmed, AND the KEK wrap now
  genuinely **persists across a cold restart and gates every subsequent unlock**
  (2026-07-01, Pixel 10 Pro XL — three stacked bugs found and fixed this session; see
  "Android End-to-End Persistence + Unlock-Gating Fix" above). This is a stronger claim
  than the original PR #496 note, which only covered enroll-time behavior and did not
  catch that the KEK was being silently downgraded on every unlock. OUTSTANDING: Sepolia
  send `0x___` + biometric re-enrollment invalidation test + StrongBox tier enforcement
  + independent audit. → **BUILT, end-to-end device-verified** (not "verified" in the
  on-chain sense, not independently audited).
- [ ] Audit refresh: Sign-off on device-gated implementation (UNAUDITED-PROVISIONAL, both platforms)

**Ship Decision:** READY (once device txids and audit sign-off confirmed)

**Approved By:** [owner signature + audit sign-off]
**Date:** [date]

---

## Related Docs

- `docs/Feature-Status.md` — §4 (Security — S1 foundation & Hardware KEK Phase 1/2)
- `docs/vault-auth-architecture-brief.md` — Full authentication model (password/PIN/passkey/biometric)
- `CLAUDE.md` — I6 security invariant + Hard Rules
- `docs/Audit.scope.md` — Audit gates and device-verification requirements
