# Veyrnox — Wallet Feature Spec (CANONICAL SCOPE)

> The single source of truth for what Veyrnox IS as a product. This supersedes
> the ~170-page veyrnox.com marketing surface, most of which is hollow shells or
> regulated/out-of-scope features. This list is the BOUNDED, coherent feature set
> of a focused, non-custodial, security-first self-custody wallet (~50-55
> features) — versus the 170 that would be unbuildable, unapprovable, or
> licence-triggering.
>
> Status is HONEST and current. Do not let this drift into aspiration.
>   ✅ built/working   🟡 partial / built-but-gated   📋 specced, not built
>   💡 parking-lot idea   ❌ removed / out of scope
>
> For the at-a-glance consolidated truth (verified against code on `main`), see
> **docs/Feature-Status.md** — that doc is authoritative when this one disagrees.
>
> Standing rules: non-custodial only; testnet until audited; mainnet gated;
> AI advisory-only (never holds keys); no VASP/custody/swap/DeFi (see
> Security.roadmap.md + FutureFeatures.roadmap.md for the do-not-build line).

---

## Reality check (read first)
- Full *vision*: ~50-55 features (this doc).
- Actually *built & working today*: ~30 (the ✅s) — core wallet ops, the full
  S1 foundation (biometric, passkeys, session/auto-lock, hardened vault), the
  S2 transaction-safety set (approvals/revoke, poison/spam, calldata decode,
  per-chain address validation), the S3 deniability stack (duress, stealth,
  panic wipe), transaction history, gas control, receive flow, demo mode,
  desktop web; iOS/Android shells running.
- **BUT — what actually SENDS is only ETH on Sepolia.** All 6 EVM chains, both
  ERC-20 tokens (USDC, USDT), BTC and SOL are `receive_only`: address derivation
  + balance reads + receive work, and the send code path is built + unit-tested,
  but it is HARD-gated off until a real on-chain send is verified per asset.
- All security/crypto features are PROVISIONAL pending the independent audit;
  the deniability stack is testnet/demo only.
- The gap between built and envisioned IS the roadmap; most hard EVM crypto risk
  already retired. 390 tests green.

---

## 1. Wallet core (foundation)
1. Generate HD wallet (BIP-39 seed) — ✅
2. Import wallet (seed / private key) — ✅
3. Multi-account derivation — ✅
4. Encrypted vault (Argon2id + AES-256-GCM) — ✅
5. Backup / reveal seed (with warnings) — ✅
6. Send native coins — 🟡 (ONLY ETH/Sepolia is live + verified; all other assets
   are `receive_only` — send code built+tested but on-chain unverified, gated)
7. Receive (per-chain address + local QR) — ✅
8. View balances (from chain) — ✅
9. Transaction history (read-only) — ✅ (BTC/SOL via providers, EVM explorer-fallback)
10. Gas/fee display + control before signing — ✅ (per-chain tiers + custom)

## 2. Chains & assets
> Receive + balance reads work for all of 11–19. SEND is live ONLY for ETH;
> everything else is `receive_only` (HARD-gated) until verified on-chain.
11. Ethereum (Sepolia) — ✅ (live send, verified)
12. Polygon (Amoy) — 🟡 receive_only
13. Arbitrum (Sepolia) — 🟡 receive_only
14. Optimism (Sepolia) — 🟡 receive_only
15. Avalanche (Fuji) — 🟡 receive_only
16. BNB Chain (testnet) — 🟡 receive_only
17. ERC-20 tokens (USDC + USDT, Sepolia) — 🟡 receive_only (address + balance ✅, send gated)
18. Bitcoin (BIP-84 testnet) — 🟡 receive_only (derive/balance/receive ✅; send built+tested, on-chain unverified — docs/PhaseBTC.verification.md)
19. Solana (ed25519 devnet) — 🟡 receive_only (derive/balance/receive ✅; send built+tested, on-chain unverified)
20. More ERC-20 tokens (DAI, LINK…) — 💡 (cheap; reuses token path)
21. More EVM chains (Base, zkSync…) — 💡 (config-level)
22. Other stacks (XRP, ADA, TRON…) — 💡 (each a full new stack + audit)

## 3. Security — S1 foundation (docs/Security.roadmap.md)
23. Native secure storage (Secure Enclave / Android Keystore) — 🟡 (M2a done;
    M2b app-layer, PROVISIONAL; OS-enforced ACL M2c/M2d 📋 not built)
