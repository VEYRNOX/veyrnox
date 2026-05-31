# Veyrnox — Wallet Feature Spec (CANONICAL SCOPE)

> The single source of truth for what Veyrnox IS as a product. This supersedes
> the ~170-page veyrnox.com marketing surface, most of which is hollow shells or
> regulated/out-of-scope features. This list is the BOUNDED, coherent feature set
> of a focused, non-custodial, security-first self-custody wallet (~50-55
> features) — versus the 170 that would be unbuildable, unapprovable, or
> licence-triggering.
>
> Status is HONEST and current. Do not let this drift into aspiration.
>   ✅ built/working   🟡 partial   📋 specced, not built   💡 parking-lot idea
>
> Standing rules: non-custodial only; testnet until audited; mainnet gated;
> AI advisory-only (never holds keys); no VASP/custody/swap/DeFi (see
> Security.roadmap.md + FutureFeatures.roadmap.md for the do-not-build line).

---

## Reality check (read first)
- Full *vision*: ~50-55 features (this doc).
- Actually *built & working today*: ~15 (the ✅s) — core wallet ops, 6 EVM
  chains, USDC, demo mode, desktop web; iOS/Android shells running.
- The gap between built and envisioned IS the roadmap. ~25-30% of the vision by
  feature count; most hard EVM crypto risk already retired.

---

## 1. Wallet core (foundation)
1. Generate HD wallet (BIP-39 seed) — ✅
2. Import wallet (seed / private key) — ✅
3. Multi-account derivation — ✅
4. Encrypted vault (Argon2id + AES-256-GCM) — ✅
5. Backup / reveal seed (with warnings) — ✅
6. Send native coins — ✅ (verified testnet send)
7. Receive (address + QR) — 🟡
8. View balances (from chain) — ✅
9. Transaction history — 📋
10. Gas/fee display + control before signing — 🟡

## 2. Chains & assets
11. Ethereum — ✅
12. Polygon — ✅
13. Arbitrum — ✅
14. Optimism — ✅
15. Avalanche — ✅
16. BNB Chain — ✅
17. ERC-20 tokens (USDC verified) — ✅
18. Bitcoin — 📋 (docs/PhaseBTC.md — separate stack, own audit)
19. Solana — 📋 (docs/PhaseSOL.md — separate stack, own audit)
20. More ERC-20 tokens (DAI, LINK…) — 💡 (cheap; reuses token path)
21. More EVM chains (Base, zkSync…) — 💡 (config-level)
22. Other stacks (XRP, ADA, TRON…) — 💡 (each a full new stack + audit)

## 3. Security — S1 foundation (docs/Security.roadmap.md)
23. Native secure storage (Secure Enclave / Android Keystore) — 🟡 (M2a done;
    M2b in progress, PROVISIONAL pending audit)
24. Biometric unlock — 📋
25. FIDO2 / passkeys (auth + optional vault-protect via PRF) — 📋
26. Session manager + auto-lock (idle/background) — 📋

## 4. Security — S2 transaction safety
27. Token approvals: view + REVOKE — 📋
28. Suspicious-address / scam screening (threat-intel feed) — 📋
29. Address-poisoning warnings — 📋
30. Spam-token filter — 📋
31. Transaction simulation (top drainer defense) — 📋
32. Calldata decode / approval warning — 🟡 (partly built in Phase B)

## 5. Security — S3 access & recovery
33. Duress PIN (decoy wallet) — 📋
34. Hardware wallet (Ledger / Trezor) — 📋
35. Login activity (+ map) — 📋
36. Social recovery (guardian / SSS) — 📋 (cryptographic; own audit attention)
36a. Crypto Will / inheritance — 📋 (SELF-CUSTODY ONLY: built on social-recovery /
     secret-sharing + dead-man's-switch; Veyrnox NEVER custodies keys or adjudicates
     death. High cryptographic risk + LEGAL/estate dimensions → own audit attention
     AND a lawyer. Consider folding into Social Recovery rather than a separate
     feature. Defer — not near-term.)

## 6. Security — S4 hardening
37. RASP (jailbreak/root/tamper detection) — 📋
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
45. Address book / contacts — 💡
46. ENS resolution + display — 💡
47. Price charts / alerts / watchlist — 💡
48. Portfolio / net-worth view — 💡
49. NFT viewing (display-only gallery) — 💡
50. Custom token add / hide — 💡

## 9. Platform / app shell
51. iOS native app — 🟡 (running on simulator; submission gated on Apple ORG acct)
52. Android native app — 🟡 (scaffolded; non-custodial = store-exempt)
53. Desktop web app — ✅
54. Demo mode (browse without backend) — ✅

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
Hardware Wallet, Social Recovery, RASP Security, Cloud Backup, Audit Log, Risk
Scoring / Wallet Risk Limits, Login Activity Map, Address Book, Price Alerts,
Price Charts, Watchlist, Net Worth Tracker, NFT Portfolio/Gallery, Solana, Tron,
AI Assistant / AI Portfolio Advisor, D App Connector / WalletConnect / Web3
Browser, Block Explorer, Transaction Receipt, Network Manager, Settings,
Onboarding.

## B. SELF-CUSTODY-SAFE GAPS — on the site, not yet specced, COULD build
(No licensing/custody problem. Mostly read-only analytics + UX niceties + a few
self-custody utilities + more chains. Candidate additions, triaged per the rules.)

UX/niceties: Activity Dashboard, Notification Centre, Push Notifications, Smart
Alerts, Messenger Alerts, Calculator, ENS Registration, ERC20 Discovery, Merchant
QR, Mobile Widget, Custom Dashboard Widgets, Voice Commands.

Analytics (read-only, safe): Portfolio Dashboard, Portfolio Metrics/Snapshots/
Rewind/Benchmark, P&L Tracking, Performance Analytics/Dashboard, Spending
Patterns, On-Chain Analytics, Advanced/Predictive Analytics, Correlation Matrix/
Timeline, Fear & Greed Index, Crypto Sentiment, What-If Simulator, Custom Index
Builder, Fee Analytics.

Security extras (self-custody-safe): Security Center/Dashboard, Security Scanner,
Anomaly Detection, Fraud Detection, D App Security Alerts, Account Access,
Forgot/Reset Password, Watch Wallets.

Chains (separate stacks, each own audit): Cosmos IBC, Sui Wallet, Multi-Chain NFT.

Self-custody utilities: Crypto Signing (message signing), Multi-Sig Wallets/
Treasury, Tax Report/Tax Harvesting (read-only), Savings Goals, Budget Limits,
Split Bill, Payment Links, Recurring Payments (self-initiated), Invoice Generator,
Carbon Tracker, Referral Dashboard/Tracker, Leaderboard, Social Feed/Public
Profiles (privacy caveats).

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
item 36a) — but only in the inheritance-via-social-recovery form, never custodial.

## Decision rule (unchanged)
Build from A (finish) and pull selectively from B by value. Never build C without
becoming a different, licensed company — a strategic pivot, not a feature sprint.
