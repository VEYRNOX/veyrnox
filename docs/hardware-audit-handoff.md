# Hardware KEK Handoff Checklist — 2026-07-02

This document is a single, precise, actionable checklist of every remaining Hardware KEK
item that cannot be completed from the Windows dev machine. It is a handoff artifact:
when the owner is at the right machine, device, or browser — or engaging the external
independent auditor — each item below can be picked up and executed without re-deriving
scope. Nothing in this document is "verified." That word is reserved for an item that has
a real on-chain txid or a real device trace the owner supplies. Code-complete, tests-green,
or even prior device sessions (noted below as PARTIAL) are BUILT at most, never "verified."
This document does not change any status in `docs/Feature-Status.md`, `docs/verified-evidence.json`,
or `CLAUDE.md`; it only consolidates the outstanding gates.

Sources: `CLAUDE.md` Hardware KEK Phase 1/2 Rollout section; `docs/Feature-Status.md` §4
and Open/residual items; `docs/audit-2026-07-01-kek-internal.md`; `docs/hardware-kek-phase-plan.md`;
`docs/verified-evidence.json` (what is already closed); `docs/Audit.scope.md`.

---

## Section A — Needs a Mac + Xcode (iOS native build)

These items require compiling and running native ObjC/Swift code. They are not buildable
or testable from a Windows machine (CLAUDE.md Environment: "iOS native build is NOT possible
here (needs a Mac)"). The relevant plugin source is `ios/App/App/HardwareKekPlugin.m` and
`HardwareKekPlugin.h`.

- [ ] **iOS-F5 — NSData to NSMutableData zeroing**
  - Finding ID: iOS-F5 (HIGH, `docs/audit-2026-07-01-kek-internal.md`)
  - Description: The `HardwareKekPlugin.m` ObjC layer decrypts the SE-ECIES-wrapped key
    material into an `NSData` buffer. `NSData` is immutable; the decrypted bytes persist
    in heap until ARC dealloc. Fix requires switching to `NSMutableData` and calling
    `[data resetBytesInRange:NSMakeRange(0, data.length)]` immediately after use, then
    ensuring ARC retain count drops promptly.
  - File/symbol: `ios/App/App/HardwareKekPlugin.m` — the `decryptData` / `getHardwareFactor`
    return path where the plaintext H factor is held as `NSData`.
  - `docs/Feature-Status.md` §Open/residual: "FIXED IN CODE (PR #526, 2026-07-01) —
    text-level ObjC; Mac build + SE-unlock test required." The code edit is present; the
    compiled artefact has never been tested.
  - Why blocked on Windows: ObjC compilation requires Xcode on macOS.
  - Acceptance criterion: Build `npm run ios` on Mac, install on a real iPhone (simulator
    has no Secure Enclave), enroll KEK, perform an unlock, confirm via Instruments Memory
    Debugger or `leaks` tool that no decrypted key material lingers after unlock. The
    zeroing is the fix; the confirming evidence is the absence of the buffer in the heap
    dump after unlock.

- [ ] **iOS-F3 — Replace deprecated kSecUseOperationPrompt with LAContext**
  - Finding ID: iOS-F3 (MEDIUM, `docs/audit-2026-07-01-kek-internal.md`)
  - Description: `HardwareKekPlugin.m` uses `kSecUseOperationPrompt` to present the
    biometric prompt string. This key was deprecated in iOS 9. The fix requires replacing
    it with an `LAContext` set with `localizedReason` and passing it via
    `kSecUseAuthenticationContext`. On recent iOS versions the deprecated key is silently
    ignored, meaning the biometric prompt string may not display.
  - File/symbol: `ios/App/App/HardwareKekPlugin.m` — the SecItem query dict that sets
    `kSecUseOperationPrompt`.
  - `docs/Feature-Status.md` §Open/residual: "FIXED IN CODE (PR #526, 2026-07-01) —
    text-level ObjC; Mac build + biometric test required." Text edit exists; untested.
  - Why blocked on Windows: Xcode build required; Face ID prompt only shows on a real
    iPhone (simulator Face ID is mock).
  - Acceptance criterion: Build and install on iPhone, perform a KEK unlock, confirm the
    biometric prompt displays the correct localizedReason string. No runtime deprecation
    warning in the device console.

- [ ] **iOS SE-unlock log trace via os_log(public) debug build (supports iOS-F9 closure)**
  - Finding ID: iOS-F9 (HIGH evidence gap, `docs/audit-2026-07-01-kek-internal.md`)
  - Description: The two existing Sepolia sends from the iPhone 17 Pro Max
    (`0xf09c036c…` nonce 27, block 11178961; `0x0b13d553…` nonce 28, block 11179002;
    recorded in `docs/verified-evidence.json` `_ios_hardware_kek_device_verification`)
    proved the SE-KEK gated signing architecturally. However, the live
    `getHardwareFactor()` SE-unlock log line tied to those sends was NOT captured.
    The newer nonce-32 send (`0x5116e7bc…`, block 11185985, `_ios_kek_se_operation_os_evidence`
    in `verified-evidence.json`) adds corroborating OS-daemon evidence (coreauthd /
    ctkd peer[4913] ACL evaluation) but is still not the app's own log line. iOS-F9
    requires the app's explicit `[VEYRNOX-KEK] getHardwareFactor: SUCCESS` line.
  - Why blocked on Windows: requires a Mac + Xcode debug build compiled with
    `os_log(public)` instead of `NSLog` (NSLog is not streamable from iOS 26 via
    idevicesyslog or `log collect`; confirmed in project memory
    `ios26-nslog-not-capturable-se-daemon-evidence.md`). Then install on iPhone and
    perform a new KEK-gated Sepolia send while streaming `log stream --predicate
    'process=="Veyrnox"'` on the Mac.
  - Acceptance criterion: An unredacted `os_log` line containing the `getHardwareFactor`
    success entry correlated in time (within the same `log stream` session) to a new
    KEK-gated Sepolia send. The txid of that send, supplied by the owner, is added to
    `docs/verified-evidence.json` and advances iOS from PARTIAL to full device-verified.

---

## Section B — Needs an unrestricted iPhone (runtime device test, not a build)

These items have code complete or ACL flags already set. The blocker is a runtime test
that requires an iPhone where Face ID enrollment is unrestricted. The test iPhone 17 Pro Max
used in previous sessions has Face ID enrollment restricted and cannot be used.
(Source: `CLAUDE.md` Phase 2 iOS bullet; `docs/audit-2026-07-01-kek-internal.md`
H-2/iOS-F11 entry.)

- [ ] **H-2/iOS-F11 — Biometric re-enrollment invalidation runtime test (iOS)**
  - Finding ID: H-2 / iOS-F11 (HIGH, `docs/audit-2026-07-01-kek-internal.md`)
  - Description: The `kSecAccessControlBiometryCurrentSet` ACL flag is already set on the
    SE key in `HardwareKekPlugin.m:96` (confirmed positive by the 2026-07-01 audit). The
    Android half of this finding is RESOLVED / device-verified on Pixel 10 Pro XL
    (PR #516/#518, 2026-07-01: delete + re-enroll fingerprint → `KeyPermanentlyInvalidatedException`
    → fail-closed, PIN fallback intact; recorded as `_hardware_kek_biometric_reenroll_invalidation`
    in `docs/verified-evidence.json`). The iOS half requires running the same test scenario
    on a real iPhone.
  - Why blocked: the test iPhone 17 Pro Max has Face ID enrollment restricted. Per
    `CLAUDE.md`: "needs an unrestricted iPhone."
  - Test procedure (mirrors the Android test):
    1. Enroll KEK on the unrestricted iPhone (Face ID + PIN, from a clean vault).
    2. Go to iOS Settings → Face ID & Passcode → remove and re-enroll Face ID.
    3. Force-close and cold restart the Veyrnox app.
    4. Attempt a KEK unlock — the SE key must be invalidated by `kSecAccessControlBiometryCurrentSet`.
    5. Confirm the app detects invalidation and refuses unlock (fail-closed, I4).
    6. Confirm PIN fallback recovers the vault (I4 recovery path intact).
  - Acceptance criterion: App displays "Hardware key invalidated — re-enrollment required"
    (or equivalent fail-closed error); PIN fallback successfully decrypts the vault. Log
    the device model, iOS version, and test date. Record as a META key in
    `docs/verified-evidence.json` (mirrors `_hardware_kek_biometric_reenroll_invalidation`).

- [ ] **iOS KEK-gated Sepolia send — promote iOS from PARTIAL to full device-verified**
  - Description: iOS currently holds BUILT / device-verified (PARTIAL). The two prior
    Sepolia sends (nonces 27, 28) are confirmed on-chain but the SE-unlock log trace was
    not captured (iOS-F9, Section A above). A new KEK-gated send done alongside the
    `os_log(public)` debug build (Section A) and the iOS-F5/F-3 Mac build would satisfy
    the real-device verification gate and provide the promoting txid.
  - Acceptance criterion: A new KEK-gated Sepolia send txid supplied by the owner,
    accompanied by the `os_log` trace from the same session confirming SE operation. Added
    to `docs/verified-evidence.json` under `evidence` (not a META key) to advance iOS
    to full device-verified. The status in `docs/Feature-Status.md` §4 may then be updated
    from "PARTIAL" to device-verified.

---

## Section C — Needs a real browser session

These items are code-complete and unit-tested but have never been driven through a real
browser with a real platform authenticator and a real on-chain transaction.

- [ ] **WebAuthn PRF KEK Phase 1 — browser UAT (Chrome + Firefox, Sepolia txids)**
  - Status: BUILT / UAT-PENDING (`docs/Feature-Status.md` §4; `docs/hardware-kek-phase-plan.md`)
  - Description: Phase 1 WebAuthn PRF KEK is code-complete (`src/lib/web.js`, ~200 LOC;
    `src/lib/kek.js` `combineKek`), unit-tested (19 PRF-specific tests, 1973/1973 passing),
    and all 2026-07-01 audit remediations are merged (PRs #520–#522: F-01 PRF orphan guard,
    F-02 double-enroll guard, F-03 PRF salt renamed to `prf-kek-v1`, F-05 credential ID
    committed after PRF confirmed, F-06 H zeroing in `changePassword` finally, F-08
    `unwrapDek` zeros ptBuf). What remains is browser UAT.
  - Browsers required: Chrome >= 99 (full PRF hardware binding) and Firefox >= 108.
    Safari is graceful-fallback / password-only by design — no UAT needed for PRF.
  - Test procedure for each browser:
    1. Clear demo mode (`/?demo=0`), confirm real wallet shows 0.0 balance.
    2. Enroll WebAuthn PRF KEK (Settings → Security → Hardware KEK enroll).
    3. Lock the wallet, then perform a PRF-gated unlock (observe platform authenticator
       prompt — Windows Hello or Touch ID; must not be a software fallback).
    4. Send 0.001 ETH to the test recipient on Sepolia.
    5. Confirm the txid on-chain via the block explorer.
  - Acceptance criterion: For each browser (Chrome, Firefox), one Sepolia txid confirmed
    on-chain from a PRF-KEK-enrolled vault. Owner adds the txids to
    `docs/verified-evidence.json` under `evidence` with the browser noted. The status in
    `docs/Feature-Status.md` §4 Phase 1 browser table then advances from UAT-PENDING to
    device-verified for those browsers.
  - Note: The PRF salt rename (F-03, `"prf-spike"` → `"prf-kek-v1"`) is a protocol
    version bump. Any vault enrolled under the old salt requires re-enrollment; UAT must
    use a freshly enrolled vault under the new salt.

- [ ] **I3 no-egress trace on a real decoy-session send (deniability gap)**
  - Status: BUILT, NOT device-verified (`docs/Feature-Status.md` §6 device-global 2FA
    factor suppression entry, 2026-07-02)
  - Description: The `send2faMethod.js` deniability gate (merged 2026-07-02) suppresses
    device-global passkey and biometric 2FA factors when the active session is decoy or
    hidden, preventing an I3 deniability tell. The fix is code-complete and
    unit-tested (17/17 resolver tests, 59/59 security-component tests). What remains is
    confirming that a real decoy-session send makes zero outbound network calls — no
    passkey RP call, no biometric OS prompt with a real-session challenge, no price-feed
    or news egress.
  - Test procedure:
    1. Configure a Duress PIN (decoy wallet).
    2. Unlock using the Duress PIN (enter decoy session).
    3. Open browser DevTools → Network tab.
    4. Navigate to Send, send a small ETH Sepolia amount.
    5. Confirm: no WebAuthn RP call (`navigator.credentials.get` not fired), no biometric
       OS prompt, no outbound calls beyond the Sepolia RPC broadcast.
  - Acceptance criterion: Network log shows only the Sepolia RPC call. Owner records the
    session date, browser, and confirms the observation. This advances I3 decoy-send egress
    status from BUILT to confirmed-in-session.
  - Note: This is not a catalogue txid verification; it is a no-egress observation. Status
    stays BUILT; the observation note is added to `docs/Feature-Status.md` §6 or a
    `docs/verified-evidence.json` META key, not under `evidence`.

---

## Section D — Needs the external independent auditor

The 2026-07-01 pass covering Hardware KEK was INTERNAL. Per `docs/audit-2026-07-01-kek-internal.md`
and `docs/Audit.scope.md`, this internal pass "does NOT satisfy the independent-audit gate condition."
Per `CLAUDE.md` hard rules: "Internal is never to be presented as independent (I4 honesty)."
The existing independent audit (ECC, 2026-06-23, PR #340) covered the pre-KEK codebase; Hardware
KEK Phase 1/2 was not in that scope.

- [ ] **Independent Hardware KEK audit — Phase 1 (WebAuthn PRF KEK) and Phase 2 (iOS SE KEK,
  Android StrongBox KEK)**
  - What to hand the auditor:
    - This handoff doc.
    - `docs/audit-2026-07-01-kek-internal.md` — the full internal finding table.
    - `docs/hardware-kek-phase-plan.md` — architecture overview.
    - `docs/Feature-Status.md` §4 — current status per surface.
    - `docs/verified-evidence.json` — closed txids and META keys (so auditor starts
      from the right baseline; do not re-verify what is already device-confirmed).
    - `src/lib/web.js` and `src/lib/kek.js` — Phase 1 surface.
    - `ios/App/App/HardwareKekPlugin.m` / `HardwareKekPlugin.h` — Phase 2 iOS surface.
    - `android/app/src/main/java/…/HardwareKekPlugin.kt` — Phase 2 Android surface.
    - `src/wallet-core/keystore/native.js` — JS-layer KEK orchestration for both
      mobile platforms.
  - Already remediated at audit start (do not re-raise as new findings):
    - C-1 (CRITICAL Android HMAC fixed input): RESOLVED / device-verified 2026-07-02,
      PR #529 (commit 732f9676), Sepolia txid `0xeb71a5d…`, block 11185289, v2 protocol
      (`hardwareKekVersion:2`, per-enrollment `kekSalt`).
    - H-1 (StrongBox tier surfacing): FIXED PR #527 (merged 2026-07-02), `tierBadge.js`
      + `HardwareKekSettings.jsx` + `getVaultKekTier()`.
    - H-4 (zero-vector H check): FIXED PR #522.
    - M-3 (detectTamper fail-open): FIXED PR #522 (`getOrElse { true }`).
    - F-01, F-02, F-03, F-05, F-06, F-08, iOS-F6 (web.js PRF hardening): FIXED
      PRs #520–#521.
    - H-2/iOS-F11 Android half: RESOLVED / device-verified PR #516/#518 (Pixel 10 Pro XL,
      biometric re-enrollment invalidation PASSED).
    - H-NEW-D (SE ECIES design): CLOSED — `kSecAttrTokenIDSecureEnclave` confirmed at
      `HardwareKekPlugin.m:78`.
    - H-3 (biometryLockout → device credential fallback): documented accepted deviation.
  - Still open at audit start (auditor should verify these remain properly handled):
    - iOS-F5 (NSData zeroing): code edit in PR #526 exists; Mac build + runtime test
      outstanding (Section A above).
    - iOS-F3 (kSecUseOperationPrompt): code edit in PR #526 exists; Mac build + biometric
      test outstanding (Section A above).
    - iOS-F9 (SE-unlock log trace): evidence gap only — architectural proof and
      OS-daemon evidence present; app's own log line still outstanding (Section A above).
    - H-2/iOS-F11 iOS half: ACL flag set in code; runtime re-enrollment test
      device-blocked (Section B above).
    - H-3 accepted deviation: auditor should assess whether the accepted device-credential
      fallback is within acceptable coercion-model risk.
  - Independent audit scope additions (beyond the 2026-07-01 internal pass):
    - Phase 1 WebAuthn PRF UAT confirmation (auditor should witness or review evidence of
      the browser UAT — Section C above).
    - Supply-chain review of `@aparajita/capacitor-secure-storage@8.0.0` (Android
      `.commit()` patch-package patch in `patches/@aparajita+capacitor-secure-storage+8.0.0.patch`).
    - The `kek.js combineKek` HKDF construction (I6 invariant: ordered H ‖ C
      concatenation, domain `veyrnox/kek/v1/combine(H||C)`). The internal pass noted
      no obvious construction weakness; independent human review is the confirmatory step.
    - The `android:allowBackup="false"` enforcement and iOS ATS enforcement (confirmed
      in internal pass; independent audit should re-verify).
  - Gate note: The independent audit does not gate `ALLOW_MAINNET` (mainnet was unlocked
    2026-06-17 by the internal audit). It is required before Hardware KEK can be promoted
    beyond BUILT for catalogue or marketing purposes, and before App Store submission of
    a build that advertises Hardware KEK as an active control. Per `docs/Audit.scope.md`:
    "The independent third-party audit scoped [here] is intended BEFORE store submission,
    as external depth/assurance."
  - Cost / timeline reminder (`docs/Audit.scope.md`): wallet-app audit ~$7k–$30k, 2–4 weeks;
    budget for the re-review pass; rush = +30–50%. Engage early (2–3 month waitlists at
    tier-1 firms).

---

## Section E — Roadmap / not-yet-scoped (for completeness; clearly separated from active items)

These are PLANNED or TARGET items that are not open findings and have not been designed
to the point of being actionable. They are listed here so the handoff reader knows they
exist and are out of scope for the current hardware-KEK sprint. None should be built
without the design and audit gates described in `CLAUDE.md`.

- **RASP Phase 4 — native OS-level probes (Play Integrity / App Attest):** TARGET. The
  policy lane is BUILT (browser-level detection always-on); the native probe source
  (jailbreak/root/debugger/tamper via Capacitor plugin) and remote attestation leg are
  unbuilt. Requires a native Capacitor plugin + real-device test on a rooted / Frida
  device. (`docs/Feature-Status.md` §7; CLAUDE.md audit gate note.)

- **Cloud backup escrow (backend-escrow variant):** TARGET. The local encrypt-then-export
  path is BUILT. The backend-escrow variant (server-side ciphertext target) requires a
  cloud target decision + a fresh audit of that specific design. (`docs/Feature-Status.md`
  §7 Encrypted cloud backup note.)

- **OFAC SDN live feed (full mirror + BTC + SOL):** PLANNED, legal-gated. A single
  illustrative EVM sanctioned address is wired today. The bulk live feed is a roadmap
  upgrade gated on independent legal review before it may ship.
  (`docs/Feature-Status.md` §5; `docs/Audit.scope.md` §2d.)

- **Trezor ERC-20 hardware signing:** TARGET. ETH/BTC/SOL Trezor send paths are BUILT
  (PR #475); ERC-20 hardware signing and multi-account paths are not yet wired.
  (`docs/Feature-Status.md` §6 Hardware wallet.)

- **AI transaction advisory (on-device):** PLANNED. All current LLM/AI entries are
  advisory-only stubs. A real on-device advisory requires a design decision about data
  scope and an audit of the inference surface. (`docs/Feature-Status.md` §9.)

- **StrongBox tier enforcement (reject non-StrongBox devices at enrollment):** TARGET.
  Today, tier is observed and surfaced honestly in the badge (H-1 FIXED PR #527) but
  enrollment is not rejected on non-StrongBox hardware. A non-StrongBox device enrolls
  and receives a "TEE Protected" badge. Enforcement is a design decision (explicit UX
  barrier) that needs a product decision before implementation.
  (`docs/Feature-Status.md` §4 Android StrongBox entry.)

- **Per-set passkey/biometric 2FA enablement:** TARGET, owner-deferred. Today the
  suppressions are device-global; per-set preference requires audit-critical container
  schema changes in `src/wallet-core/multiVault.js`. (`docs/Feature-Status.md` §6
  per-set passkey/biometric entry.)

---

## Section F — Already closed this session (do not re-do)

These items are on `main` as of 2026-07-02. The handoff reader should not re-attempt
them. The WON'T-DO decision is permanent unless the owner explicitly reconsiders.

| Item | PR / Decision | What it closed |
|---|---|---|
| PR #546 — Device-global 2FA factor suppression in decoy/hidden sessions | #546 (confirm PR number) | `send2faMethod.js` deniability gate: passkey + biometric 2FA suppressed in decoy/hidden sessions (I3 tell closed); 17/17 resolver tests + 59/59 security-component tests passing |
| PR #547 — hiddenWallet2faMode container-serialization fix | #547 (confirm PR number) | `multiVault.js` 2-line fix: `hiddenWallet2faMode` now round-trips through `serializeContainer` / `parseVault`; hidden-wallet reveal gate no longer silently reset on every unlock |
| PR #548 — (confirm) | #548 (confirm) | (confirm from PR description — not yet in `docs/Feature-Status.md` as of this writing) |
| PR #549 — (confirm) | #549 (confirm) | (confirm from PR description — not yet in `docs/Feature-Status.md` as of this writing) |
| KDF test-override WON'T-DO decision | Owner decision 2026-07-02 | `docs/Feature-Status.md` §8: adding a weaker-params escape hatch to `vault.js` purely for test speed is not worth the risk (seed/key file off-limits to cosmetic work); suite already copes via single-worker pin + raised timeouts; will only revisit under real-device/CI time budget with `VITE_RELEASE` build-time throw protection |

Note on PRs #546–#549 and the WON'T-DO: the PR numbers #546, #547, #548, #549 are
cited in the handoff request. PRs #546 and #547 correspond to the items described
in `docs/Feature-Status.md` §6 (device-global 2FA suppression and container-serialization
bug fix, both recorded as closed 2026-07-02). PRs #548 and #549 were not found in
`docs/Feature-Status.md` or any doc at the time of writing this checklist. The owner
should confirm those PR numbers and what they closed before marking them done-do-not-redo.
This is flagged explicitly rather than invented.

---

## Cross-references

- `docs/Feature-Status.md` §4 — Hardware KEK Phase 1/2 full status table
- `docs/Feature-Status.md` Open/residual items — 2026-07-01 INTERNAL audit finding table
- `docs/audit-2026-07-01-kek-internal.md` — full internal audit report (INTERNAL, not independent)
- `docs/hardware-kek-phase-plan.md` — phase plan and device-verification evidence
- `docs/Audit.scope.md` — independent audit scope and gate conditions
- `docs/verified-evidence.json` — closed txids and META keys (single source of verified status)
- `CLAUDE.md` — Hardware KEK Phase 1/2 Rollout section, hard rules, I6 invariant
