# Internal Security Audit — 2026-11-16
## Scope: RASP · WalletConnect · Hardware KEK · Auth Gates (Weekly)

> **Internal static-analysis pass.** Conducted by internal Claude specialist agents.
> Static code review only — no dynamic testing, no on-device verification.
> An independent third-party audit remains RECOMMENDED (see CLAUDE.md §Hard rules).

Conducted: 2026-11-16
Method: Static code analysis via parallel specialist agents (4 agents × 4 surfaces)
Branch audited: `origin/main` @ `5cd7de75f643dded69cd0c612894ab02e11a03e8` (isolated worktree, branch `security-audit/2026-11-16`)
Status: **Findings only — nothing fixed. Do not mark anything verified without on-chain txid or on-device evidence.**

Deviations: none. All four `subagent_type` names resolved. Prior report: `docs/audit-2026-11-09-weekly.md` (@ `a09abed2`). No node_modules in the worktree; nothing was executed.

---

## Changes since last audit (a09abed2..5cd7de75)

- **No source change in any audited surface.** `git diff a09abed2..HEAD` over `src/`, `android/app/src`, `ios/App` is empty apart from one `ios/Gemfile.lock` line. All 2026-11-09 file:line cites still hold (WalletConnect cites were re-measured: 1 to 3 lines off in places).
- Only `package.json` and lockfile changed: dependency bumps #2969 (CodeQL action), #2970 (npm-minor-patch group, 24 updates), #2971 (react-i18next 18), #2972 (@capacitor/browser), #2973 (@capacitor/ios 8.6.2 with LOG-1 patch ported). Dependency review belongs to the daily security-diff and weekly dependency audit; not re-assessed here.
- Docs-only commits: #2960 (tracker 11-09), #2968 and #2974 (daily security-diff).
- Because nothing moved, this pass is a re-verification against the live tree. Every prior finding was re-read; none was FIXED and none REGRESSED. Four items were re-graded or sharpened and five NEW items found (all LOW or one MEDIUM re-grade, below).
- Owner decision honoured: WalletConnect contract calls via unregistered routers stay allowed (2026-11-01); not flagged.

## CRITICAL / HIGH / MEDIUM / LOW findings

### CRITICAL
None.

### HIGH

**H-1 (carried N-C2) — Silent biometric fast-path stores the raw DEK under a 30 s device-wide auth window** [Surface C] — STILL PRESENT
- `AndroidBiometricCachePlugin.kt:566` (`setUserAuthenticationParameters(30, AUTH_BIOMETRIC_STRONG)`, no `CryptoObject`), `.kt:382-428` (`getFastpathDek`, checks only RASP block tier at `:387`), `native.js:625-662`, `native.js:1296-1400`.
- Unlock decrypts with the cached DEK without `combineKek`/H/C/PIN, contradicting I6. Enabled/disclosure/duress gates exist only in JS (`native.js:1296-1330`), so any WebView JS can call the plugin. Any strong-biometric event on the device within 30 s, including a lockscreen unlock, satisfies the key.
- Feature is default-on (`src/lib/fastpathUnlock.js:10-21`, "key absent → treated as ON") but the "opt-in OFF" accepted-risk comment at `.kt:320-326` is stale.
- Refutations discarded: Keystore key does require auth, but the window is device-wide; RASP ALLOW is a tamper check only; disclosure card is consent not control; duress blocks only if a duress PIN exists; `UserNotAuthenticatedException` is a miss, irrelevant inside the window.
- Fix: per-use `CryptoObject` with timeout 0, or wrap the DEK under H; enforce enabled/disclosure/duress natively; correct the stale comment.

**H-2 (carried H-1/N-B1) — WalletConnect EIP-712 shape check fails open** [Surface B] — STILL PRESENT
- `typed-data.js:34,62-74,135-168`; `wcTypedLevel.js:108-127` (returns `LEVEL.OK` when nothing flagged); `RequestApprovalModal.jsx` (`approveBlocked`, `isAssetAuth`).
- Only `address` fields named `spender`/`operator`/`delegate` plus the named Permit/Seaport lists count as authorising. `TransferWithAuthorization`/`ReceiveWithAuthorization` (EIP-3009), `Withdraw{destination,amount}`, CoW-style `Order{receiver,sellToken,sellAmount}`, `Delegation{delegatee}` and Safe `SafeTx` wrappers score OK, the one verdict `presignGateOrReject` signs, and the modal leaves Approve enabled with no ack gate.
- Refutations discarded: fields are shown to the user but `validBefore`/`nonce` are opaque, so bearer-style signatures are not informed consent; chain bind (`:518-546`) is dApp-controlled via session chain; address bind is irrelevant (signer is the user); `hasUnlimitedAllowance` scoring runs only after `isAssetAuthorising`.
- Fix: invert the default. Sign only typed data whose `primaryType` is on a vetted benign allowlist; otherwise CAUTION (refused on this surface). Treat address+uint messages with a `value`/`amount` key as authorising.

