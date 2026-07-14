# Veyrnox INTERNAL Security Audit

**Scope declaration (I4 honesty).** This is an AI-drafted, code-and-artifact-only INTERNAL audit. It is NOT the independent third-party audit that CLAUDE.md § "Hard rules" still lists as outstanding. Nothing here is device-verified. No on-chain txids were produced. Do not cite this document as "independent."

## Executive summary
- CONFIRMED: 21 (0 CRITICAL / 0 HIGH / 4 MEDIUM / 17 LOW)
- DOWNGRADED: 3
- ALREADY_TRACKED: 13
- REFUTED: 10
- Domains covered:
  - S1a — Seed generation, HD derivation, multi-vault isolation
  - S1b — Per-chain signing & I1 key isolation
  - S2 — Send-flow orchestration
  - S3 — Deniability (I3), duress, panic, stealth
  - S4a — RASP (browser + native)
  - S4b — WalletConnect + pre-sign gate
  - Crypto — Vault, KDF, backup
  - Crypto — KEK stack (WebAuthn PRF / SE / StrongBox)
  - Mobile Native — iOS ObjC + Android Kotlin
  - Auth — PIN cohort, biometric, passkey
  - Honesty (I4) — status tags, mainnet flags, log redaction
  - I3 UX — wallet-count tells, egress in decoy session, copy strings

## Findings — CONFIRMED, most severe first

### S2 — Send-flow orchestration

#### [MEDIUM] S2 — resolveENS deniability guard is missing `isDeniabilitySessionActive()`
- **File:** `src/pages/SendCrypto.jsx:190`
- **Category:** deniability-I3
- **Failure scenario:** In a stealth/panic-triggered deniability session where `isDeniabilitySessionActive()` returns true but the WalletProvider's `isDecoy`/`isHidden` flags have not yet propagated (or are asserted only for a subset of deniable states), typing a `.eth` name into the recipient field and blurring fires `resolveENS`, which calls `getProvider(network)` and issues an on-chain ENS resolver query. All the live-balance queries at lines 381/389/397 and the simulation queries at lines 564/587 explicitly compose the same guard triple (`!isDecoy && !isHidden && !isDeniabilitySessionActive()`), so this call site is an outlier and a potential I3 egress leak from a deniable session.
- **Verifier reason:** `SendCrypto.jsx:196` checks only `isDecoy || isHidden`, while every other network-touching call site in the same file — balance queries at 387/395/403 and simulation at 570/593 — composes the full triple guard `!isDecoy && !isHidden && !isDeniabilitySessionActive()`. `isDeniabilitySessionActive()` is a module-scoped flag in `src/wallet-core/deniabilitySession.js` set independently of the WalletProvider flags, so a stealth/panic-triggered deniable state can have the session flag true while the provider flags are false → typing a `.eth` and blurring fires `resolveEnsName` on the user's own RPC (I3 egress via `getProvider(network)`). The 2026-06-27 audit note flags this guard as "architectural, not observationally verified" but does not track the specific guard-triple inconsistency.

#### [LOW] S2 — TwoFactorGate render branch omits `blockedByRaspBio`
- **File:** `src/pages/SendCrypto.jsx:1768`
- **Category:** correctness
- **Failure scenario:** On native (Capacitor) with `raspNeedsBio=true` (ROOTED / INTEGRITY_UNAVAILABLE), `send2faMethod≠NONE` and no risk verdict, the RASP banner may not require a `riskAck` (owner may be 'tx' with LEVEL.OK), so the biometric affordance at line 1629 (gated on `riskAck && raspNeedsBio && !raspWarnBioOk`) never renders. `TwoFactorGate` renders regardless; on 2FA success `sendTx.mutate()` runs and `mutationFn` throws `RASP_BIO_REQUIRED`. Enforcement is fine (signer fail-closed), but the UI contract diverges from the Confirm-button path.
- **Verifier reason:** `SendCrypto.jsx:1780` gates the `TwoFactorGate` branch on `send2faMethod !== NONE && !blockedByApproval && !blockedByRisk && !blockedByBtcRisk` — `blockedByRaspBio` is omitted. The parallel Confirm-button branch at `:1828` and PinPad at `:1854` both include `blockedByRaspBio` in their disabled expression. The signer chokepoint at `:855-863` fail-closes with `RASP_BIO_REQUIRED`, so security is preserved, but on native RASP-WARN + 2FA-configured + tx-owner state, the user completes 2FA and only then hits the throw — the affordance at `:1641` is gated on `riskAck` and won't render when tx owns copy.

