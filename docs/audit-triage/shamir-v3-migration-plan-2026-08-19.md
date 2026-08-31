# Shamir v3 Migration Plan (2026-08-19)

> Follow-up to `docs/audit-triage/shamir-library-swap-design-2026-08-19.md`.
> This document assumes the owner-approved path for **#1833** is a
> **versioned migration**, not a transparent library swap.

## Goal

Introduce a **v3 Shamir share format** backed by an audited library while
preserving the ability to restore from existing **v2** shares and bundles.

This is a migration plan for the share layer only. It does **not** change the
vault cipher, KEK construction, or the Personal Backup product scope.

## Non-goals

- No silent reinterpretation of v2 shares as v3.
- No claim that v3 shares are "verified" or independently audited just because
  the library changes.
- No on-unlock hot-path migration.
- No forced re-export on first launch.

## Constraints from the current code

Current shipped/active assumptions:

- `src/wallet-core/shamir.js` emits and reads **88-byte v2 envelopes**
- `src/wallet-core/shardBackup.js` treats `SHARE_SIZE` as a stable contract
- `src/wallet-core/recoveryShare.js` wraps a single Shamir envelope as an opaque
  blob
- Personal Backup bundle JSON embeds the share bytes plus vault blob and vault
  hash; it does not understand multiple share versions on its own

This means the migration seam belongs in `shamir.js` and `shardBackup.js`, not
in the React UI.

## High-level design

### 1. Add v3 share envelopes

Keep v2 parsing intact. Add a new v3 envelope with its own version byte and its
own encode/decode path.

Principles:

- `combine()` becomes a version router:
  - all-v2 input -> v2 combine path
  - all-v3 input -> v3 combine path
  - mixed versions -> hard reject
- `split()` must emit only one version per runtime build
- version is selected explicitly by code path, not by "best effort"

### 2. Dual-read, single-write

Migration posture should be:

- **Read:** support both v2 and v3
- **Write:** emit v3 only once the new implementation is approved

This avoids silently extending the lifetime of custom-crypto v2 while still
keeping already-created bundles recoverable.

### 3. No silent upgrade on restore

Restoring from v2 bundles should recover the wallet, but it should **not**
silently mint replacement v3 bundles during the restore itself.

Reason:

- restore is already a high-risk path
- changing the user's backup material as a side effect is not I4-honest
- export/rotation is a separate explicit action

### 4. Explicit re-export / rotate path

After a successful v2 restore or v2-backed export load, the app may surface an
explicit "Rotate recovery shares" or "Upgrade backup format" action.

That action:

1. reconstructs the DEK from the old shares
2. emits a fresh v3 split
3. writes new bundles
4. leaves old bundles valid until the user confirms replacement

No automatic invalidation of v2 bundles until the product intentionally ships
that policy and documents it.

## Proposed v3 behavioural contract

### `shamir.js`

- `split(secret, n, k, opts?)`
  - default in the v3 PR: emit v3
  - optional explicit `{ version: 2 }` for tests/fixtures only, if needed
- `combine(shares)`
  - require all shares to agree on version
  - reject mixed-version arrays
- `SECRET_SIZE` remains 32
- `SHARE_SIZE` may no longer be a single constant if v2 and v3 differ in length

That last point is important: if the v3 library's wire format forces a different
size, the codebase should stop pretending there is one universal `SHARE_SIZE`.

Preferred replacement shape:

- `MIN_SHARE_SIZE` for broad validation where needed
- version-aware `getShareSize(version)`
- bundle codec accepts versioned shares by actual byte length, not one fixed
  exported constant

### `shardBackup.js`

Responsibilities:

- continue to gate Personal Backup by the existing flags
- split using the currently active share version
- combine from bundles by delegating share-version routing to `shamir.js`
- reject mixed-version bundle pairs early with a stable error

### `recoveryShare.js`

Treat the nested share as opaque bytes. The wrapper layer should not need to
understand Shamir internals beyond:

- bundle metadata / index
- passphrase wrap / unwrap
- actual byte length validation

If `SHARE_SIZE` becomes versioned, this file should validate via a helper, not a
single hard-coded size constant.

## Compatibility policy

### Must preserve

- existing v2 bundle restore
- existing v2 share combine
- existing fail-closed semantics on tamper / mismatch / wrong-vault restores

