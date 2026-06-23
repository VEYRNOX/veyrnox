# A-2 — Deniability KDF-param timing divergence on pre-M3 devices (OPEN, audit-gated)

> **Status:** OPEN audit item. **Severity:** Minor (narrow reachability). **Class:**
> deniability timing oracle. **Found:** internal security-defect audit 2026-06-23.
> **NOT blind-fixed** — see "Why this is not patched here."

## The finding

The constant-KDF deniability model equalizes unlock timing by spending exactly one
Argon2id KDF per feature branch, padding an ABSENT feature with a dummy KDF
(`deniabilityUnlock.js` `chaffBlob`/`dummyKdf`). The dummy blob carries the **CURRENT**
at-rest params (`{...KDF_PARAMS}` = 192 MiB).

`decryptVault` derives with each blob's **own recorded** params (the M3 migration:
`vault.js paramsFromVault`). A real duress / panic / stealth blob written **before** the
M3 64→192 MiB bump records LEGACY 64 MiB params and decrypts at 64 MiB. The deniability
blobs are **never transparently re-keyed** on a primary unlock (rekey needs the blob's
own credential, which the primary session does not have).

**Result:** on a device onboarded pre-M3 with a pre-M3 duress/panic/stealth credential,
a real attempt against that feature costs one **64 MiB** KDF while the absent-feature pad
costs one **192 MiB** KDF (~3× slower). Timing a few wrong guesses can therefore
distinguish "feature configured" (faster, legacy params) from "absent/padded" (slower,
current params) — the exact tell the constant-KDF model exists to remove.

This is already acknowledged in `deniabilityUnlock.js:93-96` ("if those params change,
keep this blob in sync so the dummy cost still matches a real attempt") — the gap is that
the dummy was kept in sync (→ current) but the *pre-M3 real blobs* cannot be.

## Reachability (why Minor)

- Only devices **onboarded before** the 64→192 MiB bump, **with** a duress/panic/stealth
  credential **also** set pre-M3, **and** whose deniability blob has not since been
  re-encrypted (e.g. via an action-password change, which uses CURRENT params).
- Requires a local-timing side channel against ~100 ms KDFs under real measurement noise.
- New onboarding writes at CURRENT params → not affected.

## Why this is not patched here

Per `CLAUDE.md` ("do not build [deniability/timing] blind; they need real-device
verification and the audit") and the module's own self-review caveat
(`deniabilityUnlock.js`: *"a self-authored timing fix to self-authored timing code is the
precise blind spot the audit must own"*), a timing-model change is **audit-gated**. No
casually-correct fix exists (see below — each candidate has a deniability trade-off), so
this is recorded for the auditor rather than blind-patched.

## Candidate mitigations (for the audit to evaluate — do NOT build blind)

1. **Forward rekey on deniability unlock.** When a duress/panic/stealth credential
   succeeds and its blob is legacy-param, re-encrypt it at CURRENT params (symmetric with
   the primary's rekey-on-unlock). Converges the tell away over use. **Trade-off:** adds a
   storage write during a deniability session — must be analyzed against the "minimize
   non-primary writes" rule (a before/after storage diff is itself a potential tell).
2. **Pin the dummy params to a fixed canonical cost** independent of `KDF_PARAMS`, and
   require all real blobs (incl. legacy) to be migrated to that same cost. **Trade-off:**
   the legacy-blob migration is the same credential-availability problem as (1).
3. **Accept + document** as a residual that only affects a closed cohort of pre-M3
   devices, with a one-time "re-set your duress/stealth/panic credential" prompt to
   migrate. **Trade-off:** relies on user action; the prompt itself must be deniable.

## References

- `src/wallet-core/deniabilityUnlock.js` (`chaffBlob`, `dummyKdf`, header :88-100)
- `src/wallet-core/vault.js` (`paramsFromVault`, `KDF_PARAMS`, `LEGACY_KDF_PARAMS`)
- `docs/Security.roadmap.md` (timing-harness audit item)
- Sibling KDF-param hardening already merged: PR #334 (param-ceiling clamp, B-1/B-2).
