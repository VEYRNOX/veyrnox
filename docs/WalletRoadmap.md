# Veyrnox — Wallet Build Roadmap (self-custody scope)

> Sequences EVERY self-custody-compatible feature into a build order. Source of
> truth for scope is docs/WalletFeatures.spec.md; this is the ORDER to build them.
> Custodial/regulated features (spec addendum section C) are OUT OF SCOPE and do
> NOT appear here.
>
> Status: ✅ built · 🟡 partial / built-but-gated · 📋 specced · 💡 idea ·
> ❌ removed / out of scope
> Rules: mainnet OPEN (owner sign-off 2026-06-17 after internal audit, 0 crit/high/med);
> each feature its own branch+PR+review; cryptographic features get hands-on verification
> + audit focus.
>
> Verified against code on `main` (2026-06-20). At-a-glance truth table:
> **docs/Feature-Status.md** (authoritative when docs disagree). 8 of 10 assets LIVE
> with verified on-chain txids; AVAX + BNB remain receive_only. 390+ tests green.

---

## Guiding sequence logic
1. Finish/solidify what's started (security foundation) before breadth.
2. Security tiers S1→S4 first (it's the product's differentiator + audit scope).
3. Read-only niceties (analytics/UX) are cheap, safe, parallelizable fillers.
4. New chains (BTC, SOL, others) are separate stacks — slot deliberately, each
   adds audit cost.
5. High-risk/legal features (WalletConnect) come late, with audit +
   (where noted) legal input. (Social Recovery + Multi-Sig were ❌ removed —
   audit-blocked, never shipped; see Removed section.)

---

