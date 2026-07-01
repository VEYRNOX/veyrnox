# Hardware KEK Internal Static-Analysis Audit — 2026-07-01

> ⚠️ INTERNAL STATIC-ANALYSIS PASS — NOT AN INDEPENDENT AUDIT.
> The internal security audit that opened the mainnet gate was completed 2026-06-17.
> The independent ECC third-party audit was completed 2026-06-23.
> This 2026-07-01 pass is an ADDITIONAL INTERNAL review focused on the Hardware KEK
> Phase 1/2 surfaces. It does NOT satisfy the independent-audit gate condition in
> `docs/audit-triage/kek-acl-rasp-status-gate-2026-06-22.md §4`. "Internal" is
> never presented as "independent" (I4 honesty, CLAUDE.md).

| | |
|---|---|
| **Date** | 2026-07-01 |
| **Pass type** | INTERNAL static-analysis (specialist agents) |
| **Scope** | WebAuthn PRF KEK (web / `src/wallet-core/keystore/web.js`), iOS SE KEK (`ios/App/App/HardwareKekPlugin.m`), Android StrongBox KEK (`android/app/src/main/java/…/HardwareKekPlugin.kt`) |
| **Result** | 1 CRITICAL / 9 HIGH / 12 MEDIUM / 6 LOW |
| **Remediable findings fixed** | 10 of 20 — PRs #520–#522 |
| **Remaining open** | 10 findings — native/device-gated or require protocol migration |
| **Gate status** | UNCHANGED — real-device KEK-gated testnet txid + independent audit still required for mainnet promotion of Hardware KEK feature |
| **ALLOW_MAINNET** | Unchanged (`true`) |

---

## Summary table

