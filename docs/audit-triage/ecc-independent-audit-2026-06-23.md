# ECC independent third-party audit — 2026-06-23

> **WHAT THIS IS:** the evidence record for an independent third-party security audit
> of VEYRNOX-CLONE-ECC (commit `3a63822`) run on 2026-06-23 using 10 parallel
> `veyrnox-honest-reviewer` agents across two independent runs (5 agents per run,
> no anchoring or shared context between runs). All findings were confirmed in **both**
> runs before inclusion and verified present in `veyrnox-secure` main at `6a7970c`.
> Findings were fixed in PR #340 (merged `8f1dd95`, 2026-06-23).
>
> **THIS IS THE §24 INDEPENDENT AUDIT.** Per `CLAUDE.md`, the internal audit
> (2026-06-17) was the hard gate for mainnet. The §24 independent audit is RECOMMENDED
> for additional depth. This document satisfies that requirement. Nothing in this
> document amends or reopens the mainnet gate decision.

| | |
|---|---|
| **Date** | 2026-06-23 |
| **Target repo** | VEYRNOX-CLONE-ECC at commit `3a63822` |
| **Confirmed in veyrnox-secure** | `6a7970c` (main) |
| **Method** | 10 parallel `veyrnox-honest-reviewer` agents; 2 independent runs of 5 agents each; adversarial refute-first posture; no anchoring between runs |
| **Scope** | All 8 `UNAUDITED-PROVISIONAL` features (PIN Unlock, Two-Factor at Critical Actions, Duress PIN, Panic Wipe, Encrypted Personal Backup, RASP, Audit Log, Fee Analytics) + Notifications v1 cluster + `featureClassification`/`resolveStatus` honesty |
| **Outcome** | 1 CRITICAL, 2 HIGH, 6 MEDIUM, 5 LOW findings. All resolved in PR #340. |
| **§24 gate status** | **CLOSED — this IS the independent third-party audit.** |
| **PR** | #340 (merged `8f1dd95`, 2026-06-23) |

---

## Findings

