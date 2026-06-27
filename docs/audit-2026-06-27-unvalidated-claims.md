# Internal Security Audit — 2026-06-27
## Scope: Unvalidated audit-doc claims · Deniability stack · PIN gate · ENS flow · Native path

> **Internal static-analysis pass.** Conducted by internal Claude specialist agents
> (secskills:mobile-pentester, secskills:web3-auditor, secskills:pentester) in parallel.
> Static code review only — no dynamic testing, no on-device verification, no independent
> sign-off. An independent third-party audit remains RECOMMENDED (see CLAUDE.md §Hard rules).

Conducted: 2026-06-27  
Method: Static code analysis via parallel specialist agents (3 agents × 3 surfaces)  
Branch audited: `main` (HEAD `54775e4`)  
Trigger: Review of claims in prior audit docs identified as code-only / unvalidated  
Status: **Findings only — nothing fixed. Do not mark anything verified without on-chain txid or on-device evidence.**

---

## HIGH (3 findings)

### H-A — 6-digit PIN as sole at-rest factor on web (H-2, confirmed still open)
**Area:** Vault encryption — web path  
**Files:** `src/wallet-core/vault.js:51-56`, `src/wallet-core/keystore/web.js:17`

Prior audit `docs/Internal-Audit-2026-06.md` explicitly called this a "load-bearing blocker" for mainnet. `ALLOW_MAINNET = true` was set anyway with H-2 unresolved.

`web.js` `isSecureHardwareAvailable()` returns `false` unconditionally. A web user's vault is protected by Argon2id (192 MiB, t=3) over the PIN alone — no hardware factor. With 10^6 candidates (000000–999999), an attacker with the IndexedDB blob can run offline on commodity hardware at ~440 ms/attempt (desktop browser timing from vault.js comments). Exhaustion time: 5 days on one core; 12–16 hours on an 8-worker server. Real-world PIN entropy is lower (birth years, bank PINs, 123456, 111111).

**The WebAuthn PRF spike** (`src/dev/prfSpike.js`) exists as a TARGET mechanism but "has never run on a device" (per `docs/audit-triage/kek-acl-rasp-status-gate-2026-06-22.md:71-80`). The PRF approach is structurally correct when it works, but: (a) it is unverified on any real device, and (b) Safari on iOS does not support WebAuthn PRF as of mid-2026, leaving iOS web users with PIN-only.

**Recommended fix:** Enforce a minimum-entropy passphrase requirement (not a 6-digit PIN) for web mainnet vaults, OR gate web mainnet on successful PRF enrollment, OR label the web path as testnet-only until PRF is device-verified. The native Capacitor path (Android Keystore) is better — but it requires the native app, not the PWA.

---

### H-B — CryptoSigning.jsx ephemeral key warning absent
**Area:** Key material handling — user safety  
**Files:** `src/App.jsx:207`, `src/pages/CryptoSigning.jsx:224`

The CryptoSigning route is behind `<WalletGate>` (correct). However, the page generates and imports **ephemeral keys** that are never persisted to the vault. The only user-visible hint is "Clear this page to discard keys" at line 224, which does not say "these keys will be permanently lost on navigation" or "do not send funds to this address unless you have exported the private key."

A mainnet-live user who generates a wallet here, sends ETH to the displayed address, and then navigates away has irrecoverably lost their funds. The RASP presignGate is correctly wired, but the user-safety disclosure is absent.

**Recommended fix:** Add a persistent, prominent banner: "Keys generated here are temporary and not saved to your wallet. Send funds only after exporting the private key." Consider a "Save to vault" action or removing the page from production navigation.

---

### H-C — ALLOW_MAINNET gate is not atomic (dual-flag split)
**Area:** Network selection  
**Files:** `src/wallet-core/evm/networks.js:191`, `src/pages/SendCrypto.jsx:154`

Two independent mechanisms control mainnet access:
1. `ALLOW_MAINNET` constant in `networks.js` — enforced by `getNetwork()` throw at line 209
2. `VITE_ALLOW_MAINNET` env var read in `SendCrypto.jsx:154` — selects network name string

These can diverge. If the env var is absent but the constant is `true`, SendCrypto selects `sepolia` while `getNetwork('mainnet')` would succeed. If the env var is `true` but the constant is `false`, SendCrypto picks `mainnet` but `getNetwork` throws. The gate is not atomic.

