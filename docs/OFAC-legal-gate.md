# OFAC Sanctions Screening — Removed

**Status:** COMPLETELY REMOVED from the app. No OFAC screening (bulk SDN or
individual entries) is shipped.

This document is the audit record for the finding *"OFAC screening — legal review
gate still open before shipping."* The code closes that finding by completely
removing OFAC sanctions screening and documenting the real blocker: production
compliance requires an enterprise-licensed RUNTIME API, not a bundled snapshot or
off-by-default local list.

## What was removed and why

All OFAC sanctions screening has been removed:
- PR #263 removed the bundled OFAC SDN snapshot provider and data file
- All hand-curated sanctioned entries (including Ronin/Lazarus) have been deleted
- `scripts/refresh-ofac-blocklist.mjs` has been deleted

Rationale:

1. **Bundled snapshots are stale-by-design.** A sanctions list is a live legal
   fact. A file baked into a build cannot track OFAC **delistings** (e.g. Tornado
   Cash was delisted 2025-03-21 after *Van Loon v. Treasury*, 5th Cir.). A stale
   "sanctioned" flag becomes a false accusation.
2. **ToS constraints.** Automated bulk pulls from `treasury.gov` / mirrors carry
   commercial terms-of-service constraints; a CI cron that re-bundles them is not
   a clean basis to ship on.
3. **Honesty (I4 — fail honest, fail closed).** OFAC screening requires live
   compliance data, not local heuristics. We do not ship incomplete security
   controls or fake coverage.

## Path to production compliance (external gate)

To ship OFAC sanctions screening:

1. **Independent legal review** of sanctions-compliance posture — external, not
   resolvable in code. "Internal" review is never presented as "independent".
2. **Wire in an enterprise-licensed RUNTIME API** (Chainalysis, TRM Labs, Elliptic,
   etc.) as an explicit, disclosed, **opt-in** provider via the `providers` option
   in `screenAddress()`. This keeps coverage delisting-current without bundling a
   stale file or relying on CI crons pulling from ToS-constrained sources.

A bundled snapshot is **NOT** a solution — it cannot solve the staleness problem
that makes OFAC screening so critical.

## The contract (pinned by tests)

`src/wallet-core/evm/__tests__/suspicious.ofac-honest.test.js` fails if anyone
re-introduces OFAC screening in any form. It asserts:

- `DEFAULT_BLOCKLIST` has zero `sanctioned` entries (OFAC removed).
- No `ofacSanctionsProvider` / `makeOfacProvider` is exported.
- No `src/wallet-core/data/ofac-sanctioned.json` file exists on disk.
- No `scripts/refresh-ofac-blocklist.mjs` exists on disk.
- This doc exists and records the removal, the rationale, and the path forward
  (enterprise-licensed runtime API only).

## Status tag

- **OFAC sanctions screening:** REMOVED (completely absent from shipped code).
  Audit finding closed by removing the incomplete local-list implementation and
  documenting that production compliance requires an enterprise-licensed runtime API.
