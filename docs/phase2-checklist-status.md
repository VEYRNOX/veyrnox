# Phase 2 Checklist — Automated Status Report

_Generated 2026-07-15T14:27:14.399Z by `scripts/phase2-checklist-runner.mjs` (static tier)._

> **Honesty contract.** An item is ticked from one of two sources, never fabricated:
> (1) **automation** — `AUTOMATED-PASS`/`FAIL`/`CI-VERIFIED` mean a real command exited 0/non-0
> here or in CI; an `AUTOMATED-PASS` standing in for a device behaviour is unit/contract
> coverage only, NOT device verification (see the note). (2) **evidence ledger**
> (`scripts/phase2-evidence-ledger.mjs`) — `DEVICE-VERIFIED` cites a merged PR + real-device
> session; `ONCHAIN-VERIFIED` re-queries the chain live (`--verify-onchain`) and downgrades to
> `ONCHAIN-DOCUMENTED` if it does not confirm SUCCESS. All ledger evidence is **INTERNAL** —
> real hardware/CI, NOT independently audited. Biometric/auditor items with no evidence on
> file stay `BLOCKED`. Nothing here satisfies the plan's independent-audit gate (1426) or
> flips the mainnet flag (1374/1428) — those remain `BLOCKED` by design.

## Summary

- **38 / 116** items satisfied: 9 automated-pass · 4 on-chain-verified · 0 on-chain-documented · 23 device-verified · 2 CI-verified.
- **22** automated-fail · **56** still blocked · **0** env-blocked here · **0** skipped.
- Green statuses other than `AUTOMATED-PASS` are **INTERNAL** evidence (real hardware / real CI / live txid) — they do **NOT** satisfy the plan's independent-audit gate (line 1426) or flip the mainnet flag (1374/1428), which remain `BLOCKED`.

| Status | Count | Meaning |
|---|---|---|
| ✅ AUTOMATED-PASS | 9 | Real command exited 0 |
| ⛓️✅ ONCHAIN-VERIFIED | 4 | Real send, txid LIVE-re-confirmed SUCCESS on-chain (INTERNAL) |
| 🟢 DEVICE-VERIFIED | 23 | Confirmed on real hardware per merged PR (INTERNAL, not audited) |
| 🧪 CI-VERIFIED | 2 | Build/compile proven by a CI workflow |
| ❌ AUTOMATED-FAIL | 22 | Real command failed — see log |
| ⏳ BLOCKED-GATE | 2 | Audit gate flag, correctly OFF until sign-off |
| 🔒 BLOCKED-HARDWARE | 25 | Needs physical device / biometric (no evidence on file yet) |
| ⛓️ BLOCKED-ONCHAIN | 1 | Needs real explorer-confirmed txid |
| 🧑 BLOCKED-HUMAN | 28 | Needs a human / external party |

## Pre-Kickoff — iPhone acquisition & pre-test

| | Line | Item | Status | Evidence |
|---|---|---|---|---|
| 🔒 | 52 | Device boots and is factory-reset | `BLOCKED-HARDWARE` | Physical iPhone required. |
| 🔒 | 53 | Face ID enrolls and works | `BLOCKED-HARDWARE` | Physical Face ID enrolment. |
| 🔒 | 54 | iOS 17.2+ installed | `BLOCKED-HARDWARE` | Physical device OS state. |
| 🧑 | 55 | iCloud sign-in optional | `BLOCKED-HUMAN` | Manual account decision. |
| 🔒 | 56 | Stable WiFi access | `BLOCKED-HARDWARE` | Physical network state. |

## Pre-Kickoff — Android acquisition & pre-test

| | Line | Item | Status | Evidence |
|---|---|---|---|---|
| 🔒 | 83 | Device boots and is factory-reset | `BLOCKED-HARDWARE` | Physical Pixel required. |
| 🔒 | 84 | Fingerprint enrolls and works | `BLOCKED-HARDWARE` | Physical fingerprint enrolment. |
| 🔒 | 85 | Android 9.0+ confirmed (adb getprop) | `BLOCKED-HARDWARE` | Needs attached device (device tier). |
| 🔒 | 86 | StrongBox present | `BLOCKED-HARDWARE` | Needs attached device (device tier). |
| 🔒 | 87 | Stable WiFi + USB-C for ADB | `BLOCKED-HARDWARE` | Physical connectivity. |