### Must reject

- v2 + v3 mixed share sets
- v2 share with v3 metadata spoof
- v3 share with v2 metadata spoof
- same-version but cross-generation mixed sets

## Test plan

### `shamir.test.js`

Add:

- deterministic v2 fixture remains readable forever
- deterministic v3 fixture once format is finalized
- mixed v2/v3 combine rejects
- v2 split -> v2 combine
- v3 split -> v3 combine

### `shamir.forgery.test.js`

Duplicate the core forgery/tamper cases for v3:

- corrupted envelope
- forged companion share
- stripped or mismatched authentication material

### `shardBackup.test.js`

Add:

- `splitDekForPersonalBackup()` emits v3 after the migration PR
- `combineDekForPersonalBackup()` accepts all-v2 or all-v3
- mixed-version bundles reject with a stable error

### `personalBackup.e2e.test.js`

Add two explicit flows:

1. v2 legacy fixture bundles -> restore succeeds
2. current v3 export -> restore succeeds

Do **not** collapse these into one generic test. The point is preserving the old
artifacts while shipping the new ones.

## Recommended PR split

### PR 1 — Versioned read-path groundwork

- add version router in `shamir.js`
- preserve v2 read path
- introduce version-aware share-size helpers
- add mixed-version rejection tests

No library swap yet. This shrinks the blast radius.

### PR 2 — v3 encoder + audited library integration

- add the audited library dependency
- implement v3 split/combine path
- add deterministic v3 fixtures
- keep v2 combine path intact

### PR 3 — Bundle/export plumbing

- update `shardBackup.js` / `recoveryShare.js` to support versioned sizes
- ensure export writes v3
- ensure restore accepts v2 and v3

### PR 4 — Explicit rotate / upgrade UX

- product-facing upgrade action after successful restore or export review
- copy, tests, and honest status notes

## Open technical decisions

1. **Does v3 keep an 88-byte envelope?**
   If the chosen audited library forces a different share body, probably not.
   The docs and helpers should be prepared for version-specific lengths.

2. **What is the acceptance bar for the audited library?**
   Suggested minimum:
   - public source
   - active maintenance
   - credible external review or audit signal
   - browser-usable in Vite/Capacitor without unsafe glue

3. **Do we preserve old locally-generated dev bundles forever?**
   If yes, v2 combine support may live for a long time.
   If no, we can document the support boundary as "recover any bundle generated
   before production rollout of v3" and later prune.

4. **Is WASM acceptable?**
   Still owner-open. If yes, the candidate set broadens materially.

## Current recommendation for PR 2

As of **August 19, 2026**, the recommended default candidate for the v3 backend
is **`shamir-secret-sharing`** (Privy), subject to a local integration spike.

Why this is the current front-runner:

- better public audit signal than the other browser-usable candidates examined
- documented browser support
- explicit package exports for ESM/default consumers
- no dependency stack to widen the production crypto surface

This recommendation is an inference from public package metadata and public
audit references. It is **not yet** proof that the package clears Veyrnox's
build or migration requirements.

### Acceptance checks before wiring it into `main`

PR 2 should not merge unless the local spike confirms all of the following:

1. `npm install shamir-secret-sharing` resolves cleanly in this repo without
   introducing unsafe Node polyfill glue.
2. `vite build` still succeeds for the shared web/native bundle.
3. focused wallet-core and Personal Backup suites stay green with the new v3
   route present.
4. v2 fixtures remain readable and unchanged.
5. deterministic v3 fixtures are added and pinned.
6. mixed-version rejection stays fail-closed at both raw-share and bundle
   layers.

### Non-requirement

PR 2 does **not** need byte-for-byte parity with v2. That is no longer the
goal after the owner-approved shift to a versioned migration.

## Honest status wording to use

When this work lands, the correct wording is:

- "v3 migration scaffolding BUILT" while dual-read exists but no real recovery
  trip has been device-verified
- not "verified"
- not "audited" unless the library itself and the integration path have both
  been covered by the relevant audit scope

## Recommended immediate next task

Open the implementation with **PR 1: versioned read-path groundwork**.

That gives the codebase the shape required for migration without committing yet
to a final audited dependency, and it turns `#1833` from a vague "swap libs"
ticket into a controlled, testable sequence.
