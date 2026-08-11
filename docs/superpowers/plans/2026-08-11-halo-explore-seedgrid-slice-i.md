# Slice I — Halo bump + explore-dashboard kill + SeedInputGrid on Have + Recovery Bay + tagline (PLAN v4)

**Date:** 2026-08-11
**Worktree:** `/var/folders/l3/4f36t9jn439c8fk_1zqgx8pc0000gn/T/veyrnox-slice-i`
**Status on ship:** BUILT. NOT verified — no real-device trip. Independent audit outstanding.

## Goal (one line)

Make the entry-tiles halo actually visible, kill the redundant explore dashboard on tile-flow, upgrade Have import from raw textarea to `SeedInputGrid` (with safe fail-closed paste-split), give the Advanced restore screen the "Recovery Bay" treatment (aurora + animated safe + scanner readout + drag-and-drop), and update the entry-tiles tagline to name the AI Security Advisor.

## Ground truth from recon

- Halo already exists (Slice E) but too subtle at `opacity-[0.85] blur-[32px]` gradient stops `rgba(74,218,194,0.55)→0.08`. Reads near-invisible on black.
- Redundant explore dashboard: `WalletEntry.jsx:1329` `if (vaultExists === false && exploreMode && !generatedSeed)` intercepts the tile flow. Fix: `&& !chosenPath` guard.
- Have flow uses raw `<textarea>` at `WalletEntry.jsx:1694-1697`. SeedInputGrid (`src/components/SeedInputGrid.jsx`) has NO paste handler today (verified `SeedInputGrid.jsx:31`, no `onPaste`) — earlier plan drafts claimed otherwise, that was wrong.
- `doImportWallet` signature (`WalletEntry.jsx:1027`) currently takes NO args, reads `importPhrasePin` state. Must add `mnemonicOverride` param — same pattern as `doCreateWallet(mnemonicOverride)` per `:1185` comment.
- Referral persistence side-effect in current submit at `WalletEntry.jsx:1743` (`if (referralInput.trim()) setPendingReferral(...)`) must be preserved in the new SeedInputGrid `onSubmit`.
- Explore-intercept test mount sequence: starting the provider mock with `exploreMode:true` renders ExploreShell FIRST — never reaches EntryTiles. Start with `exploreMode:false, hasVault:false`, tile-tap Have, walk PIN, then flip `exploreMode:true` (mirrors `WalletProvider.jsx:1385` `setupPin`).
- Advanced restore surface: `src/components/backup/RestoreFromFile.jsx:141` currently only handles `input.onChange` + click-select. NO drag/drop handler exists. Design-ref: `/private/tmp/.../scratchpad/design/restore-funky.html` (Recovery Bay treatment with animated safe: door swings 55° every 3.8s + dial spins gold + handle turns + glow flash).
- Owner-verified 2026-08-11 that "AI Security Advisor" is a shipping component (`src/components/SecurityAdvisor.jsx`, 29 tests, `docs/SecurityAdvisor-TIP-integration.md`) — copy claim is honest per I4.

## Files touched

**EDIT**
- `src/components/EntryTiles.jsx` — bump beam/emitter opacity + gradient stops (values below); add radial glow behind the logo hex; tagline verbatim.
- `src/components/WalletEntry.jsx` — `&& !chosenPath` guard on explore-intercept branch (`:1329`); swap raw textarea → `<SeedInputGrid>` in Have fast-path preserving the amber "Never type..." warning; `doImportWallet(mnemonicOverride)` signature; fold `setPendingReferral` into the SeedInputGrid `onSubmit`.
- `src/components/SeedInputGrid.jsx` — add `handlePaste(event, index)` with fail-closed overflow (spec below). No other changes.
- `src/components/backup/RestoreFromFile.jsx` — Recovery Bay redesign per §Advanced below.
- `e2e/onboarding.spec.js` — update the Have flow assertion at `:208` to wait for SeedInputGrid instead of the old textarea; add negative assertion that ExploreShell is NOT rendered mid-flow.

**NEW**
- `src/components/__tests__/EntryTiles.halo-visibility.test.jsx`
- `src/components/__tests__/EntryTiles.tagline.test.jsx`
- `src/components/__tests__/WalletEntry.explore-skip-on-chosenPath.test.jsx`
- `src/components/__tests__/WalletEntry.have-uses-seedinputgrid.test.jsx`
- `src/components/__tests__/SeedInputGrid.paste-split.test.jsx` — paste-split behavior with fail-closed cases.
- `src/components/backup/__tests__/RestoreFromFile.funky.test.jsx` — Recovery Bay kicker + safe elements + drop handler + reduced-motion collapse + 4 readout steps.

## Implementation

