# Internal Static-Analysis Pass — Deniability Stack, Biometric, RASP
## Veyrnox — 2026-07-05

> ⚠ **I4 HONESTY DISCLAIMER — READ FIRST**
>
> This document records an **INTERNAL STATIC-ANALYSIS PASS** conducted on 2026-07-05
> by the same AI system (Claude Code, Anthropic) that authored the code under review.
> It is **NOT an independent audit**. An independent audit requires third-party human
> security professionals with no prior involvement in the codebase. The only independent
> audit on record is the **ECC audit (2026-06-23)**. This pass does not replace, supersede,
> or substitute for an independent audit. Gate status is UNCHANGED.
>
> "Internal" is never presented as "independent" (CLAUDE.md I4 hard rule).

---

## Scope

| Domain | Files |
|---|---|
| Duress PIN / Decoy Wallet | `src/wallet-core/duress.js`, `src/wallet-core/deniabilitySession.js`, `src/pages/DuressPin.jsx`, `src/lib/WalletProvider.jsx` (unlock routing), `src/lib/decoyBalance.js` |
| Stealth / Hidden Wallets | `src/wallet-core/stealth.js`, `src/lib/hiddenBalance.js`, `src/pages/StealthWallets.jsx` |
| Panic Wipe | `src/wallet-core/panic.js`, `src/pages/PanicWipe.jsx`, `src/components/ui/sidebar.jsx` |
| Audit Log | `src/wallet-core/auditLog.js`, related UI |
| Biometric Unlock | `src/lib/biometric.js`, `src/lib/biometricUnlock.js`, `src/components/security/BiometricUnlockSettings.jsx` |
| RASP / Sign-Gate | `src/rasp/browserProbe.js`, `src/rasp/degrade.js`, `src/rasp/nativeProbe.js`, `src/sign-gate/presign.js`, `src/lib/WalletConnectProvider.jsx` |

**Auditor:** Claude Code (Anthropic) — INTERNAL, not independent
**Method:** Static-analysis + adversarial adversarial verification (37 agents, 342 tool uses)
**Findings:** 24 initial → 22 confirmed/plausible after adversarial verification · 2 false positives

---

## Summary Table

| Domain | Confirmed | HIGH | MEDIUM | LOW | FP |
|---|---|---|---|---|---|
| Duress PIN / Decoy Wallet | 4 | 1 | 1 | 2 | 1 |
| Stealth / Hidden Wallets | 2 | 0 | 0 | 2 | 0 |
| Panic Wipe | 4 | 0 | 2 | 2 | 0 |
| Audit Log | 2 | 0 | 0 | 2 | 0 |
| Biometric Unlock | 6 | 2 | 2 | 2 | 0 |
| RASP / Sign-Gate | 4 | 2 | 2 | 0 | 1 |
| **TOTAL** | **22** | **5** | **7** | **10** | **2** |

---

## Findings — Duress PIN / Decoy Wallet

### D-02 · MEDIUM — Primary-success timing oracle: 1 KDF faster than all other outcomes
**File:** `src/lib/WalletProvider.jsx:199` · `src/wallet-core/deniabilityUnlock.js:72`
**Adversarial verdict:** CONFIRMED

**Description:** A correct primary unlock returns after a single Argon2id KDF. Any other
outcome — wrong password, duress hit, panic hit — involves at least one additional KDF
(chaff or duress vault decryption). The equaliser `PRIMARY_UNLOCK_EQUALIZER_MS = 1500`
constant pads primary success to a fixed minimum, but it pads wall-clock time in JS,
not the CPU-bound KDF itself. A network-side adversary measuring round-trip latency can
still see the equaliser artefact. The codebase marks this as `VULN-17 ACCEPTED RESIDUAL`
at `deniabilityUnlock.js:72`.

**Attack scenario:** A coercer with network monitoring observes unlock attempts across
multiple sessions and uses timing distribution to distinguish primary from duress unlocks
before any device interaction.

**Recommendation:** This is an inherent limitation of JS-layer equalisation; true mitigation
requires native constant-time KDF pipelining. Document the residual risk explicitly in
user-facing security disclosure. Status remains ACCEPTED RESIDUAL — no code change required
but honesty of the residual must be surfaced.

---

### D-04 · HIGH — I3 egress race window: isDecoy React state lags module-scope deniability flag
**File:** `src/lib/WalletProvider.jsx:316–321`
**Adversarial verdict:** PLAUSIBLE

