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
| CRITICAL | 1 | 1 — recorded RESOLVED 2026-07-02, REGRESSED 2026-07-05 (binding-unconfirmed), then **FIXED / device-verified 2026-07-05 (v3, PR #568)** — see annotations below | 0 open (C-1 closed via v3 fix); salt-tamper negative test, v2→v3 migration device-exercise, on-device multi-enrollment salt distinctness, and independent audit remain outstanding — see annotation |
| HIGH | 9 | 7 (F-01, F-02, H-4, iOS-F6, H-1 PR #527, iOS-F5 device-verified 2026-07-07, iOS-F9 CLOSED 2026-07-07) | 2 (H-2/iOS-F11 — Android half RESOLVED/device-verified PR #516/#518, iOS half deferred/MDM-blocked; H-3 accepted) |
| MEDIUM | 12 | 6 (F-03, F-05, F-06, M-3, + H-3 accepted deviation, iOS-F3 device-verified 2026-07-07) | 6 (remaining) |
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
| C-1 | CRITICAL | Android | **HMAC input is a global fixed constant.** The Android StrongBox KEK plugin uses a fixed, application-global HMAC input string as the hardware factor H for all enrolled vaults. This means every vault on every device running the same build derives the same H from the StrongBox (modulo per-device StrongBox key). A vault encrypted on device A can be decrypted on device B if the attacker extracts the StrongBox key from device A (or from a device running the same build with an extracted key). The correct construction requires a **per-enrollment `kekSalt`** (unique random value generated at enroll time, stored alongside the kekWrap, incorporated into the HMAC input). This is a protocol-breaking change — existing enrolled vaults required migration. **RESOLVED / device-verified 2026-07-02 (record at the time):** PR #529 merged (commit 732f9676). `native.js` generates `kekSalt` before calling `getHardwareFactor`, passes `{ kekSalt: saltBytes.slice() }` to it, stamps `hardwareKekVersion: 2` on the vault blob; Kotlin plugin reads the `kekSalt` param. `changePassword` calls `getHF` twice (once with old kekSalt for unlock, once with fresh new kekSalt for re-wrap). 4/4 C-1 contract tests + 172/172 keystore tests pass. On-device: v2 re-enroll + cold restart + StrongBox-gated unlock + Sepolia send confirmed — txid `0xeb71a5d31a8794682cf681d8ebb2916967c1097e951519dcf1b53327d2d8e580`, block 11185289, Pixel 10 Pro XL (Android 16/API 36). Vault read confirmed `hardwareKekVersion:2`, `kekSaltLength:44`, `hardwareKekTier:"STRONGBOX"`. INTERNAL — not independently audited. Remaining (at the time): independent audit. **REGRESSED 2026-07-05, then FIXED / device-verified 2026-07-05 (v3, PR #568)** — see the two dated annotations below (regression note, then resolution note) for the full history; do not read only this row. | ✅ FIXED / device-verified (v3, 2026-07-05, PR #568) — Sepolia txid `0xecd68494e888af742e5166c93c5354536fb6bbe62e93dc795847079d981727e3` block 11206686. Salt-tamper test, v2→v3 migration device-exercise, multi-enrollment distinctness, and independent audit outstanding. |
>
> **⚠️ 2026-07-05 REGRESSION NOTE — annotation, not a rewrite of the above.** A follow-up
> OODA investigation found the PR #529 fix described above is **cryptographically inert
> on-device**; the txid and vault-field readout above are accurate as recorded but did NOT
> prove what they were believed to prove. Two bugs, found in this order:
> - **Bug A (runtime-confirmed via logcat on the Pixel 10 Pro XL: `getHardwareFactor`
>   called with `methodData {}` on a v2 vault).** The keystore facade
>   `src/wallet-core/keystore/index.js:94-96 getHardwareFactor()` drops all arguments —
>   `async getHardwareFactor() { return (await load()).nativeKeyStore.getHardwareFactor(); }`
>   — so unlock never forwards `kekSalt` to the plugin at all.
> - **Bug B (static analysis, high confidence, device confirmation pending).**
>   `src/wallet-core/keystore/hardware.js:195` passes `kekSalt` as a raw `Uint8Array`
>   (`pluginOpts = { kekSalt: opts.kekSalt }`) into the Capacitor bridge call; the Android
>   bridge `JSON.stringify`s plugin options, so Kotlin's `call.getString("kekSalt")` reads
>   `null` (indistinguishable from "absent") and silently falls back to the fixed v1
>   `PRF_EVAL_SALT`. Enrollment therefore also derived H from the fixed salt while stamping
>   `hardwareKekVersion:2` on the vault.
> - **Net effect:** the `0xeb71a5d31a8794682cf681d8ebb2916967c1097e951519dcf1b53327d2d8e580`
>   Sepolia txid (block 11185289) proved the KEK-gated unlock **FLOW** end-to-end — it did
>   NOT prove per-enrollment salt binding. Enroll and unlock both silently used the same
>   fixed salt, so they matched by construction, not by design working as intended. All
>   enrolled Android vaults still derive H from the same global HMAC input — **the original
>   C-1 CRITICAL condition is unresolved.**
> - **Corrected status: C-1 REGRESSED / binding-unconfirmed (2026-07-05 finding).** INTERNAL
>   finding, not independent. The historical PR #529 merge, the commit hash, and the txid
>   above are NOT deleted from this record — they are re-scoped: they are evidence of a
>   working KEK-gated unlock flow, not evidence of salt binding.
> - **In progress:** a v3 fix on branch `claude/silly-knuth-0e85fc` — facade argument
>   forwarding (fixes Bug A), base64-encoding `kekSalt` over the bridge (fixes Bug B),
>   Kotlin-side fail-closed behavior on a malformed/absent salt (no silent v1 fallback), and
>   a `hardwareKekVersion:3` stamp for genuinely salt-bound wraps with a lazy, brickless
>   v2→v3 upgrade path for previously (falsely) v2-stamped vaults.
> - **Required before any "RESOLVED" claim returns:** device re-verification on real
>   hardware, a new user-supplied on-chain txid distinct from `0xeb71a5d…`, and a
>   salt-tamper negative test (proving a wrong/altered `kekSalt` fails unlock). The Android
>   StrongBox-gated unlock FLOW itself remains device-verified from the 2026-07-02 session —
>   only the salt-binding claim regresses.
>
> **✅ 2026-07-05 RESOLUTION UPDATE — v3 fix, device-verified (annotation, not a rewrite of
> the regression note above).** The regression note above is NOT deleted — it stands as the
> historical record of what went wrong and why. This update records the v3 fix that follows
> it, confirmed on the same device class the regression was found on.
> - **Fix (PR #568):** facade argument forwarding closes Bug A (`getHardwareFactor()` in
>   `src/wallet-core/keystore/index.js` now forwards `opts` through to the plugin instead of
>   dropping them); `hardware.js` now base64-encodes `kekSalt` to a STRING before it crosses
>   the Capacitor bridge, closing Bug B (`JSON.stringify` no longer mangles a `Uint8Array`
>   into an object the Kotlin side reads as `null`); the Kotlin plugin fails closed on a
>   malformed/absent salt instead of silently reverting to the fixed v1 salt; the vault now
>   stamps `hardwareKekVersion:3` for genuinely salt-bound wraps, with a lazy, brickless
>   v2→v3 upgrade path for vaults previously (falsely) stamped v2. 11 migration unit tests
>   added (`native.kek-v3-migration.test.js`) plus a dedicated bridge-encoding test
>   (`hardware.kek-salt-bridge-encoding.test.js`).
> - **Device verification (2026-07-05, Pixel 10 Pro XL, Android 16, `com.veyrnox.app.debug`,
>   all times device-local):**
>   - 07:19:35 — fresh v3 enrollment: plugin log `"enroll: key stored — tier=STRONGBOX
>     (securityLevel=2)"`.
>   - 07:19:37 — `getHardwareFactor` bridge call carried `kekSalt` as an intact 44-char
>     base64 STRING (`methodData {"kekSalt":"1E4dcUqurire0NCJM2lN+ekCbhHHm0I2+t8pWYdE2Vc="}`)
>     — previously arrived as `{}` — plugin logged `"salt-source: v2-bound"`.
>   - Cold restart (force-stop + relaunch 07:37:46), unlock 07:40:00–03: biometric prompt →
>     `getHardwareFactor` called again with the SAME stored `kekSalt` → `"salt-source:
>     v2-bound"` → H returned → vault decrypted → wallet loaded (balance RPCs fired
>     immediately after). **This closes the Android unlock-path app-trace evidence gap** —
>     the Android analogue of iOS-F9 — for this session.
>   - **KEK-gated Sepolia send from this vault:** txid
>     `0xecd68494e888af742e5166c93c5354536fb6bbe62e93dc795847079d981727e3`, block `11206686`
>     (`0xab001e`), status SUCCESS, from `0x90f9f1f9f5a1938b21ef0c20352c7b792e68a729` to
>     `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`, 21000 gas plain ETH transfer —
>     independently re-confirmed via RPC receipt (owner-supplied txid).
> - **Corrected status: C-1 FIXED / device-verified (v3 fresh-enroll path, end-to-end incl.
>   on-chain txid, 2026-07-05).** INTERNAL evidence — not independently audited.
> - **Still outstanding (explicitly, not swept under "fixed"):**
>   1. **Salt-tamper negative test NOT performed** — the stored vault lives inside encrypted
>      SecureStorage, so a non-invasive tamper is not feasible on this device. The operative
>      evidence that the supplied salt is actually the HMAC input is the salt-bound branch
>      attestation (`"salt-source: v2-bound"` logged only when the intact salt string is
>      received) rather than a direct tamper/fail test.
>   2. **v2→v3 lazy migration path NOT device-exercised** — the test device had no existing
>      v2 vault (this was a fresh enroll). Migration remains unit-tested only (11 tests),
>      not confirmed on a real upgrading device.
>   3. **Per-enrollment salt distinctness on device** — unit-proven only; only one
>      enrollment's salt was observed on this device, so on-device distinctness across
>      multiple enrollments is not yet confirmed.
>   4. **Independent audit** — still outstanding, as for the rest of the Hardware KEK
>      surface.
> - This is INTERNAL evidence, not independent audit. "Device-verified" here means the v3
>   fresh-enroll path end-to-end, including a real on-chain txid — it is not a claim that
>   every C-1-adjacent scenario (migration, tamper-resistance, multi-enrollment distinctness)
>   has been exercised.
>
> **⚠️ NEW FINDING — LOG-1 (2026-07-05, discovered during this device-verification session):**
> Capacitor's debug bridge logger echoes every native plugin result to logcat in DEBUG
> builds. Captured on-device during this session: the hardware KEK factor H in cleartext
> base64 (`{"h":"..."}`) and the full encrypted vault blob, both written to logcat by the
> bridge's own debug logging, independent of any app-level log statement. **Scope:** DEBUG
> builds only — production default is silent, but this has NOT been verified for our actual
> release build configuration, so it is not yet ruled out there either. **Risk:** `adb`
> access to a debug-build device extracts H directly from logcat; Appium CI logcat artifacts
> (see `tests/android/`) may also capture it. **Severity:** suggested HIGH for
> debug/CI context; NOT classified as a production finding until the release build
> configuration is verified. **Remediation:** tracked separately (spawned as its own task) —
> not fixed as part of PR #568.
>
> **Also recorded from this session — P3 biometric enrollment (separate from C-1):** the
> "Biometric unlock" enrollment flow was device-exercised 2026-07-05 07:19:16 — a
> `BiometricAuth` prompt with honest "Enroll biometric unlock" labeling was observed in
> device logs. The original reported bug ("WebAuthn native plugins not working") is FIXED /
> device-exercised for the enrollment step. The "passkey" WebAuthn path on native remains
> honest-disabled by design — biometric unlock (native OS biometric) and WebAuthn/passkey
> (FIDO2 credential) are different mechanisms; only the former is native-enrolled here.
| iOS-F5 | HIGH | iOS | **H factor in NSData not zeroed post-decryption.** The `HardwareKekPlugin.m` ObjC layer decrypts the SE-ECIES-wrapped key material into an `NSData` buffer. `NSData` is immutable and cannot be zeroed in place — the decrypted bytes persist in heap until the `NSData` object is deallocated. The fix requires switching to `NSMutableData` and calling `[data resetBytesInRange:NSMakeRange(0, data.length)]` after use, plus ensuring the ARC retain count drops promptly. Requires Mac/Xcode native build. **DEVICE-VERIFIED (INTERNAL, 2026-07-07):** built and installed on iPhone 17 Pro Max (iOS 26, commit `f6e5fee73`); enroll/unlock cycle works end-to-end. Source sign-off: `resetBytesInRange` on getHardwareFactor path (line 321), `memset` on enroll path (line 179), `CFRelease(pt)` on raw SE output (line 322). Honest scope: base64 `NSString` bridge residue architecturally unzeroable (LOW-MEDIUM). Heap-dump check outstanding. | ✅ DEVICE-VERIFIED (INTERNAL, source+build, 2026-07-07) |
| iOS-F3 | MEDIUM | iOS | **Deprecated `kSecUseOperationPrompt` key.** `HardwareKekPlugin.m` uses `kSecUseOperationPrompt` to present the biometric prompt string, which was deprecated in iOS 9.0 in favour of `LAContext` with `localizedReason` passed to `evaluatePolicy` or `kSecUseAuthenticationContext` with a pre-evaluated `LAContext`. The deprecated key is ignored on recent iOS versions — the biometric prompt string may not display, and future iOS versions may remove the key entirely. Fix requires replacing with `LAContext` + `kSecUseAuthenticationContext`. Requires Mac + Xcode native build. **DEVICE-VERIFIED (INTERNAL, 2026-07-07):** built and installed on iPhone 17 Pro Max (iOS 26, commit `f6e5fee73`); zero deprecation warnings (CI PR #705 + local). Face ID prompt rendered on every unlock; two back-to-back unlocks both prompted independently (`reuseDuration=0` confirmed). Negative check (Face ID cancel): fail-closed. No runtime deprecation warning in device console. | ✅ DEVICE-VERIFIED (INTERNAL, 2026-07-07) |
| H-1 | HIGH | Android | **StrongBox tier not surfaced to user.** The StrongBox tier (`STRONGBOX` vs `TRUSTED_ENVIRONMENT` vs `SOFTWARE`) is observed via `KeyInfo.getSecurityLevel()` but not surfaced in the UI. A user on a non-StrongBox device gets the same "Hardware Protection ON" badge as a StrongBox user. The implementation does not reject enrollment on non-StrongBox hardware (enforcement is TARGET, not built — as already noted in `docs/Feature-Status.md §4`). A non-StrongBox device silently logs `TRUSTED_ENVIRONMENT` instead. The UI badge should distinguish between StrongBox-backed and TEE-backed protection. **FIXED in PR #527 (merged 2026-07-02):** `tierBadge.js` pure helper maps `securityLevelName` → badge label/variant; `HardwareKekSettings.jsx` reads real tier from `getVaultKekTier()` and renders the correct badge (StrongBox Protected / TEE Protected / Hardware Protection ON / WebAuthn Protected); `native.js` `enrollKek` now stores `hardwareKekTier` in the vault blob and exposes a `getVaultKekTier()` accessor. | ✅ FIXED — PR #527 (merged 2026-07-02) |
| H-2 / iOS-F11 | HIGH | Android + iOS | **Biometric factor not bound to enrollment set.** An attacker who can add a new biometric (e.g., a coercer who forces a new fingerprint enroll) would otherwise retain access to the KEK-gated vault. **Android — RESOLVED / device-verified (PR #516/#518, 2026-07-01, Pixel 10 Pro XL):** `setInvalidatedByBiometricEnrollment(true)` (`HardwareKekPlugin.kt:199`) confirmed working — delete + re-enroll fingerprint → `KeyPermanentlyInvalidatedException` → app detects → fail-closed unlock refusal → PIN fallback recovered the vault. Recorded as the `_hardware_kek_biometric_reenroll_invalidation` META key in `docs/verified-evidence.json`. **iOS — DEFERRED (device-blocked, MDM):** `kSecAccessControlBiometryCurrentSet` is correctly set on the SE key ACL (`HardwareKekPlugin.m:96` — see positive confirmations below); the runtime re-enroll invalidation test could not be run because the test iPhone 17 Pro Max is MDM-registered and the MDM profile restricts Face ID enrollment changes (confirmed 2026-07-07 during the iOS KEK device session). Needs a different, unrestricted iPhone. Consistent with `H-NEW-5` (2026-06-27 honest-disable, separate `biometricUnlock.js` PIN cache). | Android ✅ device-verified (PR #516/#518). iOS OPEN — re-enroll test on an unrestricted iPhone (MDM-blocked on current device, confirmed 2026-07-07) |
| iOS-F9 | HIGH (evidence gap) | iOS | **SE ECIES path unconfirmed for the two Sepolia sends.** The two Sepolia sends from the iPhone 17 Pro Max (txids `0xf09c036c…` and `0x0b13d553…`, nonces 27 and 28, blocks 11178961 and 11179002) were confirmed on-chain. However, the live `getHardwareFactor()` SE-unlock log trace tied to these specific sends was **not captured** — proof that the SE-KEK path gated those sends is architectural (vault had `kekWrap` present; `_unlockInner` cannot proceed without `getHardwareFactor()`) rather than an observed SE-unlock log line. **✅ CLOSED (prospective, INTERNAL, 2026-07-07):** the literal 3-line `[VEYRNOX-KEK]` SE-unlock app-trace was captured on iPhone 17 Pro Max (iOS 26) via Console.app on Mac (commit `f6e5fee73`, `os_log` subsystem `com.veyrnox`): `loaded ciphertext 113 bytes` (21:13:56) → `SE key retrieved, decrypting (Face ID prompt now)` (21:13:56) → `SUCCESS — Face ID passed, H recovered (32 bytes)` (21:13:59, ~2.76s Face ID gap). TIME-CORRELATED with a new KEK-gated Sepolia send: txid `0x8b8f70e71a776b75d30d8664d2065d40c893c1ad16eb5384dc6b75c6788ebe8d`, block 11224674, 20:18 UTC — same Console capture session. Cold-restart repeat confirmed (second 3-line trace at 21:19). Negative check (Face ID cancel): fail-closed, no unlock (I4). The two historical sends retain their prior proof basis (architectural + OS-daemon META) — not retro-promoted. | ✅ CLOSED (prospective, INTERNAL, 2026-07-07) |

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

1. **Real-device verification** — Android ✅ DONE (StrongBox path: KEK-gated Sepolia send `0x9d9ff549…`, block 11180398, with logcat trace). iOS ✅ SE-unlock trace DONE (2026-07-07): 3-line `[VEYRNOX-KEK]` app-trace captured via Console.app on Mac, time-correlated with KEK-gated Sepolia send txid `0x8b8f70e7…` block 11224674. iOS-F5 and iOS-F3 also device-verified (INTERNAL, 2026-07-07). iOS overall remains PARTIAL because H-2/iOS-F11 biometric re-enrollment test is MDM-blocked.
2. **Biometric re-enrollment invalidation test** — Android ✅ DONE (PR #516/#518, Pixel 10 Pro XL, 2026-07-01: adding a new biometric invalidated the KEK-gated vault, fail-closed, PIN recovery intact). iOS remains outstanding — device-blocked (test iPhone Face ID enrollment restricted); the `kSecAccessControlBiometryCurrentSet` flag is set in code but the runtime invalidation must still be confirmed on an unrestricted iPhone.
3. **C-1 migration** — per-enrollment `kekSalt` binding for Android HMAC input. A v2 fix was recorded RESOLVED / device-verified 2026-07-02 (PR #529); a 2026-07-05 regression finding showed that fix did not actually bind the salt (see the annotation on the C-1 row above). A v3 fix (PR #568) was then device-verified 2026-07-05 — fresh v3 enrollment, cold-restart unlock, and a KEK-gated Sepolia send all confirmed the salt is genuinely bound (`"salt-source: v2-bound"` logged only when the intact salt crosses the bridge; txid `0xecd68494e888af742e5166c93c5354536fb6bbe62e93dc795847079d981727e3`, block 11206686). **This gate condition's core binding claim is now closed** for the fresh-enroll path; the salt-tamper negative test, the v2→v3 migration device-exercise, and on-device multi-enrollment salt distinctness remain open (see the 2026-07-05 resolution annotation on the C-1 row above), and independent audit is still required overall.
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
