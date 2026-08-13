# OFAC Sanctions Screening — Owner override (2026-08-13)

**Status:** Owner has explicitly re-opened this gate. A hand-curated snapshot of
high-profile OFAC/SDN-listed addresses (Tornado Cash router + 3 pools, 2 Lazarus
Group wallets) is now bundled in `src/lib/threatIntelStore.js` `SEED_THREATS`.

## Owner override

The owner authorised bundling a bounded OFAC/SDN seed on 2026-08-13 despite the
staleness risk documented below. Trade-offs the owner accepted:

- **Snapshot may go stale between builds.** A delisting (e.g. Tornado Cash,
  delisted 2025-03-21 per *Van Loon v. Treasury*, 5th Cir.) will not update
  in-app until a new build ships. The Security Advisor system prompt discloses
  this and directs users to OFAC / OpenSanctions / Chainalysis for a live
  verdict.
- **Ships as a first-pass, NOT the source of truth.** A live TIP verdict from
  `screenTransaction` still overrides at runtime; the seed is a low-latency
  local check for the six pinned entries above.
- **Legal risk of a false accusation** on a since-delisted address is accepted
  because (a) the set is small and hand-curated, (b) each entry's `note` names
  the source snapshot rather than asserting current status, and (c) the Advisor
  paragraph naming Tornado Cash explicitly says the app cannot track delistings.

## What is bundled

`SEED_THREATS` entries with `category: 'ofac_sanctioned'`:

- Tornado Cash: router + 0.1 ETH pool + 100 ETH pool + proxy
- Lazarus Group (DPRK): 2 wallets

Every entry cites `source: 'OFAC SDN List (... snapshot)'` so the origin is
inspectable in the UI + in `docs/audit`.

## Historical rationale (retained for context)

The gate was originally closed for these reasons, which the owner has now
overridden:

1. **Bundled snapshots are stale-by-design.** A sanctions list is a live legal
   fact. A file baked into a build cannot track OFAC **delistings** (e.g. Tornado
   Cash was delisted 2025-03-21 after *Van Loon v. Treasury*, 5th Cir.). A stale
   "sanctioned" flag becomes a false accusation.
2. **ToS constraints.** Automated bulk pulls from `treasury.gov` / mirrors carry
   commercial terms-of-service constraints; a CI cron that re-bundles them is not
   a clean basis to ship on. (The override ships a hand-curated snapshot, NOT a
   scheduled bulk refresh.)
3. **Honesty (I4 — fail honest, fail closed).** OFAC screening requires live
   compliance data, not local heuristics. The Advisor now discloses the seed's
   snapshot nature and directs users to live sources.

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
