# Veyrnox — Wallet Build Roadmap (self-custody scope)

> Sequences EVERY self-custody-compatible feature into a build order. Source of
> truth for scope is docs/WalletFeatures.spec.md; this is the ORDER to build them.
> Custodial/regulated features (spec addendum section C) are OUT OF SCOPE and do
> NOT appear here.
>
> Status: ✅ built · 🟡 partial / built-but-gated · 📋 specced · 💡 idea ·
> ❌ removed / out of scope
> Rules: testnet only; mainnet gated until independent audit; each feature its own
> branch+PR+review; cryptographic features get hands-on verification + audit focus.
>
> Verified against code on `main` (2026-06-01). At-a-glance truth table:
> **docs/Feature-Status.md** (authoritative when docs disagree). NB: send is live
> ONLY for ETH/Sepolia — every other asset is `receive_only`. 390 tests green.

---

## Guiding sequence logic
1. Finish/solidify what's started (security foundation) before breadth.
2. Security tiers S1→S4 first (it's the product's differentiator + audit scope).
3. Read-only niceties (analytics/UX) are cheap, safe, parallelizable fillers.
4. New chains (BTC, SOL, others) are separate stacks — slot deliberately, each
   adds audit cost.
5. High-risk/legal features (Crypto Will, WalletConnect) come late, with audit +
   (where noted) legal input. (Social Recovery + Multi-Sig were ❌ removed —
   audit-blocked, never shipped; see Removed section.)

---

