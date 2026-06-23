# Veyrnox — Production-Readiness Gates

> Can we ship? NOT YET — but the picture has changed significantly since June.
> Both security audits are now COMPLETE (internal 2026-06-17, independent ECC
> 2026-06-23); the hard blockers are now legal lead-time and distribution, not
> audit and not code. The code is in honest, audited shape (internal passed
> 0 crit/high/med; independent ECC findings all resolved in PR #340). The
> remaining gates are external-facing. Generated 2026-06-04; updated 2026-06-23.

## Gate status

| Gate | Status | Blocking | Notes |
|---|---|---|---|
| Legal entity formed | NOT STARTED | HARD BLOCKER | Longest lead. Sequential: entity -> D-U-N-S -> Apple org. Gates iOS AND billing. Start first. |
| Independent security audit | Internal COMPLETE (2026-06-17); independent ECC 3rd-party COMPLETE (2026-06-23) | CLEARED | Internal audit (the hard mainnet gate) passed 0 crit / 0 high / 0 med; VULN-1–7 closed. The independent ECC third-party audit completed 2026-06-23 (satisfies §24): 1 CRITICAL + 2 HIGH + 4 MEDIUM + 1 LOW, ALL resolved in PR #340 (merged 8f1dd95), recorded in PR #341, per-feature catalogue reconciliation in PR #343. Evidence: `docs/audit-triage/ecc-independent-audit-2026-06-23.md`. Note: audited ≠ on-chain "verified" — per-asset send still needs a real explorer txid. |
| Deniability stack audited | Internal PASSED; independent ECC 3rd-party COMPLETE (2026-06-23) | CLEARED (audit) | Highest-stakes: duress/decoy/panic/hidden protect people in danger. Both audits covered the deniability architecture; ECC findings resolved in PR #340. Residual NON-audit gates remain: decoy/hidden Action-Password parity is a deliberate threat-model decision (not built), and the hardware-KEK offline-seizure gap on PIN/duress/panic is a native-plugin gate — both tracked in Feature-Status §6. |
| Per-asset send verification | 8 of 10 | BLOCKER (2 remaining) | ETH, USDC, USDT, MATIC, ARB, OP, BTC, SOL all verified on-chain. AVAX and BNB blocked by testnet faucet access — NOT a code gap. Send code exists and is unit-tested; flip to `live` after first real on-chain UI-path txid for each. |
| Mainnet path exercised | UNLOCKED, not yet wired | BLOCKER (per-asset) | ALLOW_MAINNET = ALLOW_BTC_MAINNET = ALLOW_SOL_MAINNET = true since 2026-06-17 (owner sign-off, internal audit passed). No asset is wired to a mainnet chain yet — each needs a verified mainnet UI-path send and a `networkKey` change in `assets.js`. |
| OFAC / sanctions legal sign-off | NOT DONE | Blocker (compliance) | Screening built (bundled SDN snapshot, warns-not-blocks). Shipping gated on legal review — sanctions data in a financial product requires legal sign-off per jurisdiction. |
| Real-device M2b verification | SIMULATOR ONLY | Blocker (mobile) | Native secure storage needs real iOS/Android hardware to verify. App-layer gate works; OS-enforced ACL (M2c/d) is 📋 gated on a native plugin + real-device hardware (not an audit — both audits complete). |
| App-store accounts + billing | NOT DONE | Blocker (distribution) | Dev accounts gated on legal entity; IAP config + receipt verification. Tier UI is scaffold-only. |
| UI honesty / no fake features | COMPLETE | — | All fabricated data removed. 92 live routes; 14 cut off-wedge. In-app feature catalogue synced to real build status. No demo-ware pages. |
| Core wallet builds & runs | DONE | - | Compiles; sends 8 of 10 assets on-chain; real vault/keys/security stack built (both audits passed — internal 2026-06-17, independent ECC 2026-06-23). |
| Honest feature docs | DONE | - | In-app catalogue + Feature-Status synced to real build status as of 2026-06-20. |

## Critical path (by lead time — start the slow ones now)
1. **Legal entity** — start today. Longest pole; gates iOS and billing; sequential and slow.
2. **Independent (3rd-party) audit** — DONE (ECC, 2026-06-23; findings resolved PR #340). No longer a blocker. Re-engage only for a fresh design (e.g. a backend-escrow backup variant) or a major architecture change.
3. **Mainnet sends** — ALLOW_MAINNET=true. Wire the first asset to mainnet, do a verified UI-path send, confirm. Do this incrementally for each asset.
4. **AVAX / BNB testnet send verification** — unblocked the moment a faucet is accessible. Both are code-complete; just need a real on-chain txid.
5. **OFAC legal sign-off + real-device M2b** — after legal entity exists; both audits are already done, so this is the next external gate to clear.
6. **App-store accounts + billing** — near-launch, gated on the legal entity.

## The blunt truth
**2026-06-23 status:** The code is in the best shape it has been. Both audits are now
complete: the internal audit passed with zero critical, high, or medium findings, and the
independent ECC third-party audit (2026-06-23) found 1 CRITICAL + 2 HIGH + 4 MEDIUM + 1 LOW,
ALL resolved in PR #340. All 7 VULN disclosures are closed. 8 of 10 assets send on-chain.
The security stack (S1–S4) is built, wired, and verified at the browser level. UI honesty is
complete — no fake features, no fabricated data, 92 live routes.

What blocks production is still NOT at the keyboard, and audit is no longer a blocker. The
highest-value next actions are: (a) forming the legal entity — that clock does not start
until you start it, and it gates iOS and billing downstream; (b) exercising the first mainnet
asset send now that ALLOW_MAINNET is true (audited ≠ on-chain "verified" — each asset still
needs a real explorer txid); (c) OFAC legal sign-off and real-device M2b verification.

The remaining code work (wire billing once accounts exist, AVAX/BNB faucet sends when
accessible, mainnet per-asset wiring) is real but comparatively fast and none of it is
blocked by a hard blocker today.

## Related docs
- docs/Feature-Status.md — canonical build status (built / partial / roadmap)
- docs/UI-audit-findings.md — UI/UX snag audit
- docs/MVP.roadmap.md — track A/B/C launch sequencing
- docs/Tiers.pricing.md — Free / Pro / Guardian model (hypothesis, unvalidated)
- docs/audit-triage/internal-audit-2026-06-17.md — internal audit report (0 crit/high/med)
- docs/audit-triage/ecc-independent-audit-2026-06-23.md — independent ECC third-party audit (findings resolved PR #340)
