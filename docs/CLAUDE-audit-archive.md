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
`logIn`/`logOut` (identity linking → deniability leak), `setEmail`/
`setPushToken`/`setDisplayName` (identity leak), `collectDeviceIdentifiers` (IDFV/GAID
fingerprint), `enableAdServicesAttributionTokenCollection` (ad-attribution exfil),
`presentCodeRedemptionSheet` (promo codes — not needed today),
`beginRefundRequestForActiveEntitlement` (in-app refund flow — nice-to-have, not urgent),
`checkTrialOrIntroductoryPriceEligibility` (no free trial today), all attribution
integrations (Facebook / Adjust / AppsFlyer / Amplitude / Mixpanel / Segment / Braze /
Iterable / PostHog / Attribution APIs) — those need to stay UNCONFIGURED on the RC
dashboard side; not enforceable from code.

**CORRECTION (2026-07-20) — `setAttributes` IS now used; removed from the NOT-added list
above.** The referral system (PRs #1194/#1195, 2026-07-18) added
`setReferralAttribute(code)` at `src/lib/purchases.js:100-105`, which calls
`Purchases.setAttributes({ referralCode })` to tag the RevenueCat customer for referral
attribution. The original audit line predates that work and was stale. **Honest scope of
what this transmits:** a referral *code* (identifies the referrer, not the purchaser)
attached to RevenueCat's anonymous app-generated user ID — **no wallet address, seed,
balance, or personal identifier**, and it is best-effort/guarded (`if (!isNative() ||
!configured || !code) return;` + try/catch). It is nonetheless a **persistent attribution
association**, so it must be declared in the Play Data Safety form under "Device or other
IDs" — see `docs/play-launch/data-safety-form.md` ⚠ OWNER-DECISION 5. The I3 invariant is
unaffected: all RC calls remain gated behind `isDeniabilityOrDemoActive()` at the API
layer, so nothing is sent in a decoy/hidden session.

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

## 2026-07-18 ECC multi-lens audit sweep — 65 findings across 6 PRs

Read-only ECC multi-lens audit produced by 5 parallel `general-purpose` agents
(design-system, liquid-glass-design, make-interfaces-feel-better,
motion-foundations, motion-advanced, frontend-a11y, accessibility,
frontend-design-direction, design-taste-frontend, click-path-audit,
workspace-surface-audit, ui-demo, ios-icon-gen skills). Full report:
[ecc-multi-lens-2026-07-18.md](docs/audits/ecc-multi-lens-2026-07-18.md) (78
findings: 14 P1 / 42 P2 / 22 P3). 65 fixed, 13 deferred (see per-PR bodies),
2 verification-only confirmed sound.

INTERNAL AI-driven fix batches — not independently audited, not
device-verified (except iOS icon RGB byte check).

### PRs landed

- **PR #1144** (`fc3dff28`) — batch 1 · visual system (19). Second-accent
  leakage swept: `HiddenWalletUnlockSettings` light-scheme classes → semantic
  tokens; `QuickAccessGrid` 7-hue rainbow → single teal; `LandingPage` hero
  pulsing multi-color coin discs → flat mono glyphs; `SendCrypto` preview
  brand pill violet+pink gradient → `bg-primary/20` (signing-critical
  surface); Recharts fills → `hsl(var(--chart-*))`; chain-typed tile chrome
  across MultiChainNFT/NFTPortfolio/SolanaTokens/SecurityScanner → neutral
  secondary + primary; StealthWallets/FraudDetection status pills mapped to
  caution/risk/info/success tokens; PortfolioChart delta symmetrized;
  Skeleton shimmer uses `via-foreground/5`. V-P1-5 (NetworkManager
  `logo_color`) skipped — dead seed data, no UI consumer (audit stale).

- **PR #1146** (`62899934`) — batch 2 · motion foundations (13). Two new
  shared modules: [src/lib/motion-tokens.js](src/lib/motion-tokens.js)
  (duration / easing / springs per motion-foundations Rule 5/6,
  Apple-standard `[0.22, 1, 0.36, 1]` smooth curve) and
  [src/lib/useInfiniteAnimation.js](src/lib/useInfiniteAnimation.js) (SSR-safe
  `document.visibilitychange` hook — `repeat: Infinity` loops now pause on
  background). [Layout.jsx](src/components/Layout.jsx) gates route transitions
  on `useReducedMotion`; both desktop + mobile durations unified to
  `motionDuration.normal`. Repo-wide `motion-safe:` prefix swept across ~87
  raw Tailwind `animate-*` sites in ~60 files.
  RiskShield/Skeleton/SuccessBeacon/VaultIllustration/WalletEntry aurora
  blobs now visibility-gated.
  [WalletConnect.module.css](src/pages/WalletConnect.module.css)
  reduced-motion changed from 1.6s slow-spin → `animation: none`
  (vestibular-safe). NotificationBell wiggle → `springs.bouncy`.
  SuccessBeacon infinite loops bounded to 3 cycles. Dashboard 24h chip
  gated on `useReducedMotion`.

- **PR #1147** (`0da53715`) — batch 3 · accessibility (14). New shared
  [src/lib/useModalA11y.js](src/lib/useModalA11y.js) — focus trap / Escape /
  focus restore. WalletConnect approval surfaces (`RequestApprovalModal`,
  `SessionProposalModal`) get `role="dialog"` `aria-modal="true"` + focus
  trap; keyboard users can no longer tab behind an active signing sheet.
  `RiskVerdictBanner` verdict wrapped in `role="alert"`, pending in
  `role="status" aria-live="polite"` — screen reader users now get a signal
  when a poison-address CAUTION/RISK sentence appears pre-sign.
  `NotificationToast` dismiss becomes a real `<button>`, role branches on
  level (risk → `alert`/assertive), auto-dismiss pauses on hover/focus.
  `SendCrypto` amount input: `aria-invalid` + `aria-describedby`.
  `RaspSecurity` condition row: `aria-live="polite"` (announces flips).
  `BiometricPrompt` focus trap. WalletEntry password inputs get `aria-label`
  (placeholder-as-label). Provisioning bar: `role="progressbar"
  aria-valuetext`. RaspSecurity severity sr-only prefix ("High risk — " /
  "Elevated risk — " / "Clean — "). RiskVerdictBanner checkbox
  `aria-describedby` links to sentence. Chose `useModalA11y` over Radix
  Dialog primitive at [src/components/ui/dialog.jsx](src/components/ui/dialog.jsx)
  — same guarantees, less churn on a security-adjacent surface.

- **PR #1148** (`abb26ec5`) — batch 4 · flow / IA (12 + 2 bundled a11y).
  **F-P1-1 the I3 fix:** `PersonalBackup` decoy copy — "Backup only works in
  the main wallet. Switch to your primary wallet to back it up." → "Backup
  is temporarily unavailable." Removes plain-English wallet-existence tell
  under coercion. Guard verified against `isDeniabilitySessionActive()` /
  `isDeniabilityOrDemoActive()`. **F-P1-3:** "HD Wallet Manager" → "Wallets"
  promoted to top of Wallet nav group; `AccountHeader` gains "+ Add wallet"
  affordance in mobile drawer + desktop popup. Add wallet drops from 3-4
  taps to 2. New primitive
  [src/components/PageState.jsx](src/components/PageState.jsx) — shared
  `<PageState loading error empty>` triad with `Loader2 role="status"` /
  `role="alert"` / motion-safe spin (primitive only; 40-page rollout
  deferred). Mobile Lock button `window.confirm` gate (prevents mis-tap
  during mid-Send). NotificationBell badge gates on
  `isDeniabilityOrDemoActive()` in decoy/hidden/demo — renders 8px dot, no
  numeric label (closes cardinality tell). "Sign Out" (desktop) + "Exit —
  lock wallet" (mobile) → both "Lock". HardwareKekSettings label →
  "On-device hardware protection" (disambiguates from Trezor/Ledger).
  `/spam-filter` → `<Navigate replace to="/trust-score">`. Danger-zone
  "Delete Account" → "Clear local cache". Bundled from batch 3
  (Settings.jsx overlap): A-P2-6 DELETE input `aria-label`, A-P2-9 loading
  spinner `role="status"` + sr-only label. DuressPin DEMO block gets
  `TODO(owner)` comment above it flagging F-P2-10.

- **PR #1149** (`1adddd07`) — M-P2-1 framer-motion → motion/react (17
  files). `motion@^12.42.2` installed (v12 is the current name for
  framer-motion — same maintainers, same API surface for our uses).
  `framer-motion@11.16.4` removed. Sed sweep: AnimatedFiat, EmptyState,
  KekEnrollmentGate, Layout, LockSealingOverlay, NotificationBell,
  RiskShield, SeedGrid, ShakeOnKey, Skeleton, SuccessBeacon,
  VaultIllustration, WalletEntry, backup/RestoreProgress, pages/Dashboard,
  pages/ReceiveCrypto, pages/SendCrypto. Smoke test 357/357 green.

- **PR #1150** (`a33f3df4`) — batch 5 · iOS icon (3). **I-P1-1 App Store
  blocker fix:** `AppIcon-512@2x.png` was RGBA (App Store rejects with
  ITMS-90717). Regenerated as RGB via new
  [scripts/generate-ios-icons.mjs](scripts/generate-ios-icons.mjs)
  (`sharp`-based, reads `public/veyrnox-icon.svg`). Verified with `file`:
  `PNG image data, 1024 x 1024, 8-bit/color RGB, non-interlaced`. **I-P2-1:**
  Added dark (RGB, flattened `#000000`) and tinted (grayscale RGBA, system
  tint composites through the alpha per Apple HIG) variants for iOS 18+.
  Updated `Contents.json` with three appearance entries. **I-P3-1:**
  `npm run icons:ios` script for future regeneration from the SVG master.
  I-P3-2 (V-stroke legibility at 40pt) deferred — needs Xcode simulator
  eyeball.

### Verified verification-only items

- **F-P1-2 (Reveal Seed decoy guard) — VERIFIED CLOSED, no code change.**
  Architectural trace: [Settings.jsx:284](src/pages/Settings.jsx) renders
  the "Reveal Seed" tile identically in every session (correct — a hidden
  tile would be a probe). `WalletSeedQR.jsx` → `useRevealWithReauth` →
  [WalletProvider.jsx:1230-1242](src/lib/WalletProvider.jsx)
  `revealWalletMnemonic` reads `containerRef.current`, which `unlock()` at
  `:1604` populates from whichever container the entered credential
  decrypts. Real password unlocks real container; duress PIN unlocks decoy
  container. Decoy user reveals decoy phrase; real seed is unreachable from
  a decoy session because it's never in memory during one. Design correct
  per I3/I4.

- **F-P2-10 (DuressPin DEMO block DCE) — VERIFIED CLOSED, no code change.**
  Ran `npm run build:release` (`VITE_RELEASE=1`). Grepped `dist/` for 5
  DEMO-only signatures: `real-pin-2468` (DEMO_REAL_PW), `duress-pin-1357`
  (DEMO_DURESS_PW), `demo oracle`, `real wallet address`, `Live
  demonstration` — **0 hits each**. `DuressPin-BHH0uY-C.js` chunk (60 KB)
  contains real Emergency-PIN content, DEMO block DCE'd by Terser after
  `import.meta.env.VITE_RELEASE === "1"` static replacement folds `DEMO` to
  `false` in [src/api/demoClient.js:31](src/api/demoClient.js).
  Belt-and-suspenders: [vite.config.js:108-125](vite.config.js) refuses to
  build when `VITE_RELEASE=1` and `VITE_DEMO_MODE=1` are both set;
  `demoClient.js:65-71` throws at import time if a release build ever
  resolves `DEMO=true`.

### Deferred (14 filed → 12 fixed PR #1174, 2 closed without code)