**Description:** `setIsDecoy(v)` and `setIsHidden(v)` set React state synchronously via
`decoyRef.current = v` + `syncDeniabilityMarker()` + `setDeniabilitySession(true)` (lines
317–319). The module-scope boolean in `deniabilitySession.js` is set before any React
re-render, so wallet-core I3 gates (`trezor.js`, `priceFeed.js`) and the WalletConnect
presign gate (C3 RASP) are protected immediately. However, React components that read
`isDecoy`/`isHidden` from `useWallet()` will not see the update until after the next render
cycle. If any component fires a side-effect (RPC call, WC relay ping) synchronously on
the same event that triggers `setIsDecoy`, it can egress before the React guard propagates.

**Attack scenario:** A deniability session transition triggered by a WalletConnect event
fires both `setIsDecoy(true)` and a WC relay subscription renewal in the same event loop
tick. The relay subscription renews before React re-renders the guard, emitting a network
fingerprint from inside what should be a silent deniability session.

**Recommendation:** Audit all components that use `isDecoy`/`isHidden` from `useWallet()`
to ensure no side-effects fire before the ref-backed I3 module-scope flag is set. Prefer
the `isDeniabilitySessionActive()` module check over the React prop for all network-adjacent
code paths.

---

### D-05 · LOW — Biometric pref flag survives `removeDuressPin` — forensic tell
**File:** `src/lib/WalletProvider.jsx:1841–1848`
**Adversarial verdict:** CONFIRMED (intentional per inline comment, but HONEST-DISABLED status not recorded)

**Description:** `removeDuressPin()` calls `clearDuressVault()` + `clearUnlockSecret()` but
does not call `setBiometricUnlockEnabled(false)`. The existing inline comment (lines 1843–1847)
explicitly preserves the biometric unlock preference for the primary wallet. However, the
`decoy-biometric-optin` feature writes the *duress* PIN under the same biometric cache key.
After removing the duress PIN, the biometric pref (`veyrnox-biometric-unlock = "1"`) remains
set even if the only biometric unlock the user ever configured was for the decoy path.

**Attack scenario:** Forensic analysis of a device after duress PIN removal reveals
`veyrnox-biometric-unlock = "1"` in localStorage with no corresponding cached secret.
This confirms a biometric-linked unlock path existed and was deliberately cleared, which
is itself a tell that a duress session was configured.

**Recommendation:** On `removeDuressPin`, check if the primary wallet has *also* opted in to
biometric unlock. If not, clear `veyrnox-biometric-unlock`. Alternatively document this as
ACCEPTED RESIDUAL in `Audit.scope.md`.

---

### D-06 · LOW — `decoyBalance.js` calls live RPC with no I3 guard on itself
**File:** `src/lib/decoyBalance.js:70–77`
**Adversarial verdict:** CONFIRMED

**Description:** `resolveDecoyBalance()` calls `getBalanceEth()` (a live `eth_getBalance` RPC)
with no `isDeniabilitySessionActive()` check of its own. The I3 guard is on callers in
`DuressPin.jsx` (non-DEMO guard at line 464) but not on the exported function itself.
A future caller could invoke it from inside a decoy/hidden session and cause an RPC egress.

**Attack scenario:** A new feature or refactor calls `resolveDecoyBalance()` directly (e.g.
from a WalletConnect handler or price-alert callback) without checking deniability state.
The function makes a live RPC fingerprint from inside a supposedly egress-free decoy session.

**Recommendation:** Add `if (isDeniabilitySessionActive()) throw new Error('I3: no egress in deniability session')` at the top of `resolveDecoyBalance()`, matching the pattern in `priceFeed.js:52`.

---

## Findings — Stealth / Hidden Wallets

### SW-01 · LOW — `moveWalletToHidden` clobber-guard error message confirms hidden wallet existence at slot
**File:** `src/wallet-core/stealth.js:476–479`
**Adversarial verdict:** CONFIRMED

**Description:** When `moveWalletToHidden` is called with a secret that reveals an existing
different hidden wallet at that slot, it throws: `"That recovery phrase is already in use by another hidden wallet at this slot"`. The clobber-guard calls `revealHiddenMnemonic(secret)`,
which succeeds (returns non-null) only when the slot contains genuine AES-GCM ciphertext
decryptable by the secret — chaff slots always return null. The distinguishing error message
thus confirms to any caller (including a UI bug or API misuse) that a real hidden wallet
occupies the slot, not chaff.

**Attack scenario:** A UI bug or compromised renderer calls `moveWalletToHidden` with a
brute-forced or user-supplied secret and reads the error message to map which slots contain
real wallets vs chaff.

