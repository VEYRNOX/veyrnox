# Veyrnox Internal Security Audit — 2026-07-28

> **Status:** all 28 findings below landed on `main` on 2026-07-28 via PRs #1435..#1461
> plus #1462 stacked-merged via #1442. See the `2026-07-28 internal audit + fix wave`
> entry in `CLAUDE.md` for the per-finding PR log and owner-action list. SQL migrations
> ship as `.sql` files only — the caller must run them in Supabase, and the RevenueCat
> webhook that H-1 depends on remains a TODO. This pass is INTERNAL (Claude-run) and
> does NOT close the outstanding independent third-party audit.


## 1. Header

- **Date:** 2026-07-28
- **Scope:** Full-stack source review of `origin/main` (head `d2b753c4`, one commit ahead of documented `f1389c91`): JS/TS wallet-core, WalletConnect provider, Supabase RPCs + SQL migrations, Edge Functions, CI workflows, CSP, Android/iOS plugin surface (source only), referral + telemetry pipelines, KEK/vault crypto hygiene.
- **Methodology:** ECC audit patterns (Broken Access Control, Insufficient Cleanup, Missing Idempotency, Sensitive Data Exposure, Rate-Limit Bypass, Documentation Drift, CSP Misconfiguration, Missing Reauth) applied via Veyrnox subagents (`veyrnox-recon`, `veyrnox-security-tdd`, `veyrnox-honest-reviewer`). Each finding adversarially verified against `origin/main` sources with a stated failure scenario and preconditions.
- **Honesty caveat (I4):** This is an **INTERNAL, Claude-run** audit pass. It is NOT the independent third-party audit that gates the mainnet security story. No real-device RASP verification, no native compiled binary review, no live Supabase / RevenueCat / edge-runtime testing was performed. Findings marked "BUILT, not deployed" (e.g. first-referral-bonus) are pre-deployment code review only.

## 2. Executive Summary

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 5 |
| Medium | 11 |
| Low | 10 |
| Info | 1 |
| **Total** | **28** |

**Top 3 risks:**

1. **`FirstRunTour` collapses deniability (Critical).** A modal that names duress/stealth/hardware-protection features by title renders in decoy sessions when a real user armed but never dismissed the tour. Its dismiss handler also writes to shared localStorage from the decoy session — the exact K-2 three-writer pattern CLAUDE.md warns is a recurring trap. Directly breaks I3.
2. **Referral / bonus chain is armed to fire on deployment (High × 3).** `generate_referral_code`, `record_attribution`, and `register_referral_code` collectively let an anon caller mint unlimited codes bound to attacker-chosen `rc_user_id`s, forge paid attributions against any code, and bypass the per-device rate limit by omitting `p_device_id`. Once the first-referral-bonus SQL + Edge Function are deployed, this becomes a self-serve monetary-cost entitlement mint against Veyrnox's RevenueCat account. **Do not deploy those two files until fixed.**
3. **Supply chain + CI honesty theatre (High × 2).** Signing-path crypto packages (`ethers`, `@noble/*`, `@scure/*`, `@reown/walletkit`) carry floating caret ranges in direct violation of the project's own OWASP rule — a grouped Dependabot PR can land a crypto minor with no dedicated review. Separately, `android-e2e-tests.yml` swallows lint/typecheck failures via `|| true` and unconditionally writes a fabricated "8/8 passing" step summary listing suites that never executed (I4 / OWASP A09).

**Verdict:** The mainnet-gate posture holds against direct fund-drain attacks: signing chokepoints still fail closed via `presignGateOrReject` + reauth walls, the vault AAD chain still enforces salt binding, and no finding here recovers seed material without a heap-dump-capable adversary. The material regressions are (a) a deniability breach that undoes the wallet's headline privacy invariant on the very sessions it exists to protect, and (b) a bonus-farming chain that will monetise the moment the pending Supabase deploys land. Neither closes the outstanding independent third-party audit — this pass narrows the target for it, does not substitute for it.

---

## 3. Findings

### CRITICAL

