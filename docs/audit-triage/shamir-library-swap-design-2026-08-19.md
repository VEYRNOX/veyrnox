# Shamir Library Swap Design Note (2026-08-19)

> **What this is:** a design/triage note for issue **#1833** after a local spike
> on Wednesday, August 19, 2026.
>
> **What this is not:** an implementation, a verification artifact, or an
> independent audit. It does not change any feature `status`.

> **Owner decision (recorded after this spike):** proceed with **Path B —
> Versioned migration** as the planning assumption unless a later audited
> candidate unexpectedly proves byte-for-byte compatible with the current
> scheme.

## Goal

Replace the hand-rolled Shamir implementation in
`src/wallet-core/shamir.js` with an audited library **without** breaking:

- existing 88-byte v2 share envelopes
- Personal Backup export / restore round-trips
- cross-version recovery bundles already produced by local/dev builds
- the current error surface and fail-closed behaviour

## Why #1833 exists

Two separate concerns now converge:

1. **Governance / audit scope**
   `docs/audit-findings-tracker.md` records `DIFF-0809-GOV`: a 533-line
   hand-rolled GF(2^8) Shamir implementation on a DEK-share path conflicts with
   the repo's "no custom crypto primitives" rule.

2. **The code is now live in real flows**
   The old "dead code" posture is stale. `shamir.js` is now reached through:
   - `src/wallet-core/shardBackup.js`
   - `src/wallet-core/keystore/native.js`
   - `src/wallet-core/keystore/web.js`
   - `src/lib/WalletProvider.jsx`

So this is no longer just cleanup debt; it is active crypto-path debt.

## Current format that must be preserved unless we explicitly version-bump

`src/wallet-core/shamir.js` currently emits an **88-byte v2 envelope**:

- byte `0`: version
- byte `1`: `k`
- byte `2`: `n`
- bytes `3..18`: `setId`
- byte `19`: `x`
- bytes `20..51`: `y[32]`
- bytes `52..83`: SHA-256 commitment
- bytes `84..87`: CRC32

This shape is assumed by:

- `src/wallet-core/shardBackup.js`
- `src/wallet-core/recoveryShare.js`
- Personal Backup tests and bundle codecs

Any replacement that changes the inner math but keeps the outer bytes must still
reproduce the same `y` values for the same secret + randomness. Otherwise it is
not a transparent swap.

## Spike result (2026-08-19)

### Candidate 1 — `@stablelib/tss`

This was the most obvious first target because it is maintained, public, and
ships a secret-sharing implementation.

**Result:** **not a drop-in replacement**.

The local spike showed that even when Veyrnox's outer envelope is preserved,
StableLib's raw split/combine core changes the actual share bytes. A
deterministic parity fixture failed on the `y` region of the shares, not just on
metadata or wrapper bytes.

Operationally, that means:

- this is a **scheme change**, not an adapter swap
- old and new shares would not be byte-for-byte compatible
- `#1833` would require explicit migration/versioning if we choose this path

### Candidate 2 — `dsprenkels/sss`

This looks stronger from a crypto-review perspective than many JS packages, but
it also is **not** a drop-in fit for Veyrnox:

- expects 64-byte secrets in its core API/docs
- outputs its own authenticated share format
- documented share length is 113 bytes

That means adopting it would also be a **format migration**, not a primitive
swap.

Reference:
- `https://dsprenkels.github.io/sss/`

### Candidate 3 — `@forgesworn/shamir-core`

This package is structurally closer to Veyrnox's current byte-wise GF(256)
scheme than StableLib TSS.

However, as of the August 19, 2026 spike, we did **not** find evidence of an
independent audit. So even if it matched the existing math closely, it does not
yet satisfy the spirit of `#1833` on its own.

Reference:
- `https://www.npmjs.com/package/@forgesworn/shamir-core`

## Conclusion

`#1833` should be reframed.

It is **not**:

- "replace `shamir.js` with `@stablelib/sss`"
- "rewrite `split`/`combine` and keep callers unchanged"

It is one of these two projects:

### Path A — Compatible audited-core swap

Find an audited implementation whose split/combine semantics match Veyrnox's
current byte-wise scheme closely enough that we can preserve:

