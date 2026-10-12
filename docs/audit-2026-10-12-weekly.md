# Internal Security Audit — 2026-10-12
## Scope: RASP · WalletConnect · Hardware KEK · Auth Gates (Weekly)

> **Internal static-analysis pass.** Conducted by internal Claude specialist agents.
> Static code review only — no dynamic testing, no on-device verification.
> An independent third-party audit remains RECOMMENDED (see CLAUDE.md §Hard rules).

Conducted: 2026-10-12
Method: Static code analysis via parallel specialist agents (4 agents × 4 surfaces)
Branch audited: `origin/main` @ `4b98715a533a8250c926e32cdff84c6a2930dd6e` (isolated worktree)
Status: **Findings only — nothing fixed. Do not mark anything verified without on-chain txid or on-device evidence.**

Baseline: `docs/audit-2026-10-05-weekly.md` (@ `87e868b6`).

### Deviations from the runbook
- Subagent types used: `Penetration Tester` (A, C), `Blockchain Security Auditor` (B), `Application Security Engineer` (D). All resolved.
- Agents did not run tests (worktree has no `node_modules`) or any PoC. Agent A did not re-read all of `src/rasp/` or every Kotlin/Obj-C plugin line; Agent C did not re-read all of `native.js`/`web.js`/`kekProfiles.js`; Agent D did not re-read `attestation.js`. Items marked "not re-derived" are carried by unchanged-file history, not re-verified line by line.

---

## Changes since last audit (2026-10-05 @ `87e868b6` → 2026-10-12 @ `4b98715a`)

