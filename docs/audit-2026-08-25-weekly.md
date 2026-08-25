# Internal Security Audit — 2026-08-25
## Scope: RASP · WalletConnect · Hardware KEK · Auth Gates (Weekly)

> **Internal static-analysis pass.** Conducted by internal Claude specialist agents.
> Static code review only — no dynamic testing, no on-device verification.
> An independent third-party audit remains RECOMMENDED (see CLAUDE.md §Hard rules).

Conducted: 2026-08-25
Method: Static code analysis via parallel specialist agents (4 agents × 4 surfaces)
Branch audited: `security-audit/2026-08-25`, an isolated worktree pinned to
`origin/main` @ `c30ad5c4d9ef7b4e1ec1ee0a7e302d1c20c9a620`
("feat(vault): KDF profile v2 (96 MiB / t=6)…", #2054)
Status at time of audit: **Findings only — nothing fixed.**
Status now: **remediated the same day — see §Remediation status below.** Do not mark
anything verified without on-chain txid or on-device evidence; every fix below is
BUILT/INTERNAL, unit-tested only.

### Deviations from the runbook, stated up front

1. **Agent types substituted (same substitution as 2026-08-17).** The runbook names
   `secskills:mobile-pentester`, `secskills:web3-auditor`, `secskills:pentester`. None
   is registered in this environment. Used Penetration Tester (RASP, KEK), Blockchain
   Security Auditor (WalletConnect/EIP-712), Application Security Engineer (Auth gates).
   Surface coverage and briefs unchanged. **This is the second consecutive run with the
   same substitution — the task file should be updated to name agents that exist.**
2. **`src/pages/ColdSign.jsx` still does not exist** (deleted in PR #1796). The runbook's
   "ColdSign hardcoded ALLOW" check remains moot and should be dropped from the task file.
3. **`ios/App/App/HardwareKekPlugin.swift` does not exist** — the iOS KEK plugin is
   Objective-C (`HardwareKekPlugin.m`/`.h`/`Bridge.m`) plus the Swift Enclave service in
   `ios/App/CapApp-SPM/Sources/CapApp-SPM/`. Agent C was pointed at the real files.
4. **Environment is macOS**, not the Windows path the runbook assumes; the worktree
   ceremony ran in bash with equivalent semantics (`--no-track` preserved).

---

## Changes since last audit (2026-08-17 → 2026-08-25)

147 commits on `main`, of which 26 touch the four audited surfaces. Type breakdown:
45 `fix`, 23 `docs`, 17 `chore`, 16 `feat`, 11 `ci`, 4 `perf`, 2 `test`, 2 `refactor`.

The window is dominated by **one theme — unlock latency** — and both of this pass's
HIGH findings come out of it. Three landed inside the last 36 hours:

- **Biometric-first fast path (#2019 → #2047 → #2051 → #2055).** `f4436353` added the
  primitives (`fastpathDekCache.js`, Kotlin alias); `12f5d404` wired
  `unlockBiometricOnly()`; `592f5e08` flipped it **default-ON** behind a mandatory
  first-run disclosure card. The DEK is re-wrapped under `HKDF(H)` — the hardware
  factor alone, no PIN.
- **KDF profile v2 (#2054, `c30ad5c4`).** `KDF_PARAMS` moved from 192 MiB / t=3 to
  96 MiB / t=6, with `KDF_PROFILE_V2_MIGRATION_ENABLED = false` — so installed-base
  blobs keep v1 params while anything newly written gets v2.
- **Unlock plumbing:** `1be28d05` collapsed cold-unlock to one OS prompt on KEK vaults,
  `8dce8e76` closed that PR's own C1/C2/H1/H2 review findings, `6a1efc1e`/`b9bf98cc`/
  `ef7aa705`/`2971adac` cut probe and relock latency, `8657960c` added an opt-in relock
  grace window (off by default).

Also in the window: `c4bf73a6` (#1891) zeroes the Android raw hardware factor H —
**closing prior L-10/C-3**; `6e8b3bef` removed Trezor and Ledger, leaving Digital Shield
as the only hardware path; `3c85b40b` sealed Base44 entity queries with the canonical
deniability predicate (I3); `9a96bebf` hardened the Android biometric cache;
`46c5faf0` landed transaction intelligence and suspicious-asset review.

**Not touched in the window, and still carrying findings:** `src/wallet-core/evm/typed-data.js`
and `src/lib/wcTypedLevel.js` (unchanged since PR #1452, 2026-07-28) — prior H-1 is
therefore untouched. `src/lib/pinAttemptGuard.js`, `src/lib/copySecret.js` likewise.

---

## HIGH

### H-1 — [Auth] Fast-path biometric unlock reopens H-3: it opens the REAL vault with no duress gate, on a default-ON path — LIVE (NEW)

`src/wallet-core/keystore/native.js:600-614` — five gates on the cache-populate path
(deniability/demo, explicit-OFF, disclosure-seen, passkey-registered, RASP tier ALLOW).
`isDuressConfigured()` is not one of them:

```js
async function populateFastpathBestEffort(hCopy, dek) {
  if (isDeniabilityOrDemoActive()) return;      // I3
  if (!isFastpathEnabled()) return;             // Q3 explicit-OFF
  if (!hasSeenFastpathDisclosure()) return;
  if (isPasskeyRegistered()) return;            // owner ruling — passkey wins
  if (tier !== TIER.ALLOW) return;              // fail-closed on WARN/BLOCK/unknown
```

The consuming button carries no duress gate either (`src/components/WalletEntry.jsx:1641-1648`:
platform, enabled, disclosure, biometry available, not-deniability, not-passkey). Compare
the **legacy** cache path 700 lines earlier in the same file, which does carry it —
`WalletEntry.jsx:942-946` passes `duressConfigured: isDuressConfigured()` into
`shouldAutoCacheTypedPin`.

The invariant being violated is stated verbatim in `src/lib/duressBiometricGuard.js:1-6`:

```js
// THE INVARIANT (H-3): while a duress PIN is DELIBERATELY configured, one-tap
// biometric unlock must never release the REAL PIN. Face ID may open the DECOY, or
// nothing at all — never the real wallet. Otherwise the duress feature inverts its own
// promise: a coercer says "just use Face ID" and gets the real funds.
```

`enforceDuressBiometricInvariant()` (`duressBiometricGuard.js:160-162`) disarms only the
legacy cache (`setBiometricUnlockEnabled(false)` + `clearUnlockSecret()`); it never calls
`clearFastpathDek()`. `WalletProvider.setDuressPin` (`WalletProvider.jsx:2402-2403`) does
the same two calls and likewise leaves the fast-path cache warm. Verified independently:
all eight `clearFastpathDekBestEffort()` call sites (`native.js:1149, 1350, 1665, 1769,
1801, 1880, 1944, 1979`) are KEK/DEK **rotation** sites; duress configuration rotates
nothing.

**Impact.** Android, KEK-enrolled vault, fast path on (default), disclosure acknowledged.
Both orderings reach the bypass — populate-then-duress (cache already warm, nothing
clears it) and duress-then-populate (no duress gate on populate, so the next real-PIN
unlock re-warms it). At the lock screen the coercer taps **Unlock with fingerprint** and
`unlockBiometricOnly()` mounts the **primary** session
(`WalletProvider.jsx:2245-2247`: `setIsDecoy(false); setIsHidden(false);`). The Emergency
PIN is never reached. This is a re-opening of a gap that shipped once before.

**Refutations tested and discarded.**
- *"Duress / panic / wrong-PIN still route correctly."* True, and it is the bug. The
  comment at `native.js:556-558` argues safety on the grounds that those paths "ONLY live
  in the PIN-entry path… which this new branch does NOT touch". A second door was added
  beside the one duress guards, not through it.
- *"`FASTPATH_DENIABILITY_BLOCKED` covers it."* No. `native.js:1279` tests whether the
  CURRENT session is a decoy, not whether a duress PIN exists for a future coercion event.
- *"A test covers it."* `grep -rn duress` over `fastpathDekCache.test.js` and
  `native.fastpathClearHooks.test.js` returns nothing (see M-2 below).
- *"Hide the button when duress is configured."* Rejected as the fix — an absent button
  in front of a coercer is itself the tell. Never warm the cache instead.

**Fix.** Add `isDuressConfigured()` to `populateFastpathBestEffort` (the write chokepoint —
the only one that matters, since the button can only read what populate wrote); add
`clearFastpathDek()` to both `setDuressPin` and `enforceDuressBiometricInvariant`; add a
regression test shaped like `duress-biometric-decoy.test.jsx` asserting the wrapped-DEK
slot is empty after `setDuressPin`.

---

### H-2 — [Auth/Deniability] KDF profile v2 broke chaff↔real parity: `kdf.memorySize` is now a static real-vs-chaff distinguisher on installed-base devices — LIVE (NEW)

`src/wallet-core/vault.js:70-76` and `:98`:

```js
export const KDF_PARAMS = Object.freeze({
  parallelism: 1,
  iterations: 6,
  memorySize: 98304, // KiB == 96 MiB
  …
export const KDF_PROFILE_V2_MIGRATION_ENABLED = false;
```

Every chaff/pad generator stamps the **current** params, deliberately —
`src/wallet-core/stealth.js:339` (persisted pool chaff), `src/wallet-core/deniabilityUnlock.js:144`
(timing pad), `src/wallet-core/vault.js:518` (real blobs), all `kdf: { name: 'argon2id', ...KDF_PARAMS }`.
The comment above `stealth.js:339` states why:

```js
// Advertise the CURRENT KDF params (imported from vault.js) so chaff blobs are
// byte-shaped identically to real hidden-wallet blobs. If these were hardcoded
// they would diverge when the at-rest params are raised (SAST M3), making the
// kdf field a real-vs-chaff distinguisher — a deniability tell.
```

That reasoning holds only while chaff and real are written under the *same* params.
Persisted blobs are frozen at write time (`vault.js:399-406`, `paramsFromVault` reads each
blob's own `kdf`), and the reconciling rekey is **off** (`vault.js:479`). So on any device
provisioned before 2026-08-24, pre-v2 writes carry `196608` and post-v2 writes carry `98304`.

**Two concrete breaks.**
1. **Hidden-wallet count-hiding.** Pool chaff is written once and never overwritten
   (`ensureStealthPool`: `if (existing == null) await putKey(db, key, makeChaff());`). A user
   who upgrades and *then* creates a hidden wallet has 255 slots at `196608` and exactly one
   at `98304`. Sorting the 256 IndexedDB slots by `kdf.memorySize` identifies the real one
   with no secret.
2. **"Is duress deliberately configured?"** `provisionDeniabilityChaff` fills the duress and
   panic slots at PIN creation; on an upgraded device both hold `196608`. Setting an Emergency
   PIN afterwards rewrites the duress slot at `98304` while panic chaff stays `196608` — the
   exact property `provisionChaff.js:5-9` exists to hide.

Secondary (timing): `dummyKdf` pads an *absent* feature at 96 MiB while a *present* pre-v2
feature decrypts at 192 MiB — feature-presence parity is now ~2× off on installed-base devices.

**Refutations tested and discarded.**
- *"The equalizer runs the real resolver, so timing is equal."* Correct for **outcome**
  parity (success vs miss) — see INFO/PASS. Says nothing about **feature-presence** parity,
  and nothing at all about the static `kdf` field.
- *"Fresh installs are fine."* Yes — all-96 MiB is self-consistent. This is an installed-base
  defect, and that is also the population that has had time to configure deniability.
- *"The migration flag will be flipped later."* `native.js:837` gates the rekey on that flag,
  but it rekeys only the **primary** vault. Nothing in `duress.js`, `panic.js` or `stealth.js`
  rekeys, so flipping it does not close either break.
- *"`assertSaneKdfParams` normalises."* No — `vault.js:143-146` range-checks only.

**Fix.** Either (a) rekey the deniability slots alongside the primary when the migration flag
flips — chaff and personalised alike, so the whole footprint moves together — or (b) freeze
chaff generation to a per-device recorded profile so chaff always matches that device's era.
Do **not** rekey only real blobs; that inverts the tell. Add a test asserting every stealth
slot plus the duress and panic slots report an identical `kdf` object.

---

### H-3 — [WC] The WalletConnect send path fetches a TIP threat verdict and then discards it: sanctions hits, the static OFAC fallback, and signal-less `block` verdicts never reach the pre-sign gate — LIVE (NEW)

`buildWcTransactionIntelligence` is the single risk builder for both the WC modal and the WC
signing gate. It scores with a hard-coded two-signal registry that **omits S9**
(`src/risk/walletConnectIntel.js:114-122`):

```js
const localVerdict = score(
  riskInputs.unsignedTx, riskInputs.activeSetLocalState, riskInputs.chainData,
  [ { id: 'S2', fn: s2UnlimitedApproval },
    { id: 'S4', fn: s4AddressPoisoning } ],
);
const tipResult = await buildRemoteTipResult(tipApplicable, tipChain, txParams, signal);
```

`chainData` never carries the TIP result either (`src/risk/fromWalletConnect.js:78`:
`const chainData = { recipientCode };`). Compare the in-app Send screen,
`src/pages/SendCrypto.jsx:1020-1021`:

```js
if (tipQuery.data) chainData.tipResult = tipQuery.data;
return score(unsignedTx, activeSetLocalState, chainData);   // default 9-signal SIGNALS
```

Verified independently: `grep -rn s9TipThreat src` returns the signal file, the **default**
registry (`score.js:36,58`) and two comments — no WC call site. So the only route from a TIP
verdict to `txLevel` on WC is `composeTransactionVerdict`, and that route is narrow
(`src/risk/composeVerdict.js:150-190`): `level` initialises to the local level and the tip
branch is `else if (!primaryReason && tipResult?.risks?.length)`. `tipResult.sanctions` is
read nowhere in that file.

**Three bypasses**, all ending at `_handleSendTransaction`'s
`const txLevel = intel?.txLevel ?? LEVEL.CAUTION;` (`WalletConnectProvider.jsx:478`) →
`presignGateOrReject(LEVEL.OK)` → clean-device ALLOW → `wallet.sendTransaction(tx)`:

1. **Sanctions hit.** `screenTransaction` returns `{ verdict:'allow', sanctions:true }`
   (`tipScreen.js:129-138`). `mapTipLevel` keys off `.level`, so the tip contributor renders
   INFO and `.sanctions` is consulted by nobody. The Send screen blocks this at
   `s9-tip-threat.js:47-55` (`LEVEL.RISK`). WC does not, and shows no warning.
2. **Static OFAC fallback.** `isStaticSanctionedEvm` is referenced only from
   `s9-tip-threat.js:32`. With S9 absent, a WC send to a listed mixer gets no OFAC check
   while the same address typed into Send does.
3. **`block` with no signal rows.** `isWellFormedScreenResult` explicitly permits absent
   `risk_data` (`tipScreen.js:285-288`) and `signalsToRiskRows` returns `[]`
   (`tipClient.js:128-129`), so `level:'high', risks:[]` → the promotion branch is skipped →
   headline `OK` alongside `contributors[1].level === 'RISK'` in the same object.

**Impact.** A user who opted into remote screening sees the "remote screening" notice render
(`RequestApprovalModal.jsx:390-394`) — an affirmative claim that screening ran — then signs a
transfer to a sanctioned or TIP-blocked recipient with no friction beyond the generic
broadcast checkbox every WC send carries. The control the user opted into is defeated by the
attacker choosing WalletConnect over the Send screen. I4/I5: claim made, enforcement absent.

**Refutations tested and discarded.** *"S9 is elsewhere on the WC path"* — the WC call passes
an explicit registry, so the default is never used. *"`composeTransactionVerdict` takes a max"*
— it does not. *"The panel shows the RISK contributor"* — only in case 3, and `riskBlocks`
(`RequestApprovalModal.jsx:181-183`) is still false. *"`presignGateOrReject` fails closed"* —
it does; it is being handed `LEVEL.OK`, so the failure is upstream of the gate.
*"`stackedRisk` catches it"* — needs tip=RISK **and** review=INFO **and** runtime=CAUTION
simultaneously (`composeVerdict.js:158-162`); a clean device makes runtime OK, so it can
never fire here.

**Fix.** Add S9 to the WC registry and inject the result, mirroring `SendCrypto.jsx:1020` —
which requires hoisting the `buildRemoteTipResult` await above `score()`:

```js
riskInputs.chainData.tipResult = tipResult;
const localVerdict = score(riskInputs.unsignedTx, riskInputs.activeSetLocalState, riskInputs.chainData,
  [{ id:'S2', fn:s2UnlimitedApproval }, { id:'S4', fn:s4AddressPoisoning }, { id:'S9', fn:s9TipThreat }]);
```

S9 is pure and synchronous, so nothing else changes. Regression tests:
`{verdict:'allow', sanctions:true}` and `{verdict:'block', risks:[]}` must each yield
`txLevel === LEVEL.RISK`, and `_handleSendTransaction` must reject before `withPrivateKey`.

---

### H-4 — [WC] EIP-712 `primaryType` is dApp-declared and never reconciled with `types` — STILL PRESENT (carried from 2026-08-17 H-1)

Unchanged, verbatim, since PR #1452 (2026-07-28). `typed-data.js:17-21` accepts `primaryType`
as an opaque string; `grep -rn primaryType src` (non-test) returns eleven hits, none of which
walks the type graph. `detectAssetAuthorising` (`typed-data.js:66-88`) is a pure name match,
`scoreWcTypedDataLevel` (`wcTypedLevel.js:107-118`) keys off the same string, and
`wallet.signTypedData(parsed.domain, typesWithoutDomain, parsed.message)`
(`WalletConnectProvider.jsx:454`) hands ethers no `primaryType` — ethers derives the real one
from `types`. A hostile dApp ships a canonical `Permit` struct with `"primaryType":"Vote"`:
ethers signs the EIP-2612 typehash, Veyrnox renders no drain banner, no mandatory checkbox,
and `LEVEL.OK`. Full analysis and the reconciliation fix are in `docs/audit-2026-08-17-weekly.md`
under H-1; **re-read that entry rather than re-deriving it.** No fix PR exists.

---

## MEDIUM

### M-1 — [WC] `composeTransactionVerdict` is not a max-composition: a TIP `RISK` contributor is dropped whenever the local scorer produced any sentence — LIVE (NEW)

`src/risk/composeVerdict.js:150-190` initialises `level` from the local verdict and gates the
tip branch on `!primaryReason`. `score()` sets `sentence` as soon as any signal exceeds
`PRIORITY[OK] === 0` (`score.js:110`, `levels.js:25`), so one INFO-level local signal
permanently suppresses the tip plane — a remote `block` is reported as INFO. The returned
object is internally inconsistent (`level:'INFO'` beside a `{id:'tip', level:'RISK'}`
contributor), and `deriveSigningPolicy` (`signingPolicy.js:110-127`) then answers ALLOW /
"All active transaction-intelligence checks have settled."

Currently masked on the WC gate — any non-OK `txLevel` rejects with `acknowledged=false` — so
MEDIUM, not HIGH. It is a live severity/honesty defect in the panel today and becomes the
enforcement path the moment WC gains a "sign anyway" affordance. **This finding survives the
H-3 fix and must be fixed separately.**

**Fix.** Compute `level` as the max over applicable+settled contributors via an explicit rank
table; let the existing branches choose `owner`/`primaryReason` only; keep `stackedRisk` as an
escalation on top, not as the tip plane's sole route.

### M-2 — [Auth] A security comment cites three test files that do not exist, as verification of the exact invariant H-1 breaks — LIVE (NEW)

`src/wallet-core/keystore/native.js:554-559` ends: *"…which this new branch does NOT touch —
verified by native.duressStillWorks / .panicStillWorks / .wrongPinStillFails tests."*
`grep -rln duressStillWorks src/` returns exactly one file: `native.js` itself — the comment.
No such test files exist; searching all 43 files in `src/wallet-core/keystore/__tests__/` and
`src/lib/__tests__/` finds no `describe`/`it` on any duress-vs-fastpath interaction.

This is the CLAUDE.md "coverage that reads as present and is not" pattern in its most direct
form: a fabricated verification claim attached to the one invariant a reviewer would most want
proven, and which H-1 shows is violated. A reviewer trusting the comment stops looking exactly
where the defect is.

**Fix.** Write the three tests (given H-1, `unlockBiometricOnly` must be red when
`veyrnox-duress-configured === '1'`), or delete the claim. Do not leave it as prose.

### M-3 — [Auth] The fast-path disclosure card omits the duress bypass and claims "everything else is unchanged" (I4) — LIVE (NEW)

`src/components/onboarding/FastUnlockFirstRunCard.jsx:117-122` discloses only the
added-face/stolen-phone case and closes with *"Your PIN still works and everything else is
unchanged."* For a coercion-resistant wallet the material fact is that a biometric-only unlock
**routes around the Emergency PIN and the panic PIN entirely**. A user who bought this product
for the decoy wallet reads that sentence and concludes their duress PIN still stands between a
coercer and the real funds — under H-1 it does not, and even after H-1 is fixed, biometric
unlock is compellable in a way a PIN is not.

The consent *chokepoint* is sound (populate gates on `hasSeenFastpathDisclosure()`,
`native.js:610` — nothing warms before the card is answered). It is the content that is
dishonest. `FastpathToggle.jsx` carries no duress language either, and the default-ON flip
means the card is the only text most users see.

**Fix.** Replace the final sentence with the actual tradeoff, e.g. *"Your PIN still works.
Note: fast unlock opens your real wallet directly — your Emergency PIN and panic PIN only
apply when you unlock by typing a PIN."* If H-1 is fixed by suppressing the fast path whenever
duress is configured, say that instead.

### M-4 — [KEK] Fast-path DEK cache protects the DEK under H alone, reducing coercion deniability (owner-accepted; recorded because the weakened property is a headline invariant) — LIVE (NEW)

`src/wallet-core/keystore/fastpathDekCache.js:110-140` derives
`kek_fp = HKDF-SHA256(ikm = H, salt = FASTPATH_HKDF_SALT, info = "veyrnox/kek/fastpath/v1")`,
and `native.js:1330-1332` opens the real vault from that H-only wrap with no PIN. The primary
vault wrap keeps **I6** intact (`combineKek` = `HKDF(H‖C)`, `kek.js:216-266`) — but the cache
holds the same DEK re-wrapped under H alone, so a party who can satisfy the biometric prompt
recovers the real seed with no knowledge of C. `unlockBiometricOnly` never accepts a PIN, so
the deniability fork in `resolveDeniabilityUnlock` is structurally unreachable on that path.

The gating was examined closely and **no hole was found in it**: default-ON but populate is
blocked until the disclosure card is answered, suppressed in deniability/demo, RASP-ALLOW-only,
passkey-exclusive, Android-only (iOS lacks the bridge → MISS → PIN), the Kotlin alias is itself
biometric-gated Keystore, and the cache is cleared at every rotation site. The DEK is never at
rest under a non-hardware key. **Not CRITICAL:** the vault is not decryptable *without* a
credential; biometric is a possessed credential and the hardware gate holds.

Recorded at MEDIUM because the weakened property — coercion deniability, the product's
headline invariant — should sit on the audit record rather than only in a design doc, and
because this is the first release where it is default-ON. No code change recommended beyond
keeping the disclosure mandatory. **Optional hardening:** gate `unlockBiometricOnly` directly
on `hasSeenFastpathDisclosure()`, making "no warm cache before consent" a local property
rather than an emergent one. **M-4 is the accepted-tradeoff half; H-1 and M-3 are the parts
that are not accepted and must be fixed.**

### M-5 — [RASP] `screenCapture` graded ELEVATED lets seed-reveal proceed during active screen mirroring on iOS (no FLAG_SECURE backstop) — LIVE (NEW)

`src/rasp/nativeProbe.js:169-176` folds `screenCapture` (active AirPlay/ReplayKit mirroring,
iOS `UIScreen.isCaptured`) into the `elevated` axis, and ELEVATED carries
`blockedActions: []` (`src/rasp/degrade.js:88-92`), so `sensitiveGate(artifact,'seed-reveal')`
returns `blocked:false` (`sensitiveGate.js:44`) and the mnemonic renders. The re-bucketing
rationale is stated in the Android plugin (`RaspIntegrityPlugin.kt:89-95`): screenCapture
"now yields WARN, not BLOCK… separately blocked at the OS layer by MainActivity's
unconditional FLAG_SECURE."

**That backstop is Android-only**, and the iOS equivalent is explicitly HONEST-DISABLED
(`ios/App/App/RaspIntegrityPlugin.m:219-237`: *"No FLAG_SECURE equivalent on iOS:
HONEST-DISABLED by design."*). The iOS early gate blocks mirroring only **at launch**
(`earlyCheckScreenCapture`, `:647`); mirroring that starts mid-session passes `earlyCheck`,
then surfaces via `checkIntegrity`'s `screenCapture` → `elevated` → reveal allowed. Net: on
iOS, revealing the recovery phrase while AirPlay/ReplayKit mirroring is active exposes the
full mnemonic to the remote screen — RASP *detected* the mirroring and graded it non-blocking
on the platform that lacks the backstop the downgrade assumed.

**Refutations tested.** Reveal is behind 2FA (`useRevealWithReauth.jsx:94`) — true, and it
lowers severity, but 2FA does not stop the display being mirrored once the legitimate user
authenticates; the threat is remote-mirror, not credential theft. Android is genuinely covered.
Export/import do not leak (file, not screen), so scope is seed-**reveal** only.

**Fix.** Split `screenCapture` out of the shared `elevated` union in `nativeProbe.js` and map
it to a BLOCK condition when `Capacitor.getPlatform() === 'ios'` — the Android downgrade
rationale explicitly does not transfer. At minimum add `'seed-reveal'` to a
screenCapture-specific blocked set on iOS.

### M-6 — [WC] Spend limits are scored on native `value` only, so any ERC-20 transfer bypasses them — STILL PRESENT (carried, was M-5 on 2026-08-17)

`WalletConnectProvider.jsx:526-553` unchanged. Two things changed nearby without closing it:
`history`/`knownAddresses`/`whitelist` are now genuinely populated (`:644-654`, `:919-932`,
PRs #1929/#2038), and a `review` contributor was added. Neither helps — the WC registry is
still exactly S2+S4 (see H-3), so S1 never runs, and the review contributor's level does not
feed `verdict.level` (see M-1). `transfer(attacker, 1_000_000e6)` still scores $0 against an
`ALL` cap. The comment at `:521-525` still claims risk scoring compensates; it does not.

### M-7 — [Auth] PIN timed backoff is documented, unit-tested, and never enforced — STILL PRESENT, and worse (carried, was M-1)

`WalletEntry.jsx:1010` still destructures `backoffMs` away. `grep -rn pinBackoffMs src/`
returns only its definition (`pinAttemptGuard.js:37`) and its own call site (`:59`).
`PIN_BACKOFF_KEY` (`WalletEntry.jsx:870`) is *cleared* at `:876` and never written or read,
and `panic.js:231` still sweeps `veyrnox-pin-backoff-until` — residue handling for a key
nothing produces. Worse than last week's write-up: `src/lib/__tests__/pinAttemptGuard.test.js:45-50`
asserts `registerFailedPinAttempt(6).backoffMs).toBeGreaterThan(0)` — green coverage for a
value no production code reads. The 5-minute lockout at ≥7 attempts does not exist at runtime.

**Fix (unchanged, now with a decision to make):** wire the backoff into `runPinUnlock`
(persisting `PIN_BACKOFF_KEY`, already in the residue list and already cleared), **or** delete
the tier function, the key, the residue entry and the test together. Leaving a tested-but-dead
control is the worst of the three.

### M-8 — [Auth] Clipboard seed wipe has no `focus` trigger; a visible-but-unfocused page strands the seed — STILL PRESENT (carried, was M-2)

`copySecret.js:106-109` — the only triggers remain `visibilitychange`, the 30 s timer (`:113`)
and `APP_LOCK_EVENT` (`:119`). No `focus`/`blur` listener anywhere in the file. A visible but
unfocused page (desktop window switch, system dialog, PiP) fires no `visibilitychange`, so the
TTL write rejects for lack of focus, `attempts` becomes 1, and no remaining trigger can fire
without a visibility transition. Related and still unaddressed: at
`attempts === MAX_WIPE_ATTEMPTS` (`:97`) the module sets `done = true` and tears down with the
secret still on the clipboard and no user-visible signal.

### M-9 — [Auth] PIN attempt counter fails OPEN when localStorage is unwritable, with no in-memory floor and no honest signal — STILL PRESENT (carried, was M-3)

`WalletEntry.jsx:871-874` and `:1011` both swallow the exception. Under an unwritable store
every miss reads 0 and writes nothing: unlimited attempts, `shouldWipe` never true. The honest
limit is disclosed (`pinAttemptGuard.js:11-17`, `WalletEntry.jsx:867-869`) — but that
disclosure covers *attacker-clears-the-key*, not *silently-fails-open-with-no-signal*.

### M-10 — [Auth] Biometric cache is not invalidated by a biometric-enrollment change — PARTIALLY FIXED (Android), STILL PRESENT (iOS), honestly disclosed (carried, was M-4)

Android is now covered: `AndroidBiometricCachePlugin.kt:387-393` builds the fast-path alias
with `setUserAuthenticationRequired(true)` + `setInvalidatedByBiometricEnrollment(true)`, with
a JVM tripwire pinning both flags, and `KeyPermanentlyInvalidatedException` clears state at
`:255` and `:288`. iOS unchanged and correctly disclosed — `biometricUnlock.js:99-101`:
*"iOS half remains TARGET: kSecAccessControlBiometryCurrentSet still needs a native Swift/ObjC
shim. We do NOT pretend parity that does not exist (I4)."* `biometricUnlockSecurityMode()`
(`:494-500`) still returns `'app-gate'`. Disclosure accurate; gap real.

---

## LOW

### L-1 — [WC] `enrichRequest` destructures `req.params.request` non-defensively on the render path — LIVE (NEW)
`WalletConnectProvider.jsx:948` (`const { request: { method, params } } = req.params;`) runs
inside the context value on every render (`:986`), while the handler that queued the item
optional-chains the identical access (`:683`) and lets a `method`-less request fall through to
the permissive `else` at `:750`. Availability only — no signature, no funds. Reported on the
internal-inconsistency ground; reachability from a hostile dApp was **not** established
statically (WalletKit validates inbound params). **Fix:** `const { method, params } = req.params?.request ?? {};`

### L-2 — [WC] The pre-modal H7 chain check uses `JSON.parse` where the sign-time check uses `parseTypedData` — LIVE (NEW)
`WalletConnectProvider.jsx:731-745`. Dapps routinely send `params[1]` as an object;
`JSON.parse(object)` throws and silently skips the pre-modal chain bind. Sign time is
authoritative and handles both (`:397`, rejecting `CHAIN_ID_MISMATCH` at `:442-449`), so the
user completes a full approval modal before rejection — same class as L-3 below. **Fix:** use
`parseTypedData` and `toNumericChainId` on both sides.

### L-3 — [WC] `eth_sendTransaction`'s requested chain is not checked against session-approved chains before the modal renders — STILL PRESENT (carried)
`WalletConnectProvider.jsx:704-717` validates `from` and nothing else; the typed-data branch
immediately below still does check the chain. `resolveSessionCaip2` is consulted only at sign
time (`:895-904`).

### L-4 — [WC] `eth_signTransaction` is not in `BLOCKED_METHODS` — STILL PRESENT (carried)
`grep -rn eth_signTransaction src` returns zero hits; `router.js:39-45` lists five methods.
Still triple-closed downstream (`session.js:243-247` advertised namespace;
`RequestApprovalModal.jsx:189` `approveBlocked` on UNKNOWN; `:444` unrendered approve;
`:222` throwing `handleApprove`).

### L-5 — [RASP] EMULATOR (a BLOCK tier) does not block seed-reveal/export/import — STILL PRESENT (carried)
`degrade.js:106-116` still gives EMULATOR `blockedActions: ['sign']` only, while ROOTED (`:66`)
and INTEGRITY_UNAVAILABLE (`:103`) — both lower danger-rank — carry
`['seed-reveal','export','import']`. `attestation.js:99` ranks EMULATOR (4) above ROOTED (3),
so rooted+emulated composes to EMULATOR and seed reveal is permitted. Danger-monotonicity still
broken. **Fix:** give EMULATOR the SENSITIVE set.

### L-6 — [RASP] Seed-material surfaces enforce RASP on a ≤60 s-stale artifact, not a fresh-at-action probe — STILL PRESENT (carried)
`useRevealWithReauth.jsx:57,89`, `PersonalBackup.jsx:100,127`, `RestoreFromFile.jsx:144,260`,
`SeedGrid.jsx:36,63`, `WalletEntry.jsx:571,765` all gate on `useRaspArtifact(...)` — mount-time
sample plus foreground/60 s heartbeat (`useRaspArtifact.js:104,119-140`). The sign hot-path was
hardened (`SendCrypto.jsx:1232`, keystore `native.js:613,1286`) but `degrade.js:41` calls these
"the highest-danger moments" and they still get the weaker guarantee. **Fix:** `await getFreshRaspArtifact()` at the confirm step.

### L-7 — [KEK] iOS `HardwareKekPlugin.m` passes every Capacitor `reject:` with code⇄message swapped — STILL PRESENT (carried)
Capacitor's selector is `reject:(message):(code):(error):(data)`; the Android sibling was fixed
to this order (`HardwareKekPlugin.kt:310-312`, #1835). The `.m` is inverted at `:93, 129, 141,
164, 173, 181, 190, 198, 214, 263, 280, 288, 313, 322, 342, 381`. Not exploitable —
`hardware.js:227-248` classifies by `err.message`, so the reversed code-word lands in the
wipe-**exempt** `NO_HARDWARE_FACTOR` branch (fail-closed, wipe-safe) — but `e.code` on iOS is
never the intended value, defeating any policy that keys on it. One-line swap per site.

### L-8 — [KEK] iOS has no permanent-invalidation → seed-recovery route — STILL PRESENT (carried)
Android maps `KeyPermanentlyInvalidatedException` to the distinct, wipe-exempt
`KEK_KEY_PERMANENTLY_INVALIDATED` (`HardwareKekPlugin.kt:371-382` → `hardware.js:228-234`).
iOS flattens both invalidation cases to `SE_KEY_MISSING`/`DECRYPT_FAILED`
(`HardwareKekPlugin.m:308-344`) → `NO_HARDWARE_FACTOR`. Not data loss and wipe-safe, but the
iOS user whose biometrics changed gets "hardware unavailable" plus a burned device-credential
prompt against a key that no longer exists, never "your biometric changed, restore from seed."

### L-9 — [Auth] `changePassword` leaves the previous real PIN in the biometric cache (PIN cohort) — STILL PRESENT (carried)
`WalletProvider.jsx:1643-1645` skips the cache write in the PIN cohort with no
`else { await clearUnlockSecret(); }`. The stale cached old real PIN no longer opens the vault
(fail-closed direction) but is a plaintext credential at rest the user may have reused. One
line closes it.

### L-10 — [Auth] Unbounded credential length reaches five Argon2id derivations — STILL PRESENT, not UI-reachable (carried)
`credentialVerifier.js:27` has no cap. The sole unlock cohort is `PinPad`, so no free-text
credential reaches it today, and `captureVerifierSafe` (`:76-82`) already swallows the OOM.
A `String(credential).length > 1024 → reject` guard in `deriveRaw` survives a future password cohort.

### L-11 — [Auth] The equalizer's fifth KDF sits after the visible success flip but before the visible error — STILL PRESENT (carried)
Miss: `WalletProvider.jsx:1834-1836` completes the 5th KDF before the error surfaces. Success:
`:2047-2048` runs it after `setUnlocked(true)` and the dashboard render. Visible-outcome
latency ≈ 4 KDFs on success, 5 on a miss. An observer who can time this is already watching
the screen show the outcome.

### L-12 — [Auth] `getFastpathDek()` is called before any app-fired biometric prompt; the Kotlin comment asserts the opposite ordering — LIVE (NEW)
`AndroidBiometricCachePlugin.kt:215-221` says the JS layer fires the OS prompt *before*
calling in; `native.js:1303-1311` deliberately reads the cache slot **first** so an empty slot
surfaces as a bare miss with no prompt. The key is `setUserAuthenticationParameters(30, AUTH_BIOMETRIC_STRONG)`
(`:398`), so the `Cipher.init` is satisfied by whatever BIOMETRIC_STRONG auth last occurred
**device-wide** within 30 s — not by a Veyrnox prompt; outside the window it throws
`UserNotAuthenticatedException` → silent `MISS` → PIN fallback. No secret is released (the
wrapped DEK is useless without H, and `getHardwareFactorWithLockoutFallback` at `:1329` still
fires a real hardware-gated prompt). Consequence is a stale comment plus a default-ON feature
whose benefit fires only when the user happened to authenticate in the last 30 s — a disclosed
security tradeoff bought for a non-deterministic, undisclosed benefit. Not device-confirmed.

### L-13 — [Auth] KDF-cost comments across the auth surface still say 64 MiB / 192 MiB — LIVE (NEW)
`credentialVerifier.js:43-47` ("currently 64 MiB") and `:97-100` ("two concurrent 192 MiB
Argon2id allocs"); same drift at `vault.js:162`, `vault.js:268`, and throughout the `[P1]`
reasoning in `deniabilityUnlock.js:86-115`. Harmless to execution (all paths read `KDF_PARAMS`)
but this is the surface where the numbers *are* the argument, and it masks H-2: the
"keep this blob in sync as the at-rest params evolve" note at `deniabilityUnlock.js:104` reads
as satisfied because it names 192 MiB.

---

## INFO

- **`checkTypedDataChainId` (`typed-data.js:43-64`) is dead code** with a five-case test file
  and no production caller — `_handleSignTypedData` re-implements the same rule inline at
  `:430-449` "so the gate does not depend on a separately-imported helper". Two implementations
  of one rule, only one tested: the drift hazard `fee.js` was refactored to eliminate. Delete
  it or make the provider call it.
- **`provider.estimateGas(tx).catch(() => WC_GAS_CAP)` (`WalletConnectProvider.jsx:596-598`)**
  grants the full 1M cap when estimation fails (typically a reverting tx). Combined with a fee
  pinned at the per-chain ceiling this is a fee-griefing ceiling of ~1M × cap. Mitigated by
  design, not accident — the H-7 worst-case fee row is rendered to the user
  (`RequestApprovalModal.jsx:364-384`). Noted so a future change that removes the fee row knows
  what it is removing.
- **`nativeProbe.js:183-185` carries a stale comment** ("binary-tamper is a separate native
  probe not yet wired") while reading `verdict.tampered`, which both plugins report. No security
  impact; the field is consumed correctly.

---

## Status vs prior audit (2026-08-17 weekly)

| Prior ID | This pass | Verdict |
|---|---|---|
| H-1 — EIP-712 `primaryType` unreconciled | H-4 | **STILL PRESENT** — file untouched since #1452 |
| M-1 — PIN backoff never enforced | M-7 | **STILL PRESENT, worse** — green test for dead code |
| M-2 — clipboard wipe has no `focus` trigger | M-8 | **STILL PRESENT** |
| M-3 — PIN counter fails open on unwritable storage | M-9 | **STILL PRESENT** |
| M-4 — biometric cache vs enrollment change | M-10 | **PARTIALLY FIXED** (Android, #1927) / STILL PRESENT (iOS, disclosed) |
| M-5 — spend limits scored on native `value` only | M-6 | **STILL PRESENT** |
| L-1 — `eth_sendTransaction` chain unchecked pre-modal | L-3 | **STILL PRESENT** |
| L-2 — `eth_signTransaction` not in `BLOCKED_METHODS` | L-4 | **STILL PRESENT** (triple-closed downstream) |
| L-3 — EMULATOR does not block seed-reveal/export/import | L-5 | **STILL PRESENT** |
| L-4 — seed surfaces gate on ≤60 s-stale artifact | L-6 | **STILL PRESENT** |
| L-5 — iOS `reject:` args reversed | L-7 | **STILL PRESENT** |
| L-6 — iOS no permanent-invalidation recovery route | L-8 | **STILL PRESENT** |
| L-7 — `changePassword` leaves old PIN in cache | L-9 | **STILL PRESENT** |
| L-8 — unbounded credential length | L-10 | **STILL PRESENT**, not UI-reachable |
| L-9 — fifth KDF straddles the visible outcome | L-11 | **STILL PRESENT** |
| L-10 / C-3 — Android raw H never zeroed | — | **FIXED** — #1891 (`c4bf73a6`), `HardwareKekPlugin.kt:404-410` zeros in `finally`; two disclosed residuals remain (immutable base64 bridge `String`, and `macInput` which on the v1 branch *is* the shared `PRF_EVAL_SALT` constant and must not be zeroed) |

**One fix in eight days, on a fourteen-finding backlog.** Every unfixed item above was already
reported on 2026-08-17 and several date to 2026-07-28. The window's engineering effort went
almost entirely into unlock latency (#2019/#2039/#2043/#2044/#2047/#2051/#2054/#2055), which
also produced this pass's two HIGHs. Stated plainly rather than buried: the audit backlog is
not being worked, and the work that *is* happening is on the same surfaces the backlog covers.

---

## INFO / PASS — controls confirmed working

Read at `c30ad5c4`, not assumed:

**RASP**
- The historic `gate.blocked`/`gate.sentence` fail-open (PR #1276) is **absent everywhere**.
  `presignGate` returns `{decision, owner, signerReachable, proceedAllowed}` (`presign.js:54-59`);
  `SendCrypto.jsx:1081,1250,1304-1306`, `signingPolicy.js:69-90`, and
  `WalletConnectProvider.jsx:328,343,350,777-787` all read `proceedAllowed`/`signerReachable`.
  The WC session-approval site carries an explicit comment recording the old bug.
- **WARN-tier biometric step-up is enforced on the sign path** from a *fresh* probe, not a
  rendered JSX branch: `SendCrypto.jsx:1277-1284` throws `RASP_BIO_REQUIRED`;
  `signingPolicy.js:93-105` emits `STEP_UP`.
- **Fail-closed chain confirmed end to end:** `getFreshRaspArtifact.js:48-90` maps
  timeout/throw/shape-drift to WARN or BLOCK, never ALLOW; `detect.js:86-106` fail-closes on
  `available !== true` and partial shapes; `selectPresignProbeSource.js:58-61` never falls back
  to browser CLEAN on native; `sensitiveGate(null,…)` fail-closes; `degrade(undefined)` → BLOCK;
  `attestation.js:108` ranks unknown at `+Infinity`.
- **The attestation "block-once, warn-forever" oracle is latched shut** (`attestation.js:216-284`),
  and I3 is preserved because the deniability guard returns UNAVAILABLE *before* reading the latch (`:227`).
- **`VITE_BYPASS_RASP` hard-fails in production** (`useRaspArtifact.js:55-57`) and
  `getFreshRaspArtifact` ignores it entirely — the sign path is unbypassable even in dev.
- **Native tamper detection is real, not a placeholder** on Android
  (`RaspIntegrityPlugin.kt:802-846`, cert SHA-256 vs `BuildConfig.RELEASE_CERT_SHA256`,
  fail-closed on blank/unreadable) with a probe canary at `:131-144`; iOS uses `csops` CS_VALID
  fail-closed (`.m:586-594`). The iOS resigned-IPA gap is **disclosed, not hidden** (`.m:499-506`).

**WalletConnect**
- `presignGateOrReject` present in all four required places (`:343, 399, 483, 779`), async,
  native-aware, `tier = artifact?.tier ?? TIER.BLOCK`, `catch { tier = TIER.BLOCK }`,
  `acknowledged=false` hard-coded.
- **H8 signer binding on all three methods**, pre-modal and at sign time; absent `evmAddress` rejects.
- **H7 chain binding at sign time** (`:430-449`) — an absent `domain.chainId` rejects rather than signs.
- **F-07-WC topic→session binding** — `resolveSessionCaip2` returns `null` for unapproved or
  ambiguous chains; both signing callers resolve from `getActiveSessions()` by topic, never React state.
- **M11 session expiry** — missing/non-numeric expiry treated as expired; `assertSessionLive`
  is the first statement in all three signing callbacks.
- **H-NEW-B step-up re-auth** at all three chokepoints and at session approval, independent of
  the modal's UI gate.
- **M9 gas cap / fee clamps** — both EIP-1559 and the legacy `gasPrice` branch clamped; unknown
  network falls back to the lowest cap; the modal's displayed ceiling comes from the same
  enforcing helper, so no display/enforcement drift.
- **v1/v3 and deprecated-method blocking** checked before anything else in the event handler;
  the approved namespace advertises only the three safe methods.
- **Pairing-URI validation** — two independent checks before `client.pair`.
- **I3** — relay and teardown effects both gate on `isDeniabilityOrDemoActive()`; the three
  Base44 entity queries share one predicate that does not rely on lagging React flags.
- **`unlimited` allowance detection** covers both uint256 and uint160 bands with tolerance, and
  `formatTypedValue` recurses into nested structs/arrays with a depth guard, so Permit2 `details`
  cannot hide behind `[object Object]`.

**Hardware KEK**
- **I6 correct** — `combineKek` (`kek.js:216-285`) is an ordered `H‖C` concat under the fixed
  domain `veyrnox/kek/v1/combine(H||C)`, no XOR; both factors length-checked and all-zero-rejected;
  `ikm`, `H`, `C` and the `deriveBits` buffer zeroed in `finally` on every exit including throws.
  The copies were traced — `kek` is `.set()` into its own buffer, independent of the zeroed view.
- **`unwrapDek`** surfaces wrong-KEK and tamper identically (`UNWRAP_FAILED`, no oracle); v2 binds
  `WRAP_AAD_V2` so the version cannot be downgraded.
- **Fast-path cache uses a distinct AAD and domain-separated HKDF**, so cross-slot blobs fail
  closed as a generic `FASTPATH_UNWRAP_FAILED`; degenerate H rejected.
- **Android StrongBox is preferred, not claimed** — the real tier is read from
  `KeyInfo.securityLevel` and reported honestly; `hardware.js` refuses SOFTWARE/UNKNOWN/PROBE_ERROR
  at enroll. Auth requirements are `BIOMETRIC_STRONG` only (no `DEVICE_CREDENTIAL`), per-use,
  with `setInvalidatedByBiometricEnrollment(true)`.
- **iOS Secure-Enclave naming is honest (I4)** — `capability()` returns `backing:"none"` on
  non-SE devices, `createWrappingKey` throws rather than falling back to plain Keychain, and the
  `.v2` tag + `kSecAttrTokenIDSecureEnclave` check prevent reusing a weaker-ACL key. No
  Keychain-only path is labelled "Secure Enclave".
- **M-3 (2026-07-28) still correctly fixed** — a throw from `opts.isVaultWrapped()` defaults
  `vaultWrapped = true` (`hardware.js:163-166`), so a probe/IO error cannot enter the destructive
  `clearCredential()+enroll()` branch.
- **RASP gates the native KEK surface** on both platforms — `getHardwareFactor` and all
  Enclave key-touching methods reject at BLOCK tier *before* biometric, so a JS-side
  `presignGate` bypass cannot reach H.

**Auth**
- **The H-1/[P1] timing equalizer survives the v2 KDF change by construction.**
  `spendPrimaryUnlockEqualizerKdfs` (`deniabilityUnlock.js:216-219`) calls
  `resolveDeniabilityUnlock(password)` verbatim, so success and miss spend the identical KDF
  count *and* the identical `memorySize` multiset for that vault, whatever era its blobs are
  from. It assumes no cost model, so there is nothing for #2054 to invalidate. (What #2054 broke
  is *feature-presence* parity — H-2, a different invariant.)
- **The fast path does not let biometric substitute for the PIN on send/reveal** —
  `unlockBiometricOnly` never sets `verifierRef`/`lastAuthAtRef`, so `sendReauth.js:15` returns
  `true` and step-up fires. Stated honestly at `WalletProvider.jsx:2200-2204`.
- **`retrieveUnlockSecretDirect` is properly hardened** — an explicit `{kekEnrolled:true}`
  assertion *plus* an in-function `hasVaultKekWrap()` re-check that refuses to trust the caller's flag.
- **`captureVerifierSafe` OOM handling is sound and honest** — never throws; a null verifier
  fails closed; `verifyCredentialDetailed` distinguishes `VERIFIER_OOM` from a wrong credential
  so the UI can say "re-lock and unlock" rather than "wrong PIN"; `deriveRaw` zeroes the encoded
  credential in `finally` and yields a macrotask to hold peak memory to one KDF.
- **`constantTimeEqual`** XOR-accumulates over the full length with no early return.
- **`evaluateTwoFactor`** — fail-closed defaults, one opaque `WRONG` code with no factor oracle,
  no session-type input; the "do not add an isDecoy bypass" contract is intact.
- **I3 write-gating is consistent** — `fastpathUnlock.js` gates at the *writers*
  (`:82, 98, 117`) and leaves reads ungated, matching the `lib/consent.js` three-writer discipline;
  the disclosure card re-checks at click time. No decoy-session write to real auth state found.
- **Fast-path cache invalidation on KEK/DEK rotation is complete** — all eight rotation sites
  clear it, including the case where the cache unwraps cleanly to the *wrong* DEK.

---

## Coverage gaps in this audit (stated honestly)

- **Static only.** No test suite was executed, no build, no device, no chain. Every "confirmed"
  above is a read of `c30ad5c4`.
- **No test anywhere exercises fast-path × duress.** Two fast-path test files, zero mentions of
  duress, panic, or decoy — and the one place the interaction is asserted is a comment naming
  three files that do not exist (M-2). This is the single largest coverage gap on the auth surface.
- **No test asserts chaff/real `kdf`-field parity.** A test that seeds a pool at v1 params,
  writes a real hidden wallet at v2, and asserts all 256 slots report an identical `kdf` object
  would have caught H-2 at PR #2054.
- **No in-memory-floor test for the PIN attempt counter** (M-9), in either direction.
- **`copySecret` has no test for the visible-but-unfocused case** (M-8) — precisely the window
  no listener observes, so no existing test can fail on it.
- **Runtime efficacy of every native detector is unverifiable statically** — Magisk-Hide /
  Zygisk / KernelSU masking, palera1n, Frida-gadget evasion; `checkLocalSocketConnect`
  fail-opens under Android 12+ SELinux by design. The plugins remain BUILT/INTERNAL.
- **The 30 s `AUTH_BIOMETRIC_STRONG` validity window** (L-12), StrongBox enrollment
  invalidation, and the `.biometryCurrentSet` ACL all need a device.
- **H-3 case 3 depends on TIP's actual response shape** — the *client* permits
  `verdict:'block'` with absent `risk_data`, but the `veyrnox-tip` Worker is a separate repo and
  was not read. Cases 1 and 2 do not depend on response shape.
- **`src/wallet-core/keystore/web.js` (WebAuthn PRF factor H)** was spot-checked against the
  `combineKek`/`unwrapDek` contract only, not fully audited this pass.
- **Not examined:** `SessionProposalModal`, `ActiveSessions`, `knownBadDapps.js` contents,
  `simulate.js`, `txLimits.js` internals, WalletKit inbound validation, Kotlin/Swift unit-test
  coverage for L-7 and fast-path invalidation.
- **Prior-finding rulings are code-state only.** No fix PR exists for any STILL-PRESENT item;
  closed-without-merge PRs and issue-level decisions that might explain a non-fix were not searched.

---

## Remediation status (added 2026-08-25, after the fix wave)

Every finding above was worked the same day, in 12 isolated worktrees with
non-overlapping file scope, one PR per group. **Read this section as a record of what
LANDED, not of what is proven.** All fixes are BUILT / INTERNAL: unit-tested, not
device-verified, no on-chain evidence, and not the outstanding independent audit.

| ID | Finding | PR | Outcome |
|---|---|---|---|
| **H-1** | fast-path bypasses duress PIN | #2071 | **FIXED** |
| **H-2** | KDF v2 chaff↔real parity | #2069 | **FIXED (future writes only)** |
| **H-3** | WC discards the TIP verdict | #2067 | **FIXED** |
| **H-4** | EIP-712 `primaryType` unreconciled | #2063 | **FIXED** |
| M-1 | verdict not a max-composition | #2067 | FIXED |
| M-2 | comment cites three non-existent tests | #2071 | FIXED — tests written for real |
| M-3 | disclosure card omits the duress bypass | #2060 | FIXED |
| M-4 | fast-path DEK under H alone | #2071 | **NOT reversed** — owner-accepted; hardening only |
| M-5 | iOS screen mirroring vs seed reveal | #2065 | FIXED |
| M-6 | spend limits blind to ERC-20 | #2068 | FIXED |
| M-7 | PIN backoff never enforced | #2070 | FIXED — wired, not deleted |
| M-8 | clipboard wipe has no focus trigger | #2061 | FIXED (partial — see below) |
| M-9 | attempt counter fails open | #2070 | **MITIGATED, not fixed** — session-scoped floor |
| M-10 | biometric cache vs enrollment change | #2066 | **iOS NOT fixed** — see below |
| L-1..L-4 | WC provider defects | #2068 | FIXED |
| L-5, L-6 | RASP tier monotonicity, stale artifact | #2065, #2070, #2072 | FIXED |
| L-7, L-8 | iOS reject args, SE invalidation route | #2066 | FIXED (uncompiled) |
| L-9 | `changePassword` leaves old PIN cached | #2071 | FIXED |
| L-10, L-13 | credential length cap, stale KDF comments | #2069 | FIXED |
| L-11 | fifth KDF straddles the visible outcome | — | **NOT ATTEMPTED** |
| L-12 | Kotlin comment contradicts the code | #2062 | FIXED |
| INFO | dead `checkTypedDataChainId` | #2063 | Deleted |
| INFO | stale `nativeProbe.js` tamper comment | #2065 | FIXED |

**Merge state when this section was written:** #2060, #2061, #2062, #2063, #2065, #2066,
#2067, #2068, #2069 and #2071 are merged to `main`. **#2070 and #2072 were still open and
awaiting checks** — so M-7, M-9 and the L-6 seed surfaces are written and tested but not
yet on `main` at the time of writing. Check the PRs rather than trusting this line; a
statement about another PR's state is perishable.

### What is NOT closed, stated plainly

- **M-10 (iOS) — not fixed, and deliberately so.** `kSecAccessControlBiometryCurrentSet`
  couples enrollment-invalidation to a biometric read, so the shim would re-introduce a
  Face ID prompt on the KEK fast path — a single-prompt property two existing tests pin.
  Android gets both halves only via a separate Keystore sentinel the iOS Keychain has no
  equivalent for. The alternative considered (a no-prompt presence check) rests on
  unverified Keychain behaviour and could be a no-op that reads as a control. Implementing
  it would have been fake security. `biometricUnlockSecurityMode()` still returns
  `'app-gate'` and the I4 TARGET disclosure stands. **This needs an owner decision on the
  single-prompt trade, not an audit patch.**
- **M-9 — mitigated, not fixed.** The floor is session-scoped by construction; a reload
  clears it. It stops a failed write resetting progress within a session. It is not
  persistence and must not be described as such.
- **H-2 — future writes only.** A device that already wrote a mixed footprint under the
  shipped v2 build stays distinguishable. Only the rekey option heals an existing device.
- **M-8 — half closed.** `WIPE_EXHAUSTED_EVENT` is emitted and tested, but nothing listens
  yet, so the "no user-visible signal" half of the finding is still open.
- **L-11 — not attempted.** Reordering the equalizer's fifth KDF around the visible
  outcome flip was out of scope for this wave.
- **L-7/L-8 are uncompiled.** No Xcode build and no device ran in this session.

### Behaviour changes an owner should sanity-check

1. **TIP unavailability can now block a WalletConnect send.** With S9 live on that path, a
   `warn`/`error`/unrecognised TIP verdict scores CAUTION, and WC has no "sign anyway"
   affordance, so it rejects. That is the fail-closed outcome the fix exists for, but it
   is a live availability change.
2. **The PIN lockout is now real.** Five minutes at ≥7 attempts, enforced before an attempt
   is spent. The deadline is clamped so a corrupted value cannot brick the owner's wallet.
3. **iOS seed reveal now refuses during active screen mirroring.** Android WARN behaviour
   is unchanged.

### Process notes worth keeping

- **Two agents independently hit the same trap:** `getFreshRaspArtifact()` composes the
  remote attestation leg, which these seed surfaces exclude by owner decision 2026-07-16.
  Wiring it in unchanged would have blocked seed reveal/import **forever** on sideloaded
  and web builds. Both built on-device-only helpers instead — which means
  `freshSensitiveGate` (#2070) and `getFreshLocalRaspArtifact` (#2072) are now **two
  implementations of one rule**, the same drift hazard this report flagged against
  `checkTypedDataChainId`. Consolidate them.
- **Three tests were found asserting the defect they should have caught** — two EMULATOR
  cases in `sensitiveGate.test.js` (L-5) and two `g4-*-pins.test.js` rows that went green
  off comment text alone. Inverted with the reason written in place, not quietly.
- **One fix's own test failed in CI on its own premise:** an instance-level
  `spyOn(localStorage,'setItem')` patched an object CI did not resolve, so the simulated
  unwritable store never happened. Replaced with a Map-backed `stubGlobal` and
  mutation-checked. A test that cannot fail is the thing this report keeps finding.

### New findings surfaced during remediation (for the next pass, NOT fixed here)

- **The typed-data pre-modal branch takes its chain from `data.params.chainId` rather than
  `resolveSessionCaip2`** — same class as L-3, on the branch this audit did not name. A
  self-consistent but session-unapproved chain still reaches the modal and is caught only
  at sign time.
- **`RaspSecurity.jsx`'s `CONDITION_LABEL` has no `screen_capture` entry**, so that debug
  page renders the raw string via its fallback. One line.
- **`raspIntegrityPlugin.js:48-53` JSDoc** still describes `screenCapture` as purely
  `elevated`. Stale after #2065.
- **iOS user-cancel maps to `KEK_NO_HARDWARE_FACTOR`** rather than a distinct cancelled
  code (both wipe-exempt). Parity gap with Android.
- **`CLAUDE.md`'s required-check table is stale**: the effective required set is **five**
  contexts, not six — `web-e2e-tests` is required on neither the ruleset nor classic
  protection as of 2026-08-25.

---

## Recommended remediation order

*(Superseded by §Remediation status above — retained as the record of what the audit
recommended before the fix wave ran.)*

1. **H-1** — add the duress gate to `populateFastpathBestEffort` and clear the cache in
   `setDuressPin`/`enforceDuressBiometricInvariant`. Default-ON coercion bypass on the product's
   headline invariant; also the cheapest fix on this list.
2. **M-2** — write the three named tests (or delete the claim). Do this **with** H-1; the
   comment is what would let H-1 recur.
3. **H-2** — decide (a) rekey deniability slots with the primary, or (b) freeze chaff to a
   per-device profile. Blocking on flipping `KDF_PROFILE_V2_MIGRATION_ENABLED`.
4. **H-3** — add S9 to the WC registry and inject `tipResult` into `chainData`. Small diff,
   restores a control the user was told was running.
5. **M-3** — rewrite the disclosure card's last sentence. One string, and it is an I4 issue.
6. **H-4** — reconcile EIP-712 `primaryType` against the type graph (fix drafted in the
   2026-08-17 report, unchanged).
7. **M-1** — make `composeTransactionVerdict` a real max-composition. Survives the H-3 fix.
8. **M-5** — split iOS `screenCapture` out of the `elevated` union.
9. **M-7** — decide backoff: wire it or delete it, key + residue entry + test together.
10. **M-6, M-8, M-9** then the LOW backlog.

---

## Honest framing

This pass is INTERNAL. It is Claude-run static analysis over one commit; it narrows the target
of the outstanding independent third-party audit, it does not close it. Real-device RASP,
compiled native binaries, live Supabase RLS, live RevenueCat runtime, and every runtime claim
in the KEK and fast-path layers remain untested. Nothing here is "verified" — no on-chain txid,
no on-device evidence. Publish-facing material must not describe this pass as independent.