#### [LOW] S2 — whitelist compare uses `.toLowerCase()` uniformly (semantically wrong for base58 BTC/SOL)
- **File:** `src/pages/SendCrypto.jsx:474`
- **Category:** correctness
- **Failure scenario:** A whitelist entry stored with a base58 SOL address `'AbCd…'` and a user paste of `'aBcD…'` (both valid base58 but different keys) would be treated as identical by this predicate, suppressing the 'not on whitelist' warning against a recipient that is genuinely not the whitelisted one. Collision odds on real 32-byte keys are cryptographically negligible, but the invariant that a whitelist entry maps to exactly one address is broken.
- **Verifier reason:** Both sides at `:478-480` are unconditionally `.toLowerCase()`d with no per-currency branch (`isSelfSend` at `:475` does normalize per-currency via `lib/selfSend.js`, but the whitelist compare does not). Effect is warning-suppression only (line 1358 is a non-blocking caution), and Continue is not gated on whitelist status. Fix: reuse `normalizeAddressForCurrency` (or the `isSelfSend` helper's per-currency compare) instead of raw `toLowerCase`.

### S1b — Per-chain signing & I1 key isolation

#### [LOW] S1b — BTC HW send prefers untrusted indexer's echoed txid over local `tx.id`
- **File:** `src/wallet-core/btc/hw-send.js:188`
- **Category:** correctness
- **Failure scenario:** `btc/send.js` explicitly recomputes txid locally from signed bytes and does not depend on the indexer's echo (comment "we don't depend on trusting the untrusted indexer's echoed value"). `btc/hw-send.js` Ledger and Trezor branches instead do `const txid = await broadcastTx(networkKey, signedHex)` and only fall back to the local id when the indexer returns falsy. A malicious/misbehaving indexer could echo a wrong txid that the UI would display and the explorer URL would point to, delaying detection of the real send. Not a fund-loss vector but an I5 (backend untrusted) inconsistency with the primary path.
- **Verifier reason:** Snippet matches main at `hw-send.js:188` (Ledger) and the Trezor branch below uses the same pattern. In contrast, `btc/send.js:92` and `:188-193` explicitly compute `btcTxidFromHex(signedTxHex)` locally — a deliberate I5 invariant that `hw-send.js`'s `txid || tx.id` (indexer echo preferred over local `tx.id`) violates. Not fund-loss (signed bytes are canonical), just a display/detection lag. M-2 in CLAUDE.md is about hw-send zero test coverage, not this specific inconsistency.

#### [LOW] S1b — SOL HW send lacks pre-sign "device controls fromAddress" guard
- **File:** `src/wallet-core/sol/hw-send.js:85`
- **Category:** correctness
- **Failure scenario:** `sol/send.js` verifies `keypair.publicKey.toBase58() !== fromAddress` before signing (throws 'Provided key does not control the from address'). `btc/send.js` does the equivalent `p2wpkh(pubKey).address` check. `sol/hw-send.js` takes `fromAddress` as-is, calls `signFn` on the message with no assertion that the device's public key at `SOL_PATH` matches. A mis-configured/mismatched device would only fail at broadcast (`tx.serialize`'s implicit signature check), not with a legible early error.
- **Verifier reason:** `sol/hw-send.js:85-102` takes `fromAddress` and calls `signFn(msgBytes)` with no `derivedPubkey.toBase58() === fromAddress` check. Ledger (line 155) and Trezor wrappers sign via `SOL_PATH` without cross-verifying against `fromAddress`. A mismatched device fails at `tx.serialize()`'s implicit `verifySignatures` with opaque "Signature verification failed" rather than a legible `HW_SIGNER_MISMATCH`. Fail-closed still holds via serialize's signature check; only DiD/legibility is missing.