## Environment setup

| | Line | Item | Status | Evidence |
|---|---|---|---|---|
| 🧑 | 150 | Open App.xcworkspace | `BLOCKED-HUMAN` | One-time Xcode GUI. |
| 🧑 | 151 | Select team/signing | `BLOCKED-HUMAN` | One-time Xcode GUI signing. |
| 🧑 | 152 | Auto-manage signing | `BLOCKED-HUMAN` | One-time Xcode GUI signing. |
| 🧑 | 153 | Provisioning profile auto-provisions | `BLOCKED-HUMAN` | One-time Xcode GUI signing. |
| 🔒 | 188 | Enable Developer Mode on device | `BLOCKED-HARDWARE` | Physical device toggle. |
| 🔒 | 189 | Enable USB Debugging | `BLOCKED-HARDWARE` | Physical device toggle. |
| 🔒 | 190 | Connect via USB-C, allow debugging | `BLOCKED-HARDWARE` | Physical connection prompt. |
| 🔒 | 191 | adb sees device | `BLOCKED-HARDWARE` | Needs attached device (device tier). |

## Team coordination

| | Line | Item | Status | Evidence |
|---|---|---|---|---|
| 🧑 | 217 | Audit contact established | `BLOCKED-HUMAN` | External coordination. |
| 🧑 | 218 | Slack channel / thread created | `BLOCKED-HUMAN` | External coordination. |
| 🧑 | 219 | Daily standup scheduled | `BLOCKED-HUMAN` | External coordination. |
| 🧑 | 220 | GitHub project board created | `BLOCKED-HUMAN` | External coordination. |
| 🧑 | 221 | PRs/issues added to board | `BLOCKED-HUMAN` | External coordination. |
| 🧑 | 222 | Blockers list created | `BLOCKED-HUMAN` | External coordination. |
| 🧑 | 223 | Escalation path defined | `BLOCKED-HUMAN` | External coordination. |

## Phase 2a iOS — Week 1: Build & device setup

| | Line | Item | Status | Evidence |
|---|---|---|---|---|
| 🧪 | 288 | Xcode build completes (no errors) | `CI-VERIFIED` | PR #705 · device: macOS CI (Xcode 26.5) · ref: .github/workflows/ios-compile-check.yml<br>_App target builds clean; F3/F5 zero-deprecation-warning. INTERNAL — real hardware/CI, NOT independently audited._ |
| 🟢 | 289 | App launches on real iPhone | `DEVICE-VERIFIED` | PR #495 · device: iPhone 17 Pro Max · ref: verified-evidence.json:_ios_hardware_kek_device_verification<br>_App ran + made two KEK-gated Sepolia sends. INTERNAL — real hardware/CI, NOT independently audited._ |
| 🧪 | 290 | No Swift compilation errors | `CI-VERIFIED` | PR #705 · device: macOS CI (Xcode 26.5) · ref: .github/workflows/ios-compile-check.yml<br>_Same compile as 288. INTERNAL — real hardware/CI, NOT independently audited._ |
| 🟢 | 291 | Keychain accessible on device | `DEVICE-VERIFIED` | PR #495 · device: iPhone 17 Pro Max · ref: _ios_hardware_kek_device_verification<br>_SE keychain items created at enroll (real device). INTERNAL — real hardware/CI, NOT independently audited._ |

## Phase 2a iOS — Week 2: Enrollment & keychain

| | Line | Item | Status | Evidence |
|---|---|---|---|---|
| ❌ | 396 | enrollHardwareCredential() succeeds | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified._ |
| ❌ | 397 | isHardwareEnrolled() true after enroll | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified._ |
| ❌ | 398 | getHardwareFactor() returns base64 H | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified._ |
| ❌ | 399 | clearHardwareCredential() deletes items | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified._ |
| ❌ | 400 | Repeat enroll/clear 3x, no stale items | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified._ |
| 🔒 | 401 | No Keychain sync to iCloud | `BLOCKED-HARDWARE` | Real iCloud-sync behaviour is device-only. |

