# Veyrnox — project guide for Claude Code

Veyrnox is a self-custody, coercion-resistant crypto wallet (Vite + React + Capacitor;
ethers v6; @noble / @scure). Web + mobile (iOS/Android via Capacitor). The seed is the
identity; the app never holds keys server-side.

## Hard rules (do not violate)

- **Mainnet unlocked 2026-06-17.** Internal security audit complete; owner sign-off
  recorded in `docs/audit-triage/internal-audit-2026-06-17.md`. `ALLOW_MAINNET = true`,
  `ALLOW_BTC_MAINNET = true`, `ALLOW_SOL_MAINNET = true`. Both audits are now complete:
  the internal audit (2026-06-17, the mainnet gate) and the independent ECC third-party
  audit (2026-06-23). A 2026-06-27 independent review of unvalidated audit claims
  (`docs/audit-2026-06-27-unvalidated-claims.md`) identified 3 HIGH + 5 MEDIUM findings —
  mitigations landed in PRs #421–#426 (see §8a in `docs/Feature-Status.md`). "Internal"
  is never to be presented as "independent" (I4 honesty).
  A 2026-06-28 internal static-analysis pass (0C/4H/11M/8L) fixed 10 of 11 actionable
  findings (PRs #433, #440–#443); H-NEW-D (iOS SE) + F-01/F-02 (biometric OS-ACL) +
  ~~F-09 (RASP device)~~ ✅ DEVICE-VERIFIED (FULL, INTERNAL) 2026-07-12 — Samsung Galaxy Note 20 5G (SM-N981B), Magisk v30.7, Android debug build. `RaspIntegrityPlugin` registered; `checkIntegrity()` called via Capacitor bridge (logged 23:40:01): `{"rooted":false,"hookedProcess":false,"emulator":false,"tampered":false}`. `rooted:false` is expected and honest: Magisk Hide operates at OS-probe level (not a code flaw). `tampered:false` achieved by injecting debug keystore SHA-256 via `-PRELEASE_CERT_SHA256` Gradle property. Pre-sign gate: `TIER.ALLOW` (all signals false) → send proceeded after CAUTION acknowledgement (sim disabled). On-chain: Ethereum mainnet txid `0x4556e2e68087d0b75b35504247ed09f011d42614f11b31c5d1423694799da515`, block 25,511,567 (0x1854a8f), status SUCCESS, 0.001 ETH. Honest gaps: `rooted:false` on Magisk device (Magisk Hide — probe-level, expected); `tampered` check requires `RELEASE_CERT_SHA256` set in production Gradle build; independent audit still outstanding. Two bugs found and fixed this session: PR #832 (CAUTION verdict now `requiresConfirmation=true`; RASP WARN banner has acknowledge checkbox) + PR #834 (`riskReady=true` when `simEnabled=false` — previously caused permanent send block). INTERNAL — not independently audited. M-K (passkey counter) remains open, native/device-gated.
  INTERNAL pass — not independent. (See `docs/Audit.scope.md`.)
  A 2026-07-01 internal static-analysis audit (Hardware KEK — WebAuthn PRF, iOS SE,
  Android StrongBox) found 1C/9H/12M/6L; 10 remediable findings fixed (PRs #520–#522).
  The 1 CRITICAL — C-1, Android HMAC fixed input — went through a RESOLVED (2026-07-02,
  PR #529, Sepolia txid `0xeb71a5d…` block 11187337; proved the unlock FLOW only) →
  REGRESSED (2026-07-05: per-enrollment salt binding cryptographically inert on-device —
  a facade arg-drop + Capacitor-bridge `JSON.stringify` silently reverted enroll+unlock to
  the fixed v1 salt) → FIXED / device-verified (2026-07-05, v3, PR #568, Sepolia txid
  `0xecd68494…` block 11206686) cycle. The full narrative, on-device evidence, and the four
  still-open Android C-1 items (salt-tamper negative test, v2→v3 migration device-exercise,
  on-device multi-enroll salt distinctness, independent audit) live in the **Hardware KEK
  Phase 1/2 Rollout** section below and `docs/audit-2026-07-01-kek-internal.md` (where the
  2026-07-05 regression note is preserved above the resolution, not deleted). Also open:
  LOG-1 (debug-build logcat leaks the KEK factor H + vault blob; remediation BUILT PR #572,
  tracked separately) and the native/device-gated iOS items (iOS-F5, iOS-F3, iOS-F9
  evidence gap, H-2/iOS-F11 iOS half). H-NEW-D CLOSED (SE ECIES confirmed in ObjC at
  `HardwareKekPlugin.m:78`). INTERNAL pass — never presented as "independent" (I4 honesty).
  See `docs/audit-2026-07-01-kek-internal.md`.
  A 2026-07-06 INTERNAL code-and-artifact review of the Android hardware-KEK suite
  (`docs/audit-triage/independent-audit-2026-07-06-android-kek-suite.md`, PR #683 —
  merged via admin override, single-collaborator repo) headlined "no security regression
  found in the C-1 v3 fix." Its filename/PR title use the word "independent," but the
  document's own provenance line says exactly what it is: AI-drafted, code-and-artifact
  only, "one tier below the live-device + formal-crypto third-party audit the code still
  asks for" — it is NOT the independent third-party audit these hard rules still list as
  outstanding, and must never be cited as such (I4). Findings were documentation-honesty
  gaps, not vulnerabilities: F1.1 (MED) the "StrongBox HMAC-SHA256" feature title
  overclaims — StrongBox is preferred by the enroll gate, not enforced, TEE/software
  fallback accepted (tracked in `docs/audit-triage/strongbox-tier-enforcement-decision-2026-07-06.md`);
  F2.1 (MED) an evidence contradiction between `docs/device-verification-2026-07-05.md`
  (still reads "KEK v2 protocol confirmed") and this file's v3 device-verified claim —
  **PR #686 (merged 2026-07-06)** added a `HardwareKekPlugin.kt` LABEL NOTE clarifying the
  debug `"salt-source: v2-bound"` string is a legacy branch label, not the vault's
  `hardwareKekVersion` stamp, but did NOT edit `docs/device-verification-2026-07-05.md`
  itself — that evidence doc remains stale and still needs its own correction pass, flagged
  for the owner; F2.2 (LOW-MED) stale "v2" comments in `HardwareKekPlugin.kt` — **FIXED,
  PR #686** (the same LABEL NOTE + a v2→v3 correction on the `PRF_EVAL_SALT` block comment);
  `kek.js` was not touched by #686 and may still carry stale wording; F2.3 (LOW) the
  "v2→v3 lazy migration not device-exercised" residual item is obsolete — confirmed by
  source check that the lazy on-unlock migration was already removed 2026-07-06 (PR #662)
  and replaced by the fail-closed `changePassword`/`upgradeKekToV3` path, so the residual
  wording below is corrected; F2.4 (LOW-MED) no test previously mutated a valid v3
  `kekSalt` to a different valid 32-byte value and asserted fail-closed — **FIXED, PR #685
  (merged 2026-07-06)**, which adds `kek.salt-binding-tamper.test.js` covering
  both-factor/H-only/C-only tamper; F4.1 (LOW-MED) the LOG-1 fix was already in-tree
  (redaction patches + patch-package) but this file's wording had lagged — residual risk is
  the redaction name-allowlist's fragility and the patch being version-pinned with no CI
  check that it actually applied — **FIXED, PR #685 (merged 2026-07-06)**, which adds
  `scripts/check-log-redaction-patch.mjs` + a CI `verify` step; F3.1 (LOW-MED) the
  biometric re-enroll invalidation guarantee applies only
  to KEK-enrolled vaults, not the bare-vault app-layer biometric gate — the two are distinct
  features this file should not conflate. The audit independently confirmed the full C-1 v3
  salt-binding chain, fail-closed `changePassword`/`upgradeKekToV3`, key-material zeroing,
  and all-zero-H rejection as correct, and noted Sepolia block 11206686 exists and is
  time-consistent (an on-chain tx alone cannot substantiate the client-side KEK gate).
  Companion **PR #638 (MERGED 2026-07-06)** added 6 new Appium Android E2E specs
  (backup-restore, dApp security alerts, fee-analytics/net-worth, a KDF-performance
  measurement harness, a LOG-1 bridge-redaction regression canary, passkey clone-detection)
  plus hardening of 2 existing specs (send-scenarios, hidden-wallet) — 96 tests across 13
  suites total. BUILT test-coverage work, NOT a new device-verification or "verified"
  claim: no new on-chain txid. Honest gaps disclosed in #638 itself: WalletConnect
  live-pairing: supervised E2E spec added (PR #919, 2026-07-13, `e2e/walletconnect-live-pairing.spec.js`, 4 tests H7/H8/M11, gated `RUN_SUPERVISED_E2E=1`; 4 vacuous Appium stubs replaced with source-structure pins); **live relay gap CLOSED (PR #931, 2026-07-13)** — all 4 tests now pass against real `relay.walletconnect.com` (H8 happy path, H8 mismatch pre-modal, M11 disconnect, H7 chain-mismatch pre-modal; 27s, BUILT/INTERNAL, no on-chain txid); KDF perf measured on one flagship
  device only; the LOG-1 spec is a regression canary for the already-shipped redaction fix,
  not a new fix; the passkey clone-signCount proof stays web-only, the Android test only
  proves native doesn't fabricate a value. PR #638 also added a password-entry mode (≥12
  chars) to `PinPad.jsx`/`HardwareKekSettings.jsx` for web hardware-KEK enrollment; native
  stays numeric PIN. **PR #686 (MERGED 2026-07-06)** landed the F1.1/F2.1/F2.2/F2.3
  doc-and-comment sync — the corrections above were reconciled against #686's actual
  merged diff, not assumed; see the F2.1/F2.2 notes above for exactly what #686 did and
  did not touch.
- **Verify, don't assert.** An asset/feature is "verified" ONLY after a real on-chain
  testnet transaction confirms on a block explorer with a txid the user supplies. Passing
  tests, clean review, or a green suite are NOT verification. Never flip an asset `status`
  to `live` or write "verified" without a real explorer-confirmed txid.
- **Status tags.** Every control/feature is BUILT (in code, testnet/provisional), TARGET
  (designed, audit-gated, not confirmed in shipped code), PLANNED (roadmap), or
  HONEST-DISABLED (present but off on principle). Code-complete + tests green = BUILT at
  most, never "verified".
- **Audit gate (§24).** The **internal audit** is the hard gate: it reviews the
  architecture BEFORE any backend or seed-touching build, and is the pass that opens
  mainnet. (An independent audit is also performed for depth, but does not gate.) RASP,
  hardware KEK, device attestation, network hardening, and cloud recovery are
  TARGET/PLANNED — do not build them blind; they need real-device verification and the audit.
- **No fake security.** Never mock a security control to look real. If something can't be
  delivered honestly, honest-disable it (I4: fail honest, fail closed).

## Hardware KEK Phase 1/2 Rollout

**Phase 1 (Shipping):** Web wallet PIN protected by WebAuthn PRF
- Platform authenticator binds each unlock to device
- Offline-seizure gap closed (PIN exhaustion requires platform auth per-use)
- Supported: Chrome ≥99, Firefox ≥108; graceful fallback Safari (password-only, ≥12 chars)
- Status: ✅ Code-complete, unit-tested (1973/1973 passing), browser UAT pending testnet txids
- Native platform fence (2026-07-05): `web.js` secret-touching ops throw
  `WEB_KEYSTORE_WRONG_PLATFORM` (fail-closed) when `Capacitor.isNativePlatform()` is
  positively true — the WebAuthn PRF path is now provably, not incidentally, unreachable
  on native. Bundle analysis confirmed web.js ships in the native main chunk (static
  import; tree-shaking impossible), so this runtime fence is the only fence. BUILT,
  unit-tested (`web.native-fence.test.js` 26/26; keystore+wallet-core 730/730).

**Phase 2 (Q3 2026):** Native hardware KEK on iOS/Android
- iOS: Secure Enclave HMAC-SHA256 (ECIES) + biometric ACL. 🟡 BUILT, device-verified
  (PARTIAL) 2026-07-01 on iPhone 17 Pro Max: two real Sepolia sends confirmed on-chain
  from a KEK-enrolled vault (PR #495). 2026-07-01 INTERNAL audit: H-NEW-D CLOSED —
  `kSecAttrTokenIDSecureEnclave` confirmed present in `HardwareKekPlugin.m:78`; SE ECIES
  design correct at native ObjC layer. **2026-07-07 iOS KEK device session (Mac day):**
  iOS-F5 DEVICE-VERIFIED (INTERNAL, source+build, not heap dump) — `resetBytesInRange` on
  all paths confirmed, enroll/unlock cycle works on device (commit `f6e5fee73`); honest
  scope: base64 bridge residue architecturally unzeroable (LOW-MEDIUM). iOS-F3
  DEVICE-VERIFIED (INTERNAL) — zero deprecation warnings, Face ID prompt rendered on every
  unlock, two back-to-back unlocks both prompted (`reuseDuration=0` confirmed), negative
  check fail-closed. iOS-F9 CLOSED (prospective, INTERNAL) — full 3-line `[VEYRNOX-KEK]`
  SE-unlock trace captured via Console.app on Mac (`loaded ciphertext` → `SE key retrieved,
  decrypting` → `SUCCESS — Face ID passed, H recovered`), TIME-CORRELATED with KEK-gated
  Sepolia send txid `0x8b8f70e7…` block 11224674 (same Console session); cold-restart
  repeat confirmed; negative check (cancel Face ID) fail-closed. H-2/iOS-F11 (biometric
  factor not bound to enrollment set): Android half RESOLVED / device-verified (PR #516/#518,
  re-enroll invalidation PASSED on Pixel 10 Pro XL); iOS half RESOLVED / device-verified
  (2026-07-08, iPhone 8 Plus, iOS 16.7.16, Touch ID, unrestricted — no MDM): enrolled KEK
  vault + added new fingerprint → SE key invalidated → "Incorrect PIN" (fail-closed, I4) →
  no unlock, no silent bare fallback. Both halves now CLOSED. Outstanding (iOS): heap-dump
  verification (iOS-F5 residual, LOW-MEDIUM), independent audit. Note: C-1 CRITICAL
  (Android HMAC fixed input) also affects the overall KEK design context — see Android bullet.
- Android: AndroidKeyStore HMAC-SHA256 (StrongBox-preferred, TEE-accepted — StrongBox is
  not enforced, a TEE/software-backed key is accepted and honestly surfaced) + biometric-only
  gate (no credential fallback). ✅
  BUILT, end-to-end device-verified 2026-07-01 on a Pixel 10 Pro XL (Android 16/API 36):
  enroll → cold restart → StrongBox-gated unlock → badge stays "Hardware Protection ON".
  Three stacked bugs found and fixed to get here (PRs #497, #499): (1) badge measured
  key-presence, not vault-wrap — reconciled against `hasVaultKekWrap()`; (2)
  `@aparajita/capacitor-secure-storage@8.0.0` persisted via async `SharedPreferences.apply()`,
  losing writes on app-kill — patched to synchronous `.commit()` via patch-package
  (Android-only; iOS Keychain was unaffected); (3) every unlock silently re-wrapped the
  vault back to bare Argon2id via `createVault()` — fixed with a KEK-preserving
  `saveVaultContents()`. Tests: keystore 95/95, keystore+WalletProvider 116/116.
  Caveat: the `.commit()` fix is a patch-package patch — requires a clean plugin
  recompile (Gradle caches the AAR). 2026-07-01 INTERNAL audit additional findings:
  C-1 (CRITICAL) — HMAC input is a global fixed constant; all enrolled Android vaults
  derive the same H from the same HMAC input string; requires per-enrollment `kekSalt`
  binding (v2 protocol migration, protocol-breaking change, tracked separately).
  JS-layer fix code-complete in PR #529 (merged 2026-07-02 as commit 732f9676): `native.js`
  now generates `kekSalt` before calling `getHardwareFactor`, passes `{ kekSalt }` to it,
  and stamps `hardwareKekVersion: 2` on the vault blob; Kotlin plugin was already patched.
  4/4 C-1 contract tests + 172/172 keystore tests pass. Recorded 2026-07-02 as
  DEVICE-VERIFIED on Pixel 10 Pro XL (Android 16/API 36): v2 re-enroll → cold restart →
  StrongBox-gated unlock → KEK-gated Sepolia send, txid
  `0xeb71a5d31a8794682cf681d8ebb2916967c1097e951519dcf1b53327d2d8e580`, block 11187337,
  vault read confirmed `hardwareKekVersion:2`, `kekSaltLength:44`.
  **REGRESSED 2026-07-05:** an OODA investigation found this fix is cryptographically
  inert on device. Bug A (runtime-confirmed via logcat on the same Pixel 10 Pro XL:
  `getHardwareFactor` called with `{}` on a v2 vault) — the keystore facade
  `src/wallet-core/keystore/index.js:94-96 getHardwareFactor()` drops all arguments, so
  unlock never passes `kekSalt` through to the plugin. Bug B (static analysis, high
  confidence, device confirmation pending) — `src/wallet-core/keystore/hardware.js:195`
  passes `kekSalt` as a raw `Uint8Array`; the Capacitor Android bridge `JSON.stringify`s
  plugin options, so Kotlin's `call.getString("kekSalt")` reads `null` (indistinguishable
  from absent) and silently falls back to the fixed v1 `PRF_EVAL_SALT` — so enrollment
  also derived H from the fixed salt while stamping `hardwareKekVersion:2`. Net: the
  `0xeb71a5d…` txid proved the KEK-gated unlock FLOW end-to-end but did NOT prove
  per-enrollment salt binding (enroll and unlock silently matched on the same fixed
  salt); all enrolled Android vaults still derived H from the same global HMAC input —
  the original C-1 CRITICAL condition, at that point unresolved.
  **FIXED / device-verified 2026-07-05, later the same day (v3, PR #568):** facade
  argument forwarding closes Bug A; `hardware.js` base64-encodes `kekSalt` to a STRING
  before the bridge call, closing Bug B; the Kotlin plugin fails closed on a
  malformed/absent salt (no silent v1 fallback); the vault stamps `hardwareKekVersion:3`
  for genuinely salt-bound wraps; previously (falsely) v2-stamped vaults are upgraded to a
  genuine v3 wrap on the next PIN/password change (`changePassword`) — NOT lazily on unlock.
  (The unlock-hot-path lazy v2→v3 migration was REMOVED 2026-07-06, PR #662, because it
  fired a second biometric prompt — a triple biometric sheet on unlock — and a failed
  migration write could re-prompt forever without converging. Consequence: a never-repinned
  v2 vault retains the C-1 fixed-salt weakness until its next PIN change; see the
  Feature-Status.md §4 C-1 residual "installed-base v2 upgrade reach". LAND-READY honest
  review + 250/250 keystore tests; BUILT / unit-tested only, NOT device-verified.)
  11 migration unit tests added. On-device (Pixel 10 Pro XL,
  Android 16, `com.veyrnox.app.debug`, device-local times): 07:19:35 fresh v3 enrollment
  (`"enroll: key stored — tier=STRONGBOX (securityLevel=2)"`); 07:19:37 `getHardwareFactor`
  bridge call carried `kekSalt` as an intact 44-char base64 STRING (previously `{}`),
  logging `"salt-source: v2-bound"`; cold restart (07:37:46) + unlock (07:40:00-03)
  repeated the same result with the SAME stored salt — closing the Android unlock-path
  app-trace evidence gap (the Android analogue of iOS-F9); KEK-gated Sepolia send from
  this vault, txid `0xecd68494e888af742e5166c93c5354536fb6bbe62e93dc795847079d981727e3`,
  block 11206686, status SUCCESS, independently re-confirmed via RPC receipt. Status:
  **C-1 FIXED / device-verified (v3 fresh-enroll path, end-to-end incl. on-chain txid,
  2026-07-05)**, INTERNAL — not independently audited. Still outstanding, explicitly:
  (1) salt-tamper negative test not performed (encrypted SecureStorage makes a
  non-invasive tamper infeasible on this device — the `"salt-source: v2-bound"` branch
  attestation is the operative evidence of salt binding); (2) v2→v3 lazy migration path
  NOT device-exercised (fresh enroll only on the test device; migration remains
  unit-tested only, 11 tests); (3) per-enrollment salt distinctness on device unit-proven
  only, one enrollment observed; (4) independent audit. **New finding LOG-1 (2026-07-05,
  HIGH for debug/CI context):** Capacitor's debug bridge logger echoes every native
  plugin result to logcat in DEBUG builds — captured on-device: the hardware KEK factor H
  in cleartext base64 and the full encrypted vault blob. Debug builds only; production
  default is silent but unverified for our release build config. Risk: `adb` access to a
  debug build extracts H; Appium CI logcat artifacts may also capture it. Remediation
  tracked separately (spawned as its own task), not part of PR #568. Also from this
  session: the P3 "Biometric unlock" enrollment flow was device-exercised 2026-07-05
  07:19:16 (honest "Enroll biometric unlock" `BiometricAuth` prompt observed in device
  logs) — the originally reported bug ("WebAuthn native plugins not working") is FIXED /
  device-exercised for enrollment; the "passkey" WebAuthn path on native remains
  honest-disabled by design.
  H-1 — StrongBox tier not surfaced to user; TEE/software fallback silent (UI update needed).
  FIXED in PR #527 (merged 2026-07-02): `tierBadge.js` pure helper maps
  `securityLevelName` → badge label/variant; `HardwareKekSettings.jsx` reads real tier
  from `getVaultKekTier()` and renders the correct badge (StrongBox Protected / TEE
  Protected / Hardware Protection ON / WebAuthn Protected); `native.js` `enrollKek` stores
  `hardwareKekTier` in vault blob and exposes `getVaultKekTier()` accessor.
  H-2/iOS-F11 (Android half) — RESOLVED / device-verified: `setInvalidatedByBiometricEnrollment(true)`
  confirmed working on Pixel 10 Pro XL (PR #516/#518, 2026-07-01) — re-enroll fingerprint →
  `KeyPermanentlyInvalidatedException` → fail-closed → PIN recovery. (iOS half deferred/device-blocked
  — see iOS bullet.) M-3 fixed (PR #522): `detectTamper()` now fail-closed
  (`getOrElse { true }`). H-4 fixed (PR #522): zero-vector H check in `hardware.js`.
  Outstanding (Android): the four C-1 residual items listed in the narrative above
  (salt-tamper negative test, v2→v3 migration device-exercise, on-device multi-enroll salt
  distinctness, independent audit) plus LOG-1 (remediation BUILT PR #572). DONE: H-1 tier
  surfacing (PR #527) and the Android biometric re-enrollment invalidation test (PR #516/#518).
  See `docs/hardware-kek-phase-plan.md`, `docs/Feature-Status.md` §4, and
  `docs/audit-2026-07-01-kek-internal.md` for full evidence.
- Summary: both platforms are BUILT + device-verified on the KEK-gated unlock FLOW,
  INTERNAL only, NOT independently audited. **Android** is end-to-end, including the C-1
  v3 salt-binding fix (see the Android bullet above for the full RESOLVED→REGRESSED→FIXED
  cycle and its four residual items). **iOS** is device-verified **FULL** (2026-07-08,
  upgraded from PARTIAL 2026-07-07): it has a LITERAL SE-unlock app-trace (iOS-F9 CLOSED,
  prospective — full 3-line `[VEYRNOX-KEK]` sequence captured via Console.app on Mac,
  time-correlated with KEK-gated Sepolia send txid `0x8b8f70e7…` block 11224674), plus
  the prior KEK-gated Sepolia txids (PR #495) and OS-daemon-corroborated send
  (`0x5116e7bc…`, block 11185985, 2026-07-02). iOS-F5 and iOS-F3 are now device-verified
  (INTERNAL). **iOS is now device-verified FULL** (2026-07-08): H-2/iOS-F11 CLOSED on
  iPhone 8 Plus (iOS 16.7.16, Touch ID) — re-enrolled fingerprint → SE key invalidated →
  fail-closed ("Incorrect PIN"), no unlock, no silent fallback (I4). P1 (F9 trace +
  correlated txid, 2026-07-07) AND P4 (H-2 biometric re-enrollment, 2026-07-08) both
  passed — the runbook condition for FULL is met. Independent audit remains. All KEK txids (iOS
  and Android v3) are recorded as non-promoting META evidence: they prove the unlock gate
  but do NOT flip any asset/feature to catalogue-`verified` (that bar is the strict
  per-asset explorer-txid rule and does not apply to an unlock-gate feature). LOG-1
  (debug-build logcat leaks H + vault blob) remains open; remediation BUILT PR #572.

## 2026-07-05 re-applied orphaned fixes (PRs #613–#616)

Six stale remote branches (never merged) carried fixes that never reached `main`. On
2026-07-05 each was re-validated against current main, re-applied via strict TDD (RED
confirmed, then GREEN), honest-reviewed (LAND-READY), CI-verified (full suite), and
squash-merged; the six source branches were then deleted from origin. All four items
below are **BUILT / unit-tested only — NOT device-verified, NOT independently audited,
no on-chain txid involved.**

- **PR #613 (5a6aab70)** — duress-aware biometric PIN-cache guard + honest vault-desync
  screen. `shouldAutoCacheTypedPin()` (`src/lib/authModel.js`) auto-caches the typed PIN
  behind biometric ONLY when biometric is ON + nothing cached + no duress vault exists;
  once a duress PIN exists, Face ID opens the decoy only. Duress-presence-unknown fails
  closed (no cache). `WalletEntry` now writes the PIN cache only after a successful
  unlock. The native stale-vault cold-mount path no longer silently `clearVault()`s (a
  prior I4 violation) — it now shows an explicit Restore-from-seed / typed-"WIPE" screen.
  **Face-ID-to-decoy duress-presence guard: device-verified 2026-07-06** on a Pixel 10
  Pro XL — the first real-hardware exercise of this guard, surfaced live: this exact
  device's build predated PR #613's merge (`5a6aab70`, `2026-07-06T00:12:57+01:00`), so
  pushing latest `main` to the device pulled the guard on for the first time and it
  immediately tripped on a leftover decoy vault from earlier testing (correctly — not a
  bug). Verified with on-device evidence, not a UI message alone: (1) with the decoy
  present, `adb shell run-as com.veyrnox.app.debug cat shared_prefs/
  WSSecureStorageSharedPreferences.xml` showed no `veyrnox_bio_unlock_secret` key despite
  repeated correct real-PIN unlocks, and a live Chrome DevTools Protocol query against the
  app's IndexedDB (`veyrnox-vault` → `vault` store → key `secondary`) returned a present,
  non-null decoy entry; (2) after removing the duress PIN in-app (Settings → Duress →
  Remove duress PIN) and one real-PIN unlock, `veyrnox_bio_unlock_secret` reappeared in
  SecureStorage and the same CDP query confirmed the decoy entry was now `undefined` — a
  genuine before/after device trace. The vault-desync screen I4 gap was CLOSED by PR #920
  (2026-07-13): `doDesyncWipe()` now calls `setLocalWiped(true)` after `clearVault()` —
  users are no longer silently dropped onto onboarding; `e2e/vault-desync-screen.spec.js`
  4/4. BUILT / unit-tested + e2e. NOT device-verified on real native hardware, INTERNAL.
- **PR #614 (c2012713)** — hides `CryptoNewsFeed`/Calculator refetch() header buttons
  in decoy/hidden sessions (react-query v5 `refetch()` bypasses `enabled`; was a live I3
  egress vector).
- **PR #615 (956234c1)** — `WalletPortfolioPage.jsx` count-string leak ("N wallets not
  backed up" — a wallet-cardinality tell) replaced with count-blind "Wallet backup
  incomplete."; `copySecret.js` gained a third clipboard-wipe trigger on the app-lock
  event; new CI gate `scripts/check-deniability-strings.mjs` (`check:deniability-strings`)
  flags count/plural/raw-seed-clipboard patterns going forward.
- **PR #616 (60b47846, 2926cdbd)** — `src/lib/cryptoCompare.js` routes native fetches
  through `CapacitorHttp` to bypass Android CORS (web unchanged); also removes the
  owner-requested "open tax report" voice command. CORS premise not device-verified.

See `docs/Feature-Status.md` §6, §8b, and §11 for the per-item BUILT entries with PR numbers.

## 2026-07-06 web PIN-lockout regression-and-fix + automated e2e verification pass

**Web onboarding PIN-lockout: regression (PR #637) → fix (PR #645) → full unification
(PR #651, commit `d04562c88`).** PR #637 ("unify to native 8-digit PIN") migrated the web
UNLOCK screen to a numeric-only `PinPad` but left vault CREATION on the old ≥12-char
free-text password `Input` — a half-finished migration. Net effect: a returning web
password-cohort user who set a real alphanumeric ≥12-char password (H-A minimum) was
shown a numeric keypad on reload that could never accept their real credential — a full
lockout, with the only escape being "Restore from seed phrase" (a full re-import). Repro:
"Get Started → set password → Import an existing seed → reload." **PR #645** (commit
`b3b87c8f4`) fixed the immediate lockout by branching `WalletEntry.jsx`'s `view ===
"unlock"` fallback on `authModel === "password"` (rendering the real password `Input`,
mirroring the native branch) instead of `Capacitor.isNativePlatform()`; added a unit
regression test and tightened `e2e/onboarding.spec.js`'s reload assertion (previously it
only asserted SOME PIN-labelled group rendered, never that unlock actually worked — the
exact gap that let the bug regress silently). **PR #651** went further and closed the
whole bug class instead of maintaining two divergent cohorts: web now shares native's
single PIN cohort end-to-end (create, confirm, unlock, recover) — there is no separate
web "password" cohort left to diverge from unlock again, consistent with web being a
testing-only surface, never production (native is the real product). Regression coverage:
`src/components/__tests__/WalletEntry.web-authmodel.test.jsx`, rewritten
`e2e/onboarding.spec.js`. **Known residual (verified 2026-07-13):**
a legacy `authModel==='password'` code path still exists for pre-PR-#651 users (the
"Forgot password? Restore from seed phrase" recovery link at `WalletEntry.jsx:1204`,
reachable only from a pre-existing password-cohort vault). The unlock surface is correct
— `WalletEntry.jsx:1156` renders a free-text `<input type="password">` for
`authModel === "password"`, not a numeric PinPad (that fix landed in PR #645 and is
present in current code). Fresh-install users cannot reach this path: no `setView("generate")`
call exists anywhere, and all new-user flows write `setAuthModel('pin')`. The path is
live for legacy users and works correctly; it is unreachable for any new user post-#651.
One design gap: legacy users who recover via this path skip `provisionDeniabilityChaff()`
— duress/stealth/panic are not provisioned in onboarding (by design, noted in
`WalletEntry.jsx:31–38`; advanced security is set up in-app later).

**PR #644 (commit `dc63c8ec9`)** — app icon restored to the hexagon + teal V brand logo
(cosmetic), plus four new automated Playwright e2e specs under `e2e/`, each closing an
app-layer (non-hardware) verification gap: `duress-decoy-routing.spec.js` (real
password → real wallet, Emergency PIN → a different decoy wallet, wrong password →
explicit error), `i3-deniability-egress.spec.js` (decoy session makes zero requests to
gated third-party hosts — proves "decoy = 0" but not the full "real > 0" contrast, since
the harness must run under demo mode), `rasp-automation-detection.spec.js` (Playwright's
own `navigator.webdriver` flag genuinely trips RASP's browser-level HOOKED→BLOCK path,
unconditionally, regardless of acknowledgement), and `passkey-clone-replay.spec.js` (CDP
dual virtual-authenticator clone/replay proves M-K's cloned-authenticator rejection with
real crypto — a software clone, not a physical hardware authenticator). Also added:
`scripts/ios-sim-duress-faceid.sh`, a partially-scripted iOS Simulator harness for
app-layer duress routing only — it explicitly cannot and does not close iOS-F9,
H-2/iOS-F11, iOS-F5, or iOS-F3 (the Simulator has no Secure Enclave). None of the four
specs or the script touch or close any Secure Enclave/StrongBox hardware-KEK item; none
involve an on-chain txid. See `docs/Feature-Status.md` §8c for the full per-spec detail.

**PR #646** gated `e2e/webauthn-prf-sepolia-verified.spec.js` (hardcodes the funds-less
public Hardhat/Ganache test mnemonic, so it could never complete a real send) behind
`RUN_SUPERVISED_E2E=1` in `playwright.config.ts` — CI-hygiene only, no status change.
**PR #650** added two regression tests pinning that `evaluateTwoFactor()`
(`src/lib/twoFactorGate.js`) is genuinely session-blind — no `isDecoy`/`isHidden`
parameter exists or should ever be added — pure test-coverage addition for an
already-correct invariant.

## 2026-07-07 automated verification sweep (PRs #699–#705)

Eight amber widget items flipped to green via automated Playwright e2e and CI checks — all INTERNAL, not independently audited, no on-chain txid involved except where noted.

**PRs #699–#701, #702 — new e2e specs and automated checks:**
- **LOG-1 redaction patch** — `scripts/check-log-redaction-patch.mjs` PASSED: both Android + iOS `native-bridge.js` carry all 3 redaction markers. Debug-build logcat leak closed at source (PR #572); release-build logcat silence remains device-spot-check only.
- **Web WebAuthn PRF KEK browser UAT** — `e2e/webauthn-prf-kek.spec.js` 13/13 Playwright (CDP virtual authenticator; fail-closed matrix C–F + UI unlock path + C-UI settings card enrollment). Real Sepolia txids from a real platform authenticator remain PENDING.
- **Duress PIN / decoy routing** — `e2e/duress-decoy-routing.spec.js` 1/1: real password → real wallet, Emergency PIN → separate decoy wallet, real address never exposed. App-layer only.
- **I3 deniability egress** — `e2e/i3-deniability-egress.spec.js` 1/1: decoy session made zero requests to all gated third-party hosts. Honest caveat: real-vs-decoy contrast inconclusive under demo mode.
- **RASP browser-level detection** — `e2e/rasp-automation-detection.spec.js` 1/1: `navigator.webdriver=true` trips HOOKED→BLOCK unconditionally; `presignGate` fail-closed; BLOCK not overridable.
- **Composite pre-sign RISK verdict + gate** — `e2e/presign-risk-verdict.spec.js` 3/3 (module boundary): poison address → RISK (S4 fires, real sentence); safe address → INFO; `presignGate` gate mechanics confirmed. Module boundary required because RASP TIER.BLOCK (always fires in Playwright) outranks tx RISK in the compose lattice.
- **RevenueCat entitlement fail-closed** — `e2e/revenuecat-entitlement-failclosed.spec.js` 5/5: `web→free`, `getCustomerInfo null on web`, I3 deniability guard, active entitlement→`safety_plus`, paid/free route gate. Device purchase still NOT device-verified.

**PR #703 — HardwareKekSettings PIN unification bug fix + C-UI test:**
After PR #651 unified web onto the 8-digit PIN cohort, `HardwareKekSettings.jsx` enrollment and removal PinPads still used `length=12 / numericOnly=false` — a web user with an 8-digit vault PIN could never enroll hardware KEK through the settings card. **Fixed:** both PinPads now use `length={8} / numericOnly` (web is testing infrastructure only). Instruction text updated. `e2e/webauthn-prf-kek.spec.js` C-UI test promoted from `test.fixme` → `test` (13/13 total).

**PR #704 — docs update** (`docs/Feature-Status.md`, `e2e/webauthn-prf-kek.spec.js` header): 13/13 count, C-UI completion, HardwareKekSettings follow-up regression documented.

**PR #705 — iOS F3/F5 compile-verification CI** (`.github/workflows/ios-compile-check.yml`, `macos-latest/Xcode 26.5`):
- **iOS-F3** (`kSecUseOperationPrompt → LAContext`): zero deprecation warnings in xcodebuild — compile-verified.
- **iOS-F5** (`NSMutableData` zeroing): `HardwareKekPlugin.o` built clean — compile-verified.
Both were code-complete since PR #526 but had never been compiled on a Mac. CI now runs on every push to `ios/**`. Runtime device checks (biometric prompt rendering, heap dump) remain device-gated per `docs/runbook-ios-kek-session.md` P2/P3.

**Remaining hardware-gated items (updated 2026-07-07):** ~~iOS-F9~~ CLOSED (2026-07-07, prospective, time-correlated with txid). ~~iOS-F5~~ device-verified (2026-07-07, source+build, not heap dump). ~~iOS-F3~~ device-verified (2026-07-07). Still open: ~~H-2/iOS-F11 iOS biometric re-enrollment~~ ✅ CLOSED 2026-07-08 on iPhone 8 Plus (iOS 16.7.16, Touch ID): re-enrolled fingerprint → SE key invalidated → "Incorrect PIN" (fail-closed, I4) → no unlock, no silent fallback. **iOS headline: device-verified FULL** (P1 + P4 both passed). Android C-1 residual ~~T1~~ ✅ CLOSED (PR #719 real-crypto integration test); ~~T2~~ salt-tamper ✅ CLOSED 2026-07-07, ~~T3~~ salt distinctness ✅ CLOSED 2026-07-07, LOG-1 redaction device-verified 2026-07-07 debug + ~~release~~ CLOSED 2026-07-07. ~~RASP F-09~~ ✅ DEVICE-VERIFIED (FULL, INTERNAL) 2026-07-12 — Samsung Galaxy Note 20 5G SM-N981B, Magisk v30.7; `checkIntegrity()` full verdict captured (all signals false, Magisk Hide operating at probe level — expected); pre-sign TIER.ALLOW → CAUTION → send; Ethereum mainnet txid `0x4556e2e68087d0b75b35504247ed09f011d42614f11b31c5d1423694799da515`, block 25,511,567 (0x1854a8f), SUCCESS. PRs #832 + #834 fixes (CAUTION flow + riskReady gate) also landed this session. See Feature-Status.md F-09 row. ~~iOS RASP F-09 palera1n (2026-07-13 BUILT-UNVALIDATED)~~ ✅ DEVICE-VERIFIED (INTERNAL, 2026-07-14) on iPhone 8 Plus (iPhone10,5, iOS 16.7.16, palera1n rootful): Security Dashboard RED; RASP Security page RED "hooked" — `checkDynamicLibraries()` caught a Substrate/ElleKit dylib injected by the palera1n bootstrap; maps to TIER.BLOCK (more severe than ROOTED/TIER.WARN; signing refused). PR #953 (RaspSecurity.jsx now calls `nativeProbeSource()` on native, was previously hardwired to `browserProbeSource` → always "clean") was also required to surface the verdict. Honest gap: individual check contributions (checkJailbreakPathsCstat, checkFork) unconfirmed — syslog unavailable this session; evidence is UI state only. ~~G3 Frida Gadget hostile-device injection~~ ✅ DEVICE-VERIFIED (INTERNAL, 2026-07-14) on Android SM-N981B (Frida 17.15.4, real GLib runtime threads) AND iPhone 8 Plus (iOS 16.7.16, palera1n rootful, stub FridaGadget.dylib) — see §2026-07-13/14 G3 Frida Gadget below. Independent security audit still outstanding.

## 2026-07-07/08 INTERNAL KEK stack audit — PRs #723, #735, #743

Code-and-artifact audit of `kek.js` / `native.js` / `web.js` / `hardware.js`. Findings:
0 CRITICAL / 3 HIGH / 9 MEDIUM / 6 LOW. All 3 HIGH and 6 of 9 MEDIUM resolved; all
6 LOW resolved. BUILT / unit-tested, INTERNAL — not device-verified, not independently
audited. No on-chain txid.

- **PR #723** (3 HIGH): `native.js enrollKek` orphaned-credential cleanup + `saltBytes`
  zero on error (H-1); `web.js unlock()`/`unenrollKek()` `H` zeroed in `finally` on
  `deriveKekC` throw (H-2); `kek.js decodeKekSalt` 32-byte length guard added, throws
  `KEK_ERR.MALFORMED_VAULT` on wrong-length input (H-3).
- **PR #735** (6 MEDIUM resolved): `web.js enrollKek` `saltBytes` zeroed in `finally`
  (M-1); M2c `downgradeFromHardwareWrap`/`unlock()` peek use `parseVaultBlob` not raw
  `JSON.parse` (M-2); `clearVault` wraps `clearHardwareCredential()` in best-effort
  try/catch (M-4); stale password-minimum comment updated to PR #651 8-digit PIN (M-7);
  `web.js changePassword` enforces minimum on `newPassword` (M-8);
  `downgradeFromHardwareWrap` wrapped in `withLockSuppressed` (M-9).
- **PR #743** (6 LOW): `importKekAesKey` throws `DEGENERATE_INPUT` on bad-length kek
  (L-1); `combineKek` length-check errors carry `.code` (L-2);
  `docs/device-verification-2026-07-05.md` correction banner prepended (L-3); `native.js`
  file header updated (L-4); stale lazy-upgrade test comment corrected (L-5);
  `bufferToB64u`/`b64uToBuffer` extracted to `web-base64url.js` + 17 unit tests (L-6).

**Resolved (PR #821, 2026-07-11):**
- ~~M-3 (#726): M2c up-migration swallows `VAULT_WRITE_VERIFY_FAILED`.~~ **FIXED (PR #821):** `logM2cMigrationFailure` exported from `native.js` — migration remains non-fatal (unlock returns the secret) but failures are now logged (`code`/`message` only, no key material — LOG-1 safe). Unit-tested (`native.m2c-migration-log.test.js`). BUILT / INTERNAL.
- ~~M-5 (#728): `VeyrnoxEnclavePlugin` auto-registered with no internal gate.~~ **FIXED (PR #821):** `src/plugins/veyrnoxEnclave.js` `M2C_ENABLED = false` flag; all key-touching exports throw `M2C_DISABLED` while disabled (fail-closed, I4); `deleteWrappingKey` ungated (cleanup must not be blocked). Unit-tested (`veyrnoxEnclave.m2c-gate.test.js`). BUILT / INTERNAL.

**Still open (1 MEDIUM — design decision required before `M2C_HARDWARE_WRAP_ENABLED = true`):**
- M-6 (#729): iOS-F5 `NSString hB64` bridge copy of H — architectural limitation (accept
  or bridge-level redaction).

INTERNAL pass — not independent, not a substitute for the outstanding independent
third-party audit (still required). See `docs/Feature-Status.md` §"2026-07-07/08 INTERNAL
KEK stack audit" for full per-finding detail.

## 2026-07-08 INTERNAL S1–S4 + crypto audit — PR #757

Code-and-artifact audit across five domains: S1 (seed generation, HD derivation, signing —
`mnemonic.js`, `derivation.js`, `multiVault.js`, EVM/BTC/SOL chain code), S2 (send flow —
`SendCrypto.jsx`, `sendGate.js`, `twoFactorGate.js`, per-chain send modules), S3
(deniability — `deniabilitySession.js`, `duress.js`, `stealth.js`, `panic.js`,
`hiddenBalance.js`, `decoyBalance.js`), S4 (RASP + WalletConnect — `rasp/`,
`WalletConnectProvider.jsx`, `presign.js`, `compose.js`), Crypto (vault cryptography —
`vault.js`, `vaultStore.js`, `vaultBackup.js`, `argon2.worker.js`). Findings:
0 CRITICAL / 1 HIGH / 10 MEDIUM / 5 LOW. INTERNAL code-and-artifact only — not
device-verified, not independently audited. No on-chain txid.

**Fixed in PR #757 (merged 2026-07-08) — BUILT / unit-tested, INTERNAL:**
- H-1: WC `personal_sign` null-`evmAddress` H8 bypass — `_handlePersonalSign` now rejects
  with `PERSONAL_SIGN_ADDRESS_MISMATCH` when `evmAddress` is null/falsy; insecure else-branch
  removed (fail-closed, I4).
- M-3: Scientific notation passes UI amount form boundary — `isFormAmountWellFormed()` strict
  regex check added; replaces `parseFloat` at the Continue gate.
- M-6: `resolveHiddenBalance` missing I3 deniability guard — `isDeniabilitySessionActive()`
  guard added, mirroring `decoyBalance.js:75`.
- M-7: `veyrnox-live-prices` survives panic wipe — key added to `DENIABILITY_RESIDUE_KEYS`
  in `panic.js`.
- L-4: Stale `argon2.worker.js` comment — updated to reflect 192 MiB and dynamic
  `opts.memorySize`.

**Key PASS properties confirmed:** `crypto.getRandomValues` only (no `Math.random` in
wallet-core); EVM/BTC/SOL/Cosmos derivation paths correct, all spec vectors passing;
SLIP-0010 hardened-only enforced for ed25519; I1 signing isolation (no network call inside
any signing function); I3 deniability stack (all egress points gated — prices, news, RPC,
SDK; M-6 closed the last gap); decoy/real seed separation; wallet-count tells removed
(D1/D2/D3); panic wipe completeness (with M-7 fixed; residue GAP-1/2/3/4 CLOSED PR #918, 2026-07-13 — `veyrnox-passkey-signcount`, `veyrnox-decoy-biometric`, `RESIDUE_KEY_PREFIXES` wildcard sweep, 9 metadata tells; 23/23 tests, INTERNAL); stealth pool chaff (256-slot,
all users, FIXED_LEN uniform); WalletConnect controls (C3 RASP gate, H7 EIP-712 chain
binding, M9 gas cap, M11 session expiry, H-NEW-B step-up re-auth) all PASS; RASP BLOCK
tier unconditional (browser probe); AES-256-GCM IV fresh per encryption, no nonce reuse,
auth-tag failure generic; Argon2id params consistent, blob-stored for migration.

**Resolved (PRs #806 and #821, 2026-07-11):**
- ~~M-2 (`hw-send.js` zero test coverage; issue #747)~~ **BUILT (PR #821):** stub-based unit tests for EVM/BTC/SOL `hw-send.js` added (`src/wallet-core/{evm,btc,sol}/__tests__/hw-send.test.js`). Software-signer mock covers signature reconstruction and `HW_SIGNER_MISMATCH` fail-closed guard. Honest scope: stub-level only — physical Ledger/Trezor device still required for the catalogue "verified" bar. INTERNAL.
- ~~M-5 (`planSolTransfer` accepts non-bigint `amountLamports`; issue #750)~~ **BUILT (PR #806):** `typeof amountLamports !== 'bigint'` guard added in `src/wallet-core/sol/send.js:115` — throws on non-bigint input. Unit-tested. INTERNAL.

**Still open (owner-decision or architectural gate required):**
- ~~M-1~~ ACCEPTED RESIDUAL (2026-07-17, issue #746): EVM private key as JS string — architecturally unzeroable; ethers v6 `HDNodeWallet` holds the private key as a string internally and provides no zeroing API. No fix available without replacing ethers v6 entirely. Accepted alongside the existing S1-S4 audit scope; revisit trigger: ethers v7 or a replacement signer library that exposes a zeroing path.
- M-4 (2FA retry dead end after network failure — UX, not a security bypass; issue #749)
- ~~M-8~~ BUILT (PR #1076, 2026-07-17): `encryptVault`/`encryptVaultWithDek` now produce v:2 blobs with `additionalData: vaultAad(blob)` binding `{v,kdf,salt}` into the GCM auth-tag; `decryptVault`/`decryptVaultWithDek` gate AAD on v≥2 (v:1 backward-compat preserved); `BIN_VERSION` bumped to 2 (per-seal `blobV` byte); 14 new unit tests. BUILT / unit-tested, INTERNAL.
- M-9 (short-PIN exhaustion time not disclosed; Safari users have no hardware factor —
  owner decision on disclosure wording; issue #754; docs disclosure BUILT #753)
- ~~M-10~~ BUILT (2026-07-12): Cosmos non-hardened index level — correct BIP-44, matches Keplr/Cosmostation; xpub-risk disclosure added as source comment in `cosmos/derivation.js:40–46`; Veyrnox does not export the account xpub so risk is theoretical; flagged for any future xpub-export feature
- ~~L-1~~ BUILT (PR #1080, 2026-07-17): `deriveEvmAddress()` added to `derivation.js` — derives private only to the hardened account boundary (`m/44'/60'/0'`), converts to a public-only `HDKey` via `publicExtendedKey`, then derives the non-hardened tail (`m/0/index`) in public mode; the leaf EVM signing key never materialises as a JS value. Four `WalletProvider.jsx` address-only callers (`deriveAllAddresses`, `deriveAccounts`, `setDuressPin`, `peekHiddenWallet`) rewired. Codex two-pass PASS (third pass clean). Architectural honest scope: BIP-32 hardened derivation to `m/44'/60'/0'` unavoidably materialises the account-level intermediate private key; it is zeroed immediately after xpub extraction — the LEAF signing key is the audit goal. BUILT / unit-tested, INTERNAL — not device-verified, no on-chain txid.
- ~~L-2~~ BUILT (`WalletProvider.jsx:1133–1148`): `setActionPassword` decoy/hidden re-auth guard added; wrong credential throws and mutates nothing (fail-closed, I4)
- ~~L-3~~ BUILT (`src/lib/useSend2faMethod.js`): reactive hook re-reads on `storage` / `SEND_2FA_CHANGED_EVENT` / `PASSKEY_REGISTRATION_EVENT` — mid-session 2FA pref changes propagate live to mounted Send screen
- ~~L-5~~ BUILT (2026-07-12): iCloud IndexedDB sync disclosure added to `evm/vaultStore.js`; vault is AES-256-GCM ciphertext so possession alone does not break the cipher

INTERNAL pass — not independent. The independent third-party audit (S1–S4 + crypto,
including the vault cipher path) remains outstanding. See `docs/Feature-Status.md`
§"2026-07-08 INTERNAL S1–S4 + crypto audit — PR #757" for the full per-finding table.

## 2026-07-11 Codex security review — PR #783

Claude Code first-pass + independent Codex second-pass review across the Send page,
WalletConnect, vault/keystore, deniability stack, and chain providers. All 10 findings
fixed; all fixes use strict TDD (RED confirmed before each GREEN). BUILT / unit-tested,
INTERNAL — not device-verified, not independently audited, no on-chain txid.

**H-1 (HIGH — FIXED, PR #783):** I3 violation — Send page fired live RPC reads in
deniability sessions. `liveBalance`, `txSim`, `btcSim` `useQuery` enabled clauses now
gate on `!isDeniabilitySessionActive()`. Belt-and-suspenders: `getBalanceEth`,
`simulateEvmTransaction`, `getUtxos` throw at the provider level. Tests:
`SendCrypto.deniability.test.jsx` (6 tests, 3 behavioural + 3 structural).

**M-1 (MEDIUM — FIXED, PR #783):** Vacuous RevenueCat e2e I3 guard.
`setDeniabilitySession({type:'decoy'})` left flag false (object ≠ `=== true`); test
passed vacuously. Fixed to `setDeniabilitySession(true)` + explicit `flagActive`
pre-assertion.

**M-2 (MEDIUM — FIXED, PR #783):** SOL + BTC history providers unguarded (I3).
`getBalanceSol`, `getAddressHistory`, `getAddressTxs` had no deniability guard — a
tx-history view reachable in a decoy session would leak a real address to a third-party
host. Guards added matching EVM pattern. Tests: `sol-btc-provider-i3.test.js` (3 tests).

**L-1 (LOW — FIXED, PR #783):** WC `eth_sendTransaction` chain not validated against
approved session. `handleSendTransaction` now calls `resolveSessionCaip2()`, rejecting
unapproved chains with `SESSION_CHAINID_INVALID` — mirrors typed-data path.

**L-2 (LOW — FIXED, PR #783):** WC `maxPriorityFeePerGas` uncapped. New
`resolveMaxPriorityFeePerGas()` helper clamps tip to `min(parsed, resolvedMaxFee)`.
Prevents invalid EIP-1559 tx when dApp sends priority > maxFee.

**L-3 (LOW — FIXED, PR #783):** `hiddenBalance` returned `null` on I3 violation;
`decoyBalance` threw. Unified to throw — caller (`StealthWallets.jsx`) wraps in
try/catch, fail-closed maintained.

**L-4 (LOW — FIXED, PR #783):** Raw `JSON.parse` on dormant M2c enclave path in
`keystore/native.js`. Changed to `parseVaultBlob()` — `MALFORMED_VAULT` fail-closed
guard consistent with every other blob-read path.

**L-5 (LOW — FIXED, PR #783):** `deriveKekC` did not zero encoded password bytes.
Hoisted to local `pw`, zeroed in `finally` — mirrors `deriveKey()` pattern.

**L-6 (LOW — FIXED, PR #783):** Structural deniability test partially vacuous. Regex
OR allowed `!isDeniabilitySessionActive()` to be satisfied by pre-existing
`!isDecoy && !isHidden`. Tightened to require `!isDeniabilitySessionActive()`
specifically.

**L-7 (LOW — FIXED, PR #783):** Trezor EVM path: `maxPriorityFeePerGas` uncapped.
Same class as L-2 — Trezor branch in `SendCrypto.jsx` now applies
`resolveMaxPriorityFeePerGas(priority, cappedMaxFeePerGas)`.

Three merge-time fixes also landed (main drift from PRs #784–#790): `/asset/:symbol`
added to `featureClassification.js` (PR #784/788 drift); `SendCrypto.jsx` conflict
resolved keeping both `simEnabled` (PR #790) and `!isDeniabilitySessionActive()`;
`WalletPortfolioPage.jsx` `fetchAssetHistory` return-type unwrap (TS2339 fix). All in
PR #783 squash commit `028c8b37`.

## 2026-07-11 RASP pre-sign gate — fail-closed on native (C-01, PR #825)

**C-01 (CRITICAL, internal-audit-2026-07-11) — FIXED (PR #825). BUILT / unit-tested,
INTERNAL — NOT device-verified, NOT independently audited, no on-chain txid.**

The Send pre-sign gate previously used `resolveProbeSource(nativeProbe, browserProbeSource)`,
which fell back to the browser leg whenever the native leg did not run (available !== true /
null / threw). On a real native Capacitor WebView the browser leg is always `available:true`
and always `CLEAN`, so a rooted/jailbroken device whose OS probe was absent, threw, or had
not yet been sampled would pass `detect() → TIER.ALLOW` with zero friction — fail-OPEN.

**Fix:** `src/rasp/selectPresignProbeSource.js` (pure, no egress, no wallet-set handle —
I3). On native (`isNative === true`), trusts the OS leg ONLY when `nativeSource.available
=== true`; absent/null/false/threw → `UNAVAILABLE_PROBE_SOURCE` → `detect() →
INTEGRITY_UNAVAILABLE → degrade() → WARN` — NEVER the browser leg's CLEAN. On web,
browser leg unchanged. `SendCrypto.jsx` imports and calls
`selectPresignProbeSource(Capacitor.isNativePlatform(), nativeProbe, browserProbeSource)`.
Unit-tested (`src/rasp/__tests__/selectPresignProbeSource.test.js`;
`src/pages/__tests__/SendCrypto.raspNativeProbe.test.jsx`). See
`docs/Feature-Status.md` §7 for the RASP pre-sign gate entry.

## 2026-07-12 RASP F-09 device session — FULL device-verification (PRs #832, #834)

**F-09 DEVICE-VERIFIED (FULL, INTERNAL).** Device: Samsung Galaxy Note 20 5G SM-N981B, Magisk v30.7, Android debug build. This session closes the PARTIAL gap from 2026-07-11 by capturing the full `checkIntegrity()` verdict on the Send screen and confirming the pre-sign gate → on-chain send.

**Session trace:**
- 23:40:01 — `RaspIntegrityPlugin.checkIntegrity()` called via Capacitor bridge.
- Verdict: `{"rooted":false,"hookedProcess":false,"emulator":false,"tampered":false}`.
  - `rooted:false` — Magisk Hide is operating at the OS-probe level. Expected and honest, not a code flaw.
  - `tampered:false` — achieved by injecting debug keystore SHA-256 via `-PRELEASE_CERT_SHA256` Gradle property. Production builds must set this property or `tampered` will be `true`.
- Pre-sign gate: `TIER.ALLOW` (all signals false) → send proceeded after CAUTION acknowledgement (sim disabled, `riskReady` gate fixed by PR #834 earlier this session).
- On-chain: Ethereum mainnet txid `0x4556e2e68087d0b75b35504247ed09f011d42614f11b31c5d1423694799da515`, block 25,511,567 (0x1854a8f), status SUCCESS, 0.001 ETH.

**Bugs found and fixed this session:**
- **PR #832:** CAUTION verdict was not prompting user acknowledgement — `requiresConfirmation=true` added; RASP WARN banner now renders an acknowledge checkbox before send proceeds.
- **PR #834:** `riskReady` was `false` when `simEnabled=false`, causing a permanent send block on native (sim is always disabled on native). Fixed: `riskReady=true` when `simEnabled=false`.

**Honest gaps preserved:**
- `rooted:false` on a Magisk device is correct at the probe level (Magisk Hide). A Frida-hooked device test was NOT performed. iOS device test NOT performed (Mac required).
- The `tampered` check relies on `RELEASE_CERT_SHA256` being set in the production Gradle build — if unset, production builds will fail `tampered` on every launch. This is a production-configuration dependency, not a code flaw.
- INTERNAL evidence only — not independently audited. Independent security audit remains outstanding.
- **2026-07-13 Android RASP improvements (PR #949) — DEVICE-VERIFIED (INTERNAL, 2026-07-14):** Three new Magisk-Hide-bypass detection vectors added to `RaspIntegrityPlugin.kt` — `checkProcNetUnix()` (scans `/proc/net/unix` for Magisk/KSU IPC socket names; kernel-level, not masked by mount-namespace Hide, analogous to iOS `checkJailbreakPathsCstat`), `checkSuFromRuntime()` (`which su` via `Runtime.getRuntime().exec()`; behavioral test, analogous to iOS `checkFork`), and `checkDangerousProps()` (`ro.boot.verifiedbootstate`/`ro.boot.flash.locked` via `android.os.SystemProperties` reflection — original `Runtime.exec("getprop ...")` was SELinux-denied for `untrusted_app` on Android 10+ and returned empty; replaced with in-process reflection in commit `f46abecba`). Extended path lists cover KernelSU (`/data/adb/ksud`, `/proc/ksud`), Apatch (`/data/adb/apatch`), LSPosed (`/data/adb/lspd`), and newer Magisk artifacts (`/data/adb/magisk_db`, `/dev/.magisk.unblock`, `/data/adb/modules`). `checkXposed` extended with LSPosed Manager (`org.lsposed.manager`) and KernelFlasher (`me.weishu.kernelflasher`). `checkProcMapsForHook` extended with `zygisk` and `lspd` markers. **Device-verified 2026-07-14 at 00:20:12 on SM-N981B (Samsung Galaxy Note 20 5G, Magisk v30.7, Android debug build):** verdict `{"rooted":true,"hookedProcess":false,"emulator":false,"tampered":true}` — `rooted:true` fired via `checkDangerousProps` (`ro.boot.verifiedbootstate=orange`, unlocked bootloader); `tampered:true` expected (debug build, `RELEASE_CERT_SHA256` not set, fail-closed I4). `checkProcNetUnix` did NOT fire (Magisk v30.7 uses different socket names than the markers). `checkSuFromRuntime` did NOT fire (Magisk Hide covers `su` in PATH for this app). INTERNAL — not independently audited.

## 2026-07-13 iOS RASP — palera1n false negative + detection updates

**F-09 iOS: NOT device-verified. FALSE NEGATIVE found 2026-07-13.** Device: iPhone 8 Plus (A11, iOS 16.7.16, palera1n rootful jailbreak). `RaspIntegrityPlugin.checkIntegrity()` returned `{"rooted":false,"hookedProcess":false,"emulator":false,"tampered":false}` — palera1n was NOT detected. The Android F-09 verification (2026-07-12, Samsung Galaxy Note 20 5G) stands independently; iOS is a separate, still-open gap.

**Root cause — three structural misses in the original iOS checks:**
1. **Path checks** — palera1n does not install Cydia/Sileo by default; the app sandbox (enforced at kernel level even on palera1n rootful) prevents `NSFileManager fileExistsAtPath:` from seeing jailbreak artifacts like `/bin/bash`.
2. **Sandbox escape** — kernel-enforced even on palera1n rootful; write to `/private` still denied.
3. **Dyld image scan** — palera1n does not inject Substrate/Frida into the Veyrnox process.

**Detection updates applied to `RaspIntegrityPlugin.m` (same session):**
- Extended path list with palera1n-specific paths: `/var/jb/`, `/private/preboot/.installed_palera1n`, `/Library/dpkg`, `/usr/sbin/sshd`, `/var/lib/dpkg`.
- `checkJailbreakPathsCstat` — uses C `stat()` syscall directly; bypasses `NSFileManager`'s sandbox filter and can see `/bin/bash` etc. on palera1n rootful.
- `checkFork` — `fork()` succeeds on palera1n (Apple sandbox blocks it on non-jailbroken devices); most reliable check for palera1n rootful.
- `detectJailbreak` updated to call all four methods (original two + two new).

**Status (2026-07-13): BUILT-UNVALIDATED.** Code compiled. NOT yet re-tested on a palera1n device — a new build, deploy, and re-run was required.

**Status update 2026-07-14: DEVICE-VERIFIED (INTERNAL).** PRs #947 + #953 rebuilt and deployed to iPhone 8 Plus (iPhone10,5, iOS 16.7.16, palera1n rootful jailbreak). Result: Security Dashboard shows RED high-risk alert; RASP Security page shows RED "hooked" condition — palera1n IS now detected. Firing condition: `hooked` (maps to TIER.BLOCK — signing refused), NOT merely `rooted` (TIER.WARN) — `checkDynamicLibraries()` caught a Substrate/ElleKit dylib injected by the palera1n bootstrap into the Veyrnox process. Note: the original root-cause item 3 above ("palera1n does not inject Substrate/Frida into the Veyrnox process") was incorrect for the rootful bootstrap with ElleKit — the dyld image scan DID catch the injected library. **PR #953 was additionally required** to surface the verdict in the UI: `RaspSecurity.jsx` previously always used `browserProbeSource` (always "clean" in a native WebView) rather than `nativeProbeSource()` on native platforms — the native plugin fired correctly but the RASP Security page was reading the wrong probe source. **Honest gaps:** (1) which specific detection vector(s) among `checkJailbreakPathsCstat`, `checkFork`, and the extended path list contributed alongside `checkDynamicLibraries` is confirmed via UI state only — syslog was unavailable this session, so individual check outputs are unlogged; (2) ~~G3 Frida Gadget hostile-device injection~~ ✅ DEVICE-VERIFIED (INTERNAL, 2026-07-14) on Android SM-N981B AND iPhone 8 Plus (iOS 16.7.16, palera1n rootful) — see §2026-07-13/14 G3 Frida Gadget; (3) INTERNAL — not independently audited.

**Side findings from this session (both BUILT / INTERNAL, no production code change):**

- **Keychain `whenPasscodeSetThisDeviceOnly` fails on palera1n (`errSecNotAvailable` -25291): ✅ DEVICE-VERIFIED (INTERNAL, 2026-07-14)** on iPhone 8 Plus (iPhone10,5, iOS 16.7.16, palera1n rootful). Bridge log from this session captured `SecureStorage internalSetItem` → `{"errorMessage":"An OS error occurred (-25291)","message":"An OS error occurred (-25291)","code":"osError"}` firing on the very first Keychain write during startup, before wallet creation completes. `BiometricAuthNative checkBiometry` simultaneously returned `{"deviceIsSecure":false,...}` — confirming `securityd` is patched and does not report the device as secure. Net: on palera1n, wallet creation itself is blocked at the Keychain layer (OS error -25291); Hardware KEK enrollment is unreachable because the vault cannot even be persisted. This is independent from and additive to the RASP TIER.BLOCK layer. **Contrast with Android (Magisk):** StrongBox operates below the OS layer and is unaffected by Magisk — Hardware KEK works on a rooted Android device (RASP detects `rooted:true` and gates sends at TIER.WARN/CAUTION, but the hardware key material is still accessible and cryptographically bound). **iOS: jailbroken = no hardware protection** (two independent mechanisms: RASP TIER.BLOCK + Keychain OS-level failure). **Android: jailbroken = hardware protection intact** (StrongBox below OS; RASP gates sends but key material survives). Fixed in the prior test build by changing ACL to `whenUnlockedThisDeviceOnly` — **test-build-only workaround** — production builds must retain `whenPasscodeSetThisDeviceOnly` (stronger ACL; failure only manifests on jailbroken devices where `securityd` is patched). Not production-patched; documented here for honesty. INTERNAL — not independently audited.

- **Argon2id 192 MiB OOM on A11 hardware (iPhone 8 Plus):** 3× 192 MiB Argon2id runs out of memory or times out in WKWebView on an A11 device with 3 GB RAM. The 192 MiB KDF cost was originally measured only on a Pixel 10 Pro XL (flagship Android, 12 GB RAM); iOS and older hardware are unmeasured. Workaround for the test session: KDF reduced to 1 MiB locally. **Open device compatibility gap** — 192 MiB is too aggressive for A11-class (and likely other older) devices. The test-build KDF reduction was reverted by linter and is NOT in production code. No code change proposed; flagged for owner decision on older-device support policy. INTERNAL, not independently audited.

## 2026-07-13/14 G3 Frida Gadget detection + Android Magisk Hide bypass — PRs #948, #949

**G3 — Frida Gadget detection (PR #948, 2026-07-13). ✅ DEVICE-VERIFIED (INTERNAL, 2026-07-14).**

Frida Gadget embeds as a renamed shared library rather than running a server — port 27042 and a simple `"frida"` `/proc/self/maps` scan miss it. Three new signals added to `detectHook()` in `RaspIntegrityPlugin.kt`:

1. **`checkGadgetThreads()`** — scans `/proc/self/task/*/comm` for `gum-js-loop`, `gmain`, `gdbus`, `pool-frida`. Frida's GLib runtime spawns these thread names regardless of the `.so` filename.
2. **`checkFridaPipes()`** — scans `/proc/self/fd/*` symlinks; Frida creates named pipes/sockets whose resolved paths contain `"frida"`.
3. **Expanded `checkProcMapsForHook()` markers** — adds `frida-agent`, `frida-gadget`, `linjector` alongside existing markers.

Each check is independently exception-guarded (fail-open on `SecurityException`/permission denial). 13 new structural pin tests (`src/rasp/__tests__/g3-frida-gadget.test.js`); 29/29 total G3 tests. **Device-verified 2026-07-14 on SM-N981B (Samsung Galaxy Note 20 5G, Magisk v30.7, Android debug build, Frida 17.15.4):** Frida Gadget 17.15.4 (`libfrida-gadget.so`) loaded into the Veyrnox process via `System.loadLibrary` in a verification-only debug build; gadget configured in listen mode (port 27042); Frida client connected via `adb forward tcp:27042` — full GLib runtime threads spawned: `/proc/28707/task/*/comm` confirmed `gum-js-loop`, `gmain`, `gdbus`, `frida-gadget` visible to the OS-level thread scan. `checkIntegrity()` verdict: `{"rooted":true,"hookedProcess":true,"emulator":false,"tampered":true}` — `hookedProcess` flipped from `false` (clean baseline) to `true` (Frida injected), proving `checkGadgetThreads()` fired. Operative signal: thread-comm scan (`gum-js-loop` / `gmain` / `gdbus`); `pool-frida` thread not spawned by Frida 17.15.4 (may be version-specific). Verification build reverted after session: `System.loadLibrary` block and `jniLibs/arm64-v8a/libfrida-gadget*` removed; clean APK reinstalled. **INTERNAL — not independently audited.**

**G3 — iOS Frida Gadget detection. ✅ DEVICE-VERIFIED (INTERNAL, 2026-07-14).**

Device: iPhone 8 Plus (iPhone10,5, iOS 16.7.16, palera1n rootful jailbreak, UDID `daec9dfcabcae6fa7bc9e6fdca503bed584ea896`). Safari Web Inspector (Capacitor bridge log) captured at app startup ~04:51:35 UTC+1:

```
[Log] native RaspIntegrity.checkIntegrity (#72976823)
[Log] result RaspIntegrity.checkIntegrity (#72976823)
[Log] "{\"tampered\":false,\"hookedProcess\":true,\"emulator\":false,\"jailbroken\":true}"
```

`hookedProcess:true` — `checkDynamicLibraries()` in `RaspIntegrityPlugin.m` detected `FridaGadget.dylib` via `_dyld_get_image_name()`. The check lowercases both the image name and each marker string: "FridaGadget" → "fridagadget" → `containsString:@"frida"` → YES. App navigated to `/rasp-security` (TIER.BLOCK, signing refused).

**Stub dylib — not real Frida.** Real Frida Gadget 17.15.4 (37 MB universal dylib) crashed the process with `SIGKILL - CODESIGNING Invalid Page` — its GLib JIT initializer (`sys_icache_invalidate`) requires the `com.apple.security.cs.allow-jit` entitlement, which the debug provisioning profile does not grant. A minimal arm64 stub (`FridaGadget.dylib`, 48 K, `NSLog` constructor only, no JIT) was compiled, signed with `Apple Development: Al Jobson (7V994446UL)`, and injected into the App bundle via `insert_dylib --strip-codesig --inplace`. amfid validated the signed stub from bundle; the dylib loaded cleanly. `checkDynamicLibraries()` only scans `_dyld_get_image_name()` — it checks the name, not the dylib's behavior, so the stub is a valid proof of the detection path.

**Operative signal:** `checkDynamicLibraries()` only. `checkFridaPort()` returned false — the stub starts no Frida server on port 27042.

**Honest gaps:** (1) stub, not real Frida — real Frida 17.15.4 crashes with SIGKILL-CODESIGNING due to missing JIT entitlement; (2) `checkFridaPort()` false — no server process; (3) `tampered:false` because the test build retained the debug provisioning profile and the iOS `detectTamper()` path does not do cert-pin comparison (Android equiv does — iOS gap tracked for independent audit); (4) INTERNAL — not independently audited.

**Android Magisk Hide bypass vectors (PR #949, merged 2026-07-14). DEVICE-VERIFIED (INTERNAL, 2026-07-14) on SM-N981B (Samsung Galaxy Note 20 5G, Magisk v30.7).**

Three detection vectors that Magisk Hide cannot mask:

1. **`checkProcNetUnix()`** — kernel `/proc/net/unix` socket scan for Magisk/KSU IPC socket names (`@magisk_`, `magiskd`, `@ksu_`, `zygisk`, `@lspd`, `apatchd`). Magisk Hide operates at the mount-namespace level and cannot hide kernel-level IPC sockets.
2. **`checkSuFromRuntime()`** — `which su` via `Runtime.exec`; fails closed on SELinux denial (returns false, not exception).
3. **`checkDangerousProps()`** — reads `ro.boot.verifiedbootstate` / `ro.boot.flash.locked` via `android.os.SystemProperties` reflection. NOTE: `Runtime.exec("getprop ...")` is SELinux-denied for `untrusted_app` on Android 10+ — device-verified 2026-07-14 on SM-N981B: `verifiedbootstate=orange` and `flash.locked=0` were present but `Runtime.exec` produced no output. Fix: in-process `SystemProperties.get()` via reflection (no exec, no SELinux denial).

**Device-verified 2026-07-14 on SM-N981B (Magisk v30.7, Android debug build):** verdict `{"rooted":true,"hookedProcess":false,"emulator":false,"tampered":true}` — `rooted:true` fired via `checkDangerousProps` (`verifiedbootstate=orange`, unlocked bootloader). `checkProcNetUnix` did NOT fire (Magisk v30.7 uses different socket names than the current marker list). `checkSuFromRuntime` did NOT fire (Magisk Hide covers `su` in PATH for this app). `tampered:true` expected (debug build, `RELEASE_CERT_SHA256` not set, fail-closed I4). Extended path lists cover KernelSU, Apatch, LSPosed, newer Magisk artifacts. `checkXposed` + `checkProcMapsForHook` extended with LSPosed/Zygisk markers. ~~Frida Gadget hostile-device test~~ ✅ DEVICE-VERIFIED (INTERNAL, 2026-07-14) on Android — see §2026-07-13/14 G3 Frida Gadget. ~~iOS G3~~ ✅ DEVICE-VERIFIED (INTERNAL, 2026-07-14) on iPhone 8 Plus — see iOS subsection in §2026-07-13/14 G3 Frida Gadget. **INTERNAL — not independently audited.**

## 2026-07-13/14 RASP native-gate parity — PRs #954, #955

Internal AI code-and-artifact review found two fail-open RASP gaps analogous to the
already-fixed Send-path C-01 (PR #825). Both FIXED same session. BUILT / unit-tested
only, INTERNAL — NOT device-verified, no on-chain txid.

**PR #954 (H-1, fixes #950) — merged `184e81bb`.** WalletConnect's pre-sign gate
(`WalletConnectProvider.presignGateOrReject()`) used only `browserProbeSource`, so on a
real native Capacitor WebView a rooted/hooked/emulated/Play-Integrity-failed device
signed WC requests with zero RASP friction — the same fail-open class C-01 closed for
the Send screen but never carried over to WalletConnect. **Fix:** the WC gate now
composes `selectPresignProbeSource(isNative, nativeSource, browserProbeSource)` +
`attestationProbeSource` via `composeConditions` with fail-closed timeouts
(`withFailClosedTimeout(1500ms)`); on native, the OS leg is authoritative and the
browser CLEAN leg is never trusted; any shape drift or exception → `TIER.BLOCK` (I4).
4 new tests, 1011/1011 targeted suite green.

**PR #955 (H-2, fixes #951) — merged `11fb990d`.** Play Integrity ES256 JWS signatures
were never actually verified. PR #943 added "ES256" → "SHA256withECDSA" alg dispatch but
missed that JWS ES256 signatures are raw R‖S (RFC 7518 §3.4, 64 bytes) while Java's
`Signature("SHA256withECDSA").verify()` requires DER-encoded `ECDSA-Sig-Value` (RFC
3279) — every real ES256 token silently returned `false` → `unavailable()` →
`INTEGRITY_UNAVAILABLE` → WARN, never a genuine PASS/FAIL. The prior 20/20 structural
pins were source-string greps that never executed a verification. **Fix:** new
`rawEcdsaSignatureToDer()` + `derEncodeInteger()` in `PlayIntegrityPlugin.kt` applied on
the ES256 branch; a 64-byte length guard fails closed (I4); RS256 path unchanged.
Coverage: a JS mirror (`src/rasp/__tests__/helpers/rawToDerEcdsa.js`) with 10 executable
Vitest cases against real Node EC P-256 keypairs (roundtrip through Node's DER
verifier), covering high-bit-set r/s, leading-zero stripping, all-zero, and
length-mismatch edge cases; the Kotlin binding itself is still only source-string-pinned
(follow-up **#957**, below). Also corrected stale doc comments in `src/rasp/attestation.js`
and `src/plugins/attestation.js` that had claimed the JWS was "NOT signature-verified
on-device" — it now is, at least on the JS-mirrored algorithm.

Neither fix is device-verified against a real rooted/hooked device or a real Play
Integrity token; both are gate-wiring/crypto-correctness fixes proven by code + unit
test only.

**Open follow-up filed tonight — #957:** add a Kotlin JVM test harness for
`PlayIntegrityPlugin.verifyJwsSignature`. The ES256 raw→DER transcoder is proven
algorithmically via the JS mirror + 10 Vitest cases, but the actual Kotlin binding is
currently pinned only by a source-string grep, not executed. A Gradle JUnit source set +
`./gradlew test` CI step would close that gap.

## 2026-07-14 SEND H-1 Trezor hw-send consolidation + I3 hotfix — PRs #963, #978

**PR #963 (SEND H-1, fixes #961) — merged `7ccaab4`.** Trezor EVM send now routes
through the already-audited `hw-send.js` helpers instead of a parallel inline
implementation. Prior state: `SendCrypto.jsx:960-1010` had reimplemented the Trezor EVM
flow directly against low-level `trezorSignEvmTx`, silently bypassing three controls
that already existed in the audited path (`signAndBroadcastEvmTrezor` was a dead
export): (a) the M-2/#746 `serializeCheckedSignedTx` recovery check
(`HW_SIGNER_MISMATCH` — catches a malicious/buggy Trezor signing a tx that recovers to a
different sender), (b) `'pending'`-tag nonce fetch + a `0 ≤ n ≤ 1,000,000` sanity window,
and (c) `applyEstimatedGasLimit` (the inline path hardcoded 21000/65000, which L2
rollups reject and which reverts on USDT transfers). **Fix:** extracted a
`buildUnsignedEvmTxCore({to,value,data})` primitive from `buildUnsignedEvmTx` plus a
native wrapper; added `signAndBroadcastEvmTrezorToken` for ERC-20; both now share one
`trezorSignFieldsAndBroadcast` helper gated by the single M-2 recovery check.
`SendCrypto.jsx` rewired to call the shared helpers; the inline duplicate deleted.
F-08-TREZOR / L-2 fee clamp stays put (pinned by an existing source-scan test). 8 new
tests, 2271/2271 targeted suite green. `signAndBroadcastEvmLedger` remained a dead
export at merge time — tracked in **#962** below. BUILT / unit-tested only, INTERNAL —
not device-verified against real Trezor hardware.

**PR #978 (SEND H-1 I3 hotfix, fixes #972) — merged `6d2077c7`.** A Codex second-pass
review of #963 found a P1 I3 regression: moving the Trezor flow into `hw-send.js`
dropped the old `hw/trezor.js:69 checkDeniability()` gate, which had previously covered
all three hardware-wallet chains (EVM/BTC/SOL). Under a decoy/hidden/demo session with a
Trezor connected, the new consolidated helpers would hit both the RPC and the physical
device with no I3 check — a real egress and coercion-exfil vector, since the Trezor
holds the REAL hardware seed regardless of which app session is active. Closed across
four Codex review rounds, five commits:
- Round 1 (`f7aa2e1`): `assertNotDeniabilitySession()` added to
  `signAndBroadcastEvmTrezor` / `signAndBroadcastEvmTrezorToken` /
  `signAndBroadcastEvmLedger`; `applyEstimatedGasLimit` now throws `GAS_ESTIMATE_FAILED`
  fail-closed instead of leaving an override `undefined` (which crashed downstream on
  `toHex(undefined)`).
- Round 2 (`e5b31e7`): the caller (`SendCrypto.jsx`) was firing `provider.getFeeData()`
  *before* ever reaching the hw-send helper — added an earlier Trezor gate at the top of
  `sendTx.mutationFn`'s family dispatch, plus a preflight docstring fix.
- Round 3 (`c018ea0`): the round-1/2 gate checked only the session marker, not the
  persisted `veyrnox-demo` flag — added the localStorage check to
  `assertNotDeniabilitySession` (matching the old `deniabilityActive()` verbatim);
  `DEMO` added to the mutationFn gate; `FeeSelector` render skipped under
  `useTrezorMode && (isDeniability || DEMO)`.
- Round 4 (`61f0c81`): `DEMO` from `@/api/demoClient` is a load-time IIFE snapshot — a
  `veyrnox-demo=1` flag flipped after import wouldn't propagate. Extracted a shared LIVE
  helper `isDeniabilityOrDemoActive()` in `wallet-core/deniabilitySession.js` (reads both
  signals fresh on every call, fail-closed on either read exception) and wired it into
  all three gate sites.
- Round 4b (`7903403`): kept the `DEMO` check additive to the live helper — `DEMO` also
  covers `VITE_DEMO_MODE=1` and native-dev, neither of which sets localStorage.

5 new tests (3 I3 gate pins + preflight coverage + 1 I4 belt-and-braces spy on the
helper). Full evm suite 155/155 green. Codex is a second-model review pass, not the
outstanding independent third-party audit. BUILT / unit-tested only, INTERNAL — not
device-verified against real Trezor hardware.

**Open follow-ups filed tonight:**
- **#962** — SEND / Scanner audit cleanup, M-1..M-4 + L-1..L-3: M-1 outflow-fraction
  `Number` precision loss; M-2 `Uint8Array` key zeroization for BTC/SOL
  `withPrivateKey` variants; M-3 signal-registry tie-ordering docstring; M-4 `eth_call`
  dry-run RPC-trust posture; L-1 preflight timeout comment drift; L-2
  `signAndBroadcastEvmLedger` dead export; L-3 S8 median even-length BigInt truncation.
- **#977** — `FeeSelector`'s react-query refetches every 30s with no reactive dependency
  on the live deniability/demo flag; if the flag flips mid-session in the same window,
  an already-mounted `FeeSelector` keeps firing RPCs even though the render conditional
  would have prevented mount in the first place. Preexisting attack surface, not
  introduced by #972/#978. Fix approach: gate the `queryFn` itself on the live helper,
  not just the mount condition.

## 2026-07-12 LiveBalances / deniability (I3) audit — PR #858

INTERNAL audit of live-balance read paths for I3 (zero-egress) compliance. Codex second
pass FAILED both attempts (transient network/websocket outage, no report produced); HIGH
findings were instead independently re-verified by direct code inspection — still a
single-signal INTERNAL pass, NOT the outstanding independent third-party audit.

**H1 (HIGH) — FIXED (PR #858).** `sol/provider.js` `getBalanceLamports` had no
`isDeniabilitySessionActive()` guard; `sol/send.js`/`sol/hw-send.js` called it directly,
so a hidden/stealth SOL send fired live RPC during a deniability session. Fixed at the
primitive (choke-point) so all callers fail closed; zero-egress test added.

**H2 (HIGH) — FIXED (PR #858).** `/live-balances` rendered the raw `"I3: no egress in
deniability session"` guard string verbatim — a plain-English deniability tell. Fixed
via `sanitizeBalanceError()` rewrapping to a generic RPC-failure message.

**Open (not fixed in PR #858):** ~~L1 (LOW)~~ ✅ CLOSED (PR #921, 2026-07-13) —
`computePortfolio`/`usePortfolio` now has an explicit `isDeniabilitySessionActive()` guard;
ERC-20 `balanceOf()` I3 bypass also fixed (see PR #921 below). M1 (LOW) —
`hiddenBalance.js:151` throws a raw string, not `new Error(...)`. Also flagged, not
closed: no device/runtime trace yet proves `WalletProvider.unlock()` never leaks a real
address into a decoy/hidden render.

**PR #921 (2026-07-13) — I3 ERC-20 egress gaps CLOSED:** GAP-1 (HIGH) ERC-20
`Contract.balanceOf()` in `portfolioBalances.js` bypassed `isDeniabilitySessionActive()`
guard — fixed fail-closed; GAP-2 `computePortfolio` now has its own explicit I3 guard
(closes L1); GAP-3 `TransactionHistory`/`FeeAnalytics`/`useAnalytics` `enabled` gates
updated; GAP-4 `e2e/i3-deniability-egress.spec.js` re-enabled + host list expanded.
21 new unit tests + e2e re-enabled. BUILT / unit-tested, INTERNAL — NOT device-verified,
NOT independently audited, no on-chain txid.

BUILT / unit-tested, INTERNAL — not device-verified, no on-chain txid. See
`docs/qa/findings/livebalances-audit-2026-07-12.md` and `docs/Feature-Status.md`.

## 2026-07-15 RASP audit-fix cycle — PRs #1009, #1010, #1012, #1013, #1014

An internal multi-tool RASP audit ran 2026-07-14/15: three parallel reviewers (Claude
honest-reviewer, Claude security-reviewer, GPT-5 Codex second-model pass) fed off a
shared recon map, ranked findings P1/P2/P3, and adversarially cross-checked each other's
list. **INTERNAL — explicitly NOT the outstanding independent third-party audit.** All
five PRs below are BUILT / unit-tested only — NOT device-verified, no on-chain txid.

**PR #1009 (P1-1, fixes the codex-only finding) — merged `02f3b277`.** Play Integrity
verdicts were never nonce-bound at parse time — a replayed or substituted verdict blob
could pass. New pure-JVM `PlayIntegrityNonceVerifier` (extracted for testability) runs
after JWS signature verification and before verdict extraction, comparing the request
nonce with `MessageDigest.isEqual` (constant-time). 12 executable JVM tests, plus a
follow-up Gradle dependency fix (`org.json` as `testImplementation`). This was the only
P1 that neither Claude reviewer flagged — caught by the Codex second-model pass alone,
illustrating the value of the three-reviewer spread.

**PR #1010 (P1-2 + P2-3 + P2-6) — merged `1a919711`.** Three JS-layer fail-closed fixes
in one batch:
- `sensitiveGate.js` previously returned `{blocked:false}` on a null artifact (fail-OPEN
  on a missing probe); now fails CLOSED — `{blocked:true, sentence:"We couldn't confirm
  this device's integrity just now — this action is turned off."}`. An impact check
  confirmed all 5 production consumers call `useRaspArtifact()`, none of which ever
  passed null, so this closes a latent gap rather than fixing a live regression.
- `attestation.js`'s I3 deniability guard now calls `isDeniabilityOrDemoActive()` (the
  LIVE helper added by PR #978) instead of the session-marker-only check — covers BOTH
  the session marker AND the persisted `veyrnox-demo=1` flag, matching
  `hw/trezor.js:deniabilityActive()` verbatim.
- Shape validation added at three sites — `detect()`, the `nativeProbe.js` adapter, and
  `detectAttestation()` — so a partial/mistyped verdict (missing or wrong-typed fields)
  now fails closed to `INTEGRITY_UNAVAILABLE` instead of silently passing through.
  Defense-in-depth against a compromised bridge — the same architectural residual class
  P1-1 (above) sits in.
- 21 new tests; 7 existing test files updated to full-shape verdicts.

**PR #1012 (P2-1 + P2-4 + P2-7) — merged `422ddddc`.** SendCrypto RASP refactor:
- New standalone `getFreshRaspArtifact()` — awaits fresh probes under a 1500ms
  fail-closed timeout, composes + degrades, and returns `tier: TIER.BLOCK` on timeout or
  throw. Mirrors WalletConnect's `presignGateOrReject` architecture (PR #954).
- `SendCrypto.jsx`'s `sendTx.mutationFn` now `await`s `getFreshRaspArtifact()` at sign
  time instead of using a RASP tier that could be up to 60s stale.
- New `{ deferAttestation }` option on `useRaspArtifact` — SendCrypto passes
  `{ deferAttestation: step !== 'verify' }` so the attestation network round-trip fires
  only on explicit sign intent, not on Send page mount.
- `useRaspArtifact` now invalidates BOTH `nativeProbe` and `attestationResult` on the G4-A
  foreground event and the G4-B 60s heartbeat — attestation was previously once-per-mount
  only (a freshness gap).
- SendCrypto's inline probe-sampling duplicate deleted (140 lines). Zero behaviour change
  for the 8 other `useRaspArtifact` consumers (default `deferAttestation=false`).
- 20 new tests + 9 delegation-pin updates; full targeted suite 2512/2512 green.

**PR #1013 (P2-5 + P2-8) — merged `855f26e8`.** iOS App Attest honesty rescoping + RASP
dashboard freshness:
- `AppAttestPlugin.m`'s header and subsequent-runs comment now honestly state that a
  successful `generateAssertion` proves ONLY "this app install still holds its
  SE-enrolled key" — NOT "device integrity confirmed." The SE responds even on a
  jailbroken device; genuine integrity confirmation requires server-side verification,
  which would conflict with I5. The compose lattice already handled this correctly
  (jailbreak surfaces as TAMPERED/HOOKED and outranks any CLEAN from AppAttest) — this
  fix is a documentation-honesty correction, not a compose-logic change.
- `RaspSecurity.jsx` (the RASP Security dashboard page) replaced its inline
  `useState`/`useEffect` sampling with `useRaspArtifact()` — the dashboard now re-probes
  OS + attestation on the same G4-A/G4-B cadence as the Send gate (post-PR #1012), and
  correctly composes the attestation axis instead of rendering only the OS-probe result.
- `useRaspArtifact`'s return value extended with `condition` (additive superset — no
  change for existing consumers).
- Follow-up shape fix (`8421240`) added `condition` to the `BYPASS_RASP` early return so
  TypeScript's union inference resolves correctly.

**PR #1014 (P2-9 + P2-10 + five P3 items) — merged `8ff8fd18`.** Hardening + cleanup:
- P2-9: `useRaspArtifact`'s bypass early-return moved BELOW the `useState`/`useEffect`
  calls — fixes a rules-of-hooks violation (hooks are now called unconditionally;
  harmless no-op on web).
- P2-10: new CI script `scripts/check-cert-pin-manager-safety.mjs`, wired into the
  `package.json` `pretest` chain and the `verify` job in `.github/workflows/ci.yml` —
  fails CI if `CertPinManager` is referenced from an active OkHttp construction path
  while `PINNED_HOSTS` still contains a `PLACEHOLDER_` value. Guards against a future
  "wire it blind" regression.
- P3-1: deleted the dead C-01-superseded helper `src/rasp/resolveProbeSource.js` and its
  export from `src/rasp/index.js`, plus the legacy tests that pinned it.
- P3-2: corrected doc-lag in `useRaspArtifact.js` and `index.js` — JWS RS256/ES256 IS
  now on-device-code-verified (PRs #943 RS256, #955 ES256 raw→DER, #1009 nonce binding);
  the tracked residual is G2-ROOTCERT-PIN (the weak issuer-string heuristic), not JWS
  verification itself.
- P3-3: rewrote the `RaspIntegrityPlugin.m` header to reflect the 2026-07-13/14 palera1n
  and Frida device sessions, preserving the still-honest gaps (syslog-unavailable
  ambiguity, `tampered:false` parity gap vs. Android).
- P3-4: added an OEM false-positive note to `checkDangerousProps` —
  `ro.boot.secureboot=="0"` can fire on older MediaTek / non-Google ROMs even when not
  rooted.
- P3-5: refreshed the `useRaspArtifact` consumer-list docstring.

**Bonus, same day, not part of this audit-fix cycle — PR #1011 (`a383942`):**
`fix(deniability): gate FeeSelector queryFn on live I3 check` — closes follow-up issue
#977 (filed by the 2026-07-14 SEND H-1 session, see above). Adjacent, not part of the
RASP audit cycle proper.

**P2-2 — accepted as documented residual (not fixed).** WalletConnect signing timing
side-channel: a real session awaits attestation (up to a 1500ms round trip), a decoy
session skips it — an observable UI-latency delta a physically-present in-room coercer
could detect across multiple sessions. **Decision: accepted as a documented residual**,
consistent with the codebase's existing I4 honest-scope discipline for limitations that
would only be closeable by an architectural change that conflicts with another
invariant — padding the real path introduces its own observable-code-path side channel
and degrades UX for real users. Sits alongside G2-ROOTCERT-PIN, the iOS App Attest
entitlement gap, the iOS `detectTamper` cert-fingerprint parity gap, and the Android
`checkProcNetUnix` SELinux-inertness gap on the "documented open residuals" shelf (see
`docs/Feature-Status.md` § Open / residual items). **Revisit trigger:** if the codebase
ever adds server-side attestation verification (which would introduce timing consistency
by construction), or a future audit surfaces a scenario where this side channel is
exploited in the wild.

All five PRs: BUILT / unit-tested only, INTERNAL — not device-verified, no on-chain
txid. Codex is a second-model reviewer, tier-equivalent to an internal AI review pass,
not the outstanding independent third-party audit.

## 2026-07-16 Safety Plus IAP — annual $49.99/yr package added (PR #1026)

Added a second Safety Plus purchase option alongside the existing $5.99/mo monthly:
**annual $49.99/yr (~30% off equivalent 12 × monthly; ~$4.17/mo effective, "4 months free")**.
Both packages grant the **same** `safety_plus` entitlement — annual is a pricing lever,
not a feature axis. **BUILT / unit-tested only, INTERNAL — NOT device-verified, no
sandbox purchase, not independently audited.** No on-chain txid involved (IAP is
storefront-verified, not on-chain).

**Code (all in PR #1026, squashed to `3c1acd53`):**
- `src/lib/purchases.js` — new exports `SAFETY_PLUS_MONTHLY_PACKAGE` (`$rc_monthly`) and
  `SAFETY_PLUS_ANNUAL_PACKAGE` (`$rc_annual`). Package identifiers centralized so the
  drift guard (preflight) has a single source of truth.
- `src/pages/Subscription.jsx` — fetches BOTH packages from `getOfferings().availablePackages`;
  renders a Monthly/Annual segmented `radiogroup` toggle with a "Save 30%" badge on
  annual; annual is the DEFAULT selection. `selectedPackage` drives both the CTA copy
  (`Upgrade to Safety Plus — $49.99/yr`) and `purchasePackage()`. **Fail-honest, I4:**
  if `$rc_annual` is missing from the offering (staged store rollout, or dashboard
  not-yet-configured), the toggle hides entirely and the page falls back to the
  pre-existing monthly-only UI — never a dead button.
- `src/pages/SafetyPlus.jsx:116` — teaser price line updated to reflect both plans.
- `scripts/preflight-iap-config.mjs` — canonical `EXPECT` extended with
  `productAnnual: 'safety_plus_annual'` and `packageAnnual: '$rc_annual'`. New checks:
  code constants match, `Subscription.jsx` imports both, both products exist on the
  RevenueCat dashboard, both are attached to the `safety_plus` entitlement, both
  packages sit on the `default` offering with the right product on each. Drift on any
  leg fails the preflight — the whole point of the guard.
- `docs/iap-safety-plus-setup-checklist.md` — updated Tasks 1/2/3 with the App Store
  Connect / Google Play Console / RevenueCat dashboard steps for creating
  `safety_plus_annual` alongside the existing monthly product.

**Tests (all green, PR #1026):** `src/lib/__tests__/purchases.test.js` pins both package
constants; `src/pages/__tests__/Subscription.test.jsx` covers monthly-only offering
(toggle hidden, unchanged behaviour), monthly+annual offering (toggle renders, annual
default, purchase-selected uses annual, switching to monthly then purchasing uses
monthly). 40/40 targeted tests green (purchases + Subscription + tier catalogue + entitlement
I3 guard + TierProvider).

**Honest gaps / outstanding (must complete before toggle renders on-device):**
1. App Store Connect: create `safety_plus_annual` auto-renewing subscription at $49.99
   in the same Safety Plus subscription group as monthly (Apple upgrade/downgrade
   requires same group).
2. Google Play Console: create `safety_plus_annual` subscription at $49.99 with a
   1-year base plan.
3. RevenueCat dashboard: attach `safety_plus_annual` to the `safety_plus` entitlement;
   add `$rc_annual` package on the `default` offering.
4. Re-run `npm run check:iap-preflight` with `REVENUECAT_V2_SECRET_KEY` +
   `REVENUECAT_PROJECT_ID` set. Must be clean before running the device-verification
   runbook (Task 15 in `docs/superpowers/plans/2026-07-06-iap-subscription-stitching.md`).
5. Sandbox purchase on iOS + Android of both packages, entitlement resolves to
   `safety_plus`, tier switches, restore-purchases works. This is when the feature moves
   from BUILT → device-verified for annual (still not independently audited).

**Security invariants preserved:** I3 (deniability = zero backend calls) is untouched —
`entitlement.js:resolveTier()` still fails closed to `'free'` in decoy/hidden sessions
before any `getCustomerInfo()` call, and the two annual packages hit the exact same
egress chokepoint as monthly. No new network surface, no new key material touched. Same
`safety_plus` entitlement grant regardless of package.

## 2026-07-16 RASP seed-backup fail-open fix + KEK single-prompt fix — PRs #1024, #1025, #1028

**PR #1024 (docs-only) — RASP developer-mode gate device-verified as a "good catch."**
On 2026-07-16, a real Pixel 10 Pro XL (stock/clean, locked bootloader, not rooted) running
a release build hit the "This device looks modified" WARN when tapping Backup Wallet —
because USB debugging (`adb_enabled=1`) was ON. This is intended I4 behaviour, not a false
positive: disabling USB debugging clears the WARN. Evidence is on-device UI behaviour +
adb-confirmed input signals (release build ships a silent bridge, so no captured JSON).
Recorded in `docs/Feature-Status.md` §7; this is the same WARN-tier gate PR #1025 (below)
found was mis-wired to *block* rather than step-up on exactly this class of signal.

**PR #1025 (fixes #1007 + #979 fail-open bug) — RASP no longer blocks seed backup on
ordinary devices. BUILT / unit-tested + installed to a real Pixel 10 Pro XL (release
APK), INTERNAL — not independently audited, no on-chain txid.**

**The bug:** PR #1007 folded 8 soft environment signals (developer mode, accessibility
service enabled, etc.) into the `rooted` condition. PR #979 (separately, both landed
previously) made WARN-tier block seed-reveal/export/import. Combined effect: developer
mode OR an accessibility service OR an unreachable Play Integrity leg → seed backup
blocked outright on an otherwise-clean device. Device-reproduced on the same clean
Pixel 10 Pro XL from PR #1024.

**Fix 1 — new `CONDITION.ELEVATED`:** the 8 soft signals now drive a distinct `elevated`
condition (WARN + biometric re-confirm, `blockedActions: []` — backup proceeds after
step-up) instead of `rooted`. Genuine root/jailbreak/tamper/hook/emulator signals are
unchanged and still hard-block.

**Fix 2 — `excludeAttestation` on `useRaspArtifact`:** local seed-material surfaces
(`PersonalBackup`, `RestoreFromFile`, `HDWalletManager`, `SeedGrid`, `WalletEntry`,
`useRevealWithReauth`) now gate on the on-device RASP leg only — the remote Play
Integrity leg (permanently unavailable on sideloaded/debug builds) is excluded from
these pages specifically. Signing surfaces are untouched: attestation stays fully in
force for sends.

Two independent honest-review passes, both CLEAN. Tests: 605/605 RASP+backup. During
rebase onto main, a merge conflict was resolved: `PersonalBackup.jsx`'s inline
`RestoreTab` had already been extracted to `RestoreFromFile.jsx` on main;
`excludeAttestation: true` was applied to `RestoreFromFile.jsx` as well.

**PR #1028 — single biometric prompt for `enrollKek` / `changePassword` (KEK branch) /
`upgradeKekToV3`. BUILT / unit-tested only, NOT device-verified, NOT independently
audited, no on-chain txid.**

On both iOS and Android these three flows fired an extra biometric prompt each — a
JS-layer `authenticateOrThrow()` at the top, followed by the hardware-enforced Face
ID/fingerprint from `getHardwareFactor()`'s SE/StrongBox ACL. **Fix:** new pure helper
`getHardwareFactorWithLockoutFallback(getHF, hfOpts)` in `native.js`: (1) calls `getHF`
once — happy path is a single hardware-enforced OS prompt; (2) on
`KEK_ERR.NO_HARDWARE_FACTOR` (lockout), falls back to `authenticateOrThrow()` for
device-credential auth and retries once; (3) any other error propagates unchanged.
Prompt counts: `enrollKek` 2→1, `changePassword` (KEK branch) 3→2, `upgradeKekToV3`
3→2. Bare-vault enrollment and plain unlock are unchanged. `authenticateOrThrow` was
NOT deleted — it remains the lockout-fallback path and the bare-vault gate.

Honest scope: C1 — the wrapper triggers on the aggregate `NO_HARDWARE_FACTOR` code (7
distinct underlying cases; hardware lockout is only one of them), so the fallback can
also fire on non-lockout causes bucketed under the same error code. ~~B1 — `_unlockInner`,
`saveVaultContents`, and `unenrollKek` still call `getHF` directly and were NOT converted
to the new helper (deferred; a TODO landed marking this).~~ **B1 CLOSED (issue #1031):**
all three remaining `getHF` call sites (`_unlockInner`, `saveVaultContents`,
`unenrollKek`) now route through `getHardwareFactorWithLockoutFallback`. I3 deniability
symmetry preserved — `authenticateOrThrow` uses the OS biometric API with no
session-type indicator; fires identically in real/decoy/hidden. Tests: 30/30
kek-single-prompt; keystore 352/352. Honest-reviewed LAND-READY. BUILT / unit-tested
only — NOT device-verified, NOT independently audited, no on-chain txid.
Tests: 15/15 new; keystore 329/329; wallet-core 1094/1094. Two honest-review passes,
both LAND-READY.

## 2026-07-16 web PRF single-prompt enrollment + stale biometric comment — PR #1034

**#1030 (FIXED, PR #1034)** — web WebAuthn PRF first-time Hardware KEK enrollment fired
two prompts (a `create()` then a `get()`). Fix: `createPrfCredential()` in
`src/wallet-core/keystore/web.js` now extracts the PRF extension results directly from
`create()`. On Chrome ≥118 (which supports PRF evaluation during `create()`), that
output is used as H — enrollment collapses to a single WebAuthn prompt. Safari/Firefox
(no PRF-in-create support) fall through to the existing two-prompt `create()`+`get()`
path unchanged. F-05 credential-id persistence-after-confirmed-PRF safety is preserved
on both paths (`getHardwareFactor` unaffected in its persistence timing). Tests: 27/27
PRF tests, 338/338 full keystore suite. BUILT / unit-tested, NOT browser-UAT'd with a
real platform authenticator, NOT independently audited, no on-chain txid (app-layer UX
fix only).

**#1029 (CLOSED as not-a-bug)** — issue claimed non-KEK Face ID one-tap unlock fired two
prompts. Code trace confirmed `skipBiometric: true` (passed from `unlockWithBiometric` to
`unlock()` in `src/lib/WalletProvider.jsx`) already prevents the second prompt. The issue
was filed against a stale comment describing pre-fix behavior; the comment was rewritten
to accurately describe the single-prompt design already in force. H-NEW-5 (binding the
cached-PIN Keychain item to the biometric enrollment set via
`setInvalidatedByBiometricEnrollment(true)`) remains a separate TARGET item, tracked in
`docs/Feature-Status.md`, not touched by this PR.

## 2026-07-16 KEK lockout-fallback B1 closure — PR #1038

Closes issue #1031 (the B1 scope gap from PR #1028). The three remaining direct
`getHF()` call sites in `src/wallet-core/keystore/native.js` — `_unlockInner` (every
KEK-enrolled unlock), `saveVaultContents` (add/import/remove wallet, container migrate),
and `unenrollKek` (Settings → Remove hardware protection) — now route through
`getHardwareFactorWithLockoutFallback`. Users in biometric lockout get a
device-credential recovery prompt on ALL KEK operations, not just the three write paths
PR #1028 covered.

**I3 deniability:** `authenticateOrThrow` uses the OS biometric API with generic prompt
text ("Unlock your VEYRNOX wallet") and no session-type indicator — fires identically in
real/decoy/hidden sessions. Zero network egress. Reviewed and confirmed symmetric.

Tests: 30/30 `kek-single-prompt.test.js` (15 existing + 15 new: 5 unlock +
5 saveVaultContents + 5 unenrollKek covering happy path, lockout fallback,
double-lockout, non-lockout throw, and `.cause`/`.origCode` preservation). 352/352 full
keystore suite — zero regressions. Honest-reviewed LAND-READY.

BUILT / unit-tested only, INTERNAL — NOT device-verified (real-device lockout test on
iOS Face ID + Android StrongBox still outstanding), NOT independently audited, no
on-chain txid.

## 2026-07-16 biometric 2FA auto-enable on native — PR #1033

Native devices with biometric hardware (Face ID, Touch ID, fingerprint) now get biometric
2FA auto-enabled on first unlock — critical actions show "PIN + Biometric" by default
instead of requiring users to find the toggle in Security Settings. One-shot
`ensureBiometric2faOnNative()` helper in `src/lib/biometric.js` uses a
`veyrnox-2fa-biometric-auto` localStorage marker so it fires exactly once; if the user
later disables biometric 2FA in Settings, it stays off (the marker prevents re-enable).
Called fire-and-forget from `WalletProvider.unlock()` (same pattern as
`ensureStealthPool`), covering both fresh installs and existing installs on their next
unlock. No-op on web, no-op when biometrics are unavailable, never throws (best-effort —
a failed auto-enable must not block unlock). Tests: 5/5 new unit tests
(`ensureBiometric2faOnNative.test.js`), 13/13 existing biometric/2FA tests pass. BUILT /
unit-tested only, INTERNAL — NOT device-verified, NOT independently audited, no on-chain
txid.

## 2026-07-16 PIN-cohort file restore + ≥12 password enforcement — PR #1032

**Restore→PIN cohort:** both backup credential paths (password seal, PIN seal) now
decrypt to container JSON, then the user sets a fresh 8-digit device PIN via
`finalisePinRestore` in `src/wallet-core/vaultBackup.js` — vault is always PIN-cohort
after restore. Fixes the KEK enrollment failure where the KEK settings card asked for a
PIN but the vault was password-cohort (restore had preserved the backup's auth model
instead of converting to the device's 8-digit PIN cohort). `RestoreFromFile.jsx`
extracted as a shared component used by both `PersonalBackup.jsx` (post-unlock Restore
tab) and `WalletEntry.jsx` (fresh-install onboarding). Animated `RestoreProgress.jsx`
replaces the plain spinner during Argon2id decryption.

**≥12 password minimum:** enforced across backup export (`PersonalBackup`), action
password (`TwoFactorSettings`), and `createBackupEnvelope` core assertion. All surfaces
use `MIN_PASSWORD_LENGTH` from `passwordStrength.js`.

**RASP ELEVATED condition** (carried from PR #1025): soft environment signals (developer
mode, accessibility service) route to `CONDITION.ELEVATED` → `TIER.WARN` with
`blockedActions: []` — backup proceeds after biometric re-confirm. `excludeAttestation`
on all 6 seed-material surfaces prevents Play Integrity from blocking backup/restore on
sideloaded builds.

Tests: 69/69 across 10 files (RestoreFromFile, WalletEntry, vaultBackup,
g4-callsite-pins). Device-verified on Pixel 10 Pro XL: restore from `.enc` → set device
PIN → unlock with PIN → KEK enrollment succeeds with same PIN. BUILT / unit-tested +
device-verified (restore flow), INTERNAL — NOT independently audited, no on-chain txid.

## 2026-07-17 PinPad UX polish + biometric lockout copy — PR #1043

Four UX fixes in one commit. BUILT / unit-tested only, INTERNAL — NOT device-verified,
NOT independently audited, no on-chain txid.

- **PinPad press feedback:** digit/clear/back/submit buttons now flash teal (`bg-primary/20`)
  + scale down (`scale-95`) on press via `active:` pseudo-class in `PinPad.jsx`. Visible
  optical feedback on mobile where hover states don't exist.
- **Biometric lockout messaging:** `useKekEnrollmentGate.js` now classifies
  `NO_HARDWARE_FACTOR` and `USER_CANCEL` lockout errors with a specific message
  ("biometric sensor is temporarily locked out") instead of generic "Something went wrong";
  `KekEnrollmentGate.jsx` instruction copy updated to include device passcode as an option.
  New classifier test (`useKekEnrollmentGate.classifier.test.js`, 18 lines).
- **Double PinPad fix:** `PersonalBackup.jsx` export tab replaced two stacked PinPad fields
  (choose + confirm visible simultaneously) with a single PinPad and a choose→confirm state
  machine (`pinStep`). Same pattern applied to `RestoreFromFile.jsx`'s setpin phase.
- **Action Password 8-char consistency:** `TwoFactorSettings.jsx` validation and UI text now
  consistently use 8-character minimum (was mixing 8 in UI text with 12 in validation).

## 2026-07-17 Binance-first OHLCV — chart timeframe fix — PR #1056

CoinGecko's free `/coins/{id}/ohlc` endpoint mapped 1H, 4H, and 1D all to `days=1` —
identical 24-hour data regardless of period. Cycling through periods also tripped
CoinGecko's ~5 req/min anonymous rate limit. New `src/lib/binance.js` fetches per-period
candles from Binance's public klines API (no key required); `src/lib/ohlcv.js` wires
Binance-first with automatic CoinGecko fallback. MATIC→POLUSDT mapping, staleness guard,
`formatCandleTime` for intraday vs date labels, I3 deniability guard at export level.
`binance.com` added to e2e egress host pattern. 44/44 unit tests. BUILT / unit-tested,
INTERNAL — not device-verified, no on-chain txid.

## 2026-07-17 PR #962 audit follow-ups — PRs #1060, #1064

Two batches from the SEND / Scanner audit (issue #962):

**PR #1060 — M-2 + M-3:** BTC/SOL private key zeroing + score.js docstring fix.
`btc/send.js` `signAndBroadcastBtc` wraps `buildAndSignTx` in `try/finally` that zeros the
caller-supplied `privateKey` Uint8Array. `sol/send.js` `signAndBroadcastSol` zeros the
32-byte seed immediately after `Keypair.fromSeed()`. Honest limitation: `Keypair.secretKey`
in `@solana/web3.js` returns a copy, so `zeroKeypairSecret` wipes a throwaway copy — the
caller-owned seed is the operative fix. `score.js` `requiresConfirmation` comment updated
to include CAUTION (PR #832). Strict TDD. 2 new zeroing tests. BUILT / INTERNAL.

**PR #1064 — M-1 + L-1:** `SendCrypto.jsx:597` `t.amount` was coerced via `Number()`,
losing bits above 2^53 (~9 ETH in wei); changed to `String()`. `WalletConnectProvider.jsx`
independent `RASP_ASYNC_PROBE_TIMEOUT_MS = 1500` constant deduped — now imports
`FRESH_PROBE_TIMEOUT_MS` from `@/rasp`. SendCrypto 42/42, s8-value-anomaly 5/5. BUILT /
INTERNAL.

## 2026-07-17 S1–S4 audit remaining fixes — PRs #1071, #1074, #1076, #1077

Four PRs closing remaining items from the 2026-07-08 S1–S4 + crypto audit and issue #957.
All BUILT / unit-tested only, INTERNAL — NOT device-verified, NOT independently audited,
no on-chain txid.

**PR #1071 — M-9 (PIN exhaustion notice):** `src/lib/kekPinNotice.js` adds
`ensureKekPinNoticeOnNative()` — one-shot `toast.warning` on first unlock for native users
without hardware KEK, explaining the ~100M-combination offline-exhaustion risk and pointing
to Security Settings. Uses a `veyrnox-kek-pin-notice` localStorage marker (fires once).
Web/Safari: no UI surface (testing-only; docs disclosure in `SECURITY.md` via #753). 7/7
tests.

**PR #1074 — #957 (PlayIntegrity JVM tests):** `PlayIntegrityJwsVerifier.kt` extracted from
`PlayIntegrityPlugin.kt` as a pure-JVM-testable class. 8 executable Gradle JUnit tests
covering ES256 raw→DER roundtrip, RS256 path, nonce verification (match/mismatch/missing),
and malformed-JWS rejection. Closes the gap where the ES256 raw→DER transcoder was proven
only by the JS mirror (PR #955) — now also proven at the Kotlin layer.

**PR #1076 — M-8 (vault AAD binding):** `encryptVault`/`encryptVaultWithDek` now produce
v:2 blobs with `additionalData: vaultAad(blob)` binding `{v,kdf,salt}` into the AES-GCM
auth-tag. `decryptVault`/`decryptVaultWithDek` gate AAD on `v >= 2` (v:1 backward-compat
preserved). `vaultNeedsRekey()` triggers lazy v:1→v:2 upgrade on next unlock/password
change. `BIN_VERSION` bumped to 2 (per-seal `blobV` byte in binary backup format; legacy
v:1 files read back cleanly). 14 new unit tests (`vault-aad.test.js`). Closes issue #752.

**PR #1077 — M-4 (2FA retry dead end):** `TwoFactorGate.jsx` now shows a persistent
in-card error message when the broadcast fails after 2FA verification, with a retry
affordance. Previously, a network failure after 2FA left the user in a dead end with no
way to retry without navigating away. `SendCrypto.jsx` wires the error through.
`TwoFactorGate.sendError.test.jsx` added. Closes issue #749.

**PR #1072 — docs (owner decisions):** Feature-Status.md updated to close M-6, M-4, M-9
owner-decision items with final status notes. Docs-only.

## 2026-07-17 M-8 Codex P1 follow-up — PR #1079

Codex second-model review of PR #1076 (M-8 vault AAD) found two P1 regressions that would
have locked out KEK-enrolled vaults:

**P1 #1 — kek-dek AAD salt exclusion:** `encryptVaultWithDek()` sealed AAD from a
salt-free stub blob, but `decryptVaultWithDek()` called `vaultAad()` with the full saved
blob (which includes a stale `salt` field from the prior Argon2id blob). GCM auth-tag
mismatch on every KEK-enrolled unlock. Fix: `vaultAad()` now excludes `salt` when
`kdf === 'kek-dek'`.

**P1 #2 — native.js v-field not propagated:** both `safeWriteVault` calls in `native.js`
destructured only `{ iv, ct }` from `encryptVaultWithDek()`, discarding the new `v:2`.
Saved blob retained `v:1` → `decryptVaultWithDek()` took the no-AAD path while ciphertext
was sealed with v:2 AAD → auth-tag mismatch. Fix: both sites now propagate `v: newV`.

40/40 kek + vault-aad tests green. BUILT / unit-tested, INTERNAL — NOT device-verified,
NOT independently audited, no on-chain txid.

## 2026-07-17 Safety Plus annual — store-side setup + RC hardening — PR #1085

Two things landed today after the annual $49.99/yr code (PR #1026, 2026-07-16):

**1. Store-side setup for the annual package — owner-driven, code-verified over screenshots.**
- **App Store Connect**: `safety_plus_annual` auto-renewing subscription created in the existing
  Safety Plus subscription group. Reference name `Safety Plus Annual`, product ID
  `safety_plus_annual`, duration 1 Year, price $49.99 USD, English localization: display name
  `Safety Plus (Annual)`, description `Advanced Security & Features. Save 30% vs. monthly.`
  Ready for Submission. Sits alongside the existing `safety_plus_monthly` at the same subscription
  level so a swap between them is a billing-period crossgrade (not a downgrade/upgrade).
- **Google Play Console**: `safety_plus_annual` subscription created, base plan `annual`,
  auto-renewing, 1-year billing period, $49.99 USD, backwards-compatible. The Play
  `safety_plus_monthly` product was ALSO created in this session (previously missing) —
  same fields, base plan `monthly`.
- **RevenueCat dashboard**: entitlement `safety_plus` now has BOTH real store products
  (Apple + Play) for BOTH monthly and annual attached alongside the pre-existing Test Store
  entries (6 attachments total). Offering `default` (Current) has two packages: `$rc_monthly`
  → `safety_plus_monthly` (Apple + Play), `$rc_annual` → `safety_plus_annual` (Apple + Play).
  The setup was walked click-by-click and cross-checked against each screenshot; the RC v2
  API preflight was NOT run this session (owner off-Mac, no v2 secret key on hand — deferred
  to Sunday).
- **`.env.local`**: both `VITE_REVENUECAT_APPLE_API_KEY` (`appl_…`) and
  `VITE_REVENUECAT_GOOGLE_API_KEY` (`goog_…`) added (both are PUBLIC app-specific keys, safe
  to keep in git-ignored `.env.local`). Local preflight after this: 8 passed, 0 failed,
  2 warnings (pre-existing `capacitor appId` regex miss + `.storekit` doesn't reference
  `safety_plus_annual` — local StoreKit-testing gap, not sandbox-blocking).

**Honest gaps outstanding for annual (must complete before annual is BUILT → device-verified):**
- Remote preflight (`REVENUECAT_V2_SECRET_KEY` + `REVENUECAT_PROJECT_ID`) — not run this
  session; equivalent verification was done manually against the RC dashboard screenshots.
- iOS device-verify (rebuild release with new keys, sandbox purchase of annual, entitlement
  resolves to `safety_plus`, tier switches, restore works). Needs a Mac.
- Android device-verify: Play `safety_plus_monthly` and `safety_plus_annual` both show
  `Could not check` on the RC dashboard — expected while Google product-service propagation
  runs (~24h) and until the app is on an internal-testing track (Play Billing never works
  for sideloaded APKs). Also needs a physical Android device.
- Independent audit: still outstanding.

**2. PR #1085 (`727736a9`) — RC hardening: `setLogLevel('error')` on release + Manage subscription deep-link.**
Two small changes in [src/lib/purchases.js](src/lib/purchases.js) identified during a
post-setup audit of the RC SDK surface:

- **LOG-1 defence-in-depth:** `configurePurchases()` now sets
  `Purchases.setLogLevel({ level: LOG_LEVEL.ERROR })` after `configure()`, gated on
  `import.meta.env.PROD`. RevenueCat's default log level (INFO on release, DEBUG in debug
  builds) otherwise echoes SDK activity — including customer-info dumps — to logcat / os_log.
  Same class of leak PR #572 closed for the Capacitor bridge. Dev builds keep default
  verbose logs for debugging. Fail-open — a rejection from `setLogLevel` is swallowed;
  `configure()` completing is the security-relevant event, quieter logs are best-effort
  hardening.
- **Manage subscription deep-link:** new `manageSubscription()` export deep-links to the
  OS's own subscription management page (iOS: `itms-apps://apps.apple.com/account/subscriptions`,
  Android: `https://play.google.com/store/account/subscriptions`) via `@capacitor/app`'s
  `App.openUrl()`. The Capacitor RC plugin (`@revenuecat/purchases-capacitor@13.2.1`) does
  NOT expose the native SDK's `showManageSubscriptions`, so the URL-scheme path is the
  cleanest alternative — **zero egress from our code** (OS handler opens the OS surface,
  no RevenueCat call). No-op on web. `Subscription.jsx` renders a "Manage subscription"
  button below the plan card when `currentTier === 'safety_plus'` AND on a native platform,
  with helper copy naming the correct store per platform. Users can cancel or change their
  plan without hunting through OS Settings.

**Security invariants preserved:** I3 (deniability = zero backend calls) is untouched — the
Manage button is only rendered when `currentTier === 'safety_plus'`, and `currentTier` in a
decoy/hidden session is always `'free'` per `entitlement.js:resolveTier()`. So the button is
hidden in deniability sessions, matching every other paid-tier UI element. The
`App.openUrl()` call is not a network call from our JS — it hands a URL to the OS URL
handler.

**Explicitly NOT added** (all cataloged during the RC SDK audit as invariant-violating):
`logIn`/`logOut` (identity linking → deniability leak), `setAttributes`/`setEmail`/
`setPushToken`/`setDisplayName` (identity leak), `collectDeviceIdentifiers` (IDFV/GAID
fingerprint), `enableAdServicesAttributionTokenCollection` (ad-attribution exfil),
`presentCodeRedemptionSheet` (promo codes — not needed today),
`beginRefundRequestForActiveEntitlement` (in-app refund flow — nice-to-have, not urgent),
`checkTrialOrIntroductoryPriceEligibility` (no free trial today), all attribution
integrations (Facebook / Adjust / AppsFlyer / Amplitude / Mixpanel / Segment / Braze /
Iterable / PostHog / Attribution APIs) — those need to stay UNCONFIGURED on the RC
dashboard side; not enforceable from code.

Tests: 35/35 targeted green for PR #1085 (11 new: setLogLevel PROD/dev/rejection paths,
`manageSubscription` on iOS/Android/web, UI button visibility + click + per-platform copy)
plus 17/17 downstream (`entitlement.i3guard`, `TierProvider`, `TierProvider.i3guard`,
`tier`). BUILT / unit-tested only, INTERNAL — NOT device-verified (deep-link resolution
requires a real device; `@capacitor/app.openUrl` is a no-op stub in web mode). Not
independently audited, no on-chain txid.

## 2026-07-17 EEC security review — PR #1118 (8 P1 fixes)

Multi-agent EEC-review batch on `origin/main`: 6 parallel specialist reviewers (wallet-core,
RASP+attestation, hardware KEK, WalletConnect+Send, deniability+panic, recent-PR sweep) +
3 sequential Codex second-model passes + adversarial refute round. Every finding
dual-signal confirmed before landing. 17 P2s + 8 P1s filed as issues #1090–#1097 (P1s)
and #1099–#1115 (P2s); #1112 was already fixed pre-batch in PR #1094 (bonus).

**PR #1118 (fixes #1090–#1097):** BUILT / unit-tested, INTERNAL — NOT device-verified,
NO on-chain txid, NOT independently audited. 86/86 targeted tests, eslint clean, both
review passes LAND-READY (0 CRITICAL / 0 HIGH).

- **#1090** — WC `eth_sendTransaction` bypasses Action Password 2FA + spend-limit gate.
  `handleSendTransaction` / `_handleSendTransaction` now wire `evaluateTwoFactor` +
  `evaluateSendAgainstLimits`, reject with `WC_TWO_FACTOR_REQUIRED` /
  `WC_SEND_LIMIT_EXCEEDED` codes when not verified. Prior behaviour let a connected
  dApp drain funds within the step-up re-auth window without the second factor.
- **#1091** — WC `eth_sendTransaction` didn't bind `txParams.from` to the active EVM
  address. Pre-modal binding in `session_request` event handler (mirroring H8 pattern
  for `personal_sign`) verifies match case-insensitive; reject with
  `SEND_ADDRESS_MISMATCH` before approval modal. Runtime backstop inside
  `_handleSendTransaction`. Prior behaviour signed with the active wallet's key
  regardless of the dApp's `from` claim.
- **#1092** — WC `eth_signTypedData_v4` didn't bind `params[0]` to the active EVM
  address (H7 covered chain-ID only). `_handleSignTypedData` now receives
  `evmAddress`; pre-modal binding + handler-time backstop reject with
  `TYPED_DATA_ADDRESS_MISMATCH`. Permit / meta-tx typed-data signatures issued under a
  foreign "owner" claim would previously still be valid signatures from the active
  wallet's key.
- **#1093** — WC `presignGate` hardcoded `txLevel=LEVEL.OK` (no tx-risk scoring on
  dApp-supplied transactions). Now composes real tx-risk via S2 (unlimited-approval,
  pure calldata) + S4 (address-poisoning, wired but currently inert — no address book
  at WC handler time). Poison-address / unlimited-approval / drain calldata coming from
  a hostile dApp now trigger CONFIRM/BLOCK on the tx plane, not just the RASP env plane.
- **#1094** — `kekPinNotice` fired + persisted `veyrnox-kek-pin-notice` localStorage
  marker in decoy/hidden sessions (I3 deniability leak; marker survived panic wipe).
  `ensureKekPinNoticeOnNative()` now gates both the toast and the marker write on
  `isDeniabilityOrDemoActive()`; both `veyrnox-kek-pin-notice` and
  `veyrnox-2fa-biometric-auto` (PR #1033) added to `panic.js` `ALL_RESIDUE_KEYS`.
  Bonus: closed P2 #1112 in the same commit.
- **#1095** — `GasTracker` Refresh button `onClick={() => refetch()}` bypassed
  react-query v5 `enabled: egressAllowed` gate in decoy/hidden/DEMO sessions. Third
  instance of this bug class (PRs #614, #925 were the prior two). Button hidden
  entirely (not disabled — hidden) via `{egressAllowed && (...)}`. Also added
  `scripts/check-deniability-strings.mjs` rule 3 (`D-refetch-egress-bypass`) with a
  `runSelfTest()` invocation at the top of `main()` to catch a fourth instance at CI
  time. Two pre-existing instances in `FeeAnalytics.jsx` and `TransactionHistory.jsx`
  grandfathered in `RULE3_LEGACY_EXEMPT_PATHS` — filed as #1120 + #1121, closed via
  main's PR #1130 (which used the LIVE `isDeniabilityOrDemoActive` helper — stronger
  than my `isDeniabilitySessionActive` version).
- **#1096** — `NewsSentimentPage` LLM refresh POSTed to `openrouter.ai` with Bearer key
  + `HTTP-Referer: veyrnox.com` from decoy/hidden sessions (I2/I3 violation). Two-layer
  fix (belt + suspenders per PR #783 / #858 / #921 chokepoint pattern): primitive-layer
  `invokeLLM` throws coded `I3_DENIABILITY_ACTIVE` before `fetch`; UI-layer Refresh
  button hidden.
- **#1097** — Play Integrity JWS trust bypass. Two coupled defects: (a) pinned root set
  contained only GTS Root R1 (real tokens chain via R2/R3/R4 — pin missed for
  virtually every real token), (b) trust check was OR of pin ∨ `issuer.contains("Google")`
  substring fallback (a self-signed cert with `CN=Google...` in the subject satisfied
  it). Attacker on a rooted device with a hostile CA / self-signed cert could forge an
  INTEGRITY-passing payload; the RASP + WC/Send gate would report attested-clean.
  Fix: dropped the issuer-string fallback (pin is now the sole trust decision), expanded
  `GOOGLE_ROOT_CA_SHA256` to include GTS R1–R4 (source: pki.goog root bundle,
  2026-07-17), rejected `x5c` chains of length <2 (real Play Integrity tokens always
  have leaf + intermediate). Deleted 2 false-positive tests (`ES256 happy path`,
  `RS256 happy path`) that generated self-signed `CN=Google` fixtures and expected
  them to verify — the tests themselves proved the bypass was live. Replaced with
  legitimate 2-cert fixture using an `ADDITIONAL_TRUSTED_ROOTS_FOR_TESTING` seam +
  RED-1 (self-signed `CN=Google` MUST NOT verify) + RED-2 (chain of length 1 MUST NOT
  verify) + two defence-in-depth pin-miss negatives. G2-ROOTCERT-PIN residual escalated
  from "theoretical" to "the test suite proves it" in the review — closed.

**Refuted after adversarial verify:** 1 finding. My reviewer flagged
`HARDWARE_FACTOR_DEGENERATE` as not in the wrong-PIN-counter exemption set (would
miscount towards 10-strike panic wipe). Codex Pass 2 refuted: the code IS in
`KEK_UI_ERR` (not `KEK_ERR`) and IS explicitly exempted at `WalletEntry.jsx:784`.
Reviewer looked at the wrong enum. Withdrawn without landing.

**Deferred by design:** 1 finding. Codex Pass 3 flagged software-Send in deniability
sessions as unguarded. Verified in code: the ONLY deniability throw in `sendTx.mutationFn`
is Trezor-scoped; the in-code comment at `SendCrypto.jsx:919-921` reads explicitly
"software-key sends are UNAFFECTED (decoy has its own decoy vault, that path is
legitimate)". `evaluateSendGate` documented "SET-BLIND (I3)". Codex was factually right
but missed the design-invariant context — decoy signs with its own decoy key, not a
real-wallet leak. Owner-decision item if the design should change; not a bug.

**Adversarial verify round on Codex-only P1 findings** (3 skeptics, defaulting to
REFUTED on uncertainty): all 3 CONFIRMED, including the 2 novel Codex catches
(`eth_sendTransaction` `from`-binding and `signTypedData_v4` signer-address binding)
that neither my parallel reviewers nor CLAUDE.md's documented WC controls had flagged.
The two-developer protocol earned its keep on those two alone.

## 2026-07-18 Vault AAD v:3 migration plan iterations — PRs #1139, #1140 (docs-only)

Plan-first pattern for the deferred #1111 (fold `hardwareKekVersion` + `kekSalt` +
`kekWrap` into kek-dek AAD so a down-stamp attack fails closed at the cipher layer).
BOTH my P2 batch agent and main's PR #1129 independently deferred #1111 with the same
conclusion — this requires a coordinated v:2→v:3 migration across the whole KEK stack
(`_unlockInner`, `changePassword`, `upgradeKekToV3`, `enrollKek`, `saveVaultContents`).
PR #1076 shipped a similar-shaped change and produced two P1 regressions on merge day
(fixed same-day in PR #1079); landing this blind would repeat that class of failure.
Plan-first was the honest response.

**PR #1139 — plan r1.** Initial planning document at
`docs/superpowers/plans/2026-07-18-vault-aad-v3-migration.md`. Docs-only, no code.
Design sketch: single `VAULT_VERSION` bump 2→3; `vaultAad(blob)` gates on `blob.v` (not
constant); migration runs on `changePassword` / `upgradeKekToV3` (never on unlock hot
path, honouring PR #662).

**Codex r1 second-pass — verdict: REQUIRES_PLAN_REVISION.** 4 P1s + 3 P2s
([#1111 comment](https://github.com/VEYRNOX/veyrnox/issues/1111#issuecomment-5008592301)):
- **P1a** — `encryptVaultWithDek(secret, dek)` seals AAD from an internal
  `{v, kdf, iv}` stub; `native.js` knows `hardwareKekVersion`/`kekSalt`/`kekWrap` only
  AFTER seal. r1 implicitly assumed seal-time knowledge → immediate lockout on first
  v:3 seal.
- **P1b** — `changePassword` / `upgradeKekToV3` rotate `{kekWrap, kekSalt,
  hardwareKekVersion}` while preserving `blob.iv` / `blob.ct` — seed ciphertext sealed
  under v:2 AAD would fail v:3 AAD verification on next unlock.
- **P1c** — Plan said "native-only" but `VAULT_VERSION` is a shared global. Bumping to
  3 breaks argon2id `decryptVault` (`v ∈ {1, 2}` only), plus `duress.js` / `stealth.js`
  / `vaultBackup.js` which reuse the shared encrypt/decrypt.
- **P1d** — `vaultBackup.js` `isValidBlob()` / `isValidBackup()` accept only v:1 or v:2
  — v:3 seals fail backup verify.
- P2a: `saveVaultContents` "preserve v" contract inexpressible with current
  `encryptVaultWithDek` helper.
- P2b: `withLockSuppressed` is NOT a write lock (it's a lock-suppression counter) — r1's
  concurrency claim was false.
- P2c: Rollback scope too narrow — mixed-version storage would strand v:3 non-KEK blobs
  even if the primary KEK vault wasn't migrated.

**PR #1140 — plan r2.** Full rewrite closing all 4 P1s structurally:
- **P1a fix** — new `encryptVaultWithDek(secret, dek, aadShape?)` signature; caller
  composes the FINAL blob shape and the AAD is built from the same shape decrypt will
  read. No stub.
- **P1b fix** — migration explicitly re-seals the seed ciphertext (decrypt inner →
  fresh IV → re-encrypt) in a single atomic transaction, not a wrap-rewrite.
- **P1c fix** — per-kdf version constants: `VAULT_VERSION_ARGON2ID = 2` (pinned) +
  `KEK_BLOB_VERSION = 3` (new). `vaultNeedsRekey` gates per-kdf. Argon2id path touches
  zero downstream code.
- **P1d fix** — `isValidBlob` per-kdf gate + older-client "backup requires app update"
  disclosure.
- **P2 fixes** — real in-memory Promise-chained Mutex; `withLockSuppressed` renamed to
  `suppressLockTimer` (its actual job); staged-write transaction so pre-migration v:2
  blob deleted only after v:3 verified readable; three-file atomic revert scope
  (`vault.js` + `native.js` + `vaultBackup.js`).

**Codex r2 second-pass — verdict: REQUIRES_PLAN_REVISION again.** r1 P1a + P1c fully
closed; the other 5 became "new-variants" (structural direction right, integration
details fell short). 2 new P1s + 4 new P2s
([#1111 comment](https://github.com/VEYRNOX/veyrnox/issues/1111#issuecomment-5008662300)):
- **P1 (new)** — Installed-base migration reach gap. Post-PR #568 vaults on disk today
  are `{v:2, kdf:'kek-dek', hardwareKekVersion:3, kekSalt, kekWrap}`. r2's
  `upgradeKekToV3` idempotence check short-circuits on `blob.hardwareKekVersion === 3`;
  `HardwareKekSettings` hides the Upgrade card. **These vaults never migrate to
  AAD-bound v:3** unless the user later changes password/PIN. r2 conflated the
  pre-existing `hardwareKekVersion` protocol marker with the new AAD blob-`v`.
- **P1 (new)** — Mutex omits `clearVault` / panic wipe. A long biometric migration
  awaits after reading the v:2 blob; user triggers panic wipe; wipe clears storage and
  hardware credential; migration resumes and writes a v:3 blob from the stale pre-wipe
  read → **vault resurrected on disk after the user attempted to clear it.**
  Vault-resurrection-after-panic-wipe is a serious deniability failure.
- Four P2s on storage-abstraction rename semantics, backup path alignment,
  `aadShape` callback API consistency, and a contradiction between two
  `saveVaultContents` sketch sections.

**r2 was merged as-is (`cd6dc567`) + handoff to owner.** Codex confirmed r2 is
materially stronger than r1; the remaining gaps are integration-reality issues that
require a live implementer + owner engagement (staging semantics, real backup path
integration, installed-base migration reach, `clearVault` lifecycle interaction). One
more Claude+Codex cycle would keep uncovering the same class of gap; the honest signal
is that plan-alone iteration has hit diminishing returns and the next progress step is
human.

**#1111 remains open.** Implementation blocked on:
1. Owner sign-off on r2's open decisions (per-kdf constants, `downgradeKekToV2` escape
   hatch, backup path scope).
2. Implementer + owner decision session on the 2 new P1s + 4 P2s from Codex r2.
3. Assignment of an implementer (currently unassigned).

**Independent third-party security audit — still the ultimate gate per CLAUDE.md.**
None of this plan-iteration substitutes for it. Codex is an INTERNAL second-model
review, tier-equivalent to an internal AI review pass, not the outstanding independent
third-party audit.

## 2026-07-17/18 P2 issue sweep — PRs #1128–#1135

Batch closure of 18 open P2 issues across 7 PRs (all squash-merged via `--admin`). All
BUILT / unit-tested only, INTERNAL — NOT device-verified, NOT independently audited, no
on-chain txid.

**PR #1128 (fixes #1113, #1109):** Master-seed private key wiping + Cosmos public-only
address derivation. `derivation.js` `deriveAllAddresses` now zeros the HD root private
key in `finally` after extracting per-chain keys. `cosmos/derivation.js`
`deriveCosmosBech32` uses `HDKey.fromExtendedKey(xpub)` for address-only derivation —
the Cosmos leaf private key never materialises. Strict TDD (RED→GREEN).

**PR #1129 (fixes #1099, #1100, #1103, #1105, #1111, #1114):** Six honesty + hardening
fixes in one batch:
- #1099: `WalletConnectProvider.jsx` WC relay `init()` gated on
  `isDeniabilityOrDemoActive()` (LIVE helper, not stale `DEMO` snapshot) — relay
  connection blocked in decoy/hidden/demo sessions.
- #1100: `native.js` `createVault` gates on `BiometricAuth.checkBiometry()` —
  `deviceIsSecure === false` throws `DEVICE_NOT_SECURE` (fail-closed, I4).
- #1103: `native.js` iOS caveat comment — v3 stamps protocol parity, NOT salt-binding
  on iOS (ObjC plugin ignores `kekSalt`).
- #1105: `WalletConnectProvider.jsx` `handleApproveSession` calls
  `presignGateOrReject()` before session approval — a rooted/hooked device cannot
  approve new WC sessions.
- #1111: `vault.js` `vaultAad` accepted-residual comment — kek-dek blobs intentionally
  omit `hardwareKekVersion` from AAD (enforced by salt-binding chain instead).
- #1114: `web.js` documented-residual comment — WebAuthn PRF `ArrayBuffer` is
  architecturally unzeroable (parallel to iOS-F5 M-6).

**PR #1130 (fixes #1121, #1120):** `TransactionHistory.jsx` and `FeeAnalytics.jsx`
react-query v5 `refetch()` buttons hidden (not just disabled) in deniability sessions.
`isDeniabilityOrDemoActive()` gate prevents the refetch bypass of `enabled: false`.

**PR #1132 (fixes #1115, #1101):**
- #1115: `resolveMaxPriorityFeePerGas` null guard was already merged (PR #1129); this PR
  adds the missing regression test (4 assertions).
- #1101: `restoreWithPassword()` dead export removed from `vaultBackup.js` (zero
  production callers confirmed by grep). 3 structural tests added.

**PR #1133 (fixes #1108, #1104):** RASP native-probe severity corrections in
`nativeProbe.js`:
- #1108: `screenCapture` demoted from `hooked` (TIER.BLOCK) to `elevated` (TIER.WARN) —
  screen recording no longer blocks sends.
- #1104: `overlayActive` removed from all RASP conditions entirely — AssistiveTouch no
  longer triggers any RASP friction.

**PR #1134 (fixes #1110, #1107):**
- #1110: `vaultAad()` now canonicalizes field order before `JSON.stringify` — explicit
  property ordering for both the `kdf` sub-object and top-level fields. Byte-identical
  output for all existing v:2 vaults (no migration needed). Function exported for direct
  unit testing.
- #1107: `VITE_BYPASS_RASP` CI guard — `scripts/check-rasp-bypass.mjs` fails if any
  `.env.production*` file sets the flag; runtime `console.error` in
  `useRaspArtifact.js` when bypass is active in `import.meta.env.PROD`.

**PR #1135 (fixes #1106, #1102):**
- #1106: `kekPinNotice.js` module-scope `getKeyStore()` moved inside
  `ensureKekPinNoticeOnNative()` as a lazy call — no more boot-order side-effect.
- #1102: `hiddenBalance.js` guard changed from `isDeniabilitySessionActive()` to
  `isDeniabilityOrDemoActive()` — covers the persisted `veyrnox-demo=1` flag that the
  session-marker-only check missed.

**Remaining open:** #1073 (M2c ungate checklist — owner-decision item, intentionally
open).

## 2026-07-17/18 M2c hardening + Android M2d-1a/1b/1c scaffold — PRs #1098, #1116, #1131, #1141

Six PRs landed in this window. Two (#1123, #1138) are TypeScript/JSDoc-only CI unblocks
with zero runtime or security effect — noted for completeness, not part of the M2c/M2d
security surface. The other four are the M2c/M2d batch. **All are BUILT / unit-tested
only — NOT device-verified, NOT independently audited, no on-chain txid (M2c/M2d are
key-wrap gates, not send paths). `M2C_ENABLED` (JS + Swift `m2cEnabled`) and
`M2D_ENABLED` (Kotlin) both remain `false`; all three lockstep flags
(`M2C_HARDWARE_WRAP_ENABLED` in `native.js`, `M2C_ENABLED` in `veyrnoxEnclave.js`,
`M2D_ENABLED` in `VeyrnoxEnclavePlugin.kt`) stay off. F-2 is NOT closed — M2c/M2d close
it together only after their device runbooks pass AND the independent audit signs off.**

- **PR #1098 — chore(m2c): iOS Swift-side hardening from Codex ad-hoc review (P2-#1/#2/#3)
  + Codex second-pass follow-ups (P2-A/P2-B).** Single-collaborator-repo work — the
  Codex passes are a second-model reviewer, never presented as independent. Three P2
  findings, then two more from a Codex re-review of the fix:
  - **P2-#1** — `deleteWrappingKey()` now requires an allowlisted `intent`
    (`'cleanup' | 'unenroll' | 'wipe'`); throws `M2C_DELETE_INTENT_REQUIRED` otherwise —
    defence-in-depth against an injected-JS availability hazard once M2c is live.
  - **P2-#2** — `EnclaveKeyService.createWrappingKey()` no longer trusts a bare
    `loadPrivateKey() != nil` check to mean "reuse this key"; a new
    `loadPrivateKeyAttributes()` peer asserts `kSecAttrTokenID ==
    kSecAttrTokenIDSecureEnclave` before reuse, throwing `EnclaveError.staleWrappingKey`
    on a non-Enclave-backed stale item instead of silently deleting and recreating.
  - **P2-#3** — `logM2cMigrationFailure` no longer falls back to `e.message` (a future
    error class could carry a secret-bearing message); now allowlisted `e.code`, else
    `e.constructor.name`, else `"unknown error"` — `e.message` is never logged.
  - **Codex second pass, same PR** — found P2-#1/#2 were incompletely wired: (a) the JS
    intent allowlist ran but the native call fired WITHOUT the intent (in-page JS calling
    `Capacitor.Plugins.VeyrnoxEnclave.deleteWrappingKey()` directly bypasses the JS layer
    entirely), and (b) asserting `kSecAttrTokenID == kSecAttrTokenIDSecureEnclave` proves
    the key lives in the Enclave but not that its ACL flags are the expected
    `[.privateKeyUsage, .biometryCurrentSet]`. Fixed in a follow-up commit on the same PR:
    - **P2-A** — `deleteWrappingKey` JS wrapper now forwards `{ intent }` through the
      Capacitor bridge; `VeyrnoxEnclavePlugin.swift` re-enforces the same
      `["cleanup", "unenroll", "wipe"]` allowlist at the native selector.
    - **P2-B** — Enclave key application tag bumped to a versioned
      `"com.veyrnox.app.enclaveWrappingKey.v2"` — the `.vN` suffix IS the ACL-policy
      stamp; a key found under the current versioned tag is guaranteed to have been
      minted by this codepath with this ACL, since there is no other producer.
  - JS: unit-tested (11/11 delete-intent, 6/6 m2c-gate, 8/8 migration-log; 25 total
    across the three suites). Swift: code-only, no iOS build/test rig on this Windows
    dev box — the P2-#2 change is explicitly flagged as requiring a physical-iPhone
    re-test before the M2c flag flip.

- **PR #1116 — feat(m2d): Android AndroidKeyStore/StrongBox plugin scaffold (M2d-1a).**
  New `VeyrnoxEnclavePlugin.kt` (Capacitor plugin) + `EnclaveKeyService.kt` (capability
  probe only — no keystore write yet) + `VeyrnoxEnclaveDeleteIntent.kt` (JVM-testable
  intent allowlist, mirrors the JS/Swift allowlist from PR #1098). Registered in
  `MainActivity.java`. `M2D_ENABLED = false`; `createWrappingKey`/`wrap`/`unwrap` fail
  closed. New device runbook `docs/audit-triage/m2d-strongbox-device-test.md` — STATUS:
  NOT RUN. 12-case JVM `VeyrnoxEnclaveDeleteIntentTest`.

- **PR #1131 — feat(m2d): real AndroidKeyStore `createWrappingKey` behind `M2D_ENABLED`
  (M2d-1b).** Real AES-GCM 256 key generation with `setUserAuthenticationRequired(true)`
  + `setInvalidatedByBiometricEnrollment(true)` + `setUserAuthenticationParameters(0,
  AUTH_BIOMETRIC_STRONG)` (H16 discipline — no device-credential fallback) +
  StrongBox-preferred with `StrongBoxUnavailableException` TEE fall-through. API 30+
  gate (`M2D_REQUIRES_ANDROID_11`). Idempotent versioned alias
  `com.veyrnox.app.enclaveWrappingKey.v1` (same P2-B versioning pattern as iOS). Honest
  tier reporting via `KeyInfo.securityLevel` → `strongBox`/`tee`/`software`/`unknown`
  (I4: never labels a software-backed key as `tee`). The M2d-1a-reserved `wrapAlias` was
  dropped — two AES-GCM aliases can't decrypt each other's output, so M2d uses one
  AES-GCM key for both wrap and unwrap. New pure-Kotlin `EnclaveKeySpecConfig` config
  object + 12-case JVM `EnclaveKeySpecConfigTest`. Codex found and fixed a P1 in a
  follow-up commit: duplicate `when` branches in `backingFromLevel` — a Kotlin
  compile-fail on `SECURITY_LEVEL_TRUSTED_ENVIRONMENT` (value 1) alongside a literal
  `1 ->` branch.

- **PR #1141 — feat(m2d): real `BiometricPrompt`-gated `wrap()` behind `M2D_ENABLED`
  (M2d-1c).** Real AES-GCM encrypt behind `BiometricPrompt(CryptoObject(cipher))`,
  `BIOMETRIC_STRONG` only. Wire format: `IV (12 bytes) ‖ Cipher.doFinal(plaintext)
  [ciphertext ‖ 16-byte GCM tag]`, base64. Response field `{ ciphertext: '<base64>' }` —
  matches the JS wrapper destructure + iOS parity. Async: `call.setKeepAlive(true)` at
  dispatch, released before every terminal resolve/reject. Plaintext buffer wiped in
  `finally`. Typed error codes mirror iOS: `USER_CANCEL`, `BIOMETRY_LOCKOUT`,
  `BIOMETRY_NOT_ENROLLED`, `AUTH_FAILED`, `KEY_NOT_FOUND`, `KEY_INVALIDATED`,
  `WRAP_FAILED`, `M2D_MISSING_BLOB`. `onAuthenticationFailed` (an individual bad
  face/finger) does not call back — the OS keeps the sheet open for retry, matching
  platform convention. New pure-Kotlin `EnclaveWireFormat` helper + 14-case JVM
  `EnclaveWireFormatTest` (roundtrip, empty-ciphertext boundary at 28B, four bad-IV
  rejects, short-bundle rejects, no-byte-data-in-error-messages). **Codex went four
  passes on this PR:** (a) P2 keep-alive not released on one error path, (b) P2 response
  field renamed `bundle` → `ciphertext` to match the JS wrapper, (c) P2 the device-test
  runbook still said `bundle` in one spot — synced to `ciphertext`, (d) fourth pass
  clean. Kotlin main sources DID compile locally this session via a one-time `npx cap
  sync android` (73/73 JVM tests green: 12 DeleteIntent + 12 KeySpecConfig +
  14 WireFormat + 34 PlayIntegrity + 1 example); the `capacitor.settings.gradle` drift
  from that sync was reverted before commit.

**Honest scope carried across all four PRs:** BUILT / unit-tested (JS + Swift + Kotlin
JVM helpers only) — NOT device-verified on real hardware, NOT independently audited, no
on-chain txid applies (M2c/M2d are key-wrap gates, not send paths). Both device runbooks
(`docs/audit-triage/m2c-enclave-device-test.md` for iOS, `docs/audit-triage/
m2d-strongbox-device-test.md` for Android) remain STATUS: NOT RUN. On the AES-GCM
single-key UX tradeoff: honestly, BOTH wrap and unwrap will prompt biometric in
production once `M2D_ENABLED` flips — an RSA-OAEP asymmetric design (iOS-SE-like "wrap
without prompt") was considered but deferred because StrongBox RSA/EC support is spotty
across Android OEMs; revisit if the M2d-1c/-1d device runbook surfaces real UX pain.
F-2 is not closed by any of this work — see `docs/Feature-Status.md` §F-01/F-02 and
`docs/M2cd.native-acl-plan.md` for the full per-item detail and the M2d-1d (unwrap)
scope still ahead.

## Security invariants

- I1 — keys never leave the device. I2 — no silent data egress. I3 — deniability mode
  makes zero backend calls. I4 — fail honest, fail closed. I5 — backend untrusted by design.
- **I6 — Hardware Binding:** PIN-cohort DEK wrapped under KEK = HKDF(H ‖ C) — ordered
  concatenation of H then C as the HKDF IKM (NOT XOR; corrected per the ECC KEK audit
  2026-07-01 — code is `kek.js: combineKek`, domain `veyrnox/kek/v1/combine(H||C)`)
  - H: Hardware factor (web: WebAuthn PRF; iOS: Secure Enclave; Android: StrongBox)
  - C: Password/PIN-derived factor (Argon2id)
  - Requirement: Both H and C must be present; missing either throws (fail-closed)

**Vault KDF memory cost raised 64→192 MiB (2026-07-05, commit `d0522bfb`, PR #604).**
`src/wallet-core/vault.js` `KDF_PARAMS.memorySize` is now 196608 KiB (192 MiB); iterations
(3) and parallelism (1) unchanged. This reverses PR #465 (2026-06-28), which had lowered
192→64 MiB specifically to fix 4-8s unlock latency on Capacitor WebView devices — the
reversal premise is that device-exercised Face ID/biometric unlock (2026-07-05) now gives
enrolled users a fast path around the slow password KDF. Backward compatible: 64 MiB
vaults still unlock (each blob carries its own KDF params); a lazy migration re-wraps to
192 MiB on next password change/unlock; `LEGACY_KDF_PARAMS` stays 64 MiB. Status: BUILT,
unit-tested (wallet-core 937/937 passing) — **NOT verified**. The latency premise
(originally an unmeasured real-device UX claim) is now **MEASURED** on one flagship
Android device (2026-07-05, Pixel 10 Pro XL, Android 16, `com.veyrnox.app.debug`,
production argon2 worker in the installed APK via CDP): 192 MiB warm-worker median
603 ms (582–617 ms, n=5), cold-worker median 668 ms (657–678 ms, n=3); 64 MiB warm
median 182 ms (177–208 ms, n=5). The PR #465 4-8 s figure did NOT reproduce on this
device (full report: PR #604 comment `issuecomment-4887451367`). Honest remaining
caveats: (1) users without biometric enrollment — including the Safari password-only web
fallback — still pay the full 192 MiB password-KDF cost on every unlock (~0.6-0.7 s on
this flagship; mid/low-end Android NOT cleared and could be materially slower); (2) single
flagship datapoint only; (3) the measurement is pure KDF cost, not full unlock UX; (4)
iOS, web, and the Safari fallback path are unmeasured; (5) INTERNAL evidence, not
independent.

**Vault cipher decision (2026-07-06, issue #611 — CLOSED).** The question "commission a
standalone external cryptographer review (~$15K–25K) of the vault cipher path?" was
DECIDED: **no standalone engagement; defer-and-bundle.** AES-256-GCM is formally accepted
as the vault construction — the "divergence from an XChaCha20-Poly1305 design spec"
premise (inherited from the mislabeled PR #609 audit) was UNSUPPORTED: no such spec ever
existed in the repo (`docs/crypto-implementation-verification.md`), and migrating would
cost 4–6 weeks and drop iOS Secure Enclave compatibility
(`docs/cipher-migration-analysis.md`). The vault cipher path and residual items (ECC L-4
AAD binding, A-2 timing oracle, heap zeroization, short-PIN resistance, salt
distinctness) are folded into the scope of the already-outstanding independent audit.
Revisit triggers: an audit finding on the vault path, a WebCrypto AES-GCM implementation
flaw in target runtimes, or the threat model dropping the T6 acceptance. Audit-trail
record: `docs/audit-triage/vault-cipher-decision-2026-07-06.md`.

## Demo mode (known trap)

Demo mode triggers on `?demo=1`, `VITE_DEMO_MODE=1`, native dev, OR a persisted
`veyrnox-demo=1` in localStorage (persists silently across reloads). Demo shows fake
seeded balances and fake sends. Before any real verification: clear demo (visit `/?demo=0`),
confirm a fresh real wallet shows 0.0 on-chain and no demo simulation box.

## Dev send ungate (testnet verification)

To send `receive_only` assets in dev for verification: set `VITE_DEV_UNGATE_SEND=1` via a
`.env.local` file (git-ignored) — NOT an inline shell var (fails on Windows/PowerShell).
This flips the gate decision only, never asset status, and is dead-code-eliminated from
production builds. The DEV UNGATE banner shows only on a receive_only asset, never on ETH.

## Wallet model

One HD seed derives per-chain accounts (Model B): a "wallet" is a seed; the Send screen's
asset selector chooses which asset/chain to send. EVM assets (ETH, MATIC, ARB, OP, AVAX,
BNB) share one secp256k1 m/44'/60' address; ERC-20s (USDC/USDT) are contract calls on it;
BTC (m/84'/UTXO/PSBT) and SOL (ed25519/SLIP-0010) have their own addresses and are fully
wired — both are LIVE with verified testnet txids (see `src/wallet-core/assets.js`).
AVAX and BNB share the EVM address and are now LIVE as well — both sent via the full
in-app UI path on testnet (AVAX Fuji `0x3697e0d…`, re-confirmed on-chain 2026-06-22;
BNB BSC-testnet `0x1a6ee75…`, per session record + owner confirmation, not yet
independently re-confirmed on-chain). All 10 assets are LIVE — see `src/wallet-core/assets.js`.
**Android send flow verified 2026-07-04:** Full UI send integration tested on real Pixel device
via Appium automation framework; E2E send to Sepolia testnet confirmed on-chain (txid
`0x989f6b4cf94471956b348e22ac434b11325d46b6ce00f87cd934d8cf74da27c1`, block 6768093,
0.001 ETH to recipient 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045). Appium framework
(UiAutomator2 + WebdriverIO) is now LIVE for automated real-device testing — see
`tests/android/` and `TESTING_SETUP.md`. CI/CD pipeline validates code on each push
(GitHub Actions). NOT independently audited.

## WalletConnect security controls (BUILT, 2026-06-27)

`src/lib/WalletConnectProvider.jsx` has been through a post-audit security hardening
sweep. Key controls now on main:
- **C3 — RASP pre-sign gate:** `presignGate()` runs before every WC signing handler;
  blocked → `rejectRequest` + return, key never touched (I4).
- **H7 — EIP-712 chain binding:** `eth_signTypedData_v4` validates `domain.chainId` vs
  WC session CAIP-2 chain; mismatch → `CHAIN_ID_MISMATCH` reject (fail-closed).
  No-chainId domain is also rejected (fail-closed; supersedes earlier backwards-compat).
  **PR #931 (2026-07-13):** H7 now also enforced pre-modal — `domain.chainId` is parsed
  at `session_request` arrival in the event handler; mismatch → `rejectRequest` before
  `pendingRequests` / approval modal (dual-layer: handler + sign-time).
- **H8 — personal_sign address binding:** resolves EIP-1474 vs MetaMask-legacy param
  order; rejects if neither param is the wallet's own address (I4).
  **PR #931 (2026-07-13):** H8 now also enforced pre-modal — `resolvePersonalSignMessage()`
  called at `session_request` arrival; mismatch → `rejectRequest` before the approval
  modal is shown (dual-layer: handler + sign-time).
- **M9 — 1M gas cap:** dApp-supplied gas is clamped to 1,000,000; estimates are also
  capped.
- **M11 — session expiry:** `assertSessionLive` runs before any key operation;
  expired/absent session → reject + throw (I4).
- **H-NEW-B — step-up re-auth:** `isSendReauthRequired()` enforces recent auth window
  before any key operation; stale auth → reject + throw (fail-closed).
- **H-A — web vault password minimum:** `validateWebVaultPassword()` enforces ≥12 chars
  on web mainnet (`ALLOW_MAINNET = true`); `WEB_VAULT_PASSWORD_TOO_SHORT` on short input.
- **H-NEW-4/6 — KEK zeroing:** `web.js` wraps full KEK/DEK lifetime in `try/finally`;
  H, KEK, H2 copies all zeroed on every path.
- **H14/H15/H16 — KEK honest naming:** misleading "hardware" names removed from
  software-layer controls; `isSecureHardwareAvailable()` is the honest gate.
- **H-C — mainnet gate consolidation:** `SendCrypto.jsx` imports compile-time
  `ALLOW_MAINNET` from `networks.js` (not a runtime env var). Dead-code-eliminated in prod.
- **Supervised WC e2e specs** (`e2e/walletconnect-live-pairing.spec.js`, PR #931,
  2026-07-13, `RUN_SUPERVISED_E2E=1`) — 4 Playwright tests against real
  relay.walletconnect.com: H8 happy path (own address → valid 65-byte sig), H8 mismatch
  (foreign address → pre-modal reject), M11 (disconnected session → SDK-level reject),
  H7 (domain.chainId=1 on Sepolia session → pre-modal reject). BUILT / INTERNAL — no
  on-chain txid, live relay gap SUPERVISED (not CI-automated), not independently audited.
  **PR #933 (2026-07-13):** CLAUDE.md + `docs/Feature-Status.md` sync for all PR #931 changes
  (H7/H8 pre-modal, supervised spec, honest-gaps paragraph).
  **PR #934 (2026-07-13):** CLAUDE.md update recording PR #933 docs sync.
  **PR #935 (2026-07-13):** CLAUDE.md update recording PR #934 docs sync.
  **PR #937 (2026-07-13):** CLAUDE.md update recording PR #935 docs sync.

## Per-chain gotchas

- BNB testnet: enforces a minimum gas price; the "Slow" fee tier can underprice and get
  rejected — use Standard+.
- USDT: no official Tether Sepolia; uses an Aave faucet stand-in.
- WalletConnect: test PINs/passwords must be ≥12 chars (H-A minimum on mainnet builds).
  Use `ALLOW_MAINNET = false` in test env or use ≥12-char test secrets.

## Environment

- Windows (Git Bash / MINGW64). iOS native build is NOT possible here (needs a Mac).
- Use `.env.local` for env flags, not inline shell vars.

## Design system

UI follows the Veyrnox design system (see the design-system skill): calm near-black
surfaces (#050608 → #1D222B), one teal accent (#4ADAC2 = verified), Schibsted Grotesk for
prose / IBM Plex Mono for verifiable values (addresses, amounts, fees), deniability by
default (never show wallet count/list), plain-language risk before signing.

## Working pattern

- Reconnaissance before changes; report root cause before fixing.
- **Fetch main before diagnosing.** Main moves 10+ commits/day and worktrees are cut
  from stale snapshots. Before diagnosing any user-visible bug, run
  `git fetch origin main && git log origin/main --oneline -15` and scan the titles for
  the symptom — it may already be fixed (retro 2026-07-06: the "blank dApp Connector in
  demo" was fixed on main in PR #607 before the session ever saw it; diagnosing against
  the stale worktree cost ~40 min of duplicate work and a 4-conflict merge).
- Pure helpers + unit tests where logic can be extracted (the codebase pattern).
- One moving part at a time. Don't mark anything verified without the user's on-chain txid.

## Multi-agent working pattern (the "team")

Treat substantial work as a team of specialists, dispatched in parallel where the work is
independent. The team is committed to the repo, so every session has it:

- **Subagents** (`.claude/agents/`): `veyrnox-recon` (read-only mapping + root cause),
  `veyrnox-ui` (design-system UI/a11y, preview-verified), `veyrnox-security-tdd` (wallet-core
  fixes via strict TDD, never fake security), and `veyrnox-honest-reviewer` (correctness +
  the honesty bar). Dispatch via the Agent tool; fan several out in ONE message to run them
  concurrently. Give each agent only its own files — never let two parallel agents edit the
  same file.
- **Command** (`.claude/commands/parallel-fix.md`): `/parallel-fix <area>` — recon → fan out
  one implementer per independent item → honest review → integrate & verify.
- **Workflow** (`.claude/workflows/branch-review.js`): run the `branch-review` workflow to
  review the current branch vs main across correctness / security-honesty / design-system /
  a11y, with each finding adversarially verified before it is reported.

### Codex — second developer (security reviewer, regression-test writer, CI-fix helper)

Codex (OpenAI Codex CLI, `codex` binary) is treated as a second developer on the team. It
runs as a separate reasoning pass so its review is not biased by Claude's implementation reasoning.

**Hard rules for the two-developer model:**
- **Codex never edits files.** Every Codex invocation is read-only (`codex review` or
  `codex exec -s read-only`). Claude reads the report, then decides what to implement.
- **No shared branch.** Claude works on `claude/<slug>` worktrees. Codex reviews the
  current branch's diff. Never run a Codex review while Claude has uncommitted changes
  on that same working tree — commit or stash first.
- **Codex output is INTERNAL.** A Codex pass is a second opinion, not an independent
  third-party audit. Never cite it as the outstanding independent audit.

**When to invoke Codex:**
1. After any security-sensitive Claude branch — before merging, run `/codex-security-review`.
   It gates on `[P1]` findings; a branch with open P1s must not merge.
2. When a CI check is failing and Claude is stuck after 2 attempts — hand off to Codex for
   root-cause analysis. Claude reads the answer and implements.
3. When writing regression tests for a closed audit finding — ask Codex to draft the test,
   Claude reviews and commits.

**Commands:**
- `/codex-security-review` — full security pass on the current branch diff (`.claude/commands/codex-security-review.md`)
- `/codex-security-review focus on <area>` — same, with a specific focus (e.g. "key derivation", "deniability egress")
- Agent spec: `.claude/agents/veyrnox-codex.md` — full division-of-labour table and invocation guide

### Orchestration pattern — pick one automatically, every session

Before starting any substantial task, choose the orchestration pattern that fits. Do not ask
the user which to use — read the request, apply the table, proceed.

| Signal in the request | Pattern | How to apply |
|---|---|---|
| Fixed known targets, independent work (e.g. "fix X and Y", "review these 3 files") | **Parallel Execution** | Fan agents out in ONE message so they run concurrently. Merge results before replying. |
| Open-ended discovery ("find all X", "audit everything", unknown count of targets) | **Dynamic Spawner** | Dispatch `dynamic-spawner` agent. It discovers scope at runtime, plans spawns, then synthesizes. |
| Request spans multiple domains OR involves a destructive/irreversible action (push, delete, send, deploy, wipe) | **Router + Human Gate** | Dispatch `router-human-loop` agent first. It classifies, routes, and presents a per-action confirm gate before anything destructive runs. |

**Tie-break rules:**
- Any destructive action present → Router + Human Gate wins, regardless of other signals.
- Scope unknown → Dynamic Spawner, even if the work also looks parallel.
- Scope known + no destructive actions → Parallel Execution.

Rules that still bind every agent: reconnaissance before changes; one moving part at a time;
security-sensitive files (seed/keys/signing/auth) are off-limits to cosmetic work; and nothing
is "verified" without the user's real on-chain txid.