**Recommendation:** Replace the slot-confirming error message with a generic one that does
not distinguish chaff-miss from clobber-guard: e.g. `"Could not store hidden wallet — check your recovery phrase and try again"`.

---

### SW-02 · LOW — Sequential multi-chain balance queries allow provider-side correlation of hidden wallet identity
**File:** `src/pages/StealthWallets.jsx:88–90` · `src/lib/hiddenBalance.js`
**Adversarial verdict:** CONFIRMED (description had one inaccuracy — queries are sequential, not parallel)

**Description:** `resolveHiddenBalance` makes a live node read per chain (EVM, BTC, SOL)
sequentially via `await` in a `for...of` loop. Three different RPC providers (Sepolia,
Esplora, Solana) each receive a query for addresses they have not seen before — from the
same user agent / IP — within a short window. Any of the three providers can correlate
the simultaneous address-resolution burst to a single device, linking the hidden wallet's
multi-chain identity without access to the device.

**Attack scenario:** A global passive network adversary or a colluding pair of RPC providers
observes the sequential address queries and links the EVM + BTC + SOL addresses to the same
device, deanonymising the hidden wallet's multi-chain identity.

**Recommendation:** Document this as an inherent limitation of multi-chain balance reads with
the current RPC architecture. Consider routing hidden wallet balance reads through distinct
network paths or using cached/stale balances by default (no network on reveal). Add
disclosure in the hidden wallet UX.

---

## Findings — Panic Wipe

### PW-01 · MEDIUM — In-app guarded wipe requires no prior authentication
**File:** `src/pages/PanicWipe.jsx:148`
**Adversarial verdict:** CONFIRMED

**Description:** The in-app guarded wipe path (`handleInAppWipe`) is gated only by typing
the string `"WIPE"` and ticking a confirmation checkbox. There is no PIN/password re-auth,
no step-up 2FA, and no `useActionGuard` call. The page is only reachable inside the unlocked
vault (`WalletEntry.jsx:913` checks `isUnlocked`), but the unlock condition is already satisfied
— a coercer with physical access to an already-unlocked device can trigger a full wipe by
typing six characters.

**Attack scenario:** A coercer physically obtains a device on which the Veyrnox app is
already unlocked (e.g. a device left running, or forced unlock under duress). They navigate
to Panic Wipe, type `"WIPE"`, tick the checkbox, and permanently wipe all wallet data in
under 10 seconds with no further authentication challenge.

**Recommendation:** Require a PIN/password re-authentication challenge (via `useActionGuard`)
before executing the in-app wipe. The current typing-confirmation is a UX guard against
accidents, not a security gate against coercion.

---

### PW-02 · MEDIUM — `sidebar_state` cookie not cleared on panic wipe
**File:** `src/components/ui/sidebar.jsx:66` · `src/wallet-core/panic.js`
**Adversarial verdict:** CONFIRMED

**Description:** The sidebar component writes a 7-day persistent cookie
(`document.cookie = \`sidebar_state=...; max-age=604800\``) that is not in any of the three
residue key arrays in `panic.js` (`LOCAL_RESIDUE_KEYS`, `DENIABILITY_RESIDUE_KEYS`,
`METADATA_RESIDUE_KEYS`). After a panic wipe, this cookie persists and reveals that a web
application was running in this browser with a sidebar state — correlatable to Veyrnox if
the domain is known.

**Attack scenario:** Forensic analysis of the browser's cookie store after a panic wipe
finds `sidebar_state=true` with a 7-day expiry and a recent write timestamp. This confirms
the application was open recently and had a configured sidebar, which is a tell that
Veyrnox was running.

**Recommendation:** Add a `document.cookie = "sidebar_state=; max-age=0; path=/"` call
inside the panic wipe sequence, or add `sidebar_state` to a cookie-residue array that the
wipe clears.

---

### PW-04 · LOW — Race window: concurrent send and panic wipe can leave in-flight transaction with cleared keys
**File:** `src/wallet-core/panic.js:533` · `src/lib/WalletProvider.jsx:786–802`
**Adversarial verdict:** CONFIRMED

**Description:** `WalletProvider.panicWipe()` calls `panicWipeLocal()` (line 788, which clears
IndexedDB and localStorage synchronously), then `lock()` (line 799), which clears the
in-memory vault. A send operation in progress at the time of the panic wipe will have
already loaded the DEK/seed into memory for signing. The seed/DEK held in the send flow's
closure is not zeroed by `panicWipeLocal()` — only `lock()` zeros the in-memory state, and
`lock()` runs after the wipe. The in-flight send continues to completion using the cached
key material, potentially confirming the transaction on-chain.

