# M2b — Native Secure Storage + Biometrics (implementation notes)

> **STATUS: PROVISIONAL — NOT AUDITED-SECURE.** This slice is in the
> independent-audit scope (see docs/M2.secure-storage.md → "Verification gates").
> Do not treat the native key handling as secure on the strength of this code
> alone. Testnet only; mainnet stays gated.

## What this implements

The **native branch of the keyStore seam** introduced in M2a, using **Design B**
(hardware-wrapped / hardware-gated key). It changes only **WHERE the vault lives**
and **HOW unlock is gated** on a real native platform. The audited crypto
(`wallet-core/vault.js`, Argon2id + AES-GCM) and the vault blob format are reused
**byte-identically** — no algorithm, parameter, or layout change.

| Concern | Web (unchanged) | Native (M2b) |
|---|---|---|
| Vault ciphertext at rest | IndexedDB (`evm/vaultStore.js`) | iOS Keychain / Android Keystore-backed store, `ThisDeviceOnly`, passcode-gated, no iCloud sync, no auto-backup |
| Unlock factor(s) | password | **biometric AND password** (strictly stronger) |
| Seed/private key in webview storage | n/a (web is the IndexedDB design) | **NEVER** — only ciphertext, only in the native secure store |
| In-memory secret | transient in `WalletProvider` | transient in `WalletProvider`; the native store caches **no** plaintext |
| Background clear | `visibilitychange` auto-lock | `visibilitychange` **+** `@capacitor/app` `pause`/`appStateChange` → live secret cleared |

## Plugins chosen (vetted, not hand-rolled)

| Plugin | Version | License | Role | Notes |
|---|---|---|---|---|
| `@aparajita/capacitor-secure-storage` | ^8.0.0 | MIT | Hardware-backed ciphertext storage | Capacitor-8 native; iOS Keychain (via `KeychainSwift`), Android Keystore-backed. Author: Aparajita Fishman (prolific Capacitor-plugin maintainer). Published 2026-02-10. |
| `@aparajita/capacitor-biometric-auth` | ^10.0.0 | MIT | Face ID / Touch ID / BiometricPrompt gate | Same author; Capacitor-8 native; consistent cross-platform error codes. Published 2026-02-09. |
| `@capacitor/app` | ^8.1.0 | MIT | App `pause`/state events for background-lock | Official Capacitor plugin. |

**No native Swift/Kotlin was hand-written.** All native code comes from the
vetted plugins above. The audit scope therefore expands to **these three plugins**
(and the transitive `KeychainSwift`), but not to any bespoke native code in this repo.

## Honest limitation (key audit item)

The biometric prompt is an **app-layer gate** (`authenticate()` → then read the
item), **not** an OS-enforced biometric ACL bound to the stored item
(`kSecAttrAccessControl(biometryCurrentSet)` on iOS, `setUserAuthenticationRequired`
on a Keystore key on Android). The chosen plugins protect the item with
hardware-backed, `ThisDeviceOnly`, passcode-gated accessibility but do **not**
expose per-item biometric-ACL binding. A stronger variant requires either a
plugin that exposes that flag or a thin custom native plugin — which **expands
the audit scope** and is deferred to M2c/M2d.

Likewise, `isSecureHardwareAvailable()` returns whether a device credential is set
(the precondition for hardware protection) as a **proxy** — the plugins do not
expose a direct Secure Enclave / StrongBox probe, so StrongBox specifically cannot
be asserted from JS.

## Files changed

- `src/wallet-core/keystore/native.js` **(new)** — native KeyStore (Design B).
- `src/wallet-core/keystore/index.js` — `getKeyStore()` native branch via lazy,
  code-split dynamic import behind `Capacitor.isNativePlatform()`.
- `src/lib/WalletProvider.jsx` — optional `keyStore.setLockHook?.(lock)` (no-op on
  web) for native background-lock. Web behaviour unchanged.
- `package.json` / `package-lock.json` — the three plugins above.
- `ios/App/App/Info.plist` — `NSFaceIDUsageDescription` (required for Face ID).
- `android/app/src/main/AndroidManifest.xml` — `allowBackup=false`,
  `fullBackupContent=false`, `dataExtractionRules`.
- `android/app/src/main/res/xml/data_extraction_rules.xml` **(new)** — exclude all
  app data from cloud backup + device transfer.
- `ios/.../Package.swift`, `Package.resolved`, `android/.../capacitor.*.gradle` —
  `cap sync` plugin registration.

`wallet-core/vault.js`, `evm/vaultStore.js`, the demo logic, and the mainnet gate
are **untouched**.

## What was verified here vs. what needs a device + audit

**Verified locally:** 58/58 tests pass; `check:rng` green; web `vite build` succeeds
with `native.js` code-split out of the main bundle (plugin code never statically
bundled into the web entry); `cap sync` registers all three plugins; **iOS
simulator build (`xcodebuild ... -sdk iphonesimulator`) SUCCEEDS**; all changed
XML/plist well-formed.

**NOT verifiable without a device/runtime + audit:** the actual Face ID/Touch ID
prompt flow; that the Keychain/Keystore item is genuinely hardware/Enclave/StrongBox
protected; runtime confirmation that nothing secret lands in IndexedDB/localStorage
on device; lockout / no-enrolment fallback behaviour on real hardware; the Android
gradle build + emulator run (no Android SDK was configured in this environment —
XML validated only). These are the M2 audit/device-test gates.

## How to test biometric unlock on the iOS Simulator

1. `npm run mobile:build` (or `npm run mobile:build:demo` for demo mode) — builds
   web assets and runs `cap sync`.
2. `npx cap open ios` — opens the project in Xcode.
3. Pick an iPhone simulator (e.g. iPhone 15) and **Run** (▶).
4. In the simulator menu: **Features → Face ID → Enrolled** (and set a passcode if
   prompted: **Settings → Face ID & Passcode**). A passcode/biometric enrolment is
   required, since the vault uses passcode-gated, biometric-gated unlock.
5. **Create/import a wallet**, set a password. (Writes ciphertext to the Keychain;
   no biometric prompt on create.)
6. **Lock** the wallet (or wait for the 5-min idle auto-lock), then **Unlock**:
   a Face ID sheet should appear. In the simulator, **Features → Face ID →
   Matching Face** to approve (or **Non-matching Face** to simulate failure).
7. **Key-persistence check:** with the wallet created, in Safari Web Inspector
   (Develop → Simulator → your app) inspect **IndexedDB/localStorage** — there
   should be **no `veyrnox-vault` IndexedDB store and no seed/mnemonic** anywhere
   in webview storage on native.
8. **Lock-clears-key check:** unlock, then background the app (Cmd+Shift+H /
   swipe up). Re-open — it should require biometric re-auth (the live secret was
   cleared on background via the App `pause` hook + `visibilitychange`).
