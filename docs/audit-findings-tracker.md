# Audit Findings Tracker
Last updated: 2026-08-24
Analysed against: origin/main @ `6e8b3bef77a6974b93e662980cabec1ef55821cd`
(clean branch worktree cut from `origin/main` per Step 0 — not the live checkout,
not a `git show` fallback. Environment is macOS; the runbook's PowerShell ceremony
was run in bash with equivalent semantics, `--no-track` preserved.)

> Automated weekly synthesis of every finding across the audit corpus, checked against a
> **pinned snapshot of `origin/main`**. **Static analysis only.** "FIXED" means the code
> change is present on `main` — it does **not** mean the control is verified working
> on-device, on-chain, or against a live backend. Rows tagged `(grep)` were re-verified
> against source this run; rows tagged `(doc)` carry the status recorded in an audit doc or
> PR history and were not independently re-checked.

## Window since last run

Previous run analysed `470ff315` (2026-08-17). `main` has moved **124 commits** in 7 days.
The window is unusually **control-additive**: of the 21 findings this run closed, 17 were
closed by deliberate remediation rather than incidentally, and two of the three regressions
opened inside the window were closed inside it too.

## Sources synthesised

Carried from prior runs (unchanged): `audit-2026-06-26`, `audit-2026-06-27` (×2),
`audit-2026-06-28`, `audit-2026-07-01-kek-internal`, `audit-2026-07-04-internal`,
`audit-2026-07-05-deniability-internal`, `audit-2026-07-14-weekly`,
`audit-2026-07-15-rasp-multi-tool-cycle`, `audit-2026-07-20-weekly`,
`audit-2026-07-23-branch-review`, `audit-2026-07-28-internal` (+ consolidations),
`audit-2026-08-03-weekly`, and `docs/security-diffs/` through `diff-2026-08-16`.

**New this run:**

- **`docs/audit-2026-08-17-weekly.md`** — **the debt the last run explicitly owed.** It
  merged at `ba27d76a`, after the `470ff315` pin, so the previous tracker folded in only
  its C-3/L-10 row and recorded the rest as "owed a pass by the next run". That pass is
  done here: 1 HIGH, 5 MEDIUM, 10 LOW, 4 INFO, plus a 24-row status table against the
  08-03 weekly and a remediation log.
- **`docs/audit-gemini-sweep-2026-08-23.md`** — first Gemini long-context pass in the
  corpus (`src/hooks/`, 13 files). Four findings, each triaged against the base commit by
  a same-run Claude ref-check: 2 real, 1 plausible, **1 fabricated**.
- **`docs/security-diffs/diff-2026-08-21.md`, `-08-22.md`, `-08-23.md`** — three daily
  scans covering the Digital Shield air-gap signer, transaction intelligence, the canary
  release lane, and the native relock work.
- **`docs/dependency-audits/dep-audit-2026-08-17.md`, `-08-21.md`**.
- **PRs #2025 / #2026 / #2028 / #2029** — "audit remediation 2026-08-16, rounds 5–7". See
  the process note below: **these remediate an audit that has no audit file.**

**Coverage gap, stated rather than papered over:** the daily scan has no reports for
**2026-08-17 through 2026-08-20**. `diff-2026-08-16` is followed directly by
`diff-2026-08-21`. Four days of `main` were covered by no daily scan; the 08-17 weekly
covers the surfaces it audited on 08-17 only.

Also scanned: `docs/audit-triage/` (26 files) and `docs/security-audits/` (11 files) — no
finding IDs beyond those already catalogued.

## Summary

- Total findings catalogued: **~265** (dedup across the docs above; MEDIUM/LOW grouped —
  the count is approximate by construction and the delta matters more than the absolute)
- Fixed (code-confirmed): **~199** — **21 closed this run**, of which **13 were
  re-verified by grep against the pinned snapshot** rather than taken from a doc