#### [LOW] S1b — EVM HW paths lack pre-sign device `getAddress` verification against `fromAddress`
- **File:** `src/wallet-core/evm/hw-send.js:24`
- **Category:** correctness
- **Failure scenario:** If the caller supplies a `fromAddress` that differs from the device's address at `44'/60'/0'/0/0` (multi-account device, or a user who paired a different device than the one that produced `fromAddress`), signing proceeds and only the belt-and-suspenders `serializeCheckedSignedTx` recovered-sender check catches it (throwing `HW_SIGNER_MISMATCH` after signing completed). The user-facing error is 'refusing to broadcast' post-sign; no pre-sign device-address verification prevents a wasted device interaction. Not a fund-loss vector due to `HW_SIGNER_MISMATCH` backstop.
- **Verifier reason:** Snippet matches main at `hw-send.js:32`. No pre-sign device `getAddress` + compare exists (grep confirms only the post-sign recovery check at `:42-51`). The scenario is real: a caller passing a `fromAddress` that doesn't match the device's address will complete a full sign round-trip before `serializeCheckedSignedTx` throws `HW_SIGNER_MISMATCH`. UX/efficiency issue only.

### S4a — RASP (browser + native)

#### [MEDIUM] S4a — iOS `checkFridaPort` treats CFStream open as synchronous
- **File:** `ios/App/App/RaspIntegrityPlugin.m:245`
- **Category:** correctness
- **Failure scenario:** A Frida server is listening on `127.0.0.1:27042` on a jailbroken iPhone. `checkFridaPort` calls `CFStreamCreatePairWithSocketToHost` + `CFReadStreamOpen`/`CFWriteStreamOpen` and immediately closes both without any CFStream schedule/wait or writing a byte. `opened` reflects only that the open call was accepted; it does not confirm any TCP connection to 27042 was established. The probe returns NO (or spuriously YES on some iOS versions), so a real Frida-hooked device escapes the `checkFridaPort` leg entirely, leaving `detectHook` dependent solely on `checkDynamicLibraries` (which misses Frida Gadget in some renamings). Contrasts with Android, whose `Socket().connect(...)` blocks until `connect()` completes.
- **Verifier reason:** Snippet matches main at `RaspIntegrityPlugin.m:245-265`; `detectHook` at `:240` relies on this probe ORed with dyld scan. `CFReadStreamOpen`/`CFWriteStreamOpen` return TRUE at `kCFStreamStatusOpening` — the code never schedules on a runloop, never polls `CFStreamGetStatus` to `kCFStreamStatusOpen`, never checks `CFStreamGetError`, and never writes a byte before closing both streams, so `opened` does not reflect an actual TCP connect. The dyld fallback catches a stock "frida" image marker, but a renamed Frida Gadget escapes both legs. F-09 in CLAUDE.md tracks device-verification of RASP generally, not this specific static probe defect. Fix: use BSD sockets with a bounded non-blocking connect + select, schedule the CFStream on a runloop and wait for `kCFStreamStatusOpen` with a timeout, or drop the port probe and rely on dyld scan honestly.

#### [MEDIUM] S4a — iOS `detectTamper()` duplicates dyld scan; no cert-fingerprint fail-closed
- **File:** `ios/App/App/RaspIntegrityPlugin.m:301`
- **Category:** honesty-I4
- **Failure scenario:** An attacker repacks the IPA with their own developer signing identity and installs via an enterprise profile or free provisioning on a non-jailbroken device. No Substrate/Frida injected; jailbreak checks all false; dyld image list clean. `detectTamper()` falls through the dyld loop and returns NO. The pre-sign compose sees CLEAN → `TIER.ALLOW` → signer reachable with zero friction, despite the app binary being tampered. Android's equivalent path fail-closes (`EXPECTED_CERT_SHA256.isBlank() → return true`).
- **Verifier reason:** Snippet matches main at `:301-322`. The three dyld strings (MobileSubstrate/SubstrateLoader/TweakInject) exactly duplicate `checkDynamicLibraries` at `:208-217` which is already OR'd into `detectHook` at `:242` — so `detectTamper` provides zero independent tamper signal on iOS. The in-code comment at `:296-299` openly admits no cert-fingerprint pinning, but the function still returns NO into the composed RASP score, so a resigned IPA on a non-jailbroken enterprise/free-provisioned device yields `tampered:false` → CLEAN → `TIER.ALLOW`, while the Android analogue fail-closes on blank cert. Real reproducible I4 gap; iOS OS-level codesign already gates the non-JB attack surface.

#### [LOW] S4a — Android `checkSuFromRuntime` is structurally inert on Android 10+ (undisclosed)
- **File:** `android/app/src/main/java/com/veyrnox/app/RaspIntegrityPlugin.kt:203`
- **Category:** honesty-I4
- **Failure scenario:** On any Android 10+ device with default SELinux enforcement, `Runtime.exec` of a shell utility from an `untrusted_app` is denied. `runCatching` swallows the denial; `checkSuFromRuntime` returns false regardless of whether `su` exists in PATH. The claim in the inline comment does not hold in the `untrusted_app` domain on modern Android — the check contributes zero signal, but is presented alongside the operative `checkDangerousProps` as if equivalent.
- **Verifier reason:** Snippet matches main at `:203-211`. The sibling `checkDangerousProps` at `:228` explicitly documents (device-verified 2026-07-13, SM-N981B, Magisk v30.7) that `Runtime.exec("getprop ...")` is blocked by SELinux in the `untrusted_app` domain on Android 10+ and was migrated to reflection-based `readSystemPropReflect`. The same SELinux exec restriction applies to `Runtime.exec(arrayOf("which","su"))`. Unlike `checkDangerousProps` and `checkProcNetUnix` (which carry honest caveats), `checkSuFromRuntime`'s comment at `:198-202` presents it as an operative behavioral probe with no inertness disclosure — an I4 honesty gap. This is one signal among many (`checkProcNetUnix` remains operative via `/proc/net/unix` read), not a full RASP bypass.

### S3 — Deniability (I3), duress, panic, stealth

#### [LOW] S3 — `panic.js` `onblocked` handler's `req.result?.close?.()` is a spec no-op
- **File:** `src/wallet-core/panic.js:545`
- **Category:** correctness
- **Failure scenario:** `veyrnox-appdata` (`localClient.js`) holds a lingering connection at panic time. Delete blocks; the `onblocked` path resolves 'success' to the wipe caller while the DB rows (addresses, tx history, labels) remain readable until the blocking connection closes on its own (e.g. reload). The wipe report/panic UI can report completion while F-06 residue is still queryable via the still-open handle. Behaviour matches the prior no-close version; the PW-05 comment overstates what the code does.
- **Verifier reason:** Per IndexedDB spec, `indexedDB.deleteDatabase()` returns an `IDBOpenDBRequest` whose `result` is `undefined` on all events (including `onblocked`) — the blocking connection lives in a different execution context (`localClient.js`'s module-level handle) and is unreachable from here. So `req.result?.close?.()` is an unconditional no-op, and the PW-05 comment at `panic.js:540-543` overstates behaviour: the block path is functionally identical to `req.onblocked = finish` (line 511 in the sibling `deleteVaultDatabase`). Rows remain readable until `localClient.js` closes its handle. No key material (comment at 515-525 makes this explicit), residue-hygiene only, honest completion is documented.

### Crypto — Vault, KDF, backup

#### [LOW] Crypto — Stale honesty note in `vaultBackup.js` cites 64 MiB Argon2id (current is 192 MiB)
- **File:** `src/wallet-core/vaultBackup.js:25`
- **Category:** honesty-I4
- **Failure scenario:** A user or reviewer reading the export honesty note underestimates offline brute-force cost of the PIN seal. The doc still cites the pre-PR #604 64 MiB floor, so I4 honesty against the shipped construction is drifted.
- **Verifier reason:** `vaultBackup.js:23` still reads "At 64 MiB Argon2id per attempt", but `vault.js:49-52` sets `KDF_PARAMS.memorySize = 196608 KiB` (192 MiB) per PR #604 (2026-07-05), and the backup path uses full-strength `encryptVault`. The honesty note is stale, understating per-attempt cost (~3×). Direction of drift makes the seal look weaker than reality, so it does not overclaim security; still an I4 accuracy drift.

#### [LOW] Crypto — `vaultBackup.js` HONESTY NOTE claims 6-12 digit PINs; actual guard is `/^\d{8,12}$/`
- **File:** `src/wallet-core/vaultBackup.js:213`
- **Category:** honesty-I4
- **Failure scenario:** The stated brute-force floor uses a 6-digit PIN (~20 bits) that the export path will never actually create — regex `/^\d{8,12}$/` throws before 6- or 7-digit input reaches `encryptVault`. Honesty note overstates the risk envelope and misrepresents the accepted format.
- **Verifier reason:** `vaultBackup.js:213` enforces `/^\d{8,12}$/` (rejects 6- and 7-digit PINs), while the HONESTY NOTE at lines 20-25 states the export "accepts 6-12 digits" and quotes a "~20 bits (6-digit, 10^6)" brute-force floor that the code path cannot produce. Fix: rewrite the note to reflect 8-12 digits (~27-40 bits) and drop the 6-digit brute-force framing.

### Crypto — KEK stack (WebAuthn PRF / SE / StrongBox)

#### [LOW] KEK — `native.js enrollKek` lacks explicit `KEK_ALREADY_ENROLLED` guard
- **File:** `src/wallet-core/keystore/native.js:802`
- **Category:** correctness
- **Failure scenario:** Caller invokes `enrollKek` on an already-KEK-enrolled blob. Line 811 calls `decryptVault(blob, password)`; because `blob.iv/ct` were sealed under DEK via `encryptVaultWithDek`, `decryptVault` throws the SAME generic wrong-password error as a real wrong PIN. UI cannot distinguish 'already enrolled' from 'wrong PIN'; caller cannot branch on a stable code. If future refactor of `decryptVault` ever accepts kek-dek blobs, the safety collapses silently and a fresh random DEK re-encrypts the seed, orphaning the original wrap.
- **Verifier reason:** `native.js:802-811` confirmed on main: `enrollKek` jumps straight from `parseVaultBlob → decryptVault(blob, password)` with no explicit `blob.kdf === 'kek-dek'` / `KEK_ALREADY_ENROLLED` guard analogous to `web.js`. Defense-in-depth / UX rather than an exploitable bypass.

#### [LOW] KEK — Stale `C-1 (v2)` comment at `native.js:640` contradicts `hfOptsForBlob`
- **File:** `src/wallet-core/keystore/native.js:640`
- **Category:** honesty-I4
- **Failure scenario:** Reviewer reading `saveVaultContents` concludes v2 vaults get per-enrollment salt binding at this call site; misses the C-1 residual that v2 stays fixed-salt until `changePassword`/`upgradeKekToV3` runs. Documentation contradicts `hfOptsForBlob`'s actual behavior in the same file.
- **Verifier reason:** Line 640 comment in `saveVaultContents` still literally reads `// C-1 (v2): bind H to this vault's kekSalt (v2) or fall back to the fixed salt (v1).` — stale vs `hfOptsForBlob` at `native.js:285-292` which explicitly documents v2 falls back to fixed salt and only v3 is salt-bound. Note the finder mis-cited the companion at line 319: that was already updated to `C-1 (v3)`. Only the `saveVaultContents` copy is stale. Pure documentation-honesty gap in a security-critical file; no runtime effect.

