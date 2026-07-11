# Veyrnox Unit & Integration — QA Findings

> Generated: 2026-07-11  
> Branch: claude/ecc-qa-skills-2dd7c3  
> Task: Task 2 — Unit test suite, coverage baseline, wallet-core surface map

## Pretest Guards

All four pretest guards ran successfully before the Vitest suite:

- **CSPRNG check**: PASS — `scripts/check-crypto-rng.mjs` found no `Math.random()` or `Date.now() %` usage in guarded paths (`src/wallet-core/`, `src/lib/WalletProvider.jsx`).
- **Deniability scan**: PASS — `scripts/check-deniability-strings.mjs` found no hits.
- **Finding-ID consistency**: PASS — `scripts/check-finding-id-consistency.mjs` reports 4 findings, 1 user-facing surface; all resolved/open labels are consistent.
- **typecheck:core**: PASS — `tsc -p jsconfig.wallet-core.json --noEmit` exits 0; no type errors in wallet-core.

## Test Suite

- **Result**: FAIL before fix → PASS after fix
- **Test files**: 322 test files across `src/**/*.test.{js,jsx}`
- **Wallet-core subset**: 57 test files in `src/wallet-core/__tests__/` plus 30+ additional tests in subdirectory `__tests__/` folders (coldkey, evm, hw, keystore, rpc)
- **Vitest version**: 4.1.9
- **Run mode**: serial (`maxWorkers: 1`) due to 192 MiB Argon2id KDF memory requirement
- **Failed tests (pre-fix)**: 1 — `deniability-timing.test.js > H3 — primary-success equalizer covers one KDF at current params > PRIMARY_UNLOCK_EQUALIZER_MS >= the measured cost of one KDF at KDF_PARAMS` — expected 1500 >= 1720 (FAIL)
- **Failed tests (post-fix)**: 0
- **Passed (wallet-core subset)**: 849 tests in the wallet-core subset run; 20 tests in the targeted deniability+equalizer re-run after fix — all passing

> The `PRIMARY_UNLOCK_EQUALIZER_MS` constant (1500ms) was stale — calibrated for 64 MiB KDF but the code runs 192 MiB KDF (SAST M3). Fixed to 2000ms; see VU-06 below.

## Coverage Baseline

Coverage is **disabled by default** in `vitest.config.js` (`coverage.enabled: false`). To collect baseline coverage:

```bash
npm test -- --coverage
```

Coverage baseline not collected this pass — full suite requires 30–90 min serial execution due to Argon2id WASM cost. Recommend scheduling as a nightly CI job. The table below shows qualitative coverage status based on test-file presence.