## Phase 2a iOS — Week 3: Face ID & re-enroll

| | Line | Item | Status | Evidence |
|---|---|---|---|---|
| 🟢 | 455 | Face ID prompt renders | `DEVICE-VERIFIED` | PR #495 · device: iPhone (F9 session) · ref: _ios_f9_se_unlock_trace_captured<br>_Literal [VEYRNOX-KEK] "Face ID prompt now" trace captured. INTERNAL — real hardware/CI, NOT independently audited._ |
| 🟢 | 456 | Approve Face ID → H retrieved | `DEVICE-VERIFIED` | PR #495 · device: iPhone (F9 session) · ref: _ios_f9_se_unlock_trace_captured<br>_"SUCCESS — Face ID passed, H recovered (32 bytes)" trace. INTERNAL — real hardware/CI, NOT independently audited._ |
| 🟢 | 457 | Deny Face ID → error, no H | `DEVICE-VERIFIED` | PR #495 · device: iPhone (F3 session) · ref: CLAUDE.md iOS-F3<br>_Negative check fail-closed on device (I4). INTERNAL — real hardware/CI, NOT independently audited._ |
| 🟢 | 458 | Re-enroll → old key invalidated | `DEVICE-VERIFIED` | PR #495 · device: iPhone 8 Plus (iOS 16.7.16, Touch ID) · ref: CLAUDE.md H-2/iOS-F11 CLOSED 2026-07-08<br>_Re-enroll → SE key invalidated → "Incorrect PIN" fail-closed. (verified-evidence.json still reads "outstanding" here — that META entry is stale; flagged.) INTERNAL — real hardware/CI, NOT independently audited._ |
| 🔒 | 459 | Error messages user-friendly | `BLOCKED-HARDWARE` | On-device UX; partial string coverage in vitest. |
| 🔒 | 460 | Latency median ≤ 2s | `BLOCKED-HARDWARE` | Device measurement. |
| 🔒 | 461 | 5-cycle test passes | `BLOCKED-HARDWARE` | Device measurement. |

## Phase 2a iOS — Week 4: Testnet & report

| | Line | Item | Status | Evidence |
|---|---|---|---|---|
| ⛓️ | 472 | Device funded 0.05 Sepolia ETH | `BLOCKED-ONCHAIN` | Real funded device. |
| 🟢 | 473 | App built + running on iPhone | `DEVICE-VERIFIED` | PR #495 · device: iPhone 17 Pro Max · ref: _ios_hardware_kek_device_verification<br>_INTERNAL — real hardware/CI, NOT independently audited._ |
| 🟢 | 474 | Face ID enrolled + working | `DEVICE-VERIFIED` | PR #495 · device: iPhone (F9 session) · ref: _ios_f9_se_unlock_trace_captured<br>_INTERNAL — real hardware/CI, NOT independently audited._ |
| ⛓️✅ | 582 | Testnet send succeeds (on-chain txid) | `ONCHAIN-VERIFIED` | txid `0xf09c036c87…` LIVE-confirmed SUCCESS, block 11178961 · PR #495 · device: iPhone 17 Pro Max · ref: _ios_hardware_kek_device_verification<br>_INTERNAL — real hardware/CI, NOT independently audited._ |
| 🧑 | 583 | Verification report complete + signed | `BLOCKED-HUMAN` | Human sign-off. |
| ❌ | 584 | Invariants I1–I6 confirmed | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified. Invariant sign-off is human._ |
| 🔒 | 585 | Latency baseline recorded | `BLOCKED-HARDWARE` | Device measurement. |

## Phase 2b Android — Week 2: Build & device setup

