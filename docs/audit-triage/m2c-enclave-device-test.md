# M2c — Secure Enclave key-wrap: physical-iPhone device-test report

> **STATUS: NOT RUN.** This is the checklist to execute on a physical iPhone
> before `M2C_HARDWARE_WRAP_ENABLED` may be flipped to `true`. Nothing below is
> confirmed. Per CLAUDE.md ("Verify, don't assert") the Enclave path is **BUILT,
> not verified** until every box here is checked on real hardware AND the
> independent audit signs off. The iOS Simulator has no Secure Enclave, so it
> exercises ONLY the M2b fallback path and can confirm none of this.
>
> Related: `docs/M2cd.native-acl-plan.md` (plan), the M2c-1/M2c-2 code in
> `src/wallet-core/keystore/native.js` + `ios/App/CapApp-SPM/Sources/CapApp-SPM/`
> (hardened by PR #1098, 2026-07-17 — delete-intent gate + stale-key check + versioned
> key tag, see the two new sections below), and the Android mirror doc
> `docs/audit-triage/m2d-strongbox-device-test.md` (also STATUS: NOT RUN).

## Preconditions
- [ ] Physical iPhone with Face ID or Touch ID, device passcode set, ≥1 biometric enrolled.
- [ ] A build where `M2C_HARDWARE_WRAP_ENABLED = true` (test build ONLY — do not merge the flip until this report is complete).
- [ ] Xcode Console.app / device console attached for the log checks below.

## Capability detection
- [ ] `isHardwareKeyAvailable()` returns `{ backing: 'secureEnclave', biometryEnrolled: true }` on the device.
- [ ] On the iOS Simulator the same call returns `backing: 'none'` and the app uses the M2b fallback (no Enclave calls).

## Fresh vault (createVault hardware path)
- [ ] Create a new wallet. No biometric prompt during creation (wrap is a public-key op).
- [ ] Inspect the stored record (Console/Keychain): it is `{ wrap: 'enclave-v1', hw: '<base64>' }` — NOT a raw `{v,kdf,salt,iv,ct}` blob.
- [ ] The mnemonic / decrypted blob NEVER appears in logs during create.

## Unlock (unwrap → OS biometric)
- [ ] Unlock prompts Face ID / Touch ID (the prompt is OS-presented, driven by the key ACL — not the app-layer gate).
- [ ] The prompt shows the wallet-specific reason string ("Unlock your VEYRNOX wallet").
- [ ] Correct biometric → unlock succeeds; wrong/absent biometric → unlock fails closed (`veyrnoxBiometricGate` path shown), never opens the decoy.
- [ ] Cancel → `USER_CANCEL` surfaced; the password escape-hatch UI appears.
- [ ] Force biometric lockout (repeated failures) → `BIOMETRY_LOCKOUT`; confirm the actual fallback UX and record it here.

## Non-exportability & invalidation (the F-2 guarantees)
- [ ] Confirm the private key is non-exportable (`SecKeyCopyExternalRepresentation` on the private key returns nil / the item cannot be dumped).
- [ ] `biometryCurrentSet` invalidation: add or remove a Face ID / Touch ID enrolment, then attempt unlock → the Enclave key is invalidated (unwrap fails with `KEY_NOT_FOUND` / `UNWRAP_FAILED`), and the documented recovery (seed re-import) is required. Record exact behaviour.

## Delete-intent gate (PR #1098, P2-#1/P2-A — already ships)

> PR #1098 hardened `deleteWrappingKey()` to require an allowlisted `intent`
> (`'cleanup' | 'unenroll' | 'wipe'`), enforced BOTH at the JS wrapper (`veyrnoxEnclave.js`)
> and re-enforced at the Swift native selector (`VeyrnoxEnclavePlugin.swift`) so an
> in-page script calling `Capacitor.Plugins.VeyrnoxEnclave.deleteWrappingKey()` directly
> cannot bypass the JS layer. Mirrors the Android M2d-1a delete-intent gate — see
> `docs/audit-triage/m2d-strongbox-device-test.md`.

- [ ] Call `Capacitor.Plugins.VeyrnoxEnclave.deleteWrappingKey()` from Safari Web
      Inspector with no argument → rejects with `M2C_DELETE_INTENT_REQUIRED`, no
      Keychain write.
