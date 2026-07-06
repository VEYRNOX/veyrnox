# UAT checklist — Web Phase 1 (WebAuthn PRF KEK)

**Drafted:** 2026-07-06 (scope document — no UAT has been executed against it yet)
**Closes (if all pass + txid):** the Phase 1 "🟡 UAT-PENDING" caveat in
`docs/Feature-Status.md` §4. Code under test: `src/wallet-core/keystore/web.js`,
`src/components/security/HardwareKekSettings.jsx`, `src/lib/WalletProvider.jsx`.

**Exit bar (verify, don't assert):** Phase 1 moves from UAT-PENDING only when a real
Sepolia send from a PRF-enrolled web vault confirms on a block explorer with a txid the
owner supplies, AND every fail-closed item below behaved as specified. Green checklists
without the txid = still BUILT, not UAT-confirmed. All results remain INTERNAL evidence.

## Browser matrix

| Browser | Platform authenticator | Expected path | Session |
|---|---|---|---|
| Chrome ≥99 (Windows) | Windows Hello | Full PRF enrollment + unlock + **txid** | Primary — full checklist |
| Firefox ≥108 (Windows) | Windows Hello | Full PRF enrollment + unlock | Core subset (B, C, D1–D3) |
| Safari (iPhone 17 Pro Max or Mac) | — | Honest password-only fallback, ≥12 chars | Fallback section (F) |
| Chrome private window | Windows Hello | Credential-loss behavior | D4 only |

## A. Environment prep (per browser, fresh profile)

- [ ] Production-equivalent build (`npm run build` + preview server), NOT the dev server —
      the mainnet gate and dead-code elimination must match what ships.
- [ ] **Demo trap cleared:** visit `/?demo=0`, confirm `veyrnox-demo` is absent from
      localStorage, fresh wallet shows 0.0 on-chain balances and no demo simulation box.
- [ ] Clean state: no `veyrnox-prf-cred-id` in localStorage, no existing vault.
- [ ] DevTools open with Network + Console tabs recording for the whole session
      (I2 evidence: no unexpected egress; no key material in console).
- [ ] Note browser exact version, OS build, and authenticator type (Windows Hello
      PIN vs fingerprint vs face) — PRF support varies by authenticator, not just browser.

## B. Capability detection honesty (before any vault exists)

- [ ] Chrome/Firefox: Settings → Security shows the WebAuthn enrollment offer
      (structural probe passed).
- [ ] The UI at this stage makes NO "hardware protected" claim — the structural probe
      (`isSecureHardwareAvailable`, `web.js:262`) does not confirm PRF; only a real
      `getHardwareFactor()` round-trip does. Any pre-enrollment badge stronger than
      "available to try" is an H14-class honesty bug — record it.

## C. Enrollment (Chrome primary)

- [ ] Create vault. Password `<12` chars is REJECTED with `WEB_VAULT_PASSWORD_TOO_SHORT`
      before any ciphertext is written (H-A; `ALLOW_MAINNET = true` build). Password
      ≥12 chars succeeds.
- [ ] Enroll KEK in Settings → Security: Windows Hello prompt appears (passkey
      creation with PRF extension), then a SECOND assertion may follow (PRF eval via
      `get()` — the create-then-confirm flow).
- [ ] After enrollment: badge reads **WebAuthn Protected** (tierBadge/H-1 — never
      "StrongBox"/"Hardware" wording on web).
- [ ] `veyrnox-prf-cred-id` now present in localStorage (persisted ONLY after a
      non-null PRF output — F-05).
- [ ] Vault blob (DevTools → storage) shows `kdf: 'kek-dek'`, `kekWrap` present,
      `kekSalt` 44 chars. Record salt length, NOT the salt/wrap values.
- [ ] **Double-enroll rejected:** triggering enroll again fails with
      `KEK_ALREADY_ENROLLED` (F-02) and the vault blob is byte-identical after.
- [ ] Network tab: ZERO requests during the entire enrollment (WebAuthn is local; I2).

## D. Unlock + fail-closed paths (Chrome primary)

1. - [ ] **Happy path:** lock → unlock requires password AND a Windows Hello assertion;
         seed recovered. Record wall-clock unlock time (KDF latency datapoint — the
         192 MiB Argon2id C-factor applies on web; see PR #604 caveat 4: web unmeasured).
2. - [ ] **Wrong password:** correct biometric + wrong password → unlock FAILS
         (`KEK_ERR.UNWRAP_FAILED` surfaced as the standard error). No partial state.
3. - [ ] **Cancelled assertion:** correct password + cancel the Windows Hello prompt →
         unlock FAILS. There must be NO fallback to bare-password unlock on a
         KEK-enrolled vault (I4 — this is the offline-seizure control itself).
4. - [ ] **Credential loss (private window or after clearing the key):** delete
         `veyrnox-prf-cred-id` from localStorage, attempt unlock →
         `PRF_CREDENTIAL_LOST: … Recover via seed phrase.` It must NOT silently create
         a fresh credential and "unlock" (that would derive a DIFFERENT H — the error
         is the honest path; `web.js:335-349`). Confirm the UI surfaces a
         seed-recovery route, not a dead end.
5. - [ ] **Recovery route:** from state D4, recover via seed phrase import → new vault
         usable. (This is the documented recovery for lost credentials — it must work.)

## E. Lifecycle: change password, unenroll, re-enroll (Chrome)

- [ ] `changePassword` on the enrolled vault: requires assertion, succeeds, unlock
      works with the new password + assertion, old password fails.
- [ ] Unenroll: requires password + assertion; vault reverts to bare Argon2id;
      `veyrnox-prf-cred-id` removed from localStorage (`web.js:558-563`); unlock now
      needs password only.
- [ ] Re-enroll after unenroll: creates a FRESH credential (new id value) and a fresh
      `kekSalt` (record: differs from the first enrollment's length-44 value).

## F. Safari honest fallback (iPhone Safari or Mac)

- [ ] No WebAuthn-PRF enrollment is offered, OR enrollment attempt fails with the
      honest message ("…not supported on this browser. Use a strong password (≥12
      characters) instead.") — no crash, no fake success.
- [ ] **F-05 orphan check:** after a failed attempt, no `veyrnox-prf-cred-id` in
      localStorage and no orphan passkey in the OS passkey manager.
- [ ] UI never shows "WebAuthn Protected"/hardware wording for this vault.
- [ ] Password-only vault with ≥12-char password works end-to-end (create, lock,
      unlock). Record unlock latency — Safari-fallback users pay the full 192 MiB
      KDF on every unlock (open caveat 1 from PR #604).

## G. Firefox pass (core subset)

- [ ] Run sections B, C (skip double-enroll), D1–D3. Known risk: Firefox PRF support
      depends on the authenticator; if `getHardwareFactor` throws despite Firefox ≥108,
      that is a FINDING for the supported-browser matrix in Feature-Status §4, not a
      skip — record exact version + authenticator.

## H. Final gate — on-chain evidence (Chrome, then optionally Firefox)

- [ ] From the PRF-enrolled vault: full UI-path Sepolia ETH send (step-up/re-auth
      gates included). Confirm on a block explorer; the OWNER records the txid.
- [ ] The unlock immediately preceding the send used BOTH factors (assertion prompt
      observed) — note the time correlation in the session log.
- [ ] Console/Network sweep for the whole session: no seed, H, KEK, DEK, or PRF
      output in console logs or in any network request payload.

## Out of scope (tracked separately — do not fold in)

- **M-K passkey signCount clone detection** (`src/lib/passkey.js`): needs a cloned
  soft authenticator; separate session.
- **Native platform fence** (`WEB_KEYSTORE_WRONG_PLATFORM`): native-device test, already
  unit-fenced (26/26); not exercisable in a desktop browser.
- **Independent audit:** unaffected by any UAT result.

## Recording rules

Evidence pack per browser: version/OS/authenticator, timestamped checklist with
PASS/FAIL per item, unlock latency numbers, the txid (owner-supplied), console/network
sweep result. Update `docs/Feature-Status.md` §4 Phase 1 row and the browser table;
failures become dated findings, not silent checklist edits. Status language after a
full pass: "BUILT, browser-UAT-confirmed (INTERNAL) with on-chain txid" — the
independent-audit line stays open.