| | Line | Item | Status | Evidence |
|---|---|---|---|---|
| 🟢 | 629 | gradlew assembleDebug succeeds | `DEVICE-VERIFIED` | PR #497, #499 · device: Pixel 10 Pro XL (Android 16/API 36) · ref: _android_hardware_kek_device_verification<br>_APK demonstrably built — installed & ran on device. INTERNAL — real hardware/CI, NOT independently audited._ |
| 🟢 | 630 | APK installs to real Pixel | `DEVICE-VERIFIED` | PR #497, #499 · device: Pixel 10 Pro XL (Android 16/API 36) · ref: _android_hardware_kek_device_verification<br>_INTERNAL — real hardware/CI, NOT independently audited._ |
| 🟢 | 631 | App launches without crash | `DEVICE-VERIFIED` | PR #497, #499 · device: Pixel 10 Pro XL · ref: _android_hardware_kek_device_verification<br>_INTERNAL — real hardware/CI, NOT independently audited._ |
| 🟢 | 632 | No fatal logcat errors | `DEVICE-VERIFIED` | PR #497, #499 · device: Pixel 10 Pro XL · ref: _android_hardware_kek_device_verification<br>_INTERNAL — real hardware/CI, NOT independently audited._ |
| 🟢 | 633 | HardwareKekPlugin.kt compiles | `DEVICE-VERIFIED` | PR #497, #499 · device: Pixel 10 Pro XL · ref: _android_hardware_kek_device_verification<br>_Plugin ran on device (StrongBox enroll/unlock), so it compiled. INTERNAL — real hardware/CI, NOT independently audited._ |

## Phase 2b Android — Week 3: Enrollment & keystore

| | Line | Item | Status | Evidence |
|---|---|---|---|---|
| ❌ | 729 | enrollHardwareCredential() succeeds | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified._ |
| ❌ | 730 | isHardwareEnrolled() true after enroll | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified._ |
| ❌ | 731 | getHardwareFactor() returns base64 H | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified._ |
| ❌ | 732 | clearHardwareCredential() deletes key | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified._ |
| ❌ | 733 | Repeat enroll/clear 3x, no stale keys | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified._ |
| 🟢 | 734 | StrongBox availability detected | `DEVICE-VERIFIED` | PR #527 · device: Pixel 10 Pro XL · ref: CLAUDE.md H-1 tier surfacing<br>_Logged tier=STRONGBOX (securityLevel=2). INTERNAL — real hardware/CI, NOT independently audited._ |

## Phase 2b Android — Week 4: Fingerprint & re-enroll

| | Line | Item | Status | Evidence |
|---|---|---|---|---|
| 🟢 | 803 | BiometricPrompt renders on unlock | `DEVICE-VERIFIED` | PR #497, #499 · device: Pixel 10 Pro XL · ref: _android_hardware_kek_device_verification<br>_BiometricService StrengthRequested:15 (BIOMETRIC_STRONG). INTERNAL — real hardware/CI, NOT independently audited._ |
| 🟢 | 804 | Approve fingerprint → H, vault unlocks | `DEVICE-VERIFIED` | PR #497, #499 · device: Pixel 10 Pro XL · ref: _android_hardware_kek_device_verification<br>_Unlock required the StrongBox factor H before signing. INTERNAL — real hardware/CI, NOT independently audited._ |
| 🔒 | 805 | Deny fingerprint → error, no unlock | `BLOCKED-HARDWARE` | Biometric — human + StrongBox. |
| 🟢 | 806 | Re-enroll → KeyPermanentlyInvalidatedException | `DEVICE-VERIFIED` | PR #516, #518 · device: Pixel 10 Pro XL · ref: _hardware_kek_biometric_reenroll_invalidation<br>_✅ PASS — OS invalidated key, app refused insecure unlock (I4). INTERNAL — real hardware/CI, NOT independently audited._ |
| 🟢 | 807 | Auto-clear detected, JS notified | `DEVICE-VERIFIED` | PR #516, #518 · device: Pixel 10 Pro XL · ref: _hardware_kek_biometric_reenroll_invalidation<br>_Part of the re-enroll invalidation flow. INTERNAL — real hardware/CI, NOT independently audited._ |
| 🔒 | 808 | Error messages user-friendly | `BLOCKED-HARDWARE` | On-device UX. |
| 🔒 | 809 | Latency median ≤ 3s | `BLOCKED-HARDWARE` | Device measurement. |
| 🔒 | 810 | 5-cycle test passes | `BLOCKED-HARDWARE` | Device measurement. |

## Phase 2b Android — Week 5: Testnet & report