- [ ] Call with `{ intent: 'CLEANUP' }` (wrong case) → rejects.
- [ ] Call with `{ intent: 'cleanup' }` → resolves; Enclave key removed.
- [ ] Call with `{ intent: 'unenroll' }` → resolves; Enclave key removed.
- [ ] Call with `{ intent: 'wipe' }` → resolves; Enclave key removed.

## Stale-key detection (PR #1098, P2-#2 — already ships, NOT device-verified from the Windows dev box that authored it — this is the physical-iPhone re-test the PR itself flagged as required)

> `EnclaveKeyService.createWrappingKey()` no longer trusts a bare
> `loadPrivateKey() != nil` check before reusing a key; a new
> `loadPrivateKeyAttributes()` peer asserts `kSecAttrTokenID ==
> kSecAttrTokenIDSecureEnclave` before reuse. A non-Enclave-backed stale item (e.g.
> a leftover key from an older/weaker-ACL dev build) now throws
> `EnclaveError.staleWrappingKey` / `STALE_WRAPPING_KEY` instead of silently deleting
> and recreating. The Enclave key application tag is also now versioned
> (`...enclaveWrappingKey.v2`, P2-B) — a key found under the current versioned tag is
> guaranteed to have been minted by this codepath with this ACL.

- [ ] `createWrappingKey()` on a fresh device (no prior key) succeeds and mints a key
      under the versioned tag `com.veyrnox.app.enclaveWrappingKey.v2`.
- [ ] Calling `createWrappingKey()` again reuses the same key (idempotent) — confirm
      via the Keychain item's creation-date attribute not changing.
- [ ] (Requires a way to plant a non-Enclave key under the legacy unversioned tag —
      e.g. an intentionally-old test build or a manual Keychain item insert) confirm
      `createWrappingKey()` throws `STALE_WRAPPING_KEY` rather than silently
      deleting/recreating the stale item.

## Migration (legacy M2b → Enclave) — OPT-IN
> Policy: up-migration fires ONLY when biometric unlock is enabled
> (`opts.requireBiometric`). A password-only vault stays M2b and is never bound
> to a mandatory biometric.
- [ ] Install a pre-M2c (or flag-off) build, create a wallet, note address(es) + balances. Do NOT enable biometric unlock.
- [ ] Install the flag-on build over it (do not wipe). Unlock with password only (biometric unlock still off) → record stays legacy M2b (no up-migration).
- [ ] Enable biometric unlock, then unlock again → after this unlock the stored record is now `{ wrap: 'enclave-v1', ... }` (transparent re-wrap, no seed re-entry).
- [ ] Same address(es) + balances appear (funds byte-identical; only the container changed).
- [ ] Force-quit + reopen → unlocks via the Enclave path; migration does not re-run (idempotent).
- [ ] Simulate a wrap failure mid-migration → the legacy record survives and unlock still returns the secret (atomic-safe).
- [ ] **Down-migration on disable** (`disableBiometricUnlock` → `keyStore.downgradeFromHardwareWrap()`): turn biometric unlock OFF → exactly one biometric prompt (the unwrap), the record becomes plain M2b, the wrapping key is deleted, and a subsequent unlock works with password only and NO biometric prompt.
- [ ] **Disable-cancel edge case:** cancel the biometric during disable → the vault stays Enclave-wrapped (still unlockable via the ACL biometric), no fund loss / no strand. Record the actual UX (preference may read off while the record is still wrapped until a successful disable).

## changePassword (Enclave path)
- [ ] With an Enclave-wrapped vault, change the password → biometric prompt appears (unwrap), new password takes effect, wrong current password is rejected, record stays `enclave-v1`.

## No-secret-in-logs (release build)
- [ ] Release-configuration run on device: no mnemonic / blob / DEK in Console.app across create / unlock / migrate / changePassword.

## Sign-off
- [ ] Device model + iOS version: __________
- [ ] Tester + date: __________
- [ ] All boxes above checked on real hardware.
- [ ] Findings status updated to **`F-2: closed-pending-independent-audit`** (NEVER `closed` — independence is separate).
- [ ] Only after all of the above: merge the `M2C_HARDWARE_WRAP_ENABLED = true` flip.