24. Biometric unlock — ✅ (app-layer gate, PROVISIONAL — not an OS-enforced ACL)
25. FIDO2 / passkeys — ✅ Level-1 unlock gate (NOT key custody; password escape
    hatch present). Level-2 PRF vault-protect — 📋 not built.
26. Session manager + auto-lock (idle/background) — ✅
26a. At-rest KDF work-factor raise + param migration (SAST M3) — ✅ (PROVISIONAL; params need audit)

## 4. Security — S2 transaction safety
27. Token approvals: view + REVOKE — ✅
28. Suspicious-address / scam screening (threat-intel feed) — 📋 not built
29. Address-poisoning warnings — ✅ (wired into send, informs-not-blocks)
30. Spam-token filter — ✅
31. Transaction simulation (top drainer defense) — ✅ (LOCAL-first pre-sign preview, `simulate.js` + `TransactionPreview.jsx`; warns-not-blocks, never "safe")
32. Calldata decode / approval (unlimited-allowance) warning — ✅
32a. Per-chain recipient address validation — ✅ (Address Book save + send)
32b. Anomaly / fraud detection — ✅ (PR #54; LOCAL history-aware heuristics `anomaly.js`, folded into tx preview)
32c. Security Dashboard (read-only posture view) — ✅ (PR #53; `securityPosture.js` + `SecurityDashboard.jsx`)

## 5. Security — S3 access & recovery
> Deniability stack (duress/stealth/panic) is BUILT but PROVISIONAL, testnet/demo.
33. Duress PIN (decoy wallet) — ✅
33a. Stealth / hidden wallets (deniable chaff-slot pool) — ✅ (SAST M-1 collision fix; multi-chain reveal; move-existing variant)
33b. Panic wipe (emergency local key destruction) — ✅ (panic PIN + in-app guarded wipe)
33c. Constant-KDF unlock timing across the deniability stack — ✅ (SAST M-2 fix)
34. Hardware wallet (Ledger / Trezor) — 📋 not built (UI shell only)
35. Login activity (+ map) — 📋 not built (UI shell only)
36. Social recovery (guardian / SSS) — ❌ removed [audit-blocked-and-not-advertised]
    (never built; removed from UI/catalogue)
36a. Crypto Will / inheritance — 📋 (SELF-CUSTODY ONLY: secret-sharing + dead-man's-
     switch design; Veyrnox NEVER custodies keys or adjudicates death. High
     cryptographic risk + LEGAL/estate dimensions → own audit attention AND a lawyer.
     Defer — not near-term.)

## 6. Security — S4 hardening
37. RASP (jailbreak/root/tamper detection) — 🟡 BUILT — browser-level probes active / OS-level detection audit-gated (M2c/M2d)
38. Audit log — 📋
39. Risk limits / risk scoring (rule-based) — 📋
40. Encrypted cloud backup (CIPHERTEXT only, never plaintext keys) — 📋

## 7. AI (ADVISORY ONLY — never holds keys, never signs)
41. Plain-language transaction explanation — 💡
42. Scam / phishing explanation — 💡
43. Educational assistant (gas, approvals, formats) — 💡
44. Portfolio Q&A over PUBLIC on-chain data — 💡
> Excluded: AI trading bots / auto-management / autonomous transacting agents —
> breaks self-custody + (if trading) regulated. See FutureFeatures.roadmap.md.

## 8. Wallet niceties (Tier-2 completeness)
44a. Help menu (top-bar Documentation entry) — ✅
45. Address book / contacts — ✅ (with per-chain address validation on save)
46. ENS / SNS resolution in Send — ✅ (resolve-only); ENS registration — ❌ removed
47. Price charts / alerts / watchlist — 💡
48. Portfolio / net-worth view — 💡
49. NFT viewing (display-only gallery) — 💡
50. Custom token add / hide — 💡

## 9. Platform / app shell
51. iOS native app — 🟡 (running on simulator; submission gated on Apple ORG acct)
52. Android native app — 🟡 (scaffolded; non-custodial = store-exempt)
53. Desktop web app — ✅
54. Demo mode (browse without backend) — ✅
54a. Mobile App PWA / Mobile Widget — ❌ removed from app (PR #48)

## 10. High-risk / deferred
55. WalletConnect / dApp connection — 📋 (Phase D; POST-AUDIT only; gateway to
    swap/DeFi which themselves stay OUT — see do-not-build line)

---

## What is deliberately NOT a feature (the discipline)
Saying no is part of the product. Excluded because they break non-custodial /
trigger licensing / are a different regulated business:
- Swaps/DEX, DeFi yield, lending, bridges, fiat ramps, CEX deposit
- Trading bots, perps, options/derivatives, tokenized stocks
- Custodial / institutional custody
- KYC / VASP / Travel Rule / AML / geo-blocking / DID
- Admin/enterprise dashboards, telemetry/trust-score ops tooling
(Full reasoning: Security.roadmap.md "Explicitly excluded" + FutureFeatures Group 4.)

## How to use this doc
- This is the scope contract. New ideas get triaged against it, not bolted on.
- Update the status flags as things ship — keep it HONEST (an acquirer's tech
  team will check built-vs-claimed; the 170-page site is the cautionary tale).
- Build order: finish S1 (M2) → S2 → S3 → S4, with BTC/SOL as separate stacks
  per decision, niceties woven in, WalletConnect post-audit. (docs/MVP.roadmap.md)

---

# ADDENDUM — Full site (veyrnox.com/features, ~188 pages) vs this spec

> Three-way split of every site feature page against the self-custody line.
> Purpose: make the scope decision auditable — what we'll build, what we could
> add, and what we deliberately WON'T (and why). Counts: ~37 overlap · ~50
> self-custody-safe gaps · ~70 custodial/regulated to avoid.

## A. OVERLAP — on the site AND in this spec (already scoped above)
Send, Receive, HD Wallet Manager, Import Private Key, Wallet Seed QR, Live
Balances, Gas Fee Control, Biometric Auth, Samsung Keystore, Session Manager,
Duress Pin, Token Approvals, Suspicious Address Checker, Spam Token Filter,
Hardware Wallet, RASP Security, Cloud Backup, Audit Log, Risk
Scoring / Wallet Risk Limits, Login Activity Map, Address Book, Price Alerts,
Price Charts, Watchlist, Net Worth Tracker, NFT Portfolio/Gallery, Solana, Tron,
AI Assistant / AI Portfolio Advisor, D App Connector / WalletConnect / Web3
Browser, Block Explorer, Transaction Receipt, Network Manager, Settings,
Onboarding.

## B. SELF-CUSTODY-SAFE GAPS — on the site, not yet specced, COULD build
(No licensing/custody problem. Mostly read-only analytics + UX niceties + a few
self-custody utilities + more chains. Candidate additions, triaged per the rules.)

> ❌ REMOVED FROM THE APP (consolidated record). Reason tags: [off-wedge] not core
> to the wedge · [breaks-self-custody] would move value without a user signature ·
> [audit-blocked-and-not-advertised] cryptographically sensitive, never shipped, no
> longer advertised · [out-of-scope-regulated] custodial/regulated, never in scope.
> - **Social Recovery** (guardian / Shamir SSS) — [audit-blocked-and-not-advertised] never built; removed from UI/catalogue.
> - **Multi-Sig wallets** (personal + treasury) — [audit-blocked-and-not-advertised] UI shell w/ fake addresses only; page/route/nav/catalogue removed.
> - **Rebalance** + **Rebalance History** — [breaks-self-custody] autonomous value movement; removed (PR #47).
> - **Recurring auto-debit** — [breaks-self-custody] auto-debit path gutted (PR #47); Recurring Payments is now schedule/reminder only, hands off to Send for user signing.
> - **Sui Wallet** — [off-wedge] chain trim (PR #48).
> - **Cosmos / IBC** — [off-wedge] chain trim (PR #48); `deriveCosmosAccount` stub remains in wallet-core but is unwired.
> - **Web Bridge** — [off-wedge] dApp/swap gateway (PR #48).
> - **ENS Registration** — [off-wedge] removed (PR #48); ENS/SNS *resolution* in Send kept (✅).
> - **Mobile App PWA** — [off-wedge] (PR #48); native Capacitor shell remains.
> - **Mobile Widget** — [off-wedge] (PR #48).
> - **Custodial / regulated cluster** — [out-of-scope-regulated] never in scope (see section C below for the full list).
>
> These are no longer build candidates unless deliberately re-greenlit.

UX/niceties: Activity Dashboard, Notification Centre, Push Notifications, Smart
Alerts, Messenger Alerts, Calculator, ERC20 Discovery, Merchant QR, Custom
Dashboard Widgets, Voice Commands. (ENS Registration + Mobile Widget ❌ removed —
see the removed record above.)

Analytics (read-only, safe): Portfolio Dashboard, Portfolio Metrics/Snapshots/
Rewind/Benchmark, P&L Tracking, Performance Analytics/Dashboard, Spending
Patterns, On-Chain Analytics, Advanced/Predictive Analytics, Correlation Matrix/
Timeline, Fear & Greed Index, Crypto Sentiment, What-If Simulator, Custom Index
Builder, Fee Analytics.

Security extras (self-custody-safe): Security Dashboard ✅ (built, PR #53), Anomaly/
Fraud Detection ✅ (built, PR #54), Account Access ✅ (built, PR #50), D App
Security Alerts, Watch Wallets. (Social Recovery + Multi-Sig ❌ removed — see the
removed record above.)

Chains (separate stacks, each own audit): Multi-Chain NFT. (Cosmos IBC + Sui Wallet
❌ removed — see the removed record above.)

Self-custody utilities: Crypto Signing (message signing), Tax Report/Tax Harvesting
(read-only), Savings Goals, Budget Limits, Split Bill, Payment Links, Recurring
Payments (self-initiated, schedule/reminder only — hands off to Send for user
signing), Invoice Generator, Carbon Tracker, Referral Dashboard/Tracker,
Leaderboard, Social Feed/Public Profiles (privacy caveats). (Multi-Sig Wallets/
Treasury ❌ removed — see the removed record above.)

Borderline (advisory-only OK, auto-executing NOT): AI Rebalancer, AI Agents —
safe ONLY if they advise/propose and the user signs; if they transact
autonomously they break self-custody → then they belong in section C.

## C. CUSTODIAL / REGULATED — on the site, DO NOT BUILD (breaks the model)
(These would break non-custody and/or trigger licensing — FinCEN MSB / MiCA CASP
/ FCA / securities / e-money — or are enterprise/operator tooling. They are a
DIFFERENT, regulated business, not wallet features. See Security.roadmap.md +
FutureFeatures.roadmap.md.)

Trading/exchange (regulated): DEX Swap, Swap, Conditional Swap, Limit Orders, OCO
Orders, TWAP Orders, Trailing Stop Orders, Grid Bots, Trading Bots, AI Trading
Bots, Perps Trading, Options Derivatives, Tokenized Stocks, Social Trading, Trade
Signals, DCA.

Custody/banking (breaks non-custody): Institutional Custody, Bank Link, Fiat
Wallets, Fiat Ramp, Live Fiat Ramp, Crypto Off-Ramp, CEX Deposit, Exchange
Connections, Native Pay Ramp.

Lending/yield/DeFi (regulated): Crypto Loans, Lending/Borrowing, Loan Calculator,
DeFi Yield, Yield Farming, Staking (staking-as-a-service regulated; non-custodial
staking borderline).

Compliance/VASP (creates licensing obligation): KYC, KYCVASP Admin, VASP
Compliance, Compliance Rules, Geo Blocking, Identity Management, DID Management,
Trust Score.

Enterprise/admin/ops (not user wallet): Security Admin Dashboard, Super Admin
Dashboard, Telemetry Admin, Enterprise Analytics, White Label Platform, DAO
Governance, DAO Treasury Tools, Crypto Payroll, Webhook Builder, Feature Flags,
Performance Monitoring, Fee Wallet Dashboard, Automation Rules.

Other regulated/out-of-scope: Crypto Subscriptions (payment processing), Smart
Contract Deploy (dev platform), NFT Minting/Fractionalization (minting/securities-
adjacent), Encrypted Messaging (separate product).

Note: "Crypto Will" from the site is reclassified as SELF-CUSTODY (section 5,
item 36a) — but only in a secret-sharing + dead-man's-switch form, never custodial.
(Social Recovery itself is ❌ removed — see the removed record above.)

## Decision rule (unchanged)
Build from A (finish) and pull selectively from B by value. Never build C without
becoming a different, licensed company — a strategic pivot, not a feature sprint.