### Mobile Native — iOS ObjC + Android Kotlin

#### [MEDIUM] Mobile Native — iOS `storeKeychainItem` discards `SecItemAdd` OSStatus; silent enroll success on failed ciphertext write
- **File:** `ios/App/App/HardwareKekPlugin.m:346`
- **Category:** correctness
- **Failure scenario:** In `enroll()`: `SecKeyCreateRandomKey` succeeds (SE key persisted in enclave, line 143), then `[self storeKeychainItem:KEY_ENC_H data:encH]` (line 190) internally calls `SecItemAdd` whose OSStatus is thrown away. If the ciphertext write fails (keychain quota, ACL conflict, corruption), enroll still resolves `{keyTier:'SecureEnclave'}` at line 193. The vault layer proceeds to wrap the DEK under the KEK. On next unlock `getHardwareFactor` loads `encH` (line 248), finds it nil, and rejects `NOT_ENROLLED` — locking the user out of a KEK-wrapped vault. Violates the fail-honest contract that the pre-clear block (lines 102-115) explicitly enforces on the mirror path.
- **Verifier reason:** `HardwareKekPlugin.m:337-347` — `storeKeychainItem` discards both `SecItemDelete` and `SecItemAdd` OSStatus and returns void. Enroll calls it at line 190 with no return-value guard, then unconditionally logs "SUCCESS — ciphertext stored" (191) and resolves `{keyTier:'SecureEnclave'}` (193). Low probability, high user impact (KEK-vault lockout), no key-material disclosure.