#### C-1 — FirstRunTour renders and mutates shared state in decoy/demo sessions
**File:** `src/components/FirstRunTour.jsx:65-88`, `src/components/WalletEntry.jsx:1202`
**Failure:** A real user creates a wallet → `armTour()` writes `veyrnox-first-run-tour-armed='1'`. User locks before dismissing. Coercer forces duress PIN. Decoy vault mounts; `WalletEntry` renders `<FirstRunTour />` inside `if (isUnlocked && !generatedSeed && !kekGatePending)` with **no** `isDeniabilityOrDemoActive()` guard. `shouldShowTour()` reads the shared localStorage flag → full-screen 5-step modal renders in front of the coercer, with steps literally titled **"Duress PIN — decoy PIN under coercion"**, **"Stealth Wallets — hide wallets"**, **"Hardware Protection"**. A coerced tap on Skip/X/Get-Started then writes `TOUR_SEEN_KEY='1'` and removes `TOUR_ARMED_KEY` — the real user's next unlock never sees their tour again (K-2 pattern).
**Fix:** Two-chokepoint gate matching the `lib/consent.js` pattern established by PR #1410. (a) In `shouldShowTour()` and the WalletEntry render branch, early-return on `isDeniabilityOrDemoActive()`. (b) In `dismiss()`, no-op the `setItem`/`removeItem` when a decoy/demo session is active. Do NOT re-guard at call sites. Regression test: mount `<FirstRunTour />` with a mocked decoy session and `ARMED='1'` pre-set; assert no modal renders and neither key is mutated by tapping through.
**Invariants:** I3 (deniability), I4 (fail-closed), OWASP A01.
**ECC pattern:** Sensitive Data Exposure; Access Control on session boundary.

---

### HIGH

#### H-1 — Referral bonus chain: self-serve entitlement mint (armed on deployment)
**File:** `sql/first-referral-bonus.sql` (funcs at ~L106-172), `sql/api-security-hardening.sql` (`record_attribution`), `supabase/functions/first-referral-bonus/index.ts`
**Failure:** (1) `rpc('generate_referral_code', { p_device_id: random_uuid(), p_rc_user_id: '<attacker_rc>' })` — anon-callable, binds attacker's RevenueCat user id to a fresh code. (2) `rpc('record_attribution', { p_code, p_plan:'monthly', p_revenue_cents:100 })` — anon-callable, inserts a fake "paid" row (no purchase verification). (3) POST `first-referral-bonus` Edge Function with the public anon key → `check_first_referral_bonus` returns attacker's `rc_user_id` → RevenueCat granted free month of `safety_plus`. Loop with fresh UUIDs → unlimited grants. Currently gated only by the two files not yet being deployed to production.
**Fix:** Remove `p_rc_user_id` from `generate_referral_code`/`register_referral_code`; bind referrer identity only from a RevenueCat webhook with verifiable signature. Gate `record_attribution` behind webhook-confirmed revenue. Add anti-self-referral check once identity is trustworthy. Authenticate the Edge Function beyond the anon bearer. **Land all four fixes BEFORE running the SQL migrations or `supabase functions deploy first-referral-bonus`.**
**Invariants:** I5 (backend untrusted), OWASP A01. Violates project rule "anon key authenticates the app, not the user."
**ECC pattern:** Broken Access Control — trusting client-supplied identity.

#### H-2 — `register_referral_code` rate-limit bypass via null device_id
**File:** `sql/first-referral-bonus.sql:175-198` (also `sql/api-security-hardening.sql:299`)
**Failure:** The 3/hour cap sits inside `IF p_device_id IS NOT NULL THEN … END IF;` and `p_device_id` defaults to `NULL`. Anon caller omits it → counter is skipped, `INSERT ... ON CONFLICT` runs unconditionally at network rate. Squats arbitrary new code strings each stamped with attacker's `rc_user_id`, seeding H-1's farming chain.
**Fix:** Move the rate-limit block above the IF; for NULL device apply a per-IP or per-code fallback bucket, or drop the default so `p_device_id` is required. Client already has `lib/deviceId.js` to supply it.
**Invariants:** OWASP A04. Violates project rule "no unthrottled write endpoints."
**ECC pattern:** Rate-limit / idempotency gap.

#### H-3 — `record_attribution` anon-callable, no REVOKE
**File:** `sql/api-security-hardening.sql:217`
**Failure:** SECURITY DEFINER with no `REVOKE` — default PUBLIC EXECUTE. Anon caller with any publicly-shared code posts 2 forged rows per code per hour. Inflates `get_referral_paid_count` (drives UI tier), corrupts `revenue_cents` ledger, and — once first-referral-bonus deploys — trips the EXISTS(referral_attributions) predicate to burn arbitrary referrers' one-time bonus. `check-first-referral-bonus-hardening.sql`'s own "STILL OPEN" section names this as unfixed.
**Fix:** `REVOKE ALL ON FUNCTION public.record_attribution(text,text,int,int) FROM PUBLIC, anon, authenticated;` + service_role GRANT. Route real attributions through a RevenueCat-webhook-signed edge function with device/receipt binding. Apply the same treatment to every function listed in the "STILL OPEN" section.
**Invariants:** I5, OWASP A01.
**ECC pattern:** Broken Access Control — unauthenticated write to sensitive ledger.

