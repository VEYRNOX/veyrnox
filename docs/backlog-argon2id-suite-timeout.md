# Backlog: Argon2id duress/chaff vault tests time out under full-suite concurrency

**Status:** OPEN · out of scope for the dev-real test-harness brief (logged so it isn't a mystery CI red later)
**Found:** during Harness A verification (full `verify` run, ~889s)
**Numbers verified:** 2026-06-13 — figures below were measured, not estimated (see *Provenance*).

## Symptom

Three Argon2id-heavy duress/chaff vault tests fail in the **full** `npm test` / `verify`
run by timing out at exactly `60000ms`. They span **two different files**:

- `src/wallet-core/__tests__/provisionChaff.test.js` — 1 failure: "backfills only the
  missing slot" (`:95`).
- `src/wallet-core/__tests__/panic.test.js` — 2 failures (duress / hidden-reveal tests,
  around `:130`–`:160`, e.g. the `hasDuressVault()` + `tryRevealHidden()` paths).

These two files hold **13 tests total**, and they **pass 13/13 in isolation** — at the
**default 60s per-test cap**, no raised timeout — taking **~63s aggregate** for the two
files together. This is **resource contention, not a logic failure**, and is unrelated
to either harness (Harness A passes inside the full run and 22/22 in isolation).

### Why it reds under the full suite but not alone

The 60s timeout is **per test**, not per file. In isolation, no single test approaches
60s (the whole 13-test set runs in ~63s uncontended). Under the full suite, multiple
Argon2id-heavy tests run concurrently across vitest workers and contend for CPU/memory;
the heaviest duress/chaff tests — each performing **several** Argon2id passes (the
constant-number deniability resolution + multi-slot provisioning) at **64 MiB / t=3**
(`src/wallet-core/vault.js` `KDF_PARAMS`: `parallelism:1, iterations:3,
memorySize:65536` KiB) — stretch a single test past the 60s cap. A single uncontended
pass is ~440ms (`vault.js` header); contention is the multiplier, not the work itself.

> Correction vs. the original draft of this note: an earlier draft claimed "each test
> needs ~133s of Argon2id work" and "pass 21/21 in isolation." Both were wrong. The
> ~133s was an aggregate from a 2-file run that wrongly included `stealth.test.js` (never
> a failing file); and a per-test cost of 133s would contradict the observed fact that
> these tests pass under the **60s** cap in isolation. The measured figures are 13 tests
> / ~63s aggregate / two files (`provisionChaff` + `panic`).

## Risk

Latent `verify`-gate flakiness: on slower CI hardware the full run could push these three
red even with no code change, producing a confusing "CI failed but nothing I touched"
signal. The merge of PR #186 confirmed they did **not** red on the CI box used there —
but that's one box, not a guarantee across runners.

## Candidate fixes (not yet chosen — needs its own look)

- Raise the per-test timeout for the Argon2id-heavy files specifically (targeted, not
  global) — e.g. `test.setTimeout` / a file-scoped `testTimeout` for `provisionChaff` and
  `panic`. Lowest-risk; changes no production code path.
- Reduce concurrency for that file group (run the vault/duress/panic suite serially or in
  its own pool) so they don't contend.
- Lower Argon2id cost params **for the test environment only** — risky: must not weaken
  the params the security tests actually assert on (`vault-migration.test.js` pins
  `memorySize === 65536`), and would need to confirm the tests still exercise the real
  production cost path. Likely the wrong fix.

## Not doing now

No fix under the harness brief — widening that scope to chase pre-existing flakiness is
how a clean PR turns into a multi-day one. This note exists so the next person who sees a
`verify` red on these three knows it's known, characterised, and environmental rather
than a regression.

## Provenance (how the numbers were established)

- Full `verify` run: `Tests 3 failed | 991 passed | 6 expected fail (1000)`,
  `Duration 889.69s`; the 3 failures were the timeouts above.
- Isolation (default cap): `npx vitest run …/panic.test.js …/provisionChaff.test.js` →
  `2 passed (2)`, `Tests 13 passed (13)`, `Duration ~66s` (tests ~63s).
- Argon2id params: `src/wallet-core/vault.js` `KDF_PARAMS` (64 MiB / t=3), corroborated
  by `vault-migration.test.js` (`memorySize === 65536`) and `src/lib/seedQr.js`.