### 1. Halo bump (`EntryTiles.jsx`)

Slice E's animation contract untouched — only CSS values.

- `.vx-lamp-beam`: `bg-gradient(rgba(74,218,194,0.9), rgba(74,218,194,0.35) 40%, rgba(74,218,194,0.08) 70%, transparent 90%)`, `blur-[24px]`, `opacity-100`.
- `.vx-lamp-beam-inner`: `bg-gradient(rgba(123,235,215,0.85), rgba(74,218,194,0.25) 45%, transparent 80%)`, `blur-[10px]`, `opacity-90`.
- `.vx-lamp-emitter`: `radial-gradient(ellipse at top, rgba(123,235,215,0.9), rgba(74,218,194,0.4) 40%, transparent 70%)`, `blur-[16px]`, `opacity-100`.
- NEW logo halo: absolutely-positioned circle behind the logo hex, `radial-gradient(circle, rgba(74,218,194,0.5), rgba(74,218,194,0.12) 45%, transparent 70%)`, `blur-[12px]`, `pointer-events:none`, z-index 0. Logo above with z-index 1.
- `isLowEndDevice` + `prefers-reduced-motion` gates unchanged.

### 2. Explore-dashboard skip (`WalletEntry.jsx:1329`)

```
if (vaultExists === false && exploreMode && !generatedSeed && !chosenPath) {
```

`chosenPath` is null outside the tile flow, so the legacy explore path (`enterExplore()` from elsewhere) still hits this branch.

### 3. SeedInputGrid in Have (`WalletEntry.jsx` + `SeedInputGrid.jsx`)

Replace the `<textarea id="wallet-seed-import-pin">` block (`:1694-1697`) + surrounding submit button with:

```jsx
<SeedInputGrid
  submitLabel="Restore / Import"
  disabled={busy}
  onSubmit={async (mnemonic) => {
    if (referralInput.trim()) setPendingReferral(referralInput.trim().toUpperCase());
    await doImportWallet(mnemonic);
  }}
/>
```

Amber "Never type your seed phrase anywhere..." warning above the grid stays unchanged.

**`doImportWallet(mnemonicOverride)` signature change:** use override if `typeof mnemonicOverride === 'string' && mnemonicOverride.length > 0`, else fall back to state read. Legacy call sites (none currently pass args) keep working.

**`handlePaste(event, index)` in SeedInputGrid** — fail-closed paste-split:

1. `event.preventDefault()` FIRST (kills default one-box paste).
2. Tokenize clipboard on `/\s+/`, trim empties, lowercase.
3. If `index === 0` AND token count ∈ {12, 15, 18, 21, 24}: AUTO-RESIZE grid to that count, fill all boxes from 0, clear any error. (Auto-resize is ONLY for a paste into box 0 — a full-phrase paste elsewhere reflects wrong intent.)
4. Else if `index + N <= count`: fill from `index` forward.
5. Else: **FAIL CLOSED** — no boxes modified, `setError('Pasted phrase does not fit — pick 12/15/18/21/24 words or paste again.')`. No per-word feedback (no-oracle preserved).

Codex v4 P1 fix: the `index === 0` prerequisite on step 3 is what makes case (c) — 24 words pasted into box 5 with grid at 12 — go through step 4 (fits check: `5 + 24 > 12` → false) → fail closed. Without it, step 3 would fire regardless of `index` and silently overwrite the grid.

Regression tests: (a) 12 into box 0 at count 12 → all filled; (b) 24 into box 0 at count 12 → auto-resize to 24, all filled; (c) 24 into box 5 at count 12 → fail-closed, no fill, error set; (d) 8 into box 3 at count 12 → boxes 3-10 filled; (e) 13 tokens (unsupported) → fail-closed. No test asserts a rejected paste modifies box state or reveals per-word info.

### 4. Recovery Bay Advanced (`RestoreFromFile.jsx`)

Design ref: `restore-funky.html` scratchpad. Port to React:

- "RECOVERY BAY" kicker in mono uppercase teal.
- Headline "Restore from backup" in the same gradient-fade as WalletCreatedFlash.
- Aurora + subtle scan-grid background (both `pointer-events-none`, `z-index:-1`).
- Animated safe SVG (110x100): body (gold border), door swings `rotateY(-55deg)` at 55-75% of a 3.8s cycle, dial spins gold, handle turns, warm glow flash from behind door when open.
- Dropzone: dashed teal border card with the safe centered. Now also handles **native drag-and-drop** on web:
  - `onDragOver` — `event.preventDefault()`, add hover state.
  - `onDrop` — `event.preventDefault()`, read `event.dataTransfer.files[0]`; if the file's name ends in `.enc`, dispatch to the existing envelope handler; else fail-closed with visible error "Only .enc backup files are accepted." Preserve Android's `startSelect`/Downloads-browser and iOS Files picker paths — drag/drop augments, doesn't replace.