#### [LOW] Mobile Native — Android `checkSuFromRuntime` uses `Runtime.exec` with no timeout
- **File:** `android/app/src/main/java/com/veyrnox/app/RaspIntegrityPlugin.kt:205`
- **Category:** correctness
- **Failure scenario:** `Runtime.getRuntime().exec(arrayOf("which", "su"))` then `proc.waitFor()` with no timeout. On a hostile/misbehaving rooted device a wrapper `su` or `which` shim that never exits blocks the RASP thread (called from the JS `presignGate` hot path). Effect is availability (send flow stalls) rather than a bypass — but the `checkFridaPort` probe uses an explicit 150 ms `soTimeout` for the same reason, so the invariant is inconsistent within the same file.
- **Verifier reason:** `proc.waitFor()` has no timeout overload; `runCatching` catches throwables but does not interrupt a blocked native call. Availability impact only, not a bypass. Fix: use `proc.waitFor(150, TimeUnit.MILLISECONDS)` and `proc.destroyForcibly()` on timeout.

### I3 UX — wallet-count tells, egress in decoy session, copy strings

#### [MEDIUM] I3 UX — `CryptoNewsFeed` refresh button leaks to `api.rss2json.com` in DEMO mode
- **File:** `src/components/CryptoNewsFeed.jsx:130`
- **Category:** no-egress-I2
- **Failure scenario:** User (or observer) opens a Demo tour: `isDecoy=isHidden=false` so `i3Active=true` and the refresh button renders; auto-fetch is suppressed because `egressAllowed = i3Active && !DEMO` is false; but clicking the refresh icon calls `refetch()` which ignores `enabled`, and `rss2json.com` sees a request from what was supposed to be an offline demo — same class as PR #614 but the DEMO branch is still open. The Retry link at `:169` has the same property.
- **Verifier reason:** `i3Active = !isDecoy && !isHidden` (line 108) is independent of DEMO; `egressAllowed = i3Active && !DEMO` (line 109) correctly gates `useQuery`'s `enabled` (line 117), but the refresh button visibility gate at line 130 uses only `i3Active`, not `egressAllowed`. In a demo tour, the button renders and `refetch()` in react-query v5 bypasses `enabled` — calling `fetchCryptoNews` → `api.rss2json.com`. The inline comment at 127-129 acknowledges the exact `refetch()`-bypasses-enabled hazard but the fix only covers the decoy/hidden branch; DEMO leak remains. Fix: gate button on `egressAllowed`.

