# Changelog

All notable changes to Veyrnox are documented in this file, starting **2026-07-05**.
Prior history is recorded in `docs/Feature-Status.md`, `docs/Audit.scope.md`, and the
dated files under `docs/audit-triage/` — this file does not retroactively reconstruct it.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Security-
relevant entries are tagged with their project status per `CLAUDE.md`: **BUILT** (in
code, tests green, testnet-only unless verified), **TARGET** (designed, not yet in
code), **PLANNED** (roadmap), or **HONEST-DISABLED** (present but off on principle).
"Verified" is reserved for a real on-chain testnet txid — see `CLAUDE.md`.

## [Unreleased]

### Changed
- **Argon2id vault KDF memory cost raised 64→192 MiB** (`src/wallet-core/vault.js`
  `KDF_PARAMS.memorySize`: 65536→196608 KiB; iterations `t=3` and parallelism `p=1`
  unchanged), commit `d0522bfb`, PR #604. Reverses PR #465 (2026-06-28), which had
  lowered 192→64 MiB specifically to fix 4-8s unlock latency on Capacitor WebView
  devices. Reversal premise: device-exercised Face ID / biometric unlock (2026-07-05)
  now gives enrolled users a fast unlock path around the slow password KDF, so the
  stronger offline-seizure resistance is judged worth the latency again. Backward
  compatible — existing 64 MiB vaults keep unlocking under their own recorded KDF
  params; `LEGACY_KDF_PARAMS` remains 64 MiB; a lazy migration re-wraps a vault to
  192 MiB on the next password change/unlock (no forced re-encryption, no lockout).
  **Status: BUILT**, unit-tested (wallet-core 937/937 passing). **NOT verified** —
  no on-chain txid or device confirmation is implied. **Honest caveats:** (1) users
  without biometric enrollment — including the Safari password-only web fallback —
  still pay the full ~6-8s 192 MiB unlock latency that PR #465 existed to fix; this
  raise ships no mitigation for that cohort. (2) The "biometric mitigates the
  latency" premise is itself an unmeasured real-device UX claim at time of writing;
  device UX timing measurement is in progress separately, not complete. See
  `docs/crypto-implementation-verification.md` and `docs/Feature-Status.md` §2 for
  the updated parameter table and OWASP comparison.

### Added
- **Ring-boundary ESLint enforcement** (`eslint/rules/ring-import-lint.js`, wired via
  `eslint.config.js`) — Critical Blocker #1. A structural lint rule that fails the
  build if a UI/routes/backend/api/state module (`src/ui`, `src/pages`, `src/routes`,
  `src/backend`, `src/api`, `src/state`) directly imports an R0/R1 crypto-core module
  (`wallet-core/keystore`, `wallet-core/vault`, `wallet-core/vaultBackup`,
  `wallet-core/mnemonic`, `wallet-core/derivation`, `wallet-core/coldkey`, or the
  `@vault`/`@signing`/`@keys` aliases). Does not prove key safety — it only prevents
  the ring boundary from silently eroding as new UI code is added; a violation
  requires a human refactor (route the call through an allowed R2 facade), not an
  auto-fix. `src/sign-gate/*` is deliberately excluded (it's the intended pure
  decision facade the UI is supposed to call). **Status: BUILT.**
- **Mainnet flag-change CI gate** (`.github/workflows/ci.yml` job `mainnet-flag-gate`,
  `scripts/detect-mainnet-flag-changes.js`) — Critical Blocker #3. Diff-based check
  that does not gate "is mainnet on" but gates "did this PR CHANGE a mainnet
  activation flag" — a PR that flips `ALLOW_MAINNET`/`ALLOW_BTC_MAINNET`/
  `ALLOW_SOL_MAINNET` (or similar) is labeled `mainnet-gate-required` for explicit
  review rather than merging silently alongside unrelated changes. **Status: BUILT.**
- **D-02 / AL-06 / BIO-03 honest disclosures** — user/doc-facing acknowledgement of
  three residual findings from the 2026-07-05 internal static-analysis pass
  (`docs/audit-2026-07-05-deniability-internal.md`), each previously accepted as a
  residual risk in code/comments but not surfaced honestly to users or in status
  docs:
  - **D-02** (MEDIUM) — the primary-unlock timing oracle (`VULN-17`, a correct
    primary unlock returns after one Argon2id KDF while wrong-password/duress/panic
    paths run at least one additional KDF; the `PRIMARY_UNLOCK_EQUALIZER_MS` constant
    pads wall-clock time but not the underlying KDF cost) remains **ACCEPTED
    RESIDUAL** — disclosed, not code-fixed this round.
  - **AL-06** (LOW) — the audit log is primary-session-only by design
    (`auditSecretForSession` returns `null` for decoy/hidden sessions with no dummy
    blob written), which is itself a forensic tell distinguishing a primary session
    (blob present) from a decoy/hidden session (blob absent). Disclosed per I4
    honesty; no chaff-blob mitigation shipped this round.
  - **BIO-03** (MEDIUM) — the biometric unlock settings UI did not expose that its
    gate is an app-layer check (`BiometricAuth.authenticate()`), not an OS-enforced
    Keychain/Keystore ACL, and is therefore bypassable via Frida on a rooted/
    jailbroken device (see BIO-02). Disclosed to close the gap between user
    expectation ("hardware-bound biometric") and actual behavior pending Hardware
    KEK Phase 2.
  All three are internal-static-analysis findings, **not** independently audited —
  see the I4 disclaimer in `docs/audit-2026-07-05-deniability-internal.md`. Status
  tags for the underlying features are unchanged by this disclosure round; the gate
  status (mainnet open since 2026-06-17) is unchanged.
- **Crypto implementation verification doc**
  (`docs/crypto-implementation-verification.md`) — a from-source review of the
  vault's Argon2id→AES-256-GCM construction and the hardware-KEK HKDF combine,
  confirming the actual code against CLAUDE.md's documented design (including the
  I6 `HKDF(H‖C)` concatenation vs. an earlier XOR description, previously resolved
  as doc-only per the 2026-07-01 ECC audit). **Status: BUILT** (code-implemented,
  unit-tested), **NOT independently audited** for this specific crypto angle. Updated
  2026-07-05 to reflect the 64→192 MiB KDF raise (see above).

[Unreleased]: https://github.com/VEYRNOX/veyrnox/compare/main...HEAD
