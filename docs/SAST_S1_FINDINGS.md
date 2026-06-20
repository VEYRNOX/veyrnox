# SAST — S1 / Passkey Unlock Gate (PR #38)

**Scope:** the new/changed auth-flow code from PR #38 (`feat(S1/passkeys)`, commit `0d534a7`) only — *not* the whole repo (that was PR #32).

**Reviewed files**
- `src/lib/passkey.js` (new)
- `src/lib/WalletProvider.jsx` — `runPasskeyGate`, `passkeyPreview`, the passkey prompt state, and the `unlock()` gate wiring
- `src/components/security/PasskeyUnlockSettings.jsx` (new)
- `src/components/security/PasskeyPrompt.jsx` (new)
- `src/components/QuickLock.jsx` (rewritten)
- `src/lib/__tests__/passkey.test.js`, `src/lib/__tests__/passkey-demo.test.js`
- Adjacent S1 surface: `src/lib/biometric.js`, `src/lib/session.js`, and the keystore unlock path they touch (`src/wallet-core/keystore/web.js`)

**Mode:** REVIEW + REPORT ONLY. No application code was changed. This document is the only deliverable.

**Honesty note:** this is auth-flow code largely authored inside this project. The findings below apply deliberate extra skepticism to the self-authored gate logic and to the confident invariant comments in `passkey.js`. Findings that touch the auth-gate decision are explicitly tagged **⚠ REQUIRES INDEPENDENT AUDIT** — self-review of self-authored auth code is the deepest blind spot, and PR #32 already showed three issues slipped past the author's own prior comments.

---

## Summary & counts

| Severity | Tool findings | Manual findings | Total |
|----------|---------------|-----------------|-------|
| Critical | 0 | 0 | 0 |
| High     | 0 | 0 | 0 |
| Medium   | 0 | 3 | 3 |
| Low      | 0 | 2 | 2 |
| Info     | 0 | 2 | 2 |
| **Total**| **0** | **7** | **7** |

