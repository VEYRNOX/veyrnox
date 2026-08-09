# Personal Backup — Phase 2 Plan

Goal: **DEK is Shamir-split (2-of-3), Share A replaces the full-DEK wrap on
device.** Cache path (Phase 1b) still works because it caches the reconstructed
full DEK. `shamirEnabled: true` on migrated vaults. No cloud, no physical
export, no recovery UX — those are Phase 3+.

Spec: `docs/cloud-recovery-shard-spec.md` §4 (Share A) + §12.4 (migration).

## Prerequisite: AAD v:3 (#1111)

Spec calls this a hard prerequisite so the share envelope binds AAD from
day one. `#1111` is open, plan-r2 done, implementation blocked on owner
decisions.

**Options:**

1. **Land AAD v:3 first** as its own PR. Small (vault-blob field), no wallet-
   flow change. Clean but adds one PR cycle. **Recommended.**
2. Skip AAD v:3, do Phase 2 without AAD binding, add later. Costs a second
   migration across the same file family.
3. Bundle AAD v:3 into Phase 2's PR. Biggest single PR, highest review load.

## Files to change

| File | Change | LOC est. | Risk |
|---|---|---|---|
| `src/wallet-core/vault.js` | Add `shamirIndex`, `shamirEnabled` fields to blob; envelope v:3 bump; backward-compat readers | +40 | mid — vault blob shape |
| `src/wallet-core/keystore/dekLifecycle.js` (new) | Split full DEK → 3 shares (via `shamir.split`); reconstruct DEK ← 2 shares (via `shamir.combine`); wrap Share A under KEK | +200 | low — pure helper, tested standalone |
| `src/wallet-core/keystore/native.js` | Enroll path: split DEK, wrap Share A instead of full DEK; Unlock path: read Share A → reconstruct → cache; Migration path (see below) | +80 | HIGH — hot path, `_unlockInner` again |
| `src/wallet-core/keystore/__tests__/dekLifecycle.test.js` (new) | Round-trip, wrong-share, tampered, single-share-can't-reconstruct | +150 | low |
| `src/wallet-core/keystore/__tests__/native.shamir-split.test.js` (new) | Enroll writes Share A shape; unlock reconstructs; migration flips `shamirEnabled` on next PIN change | +200 | mid |
| `docs/Feature-Status.md` | Status: Personal Backup Phase 2 BUILT | +20 | trivial |

Total: **~700 LOC** across ~6 files (JS/tests/docs).

## Migration strategy — the important bit

Existing users have `shamirEnabled: undefined` (i.e. v:2 vault with full-DEK
wrap). Options for migrating them:

- **A. Opportunistic on PIN change** (mirrors the KEK-v3 upgrade pattern
  landed in the C-1 saga). PIN never rotates → vault stays on full-DEK
  indefinitely. Cheap, defensible, but slow rollout.
- **B. Opportunistic on next unlock** (write-back on cache-miss). Rewrites
  the vault on every device that hasn't migrated. Bigger blast radius —
  a bad blob-write on unlock is how the debug-cert saga chained. Rejected.
- **C. Explicit user-triggered upgrade** — a Settings action "upgrade
  protection". Zero surprises. But nobody clicks it.
- **D. Both A + C**: opportunistic on PIN change AND an explicit Settings
  button for users who want the upgrade sooner.

**Recommend D.** Matches the "clean closure" already documented for KEK-v3
in `CLAUDE.md` (line ~148).

## Test coverage (TDD, per veyrnox-security-tdd)

**dekLifecycle.test.js:**
- 2-of-3 round-trip: split → any 2 combine → same DEK
- Single share alone throws `INSUFFICIENT_SHARES` (delegate to `shamir.js`)
- Tampered share (any of A/B/C) throws generic `SHARE_CORRUPT`
- Contract test: imports only from `./shamir.js`, `./kek.js`, `./dekCache.js`
- Zeroization: intermediate share arrays wiped on every path

**native.shamir-split.test.js:**
- Enroll: writes `shamirIndex: 1`, `shamirEnabled: true`, Share A wrap (not
  full DEK wrap) to `vault_v1`
- Unlock steady-state: cache hit skips Shamir entirely (Phase 1b path)
- Unlock cache-miss: falls back to Shamir combine using Share A + local
  reconstructed share, DEK recovered, cache repopulated
- Migration: v:2 vault with `shamirEnabled: undefined` unlocks same as
  today; after `changePassword`, `shamirEnabled: true` and Share A wrap
  replace the full-DEK wrap
- Cross-slot separation: Share A blob is NOT interchangeable with a
  legacy full-DEK wrap (distinct AAD — likely new `dekLifecycle` AAD)

## Codex review considerations

- Codex flagged PR #1635 (flagged-off wrapper) as [P1]. Phase 2 is more
  DEK-touching code and will be flagged again unless we cite the
  AGENTS.md override (recorded in PR #1640 as `44c5b805`).
- PR body should quote:
  > *"Personal Backup override (2026-08-08, owner-authorized) — the
  > 2-of-3 Shamir DEK sharding is authorized to proceed to
  > implementation ahead of the independent audit."*
- Then run `codex review --base main` and paste result inline.

## Phase 2 as sub-PRs (recommended)

Same pattern as Phase 1 (a → b) reduced risk. Split Phase 2 into:

- **Phase 2a — `dekLifecycle` primitive.** New file + tests. No wiring.
  Mirror of Phase 1a (dekCache primitive).
- **Phase 2b — enroll/re-enroll writes Share A.** New vaults get split
  DEK. Existing vaults untouched. Migration path is Phase 2c.
- **Phase 2c — migration on PIN change + Settings upgrade action.**
  Existing users' full-DEK vaults flip to Share A when they change PIN
  or explicitly upgrade.

Each phase is Codex-clean before the next. Total: **3 PRs**, each ~200-300
LOC, each shipping honest TARGET tag until Phase 3+ independent audit.

## Not in Phase 2

- Cloud storage for Share B (Phase 3)
- Physical export for Share C (Phase 4)
- Recovery UI to assemble 2-of-3 (Phase 5)
- Deniability decoy shard sets (Phase 6)
- Real-device verification (gates Phase 7 / audit)

## Success criteria (honest)

Phase 2 = BUILT means:
- All new tests green
- Existing keystore + wallet-core suites still green
- Codex-clean pass on each sub-PR
- Owner review on Phase 2c migration path (touches installed base)

Phase 2 = NOT VERIFIED. Nothing user-facing changes; no on-chain txid
applies to a DEK-split refactor.

## Open decisions (owner)

1. AAD v:3 sequencing — do it first (recommended) or bundle with 2a?
2. Migration strategy — D (opportunistic + explicit) confirmed?
3. Sub-PR split — a/b/c three-PR sequence, or one big Phase 2 PR?
4. Settings "upgrade protection" action — build in 2c or defer to 3+?
