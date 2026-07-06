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
  F-09 (RASP device) + M-K (passkey counter) remain open, all native/device-gated.
  INTERNAL pass — not independent. (See `docs/Audit.scope.md`.)
  A 2026-07-01 internal static-analysis audit (Hardware KEK focused — WebAuthn PRF KEK,
  iOS SE KEK, Android StrongBox KEK) found 1C/9H/12M/6L; 10 remediable findings fixed in
  PRs #520–#522; C-1 (CRITICAL: Android HMAC fixed input — v2 protocol migration) was
  recorded RESOLVED / device-verified 2026-07-02 on the strength of Sepolia txid
  `0xeb71a5d31a8794682cf681d8ebb2916967c1097e951519dcf1b53327d2d8e580`, block 11185289
  (PR #529, commit 732f9676; vault read back `hardwareKekVersion:2`, `kekSaltLength:44`,
  `hardwareKekTier:"STRONGBOX"` on Pixel 10 Pro XL) — **REGRESSED 2026-07-05: a follow-up
  OODA investigation found the fix is cryptographically inert on-device.** Two bugs: Bug A
  (runtime-confirmed via logcat: `getHardwareFactor` called with `{}` on a v2 vault) —
  `src/wallet-core/keystore/index.js:94-96 getHardwareFactor()` drops all arguments, so
  unlock never forwards `kekSalt` to the plugin; Bug B (static analysis, high confidence,
  device confirmation pending) — `src/wallet-core/keystore/hardware.js:195` passes
  `kekSalt` as a raw `Uint8Array` into the Capacitor bridge call, which `JSON.stringify`s
  plugin options, so Kotlin's `call.getString("kekSalt")` reads `null` (indistinguishable
  from absent) and silently falls back to the fixed v1 `PRF_EVAL_SALT`. Net effect: the
  `0xeb71a5d…` txid proved the KEK-gated unlock FLOW end-to-end but did NOT prove
  per-enrollment salt binding — enroll and unlock both silently used the same fixed salt,
  so they matched by construction. All enrolled Android vaults still derive H from the same
  global HMAC input; the original C-1 CRITICAL condition was unresolved at that point.
  **FIXED / device-verified 2026-07-05, later the same day (v3, PR #568):** facade
  argument forwarding closes Bug A; `hardware.js` base64-encodes `kekSalt` to a STRING
  before the bridge call, closing Bug B; the Kotlin plugin fails closed on a
  malformed/absent salt (no silent v1 fallback); the vault stamps `hardwareKekVersion:3`
  for genuinely salt-bound wraps, with a lazy brickless v2→v3 upgrade path for previously
  (falsely) v2-stamped vaults. On-device (Pixel 10 Pro XL, Android 16, `com.veyrnox.app.debug`,
  device-local times): 07:19:35 fresh v3 enrollment (`"enroll: key stored —
  tier=STRONGBOX (securityLevel=2)"`); 07:19:37 `getHardwareFactor` bridge call carried
  `kekSalt` as an intact 44-char base64 STRING (previously `{}`), logging `"salt-source:
  v2-bound"`; cold restart (07:37:46) + unlock (07:40:00-03) repeated the same
  `"salt-source: v2-bound"` result with the SAME stored salt — closing the Android
  unlock-path app-trace evidence gap (the Android analogue of iOS-F9); KEK-gated Sepolia
  send from this vault, txid
  `0xecd68494e888af742e5166c93c5354536fb6bbe62e93dc795847079d981727e3`, block 11206686,
  status SUCCESS, independently re-confirmed via RPC receipt. Status: **C-1 FIXED /
  device-verified (v3 fresh-enroll path, end-to-end incl. on-chain txid, 2026-07-05)** —
  see the dated resolution annotation (the 2026-07-05 regression note above it is
  preserved, not deleted) in `docs/audit-2026-07-01-kek-internal.md`. Still outstanding,
  explicitly: (1) salt-tamper negative test not performed (stored vault lives inside
  encrypted SecureStorage; non-invasive tamper not feasible on this device — the
  `"salt-source: v2-bound"` branch attestation is the operative evidence that the supplied
  salt is the HMAC input); (2) v2→v3 lazy migration path NOT device-exercised (test device
  had no v2 vault — fresh enroll only; migration remains unit-tested only, 11 tests);
  (3) per-enrollment salt distinctness on device unit-proven only, one enrollment observed;
  (4) independent audit. **New finding LOG-1 (2026-07-05, HIGH for debug/CI context):**
  Capacitor's debug bridge logger echoes every native plugin result to logcat in DEBUG
  builds — captured on-device: the hardware KEK factor H in cleartext base64 and the full
  encrypted vault blob. Debug builds only; production default is silent but unverified for
  our actual release build config. Risk: `adb` access to a debug build extracts H; Appium
  CI logcat artifacts may also capture it. Not a production finding until release config is
  verified; remediation tracked separately (spawned as its own task), not part of PR #568.
  Also from this session: the P3 "Biometric unlock" enrollment flow was device-exercised
  2026-07-05 (honest "Enroll biometric unlock" `BiometricAuth` prompt observed in device
  logs) — the originally reported bug ("WebAuthn native plugins not working") is FIXED /
  device-exercised for enrollment; the "passkey" WebAuthn path on native remains
  honest-disabled by design. Remaining open besides C-1: native/device-gated findings
  (iOS-F5, iOS-F3, H-2/iOS-F11 iOS half, iOS-F9 evidence gap). (2026-07-05, separately:
  a duress-aware biometric PIN-cache guard landed — PR #613, see the "2026-07-05
  re-applied orphaned fixes" section below.)
  H-NEW-D CLOSED (SE ECIES confirmed in ObjC at `HardwareKekPlugin.m:78`).
  INTERNAL pass — not independent. See `docs/audit-2026-07-01-kek-internal.md`.
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
  design correct at native ObjC layer. Remaining open native items: iOS-F5 (H factor in
  NSData not zeroed — requires NSMutableData patch + Mac build), iOS-F3 (deprecated
  kSecUseOperationPrompt — requires LAContext + Mac/Xcode). iOS-F9 evidence gap: SE unlock
  log trace not captured for the existing Sepolia sends; iOS device-verified status remains
  PARTIAL. H-2/iOS-F11 (biometric factor not bound to enrollment set): Android half RESOLVED
  / device-verified (PR #516/#518, re-enroll invalidation PASSED on Pixel 10 Pro XL); iOS half
  DEFERRED — the `.biometryCurrentSet` ACL flag is set in code but the runtime re-enroll test
  is device-blocked (test iPhone 17 Pro Max has Face ID enrollment restricted; needs an
  unrestricted iPhone). Outstanding (iOS): SE-unlock log trace capture, biometric re-enrollment
  invalidation test, KEK-gated Sepolia txid, independent audit. Note: C-1 CRITICAL (Android HMAC fixed input)
  also affects the overall KEK design context — see Android bullet.
- Android: StrongBox HMAC-SHA256 + biometric-only gate (no credential fallback). ✅
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
  `0xeb71a5d31a8794682cf681d8ebb2916967c1097e951519dcf1b53327d2d8e580`, block 11185289,
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
  for genuinely salt-bound wraps, with a lazy brickless v2→v3 upgrade path for previously
  (falsely) v2-stamped vaults. 11 migration unit tests added. On-device (Pixel 10 Pro XL,
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
  Outstanding: StrongBox tier enforcement (H-1 FIXED PR #527), independent audit. C-1
  FIXED / device-verified (v3, 2026-07-05, PR #568 — see Android bullet above; txid
  `0xecd68494e888af742e5166c93c5354536fb6bbe62e93dc795847079d981727e3`, block 11206686),
  following a same-day regression-then-fix cycle (previously REGRESSED / binding-
  unconfirmed earlier 2026-07-05; before that, RESOLVED / device-verified 2026-07-02 on
  PR #529 + txid `0xeb71a5d…` block 11185289, which proved the unlock FLOW only, not salt
  binding). Salt-tamper negative test, v2→v3 migration device-exercise, on-device
  multi-enrollment salt distinctness, and independent audit remain outstanding. New
  finding LOG-1 (debug-build logcat leaks H + vault blob in cleartext) also open. Android
  biometric re-enrollment invalidation test DONE (PR #516/#518).
  H-1 UI surfacing: FIXED PR #527 (merged 2026-07-02).
  See `docs/hardware-kek-phase-plan.md`, `docs/Feature-Status.md` §4, and
  `docs/audit-2026-07-01-kek-internal.md` for full evidence.
- Status is BUILT + device-verified for both platforms on the unlock FLOW (Android
  end-to-end including the C-1 salt-binding fix, iOS partial / no SE-unlock log trace) —
  2026-07-01 INTERNAL static-analysis audit complete (1C/9H/12M/6L; 10 fixed
  PRs #520–#522; H-1 FIXED PR #527). NOT independently audited. On-chain evidence exists
  on BOTH platforms' KEK-gated unlock path, at different confidence, and Android's C-1
  item has been through a same-day regression-then-fix cycle on 2026-07-05: Android is
  device-verified end-to-end on the StrongBox-unlock FLOW (Sepolia txid `0xeb71a5d…`,
  block 11185289, 2026-07-02, PR #529) — the C-1 per-enrollment salt-binding claim tied
  to that PR was found REGRESSED / binding-unconfirmed earlier on 2026-07-05 (facade
  arg-drop + bridge JSON.stringify silently reverted enroll and unlock to the fixed v1
  salt, so the txid proved the flow but not the binding), then **FIXED / device-verified
  the same day** via a v3 fix (PR #568): fresh v3 enrollment, cold-restart unlock, and a
  new KEK-gated Sepolia send (txid
  `0xecd68494e888af742e5166c93c5354536fb6bbe62e93dc795847079d981727e3`, block 11206686)
  all logged `"salt-source: v2-bound"` only when the intact salt crossed the Capacitor
  bridge — INTERNAL evidence, not independent audit. Still outstanding on the Android
  C-1 item: a salt-tamper negative test (not feasible non-invasively on this device), the
  v2→v3 lazy migration path device-exercise (unit-tested only), on-device multi-enrollment
  salt distinctness (unit-proven only), and independent audit. A new finding, LOG-1
  (Capacitor's debug bridge logger echoes the KEK factor H and the full vault blob to
  logcat in DEBUG builds — HIGH for debug/CI context, not yet a production finding), also
  surfaced during the 2026-07-05 device-verification session; remediation is tracked
  separately. iOS has an OS-daemon-corroborated KEK-gated Sepolia txid (`0x5116e7bc…`,
  block 11185985, 2026-07-02 — coreauthd/ctkd/biometrickitd correlation to the app pid),
  but the LITERAL SE-unlock app-trace (iOS-F9) is still open, so iOS remains
  device-verified PARTIAL, not full. Neither platform is independently audited; the iOS
  txids are recorded as non-promoting META evidence (they do not flip iOS KEK to
  catalogue-`verified`), and neither are the new Android v3 txids — this update records a
  device-verified fix, not a catalogue "verified" promotion (that bar remains the strict
  per-asset explorer-txid rule and does not apply to an unlock-gate feature).

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
  genuine before/after device trace. Outstanding: the vault-desync screen half of PR #613
  was NOT exercised this session and remains device-unverified. No on-chain txid involved
  (not applicable to a UX/security-logic check). INTERNAL verification, not independent.
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
- **H8 — personal_sign address binding:** resolves EIP-1474 vs MetaMask-legacy param
  order; rejects if neither param is the wallet's own address (I4).
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