- **semgrep** (`p/security-audit`, `p/javascript`, `p/react`, `p/secrets`, `p/owasp-top-ten`): **0 findings** across the 13 in-scope files.
- **gitleaks** (PR #38 commit + scope-file no-git scan): **0 leaks**.
- **npm audit:** **N/A** — PR #38 changed no dependencies (`package.json` / `package-lock.json` untouched between `353b365..0d534a7`). No new passkey libraries were added; the code uses the platform `navigator.credentials` API directly.

**Most serious findings:** all three Mediums are auth-gate logic and all require independent audit — (M-1) `QuickLock` fails **OPEN** on any non-`NotAllowedError`; (M-2) the main `runPasskeyGate` fails **OPEN** (silently skips the second factor) when no platform authenticator is reported available; (M-3) the dual sharp edge — when the authenticator is present but the specific credential is gone, `unlock()` gates fail **CLOSED forever** with no password-only escape hatch in the UI, contradicting the "the password path always works" invariant.

**Bypass / fail-open headline:** The *vault* unlock cannot be opened without the password — the password gate (`keyStore.unlock`) is independent and always runs after the passkey gate, so no finding here grants vault access without the password. But the *passkey second factor itself* is bypassable/skippable in several ways (M-1, M-2, L-1), and is simultaneously over-strict in the lost-credential case (M-3). See the dedicated analysis section.

---

## Tool findings

**None.** semgrep, gitleaks, and (N/A) npm audit produced nothing on the S1 scope. This is expected: the module is small, uses the platform WebAuthn API directly, stores no secrets, and contains no injection/eval/dynamic-require sinks. The real risk in this surface is *logic*, which static tools do not model — see the manual findings.

---

## Manual findings

### M-1 — `QuickLock` fails OPEN on any non-`NotAllowedError` ⚠ REQUIRES INDEPENDENT AUDIT
- **Severity:** Medium *(mitigated: this screen lock protects no secret — see below)*
- **Location:** `src/components/QuickLock.jsx:27-34`
- **What:** The dashboard screen-lock runs `verifyPasskeyAssertion()` and, in `catch`, only treats `NotAllowedError` as a failure. **Every other error path calls `onUnlock()`** — unlocking the screen:
  ```js
  } catch (err) {
    if (err?.name === "NotAllowedError") { setError(...); }
    else { onUnlock(); }   // fail OPEN on AbortError, InvalidStateError, SecurityError, a thrown bug, etc.
  }
  ```
  Because `isWebAuthnSupported()` is already checked *before* calling `verifyPasskeyAssertion()`, reaching the `catch` means WebAuthn *is* supported, so the `else` branch primarily swallows genuine assertion errors (authenticator error, unexpected exception) and unlocks anyway.
- **Why it matters:** This is a textbook auth fail-open. The UI tells the user "Authenticate with Face ID, Touch ID, or your device PIN to view your balances," implying the lock gates balance visibility. An attacker (or a flaky authenticator) that produces any non-`NotAllowedError` bypasses it.
- **Mitigating context (be honest):** `QuickLock` is a *soft screen blur over an already-decrypted vault* ("the vault is already decrypted here … holds/derives no key material"). It protects no secret at the crypto layer, so real-world impact is low. The concern is the gap between the protection the UI advertises and what the code enforces.
- **Suggested fix (do not implement):** Treat *all* errors as failure once `isWebAuthnSupported()` is true; only the genuinely-unsupported case (which is already gated out before the call) should pass through. Distinguish "unsupported platform" (allow) from "assertion failed" (deny) explicitly rather than via the error-name `else`.

### M-2 — `runPasskeyGate` fails OPEN when no platform authenticator is "available" ⚠ REQUIRES INDEPENDENT AUDIT
- **Severity:** Medium
- **Location:** `src/lib/WalletProvider.jsx:202-213` (`runPasskeyGate`); availability comes from `getPasskeyStatus()` → `isUserVerifyingPlatformAuthenticatorAvailable()` in `src/lib/passkey.js:177-185`
- **What:** The real-web branch only calls `verifyPasskeyAssertion()` `if (status.available)`. When `status.available` is `false`, the gate **returns and unlock proceeds with the password alone** — the configured second factor is silently dropped:
  ```js
  if (status.available) { await verifyPasskeyAssertion(); }
  // else: no prompt, gate skipped, unlock continues
  ```
  `available` is derived from `isUserVerifyingPlatformAuthenticatorAvailable()`, which returns `false` if the platform authenticator is disabled/removed — *and the catch in `getPasskeyStatus` falls back to `available = supported` on probe error*, so the surface for "available resolves false/true" is environment-controlled.
- **Why it matters:** A user who turned on "Require passkey on unlock" reasonably believes the factor is enforced. It is silently *not* enforced whenever the platform reports no user-verifying authenticator. There is no user-visible signal at unlock that the factor was skipped. This is a deliberate "never brick the vault" design choice (see the code comment), but it reduces the factor from "required" to "best-effort" with no UX disclosure.
- **Suggested fix (do not implement):** Either (a) surface clearly at unlock time that the passkey factor was skipped because no authenticator is available, or (b) reconsider whether a *registered + enabled* passkey should hard-require an assertion rather than degrade — paired with a deliberate, signposted password-only escape hatch (see M-3) so degrade-vs-enforce is an explicit, audited decision rather than an implicit branch.

### M-3 — Lost authenticator (still present, credential deleted) → unlock fails CLOSED with no escape hatch; "password path always works" is overstated ⚠ REQUIRES INDEPENDENT AUDIT
- **Severity:** Medium
- **Location:** `src/lib/WalletProvider.jsx:202-213` + `394-461` (`unlock` runs `runPasskeyGate` before `keyStore.unlock`); `src/lib/passkey.js:289-306` (`verifyPasskeyAssertion`); unlock UI `src/pages/HDWalletManager.jsx:157-163` (no skip path)
- **What:** `passkey.js` claims (lines 19-22): *"passkey loss ≠ fund loss: the password/seed unlock path is fully independent and always works."* This is **only true for the seed (re-import) path, not the password path on the existing install.** When a passkey is registered **and** enabled **and** the platform authenticator is still present (`status.available === true`) but the *specific* credential was deleted in OS/browser settings, `verifyPasskeyAssertion()` throws on every attempt. Because `runPasskeyGate()` runs *before* `keyStore.unlock(password)` and there is **no UI to skip the gate** (HDWalletManager just calls `unlock(password)` and shows the error), the user can no longer unlock with their password on that install. Disabling the toggle requires reaching Security settings, which requires being unlocked — a catch-22. Recovery requires wiping local app storage and re-importing from the seed phrase.
- **Why it matters:** This contradicts a load-bearing invariant comment and is exactly the kind of self-authored over-confidence the audit brief called out. Funds are not lost (seed re-import works), but the advertised "your password still unlocks the wallet on its own" is false in this state. Note the tension with M-2: the gate degrades-open when *no* authenticator exists, but fails-closed-forever when an authenticator exists with no matching credential — it branches on "is a platform authenticator present?" rather than "is *our* credential usable?".
- **Suggested fix (do not implement):** Provide a deliberate, signposted "unlock with password only / can't use your passkey?" path at the unlock prompt that bypasses `runPasskeyGate` (the password still gates the vault, so this does not weaken custody). Reword the `passkey.js` invariant to distinguish the seed path from the existing-install password path.

### L-1 — `verifyPasskeyAssertion` never inspects the assertion response (presence-only check) ⚠ REQUIRES INDEPENDENT AUDIT
- **Severity:** Low *(architectural; inherent to serverless WebAuthn)*
- **Location:** `src/lib/passkey.js:289-306`
- **What:** The function `await`s `navigator.credentials.get(...)` and immediately `return true` — it never examines the returned `PublicKeyCredential`. It does **not** verify the signature (no public key is stored — only the credential id), the `authenticatorData` **UV bit** (so `userVerification: 'required'` is requested but never confirmed), the `rpIdHash`, the returned `rawId` against `rec.id`, or the challenge. Security therefore rests *entirely* on what the browser enforces (origin/rpId scoping, `allowCredentials` scoping, UV) for the resolution to occur.
- **Why it matters:** This makes the gate a *local-presence/ceremony* check, not a cryptographic verification. Concretely: any attacker who can execute script in the origin (XSS, malicious extension) can stub `navigator.credentials.get` to resolve and bypass the gate — the app has no way to tell a real assertion from a forged resolution. This is acceptable *only* because the passkey is explicitly a convenience factor and the password is the real control, but the code/UX present it as a genuine "additional factor," so the limitation must be documented, not assumed.
- **Suggested fix (do not implement):** Document the trust boundary explicitly (gate = browser-enforced presence, not app-verified assertion). Storing the credential public key at registration and verifying `authenticatorData` (UV flag) + signature client-side would raise the bar somewhat, but cannot defend against same-origin script and is not equivalent to server-side verification — flag for the auditor as a design decision, not a quick fix.

### L-2 — Anti-replay challenge is decorative ⚠ REQUIRES INDEPENDENT AUDIT
- **Severity:** Low / Info *(consequence of L-1)*
- **Location:** `src/lib/passkey.js:298` (and `:242` for registration)
- **What:** A fresh `randomBytes(32)` challenge is sent on every `get()`/`create()`, which is correct hygiene, but because the signed response is never verified (L-1), the challenge's freshness provides **no actual anti-replay guarantee at the app layer**. There is nothing that would reject a replayed/forged assertion result.
- **Why it matters:** Reinforces that the gate is presence-only. Not independently exploitable beyond L-1; listed so the report does not imply replay protection exists.
- **Suggested fix (do not implement):** None independent of L-1; covered by the same trust-boundary documentation.

### Info-1 — Demo simulated prompt auto-succeeds (fail-open by construction, demo-only)
- **Severity:** Info
- **Location:** `src/components/security/PasskeyPrompt.jsx:22-33` (`AUTO_SUCCESS_MS = 1600`, `onResult(true)` on timer); driven by `runPasskeyGate` demo branch `WalletProvider.jsx:205-208`
- **What:** In demo mode the simulated sheet auto-resolves success after 1.6s unless the user hits Cancel in that window — the demo gate effectively auto-passes.
- **Why it matters:** Intended and clearly labelled ("Simulated — demo mode" banner, `simulated: true`, no crypto). Listed only so it is not mistaken for the real-path behavior. Demo is gated by `VITE_DEMO_MODE`/`?demo`.
- **Suggested fix (do not implement):** None — working as designed; ensure demo can never be enabled in a production build (out of this scope; covered by the demo-gating in `api/demoClient`).

### Info-2 — `getRegisteredPasskey` validates only `id`, not `rpId`
- **Severity:** Info
- **Location:** `src/lib/passkey.js:90-100`; consumed at `:299`
- **What:** The parsed record is accepted if `typeof obj.id === 'string'`; `rpId` type/shape is not validated before being passed as `rpId` to `navigator.credentials.get`.
- **Why it matters:** Low risk — a tampered/malformed `rpId` either fails the browser's "rpId must be a registrable suffix of the origin" check (→ throw → fail closed) or is `undefined` (→ falls back to `window.location.hostname` via `rec.rpId || …`). An attacker who can already write localStorage has bigger options. Noted for completeness.
- **Suggested fix (do not implement):** Optionally validate `rpId` is a non-empty string and a suffix of the current origin before use.

---

## Bypass & fail-open / fail-closed analysis (the brief's core questions)

**(a) Can the passkey gate be bypassed — can unlock proceed without the gate passing?**
- **Vault unlock:** No path lets the *vault* open without the password. `unlock()` (`WalletProvider.jsx:394-461`) is the single gated entry; `createWallet`/`importWallet` legitimately don't gate (the caller supplies the seed); the duress/hidden/panic deniability paths execute *inside* `unlock()` after the gate, so they are gated too. There is no alternate ungated `setUnlocked(true)` path.
- **The passkey factor itself** *can* be skipped/bypassed: M-2 (skipped when no authenticator "available"), L-1 (forged resolution under same-origin script), and — for the separate `QuickLock` screen — M-1 (fail-open on non-`NotAllowedError`). None of these grant vault access without the password, but they do defeat the *second factor*.

**(b) Fail OPEN or fail CLOSED on error/cancel?**
- **Registered + available real-web path:** **Fails CLOSED, correctly.** `runBiometricGate()` and `runPasskeyGate()` are awaited *before* the `try` that wraps `keyStore.unlock`, so a cancel/throw rejects the whole `unlock()` — no vault read occurs (`WalletProvider.jsx:398-410`). Verified by test `propagates a cancelled assertion (so unlock aborts)`.
- **Demo path:** cancel rejects the simulated prompt → `unlock()` rejects → fails CLOSED. Auto-success is demo-only (Info-1).
- **Fail-OPEN exceptions:** (M-2) unavailable authenticator → factor skipped; (M-1) `QuickLock` non-`NotAllowedError` → screen unlocks.
- **Fail-CLOSED-too-hard exception:** (M-3) lost credential with authenticator present → unlock blocked permanently with no escape hatch.

**(c) Is any key material / vault password / decryption secret stored, logged, or derived from the passkey?**
- **No — confirmed clean.** `passkey.js` persists only `PASSKEY_PREF_KEY` (`'1'`) and `PASSKEY_CRED_KEY` (`{id, rpId, label, simulated, createdAt}`), where `id` is the **public** base64url credential id. The **PRF extension is explicitly not used** (lines 17-18), so no wrapping key is derived from the assertion. `user.id` at registration is fresh `randomBytes(16)`, not seed-derived (lines 246-250). `verifyPasskeyAssertion` returns only `true`. No `console.*`/`alert`/logger anywhere in the scope files (grep confirmed). Test `stored record never contains key material` asserts the absence of `seed|mnemonic|private|password|secret` keys. The gate never touches `vault.js`/`vaultStore.js`/`keyStore` crypto.

**(d) Does removing/losing the passkey leave the password path intact (no lockout)?**
- **Explicit removal:** Yes — `clearRegisteredPasskey()` (`passkey.js:110-113`) forgets the handle *and* disables the toggle, and `runPasskeyGate` early-returns when not registered/enabled. Password-only unlock restored cleanly.
- **Losing the authenticator while still enabled:** **No — see M-3.** This is the unhandled case and the brief's question (d) is where the stated invariant breaks down on the existing install.

**(e) Insecure randomness / credential-id handling / info leaks in `passkey.js`?**
- **Randomness:** `crypto.getRandomValues` only (`randomBytes`, lines 135-139); no `Math.random`. Good.
- **Credential-id handling:** base64url round-trip (lines 117-131) is correct; malformed input throws → fails closed. Prior **empty `allowCredentials` issue is fixed** — assertions are scoped to `[{ id: rec.id }]` (line 302), and `QuickLock` now routes through `verifyPasskeyAssertion` instead of its old `allowCredentials: []` (confirmed in the PR diff). Verified by test `scopes the assertion to the registered credential id`.
- **Info leaks:** stored metadata (`label`, `createdAt`) is non-sensitive; no secrets logged.

**(f) WebAuthn-specific issues — origin/rpId, replay, empty-allowCredentials:**
- **Origin/rpId:** rpId is `window.location.hostname` at registration; browser enforces rpId↔origin scoping. No app-side origin check is possible (no server) — see L-1.
- **Replay:** see L-2 — challenge present but not verified.
- **Empty `allowCredentials`:** **Resolved** (the exact issue `QuickLock` previously had). Now scoped to the registered credential.
- **UV enforcement:** requested (`userVerification: 'required'`) but the UV bit in the response is never checked — see L-1.

---

## What this review does NOT cover

- **Real-device / real-browser WebAuthn behavior.** All analysis is static + against the mocked authenticator in the test suite. The actual enforcement of origin/rpId scoping, `allowCredentials`, and `userVerification` by real platform authenticators (Face ID / Touch ID / Windows Hello / Android / roaming keys) and across browser engines was **not** exercised. M-2/M-3 hinge on real `isUserVerifyingPlatformAuthenticatorAvailable()` and credential-deletion behavior that only a device can confirm.
- **The independent audit.** Every ⚠-tagged finding (M-1, M-2, M-3, L-1, L-2) is auth-gate logic written largely within this project and **must be independently audited**. Self-review of self-authored auth code is the known blind spot here; this document is a triage input, not a sign-off.
- **Dynamic / runtime analysis.** No DAST, no fuzzing, no instrumented unlock runs, no XSS/extension exploit was attempted against the L-1 same-origin-script trust boundary. Findings are reasoned from code, not demonstrated at runtime.
- **The non-S1 keystore/vault crypto.** `vault.js`, `vaultStore.js`, KDF parameters, the deniability/duress/stealth/panic paths, and the broader app were **out of scope** (PR #32 covered the repo-wide pass). Only the passkey-adjacent seam (`web.js` unlock entry) was read, to confirm the gate sits cleanly in front of it.
- **Demo-mode production gating.** Whether `VITE_DEMO_MODE`/`?demo` can leak into a production build (which would expose Info-1's auto-success gate) is governed by `api/demoClient` and is out of this scope.

---

### Appendix — commands run
- semgrep: `semgrep scan --config=p/security-audit --config=p/javascript --config=p/react --config=p/secrets --config=p/owasp-top-ten <scope files> --json` → *Ran 122 rules on 13 files: 0 findings.*
- gitleaks: `gitleaks detect` on commit `0d534a7` and a no-git scan of `passkey.js`/`biometric.js`/`session.js` → *no leaks found.*
- npm audit: not run — no dependency changes in PR #38 (`git diff --stat 353b365 0d534a7 -- package.json package-lock.json` is empty).
</content>
</invoke>

---

## Remediation status (2026-06-20)

All three Medium findings fixed. L-1 and L-2 accepted as documented design decisions.

| Finding | Sev | Status | Note |
|---|---|---|---|
| M-1 `QuickLock` fail-open | MEDIUM | ✅ FIXED (PR #40) | Fails closed on all errors once `isWebAuthnSupported()` is true. On `cancelled` (NotAllowedError): shows "denied/cancelled" error. On any other error: shows "passkey couldn't be used" + `recoverable = true` — sets the deliberate "Continue without passkey" escape hatch, not an auto-pass. |
| M-2 `runPasskeyGate` silently skips | MEDIUM | ✅ FIXED (PR #40) | Returns `{ status: PASSKEY_GATE.UNAVAILABLE }` when no authenticator is available. Caller (`WalletProvider`) surfaces this as a UI signal — no longer a silent pass-through. |
| M-3 Lost credential, no escape hatch | MEDIUM | ✅ FIXED (PR #40) | `PasskeyGateError(reason, cause)` wraps assertion failures; `classifyPasskeyError` distinguishes `'cancelled'` (NotAllowedError) from `'error'` (broken/gone credential). `QuickLock` exposes the `recoverable` path; `runPasskeyGate` throws the typed error so callers can signal a signposted password-only bypass. Password still gates the vault — I1 preserved. |
| L-1 Assertion not inspected (presence-only) | LOW | ✅ ACCEPTED — documented design decision | Gate is browser-enforced ceremony + presence, not app-verified assertion signature. Documented in `passkey.js` escape-hatch threat model. Auditor brief updated. No wrapping key derived (PRF explicitly unused). |
| L-2 Anti-replay challenge decorative | LOW | ✅ ACCEPTED — consequence of L-1 | Challenge freshness is correct hygiene; replay protection at app layer cannot exist without signature verification. Accepted alongside L-1. |
| Info-1 Demo auto-success | INFO | ✅ BY DESIGN | Demo-only; dead-code-eliminated from production. No change needed. |
| Info-2 `getRegisteredPasskey` rpId not validated | INFO | ✅ ACCEPTED — browser enforces | Malformed rpId fails the browser's rpId↔origin check → throws → fails closed. Low exploitability accepted. |

**Net status as of 2026-06-20:** 0 open findings. The passkey gate meets the I4 (fail honest, fail closed) invariant for a convenience-second-factor design. The load-bearing vault control remains the password (keyStore.unlock); passkey is an additional ceremony factor only. The two design-decision LOWs (L-1/L-2) are documented in `passkey.js` and will be re-evaluated in the independent third-party audit.
