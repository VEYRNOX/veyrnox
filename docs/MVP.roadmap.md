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
(Phase D). Keeping these out is what keeps the wallet approvable (non-custodial
exemption) and the audit contained.
> UPDATE: BTC and SOL, originally deferred here, have since been built as
> separate testnet stacks (`receive_only`, mainnet gated) — they are now part of
> the built surface, not excluded. dApp/swap/DeFi remain firmly out.

**❌ Removed (out-of-scope record):** Social Recovery + Multi-Sig
[audit-blocked-and-not-advertised, never shipped]; Rebalance + Recurring auto-debit
[breaks-self-custody, gutted in PR #47]; Sui, Cosmos/IBC, Web Bridge, ENS
Registration, Mobile App PWA, Mobile Widget [off-wedge trim, PR #48]; and the full
custodial/regulated cluster [out-of-scope-regulated, never in scope]. Full
consolidated record + reasons: **docs/Feature-Status.md** and
**docs/WalletFeatures.spec.md**.

---

## Status snapshot (what's done)

DONE & verified (on `main`, **390 tests green**, clean history). At-a-glance
truth table: docs/Feature-Status.md.
- Phase A — real ETH key core (BIP-39/32/44, Argon2id+AES-GCM vault, local
  signing); derivation verified vs canonical address; a REAL Sepolia send proven
  end-to-end by hand. **ETH/Sepolia is the only `live` send.**
- Phase B — ERC-20 token path; USDC address verified 3 ways; approval-warning /
  calldata-decode guard. USDT now wired via the same path (receive_only, Aave
  faucet stand-in). Both tokens `receive_only` (send gated/unverified).
- Phase C — 5 more EVM chains; chainIds verified vs ethereum-lists; chain-aware
  gas tokens; mainnets gated. All five `receive_only` (send gated/unverified).
- Phase BTC — BIP-84 testnet stack (derive/balance/receive/send built+tested),
  `receive_only`, mainnet gated, on-chain send unverified by hand.
- Phase SOL — ed25519/SLIP-0010 devnet stack (build/sign/broadcast built+tested),
  `receive_only`, mainnet gated, on-chain send unverified by hand.
- Security S1 (biometric, passkey unlock gate, session/auto-lock, hardened KDF,
  account access / change-password + seed recovery — PR #50; OS-enforced ACL
  M2c/M2d still pending), S2 (approvals/revoke, poison/spam, calldata decode,
  per-chain validation, transaction simulation, anomaly/fraud detection — PR #54,
  security dashboard — PR #53), S3 deniability (duress, stealth, panic wipe,
  constant-KDF timing) — BUILT, PROVISIONAL pending audit. SAST M-1/M-2/M-3
  fixes merged.
- UX: transaction history, gas/fee control, receive flow, Help menu.
- Mobile M1 — Capacitor shell (Android scaffolded; iOS added on Mac); additive.
- Planning docs: PhaseA/B/C/BTC/SOL, Mobile.capacitor, Hosting.migration,
  MobileSetup, Audit.scope, Security.roadmap, Feature-Status, and this roadmap.

✅ Integrity gap CLOSED (PR #47 merged): Rebalance + Rebalance History removed;
Recurring auto-debit gutted (Recurring Payments is now schedule/reminder only,
hands off to /send for user signing). No feature moves value without a user
signature. (`AIRebalancer` remains ADVISORY-ONLY — never moves funds.)

Honest scorecard: ~30% of the full vision by features; MOST of the hard
technical risk retired across EVM + BTC + SOL; the differentiating security
stack is largely built. Remainder to real-money launch is mostly audit + legal +
per-asset send verification + hardening, not core code.

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


**What blocks launch vs what's a fast-follow (clarification):**
- **M2c/d (OS-enforced ACL) is a FAST-FOLLOW, not a launch blocker.** M2b (hardware-backed at-rest store + app-layer biometric gate) is the shippable security floor; M2c/d hardens it post-launch. The only catch: never claim OS-enforced hardware protection in-product until M2c/d is built AND real-device verified (see the Feature-Status M2c/d decision note). Shipping M2b honestly is fine.
- **Per-asset send verification (A3) is harness-assisted but NOT automatable end-to-end.** The send scripts (`scripts/btc-testnet-send.mjs`, `scripts/sol-devnet-send.mjs`, and the EVM path) can broadcast real testnet txs, but the wallet must first be FUNDED from faucets (interactive, rate-limited — manual) and each result must be WITNESSED on a block explorer (amount / recipient / fee correct — human judgment). "Script broadcast OK" is necessary, not sufficient.
- **Mainnet send verification is MANUAL ONLY — never automate it.** Real-value sends are done by hand, deliberately, checking every field. Do not drive mainnet sends from an agent or script.
- **M2b requires REAL-DEVICE verification before mobile launch.** Simulators/emulators have no Secure Enclave / StrongBox; hardware-backed storage + biometric behaviour must be confirmed on a physical iPhone (SE) and a StrongBox Android device.

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