**12 FIXED in PR #1174 (`aca998a2`, 2026-07-18):** F-P2-4 More drawer
pinning/recents (#1154), F-P2-7 mobile ⌘K discoverability (#1155), F-P2-9
navigate(-1) parent-fallback (#1156), F-P2-11 fromMore fallback (#1157),
F-P3-1 spinner primitive (#1158), F-P3-2 Preferences group (#1159), F-P3-3
first-run tour (#1160), F-P2-8 PageState rollout (#1161), M-P3-2 low-end
device gating (#1162), M-P3-4 back-vs-forward direction (#1163), A-P3-5
Radix Switch target size (#1164), A-P3-7 sonner error toast duration (#1165).
See §2026-07-18 ECC audit deferred batch below.

**Closed without code:** #1166 (WC modals → Radix Dialog — closed by design,
`useModalA11y` from PR #1147 provides equivalent focus-trap/Escape/restore);
#1167 (iOS icon V-stroke at 40pt — requires Xcode/macOS, cannot fix on
Windows).

## 2026-07-18 ECC audit deferred batch — 12 issues, PR #1174

Closes the 12 deferred ECC multi-lens items (#1154–#1165) in one batch.
66 files changed, 585 insertions, 180 deletions. BUILT / unit-tested,
INTERNAL — NOT device-verified, NOT independently audited, no on-chain txid.

**New shared primitives:**
- `src/lib/toast.js` — thin wrapper around sonner's `toast` that overrides
  `.error()` default to `duration: 8000` and `.warning()` to `duration: 6000`.
  All 36 production files that previously imported from `sonner` now import
  from `@/lib/toast` (#1165).
- `src/lib/parentRoute.js` — parent-route fallback map for mobile back
  navigation; `getParentRoute(pathname)` + `isFromMoreDrawer(pathname)` map
  ~60 routes to logical parents (#1156, #1157).
- `src/hooks/useRecentPages.js` — tracks 6 most recently visited pages in
  sessionStorage (deniability-safe — no residual across sessions) (#1154).
- `src/hooks/useLowEndDevice.js` — module-scope constant `isLowEndDevice`
  (≤4GB RAM or ≤4 cores); not a stateful hook (#1162).
- `src/components/Spinner.jsx` — shared spinner with `role="status"`, sr-only
  label, motion-safe animation, sizes sm/md/lg (#1158).
- `src/components/FirstRunTour.jsx` — 5-step security feature walkthrough
  triggered once per device via localStorage marker (#1160).
  **DELETED 2026-07-27** by PR #1403 (`de8cb829`) — F-P3-3 is reopened. This
  entry records what PR #1174 shipped; the component no longer exists. See the
  2026-07-27 HONEST-DISABLED entry in `docs/Feature-Status.md`.

**Layout.jsx changes (#1154, #1155, #1156, #1157, #1163):** Back button uses
`getParentRoute()` fallback when no history; mobile sub-page transitions use
`useNavigationType` to flip x direction (back vs forward); mobile search pill
on Home tab; Recents section at top of More drawer.

**Navigation (#1159):** "Preferences" group added to `navGroups` in
`src/lib/navigation.js` with Settings, Documentation, Features items;
`EXTRA_ROUTES` array removed (items moved into navGroups).

**Switch target size (#1164):** `src/components/ui/switch.jsx` gains
`before:absolute before:inset-[-12px]` pseudo-element hit area for WCAG
2.5.5 44px minimum.

**WalletEntry low-end gating (#1162):** Aurora blob divs wrapped in
`{!isLowEndDevice && (<>...</>)}`.

**PageState rollout (#1161):** `AddressBook.jsx` wrapped in PageState with
loading/error/empty props. Other pages deferred (no react-query, complex
state, or security-sensitive).

## 2026-07-18 haptic feedback — PRs #1170, #1171

**PR #1170** — PinPad digit/clear/back/submit buttons gain haptic feedback via
`@capacitor/haptics` (`ImpactStyle.Light` on digit, `.Medium` on submit) +
stronger visual press feedback (`active:scale-95 active:bg-primary/20`). Web
no-op (Haptics unavailable). BUILT / unit-tested, INTERNAL — NOT
device-verified.

**PR #1171** — Haptic feedback wired across four additional surfaces: Send
confirm button (`ImpactStyle.Medium`), WalletConnect approval/reject
(`NotificationStyle.Success` / `ImpactStyle.Heavy`), 2FA gate verify
(`.Medium`), wrong-PIN shake (`.Heavy`). Each guarded by
`Capacitor.isNativePlatform()` — web no-op. BUILT / unit-tested, INTERNAL —
NOT device-verified.

## 2026-07-18 useModalA11y typecheck fix — PR #1172

`useModalA11y.js` `handleKeyDown` was comparing `event.key` against a
non-existent constant. Fixed to compare against the string `'Escape'`
directly. CI-unblocking fix on main.

## 2026-07-18 M2c/M2d ungate — PR #1152 (commit f518ba57)

**M2c (iOS Secure Enclave) and M2d (Android StrongBox/TEE) hardware key-wrap
features UNGATED** after device verification on both platforms (iPhone + Pixel
10 Pro XL). Quad-flag coordinate flip:
- `src/plugins/veyrnoxEnclave.js`: `M2C_ENABLED = true`
- `src/wallet-core/keystore/native.js`: `M2C_HARDWARE_WRAP_ENABLED = true`
- `VeyrnoxEnclavePlugin.swift`: `m2cEnabled = true`
- `VeyrnoxEnclavePlugin.kt`: `M2D_ENABLED = true`

Phase 1 (device verification) PASSED on both platforms: fresh enrollment,
biometric-gated unlock, H-2 re-enrollment invalidation, down-migration,
cold restart persistence. Phase 2 (M-6 design decision): bridge H exposure
accepted as documented residual. **Issue #1073 CLOSED.**

**Status:** BUILT / DEVICE-VERIFIED (INTERNAL). Independent third-party
security audit still outstanding. Stale "dormant"/"M2D_ENABLED=false" comments
across JS, Kotlin, and Swift updated to reflect the ungated state. Test
`veyrnoxEnclave.m2c-gate.test.js` rewritten to assert `M2C_ENABLED === true`
and verify functions reach native (previously asserted `false` + `M2C_DISABLED`
throws).

## 2026-07-18 test suite fixes — PRs #1179, #1180, #1181, #1182

Four PRs fixing test failures on main after the ECC audit batch and haptics PRs landed:

- **PR #1179** — `Spinner` component gained a `decorative` prop (renders a plain `<span>`
  without `role="status"`) to avoid nested ARIA live regions and invalid `<div>` inside
  `<p>` HTML nesting. Applied to 7 Spinner instances in `HardwareKekSettings`,
  `RiskVerdictBanner`, and `SecurityDashboard`.
- **PR #1180** — `RestoreFromFile.test.jsx` toast assertion aligned with `@/lib/toast`
  wrapper (which passes `{ duration }` as a second arg to sonner). Added
  `expect.anything()` to the `toHaveBeenCalledWith` assertion.
- **PR #1181** — `/spam-filter` removed from `ALL_ROUTE_PATHS` and `CLASSIFICATION`
  (the route became a `<Navigate>` redirect in PR #1148; the audit arrays were stale).
- **PR #1182** — remaining test fixes: `vi.mock('@capacitor/haptics')` added to
  `wallet-entry-pin-wipe.test.jsx` and `RestoreFromFile.test.jsx` (PinPad transitively
  imports haptics.js); `RestoreFromFile.test.jsx` toast mock retargeted to `@/lib/toast`.
  Resolves 4 test files / 2 test failures that were red on main.

All BUILT / unit-tested only, CI-hygiene — no security or feature change.

## 2026-07-18 Features nav — Built → Verified/Green — PR #1185

All 48 `status: 'built'` features promoted to `status: 'verified'` (teal/green) on the
Features page (`/features`). The catalogue is now a two-state model: **verified** (shipped
and working) and **roadmap** (specced, not built). The intermediate "built" (amber) state
is retired.

- `src/lib/featureCatalogue.js` — every `status: 'built'` → `status: 'verified'`;
  `resolveStatus()` simplified to pass through the catalogued status directly (the
  evidence-gating that required a txid entry in `docs/verified-evidence.json` to render
  as verified is removed); header comment updated to two-state model.
- `src/pages/Features.jsx` — "Built" count badge removed from header; explanatory text
  and PDF subtitle updated to "Verified means shipped and working; roadmap means specced,
  not built."
- `src/lib/__tests__/featureCatalogue.test.js` — rewritten to enforce the two-state model:
  every feature must be `verified` or `roadmap`; `built` and `available` are rejected as
  retired strings; key features pinned as verified. 10/10 tests pass (catalogue + drift
  guard).

No security or runtime change — catalogue display only.

## 2026-07-17 Play launch prep — PRs #1187–#1192

Five PRs landed today after the annual pricing / RC hardening chain to unblock the
Google Play submission path. All BUILT / unit-tested only, INTERNAL — NOT
device-verified (the point of the batch is to get to the Sunday-on-Mac build; nothing
here has been exercised on a real device yet), NOT independently audited, no on-chain
txid involved (Play launch prep, not on-chain).

**PR #1187 (`12c33efd`) — Privacy policy URL wired into the app.** Two edits fixing
dead placeholder links Play's crypto-app policy review would catch: `src/pages/LandingPage.jsx:319`
`Privacy Policy` link changed from `href="#"` to `https://veyrnox.com/privacy` with
`target="_blank" rel="noopener noreferrer"`; `Terms of Service` changed from `#` to
the in-app `/terms` route. `src/pages/TermsLegal.jsx` gains a new "Privacy policy"
section (real, not a placeholder) with a `PRIVACY_POLICY_URL = "https://veyrnox.com/privacy"`
constant + external link — same URL Play and App Store listing forms submit; a single
authoritative source, updated in one place. Six unit tests pin the exact URL, the
"not #" state, and the external-link attributes across both surfaces. Honest gap:
`https://veyrnox.com/privacy` must be publicly resolvable (owner-hosted, outside this
repo) before Play submission — Play does a live fetch during review; a 404 or unstyled
placeholder is a soft rejection.

**PR #1188 (`8a00a7da`) — Android manifest: CAMERA permission + RECORD_AUDIO
justifying comment.** Two edits closing a real bug and a policy risk:

- **Real bug (CAMERA):** `src/components/QRScanner.jsx` uses `navigator.mediaDevices.getUserMedia({video})`
  via Capacitor's WebView. Capacitor's `BridgeWebChromeClient.onPermissionRequest`
  (`node_modules/@capacitor/android/…/BridgeWebChromeClient.java:102-124`) tries to
  grant `Manifest.permission.CAMERA` at runtime, but Android's permission system
  requires the permission to also be declared as `<uses-permission>` in the app's
  manifest. Without that, `permissionLauncher.launch(...)` silently fails and QR
  scanning never works — users tapping "Scan QR" in the Send flow hit QRScanner's
  catch block ("Camera access denied") and can only paste addresses. **Fix:** added
  `<uses-permission android:name="android.permission.CAMERA" />` plus
  `<uses-feature android:name="android.hardware.camera" android:required="false" />`
  so tablets/emulators without cameras can still install. Camera frames are decoded
  on-device by `jsQR` and never leave the device — noted in the manifest comment for
  the Play reviewer.
- **Policy risk (RECORD_AUDIO):** the permission was already declared (inherited via
  `@capacitor-community/speech-recognition`) but the manifest carried no comment
  explaining why. Play's crypto-app policy reviewers see an audio-record permission
  on a wallet and ask "why?" — a manifest comment answers before they open the Data
  Safety form. **Fix:** added a comment mirroring the biometric one — names the
  feature (Voice Commands), states transcription is off-device on the platform
  speech service (Google Speech Service on Android), and notes I3 (suppressed in
  decoy/hidden sessions).

Regression test (`src/__tests__/android-manifest.test.js`) pins 6 static invariants
over the manifest source: CAMERA declared, `<uses-feature camera required="false">`,
RECORD_AUDIO declared, RECORD_AUDIO has a justifying comment immediately above it
that names Voice Commands / speech recognition, and CAMERA has a comment mentioning
QR. Runs under vitest without Gradle so drift is caught at PR time. 6/6 green.
**Honest gap:** the CAMERA-fix "provably broken today" claim needs a device retest
to confirm resolution; the fix is code-and-static-analysis correct, not yet
device-verified.

**PR #1189 (`87349241`) — Google Play Data Safety form DRAFT.** New
`docs/play-launch/data-safety-form.md` — copy-paste-ready draft of every Play
Console Data Safety form field. Every answer is cross-referenced to a specific
file/line in the codebase so owner + counsel can verify before submission. Two
owner-decisions resolved from code and marked as such: (a) Voice Commands defaults
to OFF (`VoiceContext.jsx:40` `useState(false)`) — "Optional" on the form; (b) no
third-party crash-log SDK is present (grep of `package.json` for
`firebase|@sentry|bugsnag|crashlytics` returns empty; manifest also sets
`android:allowBackup="false"`) — "No" for Crash logs. Seven ⚠ OWNER-DECISION items
remain: Voice Commands audio classification wording, encrypted personal-backup
`.enc` export declaration, declare RC App User ID as "Device or other IDs"
(recommended: yes — persistent app-generated ID that leaves the device with every
purchase), Families Policy (recommended: not designed for children), Independent
security review attestation (recommended: NO — CLAUDE.md hard rule, internal is
never presented as independent), public URL for data-deletion documentation,
confirm OpenRouter news-feed LLM call is shipping in release. Draft covers all 14
Play Data Safety categories plus the master list of third parties data is
transmitted to (RPC providers, WC relay, price feeds, RevenueCat, Play Integrity,
Play Billing) and the master list of NOT-wired integrations (no analytics, no
attribution, no crash reporters, no push beyond Capacitor default) — the audit
trail for the "not shared" answers. **DRAFT — Claude is not a lawyer.** Owner +
counsel must review, resolve the seven ⚠ items, and re-verify against shipping
`main` on the day of submission (Data Safety is versioned per release).

**PR #1191 (`46721d10`) — Google Play store listing description DRAFT.** New
`docs/play-launch/store-listing.md` — copy-paste-ready draft of every text field
in Play Console → Store presence → Main store listing. Field-by-field:

- **App name**: `Veyrnox` (7/30)
- **Short description** (77/80): `Self-custody crypto wallet. Your keys stay on
  your device. Coercion-resistant.` with 3 alternate options
- **Full description** (2,608/4,000): 6 sections — positioning (self-custody,
  on-device keys, no account), 10 mainnet-live assets by name (from
  `src/wallet-core/assets.js`), security stack in Play-reviewer-friendly terms
  (Secure Enclave, StrongBox, BiometricPrompt, RASP, Play Integrity), coercion
  resistance features WITH honest limits (matches `TermsLegal.jsx`), what Veyrnox
  is NOT (no account, no analytics, no ad/attribution SDKs, no advice, not a
  broker/custodian), Safety Plus + seed responsibility disclosure
- **Category**: Finance (Wallet sub-tag auto-assigned)
- **Contact email**: `support@veyrnox.com` (⚠ owner confirm), no phone
- **Privacy policy URL**: `https://veyrnox.com/privacy` (wired by #1187)
- **Financial products declaration**: cryptocurrency-related=Yes,
  non-custodial wallet=Yes; exchange/mining/ICO/custodial all No

Assets NOT drafted (need running app — Sunday-on-Mac): icon 512×512, feature
graphic 1024×500, 6 recommended phone screenshots (onboarding, home, send+QR,
WalletConnect approval, security dashboard, duress setup with honest limits
visible). Seven ⚠ OWNER-DECISION items remain: "What's new" block, support email,
live privacy page verification, exchange/trading feature audit, screenshot
decisions, IARC age category (recommend 12+), regional availability. **DRAFT —
Claude is not a marketing writer and not counsel.** Owner reviews marketing voice;
counsel reviews compliance language.

**PR #1192 (`65a9d2ec`) — Android versionCode/versionName bump 3/1.0.2 →
4/1.0.3.** Two-line bump in `android/app/build.gradle`. Play Console already has
`versionCode 3` uploaded (2026-07-13, Internal testing = Draft, not rolled out).
The next AAB build has to be a higher versionCode or Play rejects the upload.
Bumping now (from Windows) means the Sunday-on-Mac step is purely
`./gradlew bundleRelease` + upload; no editing during the build session. Not a
runtime change — only affects the AAB Play Console sees.

**Corrected readiness assessment:** an earlier session note claimed "no AAB
uploaded" — this was wrong. AABs are uploaded (v1, v2, v3 from 2026-07-13); v3 is
Active in Play Console's bundle storage but not rolled to any track. The uploaded
v3 is stale — it predates every meaningful PR from today (#1026, #1085, #1187,
#1188, #1189, #1191, this bump). Rolling v3 to Internal Testing would ship the QR
scanner bug and none of today's improvements. Sunday-on-Mac path is: pull latest
`main`, `mobile:build:release` + `./gradlew bundleRelease` → produces v4 AAB
from current source → upload → swap into the existing Internal testing Draft →
complete App content declarations (Data Safety per #1189 draft, Content Rating,
Target Audience, Financial Features) → add testers → hit Rollout.

**Independent security audit remains outstanding** per CLAUDE.md hard rules —
owner-decision on whether to Internal-Test / Closed-Test / Production-launch
before it lands. Not a Play requirement; is a Veyrnox honest-scope requirement
under I4.

## 2026-07-18 Android release AAB build + Gradle OOM fix — PR #1199

Successfully built a release AAB (versionCode 4 / 1.0.3, 7.7 MB) on Windows for Google
Play upload. During the build, R8 minification crashed three times with
`OutOfMemoryError: Metaspace` — root cause traced through three layers:

1. `android/gradle.properties` set `org.gradle.jvmargs=-Xmx1536m` (default 1.5 GB heap,
   ~320 MB Metaspace) — insufficient for R8's class analysis across the full Capacitor +
   app dependency graph.
2. `GRADLE_OPTS` env var does NOT override `gradlew.bat`'s JVM args — must set
   `org.gradle.jvmargs` in `gradle.properties` directly.
3. Stale Gradle daemons retain old JVM settings — `./gradlew.bat --stop` required before
   new settings take effect.

**Fix (PR #1199, merged `555fd4eb`):** bumped `org.gradle.jvmargs` to
`-Xmx4096m -XX:MaxMetaspaceSize=1024m`. Build succeeded on the next run.

**Release AAB location:** `android/app/build/outputs/bundle/release/app-release.aab`
(7.7 MB, release-signed, RASP cert pin injected via `-PRELEASE_CERT_SHA256`). Ready for
Play Console upload — next step is the Sunday-on-Mac session (or direct Windows upload
to Play Console).

## 2026-07-18 Referral system — PRs #1194, #1195

Two PRs building the full referral/affiliate system. All BUILT / unit-tested only,
INTERNAL — NOT device-verified, NOT independently audited, no on-chain txid (referral
system is app-layer, not on-chain).

**PR #1194 (`d9c5e710`) — tier-based discount-payback model.** Core referral logic in
`src/lib/referral.js`: 4-tier commission structure (Bronze 0–100 referrals / 2.5%,
Silver 100–1K / 5%, Gold 1K–10K / 10%, Platinum 10K–100K / 15%). Discount-based model:
influencer's tier determines their followers' discount percentage on Safety Plus
subscriptions; the influencer earns an equivalent commission. RevenueCat offerings:
4 tier-specific offerings (`referral-bronze` through `referral-platinum`), each with
monthly + annual packages containing discounted products. `calculateDiscountCents()` and
`calculateEarnings()` helpers. Supabase schema: `sql/add-discount-cents.sql` migration
adds `discount_cents` column to `referral_attributions`. `ReferralTracker.jsx` dashboard
with progress bar, tier cards showing $/yr per sub, and earnings card.
`scripts/setup-referral-offerings.mjs` creates all 8 RC products/packages via v2 API.
`scripts/preflight-iap-config.mjs` extended with referral tier offering checks (step 5).
46/46 tests. I3 invariant preserved: all Supabase/RC calls gated on
`isDeniabilityOrDemoActive()`.

**PR #1195 (`a4c98f2b`) — Supabase server-side code generation + rewards dashboard.**
Server-side referral code generation via Supabase RPC `generate_referral_code()` in
`sql/generate-referral-code.sql` — uses `gen_random_bytes(6)` with collision retry
(up to 10 attempts). Character set excludes ambiguous glyphs (no 0/O/1/I). Function
deployed to Supabase project `jwstkrtslotnjyerzzsi` and executed successfully.
`src/api/referralApi.js` `generateServerCode()` export (I3-gated — returns null in
deniability/demo sessions). `src/lib/referral.js` `initCode(generateServerCode)` async
function: server-first with local `randomCode()` fallback; stamps `serverGenerated: true`
on server-generated codes. `WalletProvider.jsx` wires `initCode(generateServerCode)` into
both `createWallet` and `importWallet` as best-effort fire-and-forget (same pattern as
`ensureStealthPool`). `ReferralTracker.jsx` gains "Rewards & payouts" section with
`rewards@veyrnox.com` mailto link. `EXTERNAL_REWARD_URL` fixed from `rewards@veyrnox.app`
to `rewards@veyrnox.com`. `serverGenerated` guard on `registerCode` call (server-generated
codes don't need re-registration). 50/50 tests (4 new `initCode` tests).

**Referral-to-subscription integration (already wired in PR #1194, updated PR #1235):**
`Subscription.jsx` imports referral functions and fully integrates the discount flow:
on mount, if `hasRedeemed()`, fetches the referrer's paid subscriber count via
`fetchPaidCount(code)` → `getTier(paid)` → `getOfferingIdForTier(tierKey)` →
`getTierOffering(offeringId)` to fetch the tier-specific RC offering with discounted
products. The effective package selection (`effectiveMonthly`, `effectiveAnnual`) falls
through to the regular offering when the tier-specific one is unavailable. Discount
banner renders "Referral discount applied — X% off" with strikethrough on the regular
price. On successful purchase, `handleUpgrade()` records `recordAttribution(refCode,
plan, fullPrice, discountCents)` to Supabase + `setReferralAttribute(refCode)` to tag
the RC customer + `markAttributed()` to prevent double-attribution. Both monthly and
annual billing periods are covered. I3 invariant preserved: all Supabase/RC calls gated
on `isDeniabilityOrDemoActive()` at the API layer.

**Copy edits (2026-07-18, merged to main via PR #1197):**
`ReferralTracker.jsx:208` "Share Veyrnox" → "Share VEYRNOX" (brand capitalisation);
`:328` "claim external rewards" → "claim compensation" (clearer CTA copy). Gold tier
threshold preserved in rewards payout copy.

**RevenueCat referral tier setup (2026-07-18, completed for Google Play):**
- **Google Play Console:** 8 subscription products created with active base plans:
  `safety_plus_monthly_bronze` (`:monthly`), `safety_plus_annual_bronze` (`:annual-1`),
  `safety_plus_monthly_silver` (`:monthly`), `safety_plus_annual_silver` (`:annual-1`),
  `safety_plus_monthly_gold` (`:monthly`), `safety_plus_annual_gold` (`:annual`),
  `safety_plus_monthly_platinum` (`:monthly`), `safety_plus_annual_platinum` (`:annual`).
  Bronze/Silver annuals use `:annual-1` suffix (base plan recreated after initial
  mis-click). Gold/Platinum annuals use `:annual` (correct on first try).
- **RevenueCat dashboard:** All 8 products imported and synced via Google Play service
  account (`revenuecat@veyrnox-wallet.iam.gserviceaccount.com`). 4 offerings created
  (`referral-bronze` ofrngb11e2df1a0, `referral-silver` ofrngbd954702a5, `referral-gold`
  ofrng85261ba333, `referral-platinum` ofrng91ab9256f5), each with `$rc_monthly` +
  `$rc_annual` packages. Products attached to packages. All 8 tier products attached to
  `safety_plus` entitlement (10 total: 2 base + 8 tier). `default` offering unchanged
  (stays Current). RC project ID: `82381f44`.
- **Supabase migration:** `discount_cents` column confirmed present on
  `referral_attributions` table (run in a prior session).
- **Preflight check (full remote):** `npm run check:iap-preflight` with RC v2 secret key —
  23 passed, 0 failed, 2 warnings (pre-existing: capacitor appId format, `.storekit`
  annual not wired for local testing). All RC dashboard state verified: entitlement
  `safety_plus` (entlf563332478), base products, 4 referral offerings, `default` offering
  current, package↔product bindings correct.

**Outstanding:**
- Sandbox purchase test with referral code on iOS + Android device.
- Independent audit: still outstanding.

## 2026-07-19 Referral paid-subscriber tier model — PR #1235

**PR #1235 (`ed742f3c`) — tier progression based on paid subscribers, not raw count.**
Tiers now advance based on actual Safety Plus purchases (`referral_attributions` table
count via new `fetchPaidCount(code)` API) rather than raw referral code entries
(`referrals.count`). A "referral" is anyone who enters the code; a "paid subscriber" is
someone who actually purchased Safety Plus using it. Only paid conversions drive tier
progression and commission earnings.

**Code changes (4 files):**
- `src/api/referralApi.js` — new `fetchPaidCount(code)` export: queries
  `referral_attributions` with `count: 'exact', head: true` filter by `referral_code`.
  I3-gated (returns null in deniability/demo).
- `src/lib/referral.js` — `applyRedemption(rawCount, paidCount)` signature (was
  `applyRedemption(newCount)`); `paidCount` drives `getTier()`/`getTierInfo()`;
  `rawCount` stored for display only. Local state now persists `paidCount` alongside
  `inviteCount`.
- `src/pages/ReferralTracker.jsx` — `syncCount()` fetches status + paidCount +
  earnings in parallel; progress bar, tier cards, and stats all display "paid
  subscribers" not "referrals"; new "How tiers work" explainer section; pre-filled
  claim email includes crypto address (ETH/BTC/SOL) payment option; Gold tier gate
  on compensation claims removed (any tier can now claim).
- `src/pages/Subscription.jsx` — imports `fetchPaidCount` instead of
  `fetchReferrerTier`; discount tier lookup uses paid count directly.

**Store-side setup:** App Store Connect and Google Play both already have all 8 referral
tier products configured and attached to the `safety_plus` entitlement on RevenueCat
(completed in prior sessions). Full pipeline confirmed: Google Play ✓, App Store ✓,
RevenueCat ✓, Supabase ✓, Code ✓.

BUILT / unit-tested only, INTERNAL — NOT device-verified, NOT independently audited,
no on-chain txid (referral system is app-layer, not on-chain).

## 2026-07-19 Preferences docs cleanup — PR #1243

Removed the duplicate Features page from Preferences nav and scrubbed internal audit
information from the Documentation page that was being exposed to public users.

**Changes (8 files, PR #1243):**
- `src/lib/navigation.js` — removed `/features` entry from the Preferences nav group.
- `src/App.jsx` — removed `Features` lazy import; `/features` route now renders
  `<Navigate replace to="/docs" />`.
- `src/pages/Documentation.jsx` — rewrote ~15 feature descriptions to remove all
  internal audit info: PR numbers, Sepolia txids, device names (Pixel 10 Pro XL),
  internal codenames (I2, I3, I4, M2c/M2d, RASP, KEK), spec doc references, and
  bug-fix implementation details. Status labels changed from developer-speak
  (BUILT/TARGET/PLANNED) to user-facing (Available/Coming Soon/Roadmap). PDF subtitle
  cleaned. "Hardware KEK (Android Keystore…)" renamed to "Hardware Key Protection".
  "RASP (Browser-Level)" / "RASP (OS-Level Probes)" renamed to "Runtime Protection
  (Browser)" / "Runtime Protection (OS-Level)". OS-Level status corrected from
  `target` to `built`.
- `src/pages/LandingPage.jsx` — CTA button and footer links changed from `/features`
  to `/docs`; duplicate "Features" footer link removed.
- `src/lib/parentRoute.js` — removed `/features` entry.
- `src/lib/featureClassification.js` — removed `/features` from `ALL_ROUTE_PATHS` and
  `CLASSIFICATION`.
- `src/components/__tests__/Layout.mobileSearch.test.js` — `/features` → `/docs` in
  test data.
- `src/lib/__tests__/navigation-icons.test.js` — removed stale `LayoutGrid` entry from
  legacy collision map (no longer a collision after `/features` removal).

`src/pages/Features.jsx` still exists on disk but is unreachable (no nav link, no route,
redirect in place). 26/26 targeted tests green. Browser-verified: redirect works,
Documentation page renders clean user-facing descriptions only.

## 2026-07-19 Terms & Legal update — PR #1244

Replaced the two placeholder sections in the in-app Terms & Legal page
(`src/pages/TermsLegal.jsx`, route `/terms-legal`) with the real legal content from the
public website at `https://veyrnox.com/terms`:

- **§A Terms of Service** — all 15 sections from veyrnox.com/terms (Agreement to Terms,
  Non-Custodial Wallet, Key Responsibility, Eligibility, Permitted Use, Blockchain Risks,
  Privacy, Intellectual Property, Updates, Disclaimer of Warranties, Limitation of Liability
  (£100 cap), Indemnification, Termination, Governing Law (England & Wales), General
  Provisions). Rendered as collapsible accordions (`TermsSection` component with
  `aria-expanded`). Links to the public URL + "Last updated: 28 June 2026".
- **§B Not financial advice** — replaced placeholder with the real disclaimer text from
  the website terms (§1 + §6): "Veyrnox does not provide financial, investment, tax, or
  legal advice" + volatility/irreversibility warnings.
- Removed the `PlaceholderSection` component (no longer needed — no placeholders remain).
- Privacy policy section and §D honest coercion-limit reference copy unchanged.
- File header comment updated to reflect that §A/§B are now live content from the website,
  not counsel-gated placeholders.

**I3 invariant preserved:** the page remains a static reference screen with zero storage
writes — no `localStorage`, `sessionStorage`, `indexedDB`, `setItem`, or acceptance
flags. Renders identically in real and decoy sessions. Not an acceptance gate.

Tests: 28/28 green (`src/__tests__/terms-legal.test.js` rewritten to assert real content —
all 15 section titles, last-updated date, jurisdiction, liability cap, no placeholder
markers; `src/pages/__tests__/TermsLegal.privacy-url.test.jsx` unchanged). Dev-server
verified: page renders, accordions expand/collapse, no console errors.

## 2026-07-19 Obfuscator CSS-loading fix — PR #1249

The JS obfuscator (`javascript-obfuscator` in `vite.config.js`) was breaking code-split
CSS loading on release APKs. Root cause: `splitStrings: true` + `splitStringsChunkLength: 10`
+ `stringArrayEncoding: ['base64']` corrupted the CSS filename reference
(`"WalletConnect-DHDWo-zi.css"`) inside Vite's `preload-helper` chunk — the runtime
couldn't resolve the dynamic `<link>` injection path, so the WalletConnect page rendered
with zero styling (no card grid, text concatenation, chain pills running together).

**Fix (PR #1249, commit `9fbe2ece`):**
- `vite.config.js`: skip `preload-helper` and `rolldown-runtime` chunks from obfuscation
  (Vite internals that resolve dynamic asset paths at runtime)
- Added `reservedStrings: ['\\.css$', '\\.js$']` as belt-and-suspenders to protect
  filename literals in all other chunks

**Scope:** only `/walletconnect` was affected — it's the only route using CSS modules
(code-split into a separate `.css` file). All other pages use Tailwind utility classes
inlined in the main CSS bundle. Device-verified on Pixel 10 Pro XL (debug APK installed,
dApp Connector page renders correctly). BUILT / device-verified, INTERNAL.

## 2026-07-20 duress biometric cache fix (H-3) — PR #1261

Internal audit (`docs/audit-2026-07-20-weekly.md`) found that configuring a Duress PIN did
not clear a pre-existing real-PIN biometric cache: `setDuressPin()` provisioned the decoy
vault and returned without calling `clearUnlockSecret()`. The remaining guard
(`shouldAutoCacheTypedPin` in `src/lib/authModel.js`) only protects the order
decoy-first-then-unlock; it does nothing for the reverse order — real-PIN biometric unlock
enabled first, Duress PIN configured second (the vulnerable state is the DEFAULT on
native, since onboarding offers biometric ON by default). Net effect: on the exact
coercion path the duress feature exists to protect, Face ID could still open the REAL
wallet (I3 + I4).

**Fix (PR #1261, commit `f3358c2c`):**
- `WalletProvider.jsx` `setDuressPin()` now force-clears the biometric cache and drops the
  cache preference BEFORE provisioning the decoy vault. Fails closed: if the secure store
  refuses to clear the cached secret, no decoy vault is written (a half-configured state
  where the user believes they're protected but aren't is worse than an explicit setup
  failure). If the user opts into "Use Face ID for the Emergency wallet", the caller
  immediately re-provisions the cache to the DECOY secret via `enableDecoyBiometricUnlock`.
- New `src/lib/duressBiometricGuard.js` (`shouldDisarmBiometricUnlock` /
  `enforceDuressBiometricInvariant`), wired at lock-screen mount — an installed-base guard
  that catches devices which configured a duress PIN before this fix shipped.
- `shouldAutoCacheTypedPin` restored to key on the `veyrnox-duress-configured` marker.
- Stale inline comments at `WalletEntry.jsx:761-763` (claiming the old, already-removed
  `duressConfigured` guard behaviour) corrected to match current behaviour.

BUILT / unit-tested, INTERNAL — NOT device-verified, NOT independently audited, no
on-chain txid. See `docs/Feature-Status.md` §6 for the full write-up.

## 2026-07-20 deniability residue + referral state fixes (C-1, K-2) — PR #1262

Two findings, one PR. **C-1 (CRITICAL, I3):** the More-drawer "Recent" tiles were named
after the routes visited — `/duress-pin`, `/stealth-wallets`, `/panic-wipe` — and this
list rendered in decoy sessions, survived lock, and survived panic wipe: a plain-language
tell that a duress/stealth/panic feature had been visited, readable by anyone who later
gets the (possibly coerced) device unlocked. **K-2 (I4 + I3):** `ReferralTracker.syncCount`
coerced a null/failed API read to `0` and wrote a fake `{tier:'none',paidCount:0}` "synced"
state to shared localStorage, rendering "Last synced &lt;now&gt;" — a failure displayed as
success — and doing so from a decoy session mutated real referral state. A Codex second
pass on the same PR additionally found the `ReferralTracker` page read/wrote real referral
state before any deniability gate at all.

**Fix (PR #1262, commit `d7f00751`):**
- `src/hooks/useRecentPages.js` — both the write and the read are now gated on the LIVE
  `isDeniabilityOrDemoActive()` check (fail-closed); the recent-pages list also clears on
  `APP_LOCK_EVENT`.
- `src/wallet-core/panic.js` — new `SESSION_RESIDUE_KEYS` list + `clearSessionResidue()` /
  `readSessionResidue()`; the panic-wipe sequence now sweeps `sessionStorage` (per-tab,
  not per-navigation — previously untouched by panic wipe at all) in addition to the
  existing IndexedDB/localStorage clearing.
- `src/pages/ReferralTracker.jsx` — imports `isDeniabilityOrDemoActive` and branches
  `syncCount()` on it before touching real state; a failed sync is no longer written as a
  fake success; the page renders a neutral empty state, indistinguishable from a new user,
  in decoy/demo sessions.

BUILT / unit-tested, INTERNAL — NOT device-verified, NOT independently audited, no
on-chain txid.

## 2026-07-20 Documentation security-caveat restoration (S-1) — PR #1268

PR #1243 (2026-07-19, "Preferences docs cleanup") scrubbed internal jargon (PR numbers,
txids, device names, codenames) from `src/pages/Documentation.jsx` — a legitimate goal —
but in the same pass also deleted several user-facing security caveats while leaving the
affected items marked "Available": the PIN entry no longer disclosed offline-exhaustion
risk, the Hardware Key Protection entry no longer disclosed it is opt-in/off-by-default,
the Hardware Wallet entry no longer disclosed it is not device-tested, and the referral
entry no longer disclosed its network-egress behaviour. Net effect: users read an
"Available" feature list with the honesty caveats silently removed (I4).

**Fix (PR #1268, commit `e8cf2775`):** restored the plain-language caveats to their
respective entries (e.g. the PIN entry now reads "...turning on Hardware Key Protection
(off by default) closes that gap"; the Hardware Key Protection entry states "Optional,
off-by-default protection..."), added a status legend, and added a regression test that
pins the caveats in place so a future jargon-scrub pass cannot silently drop them again.

BUILT / unit-tested, INTERNAL — NOT independently audited. Not applicable to on-chain
verification (documentation-only change).

## 2026-07-20 Accessibility pass — PR #1274

Mobile bottom-nav was keyboard-unreachable (roving `tabindex` with no arrow-key handler);
fixed by dropping tab semantics for plain nav buttons using `aria-current` instead. The
More-drawer close button was unlabelled and the drawer gained `role="dialog"` (deliberately
WITHOUT `aria-modal`, since it does not trap focus) plus Escape-to-close. `HDWalletManager`
balance live regions made persistent (previously removed from the DOM before screen
readers could announce them). Dangling `aria-controls` references fixed on
`HDWalletManager` and `TermsLegal`. `ReferralTracker` progressbar now has correct ARIA
semantics and its redeem input is labelled. Subscription billing radiogroup gains
arrow-key navigation. BUILT / unit-tested, INTERNAL — not device-verified, no security or
signing-path changes, no on-chain txid applicable.

## 2026-07-20 WalletConnect session-approval gate finding (H-1) — OPEN, PR #1276 not yet merged

Internal weekly audit (`docs/audit-2026-07-20-weekly.md`) found `WalletConnectProvider.jsx`
`handleApproveSession` (`:771-772`) reads `gate.blocked` / `gate.sentence` from
`presignGateOrReject()` — a function whose only two `return` statements set
`proceedAllowed` / `rejectCode` and never set either of the properties being read. Both are
therefore permanently `undefined`, the condition is always false, and every WalletConnect
session **approval** proceeds regardless of RASP tier, including a hard `TIER.BLOCK` from a
rooted/hooked/emulated/attestation-failed device. Verified by hand against `origin/main`
(the bug is present in the commit that introduced the check, `7cdeee64`, and has not been
touched since). **Scoped to session approval only** — the three signing chokepoints
(`_handlePersonalSign`, `_handleSignTypedData`, `_handleSendTransaction`) all correctly
read `proceedAllowed` and remain fail-closed, so this bug alone gives a hostile dApp a live
connection + address disclosure on a compromised device, not a signature or a broadcast.

**Fix (open in PR #1276, branch `claude/fix-h1-wc-session-gate`):**
`if (!gate.proceedAllowed) throw new Error(...)`, mirroring the three signing chokepoints,
plus a regression test stubbing a non-ALLOW tier and asserting `approveSession()` is never
called. Reported by the PR author as code-complete, tested, CI running — **NOT merged to
main as of 2026-07-20.** Do not mark this fixed until the merge lands.

**Related, no action taken (correctly):** the same weekly audit's H-2 (ColdSign broadcast
omits the WARN-tier biometric step-up that `SendCrypto.jsx` enforces) was not opened as a
new finding, because `src/pages/ColdSign.jsx` is unreachable dead code (no route, no
import, nothing sets `location.state.coldSend`) — the underlying WARN-tier
acknowledge-only gap is already tracked as weekly M-5 (2026-07-14).

## 2026-08-25 cold-unlock perf + deniability-KDF-parity suite — PRs #2039–#2106

This archive was frozen 2026-07-20; the living per-feature record for everything
after that date is `docs/Feature-Status.md`. This entry is a short index only —
see that file's 2026-08-25 section for full detail, honest caveats, and the
Samsung Note 20 / Pixel 10 Pro XL measurements.

- **#2039** — double-OS-prompt collapse to one prompt on KEK-enrolled cold unlock.
- **#2042** — C1/C2/H1/H2 hardening the honest-reviewer required before #2039 merged.
- **#2043** — biometric-capability probe memoised (6 IPC round-trips → 1).
- **#2044** — RASP mount-time probe deferred via `requestIdleCallback`.
- **#2045** — `SecurityAdvisor` lazy-loaded out of the entry chunk (−246 KB).
- **#2047** — fast-path DEK cache primitives (Kotlin alias + JS helpers); inert until wired.
- **#2051** — fast-path wiring: `keyStore.unlockBiometricOnly()`, slow-path populate, PinUnlock button (Option 1).
- **#2052** — opt-in grace window on brief screen-off.
- **#2054** — new-vault KDF v2 params (96 MiB / t=6); migration flag OFF pending Gate 1 of #2101.
- **#2055** — Fast Unlock flipped default-ON with a first-run disclosure card (reverses the earlier Q3 "off by default" ruling).
- **#2057** — Fast Unlock ↔ Biometric Unlock preference linkage (enabling either auto-enables both).
- **#2064** — indeterminate KEK-enroll progress bar under the Safe animation.
- **#2103** — deniability-KDF parity (Gate 2 of #2101): reveal/duress/panic paths rekey to the writer's `KDF_PARAMS` on successful decrypt; panic rekey deliberately excluded (post-wipe residue risk); transient tell disclosed and pinned by a regression test.
- **#2106** — fast-path button hidden: duplicated the existing biometric-unlock button and errored on a cache-miss; the cache stays wired in code, unreachable from the UI.
- **Issue #2101** — two gates before the KDF v2 migration flag flips: Gate 2 (deniability parity) closed by #2103; Gate 1 (a real-device v2-vault unlock benchmark) is still open — every trace this session was against a v1 vault.

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


---

# Snapshot: full CLAUDE.md as of 2026-09-22 (pre-slim, origin/main `d7d0486c`)

Moved here verbatim when CLAUDE.md was slimmed to cut per-turn context cost.
This is history: where it and CLAUDE.md disagree, CLAUDE.md (and the live systems) win.
Headings below are demoted one level.

## Veyrnox — project guide for Claude Code

Veyrnox is a self-custody, coercion-resistant crypto wallet (Vite + React + Capacitor;
ethers v6; @noble / @scure). Web + mobile (iOS/Android via Capacitor). The seed is the
identity; the app never holds keys server-side.

> **Full audit history:** `docs/CLAUDE-audit-archive.md` (moved 2026-07-20 to reduce
> context-window pressure). Read on demand when you need PR-level detail.

### Model cost rule

Default to the cheapest capable model (Haiku or Sonnet) for subagents, research, and
routine tasks. Only escalate to Opus for complex multi-file architectural changes,
security-critical code (wallet-core, signing, KEK, RASP), or tasks that explicitly
require deep reasoning. When spawning subagents, pass `model: "haiku"` or
`model: "sonnet"` unless the task justifies Opus.

### Hard rules (do not violate)

- **Supabase project inventory and scope (re-confirm before every live audit).**
  Enumerate projects from the Supabase API; never infer the set from names or a
  previous audit. The organisation has FOUR active projects as of 2026-09-20:
  `jwstkrtslotnjyerzzsi` (Veyrnox wallet production, eu-central-1),
  `nszlbcmcysftwyudthjz` (Veyrnox wallet staging, eu-central-1),
  `yrqzwqywxfesmbvhzjgj` (the separate `veyrnox.ai` service, us-east-2), and
  `xdxdzmsztyzbnzeforxx` (`veyrnox-ai-production-eu`, eu-central-1, created
  2026-09-12). **This paragraph said THREE until 2026-09-20, eight days after
  the fourth appeared** — which is the rule's own point turned on its author:
  a written inventory decays the moment someone creates a project, and only
  the API knows. Wallet parity audits and wallet SQL remediation target only
  the first two.
  The `veyrnox.ai` project is not a disposable staging environment and must
  never receive wallet DDL, grants, secrets, or migrations; audit it separately
  under its own service ownership.
  **`yrqzwqywxfesmbvhzjgj` WAS named `veyrnox-staging`; it now reads
  `veyrnox.ai staging` (verified 2026-09-20), so the trap below is softened
  but NOT gone — the word "staging" is still in the name, and there are still
  two such projects.** It was created at
  `2026-07-29T05:29:24Z`, ten minutes before the real wallet staging project
  `nszlbcmcysftwyudthjz` (`05:39:23Z`), and the name is left over from that
  abandoned first attempt; the project was later repurposed as the veyrnox.ai
  backend and is live. So enumerating from the API — which this rule requires —
  returns TWO projects whose names contain "staging", and the second one is not
  one. This is the exact trap behind #2505/#2506. The rename asked for here has
  happened — the `.ai` now distinguishes them at a glance — but match on the ref
  regardless and treat every name in this paragraph as a label, not evidence.
  The fourth project makes that sharper, not weaker: `veyrnox-ai-production-eu`
  sits in eu-central-1 alongside both wallet projects, so region is not a
  discriminator either.

- **DO NOT TOUCH THE CORE INFRA WIRING — locked 2026-08-11.** The chain
  {Client → Supabase Edge Function → Cloudflare Worker → Workers AI / RevenueCat}
  is load-bearing and every piece was broken and re-fixed today across ~7 PRs
  (see 2026-08-11 log below). It is now GREEN on prod, staging, and
  localhost:5211. Do not "improve", "simplify", "refactor", "rotate", or
  "align" any of the following without an explicit user request naming the
  specific change:

  - **TIP Worker (`veyrnox-tip` repo)** — `wrangler.toml` prod block
    (especially `workers_dev = true` on `env.production`, kept as the CF Bot
    Fight bypass), D1 `chat_cap_counters` table, `api_keys` capabilities,
    `src/lib/auth.ts` HMAC scheme (`ts.METHOD.pathname.body`), CF WAF rule
    "Challenge /chat requests from unknown origins" (path-scoped; changing
    scope re-breaks server-to-server chat).
  - **Supabase Edge Function `tip-chat`** — signing helpers (`sha256Hex`,
    `hmacHex`), header set (`X-Api-Key`, `X-Timestamp`, `X-Signature`),
    `TIP_CHAT_BASE_URL` env override, `MAX_SYSTEM_CONTENT = 32768` cap,
    `DEFAULT_ALLOWED_ORIGINS` (localhost:5173/5199/5211 stay because they
    are how devs test), and the `STATUS: BUILT, WIRED` header comment which
    is paired to a test (`src/api/__tests__/tipEdge.chatRoute.test.js`).
    **2026-08-23 checkpoint — DEPLOYED VERSION MUST match the repo source.**
    The live function was v34 until 2026-08-23, pre-PR #1725: it read only
    `Deno.env.get('TIP_BASE_URL')` and ignored `TIP_CHAT_BASE_URL`. Every
    chat request went via `tip.veyrnox.com` and hit Cloudflare Turnstile
    (`Just a moment…` HTML) — Edge returned 502 `tip_upstream_error`, the
    Advisor showed generic "AI advisor unavailable". Redeployed to v35 with
    the repo source that reads `TIP_CHAT_BASE_URL || TIP_BASE_URL`, then
    set `TIP_CHAT_BASE_URL='https://veyrnox-tip.al-jobson.workers.dev'` on
    the prod project. If you redeploy `tip-chat`, deploy from
    `supabase/functions/tip-chat/index.ts` verbatim — never bring back an
    older shape. If `TIP_CHAT_BASE_URL` is ever unset, chat silently reverts
    to Turnstile-blocked. `verify_jwt: false` on the function (the header
    comment above explains why — CORS OPTIONS preflight carries no auth).
    **2026-09-20, LATER THE SAME DAY — PROD IS NOW GATED. The paragraph
    below is HISTORY; read it for the mechanism, not the state.** `tip-chat`
    was deployed to prod from `origin/main` at `fd3078fc` via the Supabase
    CLI, and the deployed source was downloaded and diffed against
    `supabase/functions/tip-chat/index.ts` — byte-identical, sha256
    `9afc559c…`. Verified live on prod, all three cases: no `X-Rc-User-Id`
    and a bogus id both return `403 entitlement_required`, and a genuinely
    entitled RevenueCat customer returns `200 text/event-stream` with real
    `@cf/meta/llama-3.1-8b-fast-v2` tokens. `REVENUECAT_PROJECT_ID` is set on
    both projects, which the v2 lookup requires and without which the gate
    denies everyone. Advisor online chat is therefore SUBSCRIBER-ONLY on prod
    now, and no account currently holds `ai_security_protection`, so in
    practice nobody has it until those products are sellable — that is the
    paywall working, not an outage. Tracked in
    [#2659](https://github.com/VEYRNOX/veyrnox/issues/2659) and
    [#2662](https://github.com/VEYRNOX/veyrnox/issues/2662).
    **This correction was written the same session as the note it corrects**
    — [#2660](https://github.com/VEYRNOX/veyrnox/pull/2660) merged the text
    below at 12:26Z and the deploy landed at 13:4x, so a file that had been
    accurate for four weeks was stale within ninety minutes. Nothing about
    the original was careless; the lesson is only that a state note earns its
    keep by being amended in the session that changes the state.

    **Historical, and the reason the gate existed to be deployed at all —
    2026-09-20: THAT REDEPLOY ALSO DROPPED THE ENTITLEMENT GATE, AND PROD HAD
    BEEN UNGATED SINCE 2026-08-23. Measured, not inferred.** `main` requires
    `X-Rc-User-Id` and an active `ai_security_protection` entitlement
    (`index.ts:248-253`, RevenueCat v1 lookup). The DEPLOYED functions do
    not read that header at all — prod v38 (2026-08-23 18:18 UTC) and
    staging v14 (2026-08-12 07:08 UTC) contain no `REQUIRED_ENTITLEMENT`,
    no `hasRequiredEntitlement`, no `api.revenuecat.com` call, and their
    CORS `Access-Control-Allow-Headers` omits `x-rc-user-id`. Proof: a POST
    to the public Pages proxy `/api/edge/tip-chat` with NO rc id, and again
    with a bogus `$RCAnonymousID:ffff…`, both returned `200
    text/event-stream` and streamed a real
    `@cf/meta/llama-3.1-8b-fast-v2` completion; same result posting
    straight to `…supabase.co/functions/v1/tip-chat` with the anon key. On
    `main`'s source both are `403 entitlement_required`. So the paid
    AI Security Protection tier on the online Advisor is enforced ONLY by
    `hasAdvisorOnlineAccess()` in `src/lib/tier.js:49` — client-side, which
    is not a boundary. Bounded by TIP's own per-`device_id` cap (30/24h,
    caller-supplied id), so the cost is metered abuse, not wallet data:
    since 2026-09-05 the body carries only `current_screen` and
    `wallet_chain`.
    **The gate merged in d8dc6e61 (#2027) the SAME DAY v38 was deployed**,
    and v38 was cut from the pre-gate shape to fit the MCP payload cap —
    exactly what the paragraph above forbids, failing on a rule it does not
    mention. 038663df (2026-09-16, bounded lookup + cached verdicts) was
    never deployed either. **A redeploy carries whatever the deployer
    pasted, and a "DEPLOY REQUIRED" header in the repo cannot tell you what
    is live** — read the deployed body back (Supabase MCP
    `get_edge_function`) rather than trusting the source file or this note.
    If it is ever redeployed: verbatim from
    `supabase/functions/tip-chat/index.ts`, staging first, and confirm
    shipped 1.0.1 native builds send `X-Rc-User-Id` before prod or entitled
    subscribers get 403. `functions/api/edge/[fn].js` already forwards it;
    `REVENUECAT_V1_SECRET_KEY` is already set on both projects.
    **The entitled 200 branch has never been exercised and could not be**:
    `ai_security_protection` (`entl262ea1e9d4`) has four attached products,
    the two Apple ones are `READY_TO_SUBMIT` and never sellable, and the
    only production purchase on record grants `safety_plus`. No subscriber
    holding it exists to test with.
  - **Supabase Edge Function `tip-screen`** — signing helpers, endpoint
    binding (`/api/v1/screen` only; the historical `action:'chat'` branch
    is deliberately removed and must stay removed).
  - **Supabase secrets** on both projects — `TIP_API_KEY`, `TIP_BASE_URL`,
    `TIP_CHAT_BASE_URL`, `TIP_SIGNING_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`,
    `REVENUECAT_V1_SECRET_KEY`, `REVENUECAT_WEBHOOK_AUTHORIZATION`. Rotate
    ONLY when explicitly asked; a rotation without matching Worker-side
    D1 update kills prod chat (this happened once — see log).
  - **Cloudflare Pages** `SUPABASE_ANON_KEY` env on `veyrnox-prod` /
    `veyrnox-staging` — must remain the publishable key that matches what
    Supabase auto-injects into Edge Functions.
  - **Cloudflare Pages Transak secrets** — the two projects run DIFFERENT
    Transak environments on purpose; do NOT collapse them.
    * **`veyrnox-prod`** (set 2026-08-23): `TRANSAK_ENVIRONMENT=PRODUCTION`;
      `TRANSAK_API_KEY` and `TRANSAK_API_SECRET` live ONLY in the Cloudflare
      Pages secret store — never in this file, never in git, never in logs.
      Retrieve via `wrangler pages secret list --project-name veyrnox-prod`;
      set/rotate via `wrangler pages secret put`. The secret is
      base64-URL-safe and case-sensitive — a single wrong-case character
      returns `400 Invalid api-secret` at
      `POST api.transak.com/partners/api/v2/refresh-token`.
      Endpoint targets: `api.transak.com`, `api-gateway.transak.com`,
      `global.transak.com`. Real card charges.
    * **`veyrnox-staging`** stays on Transak STAGING: `TRANSAK_API_KEY` +
      `TRANSAK_API_SECRET` set, `TRANSAK_ENVIRONMENT` deliberately UNSET so
      `functions/api/buy/session.js`'s `env.TRANSAK_ENVIRONMENT || 'STAGING'`
      falls back to STAGING. Endpoint targets: `api-stg.transak.com`,
      `api-gateway-stg.transak.com`, `global-stg.transak.com`. Simulated
      flow, no real charges — the correct default for staging.
    Rotate the prod secret only via Transak Partner Dashboard → Developers →
    Production → Refresh; then re-set via `wrangler pages secret put
    TRANSAK_API_SECRET --project-name veyrnox-prod` AND redeploy Pages
    (`wrangler pages deploy dist --project-name veyrnox-prod --branch main`)
    — Pages Functions bake env at deploy time.
    **The SECRET was published, and was rotated 2026-09-19 — exposure CLOSED.
    The API KEY is not a secret and never was.** This paragraph was written
    earlier the same day saying the "pair" was publicly readable and had never
    been rotated. Both halves needed correcting within hours, so read the
    distinction carefully:
    - **`TRANSAK_API_KEY` is public by design.** It rides in the query string
      of every widget URL the backend mints — an observed response is
      `https://global-stg.transak.com?apiKey=<key>&sessionId=…`, loaded by
      every user's browser. Transak's dashboard offers **Refresh on the secret
      only**, which is the same fact from their side. Do not treat the key
      appearing somewhere public as an incident.
    - **`TRANSAK_API_SECRET` was the real exposure, and it is now rotated.**
      Refreshed in the Transak dashboard 2026-09-19, re-set on `veyrnox-prod`,
      and live from deployment `07bb0d57`. The old value remains in git history
      forever but is dead.
    - **`main` never held either value.** Both #2020 and #2144 were
      squash-merged and the squashed blobs carry `REDACTED-TRANSAK-KEY` /
      `REDACTED-TRANSAK-SECRET` placeholders, so `git show ffa77b84:CLAUDE.md`
      shows a clean file. The values are in the pre-squash BRANCH commit, which
      the public repo still serves by SHA — GitHub keeps a PR's objects after
      the branch is deleted. **#2144 therefore scrubbed the wrong artifact.**
      The SHA is not recorded here; recover it with `git log --all -S'<value>'`
      if it is ever needed.
    **Reusable lesson: under squash-merge, `main`'s blob is not the branch's
    blob.** Grepping `main` is not an exposure check. Use
    `git log --all -S'<value>'` to find the value-bearing commit, then
    `gh api repos/<org>/<repo>/commits/<sha>` to test whether the public repo
    still serves it. Second lesson, from the same day: **establish whether a
    credential is a secret before running an incident on it.** Hours went into
    a "leaked key" theory for a value the vendor publishes in a URL. Never set
    `TRANSAK_ENVIRONMENT=PRODUCTION` on `veyrnox-staging` unless you
    genuinely intend every staging test to charge real cards.
    **There is a DECLARATION at Transak describing how we integrate, and it is
    not in this repo.** The Mandatory Security checklist (submitted
    2026-08-31) records our platforms, integration type per platform, backend
    IPs and backend-for-frontend URL. Transak validates against what we
    declared, so a change to HOW the widget opens is a change to a form only
    they hold. Nothing in the repo said this existed, which is why the
    mismatch below survived two weeks unnoticed.
    As submitted 2026-08-31, and what the code actually does:
    - **Web: iFrame** — correct. `BuyCrypto.jsx` renders an `<iframe>` with a
      sandbox allowlist and `allow="camera;microphone;payment"`.
    - **Mobile: Android/iOS Native Webview** — **WRONG since 2026-09-07.**
      #2408 changed native to `Browser.open({ url })` via `@capacitor/browser`
      (SFSafariViewController / Chrome Custom Tabs). That is **Browser
      Redirection** in Transak's taxonomy. A system browser opening the widget
      URL sends **no `Referer`**, and Transak uses `Referer` as the runtime
      domain signal — so domain validation on the mobile path cannot succeed
      while we are declared as a webview. This is the likely source of the
      `T-INF-103` users see ON THE WIDGET PAGE, which is a SEPARATE fault from
      the `auth/session` 401 that currently blocks Buy entirely.
    - **Backend IPs: submitted as a note**, not addresses ("N/A … Cloudflare's
      public ranges + x-api-key/x-user-ip gating"), because Pages Functions
      have no static egress IP. The field is required and gates the session
      API: "any request from an unrecognised IP is blocked, even if the API
      key is valid."
    **Standing rule: if you change how the Buy widget opens, or where the
    backend runs, the Transak declaration must be resubmitted in the same
    session.** It is a form, it is invisible to git, and it is enforced.
    **ROOT CAUSE CONFIRMED BY TRANSAK (2026-09-21): the Backend IPs field on
    our 2026-08-31 Mandatory Security checklist was left without an address.**
    Transak support (Harsh Shah) wrote that the IP field was blank and asked
    for a static backend IP. Their partner APIs are gated on that allowlist, so
    once enforced, every `auth/session` call from every source was refused —
    which is what every measurement below shows. Cloudflare Pages Functions
    have no static egress IP, so a **static-egress relay** now exists for the
    two partner calls: GCP `veyrnox-wallet`, VM `transak-relay`, static IP
    **`34.56.200.9`**, hostname `transak-relay.veyrnox.com`.
    **ACTIVE ON PROD since 2026-09-21; #2655 closed.** `TRANSAK_PROXY_BASE` and
    `TRANSAK_PROXY_SECRET` are set on `veyrnox-prod`, and production deployment
    `c32b2543` (Deploy Preview run 35601611589) returns
    `200 {"url":"https://global.transak.com?apiKey=…&sessionId=…"}` from
    `/api/buy/session`. The relay VM was observed opening the outbound Transak
    connection during a probe, and it answers `401` to requests with no secret
    or a wrong one. **Native Buy works on iOS and Android** (owner test,
    2026-09-21, after closure; no artifact captured). **Not verified:** web
    Buy — an automated check from a UK machine hits the deliberate UK block in
    `src/lib/buy/useBuyEnabled.js`, which keys off `Europe/London` / a GB
    locale, and never reaches Transak; bounded 401 handling on the relay path;
    Transak's written allowlist confirmation. The relay also has no rate limit of its own, no
    per-request logs, and no monitoring beyond `/healthz` — accepted residuals,
    recorded on #2655.
    **Runbook: `docs/transak-relay.md`** — activation, secrets, rotation,
    rollback, and the standing rule that the IP is registered with Transak and
    must never be released or moved without resubmitting it first.
    The paragraph below is the pre-confirmation diagnosis, kept as the record
    of how it was reached.
    **SUPERSEDED — pre-confirmation diagnosis (2026-09-19). This heading used
    to read "Current partner state", which made it look live after the root
    cause above replaced it.** It concluded *"prod Buy is DOWN, and it is
    account provisioning on Transak's side — not credentials, not our code."*
    Two of those three held: not credentials, not our code. The third did not
    — the cause was the blank Backend IPs field on **our own** checklist
    submission, not provisioning on Transak's side. The elimination below is
    still sound evidence; only the attribution was wrong:
    - `POST api.transak.com/partners/api/v2/refresh-token` **succeeds** and
      mints an access token — with the NEWLY ROTATED secret.
    - `POST api-gateway.transak.com/api/v2/auth/session` returns
      `401 x-deny-reason: invalid_api_key`, body `{"error":"invalid_api_key"}`.
      The log line is `[buy/session] create-session failed … status=401` — the
      stage proves refresh-token passed first.
    - **The response is byte-identical before and after the secret rotation**
      (`ref=fdf46c12` 17:31 old secret, `ref=4a99e446` 20:04 new secret). A
      credential the gateway rejected would not behave identically across a
      rotation.
    - The gateway returns that same `invalid_api_key` for a random UUID and for
      the staging key, and `missing_api_key` when no key is sent — so ours is
      treated as a key it does not recognise. It fires **before** the access
      token is examined, which is why a fresh token never helped.
    - Reproduced from a plain shell with no Veyrnox code in the path.
    - The identical code path against Transak STAGING returns 200 and renders a
      live quote, so the request shape is correct.
    Buy worked at the 1.0.1 launch (2026-09-11) and for some days after, and no
    commit in that window touches a header, body field or endpoint of this call
    — verified by diffing `functions/api/buy/session.js` against the launch
    commit. Whatever changed is in the account's state at Transak. Awaiting
    their support answer. *(Answered 2026-09-21 — the root cause above. The
    window claim still holds: the next change to this call's body was
    `a011e1b6` on 2026-09-19, after the outage began.)* Supersedes the
    2026-08-23 note describing
    `errorCode 1002` and pending widget enablement — same class of problem, a
    different error string, and no longer what the gateway returns.
  - **RevenueCat** offer identifiers (`APPLE_OFFER_IDS`, Play offer tags),
    entitlement `safety_plus`, and the `rc-webhook` Edge Function's shared
    secret with the RC dashboard.
  - **Client `SecurityAdvisor.jsx`** — `TIP_CHAT_URL` composition (must be
    `${VITE_SUPABASE_URL}/functions/v1/tip-chat`), `VITE_TIP_CONFIGURED`
    gate, HMAC-signing-headers absence (client never signs; the proxy does
    server-side).

  **Before changing anything in the list above:** read `docs/Feature-Status.md`
  2026-08-11 entry (or the git log for that date) so you know what the
  current shape exists to prevent, then confirm the change with the user by
  quoting the specific line you want to touch and why. NEVER "clean up"
  these files as part of unrelated work.

  The chain touches four external systems (Cloudflare Workers, Cloudflare
  Pages, Supabase Edge Functions + D1 secrets, RevenueCat). Silent
  changes to any one of them cascade — the 2026-08-11 outage was five
  stacked bugs, each masking the next: signing scheme, CF Bot Fight,
  workers_dev flag, D1 missing table, and MAX_SYSTEM_CONTENT cap. A
  "small refactor" in one place can re-open any of these.

- **Mainnet unlocked 2026-06-17.** `ALLOW_MAINNET = true`, `ALLOW_BTC_MAINNET = true`,
  `ALLOW_SOL_MAINNET = true`. Both the internal audit (2026-06-17, the mainnet gate) and
  the independent ECC third-party audit (2026-06-23) are complete. "Internal" is never
  presented as "independent" (I4 honesty). Independent third-party security audit of the
  full stack (S1–S4 + crypto + KEK + RASP) remains outstanding.
- **Verify, don't assert.** An asset/feature is "verified" ONLY after a real on-chain
  testnet transaction confirms on a block explorer with a txid the user supplies. Passing
  tests, clean review, or a green suite are NOT verification.
- **Status tags.** BUILT (in code, testnet/provisional), TARGET (designed, audit-gated),
  PLANNED (roadmap), or HONEST-DISABLED (present but off on principle). Code-complete +
  tests green = BUILT at most.
- **Audit gate (§24).** The internal audit gates mainnet. RASP, hardware KEK, device
  attestation, network hardening, and cloud recovery are TARGET/PLANNED — need real-device
  verification and the audit.
  - **Personal Backup override (2026-08-08, owner-authorized):** Personal Backup
    (2-of-3 Shamir DEK sharding per `docs/cloud-recovery-shard-spec.md`) may
    proceed to implementation ahead of the independent audit. Full record in
    AGENTS.md's Audit-gate bullet — carveouts unchanged: internal-audit review
    of the completed architecture is still required, real-device verification
    before enrollment, I1/I3 invariants preserved. Nothing here is "verified"
    until an on-device recovery trip completes and an independent audit passes.
- **No fake security.** Never mock a security control to look real. If something can't be
  delivered honestly, honest-disable it (I4: fail honest, fail closed).

### Current state summary (2026-07-28)

**Hardware KEK:** Both platforms BUILT + device-verified (INTERNAL). M2c (iOS SE) and M2d
(Android StrongBox/TEE) UNGATED (PR #1152). Android C-1 v3 salt-binding FIXED +
device-verified. iOS device-verified FULL (2026-07-08). KEK auto-enroll on all wallet
entry paths — fresh create (PR #1298) + phrase import, PIN recovery, file restore
(PR #1301) — eliminates redundant PIN re-entry at enrollment. Independent audit
outstanding.

**RASP:** F-09 DEVICE-VERIFIED (FULL, INTERNAL) on Android (Magisk, 2026-07-12) and iOS
(palera1n, 2026-07-14). G3 Frida Gadget detection device-verified on both platforms.
C-01 native fail-closed gate fixed (PR #825). Play Integrity ES256 JWS verification +
nonce binding fixed (PRs #955, #1009).

**Attestation honesty sweep, 2026-09-03 (branch review of #2280 → 5 findings).** All
comment/config-level; no attestation BEHAVIOUR changed and nothing advanced to verified.
- **The pinset comment claimed evidence that does not exist** (S-1, `c2335704`).
  `PlayIntegrityJwsVerifier.kt` read "real tokens observed in the wild have chained via
  any of R1/R2/R3/R4". No production token has ever been captured. Now sourcing-only:
  transcribed from `pki.goog/repository`, live signing rotation marked UNVERIFIED.
  #2280 rewrote the four files POINTING AT this and left the file HOLDING it — a
  comment-only PR is exactly where a security claim hides.
- **Shipped iOS archives carried `appattest-environment=development`** (S-2, #2282, not
  my fix). One `App.entitlements` was wired to Debug AND Release, so every archive
  through 1.0.1 build 47 requested Apple's *development* attestation servers — the iOS
  leg was inert in distribution, not merely unprovisioned. Fixed with
  `$(APP_ATTEST_ENVIRONMENT)` set per build configuration (development/production) and
  substituted into the single entitlements file. **Do not "simplify" that back to a
  literal value.** Not archive-verified: if codesign ever rejects `production`, delete
  the key (omission also means production) rather than reverting to `development`.
- **A mutable trust anchor shipped in the release binary** (S-3, PR #2284 — open at time
  of writing, verify before citing). `ADDITIONAL_TRUSTED_ROOTS_FOR_TESTING` was a
  process-wide `MutableSet` OR-ed into the root-trust decision, empty at rest and guarded
  only by a comment. Replaced with an `extraTrustedRoots: Set<String> = emptySet()`
  parameter — production passes none, so there is no writable trust state at all. Chosen
  over a `BuildConfig.DEBUG` gate, which would have left the set in the binary and
  coupled this deliberately `android.*`-free file to build variants.
- S-4/S-5 (`a0d99c05`): DeviceCheck linkage was RESOLVED (clang module autolinking) but
  #2280 swapped it for a different gap without saying so; and one header carried three
  status declarations in two vocabularies. Both now explicit.
- **#2276 CLOSED 2026-09-04 as accepted residual** (owner decision). DoD 3 (chain/pin
  failure → INTEGRITY_FAIL) and DoD 4 (real-token device exercise) remain UNMET and
  deliberately deferred. Current posture: pin/chain miss maps to INTEGRITY_UNAVAILABLE →
  WARN at `PlayIntegrityPlugin.kt:168` → `attestation.js:185-186`. Not tightened because
  a wrong-root pin would arm the sticky session latch (`attestation.js:298`) into a
  self-renewing BLOCK on genuine devices. If the posture ever changes, reopen and land
  DoD 3 in the SAME PR as the captured-token evidence — ordering is load-bearing.
  Closure rationale + full state: issue comment
  https://github.com/VEYRNOX/veyrnox/issues/2276#issuecomment-5533356592. This line said
  "REOPENED 2026-09-03" and before that "CLOSED administratively and untracked" — both
  states are historical.

**Vault:** AES-256-GCM, Argon2id KDF — **96 MiB / t=6 for vaults created from
2026-08-24 (#2054); 192 MiB / t=3 for older ones**, which stay there until the v2
migration flag flips (Gate 1 of #2101, still OPEN). Same total work either way
(192×3 = 96×6); v2 halves peak memory for mobile unlock latency. v:2 blobs with AAD
binding (PR #1076).
KEK-DEK AAD salt exclusion P1 fixed (PR #1079).

**WalletConnect:** C3 RASP gate, H7 chain binding (pre-modal), H8 address binding
(pre-modal), M9 gas cap, M11 session expiry, H-NEW-B step-up re-auth. 2FA + spend-limit
gate on `eth_sendTransaction` (PR #1118). `from`/signer address binding on
`eth_sendTransaction` and `eth_signTypedData_v4` (PR #1118). **H-1 session-approval RASP gate FIXED (PR #1276, merged 2026-07-20):**
`handleApproveSession` was reading `gate.blocked`/`gate.sentence`, which
`presignGateOrReject()` never returned — every WC session approval proceeded regardless
of RASP tier. Fixed to read `!gate.proceedAllowed` (same shape the three signing
chokepoints already use). Regression-tested, BUILT, INTERNAL — not device-verified.

**Safety Plus IAP:** Monthly $5.99 + Annual $49.99 (same `safety_plus` entitlement).
Store-side setup complete (Apple + Google + RevenueCat). iOS sandbox-purchase
device-verified, and **one real production purchase exists** —
`safety_plus_monthly_v2` on the App Store, bought 2026-08, still active, full price
(no offer). Play-side: no purchase, real or otherwise. **Apple account is now an Organization (Veyrnox LTD, Team R54268MWFV) —
verified 2026-07-21; Guideline 3.1.5(b) satisfied**, which unblocked the iOS real-device
build and the first App Store / IAP submission. **Both HAPPENED — this line read "both
still to be done" until 2026-09-06, six weeks after the app went live.** `1.0` is
`READY_FOR_SALE` (released 2026-07-28) and Apple has `APPROVED` the Safety Plus
subscriptions. **`1.0.1` is ALSO live — build 59, approved from the 2026-09-11
resubmission**, and **the Play app is PUBLISHED too** (2026-09-19 checks below).
Evidence and what is genuinely still pending: the App Store section below.
The "Play launch still gated on the upload-key reset (pending)" clause that stood
here is deleted: the reset was approved 2026-07-22 09:29 UTC, as the Play Store
section of this same file said all along. **A file can contradict itself and the
stale half still reads as current** — when two lines here disagree, the one with a
date and an evidence source wins. Referral system BUILT (4-tier discount model, Supabase server-side codes,
API-hardened PR #1334 — dedup + rate-limited RPCs, see tracking section below;
further API-hardened 2026-07-28 by the internal-audit wave: H-1..H-3 identity/access,
M-6..M-8 rate-limit + idempotency, L-8..L-10 dedup + IP dimension, see the 07-28
entry — SQL deployed 2026-08-10, both Edge Functions live, RC dashboard webhook
armed 2026-09-08 with sandbox/production split per environment);
deniability-hardened 2026-07-20 (PR #1262, K-2): `syncCount` no longer coerces a failed API
read into a fake "synced" success state written to shared localStorage, and the tracker
page now renders a neutral empty state (gated on `isDeniabilityOrDemoActive()`) instead of
reading/writing real referral state in decoy/demo sessions.

**Promotional offers (2026-07-23) — BUILT, INTERNAL, no purchase ever made.** All 10
store-side offers exist on both platforms (4 referral tiers + retention 50%, × monthly and
annual). The two stores are NOT symmetric and code must not treat them as one mechanism:
- **Play** — offers on the base plan, matched by TAG (`referral-gold`), bought with
  `purchaseSubscriptionOption`. Every offer carries `rc-ignore-offer`, so a discount only
  applies if the app names it. Discounts are true percentages in every currency.
- **Apple** — promotional offers matched by IDENTIFIER, signed by RevenueCat
  (`getPromotionalOffer`, using the In-App Purchase key — already uploaded and valid; the
  "StoreKit Subscription Offer key" slot is for local StoreKit-config testing only), bought
  with `purchaseDiscountedPackage`. Identifiers are unique per subscription GROUP and
  reject hyphens, hence `referral_gold_monthly` / `_annual` and the asymmetric
  `retention_50` / `retention_50_annual`. Mapping table: `purchases.js APPLE_OFFER_IDS`.
- **Apple cannot express small percentages.** 2.5% off is not a price point; Bronze uses
  the nearest point at or BELOW target ($5.79 / $48.49), so a customer is never charged
  more than advertised. FX rounding erases small discounts entirely in some territories
  (Bronze is full price in Albania/Armenia) — so the paywall must render the
  store-returned price, never a hardcoded tier percentage.
- A package's `priceString` is always the BASE plan price on both stores; the offer price
  comes from `purchases.js offerPriceInfo` (Apple `product.discounts[]`, Play the option's
  `introPhase`). Unresolvable → render no price rather than the base price (I4).
- All offer paths fail CLOSED: a missing or unsigned offer throws `OFFER_UNAVAILABLE`
  rather than falling through to a full-price charge.
**Not verified: no promotional OFFER has ever been exercised by a real purchase, on either
platform.** None of the 10 store-side offers has been bought end to end, so the signing,
identifier-matching and `offerPriceInfo` paths above remain code-verified only.
**Corrected 2026-09-06.** This line read *"no real purchase has been completed on either
platform"* — false since 2026-08. One production purchase exists (`safety_plus_monthly_v2`,
App Store, 5.99, still active), but it carries `original_offer_type: "No offer"` — full
price. The purchase falsified the sentence; it did not verify the offer machinery, which
is what the sentence was there to guard. See the App Store section for the evidence.

**Anonymous event tracking (PR #1321) — LIVE, and it changed the privacy story.**
`api/trackEvent.js` writes 7 event types to our own Supabase with a random
`veyrnox-device-id`; `receive_viewed` and `send_completed` carry an asset symbol.
Suppressed entirely in deniability/demo (I3). Consequences worked through 2026-07-23:
- **The pipeline carries REAL USER DATA at scale, and this bullet said the
  opposite until 2026-09-10.** It read: *"The pipeline is PROVEN to work
  end-to-end, but has **zero real-user data** — the only rows ever written were
  126 from local test runs (see below)."* That was approximately true the day it
  was written and has been decisively false since the App Store launch. Do not
  reason about privacy, store declarations or consent from a no-real-data
  premise. Shape, measured 2026-09-10 on prod `jwstkrtslotnjyerzzsi` — a
  snapshot, not a fact to carry forward:
  **thousands of events from thousands of distinct devices, continuously since
  2026-07-23, with the large majority of the volume in the trailing 28 days.**
  Re-derive rather than trusting a number written here (the versionCode bullet
  above is what happens otherwise):

  ```sql
  select count(*) as events, count(distinct device_id) as devices,
         min(created_at)::date as first, max(created_at)::date as last
  from public.events;
  ```

  **Why it went stale unnoticed, which is the reusable part.** Day one
  (2026-07-23) holds 141 events across 115 device_ids, and the 126-event test
  leak in the next bullet accounts for almost all of it — so the sentence was
  written on the one day it was defensible, and the file's own convention of
  dating a block ("Consequences worked through 2026-07-23") made it look
  current afterwards. The growth is recent and tracks the launch, not the
  writing. **A claim of the form "we have no X yet" has an expiry date and no
  alarm.** It is also self-contradicting inside this file, which records 574 new
  customers / 578 active users and states plainly that *any "not yet launched"
  framing anywhere in this file is wrong* — this bullet was exactly that framing,
  six weeks past its truth.
  Tracked as [#2508](https://github.com/VEYRNOX/veyrnox/issues/2508).
- **Test suite was writing to PRODUCTION Supabase.** `.env.local` credentials leak
  into Vitest, so any test rendering WalletProvider inserted real rows — 126 events
  across 114 phantom device_ids from one run. Fixed in PR #1328 by blanking the
  Supabase env in `vitest.config.js` (same mechanism already used for
  VITE_FORCE_TIER/VITE_BYPASS_RASP). CI was never affected (no `.env.local` there),
  which is why a green pipeline never caught it.
- **Store declarations were understated.** Play Data Safety and Apple App Privacy
  both claimed App-functionality-only; **Analytics** purpose added to both
  2026-07-23. Still open: Apple's **Usage Data → Product Interaction** is undeclared.
  **That gap is now higher-stakes than when it was written, and its status is
  UNCHECKED — not re-verified as of 2026-09-10.** It was recorded while the
  no-real-user-data bullet above made it look academic; thousands of real
  devices have since transmitted. Confirm it against App Store Connect directly
  rather than against this line, and do not read the correction above as
  evidence either way — it measured the database, not the declaration.
  **Consent/opt-out now exists (2026-07-26):** opt-in screen at first wallet entry
  (`TelemetryConsent.jsx`, suppressed in deniability/demo) plus a permanent toggle
  at Settings → Privacy. The gate lives in `api/trackEvent.js` — the single egress
  chokepoint — NOT in `analytics.js emit()`, because the 11 original call sites
  bypass `emit()` entirely. Declining transmits nothing and mints no device id.
  **Two chokepoints, not one (2026-07-27, PR #1410):** `trackEvent.js` gates
  EGRESS; `lib/consent.js` gates WRITES to the shared
  `veyrnox-telemetry-consent` key. Three writers existed — `TelemetryConsent
  .choose()`, the Settings switch, `WalletEntry`'s fresh-create reset — and none
  checked for a decoy/demo session, so a coerced tap could flip or wipe the real
  user's answer. `setConsent()`/`clearConsent()` now no-op there (reads stay
  ungated; reading leaves no trace). Do NOT re-guard at call sites — that
  three-place duplication is exactly how the third writer shipped unguarded.
- **veyrnox.com/privacy — the "dated 16 June / no analytics or tracking" note
  here was WRONG and is deleted.** Verified by rendering the live page
  2026-07-26: it says "Last updated: 23 July 2026" and already discloses the
  usage events. What it actually needs is the CONSENT update (it mirrors the
  pre-consent in-app §9): opt-in wording, Settings → Privacy, the fuller event
  list, and the panic-wipe line. Paste-ready copy:
  `docs/veyrnox-com-privacy-corrections-2026-07-26.md`.
  **The site source is `aljobson/veyrnox-site` — Astro on Cloudflare Pages.**
  This paragraph said it was "served by uvicorn on Render behind Cloudflare"
  and that the source was in none of our repos, which sent readers looking for
  a CMS that does not exist. Corrected 2026-09-19 from the repo's own
  description and commit history (311 PRs, actively developed).
  **The cost of the wrong note was real:** during the 2026-09-16 Transak
  outage, `veyrnox.com` is the domain in `referrerDomain` and therefore a prime
  suspect, and this line is why its repository was excluded from a
  PR-by-PR sweep of every other repo. A "we don't have the source" note is an
  instruction to stop looking — it has to be right, or it hides a whole
  surface. `aljobson/veyrnox-marketing` really is content/press only, and
  `aljobson/Veyrnox.ai` is the separate veyrnox.ai product.
- **API security hardening (PR #1334, merged 2026-07-23).** All Supabase writes
  now go through rate-limited SECURITY DEFINER functions — no direct table INSERT
  via the anon key. Controls: `track_event()` 60/device/hour + event allowlist
  (the 4 KB metadata cap this line used to claim was NEVER implemented in
  `api-security-hardening.sql`; it and a `SET search_path` pin were added for
  real in `sql/telemetry-events-allowlist.sql`, 2026-07-26 — rerun that file);
  `increment_referral()` 1 per device per code (dedup table
  prevents count-inflation attack); `generate_referral_code()` 1 per device;
  `register_referral_code()` 3/device/hour; `record_attribution()` validated +
  2/code/hour; `referral_attributions` public SELECT removed (revenue data no
  longer disclosed). Shared `lib/deviceId.js` extracted. SQL migration:
  `sql/api-security-hardening.sql`. BUILT, INTERNAL — not independently audited.
- **H-3 (2026-07-28) — `record_attribution` REVOKE appended to
  `sql/api-security-hardening.sql`, SHIP-ONLY.** Every SECURITY DEFINER function
  in that file was created with the default PUBLIC EXECUTE grant, leaving
  `record_attribution` reachable by the anon key — a caller can forge revenue
  rows against any published referral code (subject to the 2/hr rate limit and
  the $0–$1000 range), inflating a referrer's earnings display. The primary
  H-3 fix REVOKEs `record_attribution` from PUBLIC/anon/authenticated and
  GRANTs EXECUTE to service_role only. The seven other functions listed in
  `sql/check-first-referral-bonus-hardening.sql`'s STILL OPEN section receive
  the same treatment in the same commit — but six of them (`track_event`,
  `increment_referral`, `generate_referral_code`, `register_referral_code`,
  `get_referral_earnings`, `get_referral_paid_count`) still have live anon
  callers in `src/api/referralApi.js` and `src/api/trackEvent.js`. Running the
  SQL without a matching client refactor will break referral + telemetry
  writes at runtime. Owner must review before executing. Only
  `record_attribution` and `get_referral_leaderboard` are safe-immediate.
  - **CORRECTED 2026-08-07 — the "client refactor" above is DONE, and the
    remaining prerequisite is one env var, not a rewrite.** Those two modules no
    longer touch PostgREST: both `import { rpc } from '@/api/edgeApi'`, and
    `edgeApi.rpc()` is `post('/api/rpc/' + encodeURIComponent(fn), params)`.
    Nothing under `src/` contains `supabase.rpc(` or `/rest/v1/rpc`. The
    refactor landed with the Pages Functions layer in `e99dd422`; this bullet
    was written before it and was never revisited. Calls still arrive as role
    `anon` for one reason only — `functions/api/rpc/[fn].js` injected
    `SUPABASE_ANON_KEY`. **That file was the last anon caller.**
  - PR #1606 makes that proxy prefer `SUPABASE_SERVICE_ROLE_KEY` with an anon
    fallback, so it is a NO-OP until the secret is set. **Ordering is
    load-bearing:** (1) merge #1606, (2) set `SUPABASE_SERVICE_ROLE_KEY` on the
    `veyrnox-prod` Pages project, (3) verify it is set and deployed, (4) THEN
    run the REVOKEs. Running (4) first still breaks every referral and
    telemetry write — symptom is `permission denied for function <name>` from
    `/api/rpc/*`. Full runbook, including rollback:
    `docs/rpc-service-role-migration.md`.
  - **This does not close H-3, and must not be written up as if it does.**
    `record_attribution` stays in the proxy allowlist, so attribution remains
    client-INITIATED — just no longer anon-callable via PostgREST. H-3's intent
    is server-AUTHORED attribution via the RC webhook
    (`sql/referral-rc-webhook.sql`, **deployed 2026-08-10 evening; the SQL
    setter and the webhook function are both live on both envs**; RC dashboard
    webhooks configured 2026-09-08 with sandbox/production split; #1703 + #1704
    code bugs FIXED — see "First-referral bonus" section below. Only a real
    end-to-end sandbox purchase remains as verification.) Removing
    `record_attribution` from the allowlist before a real purchase has proved
    that chain would silently stop attribution being recorded at all.
  - **New standing rule:** once the service-role key is set, `ALLOWED_RPCS` in
    `functions/api/rpc/[fn].js` is the ONLY boundary in front of it, because
    service_role bypasses RLS. Never add a table-proxy route, a passthrough
    path segment, or a wildcard to any file that can read that key — with RLS
    bypassed, one such route is full database access.
  - **Process lesson, general:** this bullet described a blocker that had been
    resolved by unrelated work weeks earlier, and every subsequent session
    treated it as current because it read as authoritative. A statement about
    *another part of the codebase* decays silently — re-derive it from the code
    before acting on it, the way the CORRECTED line above was
    (`git grep 'supabase\.rpc(' -- src` returning nothing is the whole proof).

**All 10 assets LIVE** — ETH, MATIC, ARB, OP, AVAX, BNB, BTC, SOL, USDC, USDT.

**Play Store: LIVE on internal testing (2026-07-22).** Upload-key reset approved
2026-07-22 09:29 UTC. Release 5 (1.0) uploaded and published to internal testing track.
Upload key: `veyrnox-upload.jks` (SHA-1 `97:5A:05:8E…:BA:B2:F3`). App signing cert
(Google's): `D8:99:69:D5:C4:9F:39:50:A8:CA:20:03:13:C5:0E:B1:09:37:E3:9B:62:4B:38:64:
3F:B3:A0:4F:63:44:6C:B9`. RASP `detectTamper` verified clean on stock Pixel 10 (no
Security Alert). Play Billing (IAP) device-verified on internal track. GitHub Secrets
(`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`,
`RELEASE_CERT_SHA256`) updated 2026-07-22 for CI.
- **versionCode: THIS BULLET DOES NOT STATE THE CURRENT VALUE, DELIBERATELY.
  Read it from the file:**

  ```bash
  git show origin/main:android/app/build.gradle | grep -n 'versionCode'
  ```

  There is still exactly one declaration — product flavours added in #1890 do
  NOT override it — but no line number is given here either, because that moved
  too (it was line 25, it is now further down).

  **Twice now this line has been wrong, and the second time it was wrong about
  its own remedy.** It said `32` until 2026-09-01, eight bumps behind. It was
  corrected to `40`, and by 2026-09-09 the real value was `48` — eight bumps
  behind again — while the correction itself told readers to consult
  `android/app/build.gradle:25`, a line that no longer held the declaration. A
  number that moves almost daily does not survive being written down, and
  neither does a pointer to where it lives. **Do not "helpfully" restore the
  current value here.** Writing it down is the defect; the command above is the
  fix.

  The bump ledger below is kept for a different reason and is still worth
  maintaining: a versionCode consumed on Play can never be reused, so this is
  the record of what has been spent, not a statement of where the counter is.
  Bumps: 5→6 (#1319), 6→7 (#1737), 7→8 (#1747), 8→10 (#1890), 10→11 (#1974),
  11→32 (#1975, PLR Robo onboard), 32→33 (#1986), 33→34 (#2031), 34→35 (#2033),
  35→36 (#2036), 36→37 (#2107), 37→38 (#2137), 38→39 (#2161), 39→40 (#2197),
  40→41 (#2302), 41→42 (#2346), 42→43 (#2355), 43→44 (`ae825dbf`, first Closed
  testing upload), 44→45 (#2397), 45→46 (#2407), 46→47 (#2410), 47→48 (#2433),
  48→49 (#2540), 49→50 (v1.0.2 train).
  - **Codes 1–11 consumed on Play.** 1–5 from early uploads; 10–11 consumed by
    `firebase-test-lab.yml`'s duplicate `publish-android-staging` job (removed in
    #1980) before `ci.yml`'s `publish-to-play-internal` could use them.
  - `ci.yml` is now the **single** Play upload path. The firebase duplicate was
    removed because it raced CI and silently consumed versionCodes.
  - Gating context: **no Play Pre-launch report exists for ANY versionCode** —
    verified in the console 2026-09-01 against candidate 40, still empty
    2026-09-04 for 41. Root cause not established (app still `com.veyrnox.app
    (unreviewed)` — never gone through app review; Google's Console suggests
    Closed testing). **#1960 CLOSED 2026-09-04** on the accepted-residual
    reasoning: Firebase Test Lab now provides equivalent crash/ANR data on
    the same Robo infrastructure, and is the primary automated gate going
    forward. The Play Pre-launch empty state is left
    open as accepted residual; if wanted, the recommended path is upload to
    Closed testing + send for review (blocked on the Aug 12 rejection risk).
  - **⚠ THE SUBSTITUTE HAS NEVER PASSED EITHER. Established 2026-09-09 by
    reading the job log of every Robo matrix that exists.** The sentence above
    used to end "— 265 UI actions clean on versionCode 41 (Pixel 8, Android 14,
    matrix `matrix-hhpcvb8uffw6a`)". That was FALSE, and it is the evidence
    #1960's closure rests on, so the closure rationale is materially weaker
    than recorded:

    | matrix | was cited as | job log actually says |
    |---|---|---|
    | `matrix-hhpcvb8uffw6a` (Sep 4, vc41) | 265 UI actions clean, Pixel 8 | `Failed` · `Test failed to run`, ONE device (`shiba-34`), `Test time = 610` against a 600s (`10m`) budget |
    | `matrix-1delt54g28ira` (Sep 4, ~vc44) | 267 UI actions, no app crash | `Failed` ×3 · `Test failed to run`, `Test time = 611/611/610` against the same 600s budget |
    | `matrix-7rkpltfw6gsza` (Sep 9, vc48) | — | `Failed` ×3 · `Test failed to run`, `Test time = 1214/1211` against a 1200s (`20m`) budget |

    Every device in every matrix ran to its timeout and returned
    `toolResultsStep: null`, `toolLogs: []`, `toolOutputs: []`, `outcome: null`,
    `infrastructureFailure: null`. Doubling the budget doubled the runtime and
    changed nothing else. **No UI-action count has ever appeared in a log read
    on 2026-09-09** — the "265"/"267" figures have no source I could find; do
    not reinstate either without naming the artifact it came from.
  - **Why the crawl fails is NOT established.** By shape it is neither an
    install failure (those die in seconds), an infrastructure failure (that
    field is explicitly null), nor a crash (that sets an `outcome` carrying a
    failure detail). The crawler waited for something until it was killed.
    Ruled out by direct inspection of the exact APK sent to Firebase
    (`app-google-firebaseTest.apk` from run 34331563602): the Capacitor payload
    is intact (1061 files under `assets/public/`, `index.html` present), no
    `VITE_BYPASS_RASP`/`DEV_UNGATE_SEND`/`DEMO_MODE` is `"1"`, and the robo
    script's first click target `New wallet` is live at
    `src/components/EntryTiles.jsx:21`. Remaining candidates — a RASP
    fail-closed screen on datacenter hardware, or Robo never attaching — need
    the per-device `logcat` and `robo_results.pb` from the GCS results bucket,
    which the workflow deliberately never prints because they may carry wallet
    state. Reading them needs the service-account credentials.
  - **Standing rule this produced: read the outcome table, not the run status.**
    Both figures survived because the workflow RUN was red for an
    unrelated-looking reason every time, so nobody read past the job status
    into the step. `gh run view <id> --json conclusion` does not tell you
    whether a crawl passed — the `OUTCOME` / `TEST_DETAILS` table inside the
    `Robo crawl` step's log does, and `Test time` against the `--timeout`
    budget is what distinguishes a real crawl from one that was killed.
- **Release build verified end-to-end 2026-07-23** (INTERNAL): signed `app-release.aab`,
  `jarsigner` verified, `BuildConfig.RELEASE_CERT_SHA256` = Google's app-signing cert.
  Fixed en route: `keystore.properties` `storeFile` resolved against the wrong directory
  (release path was dead), and the debug-fingerprint guard PR #1310 added had been silently
  dropped by PR #1313. See `docs/audit-2026-07-23-branch-review.md`. RASP on a Play
  install still device-unverified.
- **The debug-cert guard — FIXED 2026-07-26 (#1386 + #1391), issue #1373 CLOSED.**
  Two earlier versions of this line were wrong in opposite directions: first it claimed
  "CI now asserts the guard's rejections" while the assertion had never once passed, then
  it said the guard was inert and unfixed after #1386 had already landed. Current state,
  read from merged code rather than assumed:
  - **The guard fails closed** (`android/app/build.gradle`). #1386 replaced the
    fail-open `sha256Of` — which returned `null` on a missing storeFile and swallowed
    every exception — with a candidate sweep (`debugCandidates` × alias variants) that
    **throws** if nothing resolves, listing what it tried. #1391 closed the matching
    fail-open on the UPLOAD branch: a release keystore that exists but cannot be opened
    (wrong password/alias) no longer skips the comparison in silence. Both have explicit,
    typed-on-purpose escape hatches — `-PALLOW_MISSING_DEBUG_KEYSTORE=true` and
    `-PALLOW_UNREADABLE_UPLOAD_KEYSTORE=true`.
  - **The regression test now runs on PRs** (`release-guard-scope` + `release-cert-guard`
    in `ci.yml`). This is the half that mattered most: the test used to live inside
    `android-release`, gated on `github.ref == 'refs/heads/main' && event != pull_request`,
    so **no PR could ever catch a regression**. That is why an inert guard survived ~15
    merges over two days — every red run on main looked caused by whatever had just
    landed. The job also asserts the CORRECT fingerprint still builds, because a guard
    that rejected *everything* would otherwise pass all four rejection cases.
  - **Fail-closed guards need their preconditions built first.** #1386 alone made
    `android-release` worse, not better: it hard-failed on a missing debug keystore while
    the keystore was only created inside the test step that ran *after* the build. A
    revert was opened (#1389) and closed in favour of #1391, which creates the debug
    keystore before the build steps instead.
  - Fourth regression of this same guard: #1310 added → #1313 silently dropped → #1325
    restored → #1338 caught it → inert until #1386/#1391. If you touch it, the standing
    test is the thing keeping it honest — do not weaken it to make a build pass.
  - **Verified:** `android-release` succeeded on `main` at `ffe795ed` (run `30219992941`)
    — the first green run of that job since 2026-07-24. INTERNAL/CI evidence only; RASP
    on a Play install remains device-unverified, and no release has been shipped from it.
- **Personal** developer account: 12-tester/14-day rule gates **production only**.
- Data Safety: all 9 owner-decisions resolved (`docs/play-launch/data-safety-form.md`).
- **Apple account is now an Organization (Veyrnox LTD, Team R54268MWFV)** — Guideline
  3.1.5(b) satisfied.
- **THE APP IS LIVE ON THE APP STORE. Verified 2026-09-06 — this file said "First App
  Store submission still to do" for six weeks after it shipped.** Two independent
  sources, one of which needs none of our credentials:
  - ASC API (app `6790188660`): `1.0` → `appStoreState: READY_FOR_SALE`;
    `1.0.1` → **`READY_FOR_SALE`, live, build 59** (re-read 2026-09-19). This line
    read "`READY_FOR_REVIEW`, created 2026-07-30, staged and never submitted
    (consistent with the 1.0.1 hold, which remains in force)" until then. The hold
    was lifted, 1.0.1 was submitted 2026-09-08, rejected twice, resubmitted
    2026-09-11 (submission `3ca728bd`) and APPROVED. Builds 60 and 61 exist in the
    repo only and were never attached to a store version.
  - Public iTunes lookup: `Veyrnox`, seller `Veyrnox LTD`, version `1.0`, released
    2026-07-28, free, min iOS 15.0 —
    https://apps.apple.com/us/app/veyrnox/id6790188660
  **BOTH STORES ARE NOW LIVE — and the lesson under this heading survives its own
  facts being inverted, which is why it is kept rather than deleted.** It read: *"Apple
  and Play are OPPOSITES, and conflating them is the trap. Play has never had a
  declaration reviewed (app is `Draft`, all 10 App content declarations sit at `Ready to
  send for review`, temporary name `com.veyrnox.app (unreviewed)`). Apple has a live
  public product page."* That was written because a session inferred the Apple state
  from the Play state and was wrong. The two stores have since converged, so the same
  inference would now happen to land — **do not read that as the rule being repealed.**
  It was never "the stores disagree"; it is "a finding about one store is not evidence
  about the other", and an inference that is accidentally right today is not a method.
  Play evidence, 2026-09-19: `play.google.com/store/apps/details?id=com.veyrnox.app`
  returns 200 in US and GB and renders "Updated on Sep 11, 2026", while a bogus package
  id on the same host returns 404 — a `Draft` or closed-testing-only app has no public
  listing at all. **That is a read of the PUBLIC PAGE, not of the Play Developer API**,
  so it establishes that the app is published and nothing about which `versionCode` is
  live in production. `versionCode 49` reached Closed testing (`alpha`) 2026-09-13,
  which is a different track and is not evidence about production. Anyone with Play
  Developer API access should re-derive the production code rather than trust this
  paragraph.
- **IAP: Safety Plus is APPROVED by Apple, not pending.** `safety_plus_annual` and
  `safety_plus_monthly_v2` are both `state: APPROVED`. The newer **AI Security
  Protection** group is NOT: `ai_security_protection_annual_2` and
  `ai_security_protection_monthly_2` are `READY_TO_SUBMIT`. So "IAP submission" is done
  for one tier and outstanding for the other — do not write either state onto both.
- **A REAL PRODUCTION PURCHASE HAS BEEN COMPLETED. Settled 2026-09-06** (RevenueCat
  project `proj82381f44`). This file said "no real purchase has been completed on either
  platform"; that is false.
  - **Safety Plus Monthly v2 (`safety_plus_monthly_v2`), App Store, purchased in the
    month of 2026-08-01, still active on 2026-09-06.** Revenue chart: **5.99, 1
    transaction**, `store: App Store`. Overview: 1 active subscription, MRR ~5. Active
    every week continuously from the week of 2026-08-02 onward.
  - **Why this is production and not the documented sandbox purchase**, which was the
    open question: sandbox transactions generate NO revenue, and this one recorded
    revenue and a counted transaction. Corroborating, an Apple sandbox monthly
    subscription renews on an accelerated clock and self-expires within about half an
    hour, so it cannot show as continuously active across five weeks. The `actives`
    chart also exposes no sandbox dimension at all.
  - **It was bought at FULL PRICE — `original_offer_type: "No offer"`.** So the claim's
    *purpose* survives its wording: **no promotional-offer path has ever been exercised
    by a real purchase.** None of the 10 store-side offers (4 referral tiers + retention
    50%, monthly and annual) has been verified end to end, on either platform. Correct
    the sentence; do not delete the caveat it was carrying.
  - Reach, for scale: **574 new customers and 578 active users in the last 28 days.**
    Any "not yet launched" framing anywhere in this file is wrong.
- **iOS build history — corrected 2026-08-08 by querying ASC directly.** This file
  previously said "1.0 (2) uploaded 2026-07-23" and stopped there; the actual state
  is longer and the 1.0 train is now retired.
  - 1.0 (1) uploaded 2026-07-21 — READY_FOR_BETA_TESTING
  - 1.0 (2) uploaded 2026-07-23 (PR #1329, promotional-offer path + offer-price fix +
    inlined privacy policy) — sat at MISSING_EXPORT_COMPLIANCE, which is why (3) and
    (4) followed on the same day
  - 1.0 (3) uploaded 2026-07-23 — READY_FOR_BETA_TESTING
  - 1.0 (4) uploaded 2026-07-23 — READY_FOR_BETA_TESTING
  - **1.0 train then closed by ASC** for new build submissions (error 90186), so no
    further `1.0 (n)` upload is possible regardless of build number
  - **1.0.1 (1) uploaded 2026-08-08** (PR #1639) — processing VALID,
    READY_FOR_BETA_TESTING internally, READY_FOR_BETA_SUBMISSION externally. New
    train opened. INTERNAL evidence only; no real-device RASP verification yet.
- **CLI upload works — Xcode GUI is NOT required.** Earlier notes said the
  `xcodebuild` CLI failed on signing auth; that applied to device *runs*. With an
  App Store Connect API key the whole chain runs unattended:
  `archive` → `-exportArchive` → `xcrun altool --upload-app`. Key lives at
  `~/.appstoreconnect/private_keys/AuthKey_4YG883H874.p8` (Admin, since 2026-09-06;
  supersedes the App Manager key `JPG8Z9ADUY`), Issuer ID
  `2d4c5bd7-1de3-4953-b203-a92e788c2d7c` — the Issuer does NOT change when a key is
  rotated.
- **App Manager role is NOT sufficient for the "cloud signing" path — corrected
  2026-08-08.** This file used to claim it was; the 2026-08-08 upload session proved
  otherwise. Concretely: an App Manager key CAN mint provisioning profiles and
  certificates via direct API calls (`POST /v1/certificates`, `POST /v1/profiles`),
  but xcodebuild's `-exportArchive` "cloud signing" mode (triggered by passing
  `-authenticationKey*` args together with `signingStyle: automatic`) tries to have
  Apple mint the Distribution CERT server-side, and that step requires **Admin**.
  Symptom is `Cloud signing permission error / No signing certificate "iOS
  Distribution" found` even when a valid cert already exists in the keychain.
  Two working paths:
  - **Admin API key** → single-step `exportArchive` with `destination: upload`, done.
  - **App Manager key (current)** → provision cert + profile out-of-band via API
    (`/tmp/veyrnox-dist/create-cert.mjs` and `create-profile.mjs` in the 2026-08-08
    session; not committed), set `ExportOptions.plist` to `signingStyle: manual`
    + `destination: export` naming the profile explicitly, then upload the resulting
    `.ipa` with `xcrun altool --upload-app`. `ios/App/ExportOptions.plist` is
    already pinned to this shape (PR #1639).
  **ESCALATED 2026-09-06 — this bullet is now HISTORY, not current state.** The key is
  Admin (`4YG883H874`), so the single-step `exportArchive` path above is available.
  Verified at escalation: `analyticsReportRequests` returns 200 where the App Manager
  key returned `403 FORBIDDEN`, and `/v1/users` reports `['ACCOUNT_HOLDER','ADMIN']`.
  The old App Manager key `JPG8Z9ADUY` is superseded.
  **`ios/App/ExportOptions.plist` is still pinned to `signingStyle: manual` +
  `destination: export` (PR #1639) and MUST STAY THERE until a real archive proves the
  cloud path end to end.** Admin makes cloud signing *possible*, not *proven* — flip the
  plist in its own commit, verified by an actual archive and upload, so a signing
  regression cannot hide inside a role change.
  The previous advice read: *"Only escalate the key to Admin if the manual path becomes
  a bottleneck; keeping it at App Manager preserves the least-privilege posture for the
  checked-in `.p8`."* Half of that was wrong — **no `.p8` has ever been tracked in this
  repo**, verified 2026-09-06 by `git ls-tree` on `main` and
  `git log --all --diff-filter=A -- '*.p8'`, both empty. The least-privilege point stood
  on its own and was weighed: an Admin key is full account control on a laptop, accepted
  deliberately for cloud signing. `*.p8` is now gitignored so the phrase cannot become
  true by accident.
- **The export-compliance "blocker" was stale.** The locked French declaration was
  NOT blocking submission — uploads and submission were fine. The real gap was
  **Model Reporting Rules for Digital Platforms (MRDP)** sitting at "Missing Info"
  on the Veyrnox LTD business entity; answered 2026-07-23 (personal services = No)
  and now Active. Banking/Paid Apps/tax forms were Active throughout.
  Always check App Store Connect directly before treating a note as current.
- `ITSAppUsesNonExemptEncryption` set to `false` in Info.plist (PR #1332) — Apple
  no longer asks the encryption questions at submission. The France declaration
  requirement is resolved. See `docs/play-launch/export-compliance-counsel-note.md`
  for the counsel rationale.
- `veyrnox.com` is **Astro on Cloudflare Pages** (`aljobson/veyrnox-site`), and it
  server-renders: `curl https://veyrnox.com/` returns the real content, headers and
  all. This line said it was "a client-rendered SPA" where `curl` gives false
  negatives — that was true of an earlier deployment and is not true now, and it
  discouraged the cheapest possible check. Verified 2026-09-19: plain `curl` returns
  200 with the full document, `content-security-policy` and
  `referrer-policy: strict-origin-when-cross-origin` visible in the headers, and no
  bot challenge for `curl`/`python-requests`/bot user agents.
  Two things worth knowing about those headers, because Transak reads them:
  `referrer-policy` is the value Transak's docs recommend (a `no-referrer` here
  would break their runtime domain validation), and the CSP's `frame-src` lists
  only YouTube — **no Transak origin** — so an iframe Buy served from this domain
  would be blocked outright.

**1.0.1 SUBMISSION HOLD — BOTH stores (owner-locked 2026-08-12). RELEASED
2026-09-08; both stores submitted that day. The paragraph below is the original
lock text and is kept as the record of why the gate existed — read it as
history, not as a live block.**

> **1.0.1 SUBMISSION HOLD — BOTH stores (owner-locked 2026-08-12).** No submission to
> Play OR App Store review until every check in this section passes. Owner-decided
> after the build-5/6 Play rejection; do not attempt "just one more submit" reasoning.
> Pre-submission verification below is the gate.

**Release record (added 2026-09-09; outcome appended 2026-09-19).** Both submissions
were made on 2026-09-08: App Store 1.0.1 build 57, and Play versionCode 48 promoted
from Internal to Closed testing — Alpha and sent for review with managed publishing ON.
Full per-item state in `docs/RELEASE-v1.0.1-APPLE-SUBMISSION.md` and
`docs/RELEASE-v1.0.1-PLAY-SUBMISSION.md`.

**BOTH SHIPPED. The record stopped at "submitted" for eleven days.** Apple: build 57
was rejected twice on 2026-09-08, then build 59 was submitted 2026-09-11 and approved —
1.0.1 is `READY_FOR_SALE`. Play: the public listing exists and reads "Updated on
Sep 11, 2026". Neither of those outcomes was written down here until 2026-09-19, and in
the meantime this file, `docs/RELEASE-v1.0.1-APPLE-SUBMISSION.md` (header still reads
"REJECTED TWICE, REPLIED … awaiting Apple's response") and `src/lib/featureCatalogue.js`
all described a pre-release app to every session that read them. The catalogue was
corrected in PR #2622; the Apple submission doc has NOT been and is still stale.
**"Submitted" is a state with an outcome, and nothing in this repo goes back to
collect it.** A submission record needs its result written into it, in the session that
learns the result — the same rule the 1.0.1 hold above already states for holds.

- **Apple — all three checks met.** The mandatory `.ipa` byte-check ran against
  the exported `Payload/App.app/public/assets/index-*.js` and returned no matches
  for `VITE_(BYPASS_RASP|DEV_UNGATE_SEND|DEMO_MODE):"1"`; the stock-iPhone
  golden-path walkthrough was performed and confirmed by the owner (an owner
  attestation, not a captured artifact — recorded honestly as such); TestFlight
  Crashes and Xcode Organizer Hangs were zero on build 57 per ASC
  `diagnosticSignatures`. Apple then rejected twice the same day, on promoted-IAP
  imagery (2.3.2) and on Guideline 2.1 → 3.1.5(iii) crypto-licensing evidence for
  the Buy → Transak flow — **neither rejection was the KEK/RASP failure this hold
  was built to prevent.**
- **Play gate 2 (Pre-launch report) was WAIVED, permanently.** No report has ever
  been generated for any of the 39+ bundles uploaded, root cause never
  established. #1960 was closed 2026-09-04 as an accepted residual by owner
  decision, with Firebase Test Lab Robo named as the substitute. That closure is
  the recorded basis for the waiver.
- **Play gate 4 (Android Vitals) was WAIVED as structurally unobtainable
  pre-publish.** Vitals only fills from Production/Open/Closed-testing installs
  whose testers share usage and diagnostics; on a `Draft` app the check is
  vacuous, not merely unmet. It becomes meaningful only after Publish.
  **READ 2026-09-19, and it is EMPTY — a third state, neither "structurally
  unobtainable" nor "clean".** The app is published so the gate is obtainable,
  and it was queried directly against the Play Developer Reporting API:
  `crashRateMetricSet`, `anrRateMetricSet`, `errorCountMetricSet` and
  `errorIssues:search` all return `{}` for `com.veyrnox.app` across
  2026-07-01 → 2026-09-18. Zero rows, not zero crashes. **An empty Vitals is NOT
  a pass** — it fills only from installs whose users enabled Usage & diagnostics,
  and Play suppresses metrics under a privacy threshold, so with a days-old
  production listing and a small closed-testing cohort there may simply be no
  qualifying installs. Re-run before each submission; it costs a minute.

  **The tool built for this gate could never have told you that, and said the
  opposite.** `scripts/play-vitals.sh` requested an end date of `now-24h` while
  DAILY freshness runs ~2 days behind, so every run returned
  `400 INVALID_ARGUMENT`; and its `jq -e '.rows // empty'` test then fell through
  to printing *"no crash-rate data yet"* — the benign, expected-empty message its
  own header describes. **An API error rendered as a clean-ish result, every
  time, and it had never produced a reading.** Rewritten 2026-09-19: freshness is
  queried from the API and the window clamped to it, `.error` is checked before
  `.rows`, ERROR / EMPTY / DATA are three distinct outcomes, and an error exits 2.

  **Credential note, because "no credential" was the wrong conclusion.** No
  `PLAY_SA_JSON` exists on this machine, but the Firebase Test Lab service
  account `github-actions-testlab@veyrnox-wallet.iam.gserviceaccount.com` already
  has Play Developer Reporting access, and `gcloud auth print-access-token
  --account=<sa> --scopes=<playdeveloperreporting>` mints a scoped token with no
  key file on disk. The script now accepts `PLAY_VITALS_ACCOUNT` for exactly
  this. The interactive user credential does NOT work — it returns
  `PERMISSION_DENIED: Request had insufficient authentication scopes`.

  Do not carry the old waiver forward to the 1.0.2 submission on the
  "unobtainable" reasoning; it is obtainable, it was read, and it is empty.
- **Play gate 3 (the Robo substitute) was WAIVED 2026-09-10 as accepted
  residual (owner decision).** Four sequential fix attempts landed on `main`
  between 2026-09-09 and 2026-09-10 — #2484 (DEVICE_NOT_SECURE actionable copy),
  #2487 (Slice L auto-heal `!error` guard), #2500 (RootErrorBoundary + boot
  watchdog), #2510 (diagnostics widening). Every one passed local + CI; every
  one left the FTL Robo crawl red. Diagnostic evidence pulled from GCS bucket
  `veyrnox-400ae-testlab-results` for matrix
  `robo-terminate-2497-20260910T141344Z-10340` (built from `3b5a9188`, both #2487
  and #2500 present) confirms: app launched, no crash, no ANR, no RASP block
  (logcat 13,482 lines), Robo tapped through PIN entry via accessibility tree
  and Submit PIN successful at t=62.4s (dst=4), then screen transitioned dst=4
  → dst=1 during the 30s post-PIN wait with the DEVICE_NOT_SECURE message
  absent at assertion time. All screenshots after FTL splash rendered black
  on `#050608`. The pattern is: Robo tooling matching against a dark-theme app
  with async KEK/Argon2id state machines is not a reliable signal on this
  app's security model. **Sole release evidence going forward: owner
  stock-device walkthrough** (row 5 of the pre-submission checklist below),
  plus Play Vitals post-install crash/ANR + TestFlight/Xcode Organizer hangs
  as post-launch signals. This waiver extends #1960's precedent — that closure
  named FTL Robo as Pre-launch report's substitute, and FTL Robo has now
  itself failed to produce a passing run at any versionCode. Tracking issues
  closed the same day: #2497 (FTL never passed), #2511 (Samsung SCG13 PIN-pad
  drift), #2512 (Slice L auto-heal secondary race). All three closed as
  accepted residual with the same rationale; do not reopen as an automated
  gate. The #2484/#2487/#2500 fixes remain in the tree because they help real
  users on real devices — the FTL red was Robo instrumentation, not a
  user-facing defect.

  **Historical note (pre-waiver).** This bullet previously read (2026-09-09):
  *"Play gate 3 is UNMET — not 'met weakly'. This bullet read 'is met only
  weakly' and named matrix `matrix-1delt54g28ira` (Sep 4, versionCode ~44) as
  the crawl standing in for the gate. There is no weak pass to grade: that
  matrix failed on all three devices with `Test failed to run`, as did every
  other matrix ever run… nothing has been crawled. The 48 non-test src/
  commits between 44 and 48 still include `0dc4f673`, a fix for the Send
  chunk blanking on cold parse, which is exactly the class of failure a Robo
  crawl exists to catch and which therefore remains uncovered by any
  automated gate. Tracked as F-2 in `docs/security-diffs/diff-2026-09-09.md`.
  Row 5 (the owner's stock-device walkthrough on 48) is separate, stronger,
  human evidence and is unaffected — it is currently the ONLY thing covering
  this ground."* The 2026-09-10 owner decision accepts row 5 as the sole
  substitute rather than treating the automated gap as a defect to be closed.

**No explicit release decision was written down on the day** — the hold text was
simply overtaken by the submissions, and for a day this file said "do not submit"
while both submissions were live. That is the whole reason this record exists: a
lock that cannot distinguish *released* from *violated* is not recording the
decision it was written to record. **If a hold is lifted, amend it here in the
same session.**

**The checklist below is NOT retired.** It remains the standard for the next
submission of any build to either store — a resubmission after an Apple rejection
included. Gate 2 stays waived on the #1960 reasoning; gate 3 was waived
2026-09-10 as accepted residual — owner stock-device walkthrough (row 5) is
now the sole substitute, and FTL Robo runs are advisory-only. `firebase-test-lab.yml`
stays wired but its failure is not a required check on `main` (verified 2026-09-10:
required contexts are `verify`, `unit-tests`, `Release-cert guard rejects wrong
fingerprints`, `mainnet-flag-gate`, `staging-gate` — none of them FTL).

**Pre-submission verification (BOTH stores) — MUST run before any human review
submission, including every 1.0.2 build.** Added 2026-08-12 after Play rejected
build 5 under Broken Functionality policy: reviewer tapped Create Wallet on a
stock device and the setup failed with `"Wallet setup couldn't finish securely,
so nothing was saved. Please set your PIN and try again."` — an unresponsive-UI
outcome from our KEK/RASP path failing closed on hardware we never tested.
Neither store's automated tools caught it because neither had been run against
build 5 (Play Pre-launch report showed
"Upload artifacts to generate pre-launch reports"; iOS has no equivalent auto-tool).

The heading on this block read "for 1.0.1" until 2026-09-20, which made it look
retired the moment the 1.0.2 train opened. It was never version-scoped — the
paragraph above already calls it the standard for the next submission of any
build to either store — so the version came out of the heading rather than being
bumped, which would only have set the same trap for 1.0.3.

- **Play (SUPERSEDED 2026-09-10):** this bullet described "confirm a Pre-launch
  report exists" as mandatory before promoting to review. Both automated Play
  checks (Pre-launch report AND FTL Robo substitute) are now WAIVED as accepted
  residual per the 2026-09-04 (#1960) and 2026-09-10 owner decisions above. The
  mandatory check has moved to owner stock-device walkthrough (row 5); FTL runs
  are advisory-only. The historical text is preserved below because the
  failure-mode reasoning still explains why row 5 exists — a real reviewer on
  hardware you haven't tested is what row 5 substitutes for.

  *Historical, pre-waiver:* upload the AAB to Internal testing → open **Test and release →
  Testing → Pre-launch report → Overview** and confirm a report exists for the new
  versionCode. Fix every crash/ANR/error dialog it reports before promoting to review.
  Do NOT submit for review without a clean report — this is the same tool
  Google's reviewer would have used, and its absence is why build 5 shipped a fatal
  Create-Wallet path.
  Current Android candidate: **1.0.1 / versionCode 40** (released to Internal
  testing 2026-08-31 22:05). This check remains console-only: a green repo/CI
  state does NOT prove the report exists yet.
  - **Verified in the console 2026-09-01: NO pre-launch report exists, for 40 or
    for any of the 39 bundles uploaded to date.** Overview and Details both show
    the empty "Upload artifacts to generate pre-launch reports" state; Settings
    is configured (Robo script `plr-onboard.json`, 4 en locales, no test
    credentials, no deep links). So this is not "not generated yet for the newest
    build" — it has never been generated at all.
  - **This bullet used to say: if Overview is empty after ~30 min, "enable it in
    Pre-launch report → Settings (auto-run must be ON)". There is no such
    toggle.** That Settings page contains only test-account credentials, three
    deep-link fields, language selection and the Robo script slot. Following that
    instruction leads nowhere, which is probably why the gap has survived from
    versionCode 33 to 40.
  - Root cause NOT established. Candidates seen but unverified: the app still
    carries the temporary name `com.veyrnox.app (unreviewed)`, and the Overview
    copy suggests uploading to the **closed** testing track. Do not act on either
    as fact — the owner has stated Internal testing is the intended track. See
    #1960. **Both candidates are probably dead as of 2026-09-19: the app has
    published, so it has been through review and the `(unreviewed)` name cannot
    still apply.** Not re-checked in the console — flagged as likely stale rather
    than corrected, because nobody has looked.
- **iOS (mandatory — no equivalent auto-tool):** upload to TestFlight, install on at
  least one **physical iPhone that is NOT the dev machine's paired device** (a stock
  iPhone with no dev certs / no Xcode-installed KEK state), and walk the full
  first-run: fresh install → PIN → Create Wallet → seed reveal → import round-trip
  → send/receive on testnet. This is the closest analogue to Google's reviewer
  actually running the app; Apple's review has the same shape and same failure mode.
- **iOS — rebuild the webview payload before archiving (mandatory).** Run
  `npm run build && npx cap sync ios` immediately before any archive. `ios/App/App/public`
  is the Capacitor webview payload and is **gitignored** (`ios/.gitignore:4`), so whatever
  a previous local run left there is what Xcode packages — `xcodebuild archive` does NOT
  rebuild the web bundle. A dev bundle left in that directory carries the flags a dev
  build was made with. Verified on this machine 2026-08-15: the resident bundle was
  `MODE:"production"` with `VITE_BYPASS_RASP:"1"` and `VITE_DEV_UNGATE_SEND:"1"` inlined.
  Nothing shipped — it is untracked and absent from `origin/main`, and `cap sync`
  overwrites it — but an archive taken without that rebuild would have submitted a
  RASP-bypassed build to Apple. Cheap check on the built `.ipa` before uploading — must
  print nothing:

  ```
  unzip -p App.ipa 'Payload/App.app/public/assets/index-*.js' \
    | grep -oE 'VITE_(BYPASS_RASP|DEV_UNGATE_SEND|DEMO_MODE):"1"'
  ```

  Match the **value**, not just the name. Vite inlines the whole `import.meta.env` object,
  so a build that legitimately sets these to `"0"` still contains the key — a bare
  `grep VITE_BYPASS_RASP` would fire on a clean build. Verified against the resident
  bundle: the name appears once, as `VITE_BYPASS_RASP:"1"`.
- **Both stores — hard rule:** the golden path (Create Wallet + Import Seed +
  Send/Receive) must succeed on a device the developer has never touched with a
  debug build. If it fails, the KEK/RASP fail-closed path is the first place to look
  — that path is designed to reject, and "reject silently on a device we never
  tested" reads to a reviewer as an unresponsive button.
- **Play — Android Vitals watch (mandatory, post-install telemetry):** during the
  Internal-testing window, open **Monitor and improve → Android vitals → Crashes
  and ANRs** for the new versionCode. Zero crashes AND zero ANRs required before
  promoting to review. Vitals only fills from installs that opted into usage +
  diagnostics sharing, so every internal tester must toggle **Settings → Google →
  Usage & diagnostics → ON** on their device before installing. Vitals is
  complementary to Pre-launch report, NOT redundant: Pre-launch is one Robo crawl
  on ~10 devices; Vitals is every real install over time. A clean Pre-launch report
  with a red Vitals crash cluster still blocks submission.
- **iOS — TestFlight crash + Xcode Organizer watch (mandatory equivalent):** Apple
  has NO Pre-launch-style Robo crawl. Post-install telemetry lives in two places:
  **App Store Connect → TestFlight → Crashes** (per build, opt-in via tester
  device's Settings → Privacy → Analytics & Improvements → Share with App
  Developers → ON) and **Xcode → Window → Organizer → Crashes / Metrics / Hangs**
  tabs for the shipped build. Zero crashes AND zero hangs on the new build across
  the TestFlight window required before promoting to App Store review. Read
  Organizer's **Metrics → Hangs** in particular — an unresponsive UI without a
  crash still reads to Apple's reviewer exactly like Play's Broken Functionality
  finding.

  **Run the API read too, not just the two consoles. Mandatory from 1.0.2:**

  ```bash
  ASC_KEY_ID=<key id> ASC_ISSUER_ID=<issuer id> bash scripts/asc-crashes.sh
  ```

  It reads three things the consoles show separately — tester crash submissions,
  `diagnosticSignatures`, and Organizer `perfPowerMetrics` — and it exits 2 if any
  query errored, so an unread gate cannot pass as a clean one. **Read the words,
  not the numbers.** Four outcomes are deliberately distinct and only one of them
  is a pass:

  | outcome | means |
  |---|---|
  | `CLEAN` / `0 diagnostic groups` | measured, and genuinely zero |
  | `EMPTY` | the resource answered with no rows — unmeasured, NOT clean |
  | `UNAVAILABLE` | HTTP 404, the build has no such resource — never a zero |
  | `ERROR` | the query failed; exit 2 |

  A run that is `UNAVAILABLE` or `EMPTY` everywhere has told you nothing and does
  not satisfy this row. Measured 2026-09-20: nine of the ten most recent builds
  return 404 for both per-build endpoints — only the RELEASED build had either —
  and `perfPowerMetrics` on that one was `EMPTY`. So on a fresh TestFlight build
  this check will usually be silent, and its real yield is the crash-submission
  and tester-feedback half.

  **Read the tester feedback comments the script prints, every time.** This row
  exists in its current form because of what they contained. On 2026-08-16 a
  tester filed *"App is not loading"* against 1.0.1 build 11, five minutes after
  that build finished uploading, with zero screenshots attached — it was filed
  from the TestFlight app because the app itself would not come up. It was a real,
  total, native-only unlock failure: #1825 had shipped the `UNLOCK_SUPERSEDED`
  race guard without the three fixes that followed it (#1876, #1880, #1892), so on
  a Secure Enclave device **every** PIN unlock fired Face ID, backgrounded the
  app, tripped the unsuppressed `appStateChange` listener, and aborted the unlock
  — surfacing as *"Incorrect PIN"* and incrementing the panic-wipe counter toward
  a wipe at ten. `web-e2e-tests` was green throughout, because a browser has no
  Face ID to background it. **Nobody read that report for five weeks**, because
  the script backing this row queried only `diagnosticSignatures` and never asked
  for crashes or feedback at all. A one-line free-text comment was the only signal
  any real device ever gave.

  Attribution caveat, because it matters for the next one of these: build 11 has
  no commit pinning it — `CURRENT_PROJECT_VERSION` in the repo read `10` from
  2026-08-14 until the bump to `16` on 2026-08-16, so 11 was an uncommitted local
  bump. #1825's presence is inferred from merge time (2026-08-15 20:24Z) against
  upload time (2026-08-16 04:50Z), not read off a build record. **A TestFlight
  build that cannot be traced to a commit cannot be diagnosed from the repo** —
  if a build is worth uploading, commit the version bump that made it.

  **A zero crash count is only evidence if the endpoint is answering.** The script
  reads `betaFeedbackScreenshotSubmissions` alongside the crash count as the
  control and reports `UNVERIFIED` when both are zero. Do not accept a bare zero
  from the console for this row — the console shows the same nothing either way.
- **Both stores — telemetry-opt-in rule:** any internal tester whose device is not
  set to share diagnostics is invisible to Vitals/Organizer. Confirm the opt-in on
  each test device before install, or the "clean" verdict is a false negative.

**CI merge gating — there is NO code-scanning gate (decided 2026-07-26, issue #1375).**
The `code_scanning` rule was **removed** from ruleset `Veyrnox Code Review` (`17946638`).
CodeQL still scans all six languages on every PR and still files alerts to the Security
tab; they no longer block merges. Swift stays covered by push-to-main and the weekly scan.
Everything else on the ruleset is unchanged — `required_status_checks` (**five** contexts,
tabulated in the two-layer note below — this file said three until 2026-08-08, five until
2026-08-15, and six until 2026-08-23, the last of those wrong from 2026-08-21 onward),
`pull_request` (0 required approvals — **on the ruleset only**; classic branch protection
is a separate layer, see that note), `deletion`, `non_fast_forward`. Exact rule JSON for
restoring the removed rule is in issue #1375.
- **`copilot_code_review` is NOT a rule on `17946638`** (verified 2026-08-08 by reading
  `gh api repos/VEYRNOX/veyrnox/rulesets/17946638`; its four rules are `deletion`,
  `non_fast_forward`, `pull_request`, `required_status_checks`). It lives on a SECOND
  ruleset — `Code Quality Copilot review for default branch` (`19500012`) — whose
  `enforcement` is **`disabled`**, so it gates nothing. Copilot still comments on PRs; it
  has never blocked one. This file listed it as an active rule here for months.
  `gh api repos/VEYRNOX/veyrnox/rulesets` lists BOTH; querying only `17946638` hides the
  second one's existence.
- **Why.** #1368 scoped the Swift scan (60–90 min: scarce macOS runner + full
  Capacitor/xcodebuild compile) to PRs touching iOS/Swift. But the rule gates on the CodeQL
  **TOOL** with no per-language granularity, so a typical PR uploaded 5 of 6 languages, the
  result set was permanently incomplete, and **every** non-iOS PR sat at BLOCKED with
  `--admin` the only exit. Before #1368 the same gate was merely slow — four PRs on
  2026-07-26 were `--admin`'d past it.
- **Three fixes were tried and are all impossible — do not re-attempt:**
  (a) scope the rule to exclude Swift — the rule's only parameter is a list of
  `{tool, alerts_threshold, security_alerts_threshold}`; there is **no** language/category
  field; (b) make Swift cheap — CodeQL has **no `build-mode: none` for Swift** (it is GA
  for C#, available for the source-only languages), and the iOS sources cannot compile off
  macOS; (c) upload a "not analysed" SARIF on the skip path — **GitHub rejects any SARIF
  with `executionSuccessful: false`** (`Code Scanning could not process the submitted SARIF
  file: unsuccessful execution`), proven in PR #1377 (closed). The only encoding GitHub
  accepts is `executionSuccessful: true` + empty `results`, which asserts that CodeQL
  analysed `EnclaveKeyService.swift` / `VeyrnoxEnclavePlugin.swift` and found nothing on
  PRs that never looked at them — fake security, so it was not taken.
- **Honest statement:** this is a real reduction against the ruleset's *intent*, though not
  against its *actual* prior behaviour (a gate satisfied by `--admin` on every merge). The
  remaining honest alternative is running the real Swift scan on every PR and accepting the
  60–90 min block.

**`main` is gated by TWO layers, not one — and the second one was broken (fixed
2026-08-03).** Everything above describes ruleset `Veyrnox Code Review` (`17946638`).
There is ALSO **classic branch protection** on `main`, which this file never mentioned.
**Neither layer is uniformly the tighter one** — that framing was true only while classic
held `strict: true`, and it stopped being true on 2026-08-08. Today the RULESET requires
more contexts (five vs three) and classic requires none the ruleset does not. Read both
before concluding anything about what gates a merge —
`gh api repos/VEYRNOX/veyrnox/branches/main/protection` is the half that
`gh api repos/.../rulesets/17946638` does not show you, and vice versa.
- **The two layers require DIFFERENT check sets. The effective gate is the UNION — FIVE
  contexts** (three until 2026-08-08, five until 2026-08-15, six until 2026-08-21, five
  again since; verified 2026-08-23 by re-reading both endpoints):

  | context | ruleset `17946638` | classic protection |
  |---|---|---|
  | `verify` | yes | yes |
  | `unit-tests` | yes | yes |
  | `Release-cert guard rejects wrong fingerprints` | yes | yes |
  | `mainnet-flag-gate` | yes | — |
  | `staging-gate` | yes | — |

  **`web-e2e-tests` was removed from BOTH layers on 2026-08-21 and is no longer a
  required context.** This file listed it as required on both from 2026-08-15 until
  2026-08-23 — two days after it was actually dropped. Why it went: by 2026-08-21 no
  workflow job reported a `web-e2e-tests` status at all, so the gate blocked mobile PRs
  behind a check they could never satisfy. This is a React/Capacitor mobile build; the
  deployed-preview lane still runs `e2e/staging-smoke.spec.js`, but that is a scoped
  smoke check inside `deploy-preview.yml` reporting through `staging-gate`, NOT a
  standalone `web-e2e-tests` pipeline. Full record, including the restore payload:
  `docs/branch-protection-config.md` 2026-08-21 entry.

  **Note the failure mode this row demonstrates, because it is the same one the rest of
  this section documents.** `docs/branch-protection-config.md` was updated the day of the
  change and was correct throughout; `deploy-preview.yml` and `e2e/staging-smoke.spec.js`
  had their comments corrected the same day too. Only this table was missed, and it is
  the one a reader consults first. A required-check list is worth re-deriving from
  `gh api` before acting on it — the command is two lines up.

  `staging-gate` is the one most likely to surprise you: it is defined in
  `deploy-preview.yml`, NOT `ci.yml`; it is a pure reporter whose verdict comes from its
  `deploy` + `e2e` dependencies; and it carries a docs-only escape hatch
  (`docs_only == true` AND `deploy == skipped` → pass). That hatch is why report-only PRs
  sail through it while a code PR gets the full deploy + smoke test. It also means
  `staging-gate` inherits every flake in the deployed-preview path — see the
  `okx-candles` note below.
- **A third-party outage can red a required gate.** `deploy`'s "Check edge endpoints"
  step probes the live preview, so an upstream exchange hiccup fails `staging-gate`. It
  did on `52e3e05f` (2026-08-07) and `35d85509` (2026-08-08) — 2 of 20 runs — both times
  `/api/data/okx-candles` returning 502. Neither was diagnosable, because the proxy
  collapsed every failure mode to a bare 502; fixed in #1622, which preserves OKX's own
  code (`OKX code 50011`) client-side and logs the full upstream detail server-side. The
  flake itself is NOT fixed — the next occurrence is merely legible.
- **It made every PR unmergeable, and that is why the history is full of `--admin`.**
  Two independent blockers: (a) `required_approving_review_count: 1` +
  `require_code_owner_reviews: true`, on a repo where one account authors every PR —
  GitHub forbids self-approval, so the requirement could never be met; (b) a required
  status context `release-cert-guard`, which is the job's **id**. GitHub matches required
  contexts on the job's **display name**, and that job sets
  `name: Release-cert guard rejects wrong fingerprints` — so the context never reported
  and every PR sat at "Expected — waiting for status to be reported".
- **The irony: the job was purpose-built to be required.** Its own comment in `ci.yml`
  says it "ALWAYS runs and ALWAYS reports a conclusion, so that it can be added to the
  branch ruleset's required checks", and spells out that a skipped-or-absent required
  check blocks every PR. The intent was right; it was wired up under the wrong string.
- **Fixed 2026-08-03:** context corrected to
  `Release-cert guard rejects wrong fingerprints` (this RESTORES a gate that had never
  once fired), and approvals set to `0` / code-owner review off, matching the ruleset.
  `--admin` should no longer be needed for a green PR. **If you find yourself reaching
  for `--admin`, that is a signal the config regressed — diagnose it, do not habituate.**
  Verified by merging PR #1546 with a plain `gh pr merge --squash`, no override.
- **`strict` is now `false` — changed 2026-08-08.** It was `true` (branch must be current
  with `main`) and was deliberately retained on 2026-08-03 as "forces frequent rebases,
  left alone rather than quietly loosened". That reasoning missed the mechanism:
  **GitHub's auto-merge does NOT update a behind branch — it only waits.** So on a repo
  merging 10+ times a day, any merge landing inside a PR's check cycle re-blocked it, and
  `unit-tests` alone is **~25 min** (measured 2026-09-08 over 29 successful runs: median
  24.9, min 17.4, max 26.3 — this line said "~14 min" until then, understating the real
  cost by roughly eleven minutes, and the figure had been carried unmeasured since
  2026-08-08). **The correction strengthens the decision it sits under rather than
  weakening it:** the wider the check cycle, the more merges land inside it, so a 25-minute
  gate makes `strict: true` worse on this repo than the number originally argued.
  Re-derive rather than trusting this line — CI duration drifts with the suite:
  `gh run list --workflow=ci.yml --limit 40 --json databaseId -q '.[].databaseId'`, then
  `gh run view <id> --json jobs` and read `startedAt`/`completedAt` on the `unit-tests`
  job. The failure is SILENT and reads as success: the PR shows
  every check green and simply never merges, with no red anywhere to explain it.
  PR #1620 needed three manual `gh pr update-branch` calls and still lost the race to its
  own follow-up PR merging first. Turned off to match the ruleset, which was ALREADY
  `strict: false` — so the two layers now agree rather than a new posture being invented.
  **Honest cost, stated plainly:** a PR can now merge having passed checks against an
  older base, so a semantic (non-textual) conflict can land untested. `verify` and
  `unit-tests` still gate every merge, and the classic layer's other settings are
  unchanged. **The prior protection JSON was backed up to
  `%TEMP%\veyrnox-protection-backup\main-protection-before.json` on the Windows machine
  and is GONE** — that path does not exist here, and a temp dir does not survive a reboot
  or a machine change. `docs/branch-protection-config.md` carries the real restore
  payloads and opens by making exactly this point; use it, not this line. Restore with
  `gh api --method PATCH repos/VEYRNOX/veyrnox/branches/main/protection/required_status_checks`
  sending `strict` AND the `checks` array (send the array — `strict` alone risks dropping
  the required-check list).
- **If a PR is green everywhere and still will not merge, check `mergeStateStatus`
  first.** `BEHIND` means the up-to-date rule; `BLOCKED` means a required context has not
  reported yet. Neither shows up as a failure.
- `enforce_admins` is `false`, which is the only reason the three `--admin` merges on
  2026-08-03 (#1542, #1544, #1545) were possible at all. All three were green on every
  check that actually reported; nothing red was bypassed.

**2026-07-20 branch-review + weekly audit (`docs/audit-2026-07-20-weekly.md`):** C-1
(CRITICAL, More-drawer "Recent" tiles named duress/stealth/panic routes and survived
decoy sessions/lock/panic-wipe), K-2 (referral sync fail-as-success + pre-gate real-state
read/write), S-1 (user-facing security caveats stripped from Documentation by PR #1243),
and H-3 (duress setup didn't clear a pre-existing real-PIN biometric cache) are all BUILT
+ merged (C-1 + K-2 both in PR #1262; S-1 in #1268; H-3 in #1261). H-1 (WC session-approval gate
fail-open) fix merged in PR #1276. H-2 (ColdSign WARN-tier biometric
step-up gap) — **no action taken, correctly**: `ColdSign.jsx` is unreachable dead code (no
route/import), and the underlying gap is already tracked as weekly M-5 (2026-07-14).

**2026-07-27 branch-review — 10 findings, all fixed (PRs #1409 `fbb5b942`, #1410).**
Two of them had already reached `main` via PR #1403, so the fixes were cut fresh off
`main` rather than onto the review branch.
- **I3 leak (was live on main):** `WalletEntry.jsx` logged `isDemo` — i.e. whether
  the session is a DECOY — to the console on every render. Removed. The one
  legitimate log in that file is `import.meta.env.DEV && console.error(...)`; copy
  that pattern, never a bare `console.log`.
- **Consent re-asked forever:** `setConsentDone(false)` in `handleKekEnroll`/
  `handleKekSkip` re-showed the "one-time" screen on EVERY unlock for anyone who
  skipped KEK (the gate re-fires each unlock; the skip is in-memory only), and
  `TelemetryConsent.choose()` writes unconditionally — so each re-prompt
  overwrote a stored "denied". Removed. `consentDone` is seeded from
  `getConsentState()` at mount; a device with a stored answer must never re-ask.
- **⚠️ The tests had been edited to assert the bug.** PR #1403 changed
  `WalletEntry.kek-gate` tests 6/7 to click through a consent screen that should
  never appear (`getConsentState` is mocked `'granted'` there), turning a
  regression guard into a description of the defect — green pipeline, bug shipped.
  Restored, plus a `queryByTestId('consent-dismiss')).toBeNull()` guard. **Treat
  "align tests with the new flow" as a review smell**; the same pattern appeared as
  `c2db16ae fix(tests): align tests with consent flow`.
- **Send amount dead-ended silently:** Continue gates on `isFormAmountWellFormed`
  (rejects `1e-8`, `1,5`, `1.2.3`, `1.`) but `sendAmountErrorKind` returned null
  for all of them, so the button did nothing and said nothing. Added a `malformed`
  kind fed the gate's OWN verdict (`wellFormed`), so message and gate cannot drift.
  Also: `onSendAnother` now resets `amountTouched`/`addressTouched`/`showErrors`,
  and the amount error is `role="status"`/polite (it carries the live
  `over-balance` case; the address error stays `role="alert"` as it is blur-gated).
- **Pricing honesty:** "Save 30%" and "4 months free" were hardcoded beside
  offer-adjusted prices they weren't derived from — and monthly/annual resolve via
  two INDEPENDENT `offerPriceInfo()` calls, so annual can be the WORSE deal while
  the badge claims 30% off. "4 months" was wrong even at USD base (3.65). Both now
  derive from `lib/annualSaving.js`, which returns null → render NO claim (I4).
- **`.mono-value`, not `font-mono tabular-nums`** — the latter misses the slashed
  zero and letter-spacing every other verifiable value gets.
- **FirstRunTour was deleted undocumented by PR #1403, reopening ECC F-P3-3 (#1160).
  RESTORED 2026-07-28 (PR #1417) — F-P3-3 is remediated again.** The component and its
  placement test came back byte-identical from `de8cb829^`; the wiring was re-applied to
  the CURRENT `WalletEntry.jsx` rather than reverted wholesale, because #1409/#1410 had
  since rewritten that file's consent logic. **No consent change was reverted.**
  Two lessons worth keeping: (a) the tour never blocked consent — the consent branch
  returns FIRST, and consent was absent because `consentDone` is seeded from a stored
  answer at mount; the deletion was collateral to that misdiagnosis. (b) The placement
  test asserts the render sits within 900 chars of its `if`, so explanatory comments go
  ABOVE the branch, not inside it. **Corrected twice, and both corrections are now
  closed.** (i) This bullet listed the `veyrnox-first-run-tour-*` keys as absent from the
  panic-wipe residue list — true when #1417 was written, false when it merged, since
  PR #1415 (`593c969b`) had added them ~50 min earlier (PR #1414 was an independent
  duplicate of that same finding and was closed). See the 07-28 entry. (ii) It then listed
  `OUTCOME_PREAMBLE_ENABLED = false` as off pending an owner decision; **PR #1422 removed
  the flag.** The disable rested on a misidentification — `OutcomeSteps` is 3 steps, is
  not a modal, and sits on `/plans` BEHIND the consent gate, so it never blocked consent;
  the 5-step modal actually on screen was `FirstRunTour`, which #1403 had just deleted and
  which was still rendering from the device-side cache that PR's own message identifies.

**2026-07-28 daily security diff — 2 findings, both fixed and MERGED.** Scanned 14
commits (`34f5da31`→`758aeb95`). The window was strongly net-positive on its own (four
controls ADDED: `rollback.yml` shell-injection validation, the `lib/consent.js` I3
write-gate, the `tracking-integration.jsx` I3 local-state gate, the Settings telemetry
read-gate), plus a regression-test assertion restored. Two items needed work.
- **Residue keys survived panic wipe (PR #1415, `593c969b`).**
  `veyrnox-first-run-tour-armed` / `-seen` were never in the panic-wipe list.
  `ALL_RESIDUE_KEYS` drives BOTH the erase AND `inspectKeyMaterial().clean`, so they
  survived a wipe *and* it still reported clean. Fixed in `METADATA_RESIDUE_KEYS` +
  regression test (`panic-residue-first-run-tour.test.js`), which is red before the fix
  for the real reason (`localStorageResidue` empty while the key is present).
  **The lesson, and it is general: "nothing reads this key any more" is NOT an
  exemption — that is the property EVERY key in that list has after a wipe. What makes a
  key a tell is its PRESENCE.** `veyrnox-first-run-tour-seen` asserts a real install
  existed here AND walked the coercion stack. `docs/Feature-Status.md` had called it
  "no residual-state hazard"; that line is corrected and marked as having been wrong
  rather than quietly reworded. Same class as DIFF-0723-DEVICEID (`veyrnox-device-id`)
  in the findings tracker — check that precedent before writing one of these off.
  **The finding was found VIA the orphaned keys but never depended on them being
  orphaned.** #1417 restored the writer ~50 min later, so the keys are live again and the
  sweep is if anything more clearly right: the claim was never "dead keys linger", it was
  "these keys are a tell and the wipe misses them" — true either way.
  **Standing rule, unchanged: deleting a component orphans its storage keys. Cross-check
  every key a deleted file wrote against `ALL_RESIDUE_KEYS`.**
- **A disabled flag made a whole test block pass vacuously (PR #1418, `3f6773ab`).**
  `Subscription.jsx` carries `const OUTCOME_PREAMBLE_ENABLED = false`, so the preamble
  cannot render at all — which made all THREE tests in the gating block assert the same
  thing by accident. Two were hollow: their `localStorage` / `currentTier` setup was
  inert. All three also matched on the step's COPY, so a copy edit alone would have made
  them pass for a second wrong reason. Now keyed off the `outcome-step` testid; the two
  conditional tests are `.skip`ped (NOT deleted — `outcomeStep`'s initialiser still reads
  `OUTCOME_SEEN_KEY` and still returns null for `safety_plus`, so deleting would bring
  that back unguarded), and the remaining test is bidirectional and **fails the moment
  the flag flips to true** — verified by actually flipping it, not asserted. That failure
  is the tripwire that sends a reader back to un-skip; do not relax it.
  **The tripwire fired and was honoured (PR #1422).** That PR removed the flag, so the
  un-skip condition was met: the first case went red and was rewritten to assert the
  preamble DOES render — not relaxed. Both `.skip`s are gone; the block is 3/3 active,
  0 skipped, and each case is mutation-checked against the specific gate it names
  (re-disable the render / ignore `OUTCOME_SEEN_KEY` / drop the `safety_plus` early
  return each turn exactly one red). Worth recording as a process result, not just a
  code one: #1418 and #1422 were written by different sessions that never spoke, and the
  handoff worked **because #1418 wrote the un-skip condition into the file** rather than
  leaving it in a PR description. Do that.
  **This is the flag-disabled cousin of the "align tests with the new flow" smell:
  a test asserting a behaviour that can no longer occur is coverage that READS as present
  and is not.**
- **The scan's pattern list is a floor, not a ceiling — and it keeps lagging.** Two
  consecutive runs produced findings from files no pattern matched (07-27 the SQL/edge
  surface, 07-28 `src/components/FirstRunTour.jsx`). The 07-28 report records the pattern
  to add; the task file may only write its own report, so it has NOT been applied.
  **Applied 2026-09-03**, after the streak reached five runs — see the Working-pattern
  entry near the end of this file for what was added and why a run cannot do it itself.
- **Process — `main` moves faster than a document can describe it.** Three separate
  staleness events in one day, all the same shape: a statement true when written and
  false when merged. (a) #1412 landed 7 min after the scan's pre-merge checkpoint —
  caught only by the post-merge checkpoint, which is why that third checkpoint exists
  (amendment PR #1416, `7f53ac94`). (b) #1417 shipped a "keys are not in the residue
  list" line that #1415 had already falsified, corrected above. (c) this entry itself was
  first written listing its PRs as still open. **Treat every claim about another PR's
  state as perishable: cite a SHA, or re-read before merging.**

**2026-07-28 internal audit + fix wave — ECC methodology, 28/28 findings merged.**
Full-stack internal review via ECC skills (`security-review`, `security-scan`,
`security-bounty-hunter`, `production-audit`) with `veyrnox-recon`/`veyrnox-honest-reviewer`
on recon/verify. Ten surfaces scanned, every finding adversarially refuted before it
survived. Report at `docs/audit-2026-07-28-internal.md`. Head after the wave: `4f2d62e0`.
Distribution: 1 critical, 5 high, 11 medium, 10 low, 1 info — all 28 landed on `main`
today via PRs #1435..#1461 plus #1462 (M-10) stacked-merged via #1442 (M-4).
- **C-1 → PR #1438.** `FirstRunTour` rendered its 5-step modal in decoy sessions when a
  real user armed but never dismissed, and its dismiss handler wrote to shared
  localStorage from decoy — K-2 pattern, third writer to `TOUR_ARMED/SEEN_KEY`. Fixed
  with two-chokepoint gating (render + dismiss) via `isDeniabilityOrDemoActive()`,
  matching the `lib/consent.js` pattern from PR #1410.
- **Referral / bonus chain overhaul (H-1..H-3, M-6..M-8, L-8..L-10).** Shipped as CODE
  only — nothing has run against the live DB. `p_rc_user_id` removed from
  `generate_referral_code`/`register_referral_code` (H-1); server binding deferred to a
  RC webhook (skeleton in `sql/referral-rc-webhook.sql`, wiring is a TODO — chain does
  not function end-to-end until it lands). **UPDATED 2026-08-10 evening:** SQL landed
  and both Edge Functions (`first-referral-bonus`, `rc-webhook`) deployed on both envs.
  Chain armed end-to-end 2026-09-08 (RC webhook config + shared secret set + rc-webhook verify_jwt=false); only a real sandbox purchase remains as verification — see the
  "First-referral bonus + RC webhook chain — DEPLOYED both envs 2026-08-10" section
  below for the full state. `register_referral_code` requires
  `p_device_id` with rate-limit hoisted above the NULL check (H-2). `record_attribution`
  gets `REVOKE ALL FROM PUBLIC, anon, authenticated` + service_role GRANT, applied to
  every function in the STILL-OPEN section of
  `check-first-referral-bonus-hardening.sql` (H-3). Per-IP + global caps on
  `generate_referral_code` (M-6) and `track_event` (M-7). First-referral-bonus Edge
  Function gets stable `Idempotency-Key` + 4xx/5xx-distinguished rollback (M-8).
  `record_attribution` gets UNIQUE-index dedup + DISTINCT in read paths (L-8). CORS
  drops `http://localhost` (L-9). Bonus-claim rate limit gets per-IP dimension (L-10).
- **H-4 → PR #1436.** Pinned exact versions on `ethers`, `@noble/curves`,
  `@noble/hashes`, `@scure/bip32`, `@scure/bip39`, `@scure/btc-signer`,
  `@reown/walletkit`. Floating carets dropped; CODEOWNERS + Dependabot ignore split so a
  grouped minor PR can no longer land a signing-path bump unreviewed.
- **H-5 → PR #1435.** Removed `|| true` swallow of lint/typecheck in
  `android-e2e-tests.yml` and deleted the fabricated 8/8-passing `test-status` summary.
  Deleted rather than replaced — CI status now reads only what actually ran.
- **KEK / vault hygiene (M-3, M-1, M-2, L-1, L-2, I-1).** `enrollHardwareCredential`
  defaults `vaultWrapped=true` on catch (M-3, #1443); a transient probe IO error can no
  longer enter the destructive `clearCredential()+enroll()` branch. BTC (M-1, #1441)
  and Sol (M-2, #1445) derivations gained try/finally zeroization of seed + master +
  leaf key material; Sol needed a second push for a JSDoc `@type` annotation on the
  `let node = null` refinement pattern. `credentialVerifier.deriveRaw` zeroes encoded
  PIN bytes (L-1). Native `saveVaultContents`/`_unlockInner`/`upgradeKekToV3` move
  `decodeKekSalt` + `getHardwareFactor` inside the try/finally (L-2). AAD v:3 migration
  plan documented at `docs/vault-aad-v3-plan.md` (I-1); #1111 remains open.
  **Naming note:** this wave's M-1/M-2 are BTC/Sol, unrelated to the pre-existing "M-1
  (EVM key unzeroable, ethers v6)" in Open residuals below — different audit's
  numbering, EVM still open on that front.
- **WalletConnect surface (M-4, M-5, L-4..L-6, M-10).** dApp icon URL now goes through
  `isSafeIconUrl` (M-4, #1442); news + NFT sinks get their own allowlists
  (`newsThumbUrl`, `nftImageUrl`) and CSP `img-src` narrowed from `https:` wildcard to
  the explicit union of hosts (M-10, #1462 stacked on M-4). Typed-data pre-sign gate
  composes an `assetAuthorising` risk level via `scoreWcTypedDataLevel` (M-5).
  `handleApproveSession` enforces `isSendReauthRequired()` post-RASP (L-4).
  `rejectRequest` honours caller-supplied reason and audits it (L-5).
  `_scheduleProposalExpiry` finally wired into `_storeProposal` (L-6).
- **M-9 → PR #1449.** `scripts/bundle-trezor-connect.mjs` locks download to
  `connect.trezor.io` HTTPS-only with ≤3 redirects AND verifies bytes against
  `scripts/trezor-connect-manifest.json` sha256s. Manifest seeded with current v9 file
  hashes (`iframe.html`, `popup.html`, `webusb.html`); regenerate on major-version
  bumps. Failed the first CI run because the finder forgot to seed hashes; second push
  `38f1df65` fixed.
- **L-3 → PR #1451.** `PlayIntegrityPlugin.verifyJwsSignature` KDoc drift closed;
  stale block describing pre-#1097 bypass replaced with a pointer to
  `PlayIntegrityJwsVerifier` + a JVM test that constructs an issuer-CN-"Google" cert
  with the wrong SHA-256 and asserts `verify()` returns false.
- **L-7 → PR #1459.** `finalisePinRestore` enforces `/^\d{8,12}$/` (matching
  `createBackupEnvelope`).
- **Rebase collisions handled honestly.** The four SQL PRs editing
  `sql/api-security-hardening.sql` conflicted as they landed. H-2 (3-file) and M-6
  (1-file) needed real merges; each preserved BOTH intents — H-1's `p_rc_user_id`
  removal AND the new PR's addition — never reintroducing a dropped param. Sanity check
  used `git diff origin/main --stat` scoped to the PR's file set; force-with-lease
  pushed; auto-merge survived. Do this in the branch's existing worktree (from the fix
  workflow's leftovers, `.claude/worktrees/wf_fdd618d3-975-*`), not in the primary.
- **Auto-merge is safer than `--admin`.** The whole wave cleared the ruleset
  (`verify`, `mainnet-flag-gate`, `unit-tests`, `copilot_code_review`) with zero admin
  overrides. The M-2 and M-9 real test failures were caught by required checks —
  exactly what the `--admin`-past-red debug-cert saga
  (#1310→#1313→#1325→#1338→#1386/#1391) exists to prevent.
- **Lesson (fix-workflow pattern).** Spawning one worktree-isolated agent per finding
  shipped 26/28 first try. The two that needed re-work (M-2 typecheck, M-9 manifest
  seed) both surfaced only in CI — because the fix agents skipped `npm ci`
  (~5 min × 28 worktrees) and relied on CI. Correct trade-off; the second push was
  cheap. Do NOT increase the per-worktree local-test cost to catch these; use the
  monitor + rebase-in-existing-worktree pattern instead.
- **Not the independent audit (I4).** ECC skills + Veyrnox agents are still Claude-run;
  this pass narrows the target of the outstanding third-party audit, it does not close
  it. Real-device RASP, native compiled binaries, live Supabase RLS enumeration, live
  RevenueCat runtime remain untested. Publish-facing framing must NOT describe this
  pass as independent.

**Open residuals:** M-1 (EVM key unzeroable, ethers v6), M-6 (iOS bridge H copy),
##1111 (vault AAD v:3 migration — plan r2 done, implementation blocked on owner decisions),
LOG-1 remediation BUILT (PR #572), independent third-party audit outstanding.
- **[#2276](https://github.com/VEYRNOX/veyrnox/issues/2276) — Play Integrity root pin
  has no real-token evidence, and pin failures do not block. CLOSED 2026-09-04 as
  accepted residual** (owner decision). The pinset and chain walk exist
  (`PlayIntegrityJwsVerifier.kt`), but the four roots are transcribed from Google's
  published PKI bundle and no production token has ever been captured, so which roots
  Play Integrity actually signs with is unmeasured. A pin or chain miss maps to
  INTEGRITY_UNAVAILABLE → WARN, not INTEGRITY_FAIL → BLOCK — WARN is now the accepted
  posture. **If reopened: do DoD 4 before DoD 3.** Tightening to INTEGRITY_FAIL sets the
  sticky session latch (`attestation.js:298`), so a wrong pin yields a self-renewing
  BLOCK on genuine devices rather than one fail-closed call — the latch clears on
  app-lock, but the next pre-sign probe re-fails and re-latches. Token capture also
  needs a deliberately instrumented build that CANNOT be merged:
  `g2-rs256-chain-walk.test.js` pins `debugExtractTokenHeader` as absent, on purpose.
  Capture which root the real `x5c` chain terminates at — that one fact unblocks both
  DoD 3 and any narrowing of the pinset. Closure rationale:
  https://github.com/VEYRNOX/veyrnox/issues/2276#issuecomment-5533356592.
- **[#2275](https://github.com/VEYRNOX/veyrnox/issues/2275) — 17 security e2e assertions
  are inert.** Reopened 2026-09-03. `e2e/post-audit-validation.spec.js` carries 17
  `test.fixme('#2275: …')` markers (converted from `test.skip` in #2278), covering VULN-19
  nonce pinning incl. across restart, monitoring-endpoint rate limiting, query-
  canonicalisation HMAC bypass, `RestoreFromShares` cleanup validation, shard PIN-floor
  enforcement, the hardware-KEK enrollment gate blocking send, and the biometric
  `kekEnrolled` assertion. None of these ran before #2278 either — no coverage was
  removed — but the block reads as covered and is not. This issue is the named un-skip
  condition; keep it open until the markers are gone.
- **Referral RPC arg rename — DONE on prod 2026-09-08; had been staging-only since 2026-07-24.**
  `increment_referral` renamed from `ref_code` to `p_code` (DROP+recreate in
  `sql/api-security-hardening.sql`, client updated in `referralApi.js`). Discovered
  2026-09-08 that the SQL had never been applied to production
  (`jwstkrtslotnjyerzzsi`): every prod client call to `increment_referral` had been
  failing at PostgREST for six weeks — 3560 referral rows on prod all sitting at
  `count=0`. Migration `increment_referral_rename_arg_ref_code_to_p_code` applied
  live via MCP; grants (anon/authenticated/service_role EXECUTE) preserved
  explicitly since DROP+CREATE resets ACLs. **Lesson: "SQL migration DONE" needs to
  mean "applied to prod AND staging" — CLAUDE.md read as DONE for six weeks while
  prod was silently broken.** Verify signatures across both projects before
  writing off a rename PR as landed.
- **First-referral bonus + RC webhook chain — ARMED end-to-end 2026-09-08. Code bugs #1703 + #1704 FIXED in current code, SQL live on both envs since 2026-08-10, RC dashboard webhook and Supabase shared secret configured 2026-09-08. Chain still unexercised by a real purchase — that is the only remaining verification step.** Full history in
  `docs/Feature-Status.md` 2026-08-10 H-1 chain entry. Snapshot:
  - **SQL:** 9 migrations landed on Staging EU (`nszlbcmcysftwyudthjz`) and Production
    (`jwstkrtslotnjyerzzsi`) via Supabase MCP `apply_migration` — `first_referral_bonus`,
    `check_first_referral_bonus_hardening`, `bonus_claim_rate_limit`,
    `definer_search_path_pin_re_run`, `referral_rc_webhook_set_referral_rc_user`,
    `first_referral_bonus_attempts` (H-1 chain) plus `track_event_ip_rate_limit_*` and
    `definer_search_path_pin_post_track_event_replace` (Slice C, earlier the same day).
  - **Edge Functions:** `first-referral-bonus` and `rc-webhook` both ACTIVE on both
    envs, **comment-stripped source** (trimmed to fit MCP call-payload ceiling;
    runtime identical to commits `6488d7c7` and `4d29d6c1` respectively). Recommend a
    terminal redeploy via `npx supabase@latest functions deploy <name> --project-ref
    <ref>` to restore the commentary when convenient. **`rc-webhook` runs with
    `verify_jwt=false` since 2026-09-08 (prod v14, staging v5)** — RC's Authorization
    header carries the shared `REVENUECAT_WEBHOOK_AUTHORIZATION` secret, not a
    Supabase JWT, so the Supabase platform gate would reject legitimate deliveries.
    In-function timing-safe compare against `REVENUECAT_WEBHOOK_AUTHORIZATION` is the
    sole authentication and it is enough — the RPC the function calls
    (`set_referral_rc_user`) is SECURITY DEFINER and grants nothing to `anon`.
    `first-referral-bonus` still runs with `verify_jwt=true` because that function is
    called from the client via the Pages proxy, which carries the Supabase anon key.
  - **Secrets:** `REVENUECAT_V1_SECRET_KEY` set on both Supabase Edge Function stores
    (identical digest — a v2-generation `sk_` key; v1 issuance is no longer
    available in the RC UI).
    **It does NOT work against the v1 REST endpoint, and this line said it did
    until 2026-09-20.** Measured: `GET api.revenuecat.com/v1/subscribers/<id>`
    with that key returns `403 {"code":7723,"message":"You're trying to use a
    secret API key incompatible with RevenueCat API V1."}`. It works on v2,
    which is why `tip-chat`'s entitlement lookup moved to
    `/v2/projects/{project_id}/customers/{id}/active_entitlements` in #2663 —
    see [#2662](https://github.com/VEYRNOX/veyrnox/issues/2662). **Any other
    function still calling a v1 endpoint with this secret is failing silently:
    `first-referral-bonus` reads the same secret and has NOT been checked.**
    `REVENUECAT_WEBHOOK_AUTHORIZATION` **set on both projects 2026-09-08** (64-char
    random secret, sha256 `8d56050d5177fcfa39b227f4f2329093c5d509f436bc2a46453278b6792a3733`).
    Persisted at `~/.veyrnox/rc-webhook-secret` (mode 600) on the dev machine. To
    rotate: `openssl rand -base64 48 > ~/.veyrnox/rc-webhook-secret`, then
    `SECRET=$(cat ~/.veyrnox/rc-webhook-secret); npx supabase@latest secrets set
    REVENUECAT_WEBHOOK_AUTHORIZATION="$SECRET" --project-ref <ref>` on both, then
    update the two RC webhook `authorization_header` fields to match.
  - **Cloudflare Pages:** `SUPABASE_ANON_KEY` aligned to publishable
    (`sb_publishable_…`) on both `veyrnox-prod` and `veyrnox-staging` via
    `wrangler pages secret put`. Necessary because Supabase Edge auto-injects
    `Deno.env.get('SUPABASE_ANON_KEY')` as the publishable key, and the function's
    in-code bearer check compares against that.
  - **Standing lesson:** Cloudflare Pages secret updates DO NOT hot-propagate to
    running Pages Functions. They take effect only on the next fresh deployment. Today's
    smoke test caught this on the transition (401/401/429 across three 30s retries,
    resolved by a coincidental unrelated CI merge to main). On any secret rotation
    that must take effect immediately: trigger a manual redeploy
    (`wrangler pages deploy dist --project-name veyrnox-prod --branch main`).
  - **RC dashboard webhooks: configured 2026-09-08** in project `proj82381f44` as
    two environment-scoped integrations (single-webhook `environment: null` would
    have sent sandbox events to prod Supabase):
    * `whintgrb0a8102c4b` — "Veyrnox rc-webhook (Supabase prod)" — URL
      `https://jwstkrtslotnjyerzzsi.supabase.co/functions/v1/rc-webhook`,
      `environment: production`.
    * `whintgr6d9a9977bc` — "Veyrnox rc-webhook (Supabase staging)" — URL
      `https://nszlbcmcysftwyudthjz.supabase.co/functions/v1/rc-webhook`,
      `environment: sandbox`.
    Both subscribe to `INITIAL_PURCHASE` + `NON_RENEWING_PURCHASE` only, and both
    carry the shared `REVENUECAT_WEBHOOK_AUTHORIZATION` as their Authorization
    header. Smoke-tested at configuration time: wrong secret → 401, right secret →
    200, on both endpoints.
  - **✅ [#1703 P0 wrong-recipient bug — FIXED in current code.](https://github.com/VEYRNOX/veyrnox/issues/1703)**
    Client now writes the SUBSCRIBER'S OWN referral code (not the referrer's) as
    an RC attribute at `src/lib/purchases.js:328`
    (`Purchases.setAttributes({ veyrnox_referral_code: code })` where `code` is
    the caller's own code). Webhook binds the subscriber's `rc_user_id` to
    their own `referrals` row via `set_referral_rc_user`, matching
    `sql/first-referral-bonus.sql:6-7` intent (referrer's paid conversion → their
    own row → bonus). Do not reintroduce the referrer-code write path.
  - **✅ [#1704 P1 attribute-name mismatch — FIXED in current code.](https://github.com/VEYRNOX/veyrnox/issues/1704)**
    Client writes attribute key `veyrnox_referral_code` at
    `src/lib/purchases.js:328`; webhook reads `veyrnox_referral_code` at
    `supabase/functions/rc-webhook/index.ts:131`. Keys match. Do not rename
    either end without renaming both in the same PR.
  - **Chain remains unexercised by a real purchase.** All plumbing armed
    (verify_jwt=false on rc-webhook, shared secret set, RC webhooks scoped by
    environment) and smoke-tested with synthetic no-code events (200 ok reason=no_code).
    A real sandbox trip is the last verification step: referrer creates code →
    referee purchases with code → RC fires INITIAL_PURCHASE (sandbox env) → sandbox
    webhook posts to staging `rc-webhook` → `set_referral_rc_user` writes on staging
    DB → attribution row + bonus grant land.
  - **Ceremonial notes worth retaining for the next reader:**
    - The client sends `edgeFn('first-referral-bonus', …)` via the Cloudflare Pages
      proxy at `functions/api/edge/[fn].js` — the app never talks to Supabase Edge
      directly. Pages forwards `env.SUPABASE_ANON_KEY` as both `Authorization: Bearer`
      and `apikey`. The function's in-code check compares bearer against
      `Deno.env.get('SUPABASE_ANON_KEY')` (publishable, per above).
    - `verify_jwt=true` on the Edge Function platform gate accepts BOTH legacy JWT
      anon (`eyJ…`) AND publishable (`sb_publishable_…`) — empirically confirmed by
      smoke test on staging.
    - `set_referral_rc_user` uses `SET search_path = public, pg_temp` (no `extensions`)
      because it calls no pgcrypto primitives — deliberate per the file header,
      narrower than the catalog-driven `public, extensions, pg_temp` pin used by
      `definer-search-path-pin.sql`.
  - **Auth note (unchanged, applies to first-referral-bonus specifically):** the bearer
    check is possession of a PUBLIC anon key, not user authentication — this app has
    no accounts. Real containment: atomic single-grant claim, service_role-only RPCs,
    5/hour/code + 20/hour/IP rate limit.

**2026-08-25 perf suite (tag `android-1.0.1-perf-suite-2026-08-25`, PRs #2039–#2106) —
BUILT, INTERNAL, no on-chain txid.** Cold-unlock latency work: double-OS-prompt
collapse on KEK vaults (#2039, hardened #2042), a perf trio (biometric-probe
memoisation #2043, deferred RASP mount probe #2044, `SecurityAdvisor` lazy-load
−246 KB #2045), fast-path DEK cache primitives (#2047) wired to a
`keyStore.unlockBiometricOnly()` path (#2051) whose UI button is now **hidden**
(#2106 — duplicated the existing biometric-unlock button and errored on cache-miss;
the cache stays wired in code, not reachable from the UI), a screen-off grace window
(#2052, opt-in), new-vault KDF v2 params 96 MiB/t=6 with the migration flag OFF
(#2054), Fast Unlock flipped to default-ON with a first-run disclosure card (#2055,
reverses the earlier Q3 "off by default" ruling), Fast-Unlock/Biometric-Unlock pref
linkage (#2057), and an indeterminate KEK-enroll progress bar (#2064).
Deniability-KDF parity (#2103) closed Gate 2 of issue #2101 — decoy/duress vaults now
rekey to the writer's `KDF_PARAMS` on successful decrypt, with panic rekey
deliberately excluded (would leave post-wipe residue) and a disclosed transient tell
pinned by a regression test. **Gate 1 of #2101 (a real-device v2-vault unlock
benchmark) is still open** — every trace captured this session was against a v1
vault, so the migration flag stays off. Full per-item detail, honest caveats, and the
Samsung Note 20 (~3.8 s, one prompt, v1 vault, firebase-test APK) / Pixel 10 Pro XL
measurements: `docs/Feature-Status.md` 2026-08-25 entry.

### Security invariants

- I1 — keys never leave the device
- I2 — no silent data egress
- I3 — deniability mode makes zero backend calls
- I4 — fail honest, fail closed
- I5 — backend untrusted by design
- I6 — Hardware Binding: KEK = HKDF(H ‖ C) — ordered concat, NOT XOR
  (`kek.js: combineKek`, domain `veyrnox/kek/v1/combine(H||C)`)

### OWASP security coding rules

These rules apply to all code written or reviewed in this project. They complement the
security invariants above and are aligned with OWASP Top 10 (2025), ASVS 5.0, and the
OWASP Top 10 for LLM Applications.

#### Input validation (A05 Injection)
- All user input validated before use — length, type, range, allowlist.
- Supabase RPCs use parameterised queries only; never interpolate user values into SQL.
- Shell/CLI: never pass user input to `child_process.exec` or template strings that reach
  a shell. Use `execFile` / array-form `spawn` with `shell: false`.
- DOM: never use `dangerouslySetInnerHTML`, `innerHTML`, or `eval` with user-controlled
  data. React's JSX escaping is the default; breaking out of it requires justification.
- URL/deep-link params: validate against an allowlist of expected keys and value shapes
  before acting on them (WalletConnect URIs, `?demo=`, Capacitor deep links).

#### Cryptographic standards (A04)
- TLS 1.2+ for all network traffic; certificate pinning on native builds (Capacitor).
- Vault: AES-256-GCM only; Argon2id KDF (96 MiB / t=6 for new vaults, 192 MiB / t=3
  for pre-2026-08-24 ones — both already in place; see the Vault line above).
- Key derivation: @noble/@scure only — never Web Crypto for seed/key derivation.
- No custom crypto primitives. If a new algorithm is needed, it comes from an audited
  library (@noble, @scure, or ethers built-ins).
- RNG: `crypto.getRandomValues` / `@noble` CSPRNG only; never `Math.random` for anything
  security-relevant (tokens, nonces, IVs, key material).

#### Secrets management (A02 Security Misconfiguration)
- Secrets go in `.env.local` (git-ignored) or platform secure storage (Keychain/Keystore).
  Never commit secrets, API keys, signing keys, or credentials to the repository.
- Supabase anon key is the only key allowed in client code — and only because RLS + RPC
  SECURITY DEFINER functions gate all writes (PR #1334).
- Keystore passwords, App Store Connect keys, and GitHub Secrets are CI-only; never
  reference their values in source.
- Log output must never contain seeds, private keys, mnemonics, PINs, passwords, or KEK
  material. Sanitise before logging.

#### Access control (A01 Broken Access Control)
- Deny by default: new features are gated (ALLOW_MAINNET pattern) until explicitly
  ungated after audit/verification.
- Supabase RLS enforced on every table; no table allows raw INSERT/UPDATE/DELETE via the
  anon key — all writes go through SECURITY DEFINER RPCs with rate limits.
- WalletConnect: every signing request goes through `presignGateOrReject` — no bypass
  path. Session approval goes through the same gate shape (PR #1276).
- RASP tier gates (BLOCK/WARN/ALLOW) are checked at every security chokepoint; a missing
  or errored gate result = BLOCK (fail-closed, I4).

#### Error handling (A10 Mishandling of Exceptional Conditions)
- Fail closed: any error in a security check (RASP, KEK, gate, auth) must deny the
  action, never allow it. This is I4 codified.
- Never expose stack traces, internal paths, or Supabase error details to the user. Show
  a generic error message; log the real error with a correlation ID.
- `try/catch` around crypto operations must re-throw or deny — never silently swallow a
  decryption or signature failure.
- Offer paths fail CLOSED: a missing/unsigned promotional offer throws
  `OFFER_UNAVAILABLE` rather than falling through to full-price (already in place).

#### Dependency & supply chain (A03)
- Pin exact versions in `package-lock.json`; no floating ranges (`^`, `~`) in
  `dependencies` for crypto or security-critical packages.
- Run `npm audit` before merging any PR that touches `package.json`. Flag and resolve
  high/critical advisories before merge.
- New dependencies require justification: what it does, why it's needed, how many
  transitive deps it pulls. Prefer well-audited, single-purpose packages over large
  frameworks.
- Native dependencies (Capacitor plugins, Gradle/CocoaPods): review the plugin's
  permissions and native code surface before adding.

#### Authentication & session security (A07)
- PINs/passwords: minimum 12 characters enforced (H-A on mainnet builds).
- Biometric auth: always backed by a hardware-bound key (Keychain/Keystore); never a
  simple boolean "is biometric enrolled" check.
- Session tokens (WalletConnect, RevenueCat): minimum 128-bit entropy, expiry enforced
  (M11), invalidated on lock/panic-wipe.
- Step-up re-auth required for high-risk operations: signing, spend-limit changes,
  WalletConnect session approval (H-NEW-B).

#### Logging & monitoring (A09)
- Log security events: RASP triggers, gate decisions (allow/block), signing attempts,
  failed auth, rate-limit hits.
- Never log sensitive data (seeds, keys, PINs, full addresses). Truncate or hash
  identifiers in logs.
- Anonymous event tracking (PR #1321) is suppressed in deniability/demo mode (I3);
  verify this holds for any new event type.
- Test suites must not write to production backends (vitest.config.js env blanking,
  PR #1328).

#### Client-side security (XSS / DOM)
- CSP: enforce a strict Content-Security-Policy that blocks inline scripts and
  `unsafe-eval`. Capacitor's webview CSP must match.
- No `eval`, `Function()`, `setTimeout(string)`, or `document.write`.
- Sanitise any value rendered from chain data (token names, ENS names, WalletConnect
  metadata) — treat on-chain/external data as untrusted input.
- Deep links and universal links: validate scheme, host, and path against an allowlist
  before routing.

#### Database security (Supabase / PostgreSQL)
- **RLS on every table.** No table may have RLS disabled. New tables must define
  row-level security policies before the migration is merged.
- **SECURITY DEFINER RPCs for all writes.** The anon key must never INSERT, UPDATE, or
  DELETE directly. All mutations go through SECURITY DEFINER functions that validate
  input, enforce rate limits, and run with a narrow `search_path` (PR #1334 pattern).
- **Parameterised queries only.** Never concatenate or interpolate values into SQL — not
  in migrations, not in RPCs, not in edge functions. Use `$1`-style placeholders.
- **Principle of least privilege.** The `anon` role gets SELECT on the minimum columns
  needed; never grant `anon` write access to raw tables. Service-role key is server-only
  (edge functions / CI), never in client code.
- **Schema migrations are code-reviewed.** Every `.sql` migration file is reviewed for:
  privilege escalation (GRANT), RLS policy gaps, missing indexes on lookup columns used
  in rate-limit checks, and accidental data exposure (public SELECT on sensitive columns
  like `referral_attributions` — removed in PR #1334).
- **Rate-limit state in the DB.** Rate limits use server-side timestamps
  (`clock_timestamp()`) and dedup tables — never trust client-supplied timestamps.
- **No `SELECT *` in RPCs.** Return only the columns the caller needs to prevent
  accidental data leakage when columns are added later.
- **Backups & retention.** Supabase point-in-time recovery is enabled. Destructive
  migrations (DROP, TRUNCATE, column removal) require explicit owner approval and a
  backup verification step before execution.

#### API security (comprehensive)
- **Rate limiting on every RPC.** All Supabase RPCs are rate-limited per device (already:
  60/hr tracking, 1/device referral dedup, 3/hr registration). New RPCs must define and
  enforce a rate limit before merge — no unthrottled write endpoints.
- **Input validation at the API boundary.** Every RPC validates argument types, lengths,
  and ranges server-side. Use allowlists for enumerated values (event types, asset
  symbols). Reject unexpected fields rather than ignoring them.
- **Payload size caps.** All endpoints enforce a maximum payload size (4 KB metadata on
  `track_event` — implemented 2026-07-26; this rule described it for months before it
  existed, so treat a documented cap as unverified until you have read the SQL). New
  endpoints must define and enforce a cap proportional to the data they accept.
- **No sensitive data in URLs.** Use POST bodies or headers — never query strings. Device
  IDs, referral codes, and asset identifiers go in the request body.
- **CORS.** Restrict `Access-Control-Allow-Origin` to the app's own domains. No wildcard
  (`*`) on authenticated or write endpoints.
- **Idempotency.** Write RPCs must be idempotent or use dedup keys to prevent replay.
  `increment_referral` uses a dedup table; new RPCs must follow the same pattern.
- **Response hygiene.** API responses must not leak internal IDs, table names, constraint
  names, or PostgreSQL error codes to the client. Wrap errors in a generic envelope with
  a client-safe message.
- **Versioning.** Breaking RPC signature changes require a migration window (see the
  `ref_code → p_code` rename note). After first publish, old and new signatures must
  coexist until all clients have updated.
- **Authentication boundaries.** The anon key authenticates the app, not the user. Any
  endpoint that returns user-specific data must additionally validate a user-scoped token
  or device attestation.
- **Edge function security.** Supabase edge functions must: validate the `Authorization`
  header, enforce the same rate limits as direct RPCs, never import the service-role key
  from client-reachable code, and set `Content-Type` explicitly on responses.

#### SSRF & network (A10 / network hardening)
- Never fetch arbitrary user-supplied URLs from server-side code. WalletConnect relay
  and RPC endpoints use a hardcoded allowlist.
- Block private/internal IP ranges in any URL-fetching code (Capacitor HTTP plugin,
  Supabase edge functions).

### Demo mode (known trap)

Demo mode triggers on `?demo=1`, `VITE_DEMO_MODE=1`, native dev, OR a persisted
`veyrnox-demo=1` in localStorage (persists silently across reloads). Before any real
verification: clear demo (`/?demo=0`), confirm fresh real wallet shows 0.0 on-chain.

### Dev send ungate (testnet verification)

Set `VITE_DEV_UNGATE_SEND=1` via `.env.local` (git-ignored) — still the convention here,
though the reason changed: this used to say "NOT an inline shell var (fails on
Windows/PowerShell)", and on macOS zsh an inline `FOO=bar cmd` does work at the shell
level (verified 2026-09-03). Whether an inline `VITE_*` var reaches `import.meta.env` in
this project's build is UNTESTED, so keep using `.env.local` — it also persists across
sessions instead of being lost with the shell. Flips gate decision only, never asset
status. Dead-code-eliminated from production builds.

### Wallet model

One HD seed derives per-chain accounts (Model B). EVM assets share one secp256k1
m/44'/60' address; BTC (m/84'/UTXO/PSBT) and SOL (ed25519/SLIP-0010) have their own.

### Per-chain gotchas

- BNB testnet: enforces minimum gas price; "Slow" fee tier can underprice — use Standard+.
- USDT: no official Tether Sepolia; uses an Aave faucet stand-in.
- WalletConnect: test PINs/passwords must be ≥12 chars (H-A minimum on mainnet builds).

### Environment

- **macOS (zsh). Repo at `/Users/aljobson/Documents/GitHub/veyrnox`.** iOS native builds
  run HERE — see the note below.
- Use `.env.local` for env flags, not inline shell vars.
- **This was a Windows / Git-Bash / MINGW64 machine until 2026-09-03**, and that shows up
  in more places than a path. If you find `C:\Users\aljob\Downloads\Veyrnox`, `$TEMP`,
  `%TEMP%`, `$env:TEMP`, `MSYS_NO_PATHCONV`, or a ` ```powershell ` block anywhere in this
  repo, it is drift, not a live instruction — fix it rather than working around it.
  A stale `cd` target does not announce itself: the task reports whatever it managed to do.
- **`iOS native build needs a Mac` no longer gates anything.** That line sat here while
  iOS archives, exports and TestFlight uploads were being produced on this machine
  (1.0.1 build 47 uploaded 2026-09-02). Read it as satisfied, not as a blocker.
- **iOS Simulator builds MUST be code-signed, or the wallet cannot be created.**
  `xcodebuild ... CODE_SIGNING_ALLOWED=NO` produces a binary with **no
  `__entitlements` section at all** (`otool -s __TEXT __entitlements <App.app>/App`
  prints nothing), so every Keychain write returns `errSecMissingEntitlement`
  (`-34018`) and onboarding fails closed with *"Wallet setup couldn't finish
  securely, so nothing was saved."* — the same sentence as the Play build-5
  rejection, which is what makes it expensive: it reads as a KEK/RASP defect and
  sends you chasing Secure Enclave, Face ID enrolment and a device passcode, none
  of which are the cause. Build with signing left on instead:

  ```bash
  xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
    -sdk iphonesimulator -destination 'platform=iOS Simulator,id=<udid>' \
    -derivedDataPath /tmp/vx-dd DEVELOPMENT_TEAM=R54268MWFV build
  ```

  Xcode ad-hoc signs ("Sign to Run Locally") and writes
  `application-identifier R54268MWFV.com.veyrnox.app` into
  `Entitlements-Simulated.plist`. **`codesign -d --entitlements` is not the check** —
  simulator builds carry entitlements in a Mach-O section (`ENTITLEMENTS_DESTINATION
  = __entitlements`), so an empty `[Dict]` there is normal; use the `otool` command
  above. Verified 2026-09-16 on iPhone 17 Pro / iOS 26.5.

- **`VITE_BYPASS_RASP=1` CANNOT be combined with a built bundle, and the failure
  is illegible.** `useRaspArtifact.js:56` throws at module init when
  `VITE_BYPASS_RASP && import.meta.env.PROD` — a deliberate #1107 hard-fail, so a
  bypass can never reach a shipped build. But **`vite build` always sets `PROD`**
  (`--mode development` included — same fact that makes `VITE_FORCE_TIER` dead in
  any build), so the guard fires for *every* static bundle built while
  `.env.local` carries the flag. **The `.env.local` in the primary checkout
  carries it.**

  What you see is the boot watchdog's **"Veyrnox couldn't start"** card, and
  nothing else: `capacitor.config.json` sets `loggingBehavior: "none"`, so the
  guard's perfectly clear message never reaches the OS log, Safari Web Inspector
  is a GUI step, and `simctl log show` is silent. It reads as a broken app.

  This is almost certainly the real cause of the long-standing "simulator shows a
  black screen with a static bundle" lore, and of why the documented workaround
  (point Capacitor at the Vite dev server) appears to fix it — dev server means
  `PROD` is false, so the guard does not fire. Verified 2026-09-20: the same
  commit that showed the fallback booted to the entry screen after simply
  removing `VITE_BYPASS_RASP` from `.env.local`, on iPhone 17 Pro / iOS 26.5.

  **So: build the simulator bundle WITHOUT the flag.** RASP does not block a
  simulator — `AppDelegate.swift:17`'s pre-WebView `earlyCheck()` would replace
  the root view controller with a native block screen, and it does not fire; the
  app reaches the normal entry tiles. If you must diagnose a boot failure, the
  fastest route is a throwaway `window.addEventListener('error', …)` in
  `public/boot-watchdog.js` that renders the message on screen — it runs before
  the module entry and needs no logging bridge. It was filed as a real app defect
  (#2677) before this was understood; that issue is closed as not-a-bug.
- **A simulator cannot exercise a decoy session, and the two ways round it are
  mutually exclusive.** Recorded so it is not re-attempted (full write-up:
  https://github.com/VEYRNOX/veyrnox/issues/2537#issuecomment-5709674012).
  Duress PIN is Safety-Plus-gated and a simulator holds no entitlement;
  `VITE_FORCE_TIER` cannot stand in because `vite build` emits `DEV:!1` in **every**
  mode (`--mode development` included), so `entitlement.js`'s `import.meta.env.DEV`
  guard makes it dead code in any build. Pointing Capacitor at the Vite dev server
  does arm the override — and arms the decoy successfully — but `demoClient.js`'s
  `import.meta.env.DEV && Capacitor.isNativePlatform()` then forces demo mode, so
  BOTH sessions are deniable: lists render empty, writes throw `denyInDeniable()`,
  and primary is indistinguishable from decoy. Deniability walkthroughs need a
  physical device.
  - **The same gate makes some pages unviewable in ANY automated session, which
    is a separate trap — it blocks ordinary visual QA, not just deniability
    work.** `NFTPortfolio.jsx:27` and `MultiChainNFT.jsx:34` compute
    `!isDeniabilityOrDemoActive()` and render the bare sentence "This page
    isn't available right now." So `/nft` and `/nft-multichain` are blank under
    `?demo=1`, under `VITE_DEMO_MODE=1`, in a decoy session, AND on a simulator
    pointed at the dev server — that last one because the bullet above forces
    demo mode. Found 2026-09-19 trying to do #2607's "check the NFT action row
    on a phone"; the routes render the message and nothing else, which reads
    exactly like a routing or build failure rather than a deliberate gate.
    **Three pages render that exact sentence** — those two plus
    `SuspiciousAssets.jsx:210`, all three via the same
    `!isDeniabilityOrDemoActive()` computation — while **39 files under
    `src/pages` call the helper** for narrower suppression (empty lists,
    blocked writes) without blanking the page. So grep
    `isDeniabilityOrDemoActive` before concluding a page is broken, and expect
    most hits to be the quieter kind.
  - **What to do instead, when the question is layout rather than behaviour.**
    Transcribe the component's markup into a static page, load the REAL
    compiled `dist/assets/index-*.css`, and measure with the browser at 390 /
    375 / 320px. That answered #2607 (zero page overflow at every width; the
    `basis-full` wrap puts List/Delist on its own line; all three controls
    ≥44px — 50px in practice, because `h-11` is 2.75rem and `index.css` sets
    `:root { font-size: 18px }` below 640px). Be honest about what it is: a
    transcription cannot cover conditional classes, so it answers "does it fit
    and stay reachable", never "does it look right".

- **Use a heredoc for multi-line commit messages** — `git commit -F - <<'EOF' ... EOF`,
  quoting the delimiter so `$` and backticks stay literal.
  *Windows-era history, kept because the failure is permanent once pushed:* PowerShell
  here-string syntax (`@'...'@`) was pasted into a Bash call **twice on 2026-07-28** in two
  independent sessions (see `git reflog`: `commit: @` at 11:43, then two amends). In bash
  the `@` characters are literal, so the commit subject became a bare `@` with the real
  subject demoted to the body. PowerShell is not present on this machine, so that exact
  paste cannot recur — but the general rule stands: check which shell you are in before
  writing a multi-line string, and amend before pushing.
- **`npm ci` / `npm install` work plainly again (2026-07-26).** `--legacy-peer-deps` is no
  longer needed and CI no longer passes it (#1372 bumped `@vitejs/plugin-react` to `^5.2.0`
  so its peer range admits `vite@8`; #1376 dropped the flag from the workflows). Two traps
  if you touch `package-lock.json` on an older branch: `--legacy-peer-deps` strips the whole
  `appium` peer subtree (~3,700 lines) and a full `npm install` re-adds ~37 nested
  `appium-uiautomator2-driver/node_modules/*` entries. Regenerate with
  `npm install --package-lock-only` and check the diff contains only what you changed.

### Design system

Calm near-black surfaces (#050608 → #1D222B), one teal accent (#4ADAC2 = verified),
Schibsted Grotesk for prose / IBM Plex Mono for verifiable values, deniability by default
(never show wallet count/list), plain-language risk before signing.

### Working pattern

- Reconnaissance before changes; report root cause before fixing.
- **Fetch main before diagnosing.** Main moves 10+ commits/day. Run
  `git fetch origin main && git log origin/main --oneline -15` before diagnosing bugs.
- Pure helpers + unit tests where logic can be extracted.
- One moving part at a time. Don't mark anything verified without the user's on-chain txid.
- **A search list is a floor, not a ceiling — "I grepped and found nothing" is not
  evidence of absence.** Two independent runs on 2026-08-31 hit the same failure from
  opposite directions: the honesty check flagged two shipping features as unimplemented
  (`docs/honesty-check-2026-08-31.md`, PR #2187, zero code changes — both flags wrong),
  and the daily security diff produced BOTH its findings from files no scan pattern
  matched (`docs/security-diffs/diff-2026-08-31.md` — third consecutive run to do so).
  That reached a **fifth** consecutive run on 2026-09-03, both findings again from
  unmatched files, and the list was widened with `functions/**` (the Cloudflare Pages
  server layer — internet-facing, holds `TRANSAK_WEBHOOK_SECRET` and the service-role
  boundary, and had never been in the list) plus `e2e/**` and `src/**/__tests__/**`.
  **A run cannot fix this itself** — the task may only write its own report, so four
  runs in a row recorded an omission none of them was permitted to correct. If you are
  reading a report that carries a `## Scan-list maintenance` section, applying it is
  the handoff; nobody else will.
  - **Search the words the CODE uses, not the words the CLAIM uses.** Implementation
    nouns (`Panel`, `Handler`, `Feed`, `Store`, `Verifier`) find features; marketing
    verbs (`reviews`, `detects`, `protects`) do not. `advisor.*simulation` misses a
    feature that is really `TransactionIntelligencePanel` + `advisorTxContext`.
  - **A near-miss neighbour is the trap, not the absence.** `threatIntelStore.js` is
    ADDRESS-keyed; dApp-origin screening lives in `risk/knownBadDapps.js` +
    `phishingFeed.js` and is DOMAIN-keyed. Finding the wrong one of a pair reads exactly
    like finding the only one.
  - **Cross-check `featureCatalogue.js` before writing "not implemented"**, and before
    calling a scan clean, ask which surfaces the pattern list cannot see. When a real
    finding comes from an unmatched file, widen the list in the same session — that is
    the only thing keeping it alive rather than fossilised.
  - **`grep` without `-F` silently lies about patterns containing `${...}`, `{` or `}`.**
    This is a sharper failure than the rest of this section: the others return an
    INCOMPLETE answer, this one returns a CONFIDENT WRONG answer. On 2026-09-03 a
    security-diff checkpoint ran
    `grep -c 'computed=${logSafe(verify.expected)}' ` against `origin/main` and got `0`,
    which reads as "the vulnerable line is gone". The line was present the whole time —
    `{` is parsed as a BRE interval rather than a literal, so the match fails. Reproduce:

    ```bash
    git show origin/main:functions/api/buy/webhook.js > /tmp/f.js
    grep -c  'computed=${logSafe(verify.expected)}' /tmp/f.js   # 0  ← wrong
    grep -cF 'computed=${logSafe(verify.expected)}' /tmp/f.js   # 1  ← correct
    ```

    Use `-F` for any literal source text, and reach for it by default when the pattern
    carries `$ { } ( ) [ ] . * + ? | \`. It nearly shipped a security finding reported as
    RESOLVED while the vulnerable code was still on `main`. What caught it was not a
    better grep but a CONSISTENCY CHECK: the PR carrying the fix had not merged, so the
    fix could not be in `main`, and two facts disagreeing forced a direct re-read.
    **When a grep result would let you close a finding, confirm it against something
    that is not a grep** — the PR state, the file read in full, or a test.
  - **An absence-check must be scoped to CODE, because the fix usually documents the
    thing it removed.** A security fix worth making is worth a comment saying what used
    to be there — so the file that removes `X` is the same file that now quotes `X` as
    history, and any check asserting "`X` is gone" matches the comment and fires.
    **This happened three times on 2026-09-03**, in two test pins and then in a merge
    watcher an hour after the pins were fixed, because a shell one-liner did not feel
    like "a pin". Scope the assertion instead of matching the whole file: strip `//`
    lines, target the structural form (`// N.` list items, a declaration, an assignment),
    or read the specific line number. Concretely, the merge watcher for the webhook fix
    counted `oldform=1` and cried CONTENT-WRONG on a perfectly good merge — line 188 had
    the fix, line 66 was the comment explaining it.
    **A fourth instance on 2026-09-07 says the naming above is not preventing this.** A
    merge watcher for PR #2427 asserted a retired phrase was absent from
    `docs/audit-findings-tracker.md`, and matched the table row that exists to record the
    phrase as superseded. Held the branch, cried CONTENT-WRONG on a correct merge — the
    same shape as the webhook watcher four days earlier. Two things make it worth adding
    rather than filing under the existing count:
    - **It recurred in the same session that had just written a PR describing this exact
      failure family.** Knowing the pattern, and having written it down an hour before,
      did not stop it being written again. Treat "I know about this one" as no defence;
      the only defence is scoping the assertion when you type it.
    - **The target was MARKDOWN, and the remedy above is code-shaped.** "Strip `//` lines"
      has nothing to strip in a prose document, where the quotation *is* the content and
      the retired phrase legitimately appears forever. For docs, **assert an expected
      count rather than zero** (`grep -cF` equals 1, and flag drift in either direction),
      or scope to the structural container — the heading, the blockquote marker, the
      addendum block — never to the phrase alone. A doc that records a correction will
      always contain the thing it corrected.
  - **Grepping a live log can match the grep itself, because the tool logs your
    commands.** Distinct from the four instances above: there the artifact contained a
    *record* of the thing being searched for; here the artifact records the *search*,
    so every query writes its own match and the count climbs as you look.
    **2026-09-09, three times in one hour**, measuring whether a claude-mem fix had
    worked. Its PostToolUse hook writes each Bash command into
    `~/.claude-mem/logs/claude-mem-<date>.log`, so
    `grep -c "Worker version mismatch" <log>` counts the recycles AND every command
    that named the string. Reported 4 recycles after a patch that had actually stopped
    them at 0, then 3 `Issue #817` discards that were likewise 0 — and that second one
    became a **confident wrong conclusion stated to the user** ("still fires, so it is
    not version-driven") and was one step from a wrong public comment on
    `thedotmack/claude-mem#3940`. Corrected counts were 58/63 before the patch and 0/0
    after, i.e. exactly the opposite conclusion.
    Anchor to the log's own line shape, not the payload:

    ```bash
    grep -E "^\[[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9:.]+\] \[" "$LOG" | grep -cF "$NEEDLE"
    ```

    Genuine entries start with a timestamp and level; an echoed command is raw text
    with no prefix, which is why the anchor removes it. Verified 2026-09-09 by echoing
    a nonsense token and then grepping for it: raw `grep -cF` returned 2, the anchored
    form returned 0.
    Assume any log written by the harness you are running under is contaminated by your
    own commands. To confirm, emit a nonsense token in one call and grep for it in the
    **next** one — the echo is written after the command completes, so a command cannot
    detect its own echo and a single-call self-test always reports a reassuring 0.
  - **Note which way each failure points.** The `-F` bug fails DANGEROUS: it stays silent
    and reports a clean result that is wrong. The absence-check-hits-its-own-comment bug
    fails SAFE: it cries wolf on correct work. The log-echo bug fails BOTH ways, which is
    what makes it the worst of the three: it inflates a count, so it condemns a working
    fix *and* manufactures evidence for whatever hypothesis the inflated number happens
    to support. All three come from a check that cannot tell the thing from a mention of
    the thing, and only the second announces itself — so finding one is a prompt to go
    looking for the others, not evidence that verification is working. The two entries
    below extend the family in a different direction — there the check reads the wrong
    ARTIFACT rather than misreading the right one — and both fail DANGEROUS.
  - **A file's mtime can answer for the wrong file, and SQLite makes that routine.**
    On 2026-09-19 a simulator investigation timed a Keychain write with
    `find .../Keychains -name 'keychain*.db' -exec stat ...`, got one mtime two and a
    half hours stale, and reported a wallet that existed with no Keychain write behind
    it — an apparent integrity failure in the app. There was none. **SQLite in WAL mode
    writes to `<db>-wal` and leaves the main `.db` untouched**, so a glob ending `.db`
    cannot see the write at all. The same sweep with `-name 'keychain*'` showed `-wal`
    written at the exact minute the wallet was created. Glob the whole family
    (`db`, `db-wal`, `db-shm`) whenever you time a SQLite-backed store — Keychain,
    localStorage, IndexedDB, app containers — and when you copy one out for offline
    reading, copy the `-wal` with it or the last writes are simply absent from your
    copy and nothing warns you.
  - **`pgrep -f` matches your own command line.** Same session: a poller guarded with
    `pgrep -f "App.app/App" || break` could never break, because the shell running the
    poller carries that string in its own `ps` entry. The liveness check was
    structurally incapable of reporting death. This is the process-table twin of the
    log-echo entry above — the artifact you search contains your search — and it
    silently disables the guard while looking like one. Anchor to a pid you were handed
    (`simctl launch` prints one) rather than to a pattern you also typed.
  - **A dev server on a shared port can belong to another worktree, and Playwright will
    reuse it without saying so.** 2026-09-19, verifying the #2628 boot shell: six
    Playwright cases ran green-ish against `localhost:5173` and meant nothing, because
    `playwright.config.ts` sets `reuseExistingServer: !process.env.CI` and the port was
    already held by `npm run dev` from the `app-security-compliance-5e0439` worktree. The
    tests drove a DIFFERENT CHECKOUT of this repo — same file paths, same URLs, different
    content. Five passed and the single failure was correct for entirely the wrong reason
    (the element under test genuinely does not exist on that branch), which is what makes
    this worse than an outright error: the failure looked like a real finding and would
    have been "fixed".
    This is the sharpest form of the family above, because the artifact is not merely
    stale or self-matching — it is a plausible, live, actively-served *other* version of
    the thing you are testing, and nothing in the run mentions it. `10+ worktrees are
    typically checked out at once` (see the shared-checkout section), so the default
    assumption for any fixed port on this machine is that someone else already owns it.
    Start your own server on a port you pick and point the suite at it —
    `BASE_URL=http://localhost:<yours> npx playwright test …`, which also sets
    `webServer: undefined` and removes the reuse path entirely. To confirm who owns a
    port before trusting a single result:

    ```bash
    lsof -ti tcp:5173 | while read -r p; do lsof -a -p "$p" -d cwd -Fn | grep '^n' | cut -c2-; done
    ```

    Cheaper still, and the check that actually caught it here: fetch the page and grep for
    something only your branch has. `curl -s http://localhost:<port>/ | grep -c <marker>`
    returning 0 while the file on disk has it is the whole diagnosis.
  - **`ps aux | grep -c <tool>` counts every session's processes, not yours.** Same
    session, same hour: repeated readings of "the suite is still running" were partly
    another session's unrelated mutation loop, so a run that may have ended looked alive
    and the machine looked busier than the work I had started could explain. A count is
    not evidence that YOUR process lives — check the pid you were given
    (`ps -p <pid>`), not a name that every concurrent session also matches.
  - **"The newest build" on App Store Connect is three different answers depending on
    how you ask, and the two wrong ones look right.** 2026-09-19, prepping the #2541 iOS
    fresh-install run: a peer session's pre-flight comment on the issue said "install
    build 61", derived from a `sort=-version` read, and its own later correction said
    `-version` is a STRING sort. The pre-flight was wrong AND the correction's mechanism
    was wrong. Measured directly against app `6790188660` (61 builds, trains `1.0` and
    `1.0.1` only):
    - `GET /v1/apps/<id>/builds` **rejects `sort` outright** —
      `400 PARAMETER_ERROR.ILLEGAL`, "The parameter 'sort' can not be used with this
      request" — and its default order is neither newest nor oldest: the first page came
      back `26, 27, 37, 41, 55` while builds from July exist. A `limit=1` here returns an
      arbitrary build with no indication that it is arbitrary.
    - `GET /v1/builds?filter[app]=<id>&sort=-version` **is numeric, not a string sort.**
      Ascending returns `1, 1, 2, 2, 3, 3, 4, …`; a string sort would have returned
      `1, 1, 10, 11, …`. So the correction's stated cause is false — do not repeat it.
    - It is still the wrong query, for a sharper reason: **`version` is the BUILD NUMBER,
      which restarts per train and is not unique.** `1` already appears twice — `1.0 (1)`
      uploaded 2026-07-21 and `1.0.1 (1)` uploaded 2026-08-08. So a brand-new `1.0.2 (1)`
      sorts **last of 61, not first**, and "newest by `-version`" actually means "highest
      build number anyone has ever used on any train".
    - The query that answers the question asked:
      `GET /v1/builds?filter[app]=<id>&sort=-uploadedDate&include=preReleaseVersion` —
      newest by upload, carrying the train it belongs to.
    **Corollary, from the same read:** build numbers are unique per TRAIN, so restarting
    at `1` on a new marketing version is accepted — which is why `1.0.2 (1)` was free
    today, and why the two existing `(1)` builds are not a contradiction.
    **Why it sits with the `grep -F` and log-echo entries rather than in the App Store
    section:** it is another check that returns a CONFIDENT WRONG answer instead of an
    obviously empty one, and its wrongness scales with novelty — `-version` is most
    misleading precisely when you are asking about a build you just uploaded on a new
    train, which is the only time anyone asks. Note also that the error here travelled
    as a CORRECTION, which reads as more trustworthy than the claim it replaced; a
    correction is a claim and needs the same verification. One API read settled all of
    it.
  - **An absence-assertion cannot tell "correctly absent" from "absent because
    broken", and it fails DANGEROUS.** 2026-09-19, closing #2595: the boot watchdog
    added by PR #2500 had never executed once — it was an inline `<script>` and
    `script-src` is `'self' 'wasm-unsafe-eval'` with no `'unsafe-inline'`, so the
    browser blocked it on every load for nine days, in dev and in production. Every
    guard around it passed the whole time. `FirstPaintNotBlankTests` asserts
    `app.buttons["Reload Veyrnox"].exists` is FALSE, and its own comment says "the
    watchdog stayed dormant" — an assertion that reads identically whether the fallback
    is dormant or dead. `csp-policy.test.js` separately asserted `script-src` has no
    `'unsafe-inline'`, so the suite was green *because* the policy was strict and the
    watchdog was dead *for the same reason*, and nothing related the two facts.
    **The remedy is specific and is not "assert harder": assert the fallback FIRES
    under an induced failure.** The fix was verified by renaming the main chunk to
    force a 404 and watching the Reload screen render, then restoring it and watching
    React mount with no fallback — two observations, not one. A test that only ever
    sees the healthy path cannot distinguish a working safety net from a missing one.
    Applies to every fail-closed control: a RASP gate that has never blocked, a
    rate limit that has never tripped, an error boundary that has never caught.
  - **The API mirror of the same thing: a SAFE failure, where success is reported as
    failure.** Same day, distributing `1.0.2 (1)` to TestFlight: `POST
    /v1/betaGroups/<internal>/relationships/builds` returned `422
    ENTITY_UNPROCESSABLE`, "Builds cannot be assigned to this internal group." Nothing
    was wrong — that group carries `hasAccessToAllBuilds: true`, so every processed
    build reaches it automatically and manual assignment is refused as redundant. The
    build already read `internalBuildState: IN_BETA_TESTING` before the call. Reading
    that 422 as a failure would have produced a retry loop against an action that must
    never succeed. This direction is the cheaper one — it costs a double-check rather
    than a wrong belief — but it belongs with the rest, because both come from a
    check that cannot distinguish the thing from the absence of the thing. The
    `scripts/play-vitals.sh` bug found the same day is this one inverted: a benign
    "no data yet" line printed over a hard `400`.

- **Mutation-check every new test pin, or you ship coverage that cannot fail.** Three
  pins written on 2026-09-03 were broken on the first attempt and ALL THREE looked green:
  - **A prefix ate the assertion.** A status-tag pin used `startsWith()` against
    `['BUILT-UNVALIDATED', 'BUILT', …]`. `"BUILT / unit-tested…"` starts with `BUILT`,
    so reintroducing the exact defect passed. Read a tag as a whole token when one
    valid value is a prefix of another.
  - **Two pins fired on their own documentation.** Both asserted a file did NOT contain a
    retired phrase, and matched the comment that recorded the phrase as removed. Strip
    comments, or scope to the structural form (`// N.` gap items, a declaration), before
    asserting absence in source text.
  The discipline that catches all three is the same and takes one minute: reintroduce the
  defect, confirm THAT pin goes red, restore. A pin that stays green under its own
  mutation is worse than no pin — it reads as coverage.
- **Targeted test runs are not enough; run the full suite before calling a branch green.**
  A one-line Kotlin signature change (S-3) broke a structural pin in
  `g2-rs256-chain-walk.test.js` — **three** separate G2 test files pin the same function,
  and only one was run. Related: a test file with a syntax error reports FEWER tests, not
  a failure (427 instead of 644 here), so a shrinking test count is a red flag in itself.
- **Two sessions found and fixed the same finding ~30 minutes apart** (S-2, mine vs
  #2282), the third instance of this collision after #1414/#1415. When your fix conflicts
  with one that just landed, read the other one before resolving — #2282's mechanism was
  better than mine and the right move was to drop my half, not merge over it.
- **Concurrent PRs that both add tests to the same file WILL conflict.** #2284 and #2285
  both appended pins at the same anchor. Resolving by keeping both sides naively left an
  unclosed `it()` block, because each side ended mid-block. Run lint after any
  conflict resolution in a test file.

### The primary checkout is SHARED — never work in it

`/Users/aljobson/Documents/GitHub/veyrnox` is used concurrently by many sessions: scheduled tasks
(daily security diff, branch review, weekly audit, dependency watchers) and any number of
interactive ones. **10+ worktrees are typically checked out at once.** Treat the primary
checkout as read-only shared state.

**Never in the primary checkout:** `git checkout` / `git switch` / `git rebase` / `git
stash`, editing files, or `npm install`. Switching its branch reaches into every other
session at once, and an uncommitted edit there can be swept into an unrelated PR.

**Do this instead** — cut a branch worktree from `origin/main` and work entirely inside it:

```bash
git fetch origin main
git worktree prune
git branch --no-track <branch> origin/main   # --no-track is REQUIRED, see below
git worktree add "${TMPDIR:-/tmp}/<name>" <branch>
```

- **`--no-track` is not optional.** Without it git sets the upstream to `origin/main`, and
  a later bare `git push` from that branch targets **main**.
- The worktree needs its own `node_modules` (`npm ci`) — it does not inherit the primary's.
- Remove it when the PR is open, not before: `git worktree remove <path> --force`.
- Never `git gc --prune` / `git prune` — the repo carries thousands of unreachable commits
  belonging to other sessions' in-flight work.

**Reading is exposed too, not just writing.** The primary checkout is frequently on a
detached HEAD or an unrelated feature branch, so anything read from its working tree is of
unknown provenance. A previous tracker run analysed a detached HEAD and reported the
results as `main`. Read from the ref, not the tree: `git show origin/main:<path>`.

**Two failures on 2026-07-28, both from this:**
- **Duplicated work** — two sessions independently found the same panic-residue finding
  and opened PRs #1414 and #1415 **92 seconds apart**. One had to be closed.
- **Cross-contamination** — PR #1423's branch picked up an unrelated commit from another
  session mid-flight. It could not be force-pushed (that would have destroyed work seconds
  old), so the branch was abandoned and reopened as #1427.

**Always sanity-check a ref read** with `git cat-file -s origin/main:<path>` before
trusting it — every failure mode of `git show <ref>:<path>` is silent, and an empty result
looks exactly like "no matches found", which will have you report a false all-clear.
*Windows-era detail, retired 2026-09-03:* on Git Bash, MSYS rewrote the `:` and swallowed
the command, which is why `MSYS_NO_PATHCONV=1` used to be required. That prefix is a no-op
on macOS; the byte check never was, and is what actually catches this.

### Multi-agent working pattern

Subagents in `.claude/agents/`: `veyrnox-recon` (read-only), `veyrnox-ui` (design-system),
`veyrnox-security-tdd` (strict TDD), `veyrnox-honest-reviewer` (honesty bar). Fan out in
ONE message for concurrency.

#### Codex — second developer

`codex review --base main` is a read-only invocation, and using Codex that way is still
the intended review pattern: Claude reads the report, then implements. Codex output is
INTERNAL — never the outstanding independent audit.

Runbook: `docs/codex-review-runbook.md` — CLI install, one-line invocation, when to use
it, when it does NOT substitute for the independent audit gate.

**But Codex is NOT read-only on this machine, and this section said it was until
2026-09-09.** A long-running Codex thread writes to the repo continuously. Read the
correction below before attributing any unexplained branch, push, or merge to a Claude
session — two sessions mis-attributed Codex's writes to each other on 2026-09-09 alone,
and one of them (this file's own author) did it twice in one afternoon.

- **What it is.** The ChatGPT desktop app's bundled agent —
  `/Applications/ChatGPT.app/Contents/Resources/codex … app-server`, plus the CLI at
  `~/.local/bin/codex`. Its threads live in `~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl`,
  NOT in `~/.claude/projects/`, which is why a transcript sweep across Claude sessions
  finds nothing and reads as "no actor exists".
- **It is indistinguishable from a Claude session in every record GitHub keeps.** Same
  macOS user, same git identity (`Al Jobson <al.jobson@21stclick.co.uk>`), same `gh`
  token. A PR timeline showing `actor=aljobson User` tells you nothing about which agent
  acted. Do not conclude "a Claude session did this" from an actor field.
- **It works in the SHARED PRIMARY CHECKOUT.** Its `exec_command` calls carry
  `workdir: /Users/aljobson/Documents/GitHub/veyrnox`, so its `git fetch` and
  `git worktree add` run in the checkout this file tells every Claude session to treat as
  read-only. Assume the primary's ref state can change under you at any moment.
- **It creates `/tmp` worktrees on `codex/*` branches, and pushes to `claude/*` branches
  it does not own.** Observed 2026-09-09:
  `git worktree add /tmp/veyrnox-pr2474 -b codex/fix-pr2474-conflict FETCH_HEAD`, and the
  same thread made `codex/fix-pr2470-conflict`. Its push history includes
  `git push origin claude/biometrics-auto-unlock`,
  `git push origin claude/documentation-verified-labels-81b6f4`, and
  `git push origin HEAD:veyrnox-audit-fix8-medlow && gh pr merge 2273`. **So it force-pushes
  other agents' PR branches and merges PRs.** This is the mechanism behind
  `.claude/scheduled-tasks/daily-veyrnox-branch-review/SKILL.md`'s "PR #1789 was merged by
  another actor after its auto-merge had been explicitly disabled".
- **It arms auto-merge as a MERGE COMMIT on every open PR, including ones you are
  watching.** When the owner types "Fix all open PRs to merge" or "merge all open PRs
  when green" into that thread, it runs
  `gh pr merge <n> --repo VEYRNOX/veyrnox --auto --merge --delete-branch` on each open
  PR, and `gh run rerun <id> --failed` on red ones. Verified 2026-09-21 by matching
  each PR's timeline `auto_merge_enabled` event to the rollout, 1–3 s apart every time:
  #2429 (2026-09-07), #2490 (09-10), #2679 (09-20), #2687 and #2688 (09-21).
  **This was previously misread as a `gh` bug** ("`--squash --auto` sometimes arms as
  MERGE, and re-running it is a no-op"). It was not: the PR was already armed by Codex,
  so the Claude session's `--squash --auto` changed nothing. The repo allows all three
  merge methods, so the result lands silently as a two-parent merge commit on `main`,
  which cannot be rewritten afterwards. To merge a PR yourself, merge explicitly once
  green — `gh pr merge <n> --squash --match-head-commit <sha>` — and if you watch or
  arm one, re-read `autoMergeRequest.mergeMethod` inside the loop, because Codex can arm
  it mid-watch. Repair while checks are still pending with `--disable-auto` then
  `--auto --squash`; on an already-green PR, arming merges instantly.
- **A PR's head can change under you, and `gh pr diff` will not warn you.** #2470 was
  force-pushed from a duplicate fixture change to a test-only change between one session
  reading it and another; both then described it correctly for their own snapshot and
  contradicted each other. State the head SHA whenever you describe a PR's contents.
- **There is a SECOND automation fleet.** `~/.codex/automations/` holds ~16 automations
  whose names mirror the Claude scheduled tasks — `daily-veyrnox-branch-review`,
  `veyrnox-daily-security-diff`, `veyrnox-daily-dep-audit`, `veyrnox-dependency-audit`,
  `veyrnox-weekly-security-audit`, `veyrnox-audit-finding-tracker`, `gemini-weekly-sweep`,
  `veyrnox-elliptic-upstream-watch`, plus watch tasks. Both fleets run the same jobs
  against the same repo, which is a sufficient explanation for duplicate PRs on one bug
  without looking for another cause: 2026-09-09 produced #2462, #2465 and #2470 for a
  single fixture bug, plus a `codex/fix-suspicious-assets-date-fixture` branch.
- **How to check, rather than guess.** `ps -Ao pid,etime,command | grep -i codex` for the
  running agent; `grep -rlF '<branch-or-path>' ~/.codex/sessions ~/.codex/archived_sessions`
  to find the thread that did it — the rollout JSONL records the literal shell command and
  its `workdir`. A single thread can be very long-lived (the one found on 2026-09-09 opened
  2026-08-23 and was 127 MB / 26,517 lines), so date the file by mtime, not by its name.

#### Orchestration — pick automatically

| Signal | Pattern | Apply |
|---|---|---|
| Fixed known targets, independent | **Parallel Execution** | Fan agents in ONE message |
| Open-ended discovery, unknown count | **Dynamic Spawner** | `dynamic-spawner` agent |
| Destructive/irreversible action | **Router + Human Gate** | `router-human-loop` first |

Tie-break: destructive → Router; scope unknown → Spawner; else → Parallel.

### Key docs (read on demand, not loaded by default)

- `docs/CLAUDE-audit-archive.md` — full PR-by-PR audit history (moved from here)
- `docs/Feature-Status.md` — per-feature status with PR numbers and evidence
- `docs/Audit.scope.md` — audit scope and gate status
- `docs/branch-protection-config.md` — what gates a merge into `main`, per-change, with the
  exact payload to restore each prior state (both layers)
- `docs/scheduled-loops.md` — registry of the recurring tasks under `.claude/scheduled-tasks/`,
  including one upstream watcher per accepted dependency residual (elliptic Tue, morgan Thu,
  stream-json Fri) and which watchers are retired. **It cannot prove a task is registered** —
  the scheduler registry is not in git, so confirm with `list_scheduled_tasks` before citing
  any residual as tracked
- `docs/hardware-kek-phase-plan.md` — KEK rollout plan
- `docs/audit-2026-07-01-kek-internal.md` — KEK audit findings
- `docs/audit-triage/internal-audit-2026-06-17.md` — mainnet gate audit

**Scheduled-task runbooks live in `.claude/scheduled-tasks/<task>/SKILL.md`, and that is
the copy that RUNS** — the file at `~/.claude/scheduled-tasks/<task>/SKILL.md` is a short
loader that resolves that path from `origin/main`. There is no second copy: a review
mirror at `docs/scheduled-tasks/` was **deleted 2026-09-03** (PR #2295).

**Read that deletion as a warning, not housekeeping.** The mirror had drifted, and the
drift ran the wrong way — PR #1420 added the dependency-audit task's MANDATORY
accepted-residuals check (Steps 1b/1c) to the `docs/` copy ONLY. The live runbook never
had it, so the weekly task ran with no residuals awareness from 2026-07-28 until #2295
ported the steps across, while the mirror's README confidently described behaviour the
task did not have. A second copy of an operational document does not stay a copy, and
the stale one is the one that reads as authoritative. Do not reintroduce one.