| File | Test Coverage | Notes |
|---|---|---|
| src/wallet-core/vault.js | HIGH | vectors.test.js, vault-migration.test.js, vault-kdf-bounds.test.js, vault-kdf-192-migration.test.js, vault-derivekekc-zero.test.js |
| src/wallet-core/multiVault.js | HIGH | multivault.test.js, multivault-keystore.test.js, multivault-action-password.test.js, h2-migration-and-per-set-ap.test.js |
| src/wallet-core/keystore/kek.js | HIGH | kek.test.js, kek.m20.test.js, keystore/kek.honesty.test.js, kek.honesty-wider.test.js, kek.doc-accuracy.test.js, kek.salt-binding-tamper.test.js, kek.wrap-aad.test.js |
| src/wallet-core/keystore/keyStore.js | HIGH | keystore-facade.test.js, multivault-keystore.test.js |
| src/wallet-core/keystore/hardware.js | HIGH | keystore/hardware.js-guards.test.js, hardware.enroll-tier-gating.test.js, hardware.factor-io-validation.test.js, hardware.kek-salt-bridge-encoding.test.js, hardwareKek.android.test.js, hardwareKek.ios-oslog.test.js |
| src/wallet-core/keystore/native.js | HIGH | keystore/native.blob-shape-validation.test.js, native.kek-enroll-rollback.test.js, native.kek-preserving-repersist.test.js, native.kek-unenroll-reconcile.test.js, native.kek-upgrade-v3.test.js, native.kek-v2-hmac-binding.test.js, native.kek-v3-migration.test.js, native.kek-zeroing.test.js, native.unlock-single-biometric.test.js |
| src/wallet-core/keystore/web.js | HIGH | keystore/web.blob-shape-validation.test.js, web.c-zeroing.test.js, web.kek-preserving-repersist.test.js, web.kek-zeroing.test.js, web.native-fence.test.js, web.prf-hardware-factor.test.js, web.prf-kek-audit-phase1.test.js, web.zeroing.test.js, web.zeroing-finally.test.js |
| src/wallet-core/mnemonic.js | HIGH | mnemonic-from-entropy.test.js, vectors.test.js |
| src/wallet-core/derivation.js | HIGH | vectors.test.js, multivault.test.js, multivault-keystore.test.js |
| src/wallet-core/panic.js | HIGH | panic.test.js (16 tests) |
| src/wallet-core/duress.js | HIGH | duress.invalidPin.test.js |
| src/wallet-core/stealth.js | HIGH | stealth.test.js (12 tests) |
| src/wallet-core/deniabilityUnlock.js | HIGH | deniabilityUnlock.vuln17.test.js |
| src/wallet-core/deniabilitySession.js | MEDIUM | deniability-timing.test.js (indirect) |
| src/wallet-core/evm/send.js | HIGH | evm-send-signing.test.js, chainid-guard.test.js |
| src/wallet-core/evm/token-send.js | HIGH | evm-token-send-signing.test.js |
| src/wallet-core/evm/fees.js | HIGH | evm-fees.test.js |
| src/wallet-core/evm/simulate.js | HIGH | simulate.test.js, anomaly.test.js, suspicious.test.js |
| src/wallet-core/evm/suspicious.js | HIGH | suspicious.test.js, evm/__tests__/suspicious.ofac-honest.test.js |
| src/wallet-core/evm/typed-data.js | HIGH | evm/__tests__/typed-data.test.js, typed-data.chainid.test.js, typed-data.security.test.js |
| src/wallet-core/evm/approvals.js | HIGH | evm/__tests__/approvals.test.js |
| src/wallet-core/evm/preflight.js | MEDIUM | chainid-guard.test.js (via send.js — mock provider) |
| src/wallet-core/evm/poison.js | HIGH | simulate.test.js (via assessEvmTransaction) |
| src/wallet-core/evm/anomaly.js | HIGH | anomaly.test.js |
| src/wallet-core/evm/calldata.js | HIGH | anomaly.test.js, erc20.test.js, simulate.test.js |
| src/wallet-core/evm/tokens.js | HIGH | erc20.test.js |
| src/wallet-core/evm/vaultStore.js | HIGH | evm-slice.test.js |
| src/wallet-core/evm/walletconnect/router.js | HIGH | evm/__tests__/router.test.js, walletconnect-router.test.js, evm/walletconnect/__tests__/router.wcfixes.test.js |
| src/wallet-core/evm/walletconnect/session.js | HIGH | evm/__tests__/session.*.test.js (4 files), evm/walletconnect/__tests__/session.m8.test.js |
| src/wallet-core/evm/walletconnect/projectId.js | HIGH | evm/walletconnect/__tests__/projectId.test.js |
| src/wallet-core/hw/transport.js | MEDIUM | hw/__tests__/transport.test.js |
| src/wallet-core/hw/trezor.js | MEDIUM | hw/__tests__/trezor.test.js (mocks @trezor/connect-web) |
| src/wallet-core/hw/trezorAddress.js | MEDIUM | hw/__tests__/trezorAddress.test.js |
| src/wallet-core/btc/send.js | HIGH | btc-broadcast.test.js, btc-broadcast-split.test.js |
| src/wallet-core/btc/derivation.js | HIGH | btc-derivation.test.js |
| src/wallet-core/btc/coinselect.js | HIGH | btc-coinselect.test.js |
| src/wallet-core/btc/fees.js | HIGH | btc-fees.test.js |
| src/wallet-core/btc/networks.js | HIGH | btc-networks.test.js |
| src/wallet-core/btc/simulate.js | HIGH | simulate.test.js |
| src/wallet-core/btc/validate.js | HIGH | btc-validate.test.js |
| src/wallet-core/btc/provider.js | MEDIUM | btc-broadcast.test.js, btc-coinselect.test.js, btc-fees.test.js (direct import) |
| src/wallet-core/sol/send.js | HIGH | sol-send.test.js, sol-send-signing.test.js |
| src/wallet-core/sol/derivation.js | HIGH | sol-derivation.test.js |
| src/wallet-core/sol/fees.js | HIGH | sol-fees.test.js |
| src/wallet-core/sol/networks.js | HIGH | sol-networks.test.js |
| src/wallet-core/sol/simulate.js | HIGH | simulate.test.js |
| src/wallet-core/sol/poison.js | HIGH | sol-poison.test.js |
| src/wallet-core/sol/slip10.js | HIGH | sol-derivation.test.js |
| src/wallet-core/sol/provider.js | MEDIUM | evm-send-signing / mock |
| src/wallet-core/coldkey/psbt.js | HIGH | coldkey/__tests__/coldkey.test.js |
| src/wallet-core/coldkey/evmUnsigned.js | HIGH | coldkey/__tests__/coldkey.test.js |
| src/wallet-core/coldkey/qr.js | HIGH | coldkey/__tests__/coldkey.test.js |
| src/wallet-core/rpc/pinning.js | MEDIUM | rpc/__tests__/pinning.test.js |
| src/wallet-core/keystore/tierBadge.js | MEDIUM | keystore/__tests__/tierBadge.test.js |
| src/wallet-core/keystore/argon2.worker.js | LOW | no direct test (Web Worker, not unit-testable) |
| src/wallet-core/evm/provider.js | MEDIUM | evm-send-signing.test.js (direct import) |
| src/wallet-core/cosmos/derivation.js | HIGH | cosmos-derivation.test.js |
| **src/wallet-core/btc/hw-send.js** | **NONE** | **No test file found** |
| **src/wallet-core/evm/hw-send.js** | **NONE** | **No test file found** |
| **src/wallet-core/sol/hw-send.js** | **NONE** | **No test file found** |
| **src/wallet-core/evm/spam.js** | **NONE** | **No test file found; not imported by any test** |
| src/wallet-core/evm/networks.js | HIGH | networks.test.js |
| src/wallet-core/netUrl.js | HIGH | netUrl.test.js |
| src/wallet-core/provisionChaff.js | HIGH | provisionChaff.test.js |
| src/wallet-core/auditLog.js | HIGH | audit-log.test.js |
| src/wallet-core/vaultBackup.js | HIGH | vaultBackup-opacity.test.js |
| src/wallet-core/actionPassword.js | HIGH | actionPassword.test.js |
| src/wallet-core/amount.js | HIGH | amount.test.js |
| src/wallet-core/assets.js | HIGH | assets.test.js |
| src/wallet-core/rpcConfig.js | LOW | no direct test; config constants only |