- the same `y` bytes
- the same 88-byte v2 envelope
- the same existing bundle/readers

This is the only path that qualifies as a true "swap".

**Pros**
- no share-format migration
- cleaner caller impact
- existing bundles remain valid without dual-read logic

**Cons**
- may not exist in a browser-friendly audited package
- still needs a strict parity harness before merge

### Path B — Versioned migration

Adopt a stronger audited library even if its share math / wire format differs,
but treat it as an explicit migration:

- add a new share version
- dual-read old + new formats
- never silently reinterpret old bundles as new ones
- keep old combine support until the installed base is intentionally rotated

**Pros**
- unlocks use of better-supported audited libraries
- more honest than pretending wrapper compatibility equals scheme compatibility

**Cons**
- materially larger project
- more review surface
- more user / support complexity

## Recommended next move

Treat **Path B** as the default planning assumption unless a truly compatible,
audited core is identified.

Reason: the first credible audited target tested on August 19, 2026
(`@stablelib/tss`) already failed the transparency requirement.

**Status after owner call:** accepted. The follow-up implementation-planning note
is `docs/audit-triage/shamir-v3-migration-plan-2026-08-19.md`.

## Recommended PR 2 backend target

As of **Wednesday, August 19, 2026**, the strongest browser-friendly candidate
we found for the **v3** path is **Privy's `shamir-secret-sharing`** package.

Why it currently leads:

- public TypeScript source
- explicit **Node + browser** support in its README
- explicit public audit references from **Cure53** and **Zellic**
- package metadata that exposes both **ESM** and default entries and marks
  `node:crypto` unavailable in browser builds rather than relying on hidden
  Node polyfill assumptions

Why this is a **v3 candidate**, not a v2 swap candidate:

- its share format is its own raw output, not Veyrnox's 88-byte v2 envelope
- no evidence suggests it reproduces Veyrnox's current `y` bytes
- its API is async and browser-oriented, so adoption still requires a versioned
  adapter layer in `shamir.js`

Honest caveats before merge:

- the npm package visible during this review is still **0.0.4**
- the package was published **2 years ago** on npm, so recency alone is not a
  strong maintenance signal
- the audit signal is about the library itself; it does **not** audit
  Veyrnox's envelope design, bundle codec, or migration logic
- we have not yet run a local install/build spike for this candidate inside the
  Vite/Capacitor bundle

## If we pursue Path A, minimum acceptance criteria

Before any code lands:

1. Add deterministic parity fixtures:
   same secret + same RNG bytes -> identical share bytes vs legacy code.
2. Prove all existing `shamir.test.js`, `shamir.forgery.test.js`,
   `shardBackup.test.js`, and `personalBackup.e2e.test.js` stay green.
3. Keep the current 88-byte envelope unchanged.
4. Preserve existing fail-closed errors or document every changed error surface.
5. Preserve zeroization discipline at least to today's level.

If any one of these fails, it is not Path A anymore; it becomes Path B.

## If we pursue Path B, minimum design requirements

1. Add a new envelope version rather than mutating v2 semantics in place.
2. Keep v2 combine support for already-created bundles.
3. Add explicit cross-version tests:
   - v2 split -> v2 combine
   - v3 split -> v3 combine
   - v2 and v3 do not silently mix
4. Decide migration posture:
   - lazy on export only
   - explicit re-export / rotate action
   - no silent upgrade on restore
5. Update docs honestly:
   `Feature-Status`, shard spec, and audit tracker must say this was a scheme
   migration, not a transparent library replacement.

## Owner decisions needed

1. `#1833` becoming a **versioned migration** instead of a pure dependency
   swap: **approved**.
2. Preserving old locally-generated bundles vs only shipped/prod artifacts:
   **still open**.
3. Browser-native audited package vs carefully-reviewed WASM-backed core:
   **still open**.

## Status after the spike

- No migration was merged.
- The local `@stablelib/tss` experiment was backed out.
- Focused Shamir / Personal Backup suites returned to green after rollback.

That spike was still useful: it proved the main hidden risk in `#1833` is
**scheme compatibility**, not dependency wiring.
