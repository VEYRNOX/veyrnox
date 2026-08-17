# Internal Security Audit — 2026-08-17
## Scope: RASP · WalletConnect · Hardware KEK · Auth Gates (Weekly)

> **Internal static-analysis pass.** Conducted by internal Claude specialist agents.
> Static code review only — no dynamic testing, no on-device verification.
> An independent third-party audit remains RECOMMENDED (see CLAUDE.md §Hard rules).

Conducted: 2026-08-17
Method: Static code analysis via parallel specialist agents (4 agents × 4 surfaces)
Branch audited: `security-audit/2026-08-17`, an isolated worktree pinned to
`origin/main` @ `440b4baff93bec7f15cc374946f935c6a2d29f57`
("test(xcui): add comprehensive XCUITest suite…", #1882)
Status: **Findings only — nothing fixed. Do not mark anything verified without on-chain txid or on-device evidence.**

### Deviations from the runbook, stated up front

1. **Agent types substituted.** The runbook names `secskills:mobile-pentester`,
   `secskills:web3-auditor`, `secskills:pentester`. None of those are registered in
   this environment. Used the closest available specialists: Penetration Tester
   (RASP, KEK), Blockchain Security Auditor (WalletConnect/EIP-712), Application
   Security Engineer (Auth gates). Surface coverage and briefs are unchanged.
2. **`src/pages/ColdSign.jsx` no longer exists.** Deleted in PR #1796 (`e3f53c93`),
   along with the plaintext-seed QR. The runbook's "ColdSign hardcoded ALLOW" check
   is now moot and that target should be dropped from the task file.
3. **Environment is macOS**, not the Windows path the runbook assumes; the worktree
   ceremony was run in bash with equivalent semantics (`--no-track` preserved).

---

## Changes since last audit (2026-08-03 → 2026-08-17)

297 commits on `main`, of which ~50 touch the four audited surfaces. Breakdown by
type: 163 `fix`, 52 `docs`, 34 `feat`, 15 `chore`, 13 `build`, 7 `ci`.

Security-relevant themes in the window:

- **KEK / unlock hardening.** `#1866` routes M2c Enclave-path KEK-DEK inner blobs
  through KEK unwrap; `#1865` propagates the hardware-factor error code through the
  lockout fallback; `#1879` adds `.code` to `MALFORMED_VAULT` throws so a malformed
  vault stops incrementing the wipe counter; `#1880` wraps the M2c enclave path in
  `withLockSuppressed`; `#1876` handles `UNLOCK_SUPERSEDED` in the PIN error cascade.
- **RASP.** `#1838` makes the attestation latch session-scoped, closing a
  "block once, warn forever" oracle; `#1835` reverses the `RASP_BLOCK` reject args on
  Android and documents the caller-auth threat model; `#1758` adds the probe canary
  (reject on hooked-primitive throw); `#1765` brings iOS to RASP-gate parity.
- **Personal Backup / Shamir.** Phases 2 and 3 landed (`#1673`, `#1742`), plus shard
  hardening in `#1834`/`#1837` and the H-6 commitment (see status table).
- **Panic / deniability.** `#1831` — honest wipe status, side-DB verification,
  extended residue list, numeric PIN floor; `#1774`/`#1785` gate further decoy
  writers.
- **2026-08-15/16 remediation sprint.** Recorded in `docs/Feature-Status.md:2430`
  rather than as a dated audit file, so this pass had no per-finding baseline from
  it. Worth writing those to `docs/audit-2026-08-16-*.md` next time — the sprint's
  findings are otherwise invisible to a reader following the audit-file convention.

Two audited files were **not** touched in the window and carry this pass's only HIGH:
`src/wallet-core/evm/typed-data.js` and `src/lib/wcTypedLevel.js` are unchanged since
PR #1452 (2026-07-28).

---

## HIGH

### H-1 — [WC] EIP-712 `primaryType` is dApp-declared and never reconciled with `types`; every Permit warning, the ack checkbox, and the M-5 risk gate key off it — LIVE

`src/wallet-core/evm/typed-data.js:17-21` accepts `primaryType` as an opaque string.
Nothing anywhere in `src/` checks that `types[primaryType]` exists, let alone that it
is the root of the type graph (verified by hand: `grep -rn primaryType src` returns no
reconciliation outside the Permit-name sets):

```js
const { types, domain, primaryType, message } = parsed ?? {};
if (!types || !primaryType || !message) {
  return { valid: false, error: 'Missing required EIP-712 fields (types, primaryType, message)' };
}
return { valid: true, types, domain: domain ?? {}, primaryType, message };
```

Every downstream protection is a name match on that string:

- `typed-data.js:68-69` — `if (PERMIT_PRIMARY_TYPES.has(pt))` drives the drain warning;
- `typed-data.js:66-87` — `detectAssetAuthorising` is purely string-keyed (Permit and
  Seaport sets), with no structural inspection of `types` or `message`;
- `src/lib/wcTypedLevel.js:107-118` — the M-5 pre-sign risk plane keys off the same
  string, directly and via `detectAssetAuthorising`.

The signer never receives it. `src/lib/WalletConnectProvider.jsx:472-476` calls
`wallet.signTypedData(domain, typesWithoutDomain, message)`; ethers v6 (`6.17.0`,
`package.json:161`) has no `primaryType` parameter and derives the real primary type
from `types` as the single unreferenced struct.

**Impact.** A hostile dApp sends `eth_signTypedData_v4` with
`types: { EIP712Domain: […], Permit: [owner,spender,value,nonce,deadline] }`, the real
token domain, an unlimited `value`, and `"primaryType": "Vote"`. ethers signs the
canonical EIP-2612 `Permit` typehash — a signature `permit()` accepts. On the Veyrnox
side `detectAssetAuthorising` returns false, so the red drain banner and its mandatory
checkbox never render (`RequestApprovalModal.jsx:174,180-185` — typed data has no other
acknowledgement requirement); `scoreWcTypedDataLevel` returns `LEVEL.OK`, so the M-5
fail-closed escalation added for unlimited Permits does not fire; the summary reads
`"Vote on USD Coin"` (`typed-data.js:152`). Approve becomes one unimpeded tap.

Not CRITICAL: `describeTypedData` still renders raw `message` entries, so `value`
appears as `UNLIMITED (115792089237…)`, and a deliberate human tap is still required.
What is defeated is the entire warning + friction + risk layer that exists precisely
because users do not read raw EIP-712 fields.

Refutations tested and discarded: renaming the *struct* would change the typehash, so
the attack renames only `primaryType` and leaves `Permit` in `types` (the existing
lowercase-`permit` test at `typed-data.security.test.js:184-196` covers the benign
case, not this one); ethers only throws on ambiguity, which the attack does not need;
H7 chain binding is an orthogonal axis and a same-chain Permit passes it cleanly.

**Fix.** Reconcile in `parseTypedData` — fail closed on both mismatch and ambiguity:

```js
const structNames = Object.keys(types).filter((n) => n !== 'EIP712Domain');
const referenced = new Set();
for (const n of structNames)
  for (const f of types[n] ?? [])
    referenced.add(String(f?.type ?? '').replace(/(\[\d*\])+$/, ''));
const roots = structNames.filter((n) => !referenced.has(n));
if (roots.length !== 1 || roots[0] !== primaryType) {
  return { valid: false, error: 'primaryType does not match the declared type graph' };
}
```

Regression test: that payload must yield `valid:false`, and `_handleSignTypedData` must
reject before `withPrivateKey`.

---

## MEDIUM

### M-1 — [Auth] PIN timed backoff is documented, unit-tested, and never enforced — LIVE

`src/lib/pinAttemptGuard.js:33-42` defines `pinBackoffMs` (5 min at ≥7 attempts) and
`:59` returns it as `backoffMs`. The only production consumer destructures it away —
`src/components/WalletEntry.jsx:960`:

```js
const { attempts, shouldWipe } = registerFailedPinAttempt(readPinAttempts());
```

`pinBackoffMs` has no non-test importer in `src/`. `PIN_BACKOFF_KEY`
(`WalletEntry.jsx:837`) is only ever `removeItem`'d (`:843`) — nothing calls `setItem`,
nothing reads it, and `runPinUnlock` (`:851-855`) has no lockout gate.

Two other files assert the control is live: `src/wallet-core/panic.js:197` calls it a
"PIN-unlock lockout deadline; survives reload", and
`src/lib/__tests__/pinAttemptGuard.test.js:47-49` asserts `backoffMs > 0` — green
against the pure helper while the runtime control is absent.

**Impact.** The hard stop (10 misses → panic wipe) is intact and load-bearing, so this
is not unlimited guessing. The delta is that a shoulder-surfing guesser gets all 10
attempts back-to-back at Argon2id cost (~6-8 s each, `vault.js:38-40`) instead of
~5.5 min of enforced dead time at attempts 7-9. The larger defect is honesty: three
files describe an active control that is not wired.

This is the exact "flag-disabled cousin" pattern recorded in CLAUDE.md's 2026-07-28
entry — coverage that reads as present and is not. It is also prior-audit **C-2**,
carried since 2026-07-20 and still open.

**Fix.** Wire it (persist `Date.now() + backoffMs` at `WalletEntry.jsx:961`, early-return
in `runPinUnlock` while `now < deadline`) or delete `pinBackoffMs`, `PIN_BACKOFF_KEY`,
the `backoffMs` field and the three test assertions, and correct `panic.js:197`. Keep
the key in the residue list either way — installed-base devices may carry it. Do not
leave the current middle state.

### M-2 — [Auth] Clipboard seed wipe has no `focus` trigger; a visible-but-unfocused page strands the seed on the clipboard — LIVE

Prior H-2 (2026-08-03) is **fixed** in this tree: `src/lib/copySecret.js:86-101`
commits `done` and tears down only on a confirmed successful write, and `:106-109`
retries on return-to-visible, pinned by `copySecret.refocus.test.js`.

The residual is the trigger set. Armed triggers are exactly three
(`copySecret.js:113-120`): a one-shot 30 s timer, `visibilitychange`, and
`APP_LOCK_EVENT`. There is no `focus`/`blur` listener anywhere. But the failure
condition the file itself names is *focus*, not visibility (`copySecret.js:17`):
`writeText` rejects when the page has no focus.

On desktop, switching to another **application window** leaves
`document.visibilityState === 'visible'` while the document loses focus — which is the
flow the file's own header calls normal (copy the phrase, switch to a password manager):

1. t=30 s: timer → `wipe()` → `writeText` rejects (not focused) → `attempts = 1`,
   `done` stays false. Correct per H-2.
2. `onVisibilityChange` never fires — the state never left `visible`, so neither the
   `hidden` branch nor the `attempts > 0` retry at `:108` can run.
3. The user refocuses the page — still no event.
4. The only remaining trigger is `APP_LOCK_EVENT` from idle auto-lock
   (`WalletProvider.jsx:612`), itself likely to fire while unfocused.

The seed phrase then remains on the OS clipboard indefinitely and silently — the same
observable outcome H-2 was opened for, by a different path. The `refocus` test misses it
because it models focus loss *as* a visibility change
(`copySecret.refocus.test.js:22-27,40`).

Secondary, lower: after `MAX_WIPE_ATTEMPTS` (8) the wipe gives up with `done = true`
and no user-visible signal (`:97-99`, disclosed at `:53-56`).

**Fix.** Two lines — `window.addEventListener('focus', wipe)` beside `:119` and the
matching `removeEventListener` in `cleanup()` beside `:79`. `wipe()` is already
idempotent under `done`/`inFlight`. Add a test that drives focus loss without touching
`visibilityState`.

### M-3 — [Auth] PIN attempt counter fails OPEN when localStorage is unwritable, with no in-memory floor and no honest signal — LIVE

`src/components/WalletEntry.jsx:838-841` and `:961`:

```js
const readPinAttempts = () => {
  try { return parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY) || '0', 10) || 0; }
  catch { return 0; }
};
…
try { localStorage.setItem(PIN_ATTEMPTS_KEY, String(attempts)); } catch { /* best-effort */ }
```

The counter has no non-storage backing — no ref, module variable, or provider state
mirrors it. When `localStorage` throws on either side (Safari private browsing, a
WKWebView with storage blocked, quota exhaustion, a hardened enterprise profile), every
miss reads back `0`, `registerFailedPinAttempt(0)` returns `{attempts: 1,
shouldWipe: false}` forever, `pinAttemptWarning(1)` returns null, and the UI shows the
unchanged "Incorrect PIN. Try again." (`:984`). The 10-attempt auto-wipe — the
mitigation the v2 threat model rests on (`deniabilityUnlock.js:19-24`: "the device
self-destructs before an exhaustive search of the 8-digit PIN space completes") — is
silently absent. Fail-open **and** fail-silent, against I4.

Refutation applied: `pinAttemptGuard.js:11-17` already discloses that a determined
attacker with the seized device can clear the counter out-of-band (prior **C-6**). That
covers deliberate tampering and is not re-reported. It does not cover the
non-adversarial unwritable-store case, nor the absence of any honest signal when the
control is not operating. The catch-to-`0` also lets a *transient* read failure reset an
in-progress streak.

Tamper values checked: `"-5"` clamps to 0 (`pinAttemptGuard.js:52`); `"9e99"` →
`parseInt` → 9 → wipes on the next miss; `"abc"` → 0 (the same fail-open).

**Fix.** Keep a `useRef` counter and take the max of stored and in-memory in
`readPinAttempts`, setting it at `:961` and clearing it in `clearPinAttempts`. That
restores the wipe within a session when storage is dead, and also defeats an
out-of-band `removeItem` not followed by a reload.

### M-4 — [Auth] Biometric cache is not invalidated by a biometric-enrollment change; device passcode escalates to wallet PIN — LIVE (disclosed, TARGET)

`src/lib/biometricUnlock.js:104` pins accessibility only
(`KeychainAccess.whenUnlockedThisDeviceOnly`); the limitation is stated at `:88-100`
and `:318-322` ("Biometric-enrollment change does NOT auto-invalidate. This is what
ships today"). The gate is a **live match** (`:159-167`), not a key-bound ACL.

Consequence, which the existing disclosure does not spell out: an attacker holding the
device **and its passcode** can enrol their own biometric, satisfy
`nativeAuthenticateOrThrow()`, and have `retrieveUnlockSecret()` (`:244-251`) release
the cached vault PIN. Device-passcode → wallet-PIN escalation. Note the asymmetry: the
KEK *does* invalidate on Android enrollment change (`WalletEntry.jsx:915` handles
`KEY_PERMANENTLY_INVALIDATED`), so a KEK vault degrades safely here while the cache does
not.

**Fix.** As already scoped — the native shim
(`kSecAccessControlBiometryCurrentSet` / `setInvalidatedByBiometricEnrollment(true)`),
flipping `biometricUnlockSecurityMode()` from `'app-gate'` to `'key-bound'`. Interim and
cheap: surface `biometricUnlockSecurityMode()` in the security-posture UI so the limit is
visible to the user, not only to a reader of that file.

### M-5 — [WC] Spend limits are scored on native `value` only, so any ERC-20 transfer bypasses them; the comment's claimed compensating control does not cover `transfer` — LIVE

`src/lib/WalletConnectProvider.jsx:533-550` scores only `txParams.value`, and
`src/lib/txLimits.js:101-110` derives `amountUSD` solely from it — so a `value: 0x0`
request scores 0 and clears even a `currency: 'ALL'` cap. The comment claims risk
scoring compensates; the registry is two signals
(`WalletConnectProvider.jsx:82-85`): `s2UnlimitedApproval`, `s4AddressPoisoning`.

`approve(spender, MAX_UINT256)` is caught by S2 → `LEVEL.RISK` → rejected. A plain
`transfer(attacker, 1_000_000e6)` is not an approve, so S2 does not fire; S4 needs
`counterparties`, which `src/risk/fromWalletConnect.js:71` supplies empty in this build.
`scoreWcTxLevel` returns `LEVEL.OK`, the limit gate scores $0, and an arbitrarily large
USDC/USDT transfer is signed despite a configured cap the in-app Send screen would
enforce. USDC and USDT are 2 of the 10 live mainnet assets.

Refutation considered: the modal separately runs the full 9-signal `score()`
(`RequestApprovalModal.jsx:102`), and with empty `sendHistory` S1 typically fires
CAUTION → an ack checkbox. That is a generic "first time sending here" banner defeated
by one tick, not limit enforcement — the limit is never consulted. The inaccurate
comment is an I4 honesty problem as much as the control gap.

**Fix.** Lazy honest version, mirroring the `actionPasswordConfigured` rejection at
`:524-531`: if `txParams.data` is non-empty and any enabled limit applies, reject with
`WC_SEND_LIMIT_EXCEEDED` and route the user to the in-app Send screen. Fuller version:
decode `transfer`/`transferFrom`, resolve symbol + decimals from the chain's token list,
feed that amount to `evaluateSendAgainstLimits`, and reject an unrecognised token on a
calldata-bearing request rather than scoring 0. Either way, correct the comment.

---

## LOW

### L-1 — [WC] `eth_sendTransaction`'s requested chain is not checked against session-approved chains before the modal renders — LIVE
`WalletConnectProvider.jsx:681-694` validates `from` only; the typed-data branch
immediately below (`:695-725`) does check the chain. For sends, `resolveSessionCaip2` is
consulted only at sign time (`:872-881`). No fund loss — the sign-time bind is
authoritative and fails closed with `SESSION_CHAINID_INVALID` — but the user completes a
full modal (including the mainnet "real funds" flag, `RequestApprovalModal.jsx:380`) and
any risk ack before being rejected, and `simulateEvmTransaction` runs for a chain the
session never approved. **Fix:** add the same pre-modal guard the typed-data branch uses.

### L-2 — [WC] `eth_signTransaction` is not in `BLOCKED_METHODS` — LIVE
`router.js:39-45` omits it, so it classifies as `REQUEST_TYPES.UNKNOWN` and is queued
into `pendingRequests` rather than auto-rejected. Currently unexploitable — triple-closed
by the advertised namespace (`session.js:243-247`), `approveBlocked` on `UNKNOWN`
(`RequestApprovalModal.jsx:184`), the unrendered approve button (`:427`), and a throwing
`handleApprove` (`:217`). The residual is that a raw-transaction-signing method sits in
the permissive default bucket, one `else if` from becoming reachable. **Fix:** one line,
plus a router test asserting `isBlocked('eth_signTransaction')`.

### L-3 — [RASP] EMULATOR (a BLOCK tier) does not block seed-reveal/export/import — LIVE
`src/rasp/degrade.js:106-116` gives EMULATOR `blockedActions: ['sign']`, while the
*less* dangerous ROOTED (`:66`) and INTEGRITY_UNAVAILABLE (`:103`) block
`['seed-reveal','export','import']`. `classifyEnvironment` ranks emulator above rooted
(`detect.js:64-69`; `attestation.js:93-102` gives EMULATOR danger-rank 4 vs ROOTED 3), so
a device tripping both composes to EMULATOR and `sensitiveGate(artifact,'seed-reveal')`
returns `blocked:false` (`sensitiveGate.js:44`). Danger-monotonicity is broken: the
stronger tier grants more key-material access than the weaker one.
`sensitiveGate.js:13-16` lists the blocking conditions and silently omits EMULATOR.
LOW because seed reveal always sits behind live re-auth and a seed inside an emulator is
normally the operator's own. **Fix:** give EMULATOR the SENSITIVE set, or document the
carve-out where a reader will find it.

### L-4 — [RASP] Seed-material surfaces enforce RASP on a ≤60 s-stale artifact, not a fresh-at-action probe — LIVE
`useRevealWithReauth.jsx:57,89`, `PersonalBackup.jsx:81,108`,
`RestoreFromFile.jsx:144,260`, `SeedGrid.jsx:36,63`, `WalletEntry.jsx:559,732` all read
`useRaspArtifact(...)` (mount-time sample, foreground + 60 s heartbeat,
`useRaspArtifact.js:59,94-133`). The sign hot-path was explicitly hardened to re-probe:
`SendCrypto.jsx:1181` `await getFreshRaspArtifact()`. `degrade.js:30-32` calls seed
reveal/export/import "the highest-danger moments", yet they get the weaker guarantee. A
hook injected after the last probe but before a reveal tap is evaluated under a stale
CLEAN verdict — the window `getFreshRaspArtifact.js:5-11` exists to close. Bounded (≤60 s,
reset on foreground, re-auth burns wall-clock), hence LOW. **Fix:** `await
getFreshRaspArtifact()` at the confirm step on those chokepoints.

### L-5 — [KEK] iOS `HardwareKekPlugin.m` passes Capacitor `reject:` args reversed (message⇄code) — LIVE
Every `reject:` in the ObjC plugin puts the code-word as the message and the sentence as
the code — `:93`, `:164`, `:181`, `:190`, `:198`, `:214`, `:280`, `:288`, `:313`, `:342`.
Both siblings use the intended order: `VeyrnoxEnclavePlugin.swift:70` and
`HardwareKekPlugin.kt:293` (the latter explicitly fixed as "Codex P2 2026-08-16"). No
wipe-counter or key impact today — the control still fires, and `hardware.js:227-248`
classifies by `err.message`, landing the reversed code-word in the wipe-exempt
`NO_HARDWARE_FACTOR` branch. But `e.code` on iOS is never `RASP_BLOCK`/`SE_KEY_MISSING`,
defeating the intent of the RASP-parity gate the file's own comment cites, and this is the
exact sibling of the bug Codex fixed on Android the next day. **Fix:** swap the argument
order throughout the `.m`.

### L-6 — [KEK] iOS has no permanent-invalidation → seed-recovery route — LIVE
Android maps `KeyPermanentlyInvalidatedException` to a distinct wipe-exempt code that
routes to seed recovery (`HardwareKekPlugin.kt:352-363` → `hardware.js:228-234`). iOS has
no equivalent: a biometric change deletes the `.biometryCurrentSet` SE key
(`HardwareKekPlugin.m:135-139`) and surfaces as `SE_KEY_MISSING` (`:308-314`) or the
flattened `DECRYPT_FAILED` (`:334-344`) → `NO_HARDWARE_FACTOR`. `native.js:288-291`
documents the flattening itself. Because it presents as recoverable,
`getHardwareFactorWithLockoutFallback` (`native.js:311-329`) burns a device-credential
prompt and a retry against a key that no longer exists, then yields a generic "hardware
unavailable" — never "your biometric changed, restore from seed". Not data loss (seed
restore recovers the vault); a recovery-UX and honesty gap, already logged as a follow-up
at `native.js:293-295`. **Fix:** preserve the `LAError` code across the bridge, add a
`KEK_ERR` for permanent SE invalidation, route it to the Android UX.

### L-7 — [Auth] `changePassword` leaves the previous real PIN in the biometric cache in the PIN cohort — LIVE
`WalletProvider.jsx:1608-1611` re-caches only when
`shouldCacheUnlockSecret(...)` is true, and `authModel.js:45-47` excludes the `'pin'`
cohort — so that branch neither re-caches **nor clears**. With no duress PIN configured,
`runPinUnlock` legitimately auto-caches the real PIN
(`WalletEntry.jsx:891-898`), so after a change through `/wallet-access-reset`
(`WalletAccessReset.jsx:144`) the old real PIN stays at rest behind a live biometric. No
escalation — the stale PIN decrypts nothing, and `handleBiometricUnlock` self-heals via
`clearUnlockSecret()` (`WalletEntry.jsx:759-766`) — but changing a PIN is the standard
response to believing it was observed, and the app keeps the observed value recoverable
until the user happens to tap Face ID. **Fix:** add the `else` clear, guarded so it cannot
destroy a deliberate decoy-biometric cache.

### L-8 — [Auth] Unbounded credential length reaches five Argon2id derivations — LIVE (web cohort)
`WalletEntry.jsx:1658-1668` renders the vault-password field with no `maxLength`; the
value is re-encoded per derivation (`credentialVerifier.js:27`) alongside the 192 MiB
Argon2id arena (`vault.js:51-56`), and on the total-miss path this runs on input that
never authenticated (`WalletProvider.jsx:1815`). No trust boundary crossed — the actor is
whoever is typing, and the worst case is a crashed tab; `captureVerifierSafe` catches and
returns null (`credentialVerifier.js:76-82`), so it degrades fail-closed. Reported only
because CLAUDE.md's own rule is "all user input validated — length, type, range", and this
is the one uncapped credential path on the surface. **Fix:** `maxLength={128}` plus an
early length reject in `captureVerifierSafe`.

### L-9 — [Auth] The equalizer's fifth KDF sits after the visible success flip but before the visible error on a miss — LIVE
The KDF *count* invariant holds (see PASS), but the two 5th KDFs are on opposite sides of
the observable transition: on a miss the verifier KDF runs before the error surfaces
(`WalletProvider.jsx:1815-1816`), while on success the session flips at `:1978` and the
matching KDF runs 57 lines later at `:2035`, with everything between synchronous or
fire-and-forget. In practice `hash-wasm`'s argon2id is a synchronous WASM call that blocks
the main thread and almost certainly defers the paint until after that KDF — which is why
this is LOW, and why it is reported at all: parity currently rests on an incidental
main-thread-blocking property rather than on ordering, and would break silently if the KDF
moved to a worker. **Fix:** move the success-path `captureVerifierSafe` above
`setUnlocked(true)` (ordering only, no cost change) and assert KDF count *at the state
flip* in `unlockTimingEqualizer.h1.test.jsx`.

### L-10 — [KEK] Android raw HMAC output (factor H) is still never zeroed — LIVE (carried, prior C-3)
`HardwareKekPlugin.kt:377-379`: `hmacResult` from `authenticatedMac.doFinal(macInput)` is
Base64-encoded straight into the bridge and neither buffer is cleared; the `b64` String is
unzeroable by construction. Same class as the accepted iOS residual (M-6, `.m:360-367`),
where the mutable copy *is* zeroed and the pages are `mlock`ed. Unchanged since the
2026-08-03 audit.

---

## INFO

- **[RASP] Stale comments describe a removed bypass as current design.**
  `PlayIntegrityPlugin.kt:24-27,60-67` still say the root cert issuer is checked for
  "Google" and that "the issuer string check is retained as belt-and-suspenders
  fallback" — contradicted by `:210` and by the real verifier
  (`PlayIntegrityJwsVerifier.kt:99-104,127-131`), which enforces a strict 4-root SHA-256
  pin, rejects `x5c` chains shorter than 2, and has no issuer fallback. The JS side says
  the same (`attestation.js:48-49`, `rasp/index.js:36-37`, `useRaspArtifact.js:139`), as
  does CLAUDE.md. The code is *stronger* than its comments — but a comment describing an
  accepted weak fallback invites a future maintainer to "restore" it, which is exactly the
  full-trust bypass #1097 removed. G2-ROOTCERT-PIN is **closed** in code; device
  verification against a real token remains honestly open.
- **[Auth] Doc drift in `credentialVerifier.js:45-46`** — "currently 64 MiB" vs
  `vault.js:53` `196608` KiB = 192 MiB (`:99` in the same file is correct). Worth fixing
  given how often a stale in-code figure gets quoted as current in this repo.
- **[Auth] Scope-adjacent, not rated.** `useActionGuard.jsx:75-83`: the `'biometric'`
  step-up method returns `{allowed: true}` without calling `evaluateTwoFactor` and with no
  PIN factor. Deliberate and reasoned ("PIN was already consumed at unlock"), but it means
  `twoFactorGate`'s "BOTH factors verify" contract does not describe that path — flagged so
  the next reviewer of `twoFactorGate` does not assume it is the sole authority.
- **[Process] The 2026-08-15/16 remediation sprint has no dated audit file**, only
  `docs/Feature-Status.md:2430`. A reader following the `docs/audit-<date>-*.md` convention
  will not find it.

---

## Status vs prior audit (2026-08-03 weekly)

| Prior | Area | Status in this tree |
|---|---|---|
| H-1 | Send gate never awaits TIP verdict | **FIXED** — `src/lib/riskGateReady.js` settles on every *applicable* contributor; `SendCrypto.jsx:1194-1198` rejects when screening is unfinished. Prior L-4 (BTC/SOL permanent block) fixed in the same module. |
| H-2 | Clipboard seed wipe silently no-ops | **FIXED** — `copySecret.js:86-101` commits `done` only on a confirmed write. New residual on the *trigger set* raised as M-2 (a different path to the same outcome). |
| H-3 | `confirmWalletBackup` writes a forensic tell from a decoy session | **FIXED** — PR #1549. |
| H-4 | HMAC signing secret read from a `VITE_`-prefixed env var | **FIXED** — `src/api/tipScreen.js:27-33` hard-fails if `VITE_TIP_SIGNING_SECRET`/`VITE_TIP_API_KEY` is set; both are Edge Function secrets now. |
| H-5 | Opt-in disclosure understates what leaves the device | **FIXED** — `send.screening.remote_opt_in` now reads "(sends this address to a third party)" and `local_disclosure` states nothing leaves the device on the local path. |
| H-6 | Shamir share envelope CRC32-authenticated only | **FIXED** — v2 envelope carries `commitment = SHA-256(DOMAIN‖setId‖k‖n‖secret)`; `combine()` recomputes and rejects a mismatch (`shamir.js:20,32-44,330-334,480`). v1 rejected, not migrated. |
| H-7 | WC transaction fee never displayed before approval | **FIXED** — PR #1551; display uses the *enforcing* helper (`fee.js:108`) so display and enforcement cannot drift. |
| M-1 | `verifyingContract` computed but never rendered | **FIXED** — `RequestApprovalModal.jsx:288-298` renders contract and chainId (`data-testid="wc-verifying-contract"`). |
| M-2 | `unenrollKek` missed by the zeroization fix | **FIXED** — PR #1560. |
| M-3 | Decoy unlock destroys real referral state | **FIXED** — PR #1561. |
| M-4 | TIP response schema unvalidated | **FIXED** — `tipScreen.js:105-170` validates shape and treats drift as "no usable answer", not "clean". |
| M-5 | SecurityAdvisor is a second undisclosed egress path | **PARTIAL / not re-audited this pass** — TIP surface was outside the four assigned surfaces. Treat as open. |
| M-6 | `advisorKnowledge.js` sells TIP screening as Safety Plus | **FIXED** — `advisorKnowledge.js:262-265` now states screening is free and opt-in for everyone. |
| M-7 | Shamir not constant-time despite its own claim | **ADDRESSED (honesty)** — GF arithmetic is now branch-free and table-free, and `shamir.js:49-52` explicitly refuses the end-to-end constant-time claim JavaScript cannot support. |
| C-1 | iOS `getHardwareFactor` has no native RASP gate | **FIXED** — `HardwareKekPlugin.m:92-95,279-282` (PR #1765). |
| C-2 | PIN-backoff rate limiter is dead code | **STILL PRESENT** — re-raised as M-1 with the wiring evidence. |
| C-3 | Android raw HMAC output (H) never zeroed | **STILL PRESENT** — re-raised as L-10. |
| C-4 | iOS `enroll()` plaintext-H buffer unzeroable | **STILL PRESENT (accepted residual)** — `HardwareKekPlugin.m:360-367`; mutable copy zeroed at `:370`, pages `mlock`ed at `:359`. Architectural constraint of the Capacitor bridge. |
| C-5 | Known-bad dApp flag display-only at the gate | **FIXED** — `session.js:221-229` throws `DAPP_BLOCKED_KNOWN_BAD` before `client.approveSession`; the modal hard-disables approve. |
| C-6 | Wrong-PIN counter attacker-clearable `localStorage` | **STILL PRESENT, and widened** — the disclosed tamper case is unchanged; the *unwritable-store* fail-open is newly raised as M-3. |
| C-7 | `hardwareKekVersion`/`kekSalt` not bound into vault AAD | **FIXED** — AAD v:3 (PR #1649); v2→v3 migration re-seals the seed ciphertext under the new binding (`native.js:834-846`). |
| L-1 | `changePassword` decodes salt before its try/finally | **FIXED** — PR #1562. |
| L-2 | RASP detection-chain doc drift | **PARTIALLY FIXED** — PR #1562 addressed the named drift; a different drift (Play Integrity issuer fallback) is raised as INFO above. |
| L-3 | Four wallet-metadata mutators rely on UI-level gating | **FIXED** — PR #1562. |
| L-4 | `riskReady` never settles for SOL sends | **FIXED** — see H-1. |
| L-5 | `Feature-Status.md:789` false on Social Recovery | **FIXED** — PR #1562. |

---

## INFO / PASS — controls confirmed working

**RASP**
- Gate result-shape consistency (the PR #1276 bug class) is closed across the surface:
  `presign.js:54-59` returns `{decision,owner,signerReachable,proceedAllowed}` and every
  reader uses those fields (`SendCrypto.jsx:1046,1207`, `sendGate.js:133-136`,
  `CryptoSigning.jsx:54`, `WalletConnectProvider.jsx:350-360`); `sensitiveGate` returns
  `{blocked,sentence}` and all six seed-surface callers read exactly those.
- Fail-closed defaults throughout: `detect.js:86-107`, `degrade.js:142-168` (unknown
  condition → strongest BLOCK), `selectPresignProbeSource.js:58-61` (no browser-CLEAN
  fallback on native), `sensitiveGate.js:41-43` (null artifact), and
  `getFreshRaspArtifact.js:83-90` (shape drift/throw/timeout → BLOCK).
- No live hardcoded ALLOW: `VITE_BYPASS_RASP` hard-throws at module init in any PROD build
  (`useRaspArtifact.js:55-57`) and the two signing hot-paths never consult it.
- WARN-tier biometric step-up is enforced at the signer, not the UI:
  `SendCrypto.jsx:1218-1226` re-derives `requiresBiometric` from the *fresh* artifact and
  throws `RASP_BIO_REQUIRED`; `raspWarnBioOk` is set only by a real `verifyBiometric2fa()`
  success. WC passes `acknowledged=false` and rejects every non-ALLOW tier — stricter.
- Tamper check is a real fingerprint compare with no placeholder
  (`RaspIntegrityPlugin.kt:802-846`); blank/unreadable/unverifiable → `tampered=true`.
- Hook-swallow evasion addressed by an un-swallowed probe canary
  (`RaspIntegrityPlugin.kt:131-144`); root/hook coverage includes
  Magisk/KernelSU/APatch/Zygisk/LSPosed and Frida port/maps/threads/pipes/ptrace.
- Native BLOCK-tier gate runs pre-WebView (`MainActivity.java:27-31`) and
  `HardwareKekPlugin.getHardwareFactor` is gated by `isBlockTier()`, so a JS-level bypass
  cannot reach the hardware key.
- Attestation egress is deniability-gated and pre-sign-only (`attestation.js:226-228`);
  the session latch (`:215-283`) prevents "block once, warn forever".

**WalletConnect**
- `presignGateOrReject` covers every signing handler before the key —
  `WalletConnectProvider.jsx:364,420,495`, plus session approval at `:756`.
- `eth_sign` and typed-data v1/v3 blocked and un-advertised (`router.js:39-45`,
  `session.js:243-247`).
- H7 chain binding fails closed pre-modal and at sign time (`:451-470`); a domainless
  Permit rejects. Chain comes only from the live session store (`resolveSessionCaip2`,
  `:278-285`).
- Address binding on all three methods, rejecting before `withPrivateKey`
  (`:386-401`, `:430-439`, `:505-514`, plus pre-modal equivalents).
- Session expiry enforced first in all three handlers (`assertSessionLive`, `:801-818`);
  a missing/non-numeric expiry counts as expired. Proposal expiry wired into
  `_storeProposal` (`session.js:60-70`) and re-checked at approve (`:210-215`).
- Step-up re-auth on session approval and all three signing handlers
  (`:771-773`, `:829-832`, `:841-844`, `:863-866`) — provider-side, not UI-side.
- Fee/gas ceilings enforced on both EIP-1559 and legacy paths; an underivable fee renders
  no row rather than a fabricated one (`RequestApprovalModal.jsx:63-66`).
- No unconstrained URL sink: dApp icons go through `isSafeIconUrl` with
  `referrerPolicy="no-referrer"`; `meta.url` renders as escaped text only.
- I3/I2: the relay is never opened for deniability/demo/decoy/hidden sessions and is torn
  down on transition (`:649`, `:745-753`).

**KEK**
- I6 implemented exactly as specified: `kek.js:238-240` builds `ikm = H ‖ C` (ordered
  concat, never XOR) into `HKDF-SHA256` with domain
  `veyrnox/kek/v1/combine(H||C)` (`:250-259`, `:72`).
- Fail-closed on missing/degenerate factors, including all-zero H or C
  (`kek.js:219-236`, mirrored at `hardware.js:277-288`).
- Zeroization on every path including throws and early returns (`kek.js:267-284`,
  `:359-362`; `native.js:803-861`; `web.js:531-566`).
- v2→v3 migration re-seals seed ciphertext under the new AAD binding rather than
  rewriting the header (`native.js:834-846`), written via `safeWriteVault`.
- Destructive re-enroll is guarded against a transient probe error
  (`hardware.js:161-178`); native pre-clears fail closed (`.m:118-131`, `.kt:115-123`).
- StrongBox/TEE honesty: real tier read from `KeyInfo.securityLevel`, and
  SOFTWARE/UNKNOWN/`PROBE_ERROR`/absent tiers are refused with `INSECURE_TIER`
  (`hardware.js:67-73,181-199`) — no silent downgrade presenting as hardware.
- Enrollment-change invalidation set on both platforms (`.kt:208`, `.m:138`).
- The #1879 class (missing `.code` → wipe counter) is closed at the keystore boundary:
  every `getHardwareFactor` exit assigns a stable code, and `UNWRAP_FAILED` stays distinct
  from the exempt codes.

**Auth**
- The timing equalizer no longer relies on a fixed-ms floor: `spendPrimaryUnlockEqualizerKdfs`
  (`deniabilityUnlock.js:215-219`) runs the *same* resolver the failure path runs, so count
  and param-profile parity are structural — legacy 64 MiB vaults equalize too. Traced
  counts: primary success `1+3+1`, duress/hidden hit `1+3+1`, total miss `1+3+1`. The panic
  branch is `1+3+0` and is not an oracle — that outcome wipes the device and renders
  `WipedNotice`.
- "Wallet exists" is not a timing oracle: a missing vault throws with no KDF spent
  (`keystore/web.js:520`, `native.js:459`), but vault existence already drives the
  create-vs-unlock branch on screen.
- Equalizer fail-closed isolation (`WalletProvider.jsx:1730-1732`): a resolver throw cannot
  divert a confirmed real unlock into the decoy, and the return value is discarded.
- Unlock race guard: `unlockGenRef` stamp (`:1640-1645`) with three checkpoints and a bump
  in `lock()`; the decoy/hidden branch asserts before any state mutation.
- `verifyCredential` fails closed on absent verifier, incomplete params, and a `deriveRaw`
  throw (`credentialVerifier.js:90,94-96,102-106`); `captureVerifierSafe` never throws;
  `constantTimeEqual` accumulates over full length with no early return.
- `twoFactorGate` defaults `actionPasswordConfigured` to `false` (`:63`) so an omitting
  caller gets `NOT_CONFIGURED`, and the single opaque `WRONG` code refuses to act as a
  which-factor oracle.
- `retrieveUnlockSecretDirect` enforces its `{kekEnrolled: true}` contract at runtime
  (`biometricUnlock.js:278-286`), and its caller fails toward *more* protection
  (`isVaultKekEnrolledSafe` catches to false).
- Cache invalidation on panic wipe, onboarding rollback, fresh create, import, shard
  restore, duress setup/removal, and explicit disable — the two gaps are M-4 and L-7.
- Wipe counter excludes non-PIN failures (`WalletEntry.jsx:903-907,910,915,931,941,945,954`),
  and `shouldWipe` uses `>=` so an over-counted value cannot slip past un-wiped.
- No decoy/demo writes to shared localStorage on the unlock path: `setDeniabilitySession`
  is mirrored through refs and set synchronously before any gated call; downstream writers
  (`trackEvent`, `incrementSessionDayCount`, `setBiometricUnlockEnabled`, referral block)
  are each gated. `ensureStealthPool()` writing IndexedDB in a decoy session is correct —
  its absence would be the tell.
- Residue-key cross-check clean on this surface: every key written by the six audited files
  appears in `panic.js`'s lists, including `PIN_BACKOFF_KEY`, which nothing writes —
  correctly listed anyway, since presence on a pre-regression device is the tell.

---

## Coverage gaps in this audit (stated honestly)

- Static analysis only. No dynamic testing, no device, no emulator, no on-chain
  confirmation. Nothing here is "verified" in this project's sense.
- Four surfaces only. TIP/SecurityAdvisor egress (prior M-5), Supabase RLS and SQL,
  Personal Backup / shard restore flows, the panic-wipe implementation, referral and
  telemetry paths, and CI/release configuration were out of scope this pass.
- Native binaries were read as source, not compiled, disassembled, or run.
- The HIGH is reasoned from ethers v6's documented `TypedDataEncoder.from(types)`
  root-derivation behaviour, read from the call graph — not from an executed
  proof-of-concept signature.
- L-9's refutation depends on `hash-wasm` argon2id blocking the main thread; confirming
  it needs the timing bench that `deniabilityUnlock.js:93-98` already flags as open.

## Recommended remediation order

1. **H-1** (WC `primaryType` reconciliation) — small, pure, fails closed, and restores an
   entire warning layer on a live mainnet path.
2. **M-2** (clipboard `focus` trigger) — two lines, and the seed-on-clipboard outcome is
   the one this control exists to prevent.
3. **M-3** (in-memory PIN attempt floor) — restores the wipe when storage is dead.
4. **M-1** (wire or delete the PIN backoff) — either is acceptable; the middle state is not.
5. **M-5** (ERC-20 spend-limit gap) — reject calldata-bearing sends under an active limit,
   and fix the inaccurate comment.
6. **L-2, L-5, L-1** — one-liners.
7. **L-3, L-4, L-7, L-10, L-6, L-8, L-9** — defense-in-depth and honesty.
8. **INFO** — delete the stale Play Integrity issuer-fallback prose before someone
   "restores" it.
