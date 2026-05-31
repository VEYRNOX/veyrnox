# Future Features Roadmap (PARKING LOT — post-MVP)

> A deliberately-deferred backlog. Nothing here is greenlit. It exists so ideas
> are captured and triaged WITHOUT pulling focus from the current priorities
> (finish the security MVP, get the legal entity + audit moving, ship).
>
> READ THIS FIRST: the project's risk is breadth-over-depth (see veyrnox.com's
> ~170 mostly-hollow feature pages — the thing this whole effort is correcting).
> The discipline that works is FEWER things, genuinely real, verified, audited.
> Treat this list as "maybe later, one at a time, each earning its place," not a
> to-build queue. Each new feature = more build + more attack surface + more
> audit scope + (for some) regulatory exposure.
>
> Sequencing rule: do NOT start anything here until the security MVP is shipped
> and audited. Then pull items in ONE AT A TIME by value, each with its own
> design doc + branch + PR + review.

---

## Group 1 — Natural wallet completeness (SAFE, low-risk, expected)
Cheap, reuse existing infrastructure, no licensing implications. The most likely
"next real phase" after the security MVP.
- More **ERC-20 tokens** (DAI, LINK, etc.) — trivial; reuses the Phase B token path.
- More **EVM chains** (Base, zkSync, Linea, etc.) — config-level; reuses the engine.
- **Address Book / contacts** — convenience; pairs with address-poisoning checks.
- **Transaction history & receipts** — read chain data; expected in any wallet.
- **Price charts / price alerts / watchlist** — read public market data.
- **Portfolio / net-worth view** — aggregate balances; display only.
- **QR send/receive**, **ENS resolution display** — standard niceties.
- **NFT viewing (display-only gallery)** — safe; NOT minting/trading.
> A focused "Wallet UX Completeness" phase drawn from this group is the natural
> follow-on to the security MVP. Safe, expected, makes the product feel whole.

## Group 1b — Advisory protection: threat-intel + AI (SAFE if advisory-only)
These ENHANCE security and fit a non-custodial wallet — provided they stay
ADVISORY (inform/warn) and never hold keys or transact. Mostly already in
Security.roadmap.md (S2); listed here for completeness.
- **Threat-intel screening** — malicious address/contract/phishing-domain checks
  via a reputable feed (Blockaid / Wallet Guard / ScamSniffer-style). PRIVACY
  trade-off (API call leaks intent) is an explicit, disclosed decision; prefer
  local lists where possible. Warns, never guarantees.
- **Transaction simulation** — show actual effect before signing; the top
  drainer defense. (Scoped version in S2; full version in Phase D.)
- **AI advisor (ADVISORY ONLY)** — plain-language tx explanation, scam
  explanation, education, portfolio Q&A over PUBLIC data. HARD RULES: AI never
  has the seed/keys, never signs, never transacts autonomously; data/privacy
  architecture is explicit (no keys to any cloud LLM). See "AI guardrails" in
  Security.roadmap.md.
> NOT a separate product — a smart layer on the S2 transaction-safety features.

## Group 2 — More crypto stacks (each a BTC/SOL-sized effort + own audit)
Only if coverage genuinely matters; each is a SEPARATE cryptographic stack with
its own derivation/signing/verification and its own audit cost.
- After BTC + SOL: **XRP, TRON, Cardano, Litecoin, Dogecoin**, etc.
- **SPL tokens** (Solana) and other token standards — moderate, after base chain.
> Pad the headline coin count cheaply via Group-1 ERC-20 tokens; only add whole
> new stacks when a specific high-value coin justifies the audit cost.

## Group 3 — WalletConnect / dApp connectivity (HIGH-RISK; already specced)
- **WalletConnect / dApp Connector / Web3 Browser** — see docs/PhaseD.walletconnect.md.
- HELD until the core is audited. It's the gateway to swap/DeFi and the single
  biggest expander of audit scope AND store-approval risk. Approach deliberately,
  sub-phased, with arbitrary-tx decoding + simulation. Not before the MVP audit.

## Group 4 — DO NOT BUILD for this product (regulated / breaks non-custodial)
These appear on veyrnox.com but contradict the non-custodial, store-approvable,
build-to-sell strategy. They are a DIFFERENT, regulated business — led by lawyers
and a re-architecture, not a feature sprint.
- **Swaps / DEX, DeFi yield, lending/borrowing, cross-chain bridges** — licensing
  triggers; break Google's non-custodial exemption + Apple's storage-only lane.
- **Fiat on/off-ramp, CEX deposit, bank link** — money transmission / licensing.
- **Trading bots, perps, options/derivatives, tokenized stocks** — securities/
  derivatives regulation; effectively separate regulated companies.
- **AI trading bots / AI auto-management / autonomous AI agents that transact** —
  require AI to move funds → breaks self-custody (AI must never hold keys/sign)
  and, if swapping/trading, regulated. The "AI wallet" hype to avoid. (Advisory
  AI is fine — Group 1b; transacting AI is not.)
- **Custodial / institutional custody** — breaks non-custodial outright.
- **KYC / VASP / Travel Rule / AML / geo-blocking / DID** — operator-compliance
  machinery; can CREATE the VASP/licensing obligation you're avoiding. (See
  docs/Security.roadmap.md — user-security vs operator-compliance.)
> If the business ever pivots to custodial/exchange, that's a new product with
> licensing and a fresh architecture — a strategic decision, not a roadmap item.

---

## Triage rule for anything added here later
Before pulling an item into active build, it must pass ALL of:
1. Does it fit a NON-CUSTODIAL wallet (no licensing trigger)? If no → Group 4.
2. Is the security MVP shipped + audited already? If no → wait.
3. Does its value beat its added audit scope + attack surface + maintenance?
4. Can it get its own design doc + hands-on verification (if cryptographic)?
If it can't pass these, it stays parked.

## The honest reminder
More planning is no longer the bottleneck — execution is. This doc is a parking
lot, not a prompt to start building. The value now is in DOING the current plan:
finish the security MVP (docs/Security.roadmap.md), run the mobile builds
(docs/MobileSetup.md, M2), start the legal entity + audit (docs/MVP.roadmap.md,
Audit.scope.md). Pull from this list only after that ships.

## Related docs
- docs/Security.roadmap.md — the CURRENT priority (S1–S4)
- docs/MVP.roadmap.md — the master plan + legal/audit tracks
- docs/PhaseD.walletconnect.md — Group 3 detail (deferred)
- docs/PhaseBTC.md / docs/PhaseSOL.md — Group 2 stacks (if pursued)
- docs/Audit.scope.md — every added feature updates this