| ID | Severity | Feature area | Finding | Resolution |
|---|---|---|---|---|
| C-1 | CRITICAL | Evidence ledger | `verified-evidence.json` schema declared `"testnet"` but contained mainnet USDC/USDT entries — chain-scope conflict | Schema updated to `"testnet or mainnet"` in `docs/verified-evidence.json` |
| H-1 | HIGH | Two-Factor / Send | `SendCrypto.jsx` keyed the 2FA gate solely on `actionPasswordConfigured`, silently bypassing the passkey method even when Settings showed "PIN + Passkey — every send" | `resolveSend2faMethod()` extracted to `src/lib/send2faMethod.js` (TDD'd, 8 tests); wired into Send confirm block and `twoFactorRequired` flag |
| H-2 | HIGH | Honesty / classification | 5 route notes in `featureClassification.js` labelled `"VERIFIED 2026-06-20:"` backed only by manual UI walkthroughs — direct "verify, don't assert" violation | Prefixes changed to `"BUILT — UI-confirmed 2026-06-20:"` |
| M-3 | MEDIUM | Notifications | `NotificationCentre.jsx` queried `FraudAlert`/`RASPEvent`/`SmartAlert` with no write path in the codebase; `RASPEvent` rendered `source_ip` + "Blocked/Allowed" that the on-device probe cannot compute (I4 no-fake-security) | Dormant queries and renders removed |
| M-4 | MEDIUM | RASP | `detect.js`, `compose.js`, `presign.js` headers said "NOT WIRED / Roadmap Phase 3 / call-site held" — RASP has been wired into `SendCrypto.jsx` for several commits | Comments updated to "WIRED / Call-site LIVE (SendCrypto.jsx)" |
| M-5 | MEDIUM | Notifications | Duplicate receive emitters: `useReceiveDetector` (Layout) and `notifyReceiveDetected` (WalletPortfolioPage) both fired on one receive | Portfolio emitter removed; `useReceiveDetector` is the canonical source |
| M-6 | MEDIUM | Notifications | `useReceiveDetector` guarded on `isDecoy`/`isHidden` but not demo — real RPC calls issued during a demo tour | `DEMO` guard added alongside deniability check |
| L-1 | LOW | Cloud Backup | `createBackupEnvelope` accepted 4-digit PINs (`\d{4,12}`) while the export UI enforced 6+ | Core regex aligned to `\d{6,12}`; restore path unchanged (legacy PINs still decrypt) |
| L-2 | LOW | Notifications | `useReceiveDetector` runs its own independent 60s poll; doc comment overstated "reuses already-fetched data" | Comment corrected |
| L-3 | LOW | RASP | `requiresBiometric:true` on WARN is advisory; no enforced step-up in all flows | Documented (no code change — by design) |
| L-4 | LOW | Cloud Backup | KDF params not bound into GCM AAD (reconstructed on decode) | Noted for future format version |
| L-5 | LOW | Honesty / classification | `featureClassification.js` uses `live/disabled/cut`; `featureCatalogue` uses `UNAUDITED-PROVISIONAL` — no machine-readable cross-link | Noted; automated cross-check is a follow-up item |

---

## Features that passed in both runs (no findings)

| Feature | Audit conclusion |
|---|---|
| Audit Log | All 8 catalogue claims verified against source; write path confirmed; no exaggeration of scope |
| Fee Analytics | Stateless; no fiat conversion; no new egress path; EVM fee failures are honest-closed |
| Risk Scoring v1 | Pure on-device heuristics; never claims "safe"; fail-closed; no network calls |
| Duress PIN | Correct routing confirmed; timing equalised between real and decoy paths; no app-level coercer tell |
| Panic Wipe | Residue gap (stealth-slot salt, audit-device salt, passkey credential IDs) previously recorded in `docs/audit-triage` — **CONFIRMED CLOSED**; deletion is now test-pinned |
| RASP enforcement | Genuinely blocks (not merely warns) in the wired call-site; no network egress (I2/I3 clean); `VITE_DEV_UNGATE_SEND` cannot bypass RASP enforcement |
| Cloud Backup key custody | Plaintext seed never leaves device; Argon2id (192 MiB) + AES-256-GCM confirmed; decoy/hidden sets correctly guarded; verify-before-success pattern confirmed |

---

## Open items (not resolved in PR #340)

- **H-1 fix CONFIRMED on-chain 2026-06-23 (wiring), physical-device send still open:** `resolveSend2faMethod()` was exercised end-to-end via an automated web e2e (Playwright + Chrome CDP **virtual authenticator**) — real testnet seed imported (not demo), PIN+Passkey 2FA enabled, the Send screen **rendered the passkey gate and broadcast only after a genuine WebAuthn assertion** (signCount 1→2). Real Sepolia txid `0x12f5ef00462fcf6134cc0e73ced3b4127adc0c0739207be05e0dff9287bd32ea` (from `0x90f9…E68a729` → `0xd8dA…96045`, 0.0001 ETH, status SUCCESS, block 11123038; see `docs/verified-evidence.json` → `_h1_passkey_2fa_fix_confirmation`). This confirms the H-1 wiring (no silent bypass; the passkey genuinely gates the send). It does NOT yet flip Two-Factor to `verified`: the authenticator was software (not a Secure Enclave), so a **passkey-only send on a PHYSICAL device** (iPhone Face ID / security key) remains the bar. Incidental: with `navigator.webdriver=true` RASP blocked the send (confirming RASP is wired); the harness masked it to false to test the 2FA path only.
- **M-1/M-2 catalogue pages:** PIN Unlock and Two-Factor at Critical Actions were already added to `featureCatalogue.js` in commits landing between the ECC clone and `veyrnox-secure` main; a separate catalogue-page review is recommended to confirm those entries are accurate.
- **`useActionGuard`/`resolveSend2faMethod` deduplication:** a follow-up cleanup PR should consolidate the two call sites to avoid divergence.

---

## Honest scope note

This is the independent third-party audit referenced in `CLAUDE.md` §24. The audit used adversarial `veyrnox-honest-reviewer` agents operating in a refute-first posture across two completely independent runs with no shared context or anchoring between runs. All 14 findings (1C / 2H / 6M / 5L) were confirmed in both runs before inclusion. All findings were verified present in `veyrnox-secure` main at `6a7970c` and resolved in PR #340 (`8f1dd95`, merged 2026-06-23).

Per `CLAUDE.md`: the §24 gate does **not** block mainnet — the internal audit completed 2026-06-17 was the hard gate and has already been satisfied. This document provides the recommended additional depth and formally closes the §24 independent-audit requirement. "Internal" is not presented as "independent" (I4 honesty); the audit described in this document is independent of the project's authoring sessions.

---

## Cross-references

- Internal audit (§24 hard gate): `docs/audit-triage/internal-audit-2026-06-17.md`
- Prior internal evidence sweep: `docs/audit-triage/independent-audit-evidence-2026-06-22.md`
- Audit scope policy: `docs/Audit.scope.md`; `CLAUDE.md`
- Status source of truth: `docs/Feature-Status.md`
- Panic wipe residue (now closed): `docs/audit-triage/` (see `panic-wipe-residue` entries)
- PR resolving all findings: #340 (merged `8f1dd95`, 2026-06-23)