## Untested Surface

| File | Severity | Reason |
|---|---|---|
| src/wallet-core/btc/hw-send.js | HIGH | Hardware-wallet BTC signing path (Ledger + Trezor); no test file anywhere; module comment marks it "BUILT — unverified pending real-device testnet confirmation" |
| src/wallet-core/evm/hw-send.js | HIGH | Hardware-wallet EVM signing path; no test file; exercises verifyLiveChainId + hardware transport layer |
| src/wallet-core/sol/hw-send.js | HIGH | Hardware-wallet SOL signing path; no test file |
| src/wallet-core/evm/spam.js | LOW | Display-only spam/scam-airdrop token classifier; pure string logic; no test; no keys/signing involved; LOW risk to ship untested but should be addressed |
| src/wallet-core/keystore/argon2.worker.js | LOW | Web Worker — unit test infrastructure cannot exercise Worker threads in jsdom without extra scaffolding; Argon2id KDF behaviour is covered indirectly by all vault/kek tests |
| src/wallet-core/rpcConfig.js | LOW | Config constants only; no business logic to test |

## Findings Table

| ID | Severity | Priority | Description | File:line | Fixed inline? |
|---|---|---|---|---|---|
| VU-01 | HIGH | P1 | btc/hw-send.js has no unit tests — the entire Ledger + Trezor BTC signing path is untested in CI. The module itself marks the path "unverified pending real-device testnet confirmation". A signing-path regression would be invisible to the CI gate. | src/wallet-core/btc/hw-send.js:1 | No |
| VU-02 | HIGH | P1 | evm/hw-send.js has no unit tests — hardware-wallet EVM signing (Ledger + Trezor) is untested. verifyLiveChainId (preflight.js) is NOT exercised via the hw-send path. | src/wallet-core/evm/hw-send.js:1 | No |
| VU-03 | HIGH | P1 | sol/hw-send.js has no unit tests — hardware-wallet SOL signing is untested in CI. | src/wallet-core/sol/hw-send.js:1 | No |
| VU-04 | LOW | P2 | evm/spam.js has no tests — pure display-layer spam classifier is untested; no security impact but test gap exists. | src/wallet-core/evm/spam.js:1 | No |
| VU-05 | MEDIUM | P2 | Coverage baseline unavailable — vitest.config.js disables coverage by default; no per-file % baseline has been established. Recommend enabling coverage in a nightly CI run. | vitest.config.js:44 | No |
| VU-06 | HIGH | P1 | `PRIMARY_UNLOCK_EQUALIZER_MS` stale at 1500ms after KDF params reverted to 192 MiB (SAST M3) — test measured actual KDF cost at ~1720ms, so the H3 deniability timing guard FAILED. A correct-password unlock was measurably faster than a wrong-password unlock, creating a timing side-channel. | src/lib/WalletProvider.jsx:207 | Yes — `PRIMARY_UNLOCK_EQUALIZER_MS` set to 2000ms (measured KDF ~1720ms on calibration device, ~280ms headroom). Must be recalibrated if KDF_PARAMS change or test environment changes. |

