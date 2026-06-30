# Veyrnox — Tier × Feature Matrix (working doc)

> Combines feature completion, salvage tier, custody model, and tier placement.
> Sources: VeyrnoxTierModel.pdf, Tiers.pricing.md, Salvage-roadmap.md, classifier signal.
>
> HONESTY CAVEATS (load-bearing):
> - "Complete" = works as a real self-custody feature, or is honestly disabled. It does
>   NOT mean production-ready (gated on audit, legal, per-asset verification).
> - State/Custody for the not-complete/verify rows is CLASSIFIER ESTIMATE, not a verified
>   code-read. Tier placement is a DRAFT pricing hypothesis, NOT a commitment.
> - Nothing is sellable in a tier until its State reads "Real". Prices are unvalidated.
> - SHIELD is a newly-decided tier; placement provisional.

## Tiers
- **Free ($0):** full wallet + baseline security + all life-safety. "We never paywall your safety."
- **Pro (~$5-8/mo):** + privacy & advanced protection depth. 5 built differentiators today.
- **SHIELD (NEW, between Pro & Guardian, price TBD):** all software features (incl. Guardian's
  feature set) self-serve, NO bespoke consulting. The top *software* tier.
- **Guardian ($100+/mo, by application):** SHIELD's features + bespoke human security service.
  A service category, not a software rung.

## Matrix
Complete: done/disabled (Y) · verify/provisional (~) · not complete (N).
Custody: ON = on-device/self-custody · SRV = needs server. Y included · X not priceable · ? TBD.

| Feature | Complete | State | Salvage | Custody | Free | Pro | SHIELD | Guardian |
|---|:--:|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Multi-chain receive + balance | Y | Real | - | ON | Y | Y | Y | Y |
| Send (ETH live / 9 receive-only) | ~ | Real, gated | T3 | ON | Y | Y | Y | Y |
| Multi-account HD, import, seed backup | Y | Real | - | ON | Y | Y | Y | Y |
| Gas control, transaction history | Y | Real | - | ON | Y | Y | Y | Y |
| Encrypted vault, biometric, auto-lock | Y | Real | - | ON | Y | Y | Y | Y |
| Approval revoke, calldata decode | Y | Real | - | ON | Y | Y | Y | Y |
| Address-poisoning / spam warnings | Y | Real | - | ON | Y | Y | Y | Y |
| Suspicious-address + OFAC screening | Y | Real | - | ON | Y | Y | Y | Y |
| FIDO2 / passkeys | Y | Real | - | ON | Y | Y | Y | Y |
| Duress PIN/decoy, panic wipe, KDF timing | Y | Real | - | ON | Y | Y | Y | Y |
| Address book, ENS/SNS | ~ | Shell/real | T1 | ON | Y | Y | Y | Y |
| Stealth / hidden wallets | Y | Real | - | ON | - | Y | Y | Y |
| Transaction simulation | Y | Real | - | ON | - | Y | Y | Y |
| Anomaly / fraud detection (real engine) | Y | Real | - | ON | - | Y | Y | Y |
| Security dashboard | Y | Real | - | ON | - | Y | Y | Y |
| Spending policies / daily limits | Y | Real | - | ON | - | Y | Y | Y |
| Watchlist, price/smart alerts | N | Shell | T1 | ON | - | Y | Y | Y |
| Net worth, P&L, spending, snapshots | N | Shell | T1 | ON | - | Y | Y | Y |
| Fee analytics, session manager | N | Shell | T1 | ON | - | Y | Y | Y |
| Analytics / advanced / benchmark / correlation | N | Shell | T2 | SRV* | - | Y | Y | Y |
| On-chain analytics, event timeline | N | Shell | T2 | SRV* | - | Y | Y | Y |
| NFT portfolio / multi-chain NFT | N | Shell/fake | T2 | SRV* | - | Y | Y | Y |
| Price charts | N | Fake | T2 | SRV* | Y | Y | Y | Y |
| Tax report, invoice generator | N | Shell | T2 | ON | - | Y | Y | Y |
| News sentiment | N | Shell (LLM) | T2 | SRV | - | Y | Y | Y |
| Payment links | N | Fake | T2 | SRV | - | Y | Y | Y |
| ERC-20 discovery | N | Fake | T2 | SRV* | - | X | X | X |
| Multi-asset balances/send | N | Partial | T3 | ON | - | X | X | X |
| Solana / SPL tokens | N | Fake | T3 | ON | - | X | X | X |
| Full deniability suite | ~ | Real, provisional | T3 | ON | - | - | Y | Y |
| Hardware wallet | Y | Disabled (planned) | T3 | ON | - | - | Y | Y |
| AI assistant / advisor / rebalancer | Y | Disabled (#89) | - | SRV | - | - | - | - |
| Leaderboard | N | Fake/shell | T4 | SRV | - | ? | ? | ? |
| Public profiles | N | Fake/shell | T4 | SRV | - | ? | ? | ? |
| Referral tracker | N | Shell | T4 | SRV | - | ? | ? | ? |
| Shared portfolio | N | Fake | T4 | SRV | - | ? | ? | ? |
| 1:1 setup + written threat model | Y | Service | - | ON | - | - | - | Y |
| Quarterly review + priority support | Y | Service | - | ON | - | - | - | Y |
| DFIR advisory (post-incident) | Y | Service | - | ON | - | - | - | Y |

\* SRV* = needs an external DATA source (indexer/price/API) but does NOT take custody of keys.
Leaks addresses to a provider (privacy concern), unlike pure-SRV social features needing a full
backend. Both marked SRV per the hard-binary choice; the asterisk preserves the nuance.

## Key reads
- SHIELD vs Guardian differ ONLY by the service rows (last 4), not features.
- SRV rows are the custody-tension features: T4 social ones genuinely need a server
  (architecture decision, may be cut); T2 ones need external data (privacy, not custody).
- X rows are NOT priceable until built + verified.
- Per PDF: Pro has exactly 5 built differentiators today; prices unvalidated; Guardian is a
  service category, not a software rung.

## Related
- docs/Tiers.pricing.md · docs/Salvage-roadmap.md · docs/Feature-Status.md ·
  docs/Production-reality-audit-TODO.md · VeyrnoxTierModel.pdf