## NOW — current state (2026-06-20)
- ✅ Internal audit COMPLETE (2026-06-17, 0 crit/high/med, VULN-1–7 closed). Owner sign-off recorded in docs/audit-triage/internal-audit-2026-06-17.md. Independent third-party audit RECOMMENDED for strongest assurance.
- ✅ Mainnet gate OPEN: ALLOW_MAINNET = ALLOW_BTC_MAINNET = ALLOW_SOL_MAINNET = true (2026-06-17)
- ✅ 8 of 10 assets LIVE with verified on-chain txids (ETH, USDC, USDT, MATIC, ARB, OP, BTC, SOL). AVAX + BNB remain receive_only (no testnet faucet).
- ✅ Self-custody fix MERGED (PR #47): Rebalance removed, Recurring auto-debit gutted (now schedule/reminder only, hands off to /send for user signing)

## PHASE S1 — Security foundation — ✅ largely built (independent ECC audit complete 2026-06-23 / PR #340; residual gap is native OS-enforcement, not audit)
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
- Suspicious-address / scam screening (threat-intel feed) — ✅ BUILT (local on-device; live threat-intel feed still roadmap)
- OFAC screening — ✅ BUILT (bundled SDN snapshot, on-device; gated on legal review before shipping)
- Transaction simulation (drainer defense) — ✅ (LOCAL-first pre-sign preview, `simulate.js` + `TransactionPreview.jsx`)
- Anomaly / Fraud detection (rule-based) — ✅ (PR #54; LOCAL history-aware heuristics `anomaly.js`, folded into tx preview)
- Security Dashboard (read-only posture view) — ✅ (PR #53; `securityPosture.js` + `SecurityDashboard.jsx`)
- D App security alerts — 📋

## PHASE S3 — Access & recovery (higher risk; audit + legal where noted)
> Deniability stack BUILT (testnet/demo); covered by the independent ECC audit complete 2026-06-23 (PR #340); residual gap is real-device / native verification, not audit.
- Duress PIN — ✅
- Stealth / hidden wallets (deniable chaff-slot pool) — ✅ (SAST M-1 fix)
- Panic wipe (emergency local key destruction) — ✅
- Constant-KDF unlock timing across deniability stack — ✅ (SAST M-2 fix)
- Hardware wallet (Ledger/Trezor) — 🟡 BUILT — Ledger WebHID address derivation + Trezor guide; TX signing coming soon; BTC/SOL hardware signing not wired; VULN-3+7 closed
- Login activity (+ map) — ✅ VERIFIED 2026-06-20
- Watch wallets — ✅ BUILT

## PHASE S4 — Hardening & monitoring
- RASP (jailbreak/root/tamper) — ✅ browser-level VERIFIED 2026-06-20 (navigator.webdriver → HOOKED → signing blocked; CLEAN for normal browsers; degradation policy + send-path wiring + I3 guard built + tested); OS-level probes still audit-gated (pending native plugin + real-device verification)
- Audit log — ✅ LIVE and VERIFIED 2026-06-20 (/audit-log; AES-GCM ring-buffer 100 entries { type, ts } ONLY; opt-in off-by-default; no-op in decoy/hidden; UI surfaced via WalletProvider gated context; D1–D7 multi-set shape not built)
- Risk limits / risk scoring (rule-based) — ✅ BUILT (rule-based on-device risk score in src/risk/; transparent, explainable; covered by the independent ECC audit complete 2026-06-23 / PR #340)
- Encrypted cloud backup (ciphertext only) — ✅ BUILT (Argon2id+AES-GCM, restore verification; ciphertext only, never plaintext keys)

## PHASE UX — Wallet completeness (cheap, safe, parallelizable)
- Receive (per-chain + local QR), Transaction history, Gas/fee control — ✅
- Help menu (top-bar Documentation) — ✅
- Address book — ✅ (per-chain validation); ENS/SNS resolution in Send — ✅;
  ENS registration — ❌ removed (PR #48)
- Price charts / alerts / watchlist — ✅ BUILT (price-charts, alerts, watchlist routes live)
- Net-worth / portfolio dashboard + metrics/snapshots/benchmark — ✅ BUILT (net-worth, analytics, advanced-analytics, benchmark, portfolio-rewind, snapshots routes live)
- NFT viewing (display-only) / multi-chain NFT — ✅ BUILT (nft, nft-multichain routes live)
- Custom token add/hide, ERC20 discovery — 💡
- Activity dashboard, notification centre, push, smart/messenger alerts — ✅ BUILT (notifications, push, dashboard-widgets routes live)
- Calculator, merchant QR, custom dashboard widgets — ✅ BUILT (calculator, dashboard-widgets routes live; merchant QR via payment-links; Mobile Widget ❌ removed, PR #48)
- Voice commands — ✅ BUILT

## PHASE ANALYTICS — read-only (safe, no custody)
- P&L tracking, performance analytics/dashboard, spending patterns — ✅ BUILT (pl, analytics, advanced-analytics, spending routes live)
- On-chain / advanced / predictive analytics — ✅ BUILT (onchain, advanced-analytics routes live)
- Correlation matrix/timeline, custom index builder, fee analytics — ✅ BUILT (correlation, correlation-timeline, index-builder, fee-analytics routes live); fee-analytics VERIFIED 2026-06-20
- Fear & Greed, crypto sentiment, what-if simulator — ✅ BUILT (news-sentiment route live)
- Tax report / tax harvesting (read-only) — ✅ BUILT (tax route live)

## PHASE UTILITIES — self-custody, self-initiated
- Crypto signing (message signing) — ✅ BUILT (crypto-signing route live)
- Multi-sig wallets / treasury (self-custody) — ❌ removed [audit-blocked-and-not-advertised] (was UI shell w/ fake addresses; page/route/nav/catalogue deleted)
- Savings goals, budget limits — ✅ BUILT (savings, budget routes live)
- Split bill, payment links, recurring (self-initiated, schedule/reminder only — hands off to Send for user signing), invoice generator — ✅ BUILT (payment-links, recurring, invoices routes live)
- Carbon tracker — 💡
- Referral dashboard/tracker, leaderboard — 🟡 BUILT (recently, 2026-06-20; /referrals route live)
- Social feed / public profiles — 💡 (privacy caveats)

## PHASE AI — advisory only (NEVER holds keys / never transacts)
- Plain-language transaction explanation — 💡
- Scam/phishing explanation — 💡
- Educational assistant — 💡
- Portfolio Q&A over public data — 💡
- AI portfolio advisor / rebalancer — 💡 (ADVISORY ONLY; auto-execute = OUT OF SCOPE)

## PHASE CHAINS — separate stacks (each its own build + audit)
- Bitcoin (BIP-84 testnet) — ✅ LIVE — full UI path verified on-chain (txid 2da87a27…, block 4990901); docs/PhaseBTC.verification.md
- Solana (ed25519 devnet) — ✅ LIVE — full UI path verified on-chain (sig 5KGXAGTJ…, FINALIZED)
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
- ❌ Crypto Will / inheritance — [audit-blocked-and-not-advertised] never built; removed from roadmap 2026-06. No code exists.
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
