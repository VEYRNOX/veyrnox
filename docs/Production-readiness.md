# Veyrnox — Production-Readiness Gates

> Can we ship? NOT YET — but the picture has changed significantly since June.
> The hard blockers are now legal lead-time and independent audit queue, not code.
> The code is in honest, audited shape (internal audit passed 0 crit/high/med);
> the remaining gates are external-facing. Generated 2026-06-04; updated 2026-06-20.

## Gate status

| Gate | Status | Blocking | Notes |
|---|---|---|---|
| Legal entity formed | NOT STARTED | HARD BLOCKER | Longest lead. Sequential: entity -> D-U-N-S -> Apple org. Gates iOS AND billing. Start first. |
| Independent security audit | Internal COMPLETE (2026-06-17); 3rd-party NOT YET ENGAGED | HARD BLOCKER (for strongest assurance) | Internal audit passed 0 crit / 0 high / 0 med findings; VULN-1–7 all closed. A third-party independent audit is RECOMMENDED for the strongest assurance but was not required under the owner's gate policy. 2-3mo queue once engaged. |
| Deniability stack audited | Internal PASSED; 3rd-party NOT YET | HARD BLOCKER (for public ship) | Highest-stakes: duress/decoy/panic/hidden protect people in danger. Internal audit covered architecture. Third-party depth review still recommended before relying on deniability features publicly. |
| Per-asset send verification | 8 of 10 | BLOCKER (2 remaining) | ETH, USDC, USDT, MATIC, ARB, OP, BTC, SOL all verified on-chain. AVAX and BNB blocked by testnet faucet access — NOT a code gap. Send code exists and is unit-tested; flip to `live` after first real on-chain UI-path txid for each. |
| Mainnet path exercised | UNLOCKED, not yet wired | BLOCKER (per-asset) | ALLOW_MAINNET = ALLOW_BTC_MAINNET = ALLOW_SOL_MAINNET = true since 2026-06-17 (owner sign-off, internal audit passed). No asset is wired to a mainnet chain yet — each needs a verified mainnet UI-path send and a `networkKey` change in `assets.js`. |
| OFAC / sanctions legal sign-off | NOT DONE | Blocker (compliance) | Screening built (bundled SDN snapshot, warns-not-blocks). Shipping gated on legal review — sanctions data in a financial product requires legal sign-off per jurisdiction. |
| Real-device M2b verification | SIMULATOR ONLY | Blocker (mobile) | Native secure storage needs real iOS/Android hardware to verify. App-layer gate works; OS-enforced ACL (M2c/d) is 📋 audit-gated. |
| App-store accounts + billing | NOT DONE | Blocker (distribution) | Dev accounts gated on legal entity; IAP config + receipt verification. Tier UI is scaffold-only. |
| UI honesty / no fake features | COMPLETE | — | All fabricated data removed. 92 live routes; 14 cut off-wedge. In-app feature catalogue synced to real build status. No demo-ware pages. |
| Core wallet builds & runs | DONE | - | Compiles; sends 8 of 10 assets on-chain; real vault/keys/security stack built (internal audit passed, 3rd-party pending). |
| Honest feature docs | DONE | - | In-app catalogue + Feature-Status synced to real build status as of 2026-06-20. |

## Critical path (by lead time — start the slow ones now)
1. **Legal entity** — start today. Longest pole; gates iOS and billing; sequential and slow.
2. **Independent (3rd-party) audit** — waitlist now (2-3mo queue); run in parallel with everything else. Internal audit is done; independent audit is the next depth layer.
3. **Mainnet sends** — ALLOW_MAINNET=true. Wire the first asset to mainnet, do a verified UI-path send, confirm. Do this incrementally for each asset.
4. **AVAX / BNB testnet send verification** — unblocked the moment a faucet is accessible. Both are code-complete; just need a real on-chain txid.
5. **OFAC legal sign-off + real-device M2b** — after legal entity exists; can run in parallel with 3rd-party audit.
6. **App-store accounts + billing** — near-launch, gated on the legal entity.

## The blunt truth
**2026-06-20 status:** The code is in the best shape it has been. The internal security
audit passed with zero critical, high, or medium findings. All 7 VULN disclosures are
closed. 8 of 10 assets send on-chain. The security stack (S1–S4) is built, wired, and
verified at the browser level. UI honesty is complete — no fake features, no fabricated
data, 92 live routes.

What blocks production is still NOT at the keyboard. The highest-value next actions are:
(a) forming the legal entity — that clock does not start until you start it, and it gates
iOS and billing downstream; (b) engaging a third-party security auditor — internal passed,
independent is the depth layer that justifies public confidence; (c) exercising the first
mainnet asset send now that ALLOW_MAINNET is true.

The remaining code work (wire billing once accounts exist, AVAX/BNB faucet sends when
accessible, mainnet per-asset wiring) is real but comparatively fast and none of it is
blocked by a hard blocker today.

## Related docs
- docs/Feature-Status.md — canonical build status (built / partial / roadmap)
- docs/UI-audit-findings.md — UI/UX snag audit
- docs/MVP.roadmap.md — track A/B/C launch sequencing
- docs/Tiers.pricing.md — Free / Pro / Guardian model (hypothesis, unvalidated)
- docs/audit-triage/internal-audit-2026-06-17.md — internal audit report (0 crit/high/med)