#### H-4 — Floating caret ranges on signing-path crypto dependencies
**File:** `package.json` (dependencies block)
**Failure:** `ethers ^6.17.0`, `@noble/curves ^1.9.7`, `@noble/hashes ^1.8.0`, `@scure/bip32 ^2.2.0`, `@scure/bip39 ^1.6.0`, `@scure/btc-signer ^2.2.0`, `@reown/walletkit ^1.5.6` all carry caret ranges — direct violation of CLAUDE.md's "Pin exact versions … no floating ranges for crypto or security-critical packages." `.github/dependabot.yml` runs a weekly grouped `npm-minor-patch` updater; combined with 0-required-approvals on the ruleset, a signing-path minor can land bundled inside a routine grouped PR with no crypto-specific review.
**Fix:** Pin exact versions on the seven listed packages. Add them to a Dependabot `ignore` list or move to a separate group requiring named crypto reviewers via `CODEOWNERS`.
**Invariants:** OWASP A06.
**ECC pattern:** Vulnerable and Outdated Components / unpinned crypto supply chain.

#### H-5 — CI honesty theatre in `android-e2e-tests.yml`
**File:** `.github/workflows/android-e2e-tests.yml:31`
**Failure:** `lint-and-build` runs `npm run lint --if-present || true` and `npm run typecheck --if-present || true` — both swallowed. Follow-up `test-status` job runs no tests but unconditionally writes a `GITHUB_STEP_SUMMARY` asserting "Production-ready test harness deployed / 8/8 passing / LOG-1 canary / I3 zero-egress canaries / Panic PIN …" — a fabricated pass. Not a merge-gate (the ruleset requires `verify`, `mainnet-flag-gate`, `unit-tests`), but reviewers see a green ✅ enumeration of 14 suites that never executed.
**Fix:** Delete `|| true` on lint/typecheck (fail closed). Delete the `test-status` job or replace the ✅ enumeration with an honest scoped statement naming no specific results.
**Invariants:** I4, OWASP A09.
**ECC pattern:** Silent failure suppression / fabricated verification.

---

### MEDIUM

#### M-1 — `deriveBtcAccount` leaks BIP-39 seed + master privateKey to GC
**File:** `src/wallet-core/btc/derivation.js:78` (also `deriveBtcAddress` ~L99)
**Failure:** `const seed = mnemonicToSeed(...)` (64-byte cross-chain seed) and `const root = HDKey.fromMasterSeed(seed)` (master key that reconstructs EVM+BTC+SOL) both fall out of scope with no `.fill(0)`. Called on every send, portfolio fetch, and receive-address render. EVM sibling `deriveEvmAddress` was hardened by PR #1113 with `try/finally` wiping both — never propagated to BTC.
**Fix:** Wrap in `try/finally`, wipe `seed` and `master.privateKey` after `root.derive(path)`. In `deriveBtcAddress` (receive path), additionally wipe the returned leaf `privateKey` before returning `{ address, path }` — that path never needs the private key.
**Invariants:** I1 (hygiene), OWASP A02.
**ECC pattern:** Insufficient cleanup / secrets in memory.

#### M-2 — `deriveSolAccount` / `deriveSolAddress` leak ed25519 scalar + BIP-39 seed
**File:** `src/wallet-core/sol/derivation.js:62`
**Failure:** Same class as M-1. `mnemonicToSeed` + `deriveEd25519(seed, path)` materialise 64-byte BIP-39 seed and 32-byte signing scalar; `deriveSolAddress` destructures only `{ address, path }` and drops `privateKey`/`publicKey` to GC. File's own header comment flags `privateKey` as a LIVE SECRET but the receive path treats it as throwaway. `slip10.js` `masterKey`/`deriveChild` also never wipe the parent HMAC output whose slices share the same underlying buffer.
**Fix:** Split `deriveSolPublicKey` that stops after computing the address (receive path never needs the scalar). Best-effort `.fill(0)` on `seed`, `privateKey`, and the 64-byte HMAC output in `slip10.js`.
**Invariants:** I1, OWASP A02.
**ECC pattern:** Insufficient cleanup.