## NOW — pending (non-code, gating mainnet)
- Independent security audit (S1–S4 + crypto stacks) — 📋 (docs/Audit.scope.md)
- Hands-on testnet send verification for every `receive_only` asset — 📋
- ✅ Self-custody fix MERGED (PR #47): Rebalance removed, Recurring auto-debit
  gutted (now schedule/reminder only, hands off to /send for user signing)

## PHASE S1 — Security foundation — ✅ largely built (PROVISIONAL pending audit)
- Native secure storage (M2a done; M2b app-layer; OS-enforced M2c/M2d) — 🟡 (M2c/M2d 📋)
- Biometric unlock — ✅ (app-layer gate, PROVISIONAL)
- FIDO2 / passkeys (Level-1 unlock gate; password escape hatch) — ✅ (PRF vault-protect 📋)
- Session manager + auto-lock (idle/background) — ✅
- At-rest KDF work-factor raise + param migration (SAST M3) — ✅ (params need audit)
- Account access / change password + seed recovery — ✅ (PR #50; non-custodial, honest "no custodial reset"). OS-enforced ACL M2c/M2d still 📋 (audit-blocked).

## PHASE S2 — Transaction safety — ✅ core built
- Token approvals: view + REVOKE — ✅
- Address-poisoning warnings — ✅ (wired into send)
- Spam-token filter — ✅
- Calldata decode / approval (unlimited-allowance) warning — ✅
- Per-chain recipient address validation — ✅
- Suspicious-address / scam screening (threat-intel feed) — 📋
- Transaction simulation (drainer defense) — ✅ (LOCAL-first pre-sign preview, `simulate.js` + `TransactionPreview.jsx`)
- Anomaly / Fraud detection (rule-based) — ✅ (PR #54; LOCAL history-aware heuristics `anomaly.js`, folded into tx preview)
- Security Dashboard (read-only posture view) — ✅ (PR #53; `securityPosture.js` + `SecurityDashboard.jsx`)
- D App security alerts — 📋

## PHASE S3 — Access & recovery (higher risk; audit + legal where noted)
> Deniability stack BUILT but PROVISIONAL (testnet/demo); needs specific audit.
- Duress PIN — ✅
- Stealth / hidden wallets (deniable chaff-slot pool) — ✅ (SAST M-1 fix)
- Panic wipe (emergency local key destruction) — ✅
- Constant-KDF unlock timing across deniability stack — ✅ (SAST M-2 fix)
- Hardware wallet (Ledger/Trezor) — 📋 (UI shell only)
- Login activity (+ map) — 📋 (UI shell only)
- Social recovery (guardian/SSS) — ❌ removed [audit-blocked-and-not-advertised] (never built; UI/catalogue removed)
- Crypto Will / inheritance — 📋 (self-custody via secret-sharing + dead-man's-switch; audit + LAWYER)
- Watch wallets — 📋

## PHASE S4 — Hardening & monitoring
- RASP (jailbreak/root/tamper) — 📋
- Audit log — 📋
- Risk limits / risk scoring (rule-based) — 📋
- Encrypted cloud backup (ciphertext only) — 📋

## PHASE UX — Wallet completeness (cheap, safe, parallelizable)
- Receive (per-chain + local QR), Transaction history, Gas/fee control — ✅
- Help menu (top-bar Documentation) — ✅
- Address book — ✅ (per-chain validation); ENS/SNS resolution in Send — ✅;
  ENS registration — ❌ removed (PR #48)
- Price charts / alerts / watchlist — 💡
- Net-worth / portfolio dashboard + metrics/snapshots/benchmark — 💡
- NFT viewing (display-only) / multi-chain NFT — 💡
- Custom token add/hide, ERC20 discovery — 💡
- Activity dashboard, notification centre, push, smart/messenger alerts — 💡
- Calculator, merchant QR, custom dashboard widgets — 💡 (Mobile Widget ❌ removed, PR #48)
- Voice commands — 💡

## PHASE ANALYTICS — read-only (safe, no custody)
- P&L tracking, performance analytics/dashboard, spending patterns — 💡
- On-chain / advanced / predictive analytics — 💡
- Correlation matrix/timeline, custom index builder, fee analytics — 💡
- Fear & Greed, crypto sentiment, what-if simulator — 💡
- Tax report / tax harvesting (read-only) — 💡

## PHASE UTILITIES — self-custody, self-initiated
- Crypto signing (message signing) — 💡 (handle carefully; not arbitrary dApp)
- Multi-sig wallets / treasury (self-custody) — ❌ removed [audit-blocked-and-not-advertised] (was UI shell w/ fake addresses; page/route/nav/catalogue deleted)
- Savings goals, budget limits — 💡
- Split bill, payment links, recurring (self-initiated, schedule/reminder only — hands off to Send for user signing), invoice generator — 💡
- Carbon tracker — 💡
- Referral dashboard/tracker, leaderboard — 💡
- Social feed / public profiles — 💡 (privacy caveats)

## PHASE AI — advisory only (NEVER holds keys / never transacts)
- Plain-language transaction explanation — 💡
- Scam/phishing explanation — 💡
- Educational assistant — 💡
- Portfolio Q&A over public data — 💡
- AI portfolio advisor / rebalancer — 💡 (ADVISORY ONLY; auto-execute = OUT OF SCOPE)

## PHASE CHAINS — separate stacks (each its own build + audit)
- Bitcoin (BIP-84 testnet) — 🟡 receive_only (derive/balance/receive ✅; send built+tested, on-chain unverified — docs/PhaseBTC.verification.md)
- Solana (ed25519 devnet) — 🟡 receive_only (derive/balance/receive ✅; send built+tested, on-chain unverified)
- More EVM chains (Base, zkSync…) — 💡 (config-level, cheap)
- More ERC-20 tokens (DAI, LINK…) — 💡 (reuses token path, cheap)
- Tron, XRP, etc. — 💡 (each a full stack; only if justified)
- Cosmos IBC, Sui — ❌ removed from app (PR #48; Cosmos derive stub left unwired)

## PHASE D — dApp connectivity (POST-AUDIT only)
- WalletConnect / dApp connector / Web3 browser — 📋 (docs/PhaseD; high-risk;
  gateway to swap/DeFi which stay OUT OF SCOPE)

---

## ❌ REMOVED (consolidated record — no longer on this roadmap)
> Reason tags: [off-wedge] not core to the wedge · [breaks-self-custody] would move
> value without a user signature · [audit-blocked-and-not-advertised] cryptographically
> sensitive, never shipped, no longer advertised · [out-of-scope-regulated]
> custodial/regulated, never in scope.
- ❌ Social Recovery (guardian / Shamir SSS) — [audit-blocked-and-not-advertised] never built; removed from UI/catalogue.
- ❌ Multi-Sig wallets (personal + treasury) — [audit-blocked-and-not-advertised] UI shell w/ fake addresses only; page/route/nav/catalogue removed.
- ❌ Rebalance + Rebalance History — [breaks-self-custody] autonomous value movement; removed (PR #47).
- ❌ Recurring auto-debit — [breaks-self-custody] auto-debit path gutted (PR #47); Recurring Payments is now schedule/reminder only, hands off to Send for user signing.
- ❌ Sui — [off-wedge] chain trim (PR #48).
- ❌ Cosmos / IBC — [off-wedge] chain trim (PR #48); derive stub left unwired in wallet-core.
- ❌ Web Bridge — [off-wedge] dApp/swap gateway (PR #48).
- ❌ ENS Registration — [off-wedge] registration removed (PR #48); ENS/SNS resolution kept as ✅.
- ❌ Mobile App PWA — [off-wedge] (PR #48); native Capacitor shell remains.
- ❌ Mobile Widget — [off-wedge] (PR #48).
- ❌ Custodial / regulated cluster — [out-of-scope-regulated] never in scope (see OUT OF SCOPE below for the full list).

## OUT OF SCOPE (never on this roadmap — spec addendum C)
Swaps/DEX/orders/bots, perps/options/tokenized-stocks, social/copy trading, fiat
ramps/off-ramps, bank link, fiat wallets, CEX deposit, exchange connections,
lending/borrowing, DeFi yield/farming, staking-as-a-service, KYC/VASP/compliance/
geo-blocking/DID/trust-score, institutional custody, enterprise/admin/ops tooling,
white-label, DAO tools, payroll, smart-contract deploy, NFT minting/fractionalization,
crypto subscriptions (payment processing), encrypted messaging, autonomous AI agents.
Building any of these = a different, licensed company. Not a feature decision.

## Related docs
- docs/WalletFeatures.spec.md — canonical scope + full site three-way split
- docs/Security.roadmap.md — S1–S4 detail + RASP/VASP + AI guardrails
- docs/MVP.roadmap.md — build/legal/audit tracks + launch sequencing
- docs/PhaseBTC.md / PhaseSOL.md / PhaseD.walletconnect.md — chain/dApp specs