- Copy: dropzone reads "Drop .enc file here / or tap to pick from your files". CTA reads "Select backup file". Scanner readout preserves the 4 existing steps verbatim (read local, unlock with password/PIN, set fresh device PIN, replaces current wallet).
- `prefers-reduced-motion` collapses safe animation to static open-mid-frame + aurora to zero motion.

### 5. Tagline (`EntryTiles.jsx:149`)

`Self-custody, Coercion-Resistant, AI Security Advisor. Your keys stay on this device.`

## Test invariants

- **Halo:** computed style `.vx-lamp-beam` opacity ≥ 0.95, blur ≤ 28px, gradient stop 0% opacity ≥ 0.85; logo halo element present with `pointer-events-none`.
- **Tagline:** verbatim string; grep-guards `/shamir|shard|2-of-3/i` absent.
- **Explore-skip:** mount sequence per §Ground truth — start `exploreMode:false`, tile-tap Have, walk PIN, mock `setupPin` flips explore true → assert NO ExploreShell mid-flow. Source-scan regression: guard string `!chosenPath` present in explore-intercept condition.
- **SeedInputGrid on Have:** advance to Have PIN done → assert `<SeedInputGrid>` rendered, `<textarea id="wallet-seed-import-pin">` absent. Referral input propagated to `setPendingReferral` when non-empty.
- **Paste-split:** 5 cases above; grep-guard for absence of `/word\s+\d+.*invalid|checksum/i` in paste code path.
- **Recovery Bay:** kicker "RECOVERY BAY" present; safe body/door/dial elements present with animation classes; `prefers-reduced-motion` toggle removes animation classes; all 4 readout steps preserved; drop handler `onDrop` present + rejects non-`.enc` files with visible error.
- **e2e:** `onboarding.spec.js:208` waits for SeedInputGrid; ExploreShell not seen between Have-tile tap and SeedInputGrid mount.

## Security invariants preserved

- **I1** keys-on-device — unchanged.
- **I2** no silent egress — CSS/copy/UI only.
- **I3** deniability — no new storage writes; explore-skip is a render-branch guard only.
- **I4** fail-honest — SeedInputGrid paste-split fails CLOSED on overflow/unsupported counts; RestoreFromFile drop rejects non-`.enc`; SeedInputGrid preserves its no-oracle invariant. AI Security Advisor copy names a real shipping component.
- **PIN-FIRST** unchanged — explore skip does not remove any PIN gate; only prevents the intermediate dashboard from flashing between PIN and seed entry.

## Non-goals

- No changes to Slice G+H files (WalletCreatedFlash, BackupNagSheet, backupNag, useBackupNag).
- No changes to SeedInputGrid submission validation, no-oracle contract, or word-count selector logic — only ADD `handlePaste`.
- No changes to PIN flow, KEK gate, RASP.
- No mainnet flag changes.
- No changes to Android/iOS platform-picker paths in RestoreFromFile — drag/drop is an ADDITIVE web enhancement.

## Codex plan-review fix log

- **v1 P1 (a) doImportWallet no-arg** — fixed: `mnemonicOverride` parameter, spec above.
- **v1 P1 (b) SeedInputGrid paste-split absent** — fixed: `handlePaste` added, fail-closed spec above.
- **v1 P2 (c) referral drop** — fixed: folded into `onSubmit` closure.
- **v1 P2 (d) chosenPath internal state / e2e wait** — fixed: mount sequence + e2e update spec above.
- **v2 P1 paste overflow fail-closed** — fixed: 5 cases including 24-into-12-at-box-5 → fail closed.
- **v2 P1 explore test mount sequence** — fixed: `exploreMode:false` start, then flip after PIN.
- **v3 P1 paste fix internal contradiction (SeedInputGrid missing from EDIT list, "no changes to SeedInputGrid" in non-goals)** — fixed: SeedInputGrid listed as EDIT; non-goal narrowed to "no changes EXCEPT `handlePaste`".
- **v3 P1 "Drop .enc file here" copy without drop handler** — fixed: `onDragOver` + `onDrop` handler added to Recovery Bay dropzone with fail-closed non-`.enc` rejection.

## Open honest gaps (record in Feature-Status on ship)

- Halo visibility values are aesthetic — no golden target; may need further tuning after real-device viewing.
- Safe animation reads well at 3.8s cycle; may want to speed up or slow down after real usage — not tuned.
- Drag-and-drop is web-only; native mobile builds continue to use their picker paths (not a regression, just an asymmetry).
