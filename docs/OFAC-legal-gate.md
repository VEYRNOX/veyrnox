# OFAC Sanctions Screening — Legal Gate

**Status:** HONEST-DISABLED for bulk SDN screening. A single citable sanctioned
entry ships; full OFAC SDN coverage is intentionally NOT shipped.

This document is the audit record for the finding *"OFAC screening — legal review
gate still open before shipping."* The code already closes that finding by
honest-disabling the bulk-screening path and recording the real blocker here,
rather than faking freshness with a bundled snapshot.

## What ships today

- `src/wallet-core/evm/suspicious.js` performs **local-only, advisory** recipient
  screening. It WARNS before signing; it never hard-blocks and never asserts an
  address is "safe" (absence from the list means "not flagged", not "safe").
- The default provider set (`DEFAULT_PROVIDERS`) is **local-only** —
  `localBlocklistProvider`, EVM-keyed, no network call (honours I2: no silent
  egress; I3: deniability mode makes zero backend calls).
- `DEFAULT_BLOCKLIST` carries exactly **one** hand-curated `sanctioned` entry:
  `0x098B716B8Aaf21512996dC57EB0615e2383E2f96` (US Treasury OFAC SDN, Apr 2022 —
  Lazarus Group / Ronin Bridge exploiter). It is individually citable and does
  **not** depend on any automated feed.

## What was deliberately removed (and why)

- **PR #263** (`fix(threat-intel): remove OFAC snapshot provider — enterprise API
  required for reliable sanctions coverage`) removed the bundled OFAC SDN snapshot
  provider, and a follow-up chore deleted
  `src/wallet-core/data/ofac-sanctioned.json`.
- `scripts/refresh-ofac-blocklist.mjs` is **RETIRED** (see its top-of-file banner:
  "Do not run it"). It is preserved for reference only.

Rationale (unchanged):

1. **Bundled snapshots are stale-by-design.** A sanctions list is a live legal
   fact. A file baked into a build cannot track OFAC **delistings** (e.g. Tornado
   Cash was delisted 2025-03-21 after *Van Loon v. Treasury*, 5th Cir.). A stale
   "sanctioned" flag becomes a false accusation. Wrapping a snapshot in a 7-day
   freshness timer does not fix this — it only re-labels a known-stale artifact as
   "fresh".
2. **ToS constraints.** Automated bulk pulls from `treasury.gov` / mirrors carry
   commercial terms-of-service constraints; a CI cron that re-bundles them is not
   a clean basis to ship on.
3. **Honesty (I4 — fail honest, fail closed).** A green "✓ snapshot fresh" check
   would assert coverage the architecture cannot honestly provide. We do not ship
   fake security controls.

## Blockers to full coverage (none are code-gateable here)

- **(a) Independent legal review** of sanctions-compliance posture — external, not
  resolvable in code. "Internal" review is never presented as "independent".
- **(b) An enterprise-licensed RUNTIME screening API** (Chainalysis, TRM Labs,
  Elliptic, …) wired in as an explicit, disclosed, **opt-in** provider via the
  `providers` option in `screenAddress()`. This keeps coverage delisting-current
  without bundling a stale file. A re-introduced snapshot is explicitly **NOT** the
  intended path forward.

## The contract (pinned by tests)

`src/wallet-core/evm/__tests__/suspicious.ofac-honest.test.js` fails if anyone
silently re-introduces the stale-snapshot machinery. It asserts:

- `DEFAULT_BLOCKLIST` has exactly one `sanctioned` entry (the Ronin/Lazarus
  address).
- `DEFAULT_PROVIDERS` is local-only (EVM family, no `ofac`/`snapshot`/`sdn`
  provider name, no BTC snapshot family).
- No `ofacSanctionsProvider` / `makeOfacProvider` is exported.
- No `src/wallet-core/data/ofac-sanctioned.json` exists on disk.
- This doc exists and records the status, the removal (#263), the surviving entry,
  and the legal-review blocker.

## Status tags

- Bulk OFAC SDN screening: **HONEST-DISABLED** (present in design, off on
  principle; blocked on legal review + enterprise API).
- Single citable Ronin/Lazarus advisory entry: **BUILT** (local, advisory,
  warn-not-block).