#### M-3 — `enrollHardwareCredential` silently coerces ambiguous probe failure to destructive path
**File:** `src/wallet-core/keystore/hardware.js:158` (also `useKekEnrollmentGate.js:127`)
**Failure:** `try { vaultWrapped = await opts.isVaultWrapped(); } catch { vaultWrapped = false; }` — a transient `SecureStorage.get` IO error on a genuinely KEK-wrapped vault causes `plugin.clearCredential()` → SE/Keystore key deleted → `plugin.enroll()` mints new H that can never unwrap the existing `kekWrap`. Vault permanently unopenable via KEK; user forced onto seed-phrase recovery.
**Fix:** Default `vaultWrapped = true` on catch → safe `HARDWARE_KEK_ALREADY_ENROLLED` throw. Apply to both this file and `useKekEnrollmentGate.js` so the last-line defender fails closed regardless of the upstream gate.
**Invariants:** I4, OWASP A10.
**ECC pattern:** try/catch around crypto silently swallowed then proceeds with destructive action.

#### M-4 — WalletConnect proposal modal fetches attacker-controlled icon URL pre-consent
**File:** `src/components/walletconnect/SessionProposalModal.jsx:108` (also `ActiveSessions.jsx:50`)
**Failure:** `<img src={meta.icons[0]} …>` renders directly from dApp-supplied `proposer.metadata.icons` — no scheme/host allowlist. `WalletConnect.jsx:150` auto-surfaces the first pending proposal, so the WebView issues GET to `https://tracker.attacker.tld/beacon?...` on mount, **before** any Approve/Reject. Attacker gets an approval-oracle beacon + IP + UA + timing fingerprint + per-attempt correlator. CSP `img-src 'self' data: https:` does not gate this. Flagged-dApp banner renders after the fetch has already fired.
**Fix:** Restrict `meta.icons` to https-only, host-allowlisted (or same-origin proxied / data-URI-only). Or render a neutral placeholder until the user taps Approve. Add `referrerPolicy="no-referrer"` and `crossOrigin="anonymous"`. Regression test: no network fetch on modal mount for unknown-host icon.
**Invariants:** I2 (no silent egress), OWASP A08 / SSRF-adjacent.
**ECC pattern:** External fetch of untrusted URL.

#### M-5 — Typed-data pre-sign gate ignores `assetAuthorising` risk level
**File:** `src/lib/WalletConnectProvider.jsx:436`
**Failure:** `_handleSignTypedData` calls `presignGateOrReject()` with default `LEVEL.OK`; `typedDataMeta.assetAuthorising` (ERC-2612 permit / Permit2 detection) never feeds `txLevel`. `_handleSendTransaction` correctly composes `txLevel = await scoreWcTxLevel(...)`. A MAX_UINT256 permit signature is gated only by an in-modal `permitAcknowledged` checkbox — which the file itself flags on `personal_sign` as "not authoritative; the modal can be bypassed."
**Fix:** Compose a typed-data risk level (escalate to CONFIRM/BLOCK when `assetAuthorising` indicates unlimited/large permit) and pass into `presignGateOrReject`. Mirror PR #1093 for `eth_sendTransaction`.
**Invariants:** I4, OWASP A04.
**ECC pattern:** Missing server-side authorization check / asymmetric risk gating.

#### M-6 — `generate_referral_code` per-device idempotency trivially bypassed
**File:** `sql/first-referral-bonus.sql:~118-172`
**Failure:** "One code per device" enforced only by SELECT-then-INSERT keyed on caller-supplied `p_device_id`. Fresh UUID per call = fresh code, no rate limit beyond the 10-attempt uniqueness loop. Enables unbounded referrals-table growth (storage DoS), code-namespace pressure against 32^6, and pre-seeding attacker `rc_user_id`s to hijack any legitimate purchaser who lands on a seeded code.
**Fix:** Add per-IP/window rate-limit table for anonymous callers, or a global codes-per-hour bucket, or move to session-bound identity.
**Invariants:** OWASP A04.
**ECC pattern:** Trusted client identifier.

#### M-7 — `track_event` rate limit bypassed by rotating device_id
**File:** `sql/api-security-hardening.sql:56`
**Failure:** Rate-limit predicate `WHERE device_id = p_device_id AND created_at > now() - interval '1 hour'` (threshold 60). `p_device_id` is caller-supplied with no server-side derivation. Rotating `crypto.randomUUID()` resets counter to 0 each call → unbounded INSERTs into `events`. 4 KB metadata cap + 11-item event allowlist bound per-row abuse but not aggregate volume. Storage DoS + funnel-metric pollution.
**Fix:** Add second bucket keyed on `request.headers->>'x-forwarded-for'` (hashed IP fallback) with e.g. 600/hour/IP. Add global-per-hour ceiling as belt-and-braces.
**Invariants:** OWASP A04.
**ECC pattern:** Rate-limit bypass — client-supplied key.