**Attack scenario:** User initiates a panic wipe while a large transaction is awaiting
hardware confirmation. The in-flight signing closure completes the transaction using cached
keys after the vault is wiped, violating the user's intent to abort all operations
immediately.

**Recommendation:** Introduce a `panicAbortSignal` that the send flow checks at each
`await` point. Set the signal before `panicWipeLocal()`. This is a known-hard concurrency
problem in JS; document the residual as ACCEPTED RESIDUAL if native abort is not feasible.

---

### PW-05 · LOW — `deleteAppDataDatabase()` resolves on `onblocked` — may leave appdata rows readable until next cold open
**File:** `src/wallet-core/panic.js:459–474` · `src/lib/localClient.js:46`
**Adversarial verdict:** CONFIRMED

**Description:** `deleteAppDataDatabase()` sets `req.onblocked = finish` — the `deleteDatabase`
promise resolves immediately if another connection holds the database open, without waiting
for the deletion to complete. `localClient.js:46` holds a module-level `dbPromise`
(never explicitly closed) that serves as the blocking open handle. A forensic tool with
access to the IndexedDB files can read `veyrnox-appdata` rows until the next cold open
triggers actual deletion.

**Attack scenario:** A panic wipe is performed; the `deleteAppDataDatabase()` call resolves
(reporting success) but the appdata database is not actually deleted because `localClient.js`
holds an open handle. A subsequent forensic extraction reads residual appdata (address
metadata, fee history, recent assets) from the undeleted database.

**Recommendation:** Close the `localClient.js` module-level database handle before calling
`deleteDatabase`, or force a `close()` on all open `IDBDatabase` connections before the
delete request. Alternatively, switch to `onblocked = () => req.result?.close(); finish()`
to break the blocking connection.

---

## Findings — Audit Log

### AL-02 · LOW — Log entry count is an activity oracle via AES-GCM ciphertext length
**File:** `src/wallet-core/auditLog.js:325`
**Adversarial verdict:** CONFIRMED

**Description:** `recordAuditEvent` appends `{ type, ts }` and re-encrypts the entire array
as a single AES-GCM blob with no padding or length normalisation. AES-GCM ciphertext length
= plaintext length + 16 bytes (auth tag). The blob size grows linearly with entry count until
the ring-buffer cap (max 200 entries). Any party with access to the `quaternary` IndexedDB
entry (device forensics, OS backup, etc.) can read the blob length and infer exactly how
many events were logged, even without the encryption key.

**Attack scenario:** Forensic analysis reads the `quaternary` IndexedDB blob, measures its
byte length, and computes the approximate number of audit events, revealing activity
frequency without breaking encryption.

**Recommendation:** Pad the plaintext to a fixed multiple (e.g. nearest 512 bytes) before
encryption. This eliminates the length oracle at the cost of marginally larger storage.
Alternatively document as ACCEPTED RESIDUAL in `Audit.scope.md`.

---

### AL-06 · LOW — Primary-session-only design leaks by absence in deniability sessions
**File:** `src/wallet-core/auditLog.js:145`
**Adversarial verdict:** CONFIRMED

**Description:** `auditSecretForSession` hard-returns `null` for any decoy or hidden session,
so no `quaternary` blob is ever written in those sessions. There is no dummy/replica blob
written to fill the absence. A forensic examiner can trivially distinguish a primary session
(blob present) from a decoy/hidden session (blob absent) by checking for the `quaternary`
IndexedDB key.

**Attack scenario:** A coercer with forensic access checks for the presence of the `quaternary`
key. Its absence after unlock confirms the device is in a decoy or hidden session, coercing
the user to reveal the primary vault.

**Recommendation:** This is an inherent design limitation of the primary-session-only audit
log. Mitigations are: (a) write a dummy zero-length or fixed-size chaff blob under `quaternary`
in deniability sessions, (b) document the limitation honestly in user-facing deniability
disclosure, or (c) extend the audit log to all sessions (with per-session keys). Option (b)
is the minimum required for I4 honesty.

---

## Findings — Biometric Unlock

### BIO-01 · HIGH — Biometric cache not bound to enrollment set — new biometric adds access without PIN
**File:** `src/lib/biometricUnlock.js:84–104`
**Adversarial verdict:** CONFIRMED

