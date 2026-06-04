# Veyrnox — 4-Tier Pricing Design (DRAFT / PROVISIONAL)

> STATUS: PLANNING DRAFT — NOT LIVE, NOT SELLABLE.
> Proposes a new SHIELD tier between Pro and Guardian. A pricing hypothesis for
> planning only. NOT the canonical tier model — that is docs/Tiers.pricing.md,
> which stays built-only. Promote parts of this into the canonical doc ONLY as
> features become real and prices are decided.
>
> Two hard caveats:
> 1. Prices are illustrative placeholders, NOT recommendations. Validate vs real
>    competitors and actual costs before any commitment.
> 2. Nothing here is sellable until the features in each tier are genuinely real.
>    Today Pro is mostly unbuilt shells, SHIELD mostly real, Guardian mixed. See
>    docs/Salvage-roadmap.md.
>
> Generated 2026-06-04.

## Tier structure
| | FREE | PRO | SHIELD | GUARDIAN |
|---|:--:|:--:|:--:|:--:|
| Price (DRAFT placeholder) | $0 | ~$5-8/mo | ~$15-25/mo | $100+/mo (bespoke) |
| Identity | Working wallet + basic safety | Analytics & power-user | Pro + active security | Bespoke + extreme protection + human service |
| Billing | — | monthly | monthly | monthly / annual / custom |

## Feature matrix (cumulative: Pro>Free, SHIELD>Pro, Guardian>SHIELD)
| Feature | Complete? | State | FREE | PRO | SHIELD | GUARDIAN |
|---|:--:|---|:--:|:--:|:--:|:--:|
| Send / Receive / Vault / Seed backup | Done | Real | Y | Y | Y | Y |
| Live balances (RPC) | Done | Real | Y | Y | Y | Y |
| Gas fee control | Done | Real | Y | Y | Y | Y |
| Address screening (basic safety) | Done | Real | Y | Y | Y | Y |
| Pre-sign scanner (basic safety) | Done | Real | Y | Y | Y | Y |
| Transaction history | Verify | Real? | Y | Y | Y | Y |
| Address book / Calculator / Notifications | No | Shell | Y | Y | Y | Y |
| Watchlist / Price alerts | No | Shell | | Y | Y | Y |
| Net worth / P&L / Spending patterns | No | Shell | | Y | Y | Y |
| Portfolio snapshots / Fee analytics | No | Shell | | Y | Y | Y |
| Analytics / Advanced analytics | No | Shell | | Y | Y | Y |
| Portfolio benchmark / Correlation / Timeline | No | Shell | | Y | Y | Y |
| On-chain analytics | No | Shell | | Y | Y | Y |
| NFT portfolio / Multi-chain NFT | No | Shell/Fake | | Y | Y | Y |
| Tax report / Invoice generator | No | Shell | | Y | Y | Y |
| News sentiment | No | Shell | | Y | Y | Y |
| HD wallet manager | Verify | Real? | | Y | Y | Y |
| Recurring payments / Payment links | No | Shell/Fake | | Y | Y | Y |
| Smart alerts | No | Shell | | Y | Y | Y |
| Session manager | No | Shell | | Y | Y | Y |
| Security dashboard | Done | Real | | | Y | Y |
| Anomaly detection | Done | Real | | | Y | Y |
| Spending limits | Done | Real | | | Y | Y |
| Stealth wallets | Done | Real | | | Y | Y |
| Audit log | Done | Real | | | Y | Y |
| Fraud detection | No | Fake | | | Y | Y |
| Token spam screening / filter | Verify | Real? | | | Y | Y |
| dApp domain check | Done | Real | | | Y | Y |
| Duress PIN | Done | Real | | | | Y |
| Panic wipe | Done | Real | | | | Y |
| Full deniability suite | Verify | Real, provisional | | | | Y |
| Hardware wallet | Done | Disabled (planned) | | | | Y |
| Inheritance / crypto-will | No | Removed (#82) | | | | Y |
| Human bespoke security service | Done | Service | | | | Y |
| Multi-asset / Solana / ERC-20 discovery | No | Fake/partial | NOT PRICEABLE (gated on per-asset verification + audit) | | | |
| Leaderboard / Profiles / Referrals / Share | No | Fake/shell | TBD (architecture decision, may be cut) | | | |
| AI assistant / advisor / rebalancer | Done | Honest-disabled | N/A | | | |

Legend — Complete: Done / Verify / No. State: Real / Shell (unwired) / Fake / Disabled.

## Tier logic
- FREE: working wallet + basic safety (screening + pre-sign kept free deliberately;
  a self-custody wallet should not paywall "don't get drained"). Mostly real -> shippable.
- PRO: everyday power-user analytics/portfolio/tax/NFT/alerts/payments. Mostly shells ->
  needs Tier 1-2 salvage first.
- SHIELD (Pro+): Pro plus active defense (stealth, anomaly, spending limits, fraud
  detection, dashboard, audit log, spam screening, dApp check). Mostly REAL — the
  strongest built stack, closest to shippable of the paid tiers, EXCEPT fraud
  detection (fake, must fix first).
- GUARDIAN: extreme protection (duress, panic, deniability) + hardware + inheritance
  + human bespoke service. Mixed build; the service is the real product.

## Open decisions (yours)
1. Actual prices — placeholders are not recommendations; validate vs competitors + costs.
2. SHIELD multiple — ~2-4x Pro only if SHIELD feels genuinely premium (it can; features real).
3. Active security in SHIELD vs Free — anomaly detection + spending limits paywalled to
   SHIELD; revenue-smart but a self-custody ethics call. Decide consciously.
4. Fraud detection is FAKE — do not price SHIELD on it until wired to the real anomaly engine.
5. Social tier (T4) — needs a server; decide architecture before assigning a tier (may cut).

## Build-before-bill rule
No feature enters a paid tier as a selling point until its State reads Real and it is
verified. Update docs/Tiers.pricing.md (canonical, built-only) only then — never from
this draft.

## Related
- docs/Tiers.pricing.md — canonical built-only tier model (current: Free/Pro/Guardian)
- docs/Salvage-roadmap.md — what must be built before these tiers are real
- docs/Production-reality-audit-TODO.md — per-feature verification status
