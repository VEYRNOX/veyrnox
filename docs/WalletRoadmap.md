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
> ONLY for ETH/Sepolia — every other asset is `receive_only`. 233 tests green.

---

## Guiding sequence logic
1. Finish/solidify what's started (security foundation) before breadth.
2. Security tiers S1→S4 first (it's the product's differentiator + audit scope).
3. Read-only niceties (analytics/UX) are cheap, safe, parallelizable fillers.
4. New chains (BTC, SOL, others) are separate stacks — slot deliberately, each
   adds audit cost.
5. High-risk/legal features (Social Recovery, Crypto Will, WalletConnect) come
   late, with audit + (where noted) legal input.

---

## NOW — pending (non-code, gating mainnet)
- Independent security audit (S1–S4 + crypto stacks) — 📋 (docs/Audit.scope.md)
- Hands-on testnet send verification for every `receive_only` asset — 📋
- ⚠️ Self-custody fix (remove Rebalance / gut Recurring auto-debit) — 🟡 written
  on branch `fix/remove-autonomous-execution`, **NOT merged to main**

## PHASE S1 — Security foundation — ✅ largely built (PROVISIONAL pending audit)
- Native secure storage (M2a done; M2b app-layer; OS-enforced M2c/M2d) — 🟡 (M2c/M2d 📋)
- Biometric unlock — ✅ (app-layer gate, PROVISIONAL)
- FIDO2 / passkeys (Level-1 unlock gate; password escape hatch) — ✅ (PRF vault-protect 📋)
- Session manager + auto-lock (idle/background) — ✅
- At-rest KDF work-factor raise + param migration (SAST M3) — ✅ (params need audit)
- Account access / forgot / reset password — 📋

## PHASE S2 — Transaction safety — ✅ core built
- Token approvals: view + REVOKE — ✅
- Address-poisoning warnings — ✅ (wired into send)
- Spam-token filter — ✅
- Calldata decode / approval (unlimited-allowance) warning — ✅
- Per-chain recipient address validation — ✅
- Suspicious-address / scam screening (threat-intel feed) — 📋
- Transaction simulation (drainer defense) — 📋 (UI shells only)
- D App security alerts — 📋
- Security Center / Dashboard, Security Scanner — 📋 (UI shell only)
- Anomaly / Fraud detection (rule-based) — 📋 (UI shell only)

## PHASE S3 — Access & recovery (higher risk; audit + legal where noted)
> Deniability stack BUILT but PROVISIONAL (testnet/demo); needs specific audit.
- Duress PIN — ✅
- Stealth / hidden wallets (deniable chaff-slot pool) — ✅ (SAST M-1 fix)
- Panic wipe (emergency local key destruction) — ✅
- Constant-KDF unlock timing across deniability stack — ✅ (SAST M-2 fix)
- Hardware wallet (Ledger/Trezor) — 📋 (UI shell only)
- Login activity (+ map) — 📋 (UI shell only)
- Social recovery (guardian/SSS) — 📋 (cryptographic; audit-blocked)
- Crypto Will / inheritance — 📋 (self-custody via social-recovery only; audit + LAWYER)
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
- Calculator, merchant QR, mobile widget, custom dashboard widgets — 💡
- Voice commands — 💡

## PHASE ANALYTICS — read-only (safe, no custody)
- P&L tracking, performance analytics/dashboard, spending patterns — 💡
- On-chain / advanced / predictive analytics — 💡
- Correlation matrix/timeline, custom index builder, fee analytics — 💡
- Fear & Greed, crypto sentiment, what-if simulator — 💡
- Tax report / tax harvesting (read-only) — 💡

## PHASE UTILITIES — self-custody, self-initiated
- Crypto signing (message signing) — 💡 (handle carefully; not arbitrary dApp)
- Multi-sig wallets / treasury (self-custody) — 💡
- Savings goals, budget limits — 💡
- Split bill, payment links, recurring (self-initiated), invoice generator — 💡
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
