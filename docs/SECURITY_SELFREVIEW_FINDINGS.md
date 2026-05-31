# Security Self-Review — Findings Log

> Records what was actually VERIFIED in internal self-review passes (vs. the
> open checklist in SECURITY_REVIEW_CHECKLIST.md, which lists what to verify).
> Purpose: catch cheap issues before paid audit hours, and hand the auditor a
> record of what's already been checked (good prep cuts audit cost ~15–25%).
>
> This is NOT a substitute for the independent audit. "Reviewed by the team +
> Claude" ≠ audited. Mainnet stays gated until the external audit clears.

---

## Pass 1 — vault.js + signing.js (the crown-jewel files)

Reviewed line-by-line. **No vulnerabilities found.** Construction is sound.
Findings below.

### vault.js — VERIFIED CORRECT
- ✅ KDF = Argon2id (memory-hard; correct modern choice over PBKDF2/bcrypt).
- ✅ Cipher = AES-256-GCM via WebCrypto (authenticated; detects tampering).
- ✅ Fresh random salt (16B) + IV (12B/96-bit) per encryption from
  crypto.getRandomValues. No nonce reuse. 96-bit IV is correct for GCM.
- ✅ Derived key imported NON-EXTRACTABLE (importKey(..., false, ...)).
- ✅ Decrypt failure does NOT distinguish wrong-password vs tampered (no oracle).
- ✅ password.normalize('NFKC') before KDF (consistent unicode → stable key).
- ✅ Best-effort zeroization present, with honest comments on JS limits.

### vault.js — ITEMS TO CONFIRM (not bugs)
- ⚠️ **Argon2id params** = memorySize 65536 KiB (64 MiB), iterations 3,
  parallelism 1. Reasonable interactive defaults (≈OWASP lower bound), but
  CONFIRM against low-end MOBILE devices before launch (unlock time vs. cost).
  Deliberate tuning decision for the auditor to pressure-test.
- ⚠️ **base64 helpers (b64/unb64) build JS strings from secret bytes** — JS
  strings are immutable, can't be zeroed, linger until GC. Inherent web-JS
  limitation (already acknowledged in-file). Mitigated by M2 native keystore.
- ⚠️ **decryptVault returns the secret as a plain JS string** — same immutable-
  string limitation; caller (WalletProvider) must minimize hold time.

### signing.js — VERIFIED CORRECT
- ✅ Signing is LOCAL (ethers Wallet); private key never sent to server/RPC.
- ✅ chainId verified vs expected before broadcast (getNetwork() check) —
  genuine defense-in-depth vs wrong-network/replay.
- ✅ isAddress(to) validation rejects malformed recipients.
- ✅ RPC correctly treated as UNTRUSTED: a malicious RPC can misreport/refuse
  but cannot steal keys (signing is local; chainId check guards network).
- ✅ Honest live-secret / minimize-lifetime comments.

### signing.js — ITEMS TO CONFIRM / WATCH
- ⚠️ **privateKey passed as a JS string** — same immutable-string memory limit;
  unavoidable with ethers on web; M2/native is the mitigation.
- 📋 **signMessage signs arbitrary messages** — fine for MVP (native sends), but
  MUST NOT be wired to any untrusted/dApp caller until Phase D adds EIP-712 /
  permit decode + warnings. Confirm it stays internal in the MVP.

---

## The one cross-cutting limitation (most important for the threat model)

**JavaScript cannot securely zeroize secrets in memory.** Mnemonics/keys exist
transiently as immutable JS strings (in vault decrypt output, base64 handling,
and the ethers signer) that can't be reliably wiped and may linger in GC'd
memory. This is a known web-platform constraint, NOT a code defect.

Mitigations / actions:
- Document explicitly in the threat model handed to the auditor.
- M2 (native Secure Enclave/Keychain + Android Keystore) is the real mitigation
  on mobile — keys wrapped by hardware, password not the sole factor.
- Keep decrypted-secret lifetime minimal (verify in WalletProvider review).

---

## Pass 2 — M2b native keystore + biometric UI

**Scope reviewed (read-only, no code changed):**
`src/wallet-core/keystore/native.js`, `…/index.js`, `…/web.js`, `…/keyStore.js`;
`src/lib/WalletProvider.jsx`, `src/lib/biometric.js`;
`src/components/security/BiometricPrompt.jsx`, `BiometricUnlockSettings.jsx`;
`ios/App/App/Info.plist`; `android/app/src/main/AndroidManifest.xml`;
`android/app/src/main/res/xml/data_extraction_rules.xml`;
`docs/M2b.native-keystore-notes.md`.
**Method:** static read + `git` diff confirmation + `grep` sweeps. No device, no
runtime, no audit. Verdicts are **PASS** (evidence in code/config) / **FAIL** /
**CV** = can't-verify-without-device-or-audit.