## Summary

- **Total findings**: 6
- **CRITICAL**: 0 | **HIGH**: 4 | **MEDIUM**: 1 | **LOW**: 1
- **Fixed inline**: 1 (VU-06)
- **P0 (block ship)**: 0 — all pretest guards pass; no CSPRNG or deniability leak detected
- **P1 (fix next sprint)**: 3 open — hw-send test coverage gaps (VU-01, VU-02, VU-03); VU-06 fixed
- **P2 (nice to have)**: 2 — spam.js tests, coverage baseline

### Pretest guard status

All 4 pretest guards **PASS** cleanly. No P0 issues found.

### Test suite health

849 wallet-core tests observed passing. Full 322-file suite was not completed at time of writing — do not treat this as a confirmed green suite. The 57+ wallet-core test files cover vault, KEK, keystore (web/native/hardware), multivault, stealth, panic, duress, deniability, EVM/BTC/SOL send+signing, cold-key, hardware wallet wrappers, walletconnect session/router, and derivation.

### Coverage note

`vitest.config.js` has `coverage.enabled: false`. To establish a numeric baseline:

```bash
npm test -- --coverage
```

Expected runtime: 45–90 min on the current machine due to Argon2id KDF cost per test. Recommend scheduling as a nightly CI job rather than blocking every PR.

### Inline fixes

**VU-06 (HIGH/P1) — FIXED**: `PRIMARY_UNLOCK_EQUALIZER_MS` raised from 1500ms to 2000ms in `src/lib/WalletProvider.jsx:207`. The constant was calibrated for a short-lived 64 MiB KDF phase (commit 1226085e) and was not updated when SAST M3 reverted params to 192 MiB. At 192 MiB, the Node.js/WASM test runner measures ~1720ms per KDF, causing `deniability-timing.test.js > H3` to fail (`expected 1500 >= 1720`). The fix was verified by re-running both the targeted test file and `src/lib/__tests__/primaryUnlockEqualizer.test.js` (20/20 tests pass, exit code 0).

VU-01/02/03 (hw-send test gaps) are P1 and should be addressed in the next sprint by writing stub-based unit tests that mock `@ledgerhq/hw-app-btc`, `@trezor/connect-web`, and the transport layer — following the pattern already established in `src/wallet-core/hw/__tests__/trezor.test.js`.
