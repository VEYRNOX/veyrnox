# Plan: EntryTiles + chosenPath hint (Slice D1)

**Date:** 2026-08-10
**Owner:** Al (via Claude Code orch-add-feature)
**Status on landing:** BUILT (code + unit tests + build clean). NOT verified — no on-chain onboarding walkthrough on device.
**Branch:** `claude/entry-tiles-slice-d1`, worktree `/var/folders/l3/4f36t9jn439c8fk_1zqgx8pc0000gn/T/veyrnox-entry-tiles/`

## Intent

Replace WelcomeHero's single "Get Started" screen with a 3-tile entry (New / Have / Advanced). Each tile sets a `chosenPath` hint that survives PIN entry; the existing `"choose"` view (Phase 2 post-PIN) then auto-selects the correct branch (create vs import) instead of asking again. Advanced tile keeps the existing `.enc` file-restore path (no PIN-first since backup file has its own password).

## Non-goals

- Change PIN-FIRST invariant. Both New + Have still route through `pin-create` before any seed handling.
- Delete WelcomeHero. Component stays in code as dead-but-safe (may be pruned in a follow-up once tile path is device-verified).
- Wire Personal Backup / Shamir shard recovery as the "Advanced" destination. Recon confirms no fresh-device entry point exists for that today — it's a Settings-area page. "Advanced" this slice = the existing `.enc` file restore, matching WelcomeHero's current secondary link.
- Change any post-unlock behavior. This is purely a pre-vault entry-picker slice.
- Introduce localStorage for the tile choice. In-memory React state only (I3 no residue).
- Add teach screens for the New path (design doc FR-2). Deferred.

## Files touched

| File | Change | New? |
|---|---|---|
| `src/components/EntryTiles.jsx` | 3-tile grid. Props: `onSelect(path: 'new'\|'have'\|'advanced') => void`. Reuses `Button` (with tile sizing via className) + lucide icons (`Wallet`, `Download`, `Shield` per existing WalletEntry convention). Copy: plain, honest, matches file's tone. | NEW |
| `src/components/__tests__/EntryTiles.test.jsx` | Unit tests (TDD RED first). | NEW |
| `src/lib/onboardingEntry.js` | `resolveOnboardingEntry` returns `'entry-tiles'` (new) instead of `'welcome'` when `hasVault === false`. Comment updated. | EDIT |
| `src/lib/__tests__/onboardingEntry.test.js` | Assert new default. Existing PIN-first invariant coverage preserved. | EDIT |
| `src/components/WalletEntry.jsx` | (a) Add `chosenPath` state (`'new'\|'have'\|'advanced'\|null`). (b) New render branch for `view === 'entry-tiles'` (rendered when `hasVault === false` post-probe). (c) `handleTileSelect(path)` sets `chosenPath` and routes: `'new'`/`'have'` → `setView('pin-create')`; `'advanced'` → `setView('restore-file')`. (d) In the `"choose"` view render (~L1589-1675), if `chosenPath === 'new'` auto-fire `doCreateWallet()`; if `chosenPath === 'have'` render the import textarea directly (no user re-choice). Clear `chosenPath` on success/back. (e) Retarget `setView('welcome')` back-references (`:1685`, `:1689`, `:1326`) to `setView('entry-tiles')`. (f) Keep `WelcomeHero` component + `view === 'welcome'` branch untouched (dead but safe). | EDIT |
| `src/components/__tests__/WalletEntry.web-authmodel.test.jsx` | Prepend a tile click (`getByRole('button', { name: /new wallet/i })`) before the existing `/get started/i` search — OR replace the search entirely with the tile path. Behavior tested must still be identical (PIN entry visible after tile-selected → auto-choose). | EDIT |
| `src/components/__tests__/WalletEntry.restore-file.test.jsx` | Same shape: prepend a tile click for the "Advanced" tile before searching for the restore-file screen. | EDIT |

**Not touched:** `PinSetup.jsx`, `KekEnrollmentGate.jsx`, `FirstReceiveCard.jsx`, `WalletProvider.jsx`, `WalletGate.jsx`, wallet-core, `SeedInputGrid.jsx`, `panic.js`, telemetry.

## Security invariants involved

| Invariant | How this change respects it |
|---|---|
| I1 keys on device | No key material touched. Tile selection is pre-vault UI state only. |
| I2 no silent egress | No new network calls. |
| I3 decoy-safe | `chosenPath` is in-memory React state, never persisted. EntryTiles renders no wallet data. Same pre-vault status as WelcomeHero — no explicit decoy gate needed (see recon §7). |
| I4 fail honest / fail closed | Advanced tile → existing `restore-file` flow (unchanged behavior). If `chosenPath` set but user cancels post-PIN, `chosenPath` clears; back-button lands on tiles (no orphan state). PIN-FIRST invariant preserved for New/Have (both go through `pin-create` first, no shortcut). |
| I5 backend untrusted | N/A. |
| I6 KEK hardware binding | Untouched. |