#### M-8 — First-referral-bonus Edge Function not idempotent on RC 5xx
**File:** `supabase/functions/first-referral-bonus/index.ts:207-218`
**Failure:** On any non-2xx from RevenueCat (including 5xx where `/promotional` has already applied internally), code unconditionally executes `update referrals set first_bonus_granted_at = null` — un-claiming the bonus. No `Idempotency-Key` sent on RC POST. Client auto-retry within the 5/hour/code window → second RC grant. Referrer accumulates N free months for a one-time bonus. Bounded to ≤5 grants/hour/code.
**Fix:** (a) Send stable `Idempotency-Key` derived from `referral_code + granted_at` timestamp. (b) Do NOT rollback on ambiguous-success — distinguish 4xx (safe to release) from 5xx/timeouts (leave claim in place, alert). (c) If rollback retained, record attempts in separate audit table so the same code cannot re-invoke RC until prior attempt resolved.
**Invariants:** OWASP A04. Adjacent to I4 (rollback silently converts ambiguous-success into re-grantable state).
**ECC pattern:** Missing idempotency on external side-effect.

#### M-9 — `bundle-trezor-connect.mjs` redirect handler has no scheme/host allowlist
**File:** `scripts/bundle-trezor-connect.mjs:49`
**Failure:** `fetchUrl` recursively follows any 301/302 `Location` with no host allowlist, no depth cap, no scheme check beyond what `https.get` inherently enforces. A rogue/misconfigured Trezor CDN redirect (or an infinite-loop response) can retarget the build-time download to any https origin. Paired with the absence of SRI/hash verification (finding-adjacent), a poisoned `iframe.html` reaches `public/trezor-connect/` and ships. `main().catch(){ process.exit(0) }` silently swallows redirect-loop DoS as a successful build.
**Fix:** Parse `res.headers.location`, resolve against current URL, require `protocol === 'https:'` AND `host === 'connect.trezor.io'`. Cap redirects at 3. Pair with SRI/sha256 verification against a pinned manifest. Replace `process.exit(0)` swallow with fail-closed exit on integrity failure.
**Invariants:** I5, OWASP A10.
**ECC pattern:** Open-redirect following / SSRF-adjacent.

#### M-10 — CSP `img-src https:` is a wildcard on state-fetching sink
**File:** `index.html:27`
**Failure:** `img-src 'self' data: https:` grants any HTTPS origin. Untrusted-URL sinks exist at `SessionProposalModal.jsx:108`, `ActiveSessions.jsx:50`, `CryptoNewsFeed.jsx:68` — each renders attacker-influenced strings into `<img src>` without host validation. Breaks least-privilege parity with the strict `connect-src` allowlist that the file's own comment cites as the anti-exfiltration control. No script-execution path (blocked by `script-src 'self' 'wasm-unsafe-eval'`), so exploitation still requires a URL-construction bug to smuggle bytes — this is defense-in-depth hardening.
**Fix:** Tighten `img-src` to `'self' data: https://*.walletconnect.com https://*.rss2json.com` (or the specific CDN hosts actually needed) and/or add per-call-site hostname allowlists before render.
**Invariants:** I2, OWASP A05.
**ECC pattern:** CSP wildcard undermines defense-in-depth.

#### M-11 — `SessionProposalModal` icon fetch (duplicate of M-4, filed against CSP surface)
Consolidated with M-4; retained as separate finding in the input because it maps to the client-xss-csp surface rather than walletconnect. Same fix applies — the root cause is unvalidated icon URL, not CSP alone.

---

### LOW

#### L-1 — `credentialVerifier.deriveRaw` skips try/finally zeroization of PIN bytes
**File:** `src/wallet-core/credentialVerifier.js:21`
**Failure:** `enc.encode(String(credential).normalize('NFKC'))` → `pw` Uint8Array of PIN plaintext bytes → argon2id → discarded without `.fill(0)`. `vault.js deriveKey` wraps the identical call in `try/finally { zero(pw) }`. Module's own comment claims it "mirrors wallet-core/vault.js deriveKey" — the omission is a documented-invariant break. Called on every send-time step-up reauth.
**Fix:** Extract `enc.encode(...)` into local `pw`; wrap argon2id call in `try/finally { pw.fill(0) }`.
**Invariants:** I1, OWASP A02.
**ECC pattern:** Insufficient cleanup.

