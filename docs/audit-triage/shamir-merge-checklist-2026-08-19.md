# Shamir Merge Checklist (2026-08-19)

> Strict **go / no-go** checklist for issue **#1833**:
> [replace hand-rolled Shamir with audited library](https://github.com/VEYRNOX/veyrnox/issues/1833).
>
> Date basis: **Wednesday, August 19, 2026**.
>
> This checklist is intentionally narrower than the design note and migration
> plan. It is the review gate to use when deciding whether a PR for `#1833`
> may actually merge.

## Merge rule

`#1833` is **mergeable only if every required item below is YES**.

If any required item is NO, UNKNOWN, PARTIAL, or "follow-up after merge", the
PR is **not merge-ready**.

## Go / No-Go

### 1. Scope isolation

- [ ] The PR contains only the Shamir-library migration scope.
- [ ] No unrelated AI, auth, send, referral, or subscription files are mixed in.
- [ ] No files that belong only to `PR #1881` were touched as part of this work.
- [ ] The diff is reviewable as one deliberate migration step, not a catch-all branch cleanup.

**No-go if:**
- unrelated work is bundled in
- the branch needs "ignore these other files"
- reviewers cannot tell which files are required for the Shamir change

### 2. Migration posture is explicit

- [ ] The PR clearly states whether it is:
  - Path A: compatible audited-core swap, or
  - Path B: versioned v3 migration
- [ ] The implemented path matches `docs/audit-triage/shamir-library-swap-design-2026-08-19.md`.
- [ ] The PR does not describe a scheme change as a transparent "drop-in swap".

**No-go if:**
- the PR language implies byte-for-byte compatibility that was not proven
- old and new schemes are mixed without an explicit version boundary

### 3. Compatibility / recovery safety

- [ ] Existing v2 share artifacts can still be restored, or the PR explicitly and honestly removes that guarantee with owner sign-off.
- [ ] Cross-version behavior is defined and tested.
- [ ] Mixed-version share sets fail closed.
- [ ] Existing Personal Backup export / restore flows remain recoverable under the documented policy.

**No-go if:**
- restore compatibility is assumed rather than tested
- old bundles become ambiguous
- mixed-version inputs are "best effort" instead of hard rejected

### 4. Error surface and fail-closed behavior

- [ ] Malformed shares fail closed.
- [ ] Forged / tampered shares fail closed.
- [ ] Partial or mixed-version recovery attempts fail closed.
- [ ] User-visible errors remain honest and actionable.
- [ ] No path silently auto-upgrades or silently rewrites recovery material.

**No-go if:**
- restore mutates backup material as a side effect
- bad inputs are coerced into alternate interpretations
- the error contract is weaker or vaguer than the current one

### 5. Test evidence

- [ ] Focused Shamir tests are green.
- [ ] Focused shard backup / restore tests are green.
- [ ] Legacy compatibility tests are green.
- [ ] New version-router tests are green if Path B is used.
- [ ] No test was "fixed" by deleting or weakening the compatibility assertion it existed to protect.

Minimum expected coverage before merge:

- [ ] `src/wallet-core/__tests__/shamir.test.js`
- [ ] `src/wallet-core/__tests__/shardBackup.test.js`
- [ ] any v2 fixture / legacy restore tests added for this migration
- [ ] any mixed-version rejection tests added for this migration

**No-go if:**
- only the happy path is green
- legacy fixtures are missing
- tests were updated to match drift instead of proving intentional behavior

### 6. Library assurance

- [ ] The chosen library is named explicitly in the PR.
- [ ] The audit / assurance basis for that library is documented in the PR or linked design note.
- [ ] Browser / Vite / Capacitor compatibility is proven for the actual package used.
- [ ] The repo does not merely swap one unaudited custom-ish implementation for another under a new package name.

**No-go if:**
- the package assurance story is unclear
- the library has not actually been exercised in the target runtime
- the change is sold as "audited" without a concrete basis

### 7. Documentation alignment

- [ ] `docs/Feature-Status.md` matches the true state after the PR.
- [ ] The migration path is documented honestly.
- [ ] The PR does not claim "verified" or "independently audited" unless that happened.
- [ ] Follow-up docs for rotate / re-export behavior are present if Path B lands.

**No-go if:**
- docs still describe the old posture
- docs oversell the security outcome
- the repo would leave future reviewers with an inaccurate story

### 8. Review quality

- [ ] Every substantive review concern is either addressed or explicitly resolved with reasoning.
- [ ] No "we'll fix that after merge" item remains on the crypto or recovery path.
- [ ] The final PR state is clearly reviewable as LAND-READY.

**No-go if:**
- known migration uncertainty is deferred past merge
- review threads on compatibility / versioning / restore safety remain unresolved

### 9. Explicit sign-off

- [ ] Owner sign-off is explicit.
- [ ] Security sign-off is explicit if required by the final path.
- [ ] The sign-off matches the actual implemented path (compatible swap vs versioned migration).

**No-go if:**
- sign-off is assumed from earlier discussion
- sign-off was for a different migration shape than the code that landed

## Required merge summary

Before merging, the PR description should be able to answer all of these in one screen:

- What exact library was adopted?
- Is this a compatible swap or a versioned migration?
- Can existing v2 shares still restore?
- What happens on mixed-version share input?
- Which tests prove the answer?
- Who signed off?

If that summary cannot be written honestly and briefly, the PR is not ready.

## Current status on 2026-08-19

As of **Wednesday, August 19, 2026**, `#1833` should be treated as **NO-GO** for merge.

Why:

- the issue remains **open**
- the work is now understood as a **versioned migration**, not a trivial swap
- the assurance and compatibility bar is high
- explicit sign-off is still required

## Related notes

- `docs/audit-triage/shamir-library-swap-design-2026-08-19.md`
- `docs/audit-triage/shamir-v3-migration-plan-2026-08-19.md`