| | Line | Item | Status | Evidence |
|---|---|---|---|---|
| ⛓️✅ | 924 | Testnet send succeeds (on-chain txid) | `ONCHAIN-VERIFIED` | txid `0xecd68494e8…` LIVE-confirmed SUCCESS, block 11206686 · PR #568 · device: Pixel 10 Pro XL · ref: _android_hardware_kek_c1_v3_device_verification<br>_INTERNAL — real hardware/CI, NOT independently audited._ |
| 🧑 | 925 | Verification report complete + signed | `BLOCKED-HUMAN` | Human sign-off. |
| ❌ | 926 | Invariants I1–I6 confirmed | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified. Invariant sign-off is human._ |
| 🟢 | 927 | Keystore tier documented | `DEVICE-VERIFIED` | PR #527 · device: Pixel 10 Pro XL · ref: CLAUDE.md H-1<br>_tierBadge.js surfaces real tier (StrongBox/TEE) from getVaultKekTier(). INTERNAL — real hardware/CI, NOT independently audited._ |
| 🟢 | 928 | Latency baseline recorded | `DEVICE-VERIFIED` | PR #604 · device: Pixel 10 Pro XL · ref: CLAUDE.md KDF perf<br>_KDF-ONLY baseline: 192 MiB warm median 603 ms (n=5), cold 668 ms (n=3). Full fingerprint-unlock latency not separately measured. INTERNAL — real hardware/CI, NOT independently audited._ |

## Phase 2c — Integration & cross-platform

| | Line | Item | Status | Evidence |
|---|---|---|---|---|
| ❌ | 1008 | Old vault still unlocks on mobile | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified._ |
| ❌ | 1009 | New vault unlocks correctly | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified._ |
| ❌ | 1010 | Feature flag toggles unlock path | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified._ |
| ❌ | 1011 | Graceful degradation → password path | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified._ |
| ❌ | 1014 | Feature flag gate working | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified._ |
| ❌ | 1015 | getHardwareCapabilities() correct | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified._ |
| 🟢 | 1016 | Native plugin callable from JS | `DEVICE-VERIFIED` | PR #495, #497 · device: Pixel 10 Pro XL + iPhone · ref: KEK device sessions<br>_Bridge calls carried real args (kekSalt STRING) on device. INTERNAL — real hardware/CI, NOT independently audited._ |
| ❌ | 1017 | Old vaults decrypt without errors | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified._ |
| 🟢 | 1018 | New vaults encrypt/decrypt via plugin | `DEVICE-VERIFIED` | PR #495, #568 · device: Pixel 10 Pro XL + iPhone · ref: KEK device sessions<br>_KEK-wrapped vault unlocked + signed on device. INTERNAL — real hardware/CI, NOT independently audited._ |
| ❌ | 1019 | No regressions in non-KEK path | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified._ |

## Phase 2c — Week 6: Audit prep

| | Line | Item | Status | Evidence |
|---|---|---|---|---|
| 🧑 | 1173 | Audit materials compiled | `BLOCKED-HUMAN` | Human packaging. |
| 🔒 | 1174 | Device test suite runs w/o fatal errors | `BLOCKED-HARDWARE` | WDIO suite needs a device (device tier). |
| 🧑 | 1175 | Presentation deck ready | `BLOCKED-HUMAN` | Human artefact. |
| 🧑 | 1176 | Q&A topics prepared | `BLOCKED-HUMAN` | Human artefact. |

## Phase 2d — Week 7/8: Audit & mainnet gate

| | Line | Item | Status | Evidence |
|---|---|---|---|---|
| 🧑 | 1244 | Audit package delivered | `BLOCKED-HUMAN` | External auditor. |
| 🧑 | 1245 | Kick-off meeting completed | `BLOCKED-HUMAN` | External auditor. |
| 🧑 | 1246 | Initial findings received | `BLOCKED-HUMAN` | External auditor. |
| 🧑 | 1247 | Response plan drafted | `BLOCKED-HUMAN` | External auditor. |
| 🧑 | 1371 | All CRITICAL findings resolved | `BLOCKED-HUMAN` | Depends on audit output. |
| 🧑 | 1372 | All HIGH findings resolved/deferred | `BLOCKED-HUMAN` | Depends on audit output. |
| 🧑 | 1373 | Mainnet sign-off signed by auditor | `BLOCKED-HUMAN` | External auditor signature. |
| ⏳ | 1374 | Feature flag true + merged to main | `BLOCKED-GATE` | M2C_HARDWARE_WRAP_ENABLED=false, M2C_ENABLED=false<br>_Correctly gated OFF pending audit sign-off. This is the audit gate itself, not a failure._ |
| 🧑 | 1375 | Feature-Status.md updated | `BLOCKED-HUMAN` | Human doc + verified status. |
| 🧑 | 1376 | Release tagged + communicated | `BLOCKED-HUMAN` | Release action. |