#### L-2 — `saveVaultContents` decodes kekSalt outside try/finally
**File:** `src/wallet-core/keystore/native.js:764` (also `_unlockInner:~335`, `upgradeKekToV3:~670`)
**Failure:** `saltBytes = decodeKekSalt(...)` runs, then `await getHardwareFactorWithLockoutFallback(...)` awaited BEFORE entering the try/finally that wipes it. A throw from `getHF` (biometric cancel, lockout, bridge failure) leaves per-enrollment `kekSalt` bytes lingering in JS heap until GC. Web `enrollKek` was hardened via issue #724; this native path was not.
**Fix:** Move `decodeKekSalt` and any throwable await INSIDE the try block. Apply identical fix at the two analogous sites.
**Invariants:** I4 defense-in-depth (M-1 pattern).
**ECC pattern:** Zero all key material on every path.

#### L-3 — `PlayIntegrityPlugin.verifyJwsSignature` docstring drift
**File:** `android/app/src/main/java/com/veyrnox/app/PlayIntegrityPlugin.kt:214`
**Failure:** KDoc still describes pre-#1097 behaviour ("Assert the root cert issuer contains 'Google' — weak, pending full pinning" + "HONEST LIMITATION: an attacker who can forge a Google-issuer self-signed root can still pass"). Body is now a one-line delegate to hardened `PlayIntegrityJwsVerifier`. No live exploit, but a maintainer performing cleanup could re-inline the described bypass matching the file's own spec. Same latent-regression shape as the debug-cert guard series (#1310→#1313→#1325→#1338→#1386/#1391).
**Fix:** Replace stale block with two-line pointer to `PlayIntegrityJwsVerifier` KDoc (single source of truth). Add JVM unit test in `PlayIntegrityJwsVerifierTest` constructing a chain with issuer CN "Google" but non-pinned SHA-256 → assert `verify()` returns false. Converts doc contract into executable tripwire.
**Invariants:** I4, OWASP A05.
**ECC pattern:** Documentation drift.

#### L-4 — WC `handleApproveSession` omits `isSendReauthRequired`
**File:** `src/lib/WalletConnectProvider.jsx:771`
**Failure:** RASP presign gate runs but reauth-freshness check is missing, while all three signing chokepoints enforce it with H-NEW-B comments. During the ~2-minute `lastAuth` window an attacker with brief device access can approve a session, disclosing EVM address across `SUPPORTED_CHAIN_IDS` to a chosen dApp and establishing a session valid up to 7 days. Signing is still blocked later — no direct fund loss — but pairing, metadata leak, and latent signing capability persist until victim next authenticates.
**Fix:** After the presign block, add `if (isSendReauthRequired()) throw new Error('Step-up re-auth required — unlock again to approve this connection');`. Add `isSendReauthRequired` to `useCallback` deps. Apply same fix to `SessionProposalModal.jsx:52`.
**Invariants:** I4, OWASP A07. Codified as required by CLAUDE.md Authentication section.
**ECC pattern:** Missing reauth on sensitive action.

#### L-5 — `rejectRequest` discards caller-supplied reason
**File:** `src/wallet-core/evm/walletconnect/session.js:254`
**Failure:** `rejectRequest(topic, id, _reason)` — underscore-prefixed param never referenced. Always sends generic `USER_REJECTED`. 15+ call sites pass distinct codes (RASP_BLOCK, TX_RISK_REJECTED, SEND_ADDRESS_MISMATCH, CHAIN_ID_MISMATCH, SESSION_EXPIRED, STEP_UP_REQUIRED, WC_SEND_LIMIT_EXCEEDED, WC_TWO_FACTOR_REQUIRED, PERSONAL_SIGN_ADDRESS_MISMATCH, …); each wraps in `.catch(() => {})`. Incident responders cannot distinguish coercion/tamper from user cancellation.
**Fix:** Map `_reason` to `getSdkError` where a WC code exists; use `{code, message}` envelope elsewhere. Emit structured audit event (respecting I3 suppression) with `{topic, id, reason}` before responding.
**Invariants:** OWASP A09.
**ECC pattern:** Insufficient logging of security decision.

#### L-6 — WC `_scheduleProposalExpiry` is dead code
**File:** `src/wallet-core/evm/walletconnect/session.js:59`
**Failure:** `_scheduleProposalExpiry` defined but never invoked. `_storeProposal` sets pending entry with no timer; `_proposalTimers` always empty. Audit-H9 comment claims SDK-expiry-aware per-proposal TTL is enforced — it is not. Eviction relies on lazy `cleanupExpiredProposals()` inside `session_proposal` and `approveSession`, which uses flat 5-min `PROPOSAL_TTL_MS`. SDK-supplied shorter expiries not honoured; approvable up to (5min − SDK expiry) past true window.
**Fix:** Call `_scheduleProposalExpiry(proposal.id, proposal.params?.expiryTimestamp)` from `_storeProposal`; store handle in `_proposalTimers`.
**Invariants:** OWASP A05.
**ECC pattern:** Dead security code.

