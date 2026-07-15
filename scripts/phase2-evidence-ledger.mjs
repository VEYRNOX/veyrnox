/**
 * Phase 2 checklist — EVIDENCE LEDGER.
 *
 * Maps checklist lines (docs/PHASE-2-KICKOFF-PLAN.md) to REAL, already-merged
 * evidence: on-chain txids, merged PRs, and real-device sessions recorded in
 * docs/verified-evidence.json + CLAUDE.md. The runner uses this to override a
 * base BLOCKED status with an evidence-backed one — but ONLY here, where the
 * evidence is concrete and cited.
 *
 * HONESTY RULES baked into this ledger:
 *   - ONCHAIN-VERIFIED items carry a txid + expected block; the runner re-queries
 *     a public node (with --verify-onchain) and DOWNGRADES to ONCHAIN-DOCUMENTED
 *     if the live check does not return status=0x1. A tick is contingent on the
 *     chain, not on this file's say-so.
 *   - DEVICE-VERIFIED / CI-VERIFIED items are INTERNAL — real hardware / real CI,
 *     but NOT independently audited. Every entry says so.
 *   - Deliberately NOT ticked (stay BLOCKED): the independent auditor sign-off
 *     (1244–1247, 1371–1373, 1426), the mainnet gate flag (1374, 1428), and any
 *     item whose evidence is weak/partial (e.g. iOS latency baseline unmeasured,
 *     5-cycle soak not run, "no iCloud sync" never observed as an absence test).
 *     Under-ticking is the safe direction here.
 *
 * The four txids USED in this ledger (iosSendA/B, iosSendOsDaemon, androidV3) were
 * live-re-confirmed SUCCESS on Sepolia via eth_getTransactionReceipt on 2026-07-15
 * during reconciliation. The runner does NOT trust that one-off check: it re-queries
 * the chain itself when invoked with --verify-onchain, and DOWNGRADES any item to
 * ONCHAIN-DOCUMENTED if the live call does not return status=0x1.
 *
 * SEPARATE DOC-CORRECTION (not used by this ledger): the Android v2 send
 * 0xeb71a5d… resolves on-chain at block 11187337, NOT block 11185289 as recorded in
 * docs/verified-evidence.json + CLAUDE.md — txid & SUCCESS are genuine; that block
 * metadata is wrong. Flagged for a docs fix; the v2 txid is not ticked here (v3 is).
 */

const INTERNAL = 'INTERNAL — real hardware/CI, NOT independently audited.';

// Sepolia txids, live-confirmed 2026-07-15 (block = on-chain truth).
export const TXIDS = {
  iosSendA: { txid: '0xf09c036c87ea9db415d11cdfc1426632220f6e8bbf93eca1bf9b5f1d1a926f37', block: 11178961 },
  iosSendB: { txid: '0x0b13d5538421936d7146c0d864dfbcee6e49d2300e18a87ca17028788f85f4f9', block: 11179002 },
  iosSendOsDaemon: { txid: '0x5116e7bc132356b2061791faaf8324d5170f83b66a54c61055d443f51393612c', block: 11185985 },
  androidV3: { txid: '0xecd68494e888af742e5166c93c5354536fb6bbe62e93dc795847079d981727e3', block: 11206686 },
};

const dv = (text, refs) => ({ status: 'DEVICE-VERIFIED', text, ...refs, scope: INTERNAL });
const ci = (text, refs) => ({ status: 'CI-VERIFIED', text, ...refs, scope: INTERNAL });
const onchain = (text, tx, refs) => ({ status: 'ONCHAIN-VERIFIED', text, txid: tx.txid, block: tx.block, ...refs, scope: INTERNAL });

