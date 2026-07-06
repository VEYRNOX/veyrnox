# Independent Audit — Android Hardware-KEK Suite — 2026-07-06

> **WHAT THIS IS:** an independent code-and-artifact audit of four shipped Android
> security features — Hardware KEK, C-1 salt binding (v3 / PR #568), biometric
> re-enroll invalidation, and the LOG-1 debug bridge logger leak. It reviews the
> code, tests, patches, Capacitor config, and evidence docs that are actually in the
> tree, cross-checks them against the internal status table, and reconciles claims.
>
> **PROVENANCE — INDEPENDENT REVIEW (of the implementation), AI-conducted, owner-directed.**
> Performed by a separate Claude Code session on 2026-07-06 against repo HEAD — independent
> *of the code's authors* (a distinct reviewer, not the implementer). This is a
> **code-honesty and correctness review**. It is explicitly **one tier below, and does NOT
> satisfy, the external live-device + formal-cryptography third-party audit** (§24) the code
> itself still asks for (`UNAUDITED-PROVISIONAL`) — "independent" here means independent of
> the implementer, NOT an external human-cryptographer engagement. Recommendations are
> advisory; status-doc edits are the owner's call. **Nothing in this PR changes source or tests.**

## Scope and method

- **Reviewed:** `HardwareKekPlugin.kt`, `wallet-core/keystore/{native,hardware,kek,index}.js`,
  `lib/passkey.js`, `capacitor.config.ts`, `MainActivity.java`, the `patches/` bundle,
  the KEK test suite, and the device-verification / decision docs.
- **Cross-checked** every "What's Done" claim against the code that backs it.
- **On-chain check:** the referenced Sepolia block `11206686` (`0xab001e`) exists on
  Ethereum Sepolia (hash `0xa8934e64…fe550`), timestamp consistent with 2026-07-05.
- **NOT done (still the third-party audit's job):** building the APK, driving a real
  device, reviewing the iOS Objective-C plugin, and formally proving the HKDF-combine
  and deniability properties.

## Headline

The code is strong: consistent fail-closed discipline, machine-coded errors, honest
`UNAUDITED-PROVISIONAL` headers, and no fake security. **No security regression was found
in the C-1 fix.** The material issues are (a) the internal **status table is stale**
against repo HEAD, (b) one feature is **mis-titled** in a way that overstates the
guarantee, and (c) an **evidence contradiction** around v2 vs v3 on-device.

## Status reconciliation

| Feature | Table said | Audit finding |
|---|---|---|
| Hardware KEK "StrongBox HMAC-SHA256" | Provisional | Code correct — but **StrongBox is not enforced** (best-effort, TEE/software fallback). Title overclaims. |
| C-1 Salt Binding (v3, PR #568) | Unaudited | Fix is **real and correct** end-to-end. Stale "v2" comments; **device-evidence doc says "v2 confirmed," contradicting the "v3 device-verified" claim.** |
| Biometric Re-enroll Invalidation | Unaudited | Correct **for KEK-enrolled vaults**; does **not** apply to the app-layer biometric gate on a bare vault. Table conflates the two. |
| LOG-1 Debug Bridge Logger | "fix outstanding" | **Already fixed in-tree** (redaction patches + `patch-package`). Residual: allowlist fragility + version-pinned patch. |

---

## Feature 1 — Android Hardware KEK

**Verified correct.** `HardwareKekPlugin.kt`: HMAC-SHA256 in AndroidKeyStore,
`setUserAuthenticationRequired(true)`, `setInvalidatedByBiometricEnrollment(true)`,
`AUTH_BIOMETRIC_STRONG` only (no device-credential bypass, H16), API-30 gate with an
honest `KEK_REQUIRES_ANDROID_11`, L3 no-silent-rekey guard, per-use biometric via
`CryptoObject`. All-zero-H is rejected in **both** `hardware.js` and `combineKek`
(defense in depth).

### F1.1 — "StrongBox" title overclaims (MEDIUM, honesty)

`tryEnrollKey(useStrongBox=true) || tryEnrollKey(useStrongBox=false)`
(`HardwareKekPlugin.kt`) allows the key to land in **TEE or software**, and the enroll
gate `ACCEPTED_TIER_NAMES` (`hardware.js`) accepts `STRONGBOX`, `TRUSTED_ENVIRONMENT`,
`SECURE_HARDWARE_PRE31`, and `UNKNOWN_SECURE`. The delivered guarantee is
"hardware-backed AndroidKeyStore, **StrongBox-preferred**." The code and docs are honest
about this (floor-raise is a documented pending decision,
`strongbox-tier-enforcement-decision-2026-07-06.md`); only the **feature title** is not.
StrongBox was genuinely achieved on the Pixel 10 Pro XL (`securityLevel=2`), but that is
one device, not the guarantee. **Recommend retitling** to
"AndroidKeyStore HMAC-SHA256 (StrongBox-preferred, TEE-accepted)."

### F1.2 — StrongBox unobservable on Android 11 (LOW)

`readSecurityLevel()` reads the real tier enum only on API ≥ 31; on API 30 it degrades to
`isInsideSecureHardware()` → `SECURE_HARDWARE_PRE31`. A StrongBox key on an Android-11
device cannot be surfaced as StrongBox. Honesty-preserving, but relevant to the badge.

**Residual (outstanding items valid):** no StrongBox enforcement, multi-device untested,
TEE/software fallback never device-exercised.

## Feature 2 — C-1 Salt Binding (v3, PR #568)

**Verified correct, full chain.** Per-enrollment 32-byte `kekSalt` (`native.js`) →
base64 across the bridge (`hardware.js`) → Kotlin distinguishes **present-but-null → fail
closed** vs **absent → v1 fixed-salt fallback** via `call.data.has("kekSalt")`
(`HardwareKekPlugin.kt`) → facade forwards `opts` verbatim (`index.js`, the actual
bridge-bug fix). `hfOptsForBlob` maps v3→`{kekSalt}`, v2/v1→fixed salt (backwards-compat
preserved). The bridge-encoding fix is unit-tested including the JSON round-trip
(`hardware.kek-salt-bridge-encoding.test.js`). **This fix is sound.**

### F2.1 — Evidence contradiction: "v3 device-verified" vs. doc says "v2" (MEDIUM)

The status table claims "Fresh **v3** enrollment on Pixel 10 Pro XL (2026-07-05)," but
`docs/device-verification-2026-07-05.md` states **"KEK v2 protocol (per-enrollment salt)
confirmed"** — and that doc was compiled after PR #568 merged. Fresh enrollments stamp
**v3** in code. Either the device run exercised pre-#568 (v2) code, or the label is stale.
**The v3-on-device claim is not supported by the evidence doc it rests on.** Reconcile
before treating v3 as device-verified.

### F2.2 — Stale "v2" comments in security-critical files (LOW-MEDIUM)

`HardwareKekPlugin.kt` still documents "C-1 (v2 protocol)" / "v2 per-enrollment binding";
`hardware.js` and `kek.js` mix v2/v3 language. The native side is version-agnostic (it
uses `kekSalt` when present), so this is **comments, not a bug** — but confusing in files
an auditor reads to trust the binding.

### F2.3 — "v2→v3 lazy migration" outstanding item is obsolete (LOW)

The lazy on-unlock migration was **removed** (comments dated 2026-07-06) because it forced
a third biometric prompt and could re-prompt forever on write failure. It is replaced by
explicit `changePassword` / `upgradeKekToV3`, which are fail-closed and unit-tested
(`native.kek-v3-migration.test.js` §C/§D). There is nothing "lazy" left to device-test —
retire the item.

### F2.4 — Salt-tamper negative test genuinely missing (LOW)

There is a degenerate/empty-salt test (§E) and a wrap-version-tamper test
(`kek.wrap-aad.test.js` (c)), but **no test mutates a valid v3 `kekSalt` to a different
valid 32-byte value and asserts `UNWRAP_FAILED`.** The code fails closed by construction
(changing `kekSalt` changes both H and C → wrong KEK → GCM auth failure), but it is
asserted, not proven. Cheap to add.

**Verified accurate:** per-enrollment salt distinctness is unit-proven with real
`crypto.getRandomValues` (§B) — matches "unit-proven only."

## Feature 3 — Biometric Unlock (Re-enroll Invalidation)

**Verified correct.** `setInvalidatedByBiometricEnrollment(true)` is set;
`KeyPermanentlyInvalidatedException` is caught in `getHardwareFactor` → key deleted +
reject "re-enrollment required" (fail closed). The native passkey path (`passkey.js`)
honestly uses the OS biometric as the possession factor, flagged `nativeBiometric` (not
FIDO2) — no fake security.

### F3.1 — Invalidation scope is narrower than the title implies (LOW-MEDIUM)

`KeyPermanentlyInvalidatedException` protection exists **only when the Hardware KEK is
enrolled** (it is a property of the Keystore HMAC key). The plain "biometric unlock" toggle
on a **bare** vault is an **app-layer** prompt (`authenticateOrThrow` →
`BiometricAuth.authenticate`), which `native.js` correctly flags as *not* an OS-enforced
per-item ACL. "Re-enroll Invalidation" is real for KEK vaults and **not applicable** to
bare-vault biometric unlock. The table treats them as one feature; they are distinct.

**Residual (outstanding items valid):** multi-device, multi-fingerprint re-enroll, and
Appium UI E2E remain untested by any independent party.

## Feature 4 — LOG-1 Debug Bridge Logger

**The status table is out of date — the fix is already committed.**

- `patches/@capacitor+android+8.4.1.patch` and the iOS twin redact **both call args and
  results** for `HardwareKek` and `SecureStorage` in the bridge console logger, applied via
  `postinstall: patch-package`.
- `capacitor.config.ts` documents `loggingBehavior:'debug'` (release builds emit no bridge
  logs); `MainActivity.java` disables WebContents debugging in release.

### F4.1 — Fix is real but fragile (MEDIUM, debug-only)

1. **Name-allowlist redaction** (`['HardwareKek','SecureStorage']`) — any other sensitive
   plugin (future, or a change to `RaspIntegrity` / `FileSaver`) is **not** redacted.
2. **Version-pinned monkey-patch** — a Capacitor bump past `8.4.1` silently drops the patch
   and re-opens the leak. **CI should assert the patch applies.**
3. Production-build-config verification and CI logcat scrubbing (existing outstanding
   items) remain valid.

**Action:** move LOG-1 from "fix outstanding" to "fixed-in-tree, hardening pending." It is
not a separate un-started task.

---

## Prioritized recommendations

1. **Reconcile the v2/v3 evidence contradiction** (F2.1) — the most substantive gap.
2. **Retitle the StrongBox feature** (F1.1) and **correct the LOG-1 status** (F4) in the
   status table — both are honesty issues in the project's own docs.
3. **Sync the stale v2 comments** (F2.2) in the Kotlin plugin and `kek.js`.
4. **Add the salt-tamper valid-value negative test** (F2.4) and a **CI check that the
   redaction patch applies** (F4.1).
5. **Split the biometric feature** into "KEK re-enroll invalidation" vs. "app-layer
   biometric gate" (F3.1).

## What was NOT found

No CRITICAL code vulnerability in the reviewed Android + shared-JS surface. The C-1 salt
binding, the bridge-encoding fix, the fail-closed migration, and the key-material zeroing
are all correct as written. The on-chain block reference is real and time-consistent, but
an on-chain transaction carries **no** evidence of the client-side KEK gate and cannot
substantiate that claim on its own.