**Description:** `nativeStore()` writes the vault password to
`@aparajita/capacitor-secure-storage` with `whenPasscodeSetThisDeviceOnly` — this does NOT
set `setInvalidatedByBiometricEnrollment(true)` on Android or
`kSecAccessControlBiometryCurrentSet` on iOS. A new fingerprint or face added to the device
after biometric unlock was configured will be able to authenticate and retrieve the vault
password from secure storage without requiring the primary PIN.

**Note:** The Hardware KEK path (`native.js` → StrongBox/SE) DOES have
`setInvalidatedByBiometricEnrollment(true)` (fixed in PRs #516/#518, device-verified
2026-07-01). The gap exists specifically in the **biometric unlock cache path** in
`biometricUnlock.js`, not the KEK path.

**Attack scenario:** User Alice adds a biometric-unlock preference. A device thief enrolls
their own fingerprint at the OS level, then opens Veyrnox. The biometric prompt succeeds
with the thief's fingerprint (since `whenPasscodeSetThisDeviceOnly` does not bind to the
enrollment set), and the vault password is retrieved, unlocking the wallet without any PIN.

**Recommendation:** Use a SecureStorage plugin that supports
`setInvalidatedByBiometricEnrollment(true)` on Android and `kSecAccessControlBiometryCurrentSet`
on iOS, or switch to the Hardware KEK path (which already has this binding) as the biometric
unlock mechanism. This requires a native plugin change — mark as TARGET.

---