#### L-7 — `finalisePinRestore` accepts any non-empty string
**File:** `src/wallet-core/vaultBackup.js:482`
**Failure:** Rejects only non-strings and empty strings; JSDoc says "credential-agnostic: accepts any non-empty string (UI enforces the 8-digit PIN)". Symmetric `createBackupEnvelope` enforces `/^\d{8,12}$/`. No current abusable caller today — asymmetric contract at trust boundary is a defense-in-depth defect.
**Fix:** Add `if (!/^\d{8,12}$/.test(devicePin)) throw new Error('Device PIN must be 8-12 digits');`. Delete the "credential-agnostic" JSDoc line.
**Invariants:** OWASP A07, H-A password-minimum invariant.
**ECC pattern:** Client-side-only validation.

#### L-8 — `record_attribution` no idempotency key
**File:** `sql/api-security-hardening.sql:251`
**Failure:** Retries produce duplicate rows (2/hour cap is a ceiling, not dedup). `get_referral_paid_count` / `get_referral_earnings` do bare COUNT/SELECT with no DISTINCT — duplicates counted. Once first-referral-bonus deploys, satisfies EXISTS() predicate from duplicates. Chained with M-6 across N codes for arbitrary inflation.
**Fix:** Add `idempotency_key text` argument with UNIQUE index, or UNIQUE partial index on `(referral_code, plan, revenue_cents, date_trunc('hour', created_at))` as interim. Add DISTINCT / dedup CTE in `get_referral_paid_count`. Verify deployed `check_first_referral_bonus` uses atomic single-grant claim (`INSERT ... ON CONFLICT` on `bonus_claims`) rather than EXISTS().
**Invariants:** OWASP A04.
**ECC pattern:** Missing idempotency.

#### L-9 — Edge Function CORS allows `http://localhost`
**File:** `supabase/functions/first-referral-bonus/index.ts:92`
**Failure:** `DEFAULT_ALLOWED_ORIGINS` includes `http://localhost`. Bounded — `Set.has` is exact-string match so only port-80 pages match (`http://localhost:5173` does not). Impact is DoS of the bonus-attempt rate-limit for known codes, not entitlement theft (anon key already lets curl do same).
**Fix:** Drop `http://localhost` from `DEFAULT_ALLOWED_ORIGINS`. Retain `https://localhost` (Android Capacitor) and `capacitor://localhost` (iOS Capacitor) — documented native-webview origins.
**Invariants:** OWASP A05. Violates project "no wildcard on write endpoints" rule.
**ECC pattern:** Overly permissive CORS.

#### L-10 — Bonus-claim rate limit single-dimensional
**File:** `supabase/functions/first-referral-bonus/index.ts:158` (`sql/bonus-claim-rate-limit.sql`)
**Failure:** `record_bonus_claim_attempt(p_code)` keyed solely on code (PK), 5/hour. Referral codes are shared publicly (marketing). Attacker submits code 5×/hour → legitimate referee gets `rate_limited` (429) → bonus deferred (not consumed — `check_first_referral_bonus` is atomic and only fires on allow=true). Availability degradation, not entitlement loss. Realistic for targeted single code; degrades at scale.
**Fix:** Add second dimension keyed on caller IP (`req.headers.get('x-forwarded-for')`) or on client-supplied opaque device id. Combine with per-code counter (independent limits or min of both). Keep per-code cap for the "flood one code from many IPs" case.
**Invariants:** OWASP A04.
**ECC pattern:** Single-dimension rate-limit enabling targeted DoS.

---

### INFO

#### I-1 — kek-dek AAD excludes `kekWrap` / `kekSalt` / `hardwareKekVersion`
**File:** `src/wallet-core/vault.js:275`
**Failure:** Documented residual #1111. `vaultAad` for kek-dek blobs binds only `{v, kdf:'kek-dek'}`. In-place swap of these fields causes `unwrapDek` failure (DoS, not disclosure). Fix requires deferred v:2→v:3 migration atomically bumping `VAULT_VERSION` and rebuilding `vaultAad` — cannot be incremental without re-authenticating every existing kek-dek blob. Salt-binding chain (v3 kekSalt → combineKek → KEK → wrapDek) currently enforces kekVersion out-of-band as compensating control.
**Fix:** Ship the planned v:3 migration. Tag as accepted-residual, not oversight.
**Invariants:** I4 defense-in-depth.
**ECC pattern:** Partial AAD coverage on AEAD header.