#### [LOW] I3 UX — `PersonalBackup.jsx` PIN-restore advertises "At least 12 characters" but enforces `length>0`
- **File:** `src/pages/PersonalBackup.jsx:439`
- **Category:** honesty-I4
- **Failure scenario:** User restores a PIN-sealed backup, sees 'At least 12 characters', types a 5-character password twice: `valid = newPassword.length > 0 && newPassword === newPasswordConfirm` is true, `finalisePinRestore` is called with a 5-char password. On web `validateWebVaultPassword` will throw (safety net), but the user was told 12+ and got a generic 'Failed to save restored wallet' — dishonest UX; on native there is no such rejection and a sub-12 wallet password is silently accepted, contradicting the H-A ≥12 rule the copy implies.
- **Verifier reason:** `handleSetPassword` at `:388-389` only gates on `newPassword.length === 0`, and the `valid` boolean at `:425` is `newPassword.length > 0 && newPassword === newPasswordConfirm`. No length guard is applied before calling `finalisePinRestore(pinDecryptedJson, newPassword)` at `:392`. Copy contradicts enforcement (I4 UX honesty gap).

#### [LOW] I3 UX — `seedQr.js` header comment cites 64 MiB Argon2id (current is 192 MiB)
- **File:** `src/lib/seedQr.js:9`
- **Category:** honesty-I4
- **Failure scenario:** An auditor or future contributor reads the module header to understand the artifact's KDF hardness for the audit-gated seed-backup design and computes attacker cost against 64 MiB when the actual cost is ~3× that. Not a runtime vuln, but the doc line is a factual misstatement of the crypto currently in use.
- **Verifier reason:** Line 8-9 verbatim reads "Argon2id 64 MiB / t=3 -> AES-256-GCM". Per CLAUDE.md and PR #604 (commit `d0522bfb`, 2026-07-05), the shipped `vault.js KDF_PARAMS.memorySize` is 192 MiB, with 64 MiB retained only as `LEGACY_KDF_PARAMS`. The comment therefore misdescribes the currently-shipped construction the module delegates to via `encryptVault`.

