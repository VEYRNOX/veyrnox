# x402 payments — scoping (2026-08-09)

Placeholder for a roadmap direction. **Not built. Not scheduled.** No code exists.

The purpose of this doc is to capture the decisions someone would need to make
before writing a single line — and to save the next session from re-reading the
same background.

---

## What x402 v2 is (30-second read)

x402 revives HTTP status code **402 Payment Required**. An API server responds
`402` with a machine-readable payment challenge; the client (a wallet, agent, or
CLI) pays the demanded amount in a stablecoin (Alchemy's implementation uses
**USDC**), retries with a payment proof, and gets the resource.

Alchemy's x402 v2 SDK / CLI (`alchemy x402 …`) makes any wallet or agent capable
of paying compatible endpoints without embedding fiat/card infra.

Docs: <https://www.alchemy.com/docs/docs/x402-payments>

---

## Where it could fit Veyrnox

Ranked by realism, not enthusiasm:

1. **Advisor buying premium threat intel per-query.** If Chainalysis / TRM /
   Elliptic ever expose x402-priced sanctions endpoints (they don't today), the
   Advisor could pay per lookup instead of Veyrnox holding a five-figure annual
   contract. Turns the whole "unfunded on staging" problem into a per-request
   micro-payment. Cost model shift: **user pays**, not Veyrnox.

2. **User-facing pay-per-use APIs.** The Advisor drawer could offer "get a full
   forensic report on this address for $0.50 USDC" or similar, without Veyrnox
   ever taking the money. Wallet quotes the price, user approves, pays direct
   to the API vendor.

3. **Data enrichment we currently can't afford.** Portfolio history >1yr,
   heavy NFT metadata, deep contract analysis — all currently rate-limited on
   free tiers. x402 makes the "pay-per-call" version economically ok for a
   consumer wallet.

4. **Gas oracle / MEV protection services.** Some MEV-protected relayers may
   move to per-tx pricing. Not currently in scope but consistent shape.

5. **Alchemy CLI running under an Agent Wallet session** for our own dev/CI
   tasks — this is the "we the developer pay per operation" flavour, no
   user-facing shift. Least interesting.

---

## Decisions to make BEFORE writing code

Ordered so the earlier ones gate the later ones.

### 1. Who holds the USDC funding source?

- **User-funded** — Veyrnox is a payment RAIL, wallet just signs the x402
  challenge from user funds. **Aligns with I3** (payment goes user → vendor
  directly, no Veyrnox intermediary). No new business model.
- **Veyrnox-funded** — same problem as gas sponsorship: on-chain USDC trail
  vendor ← Veyrnox is a payment-provider ↔ user link. Deniability tell.
  Also, Veyrnox has to hold and manage a USDC treasury. Big NO by default.
- **Hybrid** (Safety Plus subscribers get X free calls/month; free tier
  pays per call) — matches the existing subscription model. Cleanest.

### 2. Deniability posture (I3)

x402 payments are **on-chain USDC transfers**. Every payment is:
- Attributable to the user's wallet address
- Correlatable across vendors (same sender pays multiple x402 endpoints)
- Legally traceable (USDC issuer freezes)

Options:
- **Suppress x402 entirely in decoy/hidden sessions** (matches `screenTransaction`
  suppression today). Loses functionality in deniability but preserves I3.
- **Use a fresh per-session subaccount** — costs gas per session, and the funding
  transfer is itself deanonymizing.
- **Only allow x402 in real sessions** — clearest, simplest, ships first.

Recommend option 1 for MVP.

### 3. Which chains for x402?

Alchemy's x402 v2 launches on specific chains (Base + a few others per public
docs). Veyrnox users hold USDC on Ethereum mainnet primarily. Bridging USDC to
Base for x402 payments adds friction. Options:
- Require user to already hold USDC on Base
- Auto-bridge on demand (adds another vendor dependency + surface area)
- Wait for x402 on Ethereum mainnet

Recommend "user brings USDC on supported chain" for MVP — no bridging.

### 4. Vendor allowlist

x402 lets ANY server demand payment. Wallet cannot let arbitrary URLs
extract USDC — that's a phishing vector. Curated allowlist of vetted
endpoints only.

### 5. Price display + user approval flow

Each x402 payment is a user-visible transaction. The Advisor / Send UX has
to show:
- Vendor name (from the allowlist)
- Amount in USDC
- Amount in user's local fiat approx
- What they're getting
- Approve / decline gate

Must go through the same signing chokepoint as any Send — same PIN / bio /
RASP gate. No "silent micropayments".

### 6. Refund / dispute story

x402 is fire-and-forget. If the vendor doesn't deliver, USDC is gone. Options:
- Vendor allowlist + reputation gate (mitigation, not solution)
- Escrow via a smart contract (way out of scope for MVP)

Accept as a known limitation for MVP; document in the UI.

---

## What NOT to do

- **Do NOT ship auto-pay** ("wallet automatically pays for anything under
  $0.10 without asking"). Every payment is a signed action, same gate as any
  Send. No exceptions.
- **Do NOT ship a Veyrnox-treasury paymaster** — see decision #1.
- **Do NOT ship x402 in deniability mode.** See decision #2.
- **Do NOT integrate x402 as part of the mainnet-live push.** This is a
  post-audit feature. Independent third-party audit (still outstanding) does
  not currently include x402 surface.

---

## Effort estimate (rough, for planning)

Assumes MVP scope (user-funded, real-session-only, curated allowlist, no
bridging, no escrow):

- **1 week:** SDK integration, one vendor wired, Advisor UI, PIN gate.
- **2 weeks:** vendor allowlist infra, fiat-price display, refund UX,
  suppression in deniability sessions.
- **+ audit re-scope:** x402 signing surface needs to be in scope of the
  outstanding independent audit. Blocker for shipping.

Total: **~3 weeks + audit gate** before user-facing shipping.

---

## Related

- `docs/SecurityAdvisor-TIP-integration.md` — Advisor is the most natural
  first surface for x402-paid premium threat intel.
- `docs/Feature-Status.md` — Safety Plus subscription model that would
  co-exist with x402 pay-per-use.
- Alchemy CLI docs section on "Pay compatible x402 v2 third-party APIs in
  USDC" — the CLI-side surface we could use for dev/CI experiments before
  wiring into the wallet.
- I3 invariant: `docs/CLAUDE.md` (Security invariants I2/I3) — the
  deniability rule is the load-bearing constraint.

---

## Next step

Someone (probably owner) writes ONE thing before this becomes real work:
**pick decision #1** (user-funded vs Veyrnox-funded vs hybrid). Everything
else follows.