- Still open / accepted-residual: **~42**
- **Regressed: 2** — both I3 egress seals from `46c5faf0` (#1929), open since 2026-08-21
  and unfixed at this pin. This is the first non-zero regressed count since 2026-08-07.
- Needs on-device / on-chain / live-backend verification: **24**

---

## What changed this run

### The four-audit cluster is down to two, and one of them was already fixed

The previous tracker carried **C-3, C-4, C-5** as "fourth/fifth consecutive audit,
unmoved". That was right for two of them and **wrong for C-5**.

**C-5 is FIXED and has been since before the last pin.** `session.js:227` throws
`DAPP_BLOCKED_KNOWN_BAD` before `client.approveSession`, `SessionProposalModal.jsx:99`
hard-disables the approve path, and `session.approveDomainGate.test.js:26` pins it (grep).
The 08-17 weekly rated it FIXED in its status table; because that file was invisible to
the last run, the tracker went on describing a closed finding as a four-audit recurrence.
**The finding was closed by code and kept alive by a document.** That is the same failure
class as the H-3 "client refactor still pending" bullet CLAUDE.md corrected on 2026-08-07,
and it is worth naming twice: a carried row is a claim about the present, and it decays.

C-3/L-10 remains **partially** closed (raw `hmacResult` zeroed at
`HardwareKekPlugin.kt:409`; the `b64` `String` unzeroable by construction, documented in
the file header at `:29-30` — grep). C-4 is an **accepted residual**: the enroll path's
raw `hBytes` stack buffer *is* `memset(0)` at `.m:195` and on the error branch at `:189`,
and the decrypt path uses `NSMutableData` + `mlock` + `resetBytesInRange` (`:354-370`).
What is left on both platforms is the same immutable-string bridge copy.

### The 08-17 weekly's HIGH is still live, and it is the top open item

**H-1 — EIP-712 `primaryType` is dApp-declared and never reconciled with `types`.**
`src/wallet-core/evm/typed-data.js:17-21` is byte-unchanged from what the audit quoted,
and no structural reconciliation exists anywhere in the file (`grep` for
`roots`/`referenced`/`structNames` returns nothing). A hostile dApp declaring
`"primaryType": "Vote"` while leaving `Permit` in `types` gets ethers to sign the
canonical EIP-2612 typehash while `detectAssetAuthorising` returns false — the red drain
banner, the mandatory checkbox, and the M-5 risk escalation all key off the same
unvalidated string. The signing itself is correct; the entire warning-and-friction layer
above it is bypassed. Seven days open, on a live mainnet path, with a 9-line fix written
out in the audit.

### Three regressions opened; one closed, two live

| Finding | What broke | State at this pin |
|---|---|---|
| **Digital Shield send-gate bypass** (`2ef3b12d` #1930) | `startSendAttempt()`'s Digital Shield branch returned before `sendTx.mutate()`, so the whole sign-time chokepoint — fresh RASP, risk/TIP settlement, spend limits, seed-verification, `canSend`, one-shot 2FA — never ran; `finalizeDigitalShieldSend()` broadcast with no gate at all | **CLOSED** by `0a7f536c` (#1958). `evaluateCurrentSendGate()` extracted verbatim and `await`ed on the mutation path *and* both Digital Shield paths — `SendCrypto.jsx:1342`, `:1583`, `:1677` (grep) |
| **`screenAssetContract` I3 egress** (`46c5faf0` #1929) | New TIP egress with no deniability check; fired on row expansion, so merely opening a flagged token in a coerced session made a live outbound call | **CLOSED.** `tipScreen.js:236` — `if (!client \|\| isDeniabilityOrDemoActive()) return null;` inside the egress function, matching `screenTransaction`'s shape rather than adding a third call-site check (grep) |
| **Base44 queries not sealed by the canonical predicate** (`46c5faf0` #1929) | `WalletConnectProvider.jsx` and `WalletPortfolioPage.jsx` gate new backend queries on `!isDecoy && !isHidden` only — omitting `isDeniabilityOrDemoActive()` and `isUnlocked` | **STILL OPEN** — see Regressed below |

### Closed this run

**2026-08-17 weekly — 1 of 20 own-labelled findings closed (L-10, partial).** The
remediation log in that file is honest that "everything else" is untouched, and grep
confirms it seven days later. This is the weakest close rate of any weekly in the corpus.

**Daily-scan and issue-tracked findings — 20 closed.**

| ID | Sev | Finding | Closed by | Confirmed by |
|---|---|---|---|---|
| **DIFF-0821-DS-GATE** | REGRESSION | Digital Shield reached broadcast without `evaluateSendGate` | #1958 (`0a7f536c`) | **grep**: `evaluateCurrentSendGate` awaited at `SendCrypto.jsx:1342,1583,1677` |
| **DIFF-0822-TIP-I3** | REGRESSION | `screenAssetContract` had no deniability suppression | #1958-window | **grep**: `tipScreen.js:236` |
| DIFF-0821-BTC-SUB | REGRESSION | BTC response verification compared outputs only; a substituted input would finalize and broadcast | `863040cf` (#1933) | (doc) — per-input txid/index/sequence compare + `DIGITAL_SHIELD_BTC_INPUT_MISMATCH` test |
| **#1998** | HIGH | `NATIVE_RELOCK_CACHE_MS` cached the **serialized plaintext container** (every mnemonic, plus `actionPassword`) for 30 s after every lock, defeating `lock()`'s zeroization, skipping the biometric gate and the hardware KEK factor on a hit, and making a correct secret instantly distinguishable (zero KDFs vs a full Argon2id) | #2004 (`ef7aa705`) | **grep**: no `NATIVE_RELOCK_CACHE_MS` / `armRecentNativeUnlockCache` / `recentNativeUnlock` anywhere in `WalletProvider.jsx` |
| **#2000** | HIGH | H-1 success-path equalizer skipped on native; M-4 miss-path equalizer deleted outright | #2004 (`ef7aa705`) | **grep**: `spendPrimaryUnlockEqualizerKdfs` awaited unconditionally at `WalletProvider.jsx:1733`; miss-path `captureVerifierSafe` restored at `:1812` ("equalize miss vs success; discard result") |
| **DIFF-0822-RASP-DEBUG** | MED | `isBlockTier()` gained `if (BuildConfig.DEBUG) return false` — an unconditional fail-open inside the function `getHardwareFactor` consults, pinned by no test | #1973 (`88ecf238`) | **grep**: `isBlockTier` at `:909` has no debug branch; still `getOrElse { true }` fail-closed |
| **DIFF-0822-RASP-LOG** | MED | BLOCK log named which detector fired (`hook=… tamper=… screenCapture=…`) in release builds — a direct evasion aid (A09) | #1973 (`88ecf238`) | **grep**: bare `Log.w("RASP", "BLOCK tier fired")` |
| **DIFF-0822-SEED-PDF** | HIGH | Native "Print Secure Backup" wrote a **plaintext-mnemonic** jsPDF to `Directory.Cache` under a fixed filename and handed it to `Share.share()`, restoring a path deliberately removed 2026-08-15; the file was never deleted and sits outside `ALL_RESIDUE_KEYS`' reach | #1966 (`ac749bed`) | (doc) — jsPDF/Filesystem/Share imports gone; `WalletSeedQR.native-backup.test.jsx` asserts their absence |
| **DIFF-0822-SEED-PW** | MED | `encryptSeedBackup` accepted a 1-character password for a QR the UI tells the user to print, while `vaultBackup.js:225` enforces 12 on the comparable path | #1966 (`ac749bed`) | (doc) — `seedQr.js:29-31` rejects below `MIN_PASSWORD_LENGTH` |
| **DIFF-0822-SUPPLY-1** | MED | Four undeclared direct dependencies (`@ngraveio/bc-ur`, `@keystonehq/bc-ur-registry{,-eth,-sol}`) parsing attacker-reachable UR payloads on the signing path, resolving only transitively and outside the H-4 CODEOWNERS/Dependabot split | #1958, #1973 | **grep**: all four exact-pinned in `package.json:109-111,147` alongside `@scure/base 1.2.6` |
| **DIFF-0822-SUPPLY-2** | MED | `@keystonehq/keystone-sdk` shipped `^0.12.3`, contradicting H-4's exact-pin policy for every other signing dependency | #1958 (`0a7f536c`) | **grep**: `"@keystonehq/keystone-sdk": "0.12.3"` (`package.json:112`); `digitalShield.deps.test.js` pins the pins *and* the Dependabot entries so the two cannot drift |
| **DIFF-0822-RPC-ENV** | MED | `functions/api/rpc/[fn].js:77` gated the fail-loud service-role check on `env.ENVIRONMENT`, a variable **nothing in the repo set** — so `isProd` was permanently false, the 503 never fired, and the anon fallback was silently permanent. This is the prerequisite `docs/rpc-service-role-migration.md` step 3 leans on before the H-3 REVOKEs | `dd8fb285` | **grep**: `wrangler.toml:16-21` declares `[env.preview.vars]`/`[env.production.vars]` `ENVIRONMENT`; `[fn].js:78-79` returns 503 in production without the key |
| **DIFF-0823-DS-XPUB** | LOW | `serializeXpub` used `last.replace("'", '')` — non-global, so a multi-apostrophe path component yielded a wrong `childIndex` and therefore a wrong xpub | #1973 (`88ecf238`) | (doc) — now `/'/g` |
| **GEM-0823-1** | HIGH | `useAnalytics` was the only egress hook gating on `isDeniabilitySessionActive()` alone, so a demo tour on a device with real wallets emitted real-address history requests | `26b683eb` (#1992) | **grep**: `useAnalytics.js:70` now `!isDeniabilityOrDemoActive()`; the pinning test was rewritten to assert the **invariant** and explicitly reject the demo-blind form |
| **IOS-FIREBASE** | MED | FirebaseCore/Crashlytics/Performance in the iOS binary (I2) plus its transitive supply-chain surface | #1984 (`11c98930`) | (doc) — SPM products and `FirebaseObservability.swift` deleted; `firebase-observability.test.js` **inverted to assert absence** rather than deleted, so the tripwire survives |
| **CI-PLAY-DUP** | MED | `publish-android-staging` was a second uncontrolled Play upload path racing `ci.yml` and silently consuming versionCodes 10–11 | #1983 (`ec95835e`) | (doc) — single upload chokepoint |
| **CI-PLAY-SHA** | LOW | `r0adkll/upload-google-play` pinned to a SHA that does not exist in the action's repo, so `publish-to-play-internal` died at action resolution on every `main` run | #1948 (`dbb424c6`) | (doc) — fail-closed breakage, not exposure; corrected 40-char pin, comment retained |
| **ADV-INJECT** | HIGH | `SecurityAdvisor` interpolated the page snapshot into the **SYSTEM** prompt; no normalization, so homoglyphs / `U+2028` / numeric entities / tag chars bypassed any role-switch check | #2025, #2026, #2028 | (doc) — two-layer defense: scan-and-drop, then `<untrusted_context>` at **USER** role; NFKC + entity decode + Greek/Cyrillic/Armenian homoglyph fold; `console.warn` gated behind `import.meta.env.DEV` so a poisoned snapshot is not a production oracle |
| **ADV-SCRUB** | MED | `advisorScrubber` caught only EVM hex and BIP-39 phrases — a pasted Solana base58 or BTC WIF or `xprv`/`yprv`/`zprv` key went upstream unredacted | #2029 (`fe54c62b`) | (doc) |
| **FEE-ESTIMATE** | MED | `estimateGas` had a silent `.catch(() => 21000n)`, so a contract call priced as a pure transfer; the gasLimit hint was honoured on calldata-bearing sends | #2025, #2026, #2028 | (doc) — throws `GAS_ESTIMATION_FAILED`; hint ignored whenever calldata is present, pure ETH still pins 21000n |
| **TEST-THEATER** | MED (I4) | 13 `test.skip` in `e2e/post-audit-security-boundaries.spec.js` (double-broadcast, XSS, PIN, session-expiry, key-in-logs, CSP, address-validation, nonce shape) and 5 `expect(true).toBe(true)` sentinels in the iOS/Android specs — coverage that reads as present and is not | #2025 (`bcb7c6c8`) | (doc) — converted to `test.fixme('#2021 …')` so Playwright **fails the build if any starts passing**, and `it.skip('#2022 …')` with tracking issues. The forever-skip is now a tripwire rather than a hiding place |

**Also closed by removal, not by verification:** **M-2 (07-08)** — `hw-send.js` Ledger/Trezor
"stub-level tests only" has been on the needs-verification list since July. `#2032`
(`6e8b3bef`) deleted both paths; `src/wallet-core/hw/` now contains only `digitalShield.js`
and `provider.js` (grep). The stated reason is a real defect — the Trezor WebUSB bundle
crashed the iOS webview Send page — and `featureCatalogue.js:183` records the removal and
its reason rather than quietly dropping the entry. **Digital Shield is now the sole
hardware path and is itself "Built, not device-verified — no physical-device txid."**

---

## ⚠️ Checklist drift — standing Step-2 checks that are now wrong

Left unamended these produce **false readings**. Two new this run.

| Check | Why it breaks | Correct check going forward |
|---|---|---|
| `M20/H-NEW-4: does kek.js combineKek zero ikm?` | **NEW.** `src/wallet-core/kek.js` does not exist — the module is at `src/wallet-core/keystore/kek.js`. The old path greps empty, which reads as "open". | Assert against `src/wallet-core/keystore/kek.js`. `zero(ikm)` present at `:248` **and** `:280`; `KEK_DOMAIN` correct at `:72` (grep). |
| `DIFF-0816-MAINSYNC: IntegrityGate.swift:88` | **NEW.** File moved from `ios/App/App/` to `ios/App/CapApp-SPM/Sources/CapApp-SPM/`. | Assert against the SPM path. `DispatchQueue.main.sync` still at `:88` — **still open** (grep). |
| `H11: does ColdSign.jsx hardcode TIER.ALLOW?` | File deleted in #1796 (`e3f53c93`). The 08-17 weekly asked for this target to be dropped from the task file; it has not been. | Delete the check. `src/pages/ColdSign.jsx` is absent (grep). |
| `M-2 (07-08): hw-send.js Ledger/Trezor` | Both paths deleted in #2032. | Delete the check; re-point hardware-wallet verification at `src/wallet-core/hw/digitalShield.js`. |
| `H6: BLOCKED_METHODS in src/lib/walletconnect/router.js` | Carried. File is `src/wallet-core/evm/walletconnect/router.js`. | Present at `:39-45` (grep) — but see 08-17 L-2: `eth_signTransaction` is **not** in the set. |
| `H3: PRIMARY_UNLOCK_EQUALIZER_MS ≥ 1500` | Carried. Constant deleted; replaced by KDF-count equalisation. | `spendPrimaryUnlockEqualizerKdfs` awaited at `WalletProvider.jsx:1733` (grep). |
| `C6/H13: CryptoSigning.jsx useRef / copySecret()` | Carried. File rewritten; signing scoped inside `withPrivateKey(index, fn)`. | Assert no `privateKey`/`mnemonic` state and `copyPlain` for copies. |
| `H-NEW-3: copySecret sentinel AND visibilitychange` | Carried. One check, two answers. | Split. `visibilitychange` → FIXED (`copySecret.js:115`). Sentinel → open (weekly L-8). **And note the trigger set is now itself a finding — 08-17 M-2.** |

Re-verified unchanged and still correct this run (grep): **C3** (`presignGateOrReject` ×7 +
`proceedAllowed` ×9 in `WalletConnectProvider.jsx`), **H7** (`domain.chainId` bound, 9 refs),
**H4** (single opaque `WRONG`, `twoFactorGate.js:32,77`), **H15/H16**
(`setIsStrongBoxBacked(true)` best-effort at `.kt:232`; `AUTH_BIOMETRIC_STRONG` only at
`:229`, `AUTH_DEVICE_CREDENTIAL` removed and documented at `:23,95`), **H-NEW-1**
(`RELEASE_CERT_SHA256` from BuildConfig, blank → `return true` fail-closed at `.kt:809-812`),
**M20**, **RASP-A2** (two `?? TIER.BLOCK` sites in `SendCrypto.jsx`).

---

## Still Open ⚠️

| ID | Severity | Finding | File:Line | First reported |
|---|---|---|---|---|
| **H-1** (08-17) | **HIGH** | **The most serious open finding.** EIP-712 `primaryType` is dApp-declared and never reconciled against the `types` graph. A `"primaryType": "Vote"` payload that leaves `Permit` in `types` gets ethers to sign the canonical EIP-2612 typehash while `detectAssetAuthorising` returns false — defeating the drain banner, the mandatory ack checkbox, the M-5 risk escalation, and the summary line, all at once. Fix is 9 lines and written out in the audit | `typed-data.js:17-21` unchanged; no `roots`/`referenced` reconciliation anywhere in the file (grep) | 2026-08-17 |
| **M-5** (08-17) | MEDIUM | Spend limits scored on native `value` only, so **any ERC-20 transfer bypasses them**. `WalletConnectProvider.jsx:528-530` reads `txParams.value`; a `value: 0x0` `transfer(attacker, 1_000_000e6)` scores $0 and clears a `currency:'ALL'` cap. S2 catches `approve`, not `transfer`; S4 needs counterparties this build supplies empty. USDC and USDT are 2 of the 10 live mainnet assets. The comment claiming risk scoring compensates is itself an I4 gap | `WalletConnectProvider.jsx:528-540`, `txLimits.js:101-110` (grep) | 2026-08-17 |
| **M-3** (08-17) | MEDIUM (I4) | PIN attempt counter fails **OPEN and SILENT** when `localStorage` is unwritable — no ref, module variable, or provider state mirrors it, so every miss reads back `0` and the 10-attempt auto-wipe (the mitigation the v2 threat model rests on) is absent with the UI unchanged. Distinct from C-6, which covers deliberate tampering | `WalletEntry.jsx:861-863`, `:983-984` (grep) | 2026-08-17 |
| **M-2** (08-17) | MEDIUM | Clipboard seed wipe has **no `focus` trigger**. Armed triggers are exactly three — a 30 s timer, `visibilitychange`, `APP_LOCK_EVENT` — but the failure condition the file itself names is *focus*, not visibility. Switching to another application window leaves `visibilityState === 'visible'`, so the timer's `writeText` rejects, no event ever fires, and the seed stays on the OS clipboard indefinitely. Same observable outcome as the closed H-2, by a different path. The `refocus` test misses it because it models focus loss *as* a visibility change | `copySecret.js:113-120` — only `visibilitychange` (`:115`) and `APP_LOCK_EVENT` (`:119`) (grep) | 2026-08-17 |
| **M-1 / C-2** (08-17, 07-20) | MEDIUM (I4) | PIN timed backoff documented, unit-tested, and never enforced. `pinBackoffMs` has **no consumer outside its own module** (`pinAttemptGuard.js:37,59` are the only two references in `src/`); `PIN_BACKOFF_KEY` is only ever `removeItem`'d (`WalletEntry.jsx:866`). Three files assert the control is live, including `panic.js:197`. **Second consecutive audit** — wire it or delete it; the middle state is the finding | `pinAttemptGuard.js:37`, `WalletEntry.jsx:860,866` (grep) | 2026-07-20 |
| **M-4** (08-17) | MEDIUM | Biometric cache not invalidated by a biometric-enrollment change: an attacker holding device **and passcode** can enrol their own biometric and have `retrieveUnlockSecret()` release the cached vault PIN — device-passcode → wallet-PIN escalation. Disclosed in-source as TARGET. Note the asymmetry: the KEK *does* invalidate on Android enrollment change, so a KEK vault degrades safely while the cache does not | `biometricUnlock.js:104`, `:88-100`, `:318-322` | 2026-08-17 |
| **DIFF-0823-TIER** | MEDIUM (I3) | `bindOwnReferralCode()` egress is **demo-blind** — gated on `TierProvider.jsx:78` `isDeniabilitySessionActive()` alone, which covers decoy/hidden but not demo. On a demo session `getLocalState()` reads the **real** user's code out of shared localStorage and transmits it to RevenueCat on every app start. The project has since ruled *in code* that a demo-blind gate is a leak (`26b683eb` fixed exactly this in `useAnalytics`); this site was not updated | `TierProvider.jsx:78,91` (grep) | 2026-08-23 |
| **DIFF-0823-CI** | MEDIUM | `ios/App/ci_scripts/ci_post_clone.sh:40` runs `npm install --no-audit --no-fund --legacy-peer-deps` on the path that produces the **App Store archive**, so the shipped binary can be built from dependency versions never in `package-lock.json` and never reviewed. `--no-audit` disables the advisory check on that same path; `--legacy-peer-deps` reinstates a flag dropped repo-wide 2026-07-26. **The stated justification no longer holds** — the 08-23 scan ran `npm ci --dry-run` at the frozen tip and it resolved 2086 packages cleanly. The script's own instruction ("on green sync flip this back to `npm ci`") is satisfied and unactioned | `ios/App/ci_scripts/ci_post_clone.sh:40` (grep) | 2026-08-23 |
| **DIFF-0823-BACKUP** | MEDIUM (I4) | Native seed backup marks the wallet **backed up before anything is backed up**. #1966 correctly removed the plaintext PDF, but control flow still falls through to `setPrinted(true)` + `confirmWalletBackup(selectedWalletId)` — so the user taps a button, gets a toast telling them to write the words down by hand, and the nag goes quiet on a device where no backup exists. Web is unaffected (`window.print()` is a real action) | `WalletSeedQR.jsx:122-123` (grep) | 2026-08-23 |
| **L-2** (08-17) | LOW | `eth_signTransaction` is not in `BLOCKED_METHODS`, so a raw-transaction-signing method classifies as `UNKNOWN` and is queued rather than auto-rejected. Currently unexploitable — quadruple-closed by the advertised namespace, `approveBlocked` on `UNKNOWN`, the unrendered approve button, and a throwing `handleApprove` — but it sits in the permissive default bucket, one `else if` from reachable. One line | `router.js:39-45` — set is `eth_sign`, `eth_signTypedData`, `eth_signTypedData_v3`, `wallet_addEthereumChain`, `wallet_switchEthereumChain` (grep) | 2026-08-17 |
| **L-3** (08-17) | LOW | **Danger-monotonicity is broken.** EMULATOR (a BLOCK tier, danger-rank 4) has `blockedActions: ['sign']`, while the *less* dangerous ROOTED (rank 3) and INTEGRITY_UNAVAILABLE block `['seed-reveal','export','import']`. A device tripping both composes to EMULATOR, so `sensitiveGate(artifact,'seed-reveal')` returns `blocked:false` — the stronger tier grants **more** key-material access than the weaker one | `degrade.js:106-116`, `sensitiveGate.js:13-16,44` | 2026-08-17 |
| **L-4** (08-17) | LOW | Seed-material surfaces enforce RASP on a ≤60 s-stale artifact, not a fresh-at-action probe. Five call sites read `useRaspArtifact(...)` while the sign hot-path was explicitly hardened to `await getFreshRaspArtifact()`. `degrade.js:30-32` calls seed reveal/export/import "the highest-danger moments", yet they get the weaker guarantee | `useRevealWithReauth.jsx:57,89`, `PersonalBackup.jsx:81,108`, `RestoreFromFile.jsx:144,260`, `SeedGrid.jsx:36,63`, `WalletEntry.jsx:559,732` | 2026-08-17 |
| **L-5** (08-17) | LOW | iOS `HardwareKekPlugin.m` passes Capacitor `reject:` args reversed (code-word in the message slot, sentence in the code slot) at ten sites. `e.code` on iOS is therefore never `RASP_BLOCK`/`SE_KEY_MISSING`, defeating the intent of the RASP-parity gate the file's own comment cites. Both siblings use the intended order; Android was explicitly fixed as "Codex P2 2026-08-16" | `.m:93,164,181,190,198,214,280,288,313,342` (grep, `:93` confirmed) | 2026-08-17 |
| **L-6** (08-17) | LOW | iOS has no permanent-invalidation → seed-recovery route. Android maps `KeyPermanentlyInvalidatedException` to a distinct wipe-exempt code; iOS flattens to `SE_KEY_MISSING`/`DECRYPT_FAILED` → `NO_HARDWARE_FACTOR`, so a biometric change burns a device-credential prompt and a retry against a key that no longer exists, then yields "hardware unavailable" instead of "your biometric changed, restore from seed" | `.m:135-139,308-314,334-344`; `native.js:288-295` | 2026-08-17 |
| **L-7** (08-17) | LOW | `changePassword` leaves the previous real PIN in the biometric cache in the `'pin'` cohort — the re-cache branch neither re-caches nor clears. Changing a PIN is the standard response to believing it was observed, and the app keeps the observed value recoverable until the user happens to tap Face ID | `WalletProvider.jsx:1608-1611`, `authModel.js:45-47` | 2026-08-17 |
| **L-8** (08-17) | LOW | Unbounded credential length reaches five Argon2id derivations at 192 MiB each, including on the total-miss path with input that never authenticated. No trust boundary crossed and it degrades fail-closed, but it is the one uncapped credential path on the surface, against CLAUDE.md's own input-validation rule | `WalletEntry.jsx:1658-1668`, `credentialVerifier.js:27` | 2026-08-17 |
| **L-9** (08-17) | LOW | The equalizer's fifth KDF sits after the visible success flip but before the visible error on a miss. Parity currently rests on `hash-wasm` argon2id being a synchronous main-thread-blocking call — an incidental property that would break silently if the KDF moved to a worker | `WalletProvider.jsx:1815-1816` vs `:1978`/`:2035` | 2026-08-17 |
| **L-10 / C-3** (08-03, 08-17) | LOW | **PARTIAL.** `hmacResult` (raw H) scrubbed with `Arrays.fill` in a `finally` at `.kt:409`. What remains is the `b64` `java.lang.String` crossing the Capacitor bridge — unzeroable by construction; closing it needs a bridge carrying bytes. `macInput` is **deliberately** not scrubbed: on the v1 path it *is* the shared `PRF_EVAL_SALT` instance, so filling it would corrupt that constant for every later call and silently change H. Anyone "finishing" this by scrubbing the second buffer introduces a real defect | `.kt:29-30` (header), `:404-409` (grep) | 2026-07-14 — 5th audit, now partial |
| **C-4** (08-03, 08-17) | LOW | **Accepted residual.** iOS enroll's raw `hBytes` *is* `memset(0)` (`.m:189,195`) and the decrypt path uses `NSMutableData` + `mlock` + `resetBytesInRange` (`:354-370`). What is left is the immutable `NSString`/`NSData` bridge copy — same class as Android's `b64` | `.m:346-370` (grep) | 2026-07-14 |
| **GEM-0823-2** | LOW (plausible) | `useBackgroundSecurity` reads `isDeniabilityOrDemoActive()` inside its effect but depends only on `[enabled]`, so a session flipping to decoy without `enabled` changing would not re-run the effect and stop the monitor. **Whether that transition is reachable was not traced**, and Gemini's proposed remedy is a suggestion, not a verified fix | `useBackgroundSecurity.js:46` (call), `:65` (`}, [enabled]`) (grep) | 2026-08-23 |
| **GEM-0823-3** | LOW | Hardcoded `'veyrnox:app-lock'` string bypasses the shared `APP_LOCK_EVENT` constant that `useRecentPages.js` imports. Same event, two spellings | `usePriceAlertNotifier.js:84` (grep) | 2026-08-23 |
| **DIFF-0823-VC** | LOW (I4) | `featureCatalogue.js:515` — the **user-facing** honesty surface — names "versionCode 10" and says a clean Pre-launch report "for versionCode 10" is pending. `build.gradle:25` is at **34**. The 08-23 scan flagged this at 33; it has since moved again, so the drift widened rather than closed | `featureCatalogue.js:515` vs `build.gradle:25` (grep) | 2026-08-23 |
| **DIFF-0823-WRANGLER** | LOW | `vars` is a **non-inheritable** key, so declaring `[env.production.vars]`/`[env.preview.vars]` means the top-level `[vars]` block holding `VITE_BUY_ENABLED` no longer applies to either environment. Inert today (that flag is read at build time from workflow `env:`), but the file now declares a production variable production does not receive | `wrangler.toml:13-21` (grep) | 2026-08-23 |
| **DIFF-0821-CANARY** | LOW | `canary-release.yml`'s `workflow_dispatch` `ref` input is not constrained to trusted immutable refs, and is checked out before `npm ci`/build/scripts run in a Cloudflare-deployment-token context. Mitigating: it reaches only `actions/checkout`'s `ref:` and a concurrency group, never a `run:` block; actions are SHA-pinned; no `pull_request_target`. Also `.env.canary` claims more than it delivers — blanking `VITE_*` cannot affect the Pages Functions that ship with the deploy | `.github/workflows/canary-release.yml:4-14` (grep) | 2026-08-21 |
| **DIFF-0821-BIOCACHE** | MEDIUM | `AndroidBiometricCachePlugin.getSecret` exposes plaintext through a callable Capacitor method with the biometric check remaining in JavaScript, and the storage key is generated without user authentication. Needs a negative test for direct bridge access; release copy must never present the Android sentinel as native biometric ACL parity | `AndroidBiometricCachePlugin.kt:20`, `biometricUnlock.js:126` | 2026-08-21 |
| **DIFF-0821-SPAMINTEL** | LOW (I3) | `spamTokenIntel` writes a shared localStorage override with no deniability seal, while its sibling `suspiciousAssetPrefs` guards every writer inside the module. A decoy interaction can alter primary-session residue | `src/lib/spamTokenIntel.js` | 2026-08-21 |
| **DIFF-0822-REMOTEPREF** | LOW (architectural) | `persistRemoteScreenPreference` writes unconditionally with the decoy guard at its single call site — precisely the arrangement CLAUDE.md warns against ("Do NOT re-guard at call sites — that three-place duplication is exactly how the third writer shipped unguarded"). No bug today; the module is exported, so the second writer will be unguarded by default | `remoteScreenPreference.js:15`, `SendCrypto.jsx:544` | 2026-08-22 |
| **DIFF-0822-CODERABBIT** | INFO | `.coderabbit.yaml` routes the full contents of a private repository — `sql/**`, `supabase/functions/**`, native signing code, every future diff on every branch including drafts — to a third-party AI service. `path_filters` excludes only `builds/**` and `tmp/**`. A deliberate product decision with a companion doc, recorded so the source-code egress surface is on the record rather than implied | `.coderabbit.yaml` | 2026-08-22 |
| **DIFF-0816-REJECT** | LOW | `RaspIntegrityPlugin.kt` probe canary still has the `(code, message)` swap that #1835 fixed in its two siblings: `call.reject("PROBE_CANARY_FAILED", "INTEGRITY_UNAVAILABLE", e)` puts the code-word in the message slot. The pinning test asserts only `toContain('RASP_BLOCK')`, so it could not have caught the original and cannot catch this one | `RaspIntegrityPlugin.kt:142` (grep) | 2026-08-16 |
| **DIFF-0816-MAINSYNC** | LOW | `checkScreenCapture()` calls `DispatchQueue.main.sync` when off-main; Capacitor dispatches plugin calls off the main thread, so this deadlocks if main is ever blocked on that queue. **File moved** — now `ios/App/CapApp-SPM/Sources/CapApp-SPM/IntegrityGate.swift:88` | `IntegrityGate.swift:88` (grep) | 2026-08-16 |
| **DIFF-0730-MT** | MEDIUM (I4) | `MACHINE_TRANSLATED` is keyed by **locale** and gates the whole "machine translated, not reviewed" banner, but the review that cleared it covered only `security.json` (~249 of ~860 strings). ~71% of each locale — including the biometric backup-exposure risk acknowledgement and the reset/wipe confirmation in `wallet.json` — is unreviewed MT with no disclaimer. The source comments say `security.json reviewer-approved` **on the locale-wide flag**, so the mismatch is visible in the code | `src/i18n/index.js:81-93` — es, pt-BR, fr all still `false` (grep) | 2026-07-30 |
| **DIFF-0809-GOV** | GOVERNANCE | A 533-line hand-rolled GF(2⁸) Shamir implementation sits on the path that will hold a DEK share, against CLAUDE.md's "No custom crypto primitives" rule. Defensible, honestly documented, flagged off pre-audit — but it should be an **explicit named item in the outstanding independent-audit scope**, not something the audit discovers | `src/wallet-core/shamir.js`, `docs/cloud-recovery-shard-spec.md:108` | 2026-08-09 |
| C-6 / C1 / weekly M-8 | CRITICAL | PIN attempt counter in clearable `localStorage`; no non-clearable backstop. Honestly disclosed in-source as an "Accepted software limit", so no I4 violation. **See M-3 for the newly-raised unwritable-store half, which is *not* covered by that disclosure** | `pinAttemptGuard.js:11-17`, `WalletEntry.jsx:859` (grep) | 2026-06-26 |
| C-7 / **#1111** | MEDIUM | Vault AAD v:3 — the 08-17 weekly rates this **FIXED** (`native.js:834-846` re-seals seed ciphertext under the new binding, PR #1649). Retained here at lower confidence because the migration flag's live state was not re-derived this run | `vault.js:274` | 2026-07-20 |
| C2 | CRITICAL | 8-digit PIN offline-exhaustible on non-KEK vaults | `vault.js`, `keystore/native.js` | 2026-06-26 |
| H10 | HIGH | Cert pinning — **16** SPKI entries still `PLACEHOLDER_*_REPLACE_ON_DEVICE` (was 17; one host resolved) | `src/wallet-core/rpc/pinning.js` (grep) | 2026-06-26 |
| H1 / H2 / BIO-01 / H-NEW-5 | HIGH | Biometric unlock cache not OS-ACL bound to the enrollment set | `biometricUnlock.js:84-104` | 2026-06-26 |
| BIO-02 | HIGH | App-layer biometric gate Frida-bypassable (fundamental; disclosed) | `biometricUnlock.js:18-36` | 2026-07-05 |
| H5 | HIGH | `captureVerifierSafe` OOM bricks the send gate for the session. *Partly mitigated* — `verifyCredential` catches an Argon2id `RangeError` and fails closed (#1643) | `credentialVerifier.js:64` | 2026-06-26 |
| H-3 (07-01) | HIGH | Android biometric lockout → device-credential fallback (accepted deviation) | `BiometricService` | 2026-07-01 |
| G2-ROOTCERT-PIN | HIGH → INFO | **Closed in code** per the 08-17 weekly: `PlayIntegrityJwsVerifier.kt:99-104,127-131` enforces a strict 4-root SHA-256 pin with no issuer fallback. What remains open is (a) device verification against a real token and (b) **stale KDoc at `PlayIntegrityPlugin.kt:24-27,60-67` still describing the removed issuer-string fallback as current design** — an invitation to "restore" the full-trust bypass #1097 removed | `PlayIntegrityPlugin.kt:24-27,60-67` | 2026-07-15 |
| RASP-A1 | HIGH | RASP browser probe is a module-load snapshot (partly addressed by P2-1) | `browserProbe.js:76` | 2026-07-05 |
| D-04 | HIGH | I3 egress race: `isDecoy` React state lags the module flag (PLAUSIBLE). **Corroborated this run** — the two live Base44 regressions are exactly this shape | `WalletProvider.jsx:316-321` | 2026-07-05 |
| P2-2 | MEDIUM | WC signing timing side-channel (accepted residual) | `WalletConnectProvider.jsx` | 2026-07-15 |
| M-K | MEDIUM | Passkey `signCount` not persisted (no-backend architecture) | `passkey.js` | 2026-06-28 |
| M-1 (07-08) | MEDIUM | EVM private key as a JS string — unzeroable (ethers v6); ACCEPTED RESIDUAL | EVM signing path | 2026-07-08 |
| PW-01 | MEDIUM | In-app guarded wipe requires no re-auth (types `"WIPE"` only) | `PanicWipe.jsx:57,106` | 2026-07-05 |
| L-2 (08-03) | LOW | RASP detection-chain doc drift between the Kotlin plugin's comments and `nativeProbe.js` | `RaspIntegrityPlugin.kt:35,73` | 2026-08-03 |
| weekly M-4 (07-14) | MEDIUM | RASP-blocked WC request fails silently in the UI (fail-closed on the wire, not fail-*honest*) | `WalletConnectProvider.jsx` | 2026-07-14 |
| weekly M-6 (07-14) | MEDIUM | RaspSecurity/catalogue *under-claim* RASP status (stale "pending") | `RaspSecurity.jsx:45` | 2026-07-14 |
| weekly L-8 (07-14) | LOW | `copySecret` has no read-back sentinel — the clipboard overwrite is never confirmed (deliberate, `copySecret.js:30`) | `src/lib/copySecret.js:30` | 2026-07-14 |
| weekly L-1…L-7 (07-14) | LOW | `checkSystemWritable` weak; negative `txGas` unclamped; duplicated chainId helper; stale modal identity; iOS cancel misclassified; Android salt unzeroed; async prompt try/catch | various | 2026-07-14 |

**Accepted-residual / by-design:** M1–M19, L1–L10 (06-26); M-NEW-1…12 (06-27);
F-05/F-11/CS-1/SC-1/RASP-2/RASP-4/RASP-5 (07-04);
D-01/D-02/D-05/D-06/SW-01/SW-02/PW-02/PW-04/PW-05/AL-01/AL-02/AL-06/BIO-03/BIO-05/BIO-06/BIO-07/RASP-A4
(07-05). Consult the source audit for per-item rationale.

**Refuted on verification** (recorded so a future pass does not re-file): ROOTED→WARN
biometric ladder; "Play Integrity uses JWE not JWS"; "heuristic root checks fail open
per-check"; JS↔native bridge integrity; `HARDWARE_FACTOR_DEGENERATE` wipe-counter
miscount; 2026-07-20 weekly **H-2** (ColdSign WARN-tier gap — file since deleted outright).
**New this run:** the Gemini sweep's MEDIUM "**corrupted JSDoc tags**" is **FABRICATED** —
`grep -rn "@src/" src/hooks/` returns zero matches, and the two cited files carry ordinary
`@param`/`@type` tags. Recorded because a fabricated finding that reaches a tracker is
worse than one that never left the model: it becomes a carried row nobody re-checks.

---

## Needs On-Device / On-Chain / Live-Backend Verification 📱

| ID | Finding | Why verification is needed |
|---|---|---|
| **H-3 PRODUCTION REVOKEs** | **Still the single most important row.** The database every prior analysis queried was *staging* (`nszlbcmcysftwyudthjz`, which is **named** `veyrnox-prod`). Production is `jwstkrtslotnjyerzzsi`. STAGE 1 of `sql/live-project-hardening-2026-08-07.sql` was applied; **STAGE 2 remains commented out.** Movement this run: the `env.ENVIRONMENT` prerequisite is now real (`wrangler.toml:16-21` + the 503 at `[fn].js:78`), so the runbook's step-3 gate can finally fire — but **whether `SUPABASE_SERVICE_ROLE_KEY` is set on the Pages project, and in which scope, is dashboard state this analysis cannot read.** Re-verify against the ref the shipped bundle connects to, never a project name |
| **`ENVIRONMENT` / service-role scope** | New. `wrangler.toml` now declares the variable, but the canary lane publishes a **third standing public deployment** on the same `veyrnox-prod` Pages project. If the service-role key is bound outside the Production scope, the allowlisted RPCs are callable without RLS from an extra hostname. Not open database access — `ALLOWED_RPCS` is closed, reaches only `/rest/v1/rpc/<name>`, and rate-limits fail-closed — but it is an open question, not a demonstrated defect |
| **`register_referral_code` migration ordering** | `b9a9f7ec` (#1779) changed the return type `void` → `text` and `referralApi.js` reads it. Nothing in-tree shows the SQL has been applied to either project. Must run **before** a client build depending on the return value ships |
| **`sql/ai-referral-attribution-plan-family.sql`** | New. `CREATE OR REPLACE` preserving the H-3 REVOKEs, `search_path` pin, range checks and 2/hour dedup all read correctly — **CODE only, not yet run against either project**, per the standing rule that production DDL follows the merge |
| **RC referral chain end-to-end** | #1703 (wrong recipient) and #1704 (attribute-name mismatch) were fixed **together** in `90d0cddb` (#1955), which is the coordinated release CLAUDE.md demanded — fixing #1704 alone would have activated the wrong-recipient grant path, and it wasn't. Whether the chain now grants correctly requires a real purchase plus RC dashboard webhook configuration, neither of which has happened |
| **`tip-chat` `vault:` strip deploy state** | The prefix is stripped in repo state (#1761); no in-tree evidence `tip-chat` was redeployed, so the live function may still honour it |
| **RASP on a Play-delivered install** | `detectTamper()` on a real internal-track install. The 1.0.1 pre-submission hold requires a clean Pre-launch report and clean Android Vitals; `featureCatalogue.js` still names versionCode 10 while `build.gradle` is at 34 |
| **1.0.1 golden path on an untouched device** | Play rejected build 5 because Create Wallet failed on stock hardware — the KEK/RASP fail-closed path rejecting on a device the developer had never touched. Relevant progress this run: #1973 reordered `earlyCheck` so `earlyDetectHook()` runs **before** `earlyPtraceTraceme()`, because claiming the ptrace slot first set `TracerPid` to our own parent and made the probe self-detect on a **clean device** — the exact false-BLOCK shape behind that rejection. Source-verified; never run on the rejecting hardware |
| **New crash-smoke jobs** | `android-monkey-smoke.yml` and `ios-xcuitest-smoke.yml` (`cd64880d`, `77a5d48d`) landed for the 1.0.1 gate and have not been analysed by any scan or shown to produce a signal |
| **Digital Shield** | Now the **sole** hardware-wallet path (#2032 removed Trezor and Ledger). Response verification reads strong on paper — per-request session TTL, single-use replay guard, SHA-256 binding hash, per-chain signer proof, per-input PSBT compare — but no physical device has ever signed through it and no txid exists. Negative cases for stale session/context change during the QR exchange remain unwritten |
| **Firebase tripwires** | Android artifact-level guards (#1782) live in `workflow_dispatch`-gated jobs and **have never executed**. iOS is now moot — Firebase left that binary entirely (#1984) |
| **iOS webview payload freshness** | `ios/App/App/public` is gitignored and `xcodebuild archive` does **not** rebuild it. Compounded this run by `ci_post_clone.sh` building the archive from an unpinned `npm install` |
| H-NEW-1 | APK tamper detection | Real release cert CI-injected and exercised on a repackaged APK |
| H10 | Cert pinning | 16 placeholder pins need device-observed SPKI values + MITM-proxy validation |
| G2-ROOTCERT-PIN | Play Integrity root pin | Needs a captured real token from a registered Play Console app |
| iOS App Attest | Entitlement wiring | `DCAppAttestService.isSupported` no-ops |
| C-1 v2→v3 migration | Android KEK salt migration | BLOCKED on-device; unit-tested only |
| C-3 / C-4 | Native H residue, both platforms | Heap dump on a compromised device. **Unchanged by PR #1891** — source-verified and CI-compiled, never run on a device, and the unzeroable `String` copy means a dump would still be expected to yield H |
| H1 / H2 / BIO-01 | Biometric OS-ACL binding (M2c/M2d) | Native plugin + real device |
| weekly H-1 (07-14) | Timing equalisation | Code-correct and **restored on native by #2004**; on-device wall-clock across success/duress/miss still unmeasured. L-9's refutation depends on `hash-wasm` blocking the main thread — that is the same unrun bench |
| 2026-07-20 weekly H-1 | WC session-approval BLOCK | Code-correct; unmeasured on a hooked device |
| iOS RASP gates (#1765) | `earlyCheck` on `enroll`/`getHardwareFactor` | Source-verified only; never exercised on a jailbroken device |
| M13 / M14 | FLAG_SECURE + WebView CDP disable | Unverified on a real release build |
| RASP hostile-device | All "BUILT / INTERNAL" RASP tags | Rooted/jailbroken/Frida session with an on-chain txid |
| Safety Plus IAP | Promotional offers, both stores | **No real purchase has ever completed on either platform** |
| `@scure/bip32` zeroization | Seed/master `.fill(0)` completeness | Whether the `privateKey` getter returns the internal buffer or a copy was **not** verified — package body absent from the checkout |
| Independent audit | Entire KEK + vault-cipher + Shamir + Digital Shield + S1–S4 surface | **Still outstanding** — no internal, ECC-skill, Codex, Gemini, or CodeRabbit pass substitutes |

---

## Regressed 🔴

**Two findings are currently in a regressed state**, both from `46c5faf0` (#1929,
2026-08-21) and both unfixed at this pin — three days open, flagged by two consecutive
daily scans.

| ID | Finding | What broke |
|---|---|---|
| **DIFF-0821-WC-BASE44** | WalletConnect history / address-book / whitelist Base44 queries | `WalletConnectProvider.jsx:623,628,633` gate on `enabled: !isDecoy && !isHidden`, omitting both `isDeniabilityOrDemoActive()` and `isUnlocked` — while the *same file* uses the full predicate correctly at `:663` and `:760`. A panic/stealth transition sets the canonical module-level flag before the React flags update, so the provider can emit backend traffic and request real-wallet metadata inside an I3-protected interval, and can query while locked (grep) |
| **DIFF-0821-PORTFOLIO-BASE44** | `WalletToken.list()` for suspicious-token counts | `WalletPortfolioPage.jsx:622` — `const entityQueryEnabled = !isDecoy && !isHidden;`. Same missing seal, same transition window (grep) |

**These are the D-04 race, realised.** D-04 ("`isDecoy` React state lags the module flag")
has sat on the open list as PLAUSIBLE since 2026-07-05. Two new call sites shipped built
on exactly the lagging value. The fix shape is settled and already applied twice in the
same window — `screenAssetContract` (`tipScreen.js:236`) and `useAnalytics` (`:70`) both
took `isDeniabilityOrDemoActive()`, and #1992's test was rewritten to assert the
*invariant* rather than the current clause. **Three sites were corrected; these two were
not, and nothing links them.**

Both regressions in the previous window (`simulate.js` `willRevert`, `/api/*` CORS
wildcard) remain closed. Historical regressions on record (re-fixed; preserved, not swept
away): the release/debug cert guard (**four** regressions, survived ~15 merges because its
test was gated to `main`-only so no PR could fail on it); telemetry consent; C-1 KEK salt
binding; C-01 RASP pre-sign gate; ECC F-P3-3.

---

## Patterns worth naming, from this window

**1. A closed finding kept alive by a document, and an open finding invisible to one.**
Both directions of the same defect occurred here. C-5 was fixed in code and carried by this
tracker for four audits because the file recording the fix landed after the pin. Meanwhile
the 08-17 weekly's nineteen open findings were absent from the tracker for a week for the
same reason. The previous run **disclosed** the pin and flagged the debt, which is why the
correction is a paragraph and not an incident — but the structural answer is the one that
file already wrote down: *a same-day audit doc can land between the pin and the merge —
check for one before publishing.* This run checked, and found two.

**2. Remediation is outrunning documentation.** Four PRs this window (#2025, #2026, #2028,
#2029) are titled "audit remediation 2026-08-16, rounds 5–7" and fix real HIGH/MEDIUM items
— SecurityAdvisor prompt injection, non-EVM key scrubbing, silent gas-estimation fallback.
**There is no `docs/audit-2026-08-16-*.md`.** The 08-17 weekly raised exactly this as an
INFO ("a reader following the `docs/audit-<date>-*.md` convention will not find it") and it
has since produced at least seven more remediated findings with no findings document. The
fixes are real; the audit trail is a commit-message archaeology exercise. Rounds 1–4 are
not identifiable at all.

**3. The right fix was applied three times and skipped twice, in one window.** Five sites
needed the same one-line change from `isDeniabilitySessionActive()`/`!isDecoy && !isHidden`
to `isDeniabilityOrDemoActive()`. Three got it (`tipScreen.js:236`, `useAnalytics.js:70`,
and #1992's invariant-asserting test); two did not (`WalletConnectProvider.jsx:623-633`,
`WalletPortfolioPage.jsx:622`); one more (`TierProvider.jsx:78`) is the demo-blind variant.
Nothing connects them — each was found by a different scan on a different day. **A fix
pattern that has to be rediscovered per call site is not a fix, it is a habit**, and
CLAUDE.md already names the remedy: the guard belongs inside the egress function, not at
the call site.

**4. A fabricated finding is a distinct failure mode, and only ref-checking caught it.**
The Gemini sweep produced four findings with **every line number wrong** and one item that
does not exist in the codebase at all. The same-run Claude ref-check caught it by running
`grep -rn "@src/" src/hooks/` and getting nothing. Two of the remaining three are real and
worth having. The lesson is not "long-context models hallucinate" — it is that the
sweep was only usable because someone verified the refs **before** it was filed. An
unverified sweep folded into this tracker would have created a permanent phantom row.

**5. Test theater got converted into tripwires rather than deleted.** #2025 turned 13
`test.skip` into `test.fixme('#2021 …')` — which makes Playwright **fail the build if any
of them starts passing** — and 5 `expect(true).toBe(true)` sentinels into tracked
`it.skip`s. That is the same shape as #1418's flag tripwire and #1984's inverted
Firebase test: when you cannot yet assert the real thing, assert the absence and make the
future change loud. Contrast with `SendCrypto.digitalShield.test.js`, a source-string regex
guard that asserted identifiers were *present* in a file and **would not have failed if the
Digital Shield path never reached `evaluateSendGate`** — which is precisely what happened.

**6. A removed feature is a closed finding and a lost verification target simultaneously.**
#2032 deleted Trezor and Ledger, closing a needs-verification row open since July. It also
made Digital Shield the sole hardware path — an integration with strong-reading crypto,
zero device exercise, and no negative tests for session/context drift during the QR
exchange. The verification debt did not go away; it moved and got concentrated.

---

*Automated weekly tracker. Static analysis only — does not substitute for on-device,
on-chain, or live-backend verification. "FIXED" = the code change is present on
`origin/main`; it is not a claim the control is verified working. SQL migrations are
counted as unexecuted text until their own verification queries have been run against the
**live project confirmed from the shipped client bundle**, not from a project name. The
independent third-party audit remains outstanding and is not substituted by any internal,
ECC-skill, second-model (Codex), long-context (Gemini), or third-party-reviewer
(CodeRabbit) pass.*