## Success criteria (hard gates)

| | Line | Item | Status | Evidence |
|---|---|---|---|---|
| ⛓️✅ | 1420 | iOS Face ID → Sepolia send → txid | `ONCHAIN-VERIFIED` | txid `0x0b13d55384…` LIVE-confirmed SUCCESS, block 11179002 · PR #495 · device: iPhone 17 Pro Max · ref: _ios_hardware_kek_device_verification<br>_Send is real & SUCCESS; the Face-ID→THIS-send linkage is architectural (fail-closed KEK path), not an observed SE-unlock trace bound to this specific txid. INTERNAL — real hardware/CI, NOT independently audited._ |
| ⛓️✅ | 1421 | Android fingerprint → Sepolia send → txid | `ONCHAIN-VERIFIED` | txid `0xecd68494e8…` LIVE-confirmed SUCCESS, block 11206686 · PR #568 · device: Pixel 10 Pro XL · ref: _android_hardware_kek_c1_v3_device_verification<br>_INTERNAL — real hardware/CI, NOT independently audited._ |
| 🟢 | 1422 | Biometric re-enroll confirmed both platforms | `DEVICE-VERIFIED` | PR #516, #518 · device: Pixel 10 Pro XL + iPhone 8 Plus · ref: Android _hardware_kek_biometric_reenroll_invalidation; iOS CLAUDE.md 2026-07-08<br>_Android PASS (516/518); iOS CLOSED 2026-07-08 (Touch ID, fail-closed). INTERNAL — real hardware/CI, NOT independently audited._ |
| 🔒 | 1423 | All error paths tested | `BLOCKED-HARDWARE` | Device error paths. |
| 🔒 | 1424 | Latency baselines recorded | `BLOCKED-HARDWARE` | Device measurement. |
| ❌ | 1425 | Security invariants I1–I6 validated | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Unit/contract coverage only (vitest) — NOT device-verified. Full validation is device + audit._ |
| 🧑 | 1426 | Auditor sign-off obtained | `BLOCKED-HUMAN` | External auditor. |
| ❌ | 1427 | Zero regressions, backward compat | `AUTOMATED-FAIL` | `npm test` → exit 1 (524.3s)<br>_Full suite green = no unit regressions; device backward-compat still device-only._ |
| ⏳ | 1428 | HARDWARE_KEK_NATIVE_ENABLED true on main | `BLOCKED-GATE` | M2C_HARDWARE_WRAP_ENABLED=false, M2C_ENABLED=false<br>_Correctly gated OFF pending audit sign-off. This is the audit gate itself, not a failure._ |
| 🧑 | 1429 | Docs updated, reports signed | `BLOCKED-HUMAN` | Human doc + sign-off. |

## Repo-wide automated gates (not in plan, run for evidence)

| | Line | Item | Status | Evidence |
|---|---|---|---|---|
| ✅ | — | RNG usage check (crypto.getRandomValues only) | `AUTOMATED-PASS` | `npm run check:rng` → exit 0 (0.3s) |
| ✅ | — | Deniability-string leak check | `AUTOMATED-PASS` | `npm run check:deniability-strings` → exit 0 (0.3s) |
| ✅ | — | LOG-1 log-redaction patch check | `AUTOMATED-PASS` | `npm run check:log-redaction` → exit 0 (0.2s) |
| ✅ | — | Finding-ID consistency check | `AUTOMATED-PASS` | `npm run check:finding-ids` → exit 0 (0.2s) |
| ✅ | — | Release-hygiene check | `AUTOMATED-PASS` | `npm run check:release-hygiene` → exit 0 (0.2s) |
| ✅ | — | wallet-core typecheck | `AUTOMATED-PASS` | `npm run typecheck:core` → exit 0 (0.4s) |
| ✅ | — | full typecheck (tsc checkJs) | `AUTOMATED-PASS` | `npm run typecheck` → exit 0 (0.6s) |
| ✅ | — | eslint | `AUTOMATED-PASS` | `npm run lint` → exit 0 (3.7s) |
| ✅ | — | web release build | `AUTOMATED-PASS` | `npm run build:release` → exit 0 (60.8s) |