---

## 4. Coverage Notes

**Surfaces scanned (source):**
- JS/TS wallet-core: seed/key derivation (BTC, EVM, SOL), vault AEAD + KDF, credential verifier, KEK enroll paths (web + native), backup/restore.
- WalletConnect: session proposal/approval, request routing, presign gate, address/chain binding, typed-data and personal-sign paths.
- Supabase SQL: all 12 migrations + RPC definitions + hardening layers.
- Supabase Edge Functions: `first-referral-bonus`.
- CI: `.github/workflows/*.yml`, ruleset context per CLAUDE.md.
- Client CSP + XSS sinks (React `<img>` sources rendering untrusted URLs).
- Build-time supply chain: `package.json` pins, `scripts/bundle-trezor-connect.mjs`.
- RASP native source (Kotlin `PlayIntegrityPlugin` docstring vs implementation).

**Surfaces NOT covered:**
- **Native runtime behaviour.** Kotlin/Swift plugins were reviewed by source only; no compiled-binary review, no real-device RASP verification (Magisk/palera1n), no Frida-gadget or hooking evasion testing.
- **Live deployed backend.** No live Supabase RLS enumeration, no PostgREST introspection, no Edge Function runtime testing against real RevenueCat. All SQL/Edge findings are pre-deployment source review.
- **Third-party dependency deep review.** No CVE audit of ethers, @noble/@scure, @reown/walletkit, Capacitor plugins, or transitive graph. H-4 covers pinning discipline; it does not audit what is pinned.
- **iOS Secure Enclave / Android StrongBox key attestation** end-to-end verification against Apple/Google roots on real devices.
- **Network hardening under attack.** No cert-pinning bypass testing, no WalletConnect relay MITM, no BGP/DNS scenario testing.
- **KEK migration surface** — kek-dek v:2 → v:3 migration plan (issue #1111) reviewed as residual only; not implemented.
- **Referral / bonus chain runtime.** Edge Function and bonus SQL are BUILT, not deployed. Findings H-1/H-2/H-3/H-8/M-6/M-8/L-8/L-9/L-10 are pre-deployment; runtime behaviour under load, RevenueCat retry semantics, and Supabase quota exhaustion untested.
- **Fuzz / property testing** of gate composition (RASP × reauth × session-live × chain × address × 2FA × spend-limit) across the WalletConnect chokepoints.

## 5. Recommendation

The outstanding **independent third-party audit** — noted in CLAUDE.md as required across the full S1–S4 + crypto + KEK + RASP stack — is not satisfied by this pass and must still be commissioned. Specifically, the third-party audit should:

1. **Perform real-device RASP verification** on Magisk-rooted Android and palera1n-jailbroken iOS across Play Integrity, App Attest, Frida/Xposed detection, and the native early-RASP path (`android/app/src/main/cpp/rasp_early.c`). All current DEVICE-VERIFIED tags are INTERNAL only.
2. **Verify the hardware KEK end-to-end** against Secure Enclave (iOS) and StrongBox/TEE (Android) with vendor attestation chains, including the salt-binding chain (v3 kekSalt → combineKek) and the M-3 destructive-branch pattern.
3. **Runtime-test the referral + bonus pipeline** against live Supabase and RevenueCat once H-1/H-2/H-3 are remediated and the Edge Function deploys. Confirm the atomic single-grant claim actually prevents double-grants under RC 5xx and idempotency-key collision scenarios.
4. **Compile and review native binaries** — the Kotlin/Swift source review here does not verify what actually ships to Play/App Store. Match `BuildConfig.RELEASE_CERT_SHA256` against Google's app-signing cert on an installed APK, verify the debug-cert guard fires on a real regression, and confirm CI's release-guard test set matches the deployed APK.
5. **Perform an independent dependency and supply-chain audit** of the pinned versions once H-4 is remediated: CVE state of ethers/@noble/@scure/@reown/walletkit + transitive graph, plus Capacitor plugin permissions and native code surface.
6. **Fuzz the WalletConnect gate composition** — with RASP × reauth × session-live × chain-binding × address-binding × 2FA × spend-limit × typed-data risk (M-5) all interacting, symbolic testing beyond hand-review is warranted.
7. **Review the v:2 → v:3 vault AAD migration plan** (issue #1111 / finding I-1) before it ships — atomic re-authentication of every kek-dek blob is a one-shot risk that source review cannot verify.

This internal pass narrows the target and remediates known-bad patterns; it does not clear the mainnet security bar on its own. Do not present it as "independent" externally (I4).