**Recommended fix:** Import `ALLOW_MAINNET` from `networks.js` into `SendCrypto.jsx` and remove the `VITE_ALLOW_MAINNET` read, or remove the constant and read from the env var everywhere.

---

## MEDIUM (5 findings)

### M-A — Primary-unlock timing equalizer is sleep-based, not KDF-based
**Area:** Deniability timing  
**File:** `src/lib/WalletProvider.jsx:169,1306-1308`

`PRIMARY_UNLOCK_EQUALIZER_MS = 2500` is a fixed sleep inserted on primary success to equalize with the 3-KDF deniability path. The constant was recalibrated from 300 ms (1.4 s short on old params) to 2500 ms for 192 MiB Argon2id. Whether 2500 ms holds across the full target device population (including low-end Android) cannot be asserted from code reading. A device where the 3 deniability KDFs take 3.5 s would exhibit a ~1 s distinguisher. The `deniabilityUnlock.js` module header (lines 88-92) explicitly flags "a timing-harness measurement under real noise is an explicit audit item." No harness has been run.

**Honest status: BUILT-UNVALIDATED.** The constant-3-KDF architecture in `deniabilityUnlock.js` is structurally correct; wall-clock equalization requires on-device measurement.

---

### M-B — I3 deniability zero-egress checkmark overstates evidence
**Area:** Deniability invariant  
**Files:** `docs/audit-triage/internal-audit-2026-06-17.md:110`, `src/pages/SendCrypto.jsx:144-147`

The internal audit gives I3 ("deniability mode zero egress") a checkmark. The ENS `isDecoy || isHidden` guard in `resolveENS()` at `SendCrypto.jsx:144-147` is present and correct in code, but the I3 checkmark was written when ENS resolution was being added on the same date as the audit sign-off. No deniability-mode test session (duress unlock → attempt ENS send → confirm no network call) has been performed. The guard is architectural, not observationally verified.

**Honest status: BUILT-UNVALIDATED for ENS blocking in live deniability sessions.**

---

### M-C — Biometric manual test file misleading (change-password + PIN cohort)
**Area:** Biometric unlock  
**Files:** `docs/biometric-keychain-binding.manual-test.md` Test 4, `src/lib/WalletProvider.jsx:1225-1233`

Test 4 says "Lock/relaunch → one-tap Face ID → you reach the dashboard." This is only true for password-cohort users. For PIN-cohort users, `shouldCacheUnlockSecret()` returns `false` (code comment at line 1226 explicitly states "Never re-cache the REAL PIN behind the biometric gate"), so the biometric cache is NOT updated after a password change and one-tap unlock will fail or succeed with a stale credential. An on-device tester following Test 4 with a PIN-cohort wallet will see different behaviour and may incorrectly conclude something is broken. The code is correct by design; the test document is underspecified.

**Recommended fix:** Add a note to Test 4: "For password-cohort users only. PIN-cohort users will find biometric one-tap disabled after a password change (by design — the PIN is not cached behind biometrics)."

---

### M-D — BTC M-2 gate fires only when btcSim data is populated
**Area:** BTC send gate  
**File:** `src/pages/SendCrypto.jsx:668`

`btcRiskBlocked` at line 668 computes: `isBtc && (btcSim.data?.risks || []).some(r => r.level === 'high') && !btcRiskAck`. If `btcSim` is loading or errored, `btcSim.data` is undefined, `risks` is `[]`, and `btcRiskBlocked` is `false`. A UTXO-fetch error silently drops the M-2 pre-sign gate. In practice the `buildAndSignTx` path would still run its own coin-selection (separately fetching UTXOs), so the backend remains correct — but the UI gate is load-state-dependent.

**Honest status: pre-existing design gap, not a new bug. The backend signing path remains correct.**

---

### M-E — SAST M2 (combined KDF count) remains undocumented as resolved
**Area:** Deniability timing  
**Files:** `docs/SAST_FINDINGS.md:187`, `src/wallet-core/deniabilityUnlock.js`