| Severity | Total | Fixed (PRs #520–#522) | Open |
|----------|-------|-----------------------|------|
| CRITICAL | 1 | 0 | 1 (C-1) |
| HIGH | 9 | 4 (F-01, F-02, H-4, iOS-F6) | 5 (iOS-F5, H-1, H-2/iOS-F11, iOS-F9 evidence gap, H-3 accepted) |
| MEDIUM | 12 | 5 (F-03, F-05, F-06, M-3, + H-3 accepted deviation) | 7 (iOS-F3, remaining) |
| LOW | 6 | 1 (F-08) | 5 (native/device) |

---

## Fixed findings — PRs #520–#522

| ID | Severity | Surface | File:area | Description | Status |
|----|----------|---------|-----------|-------------|--------|
| F-01 | HIGH | web | `web.js` `enrollKek` | PRF credential ID loss → vault lockout. If a credential was created but the vault wrap failed, the orphan credential ID was not tracked and a subsequent `enrollKek` call would create a new credential, making the first credential unreachable. Added `kekWrap`-enrolled check before creating an orphan credential. | ✅ FIXED — PR #520 |
| F-02 | HIGH | web | `web.js` `enrollKek` | No guard on double-enroll. A second call to `enrollKek` on an already-enrolled vault silently created a new credential and overwrote the existing kekWrap, permanently destroying the vault-KEK binding of the prior credential. Added explicit `KEK_ALREADY_ENROLLED` guard at function entry. | ✅ FIXED — PR #520 |
| F-03 | MEDIUM | web | `web.js` `PRF_FIXED_SALT` | PRF salt labelled `"prf-spike"` — a development artefact label with no protocol-version semantics. Renamed to `"prf-kek-v1"`. This is a protocol version bump: any vault enrolled under the old label (`"prf-spike"`) will require re-enrollment. Bump is necessary and documented. | ✅ FIXED — PR #520 |
| F-05 | MEDIUM | web | `web.js` `enrollKek` | Credential ID committed to localStorage before PRF output confirmed. On Safari (and certain Chrome builds), `getAssertion` can succeed in terms of credential creation but return a null/empty PRF output. The orphan credential ID was written to localStorage immediately after credential creation, before PRF confirmation — leaving an unresolvable state if PRF confirmation failed. Credential ID is now only written after PRF output is confirmed non-null. | ✅ FIXED — PR #521 |
| F-06 | MEDIUM | web | `web.js` `changePassword` | H factor held in scope across the `changePassword` `finally` clause but not zeroed if the function threw before the explicit zero call. `changePassword` `finally` clause now unconditionally zeros `H` on all paths, including early-throw paths. | ✅ FIXED — PR #521 |
| F-08 | LOW | web / kek | `web.js` `unwrapDek` | `unwrapDek` returned the decrypted DEK bytes via a reference to an intermediate `ptBuf` that was not zeroed before return. The caller received the pointer; the intermediate buffer persisted in heap until GC. `unwrapDek` now zeros `ptBuf` before returning the caller copy. | ✅ FIXED — PR #522 |
| H-4 | HIGH | Android | `hardware.js` + `combineKek` | Zero-vector H check absent. If `getHardwareFactor()` returned an all-zero buffer (e.g., StrongBox returning 32 zero bytes on key failure), `combineKek` would proceed silently, producing a KEK derived only from C (the password factor). Added a zero-vector guard in `hardware.js` before `combineKek` and a defence-in-depth check inside `combineKek` itself. | ✅ FIXED — PR #522 |
| iOS-F6 | HIGH | iOS / JS | `native.js` `enrollKek` | JS-layer lacked a `HARDWARE_KEK_ALREADY_ENROLLED` guard before calling the native `enroll()` plugin method. A second enroll on iOS would call `SecKeyCreateRandomKey` on the SE, creating a new key and overwriting the plugin's stored reference — permanently orphaning the vault's existing kekWrap. Added guard at the JS boundary (`native.js`); the ObjC layer also has its own check, but the JS-layer guard provides defence-in-depth and surfaces a clean error to the caller before any native round-trip. | ✅ FIXED — PR #521 |
| M-3 | MEDIUM | Android | `HardwareKekPlugin.kt` `detectTamper()` | `detectTamper()` used `getOrDefault(false)` for the tamper-flag lookup, meaning a missing or corrupt tamper flag would return `false` (pass). Failure mode is fail-open — a tampered device that lost its tamper flag would pass the check. Changed to `getOrElse { true }` (fail-closed, I4). | ✅ FIXED — PR #522 |
| H-3 | HIGH | Android | `BiometricService` | `biometryLockout` handler fell through to `allowDeviceCredential` fallback. Under biometric lockout (too many failed attempts), Android's `BiometricPrompt` can be configured to fall back to device credential (PIN/pattern/password). This fallback means a device-passcode holder can unlock after biometric lockout, weakening the "biometric-only" guarantee. **Accepted as H16 deviation** (consistent with existing `NF-6` from 2026-06-22 and with `H-NEW-5` honest-disable policy). The fallback is coercion-model relevant and is now explicitly documented as an accepted known limitation in code comments and in this audit record. It is NOT silently accepted — it is disclosed (I4 honesty). | ✅ DOCUMENTED / accepted deviation — PR #522 |

---

## Still-open findings — native/device-gated or protocol migration required

| ID | Severity | Surface | Description | Gate |
|----|----------|---------|-------------|------|
| C-1 | CRITICAL | Android | **HMAC input is a global fixed constant.** The Android StrongBox KEK plugin uses a fixed, application-global HMAC input string as the hardware factor H for all enrolled vaults. This means every vault on every device running the same build derives the same H from the StrongBox (modulo per-device StrongBox key). A vault encrypted on device A can be decrypted on device B if the attacker extracts the StrongBox key from device A (or from a device running the same build with an extracted key). The correct construction requires a **per-enrollment `kekSalt`** (unique random value generated at enroll time, stored alongside the kekWrap, incorporated into the HMAC input). This is a protocol-breaking change — existing enrolled vaults would need migration. Tracked as a separate **v2 protocol migration task**. Cannot be fixed in the JS environment; requires Android native build + StrongBox re-integration + migration path design. | Android native build + StrongBox re-integration + v2 protocol migration; independent audit |
| iOS-F5 | HIGH | iOS | **H factor in NSData not zeroed post-decryption.** The `HardwareKekPlugin.m` ObjC layer decrypts the SE-ECIES-wrapped key material into an `NSData` buffer. `NSData` is immutable and cannot be zeroed in place — the decrypted bytes persist in heap until the `NSData` object is deallocated. The fix requires switching to `NSMutableData` and calling `[data resetBytesInRange:NSMakeRange(0, data.length)]` after use, plus ensuring the ARC retain count drops promptly. Requires Mac/Xcode native build. | Mac + Xcode + iOS SE build |
| iOS-F3 | MEDIUM | iOS | **Deprecated `kSecUseOperationPrompt` key.** `HardwareKekPlugin.m` uses `kSecUseOperationPrompt` to present the biometric prompt string, which was deprecated in iOS 9.0 in favour of `LAContext` with `localizedReason` passed to `evaluatePolicy` or `kSecUseAuthenticationContext` with a pre-evaluated `LAContext`. The deprecated key is ignored on recent iOS versions — the biometric prompt string may not display, and future iOS versions may remove the key entirely. Fix requires replacing with `LAContext` + `kSecUseAuthenticationContext`. Requires Mac + Xcode native build. | Mac + Xcode + iOS SE build |
| H-1 | HIGH | Android | **StrongBox tier not surfaced to user.** The StrongBox tier (`STRONGBOX` vs `TRUSTED_ENVIRONMENT` vs `SOFTWARE`) is observed via `KeyInfo.getSecurityLevel()` but not surfaced in the UI. A user on a non-StrongBox device gets the same "Hardware Protection ON" badge as a StrongBox user. The implementation does not reject enrollment on non-StrongBox hardware (enforcement is TARGET, not built — as already noted in `docs/Feature-Status.md §4`). A non-StrongBox device silently logs `TRUSTED_ENVIRONMENT` instead. The UI badge should distinguish between StrongBox-backed and TEE-backed protection. | Android native build + UI update + real-device testing on non-StrongBox hardware |
| H-2 / iOS-F11 | HIGH | Android + iOS | **Biometric cache not bound to enrollment set.** On both platforms, the biometric factor is not bound to the specific biometric enrollment set at the time of KEK enrollment. An attacker who can add a new biometric (e.g., a coercer who forces a new fingerprint enroll) retains access to the KEK-gated vault — the new biometric satisfies the gate even though it was not part of the original enrollment. The fix requires using `setInvalidatedByBiometricEnrollment(true)` on Android and `kSecAccessControlBiometryCurrentSet` (already set on iOS SE key ACL — see positive confirmations below) with a re-enroll invalidation test on iOS. Consistent with `H-NEW-5` (2026-06-27 honest-disable). Requires a custom Capacitor native plugin and real-device re-enrollment testing on both platforms. | Custom Capacitor plugin + real device re-enrollment test (both platforms) |
| iOS-F9 | HIGH (evidence gap) | iOS | **SE ECIES path unconfirmed for the two Sepolia sends.** The two Sepolia sends from the iPhone 17 Pro Max (txids `0xf09c036c…` and `0x0b13d553…`, nonces 27 and 28, blocks 11178961 and 11179002) were confirmed on-chain. However, the live `getHardwareFactor()` SE-unlock log trace tied to these specific sends was **not captured** — proof that the SE-KEK path gated those sends is architectural (vault had `kekWrap` present; `_unlockInner` cannot proceed without `getHardwareFactor()`) rather than an observed SE-unlock log line. This is the same honest-scope limitation already recorded in `docs/Feature-Status.md §4` (iOS SE-ECIES entry). The unlock log trace capture remains outstanding. | Capture SE-unlock log trace tied to a new KEK-gated Sepolia send on iPhone |

> **Note on iOS-F9 and H-NEW-D closure (below):** iOS-F9 is an evidence gap about the *proof basis* for the existing sends, not a new bug. The positive confirmation below (H-NEW-D CLOSED) establishes that `kSecAttrTokenIDSecureEnclave` IS present in the ObjC source, confirming the SE ECIES design is correct at the native layer. The outstanding item is capturing the unlock log trace to confirm the SE path executed for those specific sends.

---

## Positive confirmations from this audit

| Finding | Confirmation |
|---------|-------------|
| **H-NEW-D CLOSED** | `kSecAttrTokenIDSecureEnclave` IS present in `HardwareKekPlugin.m:78` — the SE ECIES key generation attribute is confirmed at the native layer. This closes the previously-OPEN H-NEW-D item from the 2026-06-28 internal static-analysis pass. The SE ECIES design is correctly implemented at the native ObjC layer. |
| iOS SE ACL | `kSecAccessControlBiometryCurrentSet` is correctly set on the iOS SE key ACL — the key will be invalidated if the enrolled biometric set changes. This is the correct ACL attribute for biometric binding. (H-2/iOS-F11 above covers the re-enrollment invalidation *test*, which remains outstanding.) |
| `combineKek` construction | HKDF construction is sound: SHA-256 PRF, domain-separated inputs, 32-byte output. No obvious construction weakness at the design level. |
| Android backup flag | `android:allowBackup="false"` is correctly set in `AndroidManifest.xml` — vault data will not be included in Android backup/restore. |
| iOS ATS | App Transport Security (ATS) is correctly enforced on iOS — no `NSAllowsArbitraryLoads` exception present. |

---

## Gate conditions (unchanged from `docs/audit-triage/kek-acl-rasp-status-gate-2026-06-22.md §4`)

This internal pass does NOT satisfy or relax any gate condition. The following remain required before Hardware KEK status can be promoted:

1. **Real-device verification** — KEK-gated testnet send with txid on both iOS (SE path with unlock log trace) and Android (StrongBox path).
2. **Biometric re-enrollment invalidation test** — confirm that adding a new biometric invalidates the existing KEK-gated vault (both platforms).
3. **C-1 migration** — per-enrollment `kekSalt` binding for Android HMAC input (v2 protocol, migration required).
4. **Independent third-party audit sign-off** — this internal pass does not substitute for an independent human review.

**ALLOW_MAINNET** is unchanged. The existing 10-asset send functionality is unaffected by these KEK-specific open items.

---

## Cross-references

- `docs/Feature-Status.md §4` — Hardware KEK Phase 1/2 status
- `docs/audit-triage/kek-acl-rasp-status-gate-2026-06-22.md` — consolidated gate conditions
- `docs/hardware-kek-phase-plan.md` — phase plan and device-verification evidence
- `CLAUDE.md` — Hardware KEK Phase 1/2 Rollout section
- PRs: #520, #521, #522 (remediation)
- Internal audit (mainnet gate): `docs/audit-triage/internal-audit-2026-06-17.md`
- Independent ECC audit: `docs/audit-triage/ecc-independent-audit-2026-06-23.md`