## Failure logs

### enrollHardwareCredential() succeeds (line 396)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### isHardwareEnrolled() true after enroll (line 397)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### getHardwareFactor() returns base64 H (line 398)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### clearHardwareCredential() deletes items (line 399)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### Repeat enroll/clear 3x, no stale items (line 400)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### Invariants I1–I6 confirmed (line 584)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### enrollHardwareCredential() succeeds (line 729)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### isHardwareEnrolled() true after enroll (line 730)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### getHardwareFactor() returns base64 H (line 731)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### clearHardwareCredential() deletes key (line 732)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### Repeat enroll/clear 3x, no stale keys (line 733)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### Invariants I1–I6 confirmed (line 926)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### Old vault still unlocks on mobile (line 1008)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### New vault unlocks correctly (line 1009)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### Feature flag toggles unlock path (line 1010)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### Graceful degradation → password path (line 1011)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### Feature flag gate working (line 1014)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### getHardwareCapabilities() correct (line 1015)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### Old vaults decrypt without errors (line 1017)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### No regressions in non-KEK path (line 1019)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### Security invariants I1–I6 validated (line 1425)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

### Zero regressions, backward compat (line 1427)

```
 FAIL  src/wallet-core/coldkey/__tests__/coldkey.test.js [ src/wallet-core/coldkey/__tests__/coldkey.test.js ]
 FAIL  src/wallet-core/evm/__tests__/approvals.test.js [ src/wallet-core/evm/__tests__/approvals.test.js ]
 FAIL  src/wallet-core/evm/__tests__/hw-send.test.js [ src/wallet-core/evm/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/sol/__tests__/hw-send.test.js [ src/wallet-core/sol/__tests__/hw-send.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js [ src/wallet-core/keystore/__tests__/kek.salt-binding-tamper.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js [ src/wallet-core/keystore/__tests__/kek.v2-to-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js [ src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js [ src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js [ src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js ]
 FAIL  src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js [ src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js ]
Error: JSONError { path: "/Users/aljobson/Downloads/veyrnox-secure/package.json", message: "key must be a string at line 25 column 1", line: 25, column: 1 }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/62]⎯
```

## Cross-session corroboration (all local sessions reviewed 2026-07-15)

A pass over every local Veyrnox session checked (a) whether any `BLOCKED` item could be
honestly ticked from session history, and (b) whether the ledger ticks are corroborated.
Sessions are INTERNAL self-reports — they corroborate, they do not promote status.

**Corroborated (already ticked):**
- Face ID prompts on every unlock / `reuseDuration=0` (line 455) — session *"iOS KEK device session"* (2026-07-07): "Face ID prompts on EVERY unlock (no grace-period reuse from `reuseDuration=0`)".
- StrongBox tier detected (line 734) — same session: "tier=STRONGBOX (securityLevel=2)".
- Biometric re-enroll invalidation (458 / 1422) — sessions *"H-2 Biometric invalidation"* (2026-07-02) and *"iPhone 8 jailbreak"* (iPhone 8 Plus used for H-2/iOS-F11); later sessions recap "both platforms closed".

**No session evidence found → correctly still `BLOCKED` (not an oversight):**
- 5-cycle soak test (461 / 810), device-test-suite run (1174), iOS unlock-latency baseline (460 / 585 / 1424). Searches returned no matching sessions.

**Caution recorded:** PR #918 (session *"Hardware Protection biometric login issue"*) is
`fix(panic-wipe): …residue gaps` — NOT the biometric re-enroll fix. It must not be cited as
evidence for 458/1422. The iOS re-enroll half rests on the CLAUDE.md 2026-07-08 device
session (no PR artifact for the iOS half) — the thinnest link in the "both platforms" gate.