## Findings — DOWNGRADED

### S1b — SOL HW send relies on `Transaction.serialize()` implicit signature verify
- **File:** `src/wallet-core/sol/hw-send.js:104`
- **Category:** correctness
- **Severity:** LOW → INFO
- **Verifier reason:** Solana web3.js `Transaction.serialize()` defaults to `{requireAllSignatures:true, verifySignatures:true}`, so a bad sig currently throws before broadcast — the finder acknowledges this ("not currently exploitable"). The concern is a purely hypothetical future refactor (opting out of `verifySignatures`, or switching to `VersionedTransaction`). Severity LOW overstates a speculative defense-in-depth nit with no present-day failure path; INFO is more honest.

### S2 — `isValidAddressForCurrency` permissive default for unknown chain kinds
- **File:** `src/lib/addressValidation.js:63`
- **Category:** input-validation
- **Severity:** LOW → INFO
- **Verifier reason:** The module doc-comment (lines 46-47) explicitly documents the permissive-default as intentional. All currently shipped assets — ETH/USDC/USDT/BNB/MATIC/ARB/OP/AVAX/BTC/SOL — map to a concrete kind via `EVM_CURRENCIES` (line 21) or the BTC/SOL branches (lines 34-38), so no live asset hits the default branch today. Real signing gates (`evm/send.js isAddress`, wallet-core BTC/SOL validators) are still authoritative — this is a UX/anti-typo hint only. The failure is purely hypothetical ("if a future asset is added and forgotten"), which is defensive-coding advice, not a defect.

### S4a — `resolveProbeSource` fail-open helper re-exported but unused
- **File:** `src/rasp/resolveProbeSource.js:35`
- **Category:** correctness
- **Severity:** LOW → INFO
- **Verifier reason:** The barrel re-exports it (`src/rasp/index.js:54`), alongside `selectPresignProbeSource` (`:55`). However, every current production caller uses the safe helper: `useRaspArtifact.js:101`, `SendCrypto.jsx:764`, `RaspSecurity.jsx:87`, `WalletConnectProvider.jsx:296` — no live path exercises the fail-open sibling. The finder's own scenario ("a future non-presign caller might autocomplete the wrong name") is speculative. Real risk is a future-footgun / hygiene concern, not an active vulnerability. Fix suggestion: drop `resolveProbeSource` from the barrel or rename it to `_resolveProbeSourceUnsafe`.

## Already-tracked (folded)