## PIN-FIRST invariant

Preserved. `resolveOnboardingEntry` now returns `'entry-tiles'` on `hasVault === false` (was `'welcome'`), but neither is PIN-bearing — they're both pre-PIN picker screens. New and Have tiles both call `setView('pin-create')`. `onboardingEntry.test.js` gains ONE new assertion (default is `'entry-tiles'`, not `'welcome'`) and keeps all existing PIN-first assertions intact.

## `chosenPath` auto-select shape in `"choose"` view

Current `"choose"` view (`WalletEntry.jsx:1589-1675`) shows two buttons: Create Wallet and Import an existing seed. With `chosenPath`:
- `'new'`: `useEffect` on mount fires `doCreateWallet()` once (idempotent via ref guard). No buttons shown while creation is in flight (`Spinner`).
- `'have'`: skip the two-button picker; render the import textarea + password directly.
- `'advanced'`: never reaches `"choose"` view (routes to `restore-file` at tile-select).
- `null`: existing two-button picker renders (backward compat if user arrives via a legacy path).

`chosenPath` is cleared:
- On successful `doCreateWallet` / `doImportWallet` completion (natural, they lead to KEK gate).
- On user back-button from `"choose"` (returns to tiles OR pin-create, per WalletEntry's existing back semantics).
- On mount from a wiped state (`WipedNotice` branch renders before any `chosenPath`-affected view).

## TDD RED tests

### `src/components/__tests__/EntryTiles.test.jsx` (5 tests)

1. **Renders 3 tiles with distinct accessible names** (`/new wallet/i`, `/have.*wallet/i` or `/import/i`, `/advanced/i`).
2. **Each tile invokes `onSelect` with its path.** Click "New" → `onSelect('new')`. Click "Have" → `onSelect('have')`. Click "Advanced" → `onSelect('advanced')`.
3. **`onSelect` fires exactly once per click** (idempotent, no double-fire).
4. **No localStorage writes.** Spy setItem, click all 3, assert zero.
5. **No wallet data reads.** No `useWallet` / `WalletProvider` import in the component's implementation OR the render must not error when mounted outside a `WalletProvider` (structural I3 guarantee that this pre-vault component holds no wallet state).

### `src/lib/__tests__/onboardingEntry.test.js` (extend existing)

- Add ONE test: `resolveOnboardingEntry({ hasVault: false })` returns `'entry-tiles'` (was `'welcome'`).
- All existing tests preserved (PIN-first invariant, `hasVault: true → 'unlock'`, etc.).

## Acceptance criteria

- All 5 new EntryTiles tests green.
- Extended onboardingEntry test green.
- Existing `WalletEntry.web-authmodel` + `WalletEntry.restore-file` tests updated + green.
- All other existing tests green (`panic`, `PinSetup`, `KekEnrollmentGate`, `FirstReceiveCard`, `security-copy`, `tracking-integration`, `FirstRunTour.placement`, `wallet-entry-wiped-ack`).
- Lint clean.
- Build clean.
- Preview-render: fresh device → EntryTiles renders 3 tiles → tap New → PIN screen → PIN entered → auto-creates wallet (no second choice screen). Tap Have from tiles → PIN screen → PIN entered → seed input renders directly. Tap Advanced from tiles → restore-file screen. (Same known "no browser tool" gap as Slice A/B/C.)

## Rollback

Single-commit revert: delete EntryTiles.jsx + its test, revert `onboardingEntry.js` default + test, revert WalletEntry.jsx state addition + view branch + auto-select, revert the two updated test files. No schema/storage/telemetry changes; WelcomeHero stays as-is throughout — reverting D1 means the app renders WelcomeHero on `'welcome'` again, no data loss, no residue.

## Deliberate simplifications

- No teach screens for New path (design FR-2). Deferred — separate slice.
- No dedicated "Advanced" hub — Advanced tile routes to existing `.enc` file restore (matches current WelcomeHero secondary link).
- No animation between tile → PIN transition (native `setView` shift, same as today's WelcomeHero → pin-create).
- WelcomeHero stays in code (dead but safe). Prune in follow-up after device-verify.
- Two existing tests updated in-place; no new WalletEntry integration test for the tile flow (the two updated tests already exercise the "click through to PIN" path, extending them is cheaper than adding a third).

## Follow-ups (deliberately left)

- Teach screens for New path (design doc FR-2).
- Advanced tile → Personal Backup / Shamir shard recovery entry point (Settings-area page reachable pre-vault requires design work).
- Delete `WelcomeHero` after device-verified rollout.
- Onboarding-tile telemetry event (`onboarding_tile_selected`) for the time-to-first-receive metric — Slice C's `first_receive_shown` alone doesn't need it, but a start-event closes the loop.
