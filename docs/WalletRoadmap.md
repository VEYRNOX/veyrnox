# Veyrnox — Wallet Build Roadmap (self-custody scope)

> Sequences EVERY self-custody-compatible feature into a build order. Source of
> truth for scope is docs/WalletFeatures.spec.md; this is the ORDER to build them.
> Custodial/regulated features (spec addendum section C) are OUT OF SCOPE and do
> NOT appear here.
>
> Status: ✅ built · 🟡 partial · 📋 specced · 💡 idea (not yet specced)
> Rules: testnet only; mainnet gated until independent audit; each feature its own
> branch+PR+review; cryptographic features get hands-on verification + audit focus.

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

## NOW — in flight
- Native secure storage M2 — 🟡 (M2a done; M2b provisional in main; biometric UI next)
- Biometric unlock UI (Face ID/Touch ID toggle + prompt) — 📋 briefed, building
- Group-tile colour fix — 📋 (small visible polish, outstanding)

## PHASE S1 — Security foundation (finish first)
- Native secure storage (harden M2b → OS-enforced, post-audit) — 🟡
- Biometric unlock — 📋
- FIDO2 / passkeys (auth; optional PRF vault-protect) — 📋
- Session manager + auto-lock (idle/background) — 📋
- Account access / forgot / reset password — 📋

## PHASE S2 — Transaction safety
- Token approvals: view + REVOKE — 📋
- Suspicious-address / scam screening (threat-intel feed) — 📋
- Address-poisoning warnings — 📋
- Spam-token filter — 📋
- Transaction simulation (drainer defense) — 📋
- Calldata decode / approval warning — 🟡
- D App security alerts — 📋
- Security Center / Dashboard, Security Scanner — 📋
- Anomaly / Fraud detection (rule-based) — 📋

## PHASE S3 — Access & recovery (higher risk; audit + legal where noted)
- Duress PIN — 📋
- Hardware wallet (Ledger/Trezor) — 📋
- Login activity (+ map) — 📋
- Social recovery (guardian/SSS) — 📋 (cryptographic; audit attention)
- Crypto Will / inheritance — 📋 (self-custody via social-recovery only; audit + LAWYER)
- Watch wallets — 📋

## PHASE S4 — Hardening & monitoring
- RASP (jailbreak/root/tamper) — 📋
- Audit log — 📋
- Risk limits / risk scoring (rule-based) — 📋
- Encrypted cloud backup (ciphertext only) — 📋

## PHASE UX — Wallet completeness (cheap, safe, parallelizable)
- Receive (finish), Transaction history, Gas/fee control (finish) — 🟡
- Address book, ENS resolution + registration — 💡
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
- Bitcoin (BIP-84) — 📋 (docs/PhaseBTC.md)
- Solana (ed25519) — 📋 (docs/PhaseSOL.md)
- More EVM chains (Base, zkSync…) — 💡 (config-level, cheap)
- More ERC-20 tokens (DAI, LINK…) — 💡 (reuses token path, cheap)
- Cosmos IBC, Sui, Tron, XRP, etc. — 💡 (each a full stack; only if justified)

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
