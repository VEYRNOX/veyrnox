# Veyrnox MVP Roadmap (MASTER PLAN)

> Single reference tying together the build, legal, and audit tracks into one
> picture. Points to the detailed docs rather than repeating them. This is the
> map; the other docs are the territory.
>
> THE HARD LINE (repeated everywhere on purpose): testnet only until the
> independent audit clears. Sequence is BUILD MVP → FREEZE → AUDIT → FIX →
> RE-REVIEW → THEN flip ALLOW_MAINNET. Never build → mainnet → audit.

---

## What Veyrnox is (the MVP definition)

A **non-custodial, self-custody EVM wallet** — keys live on the user's device,
we never custody funds. Shipped as native iOS + Android apps (Capacitor) plus a
desktop web app, from ONE shared React/Vite codebase.

**MVP scope (frozen target):**
- 6 EVM chains (Ethereum, Polygon, Arbitrum, Optimism, Avalanche, BNB) — testnets
  now, mainnets gated.
- Send / receive / store native coins + the ERC-20 token path (USDC verified).
- Encrypted vault; native secure key storage on mobile (Secure Enclave/Keystore)
  + biometrics.
- The anti-blind-signing approval guard.

**Explicitly NOT in the MVP** (deferred; each adds risk + audit scope + store-
approval/licensing exposure): DEX swaps, DeFi, WalletConnect/dApp signing
(Phase D), BTC, SOL. Keeping these out is what keeps the wallet approvable
(non-custodial exemption) and the audit contained.

---

## Status snapshot (what's done)

DONE & verified (on `main`, 58/58 tests, clean history):
- Phase A — real ETH key core (BIP-39/32/44, Argon2id+AES-GCM vault, local
  signing); derivation verified vs canonical address; a REAL Sepolia send proven
  end-to-end by hand.
- Phase B — ERC-20 token path; USDC address verified 3 ways; approval-warning /
  calldata-decode guard; USDT correctly left unconfigured.
- Phase C — 5 more EVM chains; chainIds verified vs ethereum-lists; chain-aware
  gas tokens (no hardcoded ETH); mainnets gated.
- Mobile M1 — Capacitor shell (Android scaffolded; iOS added on Mac); additive,
  crypto untouched.
- Planning docs: PhaseC/PhaseD, Mobile.capacitor, Hosting.migration,
  MobileSetup, Audit.scope, and this roadmap.

Honest scorecard: ~20–25% of the full vision by features; MOST of the hard
technical risk retired for the EVM family; ~30% toward a real-money launch (the
remainder is audit + legal + hardening, not core code).

---

## The three parallel tracks

### TRACK A — Build (mostly Claude Code + your review)
Sequence from here:
1. **Mac toolchain** → run M1 on iOS + Android simulators. (docs/MobileSetup.md)
2. **M2 — native secure storage + biometrics.** Security-critical → strict PR
   review before merge; goes in the audit scope. (docs/Mobile.capacitor.md)
3. **QA + testnet verification** — exercise all 6 chains + token path; verified
   sends flip assets receive_only → live, per chain.
4. **Billing integration** — store IAP (mobile) + reconcile with web Wix/Stripe.
   (docs/Hosting.migration.md) — can land late, near launch.
5. **MVP freeze.**

### TRACK B — Legal / accounts (your homework; start NOW — longest lead)
- **Register a legal entity** (with professional advice — structure/jurisdiction
  matters for a crypto product AND for clean build-to-sell). THE KEYSTONE: it
  unlocks the items below.
- **D-U-N-S number** (free, slow) → required for Apple org enrollment.
- **Apple Developer ORGANIZATION account** (convert from individual). Apple
  permits crypto wallets ONLY from org devs → gates iOS submission.
- **Google Play** (individual works; non-custodial = exempt from Google crypto
  licensing — org still tidier).
- **Lawyer confirmation** the non-custodial design stays outside MSB/MiCA/MTL
  scope in target markets (essential before ANY swap/transmission feature).

### TRACK C — Audit (the gate before real money; scope now, run after freeze)
- Scope is written (docs/Audit.scope.md). Wallet-app audit ≈ $7k–$30k, 2–4 wks.
- Engage EARLY (tier-1 waitlists 2–3 months; rush = +30–50%).
- Do an internal self-review first (docs/SECURITY_REVIEW_CHECKLIST.md) to cut
  paid hours. Good docs/tests already cut cost 15–25%.
- After audit: fix findings → pay for re-review → keep the report (a sale asset).

---

## Launch sequencing (how the tracks converge)

- **Android first.** Non-custodial = exempt from Google licensing; buildable now;
  not gated on the legal entity the way iOS is.
- **iOS in parallel on the code side** (shared Capacitor codebase, tested on Mac
  simulators), but SUBMISSION gated on Track B (entity → D-U-N-S → Apple org).
- **Real-money (mainnet) on EITHER store gated on Track C** (audit complete +
  fixes + re-review). Testnet/beta can ship earlier.

Convergence: MVP freeze (A) + audit done (C) → Android mainnet launch; iOS
follows when Track B clears.

---

## Hosting / billing (decided — execute at launch prep)
- Public marketing site stays on Base44. Wallet app hosted by you (Cloudflare
  Pages, web) + the app stores (mobile), from `veyrnox-secure`.
- Two billing rails: Wix/Stripe (web), Apple IAP / Google Play Billing (mobile),
  one backend entitlement record as source of truth.
- Do NOT connect `veyrnox-secure` to Base44 sync (permanent/irreversible).
  (Full detail: docs/Hosting.migration.md)

---

## Immediate next actions
- **Tomorrow (Mac):** clone repo, follow docs/MobileSetup.md, run M1 on both
  simulators; add iOS platform.
- **This week (parallel):** start the legal-entity conversation (Track B
  keystone); begin reaching out for audit quotes (Track C).
- **Next build:** M2 native secure storage — with strict pre-merge review.

## Doc index
- docs/Mobile.capacitor.md — mobile approach, secure storage, store policy
- docs/MobileSetup.md — Mac setup checklist
- docs/Hosting.migration.md — hosting + billing decision
- docs/Audit.scope.md — audit scope, cost, firms, readiness
- docs/PhaseD.walletconnect.md — deferred high-risk phase (post-audit)
- docs/PhaseC.evm-chains.md — EVM chains (done)
- docs/SECURITY_REVIEW_CHECKLIST.md — internal self-review