### MEDIUM

- **M-1 (carried) — SendCrypto never reads `'sign'` in `blockedActions` (I4)** [A]. `degrade.js:226` adds `'sign'` for INTEGRITY_UNAVAILABLE on native; enforced by `sign-gate/presignGateOrReject.js:54`. WC, replacement and CryptoSigning accept only clean ALLOW (ack false), so they are safe. `SendCrypto.jsx:1491-1509` uses only `.tier`/`.requiresBiometric`; WARN biometric is React state `raspWarnBioOk` (`:1272,:1539`); `sendGate.js` never reads `blockedActions`. A muted/unavailable probe reaches WARN, then ack plus biometric lets a send proceed. The "sign is blocked" claim at `degrade.js:34,126-136` is false for the main send path. Caution before fixing: if the iOS attestation leg is still honestly UNAVAILABLE (`attestation.js:55-58`, #2277), enforcing `'sign'` would block every iOS send; check iOS attestation state first (not verified this pass).
- **M-2 (carried) — Native hard-signal latch bypassed by the 1500 ms timeout (I4)** [A]. `nativeProbe.js:81,131-165` applies the latch inside `nativeProbeSource()`; `getFreshRaspArtifact.js:90` wraps it in `withFailClosedTimeout` (`:68-80`), which resolves bare `{available:false}` on stall, skipping the latch. BLOCK falls to INTEGRITY_UNAVAILABLE (WARN). Same shape at `WalletConnectProvider.jsx:373` (safe there, ack false) and in the attestation latch (`attestation.js:216-301`). Comments at `nativeProbe.js:91-92,106` and `getFreshRaspArtifact.js:35-38` claim the stall case is closed. A hooked bridge can stall at will; it can also forge a clean verdict (latch covers muting only). Native `isBlockTier` backstops only key release at unlock, not signing. Fix: apply the latch after the timeout wrapper; mutation-checked test (arm latch, stall source, expect BLOCK).
- **M-3 (carried, widened) — Magisk/Zygisk exposure** [A]. Manifest has no `<queries>`/`QUERY_ALL_PACKAGES`, so on API 30+ `checkSuspiciousPackages` (`RaspIntegrityPlugin.kt:753-768`) always returns false. **New:** `checkXposed` (`.kt:419-436`) uses the same `getPackageInfo` pattern and feeds the BLOCK-tier `detectHook`, so the LSPosed/Xposed package leg is dead too. Still working: `/data/adb` paths (`.kt:214-233`), verified-boot props (`.kt:293-316`; Magisk v30.7 device test recorded at `.kt:285-290`), `/proc/self/maps` scan (`.kt:439-459`). Residual: Shamiko/prop-spoofing setups. ROOTED has no `'sign'` block (`degrade.js:54-68`), apparently by design. Library-merged manifests not checked.
- **M-4 (carried) — Android biometric-cache legacy alias unauthenticated** [C]. `AndroidBiometricCachePlugin.kt:530-531` hardcodes `requiresAuth=false`; `AndroidBiometricCacheConfig.kt:64` `REQUIRES_USER_AUTH_LEGACY=true` is not consumed. Mitigation: `retrieveUnlockSecretDirect` checks `hardwareKekPresent()` natively (`:484-512`), so on a KEK vault C alone opens nothing. Remaining exposure: a non-KEK vault caches the password under an unauthenticated key. Fix: consume the config constant; mutation test.
- **M-5 (carried, refined, latent) — v3 reseal keeps a stale `kekKdf` stamp** [C, D]. `encryptVaultWithDekV3` (`vault.js:676-700`) destructures only `kekWrap`/`kekSalt`/`hardwareKekVersion`; callers write `{...blob, ...sealed}` (`native.js:1160-1167,1678-1685,1779-1788`; `web.js:786-792,933-936`), so the OLD stamp survives rather than being dropped. A rotate on a 192/t3-stamped vault derives C at 96/t6 but retains the old stamp, so the correct PIN fails unwrap, reads as a wrong PIN, and ten tries reach the irreversible wipe (see M-6). Latent: `AAD_V3_MIGRATION_ENABLED=false` (`vault.js:323`). Do not flip the flag before carrying `binding.kekKdf` with a mutation-checked rotate-then-unlock test.
- **M-6 (carried) — PIN-attempt accounting cluster** [C, D]. (a) Profile walk never stamped when profile 0 matches (`kekProfiles.js:89-101`; `native.js:789`, `web.js:538`): correct PIN = 1 KDF, wrong = up to 3; vaults enrolled 2026-08-24 to 09-21 stay unstamped. (b) Counter persisted only after `unlock()` rejects (`WalletEntry.jsx:1200-1206`); with (a), a process kill after about 1.5 KDF of runtime means a miss that is never counted. (c) Argon2id OOM (`RangeError`) and tampered stamp (`kekProfiles.js:55`, "Vault KDF parameters out of range") are uncoded, so they count toward the wipe at 10 (`WalletEntry.jsx:1130-1198`). Fixes: stamp unconditionally on first successful unlock; persist an in-flight increment before `unlock()`; tag errors `KDF_RESOURCE`/`KDF_PARAMS_INVALID` and exempt them.
- **M-7 (carried H-5) — WC refused request stays queued with Approve enabled** [B]. Refusal sites `WalletConnectProvider.jsx:422,440,461,488,509,531,540,582,603,625,639,718` reject then throw; dequeue only on success (`:1131,:1146,:1180`). Trigger: step-up lapses (`STEP_UP_REQUIRED`, `:1124-1160`), user re-authenticates and re-taps; tx broadcasts (`:828`) then `respondToRequest` fails. On-chain tx the dApp believes was refused; bounded because the user tapped Approve. Fix: dequeue in `finally`/on any thrown refusal; idempotent broadcast/respond.
- **M-8 (carried, widened) — WC gas/fee fallback holes (I5)** [B]. `:824` `estimateGas().catch(() => WC_GAS_CAP)` broadcasts at 1M gas; `:767-786` unparseable `maxFeePerGas`/`gasPrice` leaves fees unset so ethers fills from the RPC uncapped; `:794-818` `getFeeData` throw hits an empty catch; `fee.js:42-53`. Ceiling is loose (`MAX_BASE_FEE_GWEI.mainnet` 1000; up to about 1 ETH forced with 1M gas), and with no fee fields the worst-case row is not shown (`fee.js:98`). Fix: refuse when no ceiling is derivable; require explicit `gas` or refuse on estimate failure; tighter WC ceiling.
- **M-9 (carried, now read from source) — `risk/calldata.js` classifier gaps** [B]. `src/risk/calldata.js:18-66,96-131` recognises `approve`, `increaseAllowance`, `setApprovalForAll`, Permit2 `approve`, and fail-closes on multicall and two `permit` selectors. Unrecognised (scored "Not an approval"): Permit2 `permit` `0x2b67b570`/`0x2a2d80d1`, `increaseApproval` `0xd73dd623`, Universal Router `execute` `0x3593564c` (PERMIT2_PERMIT command), Safe `multiSend` `0x8d80ff0a`, smart-account execute wrappers. ERC-721 `approve` is shown as "amount = tokenId"; NFT `transferFrom`/`safeTransferFrom` out of the wallet has no signal. (Note: `src/wallet-core/evm/calldata.js` is a separate display decoder.) Fix: deny-by-default for non-transfer selectors on token-like targets; extend `OPAQUE_APPROVAL_KINDS`.
- **M-10 (carried) — `personal_sign` unscored** [B]. RASP-gated only, `txLevel` defaults to OK (`WalletConnectProvider.jsx:419-478`). SIWE domain/URI/nonce mismatch unwarned. **New detail:** modal renders decoded UTF-8 in a `<pre>` without stripping bidi/control characters (U+202E), so displayed text can differ from visual order. Fix: parse SIWE and compare domain to session URL; strip control chars.
- **M-11 (carried) — iOS `SceneDelegate.swift` NSLog of every URLContext URL** [C]. `SceneDelegate.swift:67-73` still holds `QA-INSTRUMENT-TEMP: remove before commit`; logs URLs including ones the allowlist rejects; `absoluteString` can carry WalletConnect pairing symKeys. Fix: delete lines 67-73.
- **M-12 (RE-GRADED from L-9) — WC request expiry never enforced** [B, inference]. `session.js:121` maps `session_request_expire`; handler (`WalletConnectProvider.jsx:1016-1018`) dequeues by `data.topic`, but the SDK event likely carries only `{ id }` (unverified, no node_modules), so nothing dequeues. No code checks `expiryTimestamp`; `assertSessionLive` checks session expiry only. An expired request can still be approved and broadcast, then `respondToRequest` fails (same shape as M-7). Fix: dequeue by `id`; check `params.request.expiryTimestamp` at the top of each handler.
- **M-13 (carried, design-level) — WARN-tier biometric is a caller-attested boolean** [A]. SendCrypto uses React state `raspWarnBioOk` (`:1272,:1539,:2687`); `TokenApprovals.jsx:202` passes `biometricConfirmed` (`presignGateOrReject.js:76`). Nothing native or per-sign proves it; JS in the WebView (the threat RASP addresses) can set it. Not bound to one signing attempt (reset on field change and "send another", `:1273,:2070`). Fix: require biometric inside the signing function via a short-lived native `CryptoObject` token.

### LOW

- **L-1 (carried) — attestation probed on dashboard mounts** [A]: `useRaspArtifact.js:104` defaults `deferAttestation=false`; `SecurityPosture.jsx:105`, `SecurityDashboard.jsx:107`.
- **L-2 (carried) — decoy WARN vs real ALLOW tell** [A]: `attestation.js:~241`, `getFreshRaspArtifact.js:92-101`.
- **L-3 (carried) — three divergent `presignGateOrReject` implementations** [A, D]: `WalletConnectProvider.jsx:362`, `sign-gate/presignGateOrReject.js:37`, `sign-gate/presignOrReject.js:23`; all read `proceedAllowed` correctly. Signing functions `evm/send.js:65` and `sendRevoke` (`approvals.js:114`) rely on the caller; only `replacement.js:462` gates inside the flow. Consolidate and enforce at the signing function.
- **L-4 (carried) — `enroll`/`clearCredential` not RASP-gated** [C]: Android `HardwareKekPlugin.kt:126-138`, `:279-290`; iOS `clearCredential` `.m:278`. iOS `enroll` is gated (`.m:118`); `getHardwareFactor` gated on both (`.kt:320`, `.m:299`).
- **L-5 (carried) — plaintext H/DEK string residue** [C]: `.m:458-476`, `HardwareKekPlugin.kt:420-423`, `AndroidBiometricCachePlugin.kt:409-411`. Unzeroable base64/String copies across the bridge; disclosed.
- **L-6 (carried) — KEK minor** [C]: StrongBox fallback catches only `StrongBoxUnavailableException` (`HardwareKekPlugin.kt:256`); `combineKek` uses Web Crypto HKDF (`kek.js:245-250`; concat and domain string correct); `unwrapDek` accepts `WRAP_V1` without AAD (`kek.js:342`).
- **L-7 (carried) — leftover verifier-capture KDF may overlap next unlock** [D, unconfirmed on device]: `WalletProvider.jsx:1928`; backoff starts at 3 misses (`pinAttemptGuard.js:45-50`); an OOM then hits the uncoded path (M-6c). Fix: serialize next `unlock()` behind the pending promise.
- **L-8 (carried) — custom-token symbol contract-controlled, no "unverified" cue** [D]: `CustomTokensPanel.jsx:63-79` (short address shown, slight mitigation). Display-only.
- **L-10 (carried) — WC misc** [B]: queue evicts by `id` only (`:953-963`; dApp-chosen ids, cross-session griefing; key by `topic:id`); unguarded `BigInt(reqParams[0].value)` in `RequestApprovalModal.jsx` throws on render (fails closed); flagged-dApp check only at session approval (`session.js:225`).
- **L-11 (carried, honesty) — iOS "SecureEnclave" label** [C]: `HardwareKekPlugin.m:245`; H is random bytes generated in app memory (`.m:204-210`) and ECIES-wrapped by the SE key. Suggest "SE-wrapped factor".
- **L-12 (carried) — tamper / doc residuals**: `credentialVerifier.js:3-5,82-84` says "SAME cost" but verifier is 96 MiB/t=6 vs legacy vault 192 MiB/t=3 (time-cost equal, memory half; doc honesty only); Android compares only `sigs.firstOrNull()` (`RaspIntegrityPlugin.kt:851,1053`); Play Integrity pin mismatch maps to WARN; 1500 ms attestation timeout may push genuine tokens to WARN; iOS `detectTamper` (`.m:508-529`) is a Substrate dyld scan with no cert pin and `earlyDetectTamper` (`.m:586-594`) uses csops `CS_VALID`, which a validly re-signed app passes (both disclosed `.m:499-506`).
- **L-13 (carried) — stale comments / text**: `AndroidBiometricCachePlugin.kt:324`, `fastpathDekCache.js:5,30-33` (cites alias `.v1`, live is `.v2`), `Feature-Status.md:301`; `presign.js:3`, `compose.js:3,15` ("PROVISIONAL/HELD"); `degrade.js:34,126-136`.
- **L-14 (NEW) — phishing-domain banner is tier-gated in the modal** [B]: `RequestApprovalModal.jsx` runs `checkDappDomain` only when `advisorOnline`. Session-approval check (`session.js:225`) is ungated. Matches the documented upsell-gating pattern; listed because persisted sessions are not rechecked (L-10), making the modal the only runtime check.
- **L-15 (NEW, honesty) — "ECC independent audit" wording** [A]: `presign.js:3`, `compose.js:3`, `featureCatalogue.js:314` say "independent". Policy (I4, CLAUDE.md) is that an internal audit is never presented as independent. Reword to "internal".
- **L-16 (NEW, availability, fail-closed, inference) — web fresh artifact is never ALLOW** [A]: `getFreshRaspArtifact.js:92-94` passes `attestationResult=null`; `detectAttestation(null)` returns INTEGRITY_UNAVAILABLE (`attestation.js:185-186`). On web, WC signing and speed-up/cancel are always refused and sends always need the ack box, contradicting `featureCatalogue.js:314` ("Normal browser → CLEAN → ALLOW"). Not a security hole; no test pins it (`getFreshRaspArtifact.test.js:111`). Fix: skip the attestation leg on web or document.
- **L-17 (NEW, inference, unconfirmed on device) — `copySecret` can give up after about 3.5 minutes backgrounded** [D]: `copySecret.js:74,117-130`. `MAX_WIPE_ATTEMPTS=8`; each failed write (no focus) re-arms a 30 s timer; on exhaustion `done=true` and `cleanup()` remove the `focus`/`visibilitychange` listeners, so returning to the app never wipes and the exhaustion toast fires while hidden. Seed phrase can stay on the clipboard. Fix: keep one uncapped foreground one-shot wipe listener, or do not count hidden-state attempts.
- **INFO**: `veyrnox-custom-tokens` plaintext in localStorage, in `METADATA_RESIDUE_KEYS`; web PRF factor uses a fixed eval salt (`web.js:121,249,479`), low confidence; `deriveFastpathKek`/`wrapForFastpath`/`unwrapFromFastpath` dead code with overclaiming header; `WC_TOKEN_NOT_LIVE` matches only the verified registry, so custom ERC-20s are not blocked (owner decision); `handleApproveSession` accepts a proposal with no `verifyContext`, refusing only on `isScam`/`INVALID` (fail-open on absence).

## Status vs prior audit (2026-11-09)

| Prior finding | Status |
|---|---|
| H-1 raw-DEK fast path, 30 s window | STILL PRESENT (HIGH) |
| H-2 typed-data fall-through | STILL PRESENT (HIGH) |
| M-1 SendCrypto ignores `'sign'` | STILL PRESENT |
| M-2 latch bypassed by timeout | STILL PRESENT (attestation latch shares flaw) |
| M-3 Magisk/Zygisk | STILL PRESENT, widened (`checkXposed` package leg dead) |
| M-4 legacy alias | STILL PRESENT (mitigated on KEK vaults) |
| M-5 v3 reseal `kekKdf` | STILL PRESENT (latent, refined: stale stamp kept) |
| M-6 PIN accounting (a, b, c) | STILL PRESENT |
| M-7 refused request stays queued | STILL PRESENT |
| M-8 gas/fee fallbacks | STILL PRESENT (widened) |
| M-9 calldata selector gaps | STILL PRESENT (now confirmed from source) |
| M-10 `personal_sign` unscored | STILL PRESENT (bidi note added) |
| M-11 SceneDelegate NSLog | STILL PRESENT |
| L-1, L-2, L-3, L-4, L-5, L-6, L-7, L-8, L-11, L-12, L-13 | STILL PRESENT |
| L-9 expired WC requests | STILL PRESENT, **re-graded to M-12** |
| L-10 WC eviction / BigInt / persisted-session recheck | STILL PRESENT |
| Android tamper-cert placeholder | PASS (build guard rejects blank; CI secret value not visible) |
| iOS tamper no cert pin | STILL PRESENT (disclosed) |
| WARN-tier biometric gap | STILL PRESENT (design-level, now M-13) |
| M-6 decoy Settings gating (2026-11-02 tracker) | Not re-read; carried |
| REGRESSED | None |
| FIXED | None |
| NEW | L-14, L-15, L-16, L-17 (all LOW); M-13 formalises the WARN-biometric gap |

## INFO / PASS

Read-confirmed, not device-verified.

- **Gate logic:** `presign.js`/`compose.js` fail closed (unknown RASP tier = BLOCK, unknown level = CONFIRM); every chokepoint reads `proceedAllowed`/`rejectCode` (WC personal_sign/typed/send `:420,486,580`, session approval `:1043-1050`, replacement `:462-468`, revoke `TokenApprovals.jsx:202-204`, CryptoSigning `:62-64`, SendCrypto `:1509`). The historic `gate.blocked`/`gate.sentence` bug is absent; remaining hits come from `sensitiveGate()` (`rasp/sensitiveGate.js:36-47`), which legitimately returns those fields. A probe error, timeout or malformed shape never yields ALLOW (worst case BLOCK→WARN, see M-2); canary rejects map to UNAVAILABLE; `isBlockTier` (`.kt:928-939`) fails closed.
- **WalletConnect:** presignGate in all three signing handlers and session approval; v1/v3 and `eth_sign` blocked (`router.js:48-55`); namespace advertises only `eth_sendTransaction`/`personal_sign`/`eth_signTypedData_v4`; typed-data `domain.chainId` required and bound to the live session chain, domainless Permit rejected (`CHAIN_ID_MISMATCH`); topic-to-session binding from `getActiveSessions()`; foreign signer/`from` rejected before key use; gas clamp 1M; `WC_TOKEN_NOT_LIVE` fails closed on absent `assetId`; relay refuses in deniability/demo (I3).
- **KEK:** `combineKek` is ordered H‖C with domain `veyrnox/kek/v1/combine(H||C)`, not XOR, H/C/KEK/DEK zeroed in `finally` (`kek.js:280-283`); `setInvalidatedByBiometricEnrollment(true)` on all Android keys (`HardwareKekPlugin.kt:241`; `AndroidBiometricCachePlugin.kt:561,617`) and `.biometryCurrentSet` on iOS; no DEVICE_CREDENTIAL by design; StrongBox best-effort with honest comments (I4 OK); iOS SE key real (`kSecAttrTokenIDSecureEnclave`, `.m:163-177`; `EnclaveKeyService.swift:116-131`).
- **Auth:** timing equalizer holds across 96/t6 vs 192/t3 (no oracle beyond M-6a); `captureVerifierSafe` OOM fails closed (`credentialVerifier.js:102-108`); PIN counter keys are in the panic-wipe residue list (`panic.js:259-260`), session floor monotonic, backoff clamp 5 minutes, `shouldWipe` uses `>=`; `changePassword` re-caches only when allowed (`WalletProvider.jsx:1707-1716`); `twoFactorGate` pure, fail-closed, I3 parity; `copySecret` wipe commits only on confirmed write.
- **Build:** release cert injected via `-P RELEASE_CERT_SHA256`, blank/malformed rejected (`build.gradle:52,370-378`), CI guard (`ci.yml:1267-1312`).

## Priority order suggested by the agents

1. H-1 (raw-DEK fast path; accepted-risk record is stale).
2. H-2 (typed-data deny-by-shape).
3. M-1 + M-2 together (check iOS attestation state first; apply latch after timeout wrapper).
4. M-6 error codes (OOM / tampered stamp wipe-exempt) with M-5 before any `AAD_V3_MIGRATION_ENABLED` flip.
5. M-7/M-12/M-8 (WC queue and fee ceilings), then M-11 (delete NSLog block, one-block change).