### Gate-by-gate (against docs/M2.secure-storage.md → "Verification gates")

| # | Gate | Verdict | Evidence |
|---|------|---------|----------|
| 1 | Seed/private key NEVER in webview storage on native | **PASS** (static) · CV runtime | `index.js` routes native→`nativeKeyStore`; `native.js` persists only ciphertext via `SecureStorage` (lines 173-179) and never imports `evm/vaultStore.js`/IndexedDB/localStorage. Only `localStorage` write in scope is the non-secret biometric pref `"1"` (`biometric.js:40`). Device-storage inspection still pending (M2b notes step 7). |
| 2 | Hardware-backed key non-exportable, never leaves Enclave/Keystore | **CV** + design note | Built design is **hardware-*gated* + hardware-backed at-rest store**, not a bespoke Enclave key wrapping the vault key. The only hardware key is the secure-storage plugin's OS master key; its non-exportability is an OS/plugin property, not assertable from this repo. Within Design B's "(or to gate access)" latitude, but the "hardware-wrapped" wording overstates (see F-1). |
| 3 | Biometric required to unlock; lockout / no-enrolment fallbacks safe | **PASS** (present, fail-safe) · CV strength/fallbacks | `native.js authenticateOrThrow()` runs BEFORE read+decrypt in `unlock()` (185); biometric-first with `allowDeviceCredential:false`, lockout→device-credential fallback (133-135), no-enrolment→device-credential (143), no-security→throw (110). **Strength is app-layer, not OS ACL** (F-2). Exact error-code + fallback behaviour need a device (F-6). |
| 4 | iOS ThisDeviceOnly accessibility; no iCloud secret sync | **PASS** (config) · CV runtime | `init()` sets `setSynchronize(false)` (71) and `setDefaultKeychainAccess(whenPasscodeSetThisDeviceOnly)` (75-77) as the write default; `Info.plist` has `NSFaceIDUsageDescription` (30-31). Item-attribute confirmation is a device/audit step. Data-loss tradeoff on passcode removal: F-4. |
| 5 | Android no auto-backup of secrets | **PASS** (config) | `AndroidManifest`: `allowBackup="false"`, `fullBackupContent="false"`, `dataExtractionRules=@xml/data_extraction_rules` (5-7). Rules file excludes `sharedpref/database/file/external/root` from both `cloud-backup` and `device-transfer`. Belt-and-suspenders; sound. |
| 6 | No secret in logs/analytics/crash reports | **PASS** (static) · CV crash-reports | `grep` of keystore+`biometric.js`+`WalletProvider`: no `console.*`/analytics/Sentry of secrets; thrown messages are generic ("No wallet found…", plugin errors), no key material. Runtime crash-report capture not exercised. |
| 7 | Secret in memory only transiently; cleared on lock/background/idle | **PASS** (code) · CV runtime | `nativeKeyStore` caches no plaintext (structural). `WalletProvider.lock()` clears+overwrites the ref (85-94); background-lock wired via `native.js` `App.addListener('pause'/'appStateChange')` → `_lockHook` → `lock()` (84-100, set via `setLockHook` 216-222 + `WalletProvider` effect 112-115); plus `visibilitychange` + 5-min idle. Note: lifetime is **session-scoped**, not strictly per-signing (matches web; see F-5). |
| 8 | Crypto core (vault.js) byte-identical | **PASS** | `native.js` calls `../vault.js` `encryptVault`/`decryptVault` unchanged (175, 194). `git`: `vault.js` & `evm/vaultStore.js` last touched in the original EVM-slice commit — **0 changes** in the M2b merge (`d7265bb`). |

**No hard FAILs.** Headline risks (gates 2 & 3 strength) are known, deferred-to-audit
limitations that the code and `M2b.native-keystore-notes.md` already flag honestly.

### Findings

- **F-1 · "hardware-wrapped" wording overstates the build · LOW (doc/clarity) · cheap fix.**
  `native.js` header and `index.js` call it "hardware-wrapped / hardware-gated key,"
  but no Enclave/StrongBox key wraps the vault-encryption key — the vault key is
  still the Argon2id-derived WebCrypto key, and "hardware-backed" means the
  plugin's at-rest store. This is legitimate under Design B's "(or to gate access)"
  wording, but the phrasing can read as Enclave key-wrapping that isn't implemented.
  *Action:* tighten wording to "hardware-**gated** unlock + hardware-backed
  at-rest storage" wherever "hardware-wrapped" appears. Doc-only; no behaviour change.