`SAST_FINDINGS.md` M2 (combined KDF-count timing distinguisher) is labeled "not implemented." The `deniabilityUnlock.js` constant-3-KDF architecture (added as part of the H2 multi-seed container work) does address this — every post-primary-miss call now runs exactly 3 KDFs via `constantPanic`/`constantDuress`/`tryRevealHidden`, regardless of which features are configured. The SAST document is a historical snapshot and was accurate at time of writing. However, there is no document recording that M2 was subsequently addressed, creating apparent contradiction with M-A finding above. **Recommended:** Add a "subsequently addressed" note to SAST M2 entry, and separately note that wall-clock equalization is BUILT-UNVALIDATED pending timing harness.

---

## INFO / PASS

| Finding | Status |
|---|---|
| ✅ C-1 panic wipe — complete sweep confirmed | `panic.js` `ALL_RESIDUE_KEYS` covers all deniability keys including legacy aliases; IndexedDB wiped via `store.clear()`, not per-key. `veyrnox-demo` not cleared (not key material; acceptable) |
| ✅ L1 chaff word-count distinguisher — RESOLVED | `stealth.js:313-333` `makeChaff()` now sizes to `FIXED_LEN + 16` (GCM tag), matching real hidden-wallet slots exactly. SAST L1 "not implemented" label was historical |
| ✅ M-3 ENS "Use this address" — correctly implemented | `SendCrypto.jsx:137-172` `ensResolved.address` is never written to `toAddress` automatically; user must click "Use this address" button; no auto-population path exists |
| ✅ C6 private keys in React state — fixed | `CryptoSigning.jsx:60-84` `walletRef`/`mnemonicRef`/`derivedRef` are refs, not state; zeroed on unmount |
| ✅ Biometric clear wiring — all five paths correct | create, import, disable, panic-wipe all call `clearUnlockSecret()`; change-password overwrites with new credential for password-cohort (correct by design) |
| ✅ BTC fee cap — present and load-bearing | `btc/provider.js:114` `MAX_FEE_RATE = 1000` sat/vB enforced via `clampFeeRate()` before every coin-selection call |
| ✅ Derivation paths — all standard | EVM m/44'/60', BTC m/84', SOL SLIP-0010 m/44'/501'/0'/0' (Phantom-compatible); correct for interop |
| ✅ H-NEW-5 Android gap honestly documented | `biometricUnlock.js:85-99` comment accurately states the limitation; no fake protection (I4 preserved) |
| ⚠️ Device-test checklist (`device-test-checklist.md`) — entirely unchecked | Code for every item is present; on-device execution is the gap. Native WebView CSP, vault migration, deniability no-tell, BTC end-to-end all require device. Not a code bug |
| ⚠️ PRF spike — never run on device | `src/dev/prfSpike.js` exists; hardware KEK on web is TARGET until PRF is device-verified |
| ⚠️ Biometric manual test — all checkboxes unchecked | Tests 1–5 in `biometric-keychain-binding.manual-test.md` require a real device; code matches the described design |

---

## Priority remediation order

1. **H-A** — Web mainnet + 6-digit PIN: enforce passphrase entropy OR gate on PRF enrollment OR label web as testnet-only
2. **H-C** — ALLOW_MAINNET split: consolidate to one flag, one source of truth
3. **H-B** — CryptoSigning ephemeral key warning: add persistent banner before navigation
4. **M-E** — Update SAST M2 entry to note subsequent architectural fix + BUILT-UNVALIDATED timing caveat
5. **M-C** — Update biometric manual test Test 4 to note PIN-cohort behaviour
6. **M-A / M-B** — On-device only: timing harness, deniability egress packet capture

---

## On-Device Verification Required

The following controls are BUILT but cannot advance to VERIFIED without a real device:

1. **Deniability timing equalization** — timing harness on lowest-spec target Android, comparing primary-success vs wrong-password vs duress-hit wall-clock times
2. **I3 ENS egress in deniability mode** — duress/decoy session, attempt ENS resolution, confirm no network call via packet capture
3. **Device-test checklist sections 0–5** — native WebView CSP, vault migration, deniability no-tell, BTC validation, biometric flows
4. **Biometric manual test** — Tests 1–5, real device with Face ID / fingerprint enrollment-change test
5. **PRF spike** — WebAuthn PRF on Android Chrome, record outcome

None of these can be marked VERIFIED without a real-device test session and owner-supplied evidence.

---

*This report was produced by static code analysis. Controls marked BUILT-UNVALIDATED, TARGET, or PLANNED require real-device verification and independent audit sign-off before being treated as enforced. Per project policy (CLAUDE.md §I4): "never mock a security control to look real."*
