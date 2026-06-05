# Veyrnox — Feature Salvage Roadmap

> Goal: salvage the retainable surface — wire unwired "shell" pages to real data
> and turn fakes into working features — rather than delete them. Built from the
> 2026-06-04 classifier signal (Production-reality-audit-TODO.md), so per-feature
> placement is an ESTIMATE, not verified. Step 1 for every item: read the page and
> confirm its real starting state. This is the product build roadmap, not a quick
> pass; much is GATED on launch blockers and one architecture decision.

## Tier 1 — QUICK WIRE (real data source already exists in-app)
Likely just need pointing at data the app already has. Lowest effort, verify first.
- Watchlist, PriceAlerts, SmartAlerts — existing price feed.
- NetWorthTracker, SpendingPatterns, PLTracking, PortfolioSnapshots — real vault
  portfolio (WalletPortfolioPage already reads it).
- FeeAnalytics, Calculator — real tx/fee data.
- AddressBook, SessionManager, NotificationCentre — local state, likely near-real.
RISK: low. No new external deps.

## Tier 2 — NEEDS INTEGRATION (new external data/API)
- ERC20Discovery — token-discovery indexer.
- NFTPortfolio, MultiChainNFT — NFT indexer.
- OnChainAnalytics, AdvancedAnalytics, Analytics, PortfolioBenchmark,
  CorrelationMatrix, AssetCorrelationTimeline — market/on-chain data provider.
- PriceCharts — real OHLC feed.
- NewsSentimentPage — news/sentiment API.
- TaxReport, InvoiceGenerator — real tx history + export.
RISK: medium. Each adds a dependency + a trust/privacy decision (a self-custody
wallet leaking addresses to an indexer is a real concern — prefer privacy-respecting
or user-configurable providers).

## Tier 3 — GATED ON LAUNCH BLOCKERS
- SolanaTokens — needs the Solana SEND/SPL path built (receive-only now).
- Multi-asset balance/send — gated on per-asset send verification (1 of 10 done).
  Cannot be honest across assets until verified.
- FraudDetection — point at the REAL anomaly engine; honest-disable interim.
- Anything mainnet — gated on the independent audit.
RISK: high / sequenced. Off-keyboard verification first.

## Tier 4 — ARCHITECTURE DECISION (may be unsalvageable as-is)
Need a SERVER, which conflicts with the serverless "seed-is-identity" architecture
you established by removing base44.
- Leaderboard, PublicProfiles, ReferralTracker, SharedPortfolioView.
DECISION: (a) accept a minimal backend (reintroduces server + privacy surface),
(b) cut as incompatible with serverless self-custody, or (c) redesign serverlessly
(e.g. signed local export, no server). Until decided: honest-disabled, NOT faked.

## Sequencing
1. VERIFY first (Production-reality-audit-TODO.md). Some shells may already be real.
2. Tier 1 quick-wires — fastest honest wins.
3. Honest-disable known fakes NOW (ERC20Discovery, SolanaTokens, FraudDetection) so
   the app stops lying while real versions are built — same move as AIAssistant #89.
4. Tier 2 integrations — one provider decision at a time.
5. Tier 3 — after off-keyboard blockers move.
6. Tier 4 — make the architecture call explicitly; don't drift into a backend.

## Guardrails
- Never re-introduce fabricated-data-as-real to fill a feature. Honest-disable until real.
- Privacy: every external source is a potential address-leak; prefer configurable/private.
- Keys/signing follow wallet-core RNG + audit discipline.
- Update Feature-Status.md only as each feature becomes genuinely real — never from intent.

## Related
- docs/Production-reality-audit-TODO.md — per-page signal + verify methodology
- docs/Production-readiness.md — launch blockers this roadmap is gated on
- docs/Feature-Status.md — update as features become real
