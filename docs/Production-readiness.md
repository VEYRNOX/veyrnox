# Veyrnox — Production-Readiness Gates

> Can we ship? NO — months out, and almost none of it is code. The gating items
> are legal lead-time, an audit queue, and hands-on testnet/mainnet/device
> verification. The code is in honest, decent shape; it is the least of what
> remains. Generated 2026-06-04.

## Gate status

| Gate | Status | Blocking | Notes |
|---|---|---|---|
| Legal entity formed | NOT STARTED | HARD BLOCKER | Longest lead. Sequential: entity -> D-U-N-S -> Apple org. Gates iOS AND billing. Start first. |
| Independent security audit | NOT STARTED | HARD BLOCKER | All security features provisional pending audit. 2-3mo queue, then fix + re-review. |
| Deniability stack audited | NOT DONE | HARD BLOCKER | Highest-stakes: duress/decoy/panic/hidden protect people in danger; unaudited = unsafe to rely on. |
| Per-asset send verification | 1 of 10 | HARD BLOCKER | Only ETH/Sepolia verified. 9 assets receive-only/unverified. Hands-on faucet testing. |
| Mainnet path exercised | NEVER TOUCHED | HARD BLOCKER | All testnet/devnet. Mainnet enabled + tested + gated, manually, never automated. |
| OFAC / sanctions legal sign-off | NOT DONE | Blocker (compliance) | Screening built; shipping needs legal review. |
| Real-device M2b verification | SIMULATOR ONLY | Blocker (mobile) | Native secure storage needs real iOS/Android hardware to verify. |
| App-store accounts + billing | NOT DONE | Blocker (distribution) | Dev accounts gated on legal entity; IAP config + receipt verification. Tier UI is scaffold-only (PR #85). |
| UI honesty / no fake features | IN PROGRESS | Blocker (app review) | Done: seed-QR fund-loss fix (#87), 19 demo-ware pages deleted (#88), AIAssistant disabled (#89). Remaining: 3 Criticals (SolanaTokens, FraudDetection, ERC20Discovery) + Major/Minor backlog. See UI-audit-findings.md. App review rejects fake/non-functional paywalled features. |
| Core wallet builds & runs | DONE | - | Compiles; sends ETH/Sepolia; real vault/keys/security stack built (provisional). |
| Honest feature docs | DONE | - | In-app catalogue + Feature-Status synced to real build status. |

## Critical path (by lead time — start the slow ones now)
1. Legal entity — start today. Longest pole; gates iOS and billing; sequential and slow.
2. Independent audit — waitlist now (2-3mo queue); run in parallel with everything else.
3. Testnet send verifications — hands-on; turns a 1-asset wallet into a real one; can do incrementally now.
4. Mainnet + OFAC legal sign-off + real-device M2b — after the above.
5. Finish UI honesty pass (3 Criticals + backlog) + wire billing — near-launch, gated on the legal entity.

## The blunt truth
What blocks production is NOT at the keyboard. The highest-value next actions are
forming the legal entity and waitlisting the audit — those clocks do not start
until you start them, and everything else waits on them. The code work (finish UI
honesty, wire billing once accounts exist) is real but downstream and comparatively
fast.

## Related docs
- docs/Feature-Status.md — canonical build status (built / partial / roadmap)
- docs/UI-audit-findings.md — UI/UX snag audit (28 critical / 58 major / 64 minor)
- docs/MVP.roadmap.md — track A/B/C launch sequencing
- docs/Tiers.pricing.md — Free / Pro / Guardian model (hypothesis, unvalidated)