### BIO-02 · HIGH — App-layer biometric gate bypassable on rooted/jailbroken device via Frida hook
**File:** `src/lib/biometricUnlock.js:18–36`
**Adversarial verdict:** CONFIRMED (and disclosed in the file's own comment block)

**Description:** `nativeAuthenticateOrThrow()` is a JavaScript-layer precondition enforced
by calling `BiometricAuth.authenticate()`. On a rooted (Android) or jailbroken (iOS) device,
this call can be trivially intercepted and spoofed via Frida — the hook returns success
without presenting the OS biometric UI. The vault password is then read from
`capacitor-secure-storage` directly. The file's own comment block (lines 18–36) explicitly
labels this an "APP-LAYER gate (authenticate then read), NOT an OS-enforced biometric ACL".

**Attack scenario:** A rooted device obtained by a thief or coercer runs a Frida script
that returns success for all `BiometricAuth.authenticate()` calls. The vault password is
retrieved from secure storage and the wallet is unlocked without biometric presentation.

**Recommendation:** This is the fundamental limitation of app-layer vs OS-ACL biometric
gating. The mitigation is Hardware KEK Phase 2 (iOS SE + Android StrongBox ACL-bound key),
which requires the key to be present in hardware and enforces biometric at the OS level.
Until M2c/M2d native plugin work is complete, this limitation must be prominently disclosed
in the biometric unlock settings UI (see BIO-03).

---

### BIO-03 · MEDIUM — UI does not expose app-layer-only gate limitation to users
**File:** `src/components/security/BiometricUnlockSettings.jsx:126–128`
**Adversarial verdict:** CONFIRMED

**Description:** `BiometricUnlockSettings.jsx` lines 126–128 contain a JSX comment (not
rendered to users): `"biometric check runs in app code, not as an OS-enforced Keychain ACL;
OS-bound binding is pending M2c/M2d native plugin work"` marked as `"Provisional (audit
status — not shown to users)"`. The comment is accurate but the limitation is intentionally
hidden from the user. A user enabling biometric unlock reasonably expects OS-level
hardware-bound security; the app offers app-layer security only.

**Attack scenario:** A user enables biometric unlock believing it provides the same security
as iOS/Android's hardware-enforced biometric ACL. A rooted device obtains the vault password
without biometric presentation (see BIO-02). The user was never informed of the limitation.

**Recommendation:** Add a visible disclosure to the biometric unlock settings UI:
"Biometric unlock stores your password in secure storage — it is protected at the app level,
not OS-enforced hardware ACL. For hardware-bound biometric security, use Hardware KEK (Phase 2)."
This is I4 requirement — fail honest.

---

### BIO-05 · MEDIUM — `TWOFACTOR_BIOMETRIC_KEY` (`veyrnox-2fa-biometric`) not wiped by panic wipe
**File:** `src/wallet-core/panic.js:159–182` · `src/lib/biometric.js:33`
**Adversarial verdict:** CONFIRMED

**Description:** `DENIABILITY_RESIDUE_KEYS` includes `veyrnox-biometric-unlock` (the biometric
unlock pref tell, line 172) but does NOT include `veyrnox-2fa-biometric` — the
`TWOFACTOR_BIOMETRIC_KEY` exported from `biometric.js:33`. The key is also absent from
`METADATA_RESIDUE_KEYS` and `LOCAL_RESIDUE_KEYS`. After a panic wipe, `veyrnox-2fa-biometric`
remains in localStorage, revealing that the user had configured biometric 2FA.

**Attack scenario:** Forensic analysis after panic wipe finds `veyrnox-2fa-biometric` in
localStorage. This confirms a biometric 2FA preference was configured, revealing security
posture and potentially confirming the existence of a wallet even after wipe.

**Recommendation:** Add `veyrnox-2fa-biometric` (the value of `TWOFACTOR_BIOMETRIC_KEY`) to
`DENIABILITY_RESIDUE_KEYS` or `METADATA_RESIDUE_KEYS` in `panic.js`.

---

### BIO-06 · LOW — Double OS biometric prompt on non-KEK vaults creates UX friction (documented)
**File:** `src/lib/biometricUnlock.js:43–49`
**Adversarial verdict:** CONFIRMED (accepted design trade-off per inline comment)

**Description:** Lines 44–49 explicitly acknowledge that the non-KEK vault unlock presents
the OS biometric sheet twice: once for the cached-password retrieve and once for
`keyStore.unlock()` inside vault-core. This is documented as the accepted cost of OS-enforcing
the cache without touching wallet-core crypto. However, double prompts train users to
repeatedly dismiss biometric UI, which may increase susceptibility to prompt-spoofing attacks.

**Recommendation:** Document this in user-facing UX; consider a single-path solution when
the Hardware KEK plugin is complete (M2c/M2d). No immediate code change required.

---

### BIO-07 · LOW — DEMO path in `retrieveUnlockSecret()` returns cached password without simulated prompt
**File:** `src/lib/biometricUnlock.js:232`
**Adversarial verdict:** CONFIRMED

**Description:** In demo mode, `retrieveUnlockSecret()` returns `demoGet()` immediately
without any simulated prompt. The simulated prompt is only in the caller at
`WalletProvider.jsx:1729–1731` (`if (status.mode === 'demo') { await showSimulatedPrompt(status); }`).
This means `retrieveUnlockSecret()` can be called in demo mode by a path that does not
check `status.mode`, returning the demo password with no UX feedback. Low severity because
demo mode is not production-sensitive.

**Recommendation:** Add the simulated-prompt call inside `retrieveUnlockSecret()` for the
demo path, or add a JSDoc comment explicitly documenting that all callers must show a
simulated prompt before calling this function in demo mode.

---

## Findings — RASP / Sign-Gate

### RASP-A1 · HIGH — RASP probe signals are a static module-load snapshot; sign-time gate uses stale data
**File:** `src/rasp/browserProbe.js:76` · `src/pages/SendCrypto.jsx:591`
**Adversarial verdict:** CONFIRMED

**Description:** `const _signals = sampleSignals()` at `browserProbe.js:76` executes once
at module-load time. The `browserProbeSource` export wraps this frozen object; `signals` is
never re-sampled. At sign time, `SendCrypto.jsx:591` calls
`degrade(detect(browserProbeSource))` — it re-runs `detect()` and `degrade()` on the
stale module-load snapshot, not a live sample. A debugger attached after module-load, or
a Frida hook activated after page initialisation, will not be detected.

**Attack scenario:** An attacker loads the Veyrnox page (no debugger attached), waits for
module initialisation to complete, then attaches Frida/a debugger. The sign-time RASP check
runs against the clean module-load snapshot and returns ALLOW, even though the runtime is
now instrumented.

**Recommendation:** Move `sampleSignals()` inside `browserProbeSource` as a getter
(evaluated at call time) or call `sampleSignals()` directly inside the sign-time path
instead of referencing the cached export. This ensures the probe runs fresh on each signing
attempt.

---

### RASP-A2 · HIGH — RASP crash fallback `raspTier ?? TIER.ALLOW` violates I4 fail-closed
**File:** `src/pages/SendCrypto.jsx:592`
**Adversarial verdict:** CONFIRMED

**Description:** The catch block at `SendCrypto.jsx:591` calls `degrade(undefined)` on
RASP failure. `degrade()` is pure and cannot throw, so `?? TIER.ALLOW` is dead code today.
However the fallback value is semantically wrong: `TIER.ALLOW` means the gate would grant
signing permission if `degrade()` ever throws. The I4 comment on line 589 says "fail closed"
but the fallback is fail-open. A future change to `degrade()` that introduces a throw path
would silently promote all RASP failures to ALLOW.

**Attack scenario:** A future refactor of `degrade.js` introduces a throw path (e.g. for
a new signal type). All RASP errors in `SendCrypto` silently fall through to `TIER.ALLOW`,
allowing signing on any RASP failure without user notification.

**Recommendation:** Replace `raspTier ?? TIER.ALLOW` with `raspTier ?? TIER.BLOCK`. If
`degrade()` ever returns undefined or throws, the gate must fail closed, not open. This
is a one-word fix that brings the code into alignment with the I4 comment on the same line.

---

### RASP-A3 · MEDIUM — `WalletConnectProvider.presignGateOrReject` passes `acknowledged=true` unconditionally
**File:** `src/lib/WalletConnectProvider.jsx:180–183` · `src/sign-gate/presign.js:52–53`
**Adversarial verdict:** CONFIRMED

**Description:** `presignGateOrReject()` calls `presignGate(tier, null, true)` with
`acknowledged=true` unconditionally. In `presign.js:52–53`, the proceed logic is:
`gate.signerReachable && (gate.decision === DECISION.ALLOW || acknowledged === true)`.
With `acknowledged=true`, this short-circuits to true for any `signerReachable` decision,
including WARN and CONFIRM. The RASP-3 fix (2026-07-04) correctly required `acknowledged`
for WARN in the Send UI path, but the WalletConnect path bypasses this entirely.

**Attack scenario:** A WalletConnect dApp triggers a signing request from a device the RASP
tier rates as WARN (e.g. developer mode enabled). The `presignGateOrReject` path proceeds
without presenting the WARN friction to the user, signing the transaction silently.

**Recommendation:** Remove the hardcoded `acknowledged=true` from `presignGateOrReject`.
Pass the device's actual tier through to the WC signing UI and require the same user
acknowledgement friction as the native Send flow. Or, if WC has no UI surface to show the
WARN, always reject on WARN/CONFIRM tier from WC (fail closed).

---

### RASP-A4 · MEDIUM (PLAUSIBLE) — `degrade.js` EMULATOR `permitsTestnet:true` is a dead field with misleading API
**File:** `src/rasp/degrade.js:83`
**Adversarial verdict:** PLAUSIBLE (specific `compose.js` reference in finding was wrong — file does not exist; underlying API confusion is real)

**Description:** `degrade.js:83` returns `permitsTestnet:true` for the EMULATOR tier, but
this field has zero live consumers (grep confirms only `degrade.js` and its test file
reference the symbol). The JSDoc describes it as a routing hint for a future `compose.js`
that does not exist. Any future caller reading `permitsTestnet` from a degrade result may
assume emulator allows testnet, but no enforcement of that assumption exists anywhere.

**Recommendation:** Either implement the enforcement (reject testnet sends on EMULATOR tier)
or remove `permitsTestnet` from the degrade output type and JSDoc to avoid misleading future
callers. A dead API field in a security module is a maintenance hazard.

---

## Accepted Deviations

| ID | Domain | Finding | Rationale |
|---|---|---|---|
| D-01 | Duress PIN | Storage-level deniability is PARTIAL: `secondary` blob visible alongside `primary` in same IndexedDB object store | Design acknowledged in spec; the "secondary" key name is intentionally generic; the primary/secondary pairing is the intended model |
| D-02 | Duress PIN | Primary-success timing oracle (VULN-17) | Marked `ACCEPTED RESIDUAL` in code at `deniabilityUnlock.js:72`; JS-layer equalisation is the best available mitigation without native KDF pipelining |
| AL-01 | Audit Log | Per-device HKDF salt (`vx-9f8e7d6c5b4a3021`) persists in localStorage after panic wipe | Device salt is not correlated to wallet content; its presence only confirms the device ran the app at some point, not that a specific wallet existed |
| BIO-06 | Biometric | Double OS biometric prompt on non-KEK vaults | Documented trade-off in code comment; accepted until Hardware KEK Phase 2 (M2c/M2d) is complete |

---

## False Positives

| ID | Domain | Finding | Why Rejected |
|---|---|---|---|
| D-11 | Duress PIN | Constant-KDF chaff blob not covered by a sync test | Adversarial verify confirmed a parametric test in `src/wallet-core/__tests__/deniability-timing.test.js:109–126` does assert KDF params consistency |
| RASP-A5 | RASP | M-3 `detectTamper` Kotlin fail-closed fix not wired into JS gate pipeline | `RaspIntegrityPlugin.kt` exists at `android/app/src/main/java/com/veyrnox/app/RaspIntegrityPlugin.kt:220–257`; `getOrElse { true }` is confirmed at line 256 |

---

## Positive Controls Confirmed

**Duress PIN / Decoy Wallet**
- `tryDuressUnlock` runs a full Argon2id KDF against the duress vault — no shortcut comparison
- Deniability session state is correctly propagated via module-scope boolean before React re-render for all wallet-core I3 gates
- `clearDuressVault()` removes the `secondary` IndexedDB blob; no plaintext duress PIN is persisted
- VULN-17 timing equaliser (`PRIMARY_UNLOCK_EQUALIZER_MS = 1500`) is in place and test-covered at `src/lib/__tests__/deniabilityUnlock.timing.test.js`

**Stealth / Hidden Wallets**
- 256-slot chaff pool is fully populated at first use; all slots contain indistinguishable AES-GCM ciphertext (identical IV and ciphertext length distribution for chaff vs real)
- `revealHiddenMnemonic` is timing-equivalent on chaff vs real slots (both attempt AES-GCM decrypt; chaff fail-decrypt returns null)
- Cross-session contamination: hidden wallet writes are isolated to their own IndexedDB entry; no shared mutable state with primary wallet

**Panic Wipe**
- `DENIABILITY_RESIDUE_KEYS` covers all known deniability tells including `veyrnox-biometric-unlock` (pref), `sdw_session_token` (added in 2026-07-04 audit), `veyrnox-decoy-biometric` (decoy bio pref)
- `inspectKeyMaterial()` returns a diagnostic report rather than silently claiming success
- Wipe marker itself (`panic_wipe_complete`) has a non-obvious key name; it is wiped on the next unlock attempt (self-clearing)

**Audit Log**
- AES-GCM with a fresh random 12-byte IV per encryption call — no nonce reuse risk
- `auditSecretForSession` returns null for decoy/hidden sessions — audit log never leaks primary session activity into deniability sessions
- Opt-in pref is off by default (matches `priceFeed.js` and `biometric.js` pattern)

**Biometric Unlock**
- `getBiometricStatus()` correctly returns `simulated: true` in demo mode, preventing false hardware capability claims
- Biometric unlock is HONEST-DISABLED on web (no native plugin) — the UI renders the unavailable state correctly
- The file's own comment block (lines 18–36) correctly documents the app-layer-only limitation

**RASP / Sign-Gate**
- RASP-3 fix is correct in `presign.js:52–53`: `DECISION.ALLOW` passes without ack; `WARN` and `CONFIRM` require `acknowledged === true` in the Send UI path
- `M-3 detectTamper` Kotlin fix (`getOrElse { true }`) is confirmed present in `RaspIntegrityPlugin.kt:256`
- `presignGate` correctly rejects on `!gate.signerReachable` regardless of tier

---

## Gate Status

**UNCHANGED.** No finding in this pass promotes any feature from BUILT/TARGET/PLANNED/HONEST-DISABLED to VERIFIED or changes the mainnet gate status. The mainnet gate was opened by the internal audit of 2026-06-17; it remains open.

Features requiring independent audit before their provisional status can be upgraded:
- Biometric Unlock (PROVISIONAL) — BIO-01/BIO-02 confirm the app-layer-only limitation must be disclosed; Hardware KEK Phase 2 (TARGET) requires independent audit before OS-ACL binding can be claimed
- RASP native detection (Phase 4, PLANNED) — no independent validation
- Audit Log (AUDITED-PROVISIONAL) — per-session extension and AL-06 chaff-blob mitigation remain open

The next independent audit should specifically cover BIO-01 (biometric enrollment binding),
RASP-A1 (stale probe snapshot), RASP-A3 (WC presign gate bypass), and AL-06 (absence tell).

---

## Closing I4 Disclaimer

> This document was produced by the same AI system (Claude Code, Anthropic) that authored
> the code under review. It is an **INTERNAL STATIC-ANALYSIS PASS** and carries the same
> confidence level as an internal review, not the confidence level of an independent audit.
>
> Findings here are not "verified" in the CLAUDE.md sense — no real on-chain txid or
> independent third-party attestation supports any status change. The ECC independent audit
> (2026-06-23) remains the only independent audit of record.
>
> Actionable findings (RASP-A2, RASP-A3, BIO-05, PW-02, D-06) are trivial-to-medium
> complexity fixes. They should be addressed in a follow-up PR and then disclosed in an
> updated independent audit scope.