- `src/wallet-core/mnemonic.js:66` — M-1 (extended to BIP-39 seed Uint8Array) — 64-byte BIP-39 seed from `mnemonicToSeed` is never zeroized by call sites; architectural JS-heap key-material lifetime class already tracked as M-1.
- `src/wallet-core/cosmos/derivation.js:49` — M-10 — Non-hardened final BIP-44 index in `cosmosPath` (m/44'/118'/0'/0/{index}): correct per Keplr/Cosmostation but forecloses safe xpub sharing; documented in inline comment and Feature-Status.md.
- `src/wallet-core/btc/hw-send.js:244` — M-2 — Trezor BTC change output derives to hidden BIP-84 change branch (change=1) instead of coinselect-planned change address; Trezor path currently UI-unreachable, fold into hw-send test-coverage gap.
- `src/lib/WalletConnectProvider.jsx:510` — I2-WC-RELAY — Race: `initWalletConnect()` can complete after real→decoy transition, leaving a live WC relay client in a deniability session; TODO note references audit-2026-07-04-internal.md.
- `src/wallet-core/vault.js:285` — M-8 (issue #752) — AES-GCM base vault blob has no AAD binding on `kdf.{memorySize,iterations,parallelism,hashLength}` / `v`; `assertSaneKdfParams` partially mitigates OOM vector; full AAD in independent-audit scope.
- `src/wallet-core/vault.js:313` — M-1 (issue #746) — `decryptVault` returns plaintext as immutable JS String; seed lives unzeroable in JS heap; architectural class already tracked.
- `src/wallet-core/keystore/native.js:707` — M2C flag umbrella (M-3/M-5/M-6) — M2c enclave up-migration in `unlock()` doesn't gate on already-KEK-enrolled vaults; would double-wrap under enclave record if flipped; entire M2c path is compile-time dormant.
- `ios/App/App/HardwareKekPlugin.m:318` — iOS-F5 residual / M-6 (issue #729) — `getHardwareFactor` base64-encodes H into `NSString hB64` that ARC cannot zero; architectural bridge residue.
- `ios/App/App/HardwareKekPlugin.m:168` — iOS-F5 residual family — `enroll` copies fresh H into immutable `NSData hData` before ECIES-encrypting; C-array `hBytes` is memset but the NSData copy is not; same architectural unzeroable-copy class.
- `android/app/src/main/java/com/veyrnox/app/HardwareKekPlugin.kt:360` — iOS-F5 analogue on Android (M-6) — `getHardwareFactor` keeps H (`hmacResult` byte[]) and its base64 (`b64` String) in the JVM heap with no zeroization; bridge-layer copy invariant.
- `src/components/security/HardwareKekSettings.jsx:267` — LOG-1 — KEK-enroll failure path `console.error`s the raw thrown error (including `JSON.stringify(e)`); LOG-1 debug-bridge/logcat leak class already remediated (PR #572) and release-build verified 2026-07-07.
- `src/pages/Dashboard.jsx:161` — UI-audit / live-dashboard spec — Hardcoded fake 24h change (+2.34%, `totalUSD * 0.0234`) shown in real, decoy, and demo sessions; tracked in `docs/UI-audit-findings.md:146` and `docs/superpowers/specs/2026-06-07-live-dashboard-demo-feel-design.md:43`.

## Non-scope disclosure (what an INTERNAL AI audit cannot cover)

- Live-device runtime (biometric hardware, Secure Enclave, StrongBox, real rooted device, real Ledger/Trezor transport)
- Heap dumps, memory forensics, physical clone/replay of hardware authenticators
- Formal cryptographic proofs, cipher-mode analysis under adversarial models, timing side channels at scale
- Full dependency supply-chain provenance
- On-chain transaction integrity end-to-end (no txids produced this pass)
- Third-party dApp round-trip via WalletConnect against real relay
- Release-build (not just debug) log redaction on real devices

## Recommended next step

The outstanding independent third-party audit should cover the CONFIRMED list plus the ALREADY_TRACKED items still open, with priority to:

1. **iOS `checkFridaPort` synchronous-open defect** (`RaspIntegrityPlugin.m:245`, MEDIUM) — Live-device Frida attach on jailbroken iPhone to confirm probe inertness; independently retest under CFStream runloop + timeout or BSD socket rewrite.
2. **iOS `detectTamper()` cert-fingerprint gap** (`RaspIntegrityPlugin.m:301`, MEDIUM) — Real IPA re-sign + enterprise/free-provisioning install on non-jailbroken device to confirm `TIER.ALLOW` reachability; scope cert-pinning parity with Android's fail-closed path.
3. **iOS `storeKeychainItem` OSStatus-swallow** (`HardwareKekPlugin.m:346`, MEDIUM) — Fault-injection on `SecItemAdd` (keychain quota exhaustion / ACL conflict) to confirm the KEK-vault lockout scenario, plus fail-honest audit of every native `SecItem*`/`AndroidKeyStore` return-value across the KEK stack.
4. **`resolveENS` I3 guard-triple inconsistency** (`SendCrypto.jsx:190`, MEDIUM) — Independent I3 egress trace under stealth/panic-triggered deniable sessions to confirm the `isDeniabilitySessionActive()` vs provider-flag propagation window is real, and sweep for other network-touching call sites with the same partial guard.
5. **`CryptoNewsFeed` DEMO-mode `refetch()` egress** (`CryptoNewsFeed.jsx:130`, MEDIUM) — Network-observation pass over the demo tour flow to confirm the manual-refresh leak, plus a codebase-wide sweep for the same `refetch()`-bypasses-`enabled` pattern that PR #614 partially remediated.

Additional priority into the same engagement: the KEK stack umbrella (M-3/M-5/M-6, M2C flag pre-flip review, iOS/Android bridge-residue architectural residues), the vault AAD gap (M-8), and Argon2id KDF cost validation against the 192 MiB shipped construction across all doc/comment call sites.