- **F-2 · Biometric gate is app-layer, not an OS-enforced item ACL · the key audit item · defer (M2c/M2d).**
  `authenticate() → then SecureStorage.get()` is bypassable by anyone able to run
  code in the app/webview context (the stored item is passcode-gated, not
  `biometryCurrentSet`/`setUserAuthenticationRequired`-bound). Already documented
  in `native.js` (32-40) and the notes. Real fix = a plugin exposing per-item
  biometric ACL, or a thin custom native plugin (expands audit scope). Not fixable
  cheaply now; must be explicit in the auditor brief and not oversold to users.

- **F-3 · `isBiometricUnlockEnabled()` toggle does not gate native unlock · LOW (UX/consistency) · fail-safe.**
  On native, `runBiometricGate()` is a no-op and `native.js` prompts whenever a
  vault exists — so the Security-settings toggle has no effect on device (it only
  drives the demo prompt). Direction is safe (always-on biometric), and
  `WalletProvider` (72-75) documents it, but the settings UI implies user control
  it doesn't have on device. *Action (small):* either honour the toggle on native
  or relabel the setting as "always required on this device."

- **F-4 · `whenPasscodeSetThisDeviceOnly` = vault lost if passcode removed · INFO · deliberate.**
  Strongest accessibility class, but iOS deletes the Keychain item if the user
  removes their device passcode → on-device vault gone (recoverable only via the
  user's seed backup). Correct security choice; surface it in recovery UX/docs so
  it isn't a support surprise.

- **F-5 · Secret held for the whole unlocked session, not only during signing · INFO · matches web.**
  Gate wording aspires to "reconstructed in memory only for the signing op"; the
  implementation keeps the mnemonic in `WalletProvider`'s ref for the unlocked
  session and clears on lock/idle/background (same as web). Acceptable and
  unchanged from the audited web path; per-signing-only reconstruction is a
  potential M2d hardening, not a regression.

- **F-6 · Lockout/fallback depends on exact plugin error codes · CV · device test.**
  The `err.code === 'biometryLockout'` branch (133) and the no-enrolment fallback
  need on-device confirmation against `@aparajita/capacitor-biometric-auth`'s
  actual error taxonomy across iOS/Android. M2b notes already list this as a
  device-test gate.

### Cheap things worth doing before building further
1. **F-1** — fix the "hardware-wrapped" wording (doc/comment-only). 5 minutes.
2. **F-3** — make the native biometric-toggle semantics honest (small UI/logic).
3. **F-4** — add the passcode-removal caveat to recovery docs/UX copy.
4. Carry **F-2** and **F-6** into the auditor brief and the M2c/M2d hardening list
   (OS-enforced ACL + on-device fallback/lockout testing) — already tracked in
   `M2b.native-keystore-notes.md`; just ensure they're in the audit scope doc.

*Pass 2 review itself changed no code.*

**Follow-up (addressed in `fix/m2b-selfreview-cheap-fixes`):** F-1 wording
corrected across `native.js`/`index.js`/`keyStore.js`/`WalletProvider.jsx` +
M2b notes ("hardware-gated unlock + hardware-backed at-rest storage"); F-3
biometric toggle now shown as forced-on/disabled with honest copy on native;
F-4 passcode-removal recovery caveat added to the settings UI and M2b notes.
**F-2** (OS-enforced biometric ACL) and **F-6** (on-device lockout/fallback
testing) remain deferred to M2c/M2d + the independent audit — no code change.

---

## Still to self-review (future passes)
- [ ] mnemonic.js — entropy source, BIP-39 checksum, 12/24-word paths.
- [ ] derivation.js — BIP-32/44 path, vector match, index correctness.
- [ ] WalletProvider.jsx — in-memory session, clear-on-lock / idle / tab-hide,
      that no secret leaks into state/query-cache/props (this is where the
      "minimize lifetime" intent is actually implemented — important).
- [ ] vaultStore.js — only ciphertext persisted; non-encrypted-object guard.
- [ ] token-send.js / calldata.js — re-confirm decimals + approval guard.
- [ ] grep pass: no secret written to logs/analytics/network/storage anywhere.

## Reminder
These passes raise confidence and cut audit cost — they do NOT replace the
independent third-party audit, which remains the gate before any mainnet use.
