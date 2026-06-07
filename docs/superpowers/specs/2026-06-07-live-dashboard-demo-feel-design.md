# Live dashboard — honest port of the demo's "finished feel"

**Date:** 2026-06-07
**Scope:** `src/pages/WalletPortfolioPage.jsx` (the live dashboard) + one new
`src/components/QuickAccessGrid.jsx`. Composition / visual / zero-state ONLY.
**Non-goal:** any behaviour change to a real data path. `useWallet()` /
`usePortfolio()` bindings are untouched; no new wallet-count surface.

## Why

`Dashboard.jsx` branches: live = `WalletPortfolioPage` (real on-device vault via
`useWallet()`), demo = `DemoDashboard` (seeded base44 mock). The demo *feels*
finished because it is populated and visually composed; the live view is honest
but comparatively bare, and a fresh wallet ($0, empty rows) reads as hollow. This
pass brings the demo's composition to the live view **without** importing any of
its dishonest affordances, and deliberately designs the $0 zero-state.

Memory constraint honoured: a prior minimalist restyle of the dashboard was
reverted — the user values the colourful, feature-rich layout (Quick Access
tiles). This pass makes the live view *more* finished/feature-rich, not flatter.

## Ported (the legitimate design)

1. **Total-balance treatment.** Keep live's honest block (uppercase tracked label
   · `4xl` bold value · `ReferenceRateNote` · existing "N wallets in this
   portfolio" caption). Tighten spacing to the demo's centered hierarchy. No
   change indicator, no count-up animation — the number just renders.
2. **Action cluster.** Live's existing **3-col** Send · Receive · Add wallet,
   restyled to the demo's polished `h-16` flex-col icon+label `variant="secondary"`
   buttons. "Add wallet" keeps its `!canManage` gating. (NOT 4-col — see Schedule
   below.)
3. **Per-wallet asset rows.** Restyle each asset row inside the wallet cards to
   the demo `TokenList` look: `CoinLogo` (40px) + symbol + asset name left, mono
   amount + `formatFiat` right, rounded rows with hover. Amounts/fiat come straight
   from `byWallet` (real). Wallet-card header (name, Active/Backed-up badges, menu)
   stays, restyled to `rounded-2xl` / `bg-card` / `border-border` rhythm.
4. **Quick Access colourful grid** — new `QuickAccessGrid.jsx`, rendered below the
   wallet breakdown. Colourful per-tile treatment preserved. Tile set is the
   **honest, verified-BUILT** subset (see Tile status below).

## NOT ported (dishonest / anti-principle)

- Fabricated 24h change (`totalUSD * 0.0234…`) and hardcoded `changePercent = 2.34`
  — live has no market data. No invented figures.
- Count-up balance animation (`requestAnimationFrame` easing) — violates "calm
  over flashy"; animating a real balance is gratuitous.
- The 🔔 emoji price-alert banner — design system says no emojis. (Live's
  unbacked-wallet warning, which uses the `ShieldAlert` icon, stays.)
- All base44 mock data/state.
- Activity / Analytics tabs — no real transaction history or market data to honour
  them on this surface (live has no Activity tab; a History *tile* covers the need).

## Zero-state — "Wallet ready" panel (the real gap)

**Condition:** active portfolio has wallet(s) but `pfTotal === 0`.
**Render:** instead of all-zero wallet cards, one calm composed panel:

- A `Wallet`/`Download` glyph in a `primary/10` circle.
- Heading: **"Your wallet is ready"**.
- Body: **"This portfolio has no balance yet. Receive crypto to fund it — your
  keys never leave this device."**
  (Precise per I1. NOT "address held only on this device" — the address is
  necessarily shared with RPC/explorer nodes to read balances; that claim would be
  false. See Check (b).)
- Prominent **Receive** button → `/receive` (funds the active wallet, consistent
  with the existing "Send/Receive use <wallet>" caption).
- A quiet **"Show all assets" / "Hide assets"** disclosure that expands the real
  per-wallet asset rows (restyled), so nothing is hidden dishonestly. Wording is
  asset-scoped with **no count** — cannot be misread as a wallet count. See
  Check (c).

Same component in real and decoy sessions (deniability). The unbacked-wallet
warning still renders above it. `pfWallets.length === 0` (empty portfolio) keeps
live's existing "No wallets in this portfolio" message — unchanged.

## Tile status findings (Check a — verified against Feature-Status.md AND code)

KEEP (✅ BUILT, real data, deniability-safe):
- `/tx-history` — TransactionHistory: real `useWallet()` + `txHistory.js`.
- `/security-dashboard` — SecurityDashboard (PR #53) read-only posture view.
  (Re-pointed from the demo's `/security` = SecurityCenter, the old base44
  session/device screen that §6 re-scoped out as deniability-conflicting.)
- `/token-approvals` — TokenApprovals: `evm/approvals.js` view + revoke.
- `/address-checker` — SuspiciousAddressChecker: `evm/suspicious.js` (PR #70).
- `/spam-filter` — SpamTokenFilter: real `evm/spam` annotate.
- `/address-book` — AddressBook: real per-chain validation on save.
- `/gas-fees` — GasFeeControl: live provider estimates into the signing path.

OMIT (dishonest — shell / mock / disabled):
- `/advisor` (AI Advisor) — LLM unavailable in local; §9 none built, disabled #89.
- `/analytics` — base44-mock shell, not core-wired, address-leaking.
- `/news-sentiment` (Sentiment) — hardcoded `MOCK_NEWS`; AI refresh disabled.
- `/risk` (Risk Score) — fabricated score; recommends removed out-of-scope
  features (yield farming, options, stop-loss bots).

DROP from action cluster:
- `/recurring` (Schedule) — honest schedule-only, but its wallet picker reads
  `base44.entities.Wallet` (localClient), disjoint from the real vault; don't
  promote a feature that can't reliably bind to a real wallet to a primary action.

Incidental red flags found (NOT this PR's scope, flagged for follow-up):
- `/network-manager` defaults to **Ethereum Mainnet active** — conflicts with the
  testnet-only hard rule.
- `/anomaly-detection` is a base44-mock shell; the real anomaly logic lives in the
  Send preview, not that page.

## Final Quick Access grid

`grid-cols-4` (4 + 3): **History · Security · Approvals · Address Check · Spam
Filter · Address Book · Gas & Fees**. Colourful per-tile icon backgrounds, ≥44px
tap targets, hover + active feedback (existing interactive-feedback rule).

## Components / boundaries

- `QuickAccessGrid.jsx` — pure presentational: a static tile array → `navigate`.
  No wallet data, no vault coupling. Usable later by DemoDashboard too (not
  required this PR).
- `WalletPortfolioPage.jsx` — gains: the zero-state branch (`pfTotal === 0`), the
  restyled asset rows, `<QuickAccessGrid />`. All existing dialogs and the
  `useWallet()` destructure are unchanged.

## Verification

- `npm test` green (no logic change expected; tests should be unaffected).
- Verify gate: live preview screenshots of (1) the $0 zero-state panel and (2) a
  funded wallet card with restyled rows + the Quick Access grid, before opening the
  PR. Real on-chain status is unaffected (no asset status touched).

## Constraints recap

One PR; composition/zero-state only; no real-data-path behaviour change;
real & decoy render identically; honest figures only; touches `src/` → PR + verify
gate.