// Keyed by checklist line number (string) in PHASE-2-KICKOFF-PLAN.md.
export const LEDGER = {
  // ---- Phase 2a iOS ----
  '288': ci('Xcode build completes', { device: 'macOS CI (Xcode 26.5)', prs: [705], docRef: '.github/workflows/ios-compile-check.yml', note: 'App target builds clean; F3/F5 zero-deprecation-warning.' }),
  '290': ci('No Swift compilation errors', { device: 'macOS CI (Xcode 26.5)', prs: [705], docRef: '.github/workflows/ios-compile-check.yml', note: 'Same compile as 288.' }),
  '289': dv('App launches on real iPhone', { device: 'iPhone 17 Pro Max', prs: [495], docRef: 'verified-evidence.json:_ios_hardware_kek_device_verification', note: 'App ran + made two KEK-gated Sepolia sends.' }),
  '291': dv('Keychain accessible on device', { device: 'iPhone 17 Pro Max', prs: [495], docRef: '_ios_hardware_kek_device_verification', note: 'SE keychain items created at enroll (real device).' }),
  '455': dv('Face ID prompt renders on getHardwareFactor', { device: 'iPhone (F9 session)', prs: [495], docRef: '_ios_f9_se_unlock_trace_captured', note: 'Literal [VEYRNOX-KEK] "Face ID prompt now" trace captured.' }),
  '456': dv('Approve Face ID → H retrieved', { device: 'iPhone (F9 session)', prs: [495], docRef: '_ios_f9_se_unlock_trace_captured', note: '"SUCCESS — Face ID passed, H recovered (32 bytes)" trace.' }),
  '457': dv('Deny Face ID → error, no H', { device: 'iPhone (F3 session)', prs: [495], docRef: 'CLAUDE.md iOS-F3', note: 'Negative check fail-closed on device (I4).' }),
  '458': dv('Biometric re-enroll → old key invalidated', { device: 'iPhone 8 Plus (iOS 16.7.16, Touch ID)', prs: [495], docRef: 'CLAUDE.md H-2/iOS-F11 CLOSED 2026-07-08', note: 'Re-enroll → SE key invalidated → "Incorrect PIN" fail-closed. (verified-evidence.json still reads "outstanding" here — that META entry is stale; flagged.)' }),
  '473': dv('App built + running on iPhone', { device: 'iPhone 17 Pro Max', prs: [495], docRef: '_ios_hardware_kek_device_verification' }),
  '474': dv('Face ID enrolled + working', { device: 'iPhone (F9 session)', prs: [495], docRef: '_ios_f9_se_unlock_trace_captured' }),
  '582': onchain('Testnet send succeeds (on-chain txid, SUCCESS)', TXIDS.iosSendA, { device: 'iPhone 17 Pro Max', prs: [495], docRef: '_ios_hardware_kek_device_verification' }),

  // ---- Phase 2b Android ----
  // 629/633: re-cited to the device session — the APK demonstrably compiled because
  // it installed and RAN on the Pixel (which backs 630/631). Stronger + honest than
  // citing android-e2e-tests.yml (that workflow only lints/typechecks; it does NOT
  // build the APK — the assembleDebug step lives in android-e2e-emulator.yml, whose
  // green state we have not confirmed here).
  '629': dv('gradlew assembleDebug succeeds', { device: 'Pixel 10 Pro XL (Android 16/API 36)', prs: [497, 499], docRef: '_android_hardware_kek_device_verification', note: 'APK demonstrably built — installed & ran on device.' }),
  '633': dv('HardwareKekPlugin.kt compiles', { device: 'Pixel 10 Pro XL', prs: [497, 499], docRef: '_android_hardware_kek_device_verification', note: 'Plugin ran on device (StrongBox enroll/unlock), so it compiled.' }),
  '630': dv('APK installs to real Pixel', { device: 'Pixel 10 Pro XL (Android 16/API 36)', prs: [497, 499], docRef: '_android_hardware_kek_device_verification' }),
  '631': dv('App launches without crash', { device: 'Pixel 10 Pro XL', prs: [497, 499], docRef: '_android_hardware_kek_device_verification' }),
  '632': dv('No fatal logcat errors', { device: 'Pixel 10 Pro XL', prs: [497, 499], docRef: '_android_hardware_kek_device_verification' }),
  '734': dv('StrongBox availability detected', { device: 'Pixel 10 Pro XL', prs: [527], docRef: 'CLAUDE.md H-1 tier surfacing', note: 'Logged tier=STRONGBOX (securityLevel=2).' }),
  '803': dv('BiometricPrompt renders on unlock', { device: 'Pixel 10 Pro XL', prs: [497, 499], docRef: '_android_hardware_kek_device_verification', note: 'BiometricService StrengthRequested:15 (BIOMETRIC_STRONG).' }),
  '804': dv('Approve fingerprint → H, vault unlocks', { device: 'Pixel 10 Pro XL', prs: [497, 499], docRef: '_android_hardware_kek_device_verification', note: 'Unlock required the StrongBox factor H before signing.' }),
  '806': dv('Re-enroll → KeyPermanentlyInvalidatedException', { device: 'Pixel 10 Pro XL', prs: [516, 518], docRef: '_hardware_kek_biometric_reenroll_invalidation', note: '✅ PASS — OS invalidated key, app refused insecure unlock (I4).' }),
  '807': dv('Auto-clear detected, JS notified', { device: 'Pixel 10 Pro XL', prs: [516, 518], docRef: '_hardware_kek_biometric_reenroll_invalidation', note: 'Part of the re-enroll invalidation flow.' }),
  // 809 (Latency median ≤ 3s) deliberately NOT ticked: the only number on file is a
  // KDF-only 603 ms (PR #604); full fingerprint-unlock latency was never measured, and
  // the iOS F9 trace shows ~2.8 s for the biometric round-trip alone. Ticking a ≤3s
  // threshold that was not measured would be over-ticking — leave it BLOCKED-HARDWARE.
  '924': onchain('Testnet send succeeds (on-chain txid, SUCCESS)', TXIDS.androidV3, { device: 'Pixel 10 Pro XL', prs: [568], docRef: '_android_hardware_kek_c1_v3_device_verification' }),
  '927': dv('Keystore tier documented', { device: 'Pixel 10 Pro XL', prs: [527], docRef: 'CLAUDE.md H-1', note: 'tierBadge.js surfaces real tier (StrongBox/TEE) from getVaultKekTier().' }),
  '928': dv('Latency baseline recorded', { device: 'Pixel 10 Pro XL', prs: [604], docRef: 'CLAUDE.md KDF perf', note: 'KDF-ONLY baseline: 192 MiB warm median 603 ms (n=5), cold 668 ms (n=3). Full fingerprint-unlock latency not separately measured.' }),

  // ---- Phase 2c integration ----
  '1016': dv('Native plugin callable from JS', { device: 'Pixel 10 Pro XL + iPhone', prs: [495, 497], docRef: 'KEK device sessions', note: 'Bridge calls carried real args (kekSalt STRING) on device.' }),
  '1018': dv('New vaults encrypt/decrypt via plugin', { device: 'Pixel 10 Pro XL + iPhone', prs: [495, 568], docRef: 'KEK device sessions', note: 'KEK-wrapped vault unlocked + signed on device.' }),

  // ---- Success criteria (hard gates) ----
  '1420': onchain('iOS Face ID → Sepolia send → txid on-chain', TXIDS.iosSendB, { device: 'iPhone 17 Pro Max', prs: [495], docRef: '_ios_hardware_kek_device_verification', note: 'Send is real & SUCCESS; the Face-ID→THIS-send linkage is architectural (fail-closed KEK path), not an observed SE-unlock trace bound to this specific txid.' }),
  '1421': onchain('Android fingerprint → Sepolia send → txid on-chain', TXIDS.androidV3, { device: 'Pixel 10 Pro XL', prs: [568], docRef: '_android_hardware_kek_c1_v3_device_verification' }),
  '1422': dv('Biometric re-enroll confirmed BOTH platforms', { device: 'Pixel 10 Pro XL + iPhone 8 Plus', prs: [516, 518], docRef: 'Android _hardware_kek_biometric_reenroll_invalidation; iOS CLAUDE.md 2026-07-08', note: 'Android PASS (516/518); iOS CLOSED 2026-07-08 (Touch ID, fail-closed).' }),
};

// The runner degrades ONCHAIN-VERIFIED → this if a live re-check is not run / fails.
export const ONCHAIN_DOCUMENTED = 'ONCHAIN-DOCUMENTED';
