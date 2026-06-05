# Veyrnox — Salvage Roadmap × Security Risk (combined assessment)

**Date:** 2026-06-04 · **Status:** DRAFT — prioritisation map, not verified verdicts.

> Overlays two views of the same features: the SALVAGE ROADMAP (sorts by build EFFORT,
> T1–T4) and the BACKEND SECURITY ASSESSMENT (sorts by privacy/custody RISK). The point:
> a feature can be easy to build but dangerous to the wedge, or hard but safe. Where the
> two diverge is where conscious calls are needed.
>
> CAVEATS: salvage states (shell/fake/real) are CLASSIFIER ESTIMATES, not verified — a row
> can move when the page is actually read. Security ratings are PRE-AUDIT design estimates,
> not verified. Use as a prioritisation map, not final verdicts. The verify pass + the
> independent audit turn these into facts.

## Combined table

| Feature | Salvage tier (effort) | Backend in sensitive path? | Security verdict | Combined call |
|---|---|---|---|---|
| Net worth, P&L, spending, snapshots, fees | T1 quick | No — on-device math | Safe (no backend) | WIRE freely — easy AND safe |
| Watchlist, price/smart alerts | T1 quick | No — broad fetch / local | Safe (+proxy for price) | WIRE freely |
| Address book, session mgr, notifications | T1 quick | No — local state | Safe | WIRE freely |
| Calculator / convert | T1 quick | No — local | Safe | WIRE freely |
| Tax report, invoice generator | T2 | No — on-device, client-encrypt if stored | Safe if local-compute | WIRE (local-compute design) |
| Chain reads / live balances | real-ish | No — user-controlled RPC | Safe (base44 out of path) | WIRE via user RPC |
| Price charts | T2 | No — broad market fetch | Safe (cosmetic) | WIRE (verify not fake) |
| Analytics / benchmark / correlation / on-chain | T2 | YES — market/on-chain provider | Leaks A2/A5 to provider | OPT-IN + disclosure, or broad-fetch-local |
| Token/NFT enrichment / discovery / multi-NFT | T2 | YES — resolves "what's at address X" | Leaks A2/A4 | OPT-IN only, or honest-disable |
| News sentiment | T2 | Yes but no address needed | Low (timing/IP only) | WIRE, send no wallet data |
| ERC-20 discovery | T2 | YES — real version scans address | Leaks A2/A4 (fake now) | OPT-IN or honest-disable |
| Solana / multi-asset balances/send | T3 gated | No (on-device signing); gated on per-asset verify | Safe custody-wise; build-blocked | BLOCKED (verify assets first) |
| Fraud detection | T3 | No — real anomaly engine on-device | Safe (point at real engine) | Honest-disable now → wire real engine |
| Full deniability suite | T3 | No — MUST never call backend (I3) | Safe by invariant | Keep on-device, backend hard-off |
| AI advisor / assistant | disabled | YES — wallet context to LLM | Leaks A2/A4, unless on-device | On-device OR stripped opt-in; never raw |
| Leaderboard / profiles / referrals / shared | T4 arch | YES — leak IS the feature | Direct A2/A4 exposure | CUT (3) / serverless redesign (referrals, shared-export) |

Legend — Assets: A2 address↔identity · A4 balance/holdings · A5 metadata. WIRE = safe to build now ·
OPT-IN = off by default + disclosure · BLOCKED = build-gated · CUT = remove. "Backend in sensitive
path?" = does delivering this feature require sending wallet data (address/balance) to a server.

## What the comparison reveals
1. **Cheap = safe (wire first, no tension).** Almost all salvage Tier 1 (net worth, P&L,
   alerts, address book, tax) computes on-device and never needs the backend in the sensitive
   path. Fastest wins are also zero-privacy-cost wins. Start here.
2. **Tension lives in Tier 2.** It splits: features needing NO wallet data (price charts,
   news, market) are safe → wire. Features needing the user's ADDRESS (analytics-by-address,
   NFT/token enrichment, ERC-20 discovery) are the same effort but carry the A2/A4 leak →
   opt-in, off by default, disclosed, or broad-fetch-filter-locally.
3. **Two dispositions change under the security lens:**
   - ERC-20 discovery: salvage said "wire eventually"; security says opt-in/disable (inherent address leak).
   - AI advisor: security is decisive — on-device inference OR stripped/anonymised opt-in, never raw wallet data.
4. **T3/T4 agree across both lenses** — Solana/multi-asset blocked on verification; social CUT.

## Synthesis
The two assessments mostly AGREE — wire the on-device T1 set now (cheap + safe), keep
deniability backend-off (invariant), cut social (both lenses). Where they DIVERGE is the
valuable signal: a cluster of T2 "enrichment" features (analytics-by-address, NFT/token
discovery, ERC-20 discovery, AI advisor) are easy to build the LEAKY way — exactly the trap.
Build those last, carefully, opt-in and disclosed, or not at all.

## Related
- docs/Salvage-roadmap.md · docs/Backend-security-architecture.md ·
  docs/Data-source-privacy-posture.md · positioning-scope-design spec (§2, §6)