**Low-delta week.** `git log --since=2026-10-05` over the RASP, sign-gate, wallet-core, WalletConnect, auth, and native plugin paths shows only `ios/App/AppUITests/AppUITests.swift` (#2862, test file). No file on any of the four audited surfaces changed. Other merges were UI/status work:

| Commit | Surface | Summary |
|---|---|---|
| #2850, #2851 | Auth/I3 | Review-prompt triggers and native gate. Agent D checked: all entry points return early on `isDeniabilityOrDemoActive()`; keys listed in `panic.js:502-504`. No I3 regression. |
| #2867 | I3 | Upsell slot mutual exclusion; in-memory only, no residue. |
| #2858, #2859, #2860, #2862, #2863 | UI | Dashboard/Receive/Send/Settings restyle. No new fetch/invoke/telemetry calls found. |
| #2861, #2865 | Deps | Advisory clears and minor bumps. Not audited here. |
| #2847, #2844, #2843 | UI | Portfolio price basis. Not security-relevant to these surfaces. |

---

## CRITICAL
None.

## HIGH

| ID | Area | Location | Finding | Fix |
|---|---|---|---|---|
| H-1 (carried) | WalletConnect | `src/wallet-core/evm/typed-data.js:12-16,34,56-67,121-137`; `src/lib/wcTypedLevel.js:119-127`; `WalletConnectProvider.jsx:470-549`; `RequestApprovalModal.jsx:209` | Typed-data classifier is a name allowlist (spender/operator/delegate). Unrecognised shapes score `LEVEL.OK` and sign. | Deny-by-shape: treat typed data as non-OK unless it matches a small non-asset allowlist, or flag any struct with an address field plus a uint amount. |
| N-B1 (extends H-1, new in 10-05 tracking) | WalletConnect | same | CoW `GPv2 Order`, `UsdSend`/`Withdraw {destination, amount}`, EIP-3009 `Transfer/ReceiveWithAuthorization`, Safe `SafeTx` have no spender/operator/delegate field → all score OK. A chain-bound domain does not help. | As H-1. |
| H-2 (carried, not re-derived) | RASP | `attestation.js` | Attestation fires on every dashboard mount. | Per 10-05 report. |
| H-3 (carried) | Auth | `kekProfiles.js:86-116`; `native.js:789-795`; `web.js:538-540` | `usedFallback = !stamped && i > 0` is false when the current profile matches, so an unstamped current-profile vault never gets stamped. Correct PIN = 1 KDF; wrong PIN = 3 (96+192+64 MiB). Timing differential; the equalizer in `WalletProvider.jsx:1825` cannot cover it. Not benchmarked. | Stamp on any successful unwrap with no stamp; or always spend the full profile set on success. |
| H-4 (carried, not re-derived) | RASP | `attestation.js:244-246,184-187` | Decoy resolves WARN where a clean primary is ALLOW (tier tell). | Owner decision. |

## MEDIUM

| ID | Area | Location | Finding | Fix |
|---|---|---|---|---|
| N-C2 (NEW) | KEK | `native.js:625-660,1322-1345`; `AndroidBiometricCachePlugin.kt:546-575`; `fastpathUnlock.js:62-63` | Silent fast-path stores the RAW DEK under a 30 s device-wide `BIOMETRIC_STRONG` window with no `CryptoObject`, bypassing H, C and the KEK. `isFastpathEnabled()` is `value !== OFF`, i.e. **default-on**, contradicting the plugin comment ("opt-in OFF"). Gated by disclosure card, duress-configured, RASP ALLOW, not-passkey. | `CryptoObject` with timeout 0, or wrap the DEK under H; correct comments/docs to "default-on". Owner decision whether this was accepted. |
| M-1 (carried) | RASP | `compose.js:64-75`; `presign.js:44-53`; `sensitiveGate.js:37` | `'sign'` in `blockedActions` is read only by `TokenApprovals.jsx`. | Enforce at chokepoints or drop from lattice. |
| M-2 (carried) | WalletConnect | `src/risk/calldata.js:26-37,51-58` | Approval classifier misses `allow(address,bool)`, `approveDelegation`, `authorizeOperator`, `approveAndCall`, `increaseApproval`, ERC-1155/6909, Seaport fulfill. (10-05 cited the wrong file path.) | Fail closed on unknown selectors with value 0 and non-empty data. |
| N-B3 (carried) | WalletConnect | `WalletConnectProvider.jsx:786-791,799` | `estimateGas` failure falls back to the 1M cap and broadcasts; fees uncapped if `getFeeData` throws. | Refuse on estimate failure / no fee ceiling. |
| N-B5 (carried, inference) | WalletConnect | `WalletConnectProvider.jsx:414-468` | `personal_sign` content never scored; 32-byte hex (e.g. Safe hash) and SIWE domain mismatch not warned. | Warn/block as described. |
| M-3 (carried, latent) | KEK | `vault.js:676-713`; `native.js:1160-1167` | v3 reseal drops `kekKdf`; `{...blob,...sealed}` keeps stale stamp. Latent while `AAD_V3_MIGRATION_ENABLED=false` (`vault.js:323`). | Carry `kekKdf` through before any flag flip. |
| M-4 (carried) | Auth | `WalletEntry.jsx:1195-1205` | Wrong-PIN count persisted only after `unlock()` rejects; kill during the KDF leaves no increment (longest window for the H-3 cohort). | Persist provisional increment before `unlock()`. |
| M-5 (carried) | Auth | `WalletEntry.jsx:1089` | Any non-throwing unlock (duress/hidden) clears the wipe counter. Design tension. | Owner decision. |
| M-6 (carried) | Auth/I3 | `Settings.jsx:427` vs `:594` | Decoy Settings placeholder gating asymmetric. | Per 10-05. |
| M-7 (carried) | KEK/iOS | `SceneDelegate.swift:67-73` | NSLog of every `URLContext` URL, including rejected ones; WC pairing secrets can reach the log. | Delete the block. |
| Android biometric-cache alias (carried) | KEK | `AndroidBiometricCachePlugin.kt:527-533,100-121,669-683` | Storage alias `requiresAuth=false`; invalidation check treats `UserNotAuthenticatedException` as valid; no cryptographic biometric bind on this legacy slot. RASP block-tier is the only native gate. | Auth-bind the alias. |
| N-A2 / N-A3 (carried) | RASP | `TokenApprovals.jsx`; `SendCrypto.jsx:1535-1545` | Revoke has no tier gate; WARN biometric step-up lives in SendCrypto UI, not the pure gate. A new caller using `presignGate` alone gets only an ack tap. | Shared helper enforcing biometric; gate revoke. |

## LOW

| ID | Area | Location | Finding |
|---|---|---|---|
| N-B6 (NEW) | WalletConnect | `WalletConnectProvider.jsx:~908,925,946,951` | Pending queue filtered by `id` only, not `topic+id`. A second connected dApp can reuse another dApp's JSON-RPC id and evict its pending request (griefing/race; no identity spoof). Fix: key on `${topic}:${id}`. |
| N-B2 (carried) | WalletConnect | `RequestApprovalModal.jsx:89` | `BigInt(value)` unguarded; modal crash on garbage value. Fails closed. |
| N-B4 (carried) | WalletConnect | `RequestApprovalModal.jsx:~270-310`; `session.js:~225` | Flagged dApp is banner-only at sign time; Reown `verifyContext` checked only at session approval. |
| N-C3 (NEW) | KEK | `HardwareKekPlugin.kt:256`; `AndroidBiometricCachePlugin.kt:572,625` | StrongBox fallback catches only `StrongBoxUnavailableException`; some OEMs throw `ProviderException` → enroll fails instead of TEE fallback. Fail-closed. |
| N-C4 (NEW) | KEK | `kek.js:100-112` | `combineKek` uses Web Crypto HKDF; CLAUDE.md says @noble/@scure only. I6 concat/domain correct, buffers zeroed. Policy deviation. |
| N-C5 (NEW) | KEK | `kek.js:151-157` | `unwrapDek` still accepts `WRAP_V1` without AAD. Needs the KEK to forge; retire after migration. |
| L-6 KEK (partially fixed) | KEK | `HardwareKekPlugin.kt:126-138,279-290`; `.m:278-293` | iOS `enroll` now RASP-gated (`.m:118`). Android `enroll` and `clearCredential` (both platforms) still ungated. |
| L-7 (carried) | KEK | `HardwareKekPlugin.m:210,479`; `AndroidBiometricCachePlugin.kt:642` | Plaintext H/DEK write-side residue not zeroed. |
| M-6 KEK (carried, disclosed) | KEK | `.m:473`; `.kt:420` | Base64 string copy of H unzeroable (bridge-architectural). |
| iOS tamper no cert pin (carried, disclosed) | RASP | `RaspIntegrityPlugin.m:495-506` | `detectTamper` only scans dyld for Substrate; re-sign with any valid developer cert undetected. |
| Web fresh artifact never ALLOW (carried) | RASP | `getFreshRaspArtifact.js:92-100` | By construction. |
| N-A1 (carried, unconfirmed) | RASP | `RaspIntegrityPlugin.kt:741` | Package/path probes probably inert on targetSdk 36; header comment overclaims. Behavioural socket probe (`:180,260-261`) is the effective leg. Merged manifest not re-checked. |
| N-D1 (NEW, INFO-level) | Auth | `pinAttemptGuard.js:105-140` | PIN counter is localStorage; session floor monotonic but lost on restart. Disclosed in header; `storageDegraded` surfaced. Fail-open refuted within a session. |
| N-D2 (NEW) | Auth | `credentialVerifier.js:3-4,105-110` | Comment says verifier is "same cost as vault", but `createCredentialVerifier` defaults to current 96 MiB/t6, half the memory-hardness of 192 MiB/t3 legacy vaults. Session-local. Fix comment or pass vault profile. |
| Stale comments | docs | `compose.js:12-18`; `presign.js` headers; `typed-data.js:18-22`; `fastpathDekCache.js` header | "call-site wiring HELD"/"PROVISIONAL" false; typed-data coverage overstated; fast-path alias `.v1` vs live `.v2`. |
| Android tamper-cert / iOS biometric mode | — | — | See INFO. |

---

## Status vs prior audit (2026-10-05)

| Finding | Status |
|---|---|
| H-1 WC typed-data fall-through | STILL PRESENT (+ N-B1) |
| H-2 attestation on dashboard | STILL PRESENT (not re-derived) |
| H-3 profile-walk timing | STILL PRESENT |
| H-4 primary/decoy tier | STILL PRESENT (not re-derived) |
| M-1 `'sign'` unread | STILL PRESENT |
| M-2 approval calldata gaps | STILL PRESENT |
| M-3 v3 reseal drops `kekKdf` | STILL PRESENT (latent) |
| M-4 kill-before-count | STILL PRESENT |
| M-5 duress resets counter | STILL PRESENT |
| M-6 decoy Settings placeholder | STILL PRESENT |
| M-7 iOS QA NSLog | STILL PRESENT |
| L-6 KEK enroll/clearCredential RASP gate | PARTIALLY FIXED (iOS enroll gated; rest present) |
| Carried LOWs | STILL PRESENT |
| C-3 Android `hmacResult` zeroing | FIXED / PASS (`HardwareKekPlugin.kt:418-424`) |
| Android tamper-cert placeholder | FIXED / PASS |
| H-5 refused WC request stays queued | Agent B could not locate at cited lines; not re-verified |
| L-4, L-5 (`kekProfiles.js`) | Not re-read |
| Any REGRESSED | None |

---

## INFO / PASS (read-confirmed, not device-verified)

**RASP**
- 4-value lattice fails closed on both planes: unknown tier → BLOCK, unknown tx level → CONFIRM (`compose.js:61-75`). `proceedAllowed` only on clean ALLOW or acknowledged non-BLOCK (`presign.js:52-53`). Null artifact blocks in `sensitiveGate.js:43`.
- All `presignGate` consumers read `proceedAllowed`/`signerReachable` (`WalletConnectProvider.jsx:1018-1027`, `SendCrypto.jsx:1304-1305`, `sendGate.js:184-185`, `CryptoSigning.jsx:63-64`); `sensitiveGate` callers read `.blocked/.sentence` (its own shape). No `gate.blocked` on a presign gate.
- 1500 ms probe timeouts and errors become unavailable → WARN/BLOCK, never ALLOW. WC and CryptoSigning hard-code `acknowledged=false`.
- Android tamper detection fails closed on blank/unreadable cert, digest failure, exception (`RaspIntegrityPlugin.kt:822-872,1030-1056`); build fails on blank/malformed cert and rejects upload/debug certs as the pin (`build.gradle:370-378,518-527`). Android root detection against a prepared Magisk stack is best-effort (props spoofable, paths hideable); root maps to WARN.

**WalletConnect**
- `presignGateOrReject` runs before key access in all three signing handlers and session approval; failed gate throws.
- Blocked methods (`eth_sign`, `eth_signTransaction`, typed-data v1/v3, add/switch chain); only `eth_sendTransaction`, `personal_sign`, `eth_signTypedData_v4` advertised.
- Chain from the live session, fail-closed; typed-data `domain.chainId` required and matched (domainless Permit rejected); `primaryType` mismatch rejected; address binding on from/params; step-up and session liveness before signing.
- Gas capped at 1M; fee ceilings applied (`fee.js:21-36`); proposal TTL, known-bad dApp recheck, double pairing-URI validation; no relay in decoy/hidden/demo (I3); `telemetryEnabled: false`.

**Hardware KEK**
- Android: StrongBox first, real tier read from `KeyInfo.securityLevel`; `BIOMETRIC_STRONG` only, timeout 0, `CryptoObject`, no DEVICE_CREDENTIAL; `setInvalidatedByBiometricEnrollment(true)`; `KeyPermanentlyInvalidatedException` handled with stable code, exempt from wipe counter; malformed `kekSalt` fails closed.
- iOS: `kSecAttrTokenIDSecureEnclave` + `.biometryCurrentSet`, no software fallback under the SE name, simulator fails honestly; enroll rollback on failed write; `LAContext` invalidated after use.
- `combineKek`: ordered H‖C, HKDF-SHA256, domain `veyrnox/kek/v1/combine(H||C)`, rejects bad lengths/all-zero, zeroes ikm/H/C/bits in `finally`; callers zero H, C, KEK, DEK; wrap v2 uses AAD.
- RASP gating on `getHardwareFactor` (both platforms) and all cache get/put.

**Auth gates**
- `captureVerifierSafe` never throws, returns null on failure; `verifyCredential` fails closed; length cap 1024; constant-time compare, hash zeroed.
- `twoFactorGate.js` pure, fail-closed, no deniability input. `retrieveUnlockSecretDirect` re-verifies KEK wrap in-function; unauth-alias fault wipes cache.
- `copySecret.js`: wipe committed only on confirmed write; retry up to 8; triggers visibilitychange/blur/APP_LOCK/30 s TTL; exhaustion toasts (fails honest).
- `pinAttemptGuard`: `>=` wipe threshold, backoff clamped at 5 min, monotonic session floor.
- I3 review of this week's UI/review-prompt changes: no regression.

---

## Suggested fix order (owner; nothing here was changed)
1. H-3 (+M-4): stamp the profile on any unstamped success; persist a provisional PIN count before `unlock()`.
2. H-1/N-B1: deny-by-shape typed-data classification.
3. N-C2: decide on default-on silent fast-path; `CryptoObject` or H-wrap; fix comments.
4. M-7: delete the `SceneDelegate.swift` NSLog block.
5. N-B3 / M-2: fail closed on gas-estimate failure and unknown approval selectors.
6. M-3 before any `AAD_V3_MIGRATION_ENABLED` flip; L-6 Android `enroll`/`clearCredential` RASP gate.
