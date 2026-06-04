# Veyrnox — Positioning & Scope-Discipline Design

**Date:** 2026-06-04
**Status:** Approved design (pre-plan)
**Type:** Product positioning + scope spec (not a code feature spec)

## Purpose

Veyrnox inherited ~85 nav pages from a base44-generated starting point, many of
which presented simulated data as real — the cardinal sin for a self-custody
wallet. This document fixes the product's identity and gives every page/feature
a single, reusable test for whether it lives, gets disabled, or gets cut. It
also resolves the open questions on social features, data sourcing, and the
SHIELD-vs-Guardian tier confusion.

The output of executing this spec is a tighter, honest product organized around
one wedge — not a feature-complete dashboard.

---

## 1. Positioning statement

> **Veyrnox is a coercion-resistant self-custody wallet for high-net-worth
> holders who face physical and digital targeting.** The seed phrase is the
> account — we never hold keys, and we never leak addresses by default. Where
> mainstream wallets optimize for convenience and feature surface, Veyrnox
> optimizes for *what survives an adversary who has your phone, your PIN under
> duress, or your network traffic.*

- **Wedge:** maximally secure self-custody for high-risk users.
- **Primary persona:** high-net-worth crypto holders who fear physical coercion
  (home invasion, kidnapping, the "$5 wrench attack," coerced seed disclosure).
  When personas conflict, this one wins. Activists/journalists are valued
  free-tier *mission* users (PR + narrative), not the revenue base.
- **Hero:** the deniability stack — duress PIN, decoy balances, panic wipe,
  stealth/hidden wallets. The thing no mainstream wallet can credibly copy.
- **Baseline (free, for everyone):** privacy. No address leakage by default.
  Privacy is never a paid lever — you cannot credibly sell "max security" while
  metering it.
- **Brand stance:** restraint is a feature. "We do less, and we leak nothing."

---

## 2. The wedge-alignment filter (anti-sprawl engine)

This is the load-bearing mechanism. Because we keep a wallet-dashboard shape
(see §5, structure approach "B — security depth ladder"), the constant risk is
that sprawl creeps back. Every page/feature is sorted into one of three buckets
by this test. Re-run it whenever a new feature is proposed.

### WIRE & KEEP — must pass *all four* gates

1. **Job fit** — serves the coercion-resistant-vault job (protects keys, funds,
   identity, or holder safety) *or* is core wallet plumbing (send / receive /
   history / accounts).
2. **Clean data path** — no third-party indexer sees the user's address without
   explicit per-feature opt-in. Data comes from on-device, user-controlled RPC,
   or user-supplied keys (see §6).
3. **Truthful** — shows only real, verified data. Never simulated-as-real.
4. **Server honesty** — works serverlessly, *or* its server dependency is
   justified and privacy-preserving.

### KEEP but HONEST-DISABLE — passes gate 1, fails 2/3/4

Belongs to the wedge but can't yet be done cleanly. Stays visible, clearly
labeled (*"arriving once we can do this without leaking / without a server /
once verified"*). This is where most of the ~40 shells land for now.

### CUT / quarantine — fails gate 1

Doesn't serve the vault job, however polished. This is where base44 feature
sprawl goes to die.

**Decision classes: WIRE / DISABLE / CUT.**

---

## 3. Inventory triage (the filter applied)

From the page-by-page classifier:

| Class (approx. count) | Bucket | Action |
|---|---|---|
| ~22 genuinely real self-custody features | WIRE & KEEP | The spine. Re-verify each still passes gate 2 — some "real" features may quietly rely on an indexer and need a path fix or opt-in toggle. |
| ~40 shells (real UI, demo/local data) | Triage individually | Split into three piles (below). |
| ~6–8 still fabricating data | HONEST-DISABLE *now*, then re-judge | Fabrication is the cardinal sin. Disable immediately under gate 3, then WIRE or CUT. |
| ~4 social features | See §4 | Mostly CUT or serverless redesign. |

### The ~40 shells, triaged

- **Pile 1 — WIRE (clean path exists):** data available on-device or via
  user-controlled RPC — e.g. per-account balances, local tx labeling/notes,
  on-device address book, fee estimation from the user's own node.
- **Pile 2 — DISABLE (belongs, no clean path yet):** serves the job but needs
  an indexer today — e.g. full multi-chain portfolio value, token-price
  enrichment, NFT views, cross-chain history. Honest-disable with a clear label
  until a privacy-preserving path exists.
- **Pile 3 — CUT (doesn't serve the vault job):** generic dashboards,
  marketing-style widgets, engagement features that exist only because base44
  generated them.

This spec defines the **rule and the three piles**, not a name-by-name
assignment of all 40 — that classification is discovery work for the
implementation plan, made mechanical by this rule.

---

## 4. Social features verdict

Judged against gate 1 through the coercion-persona lens:

- **Leaderboard → CUT.** A public ranking of who holds what is a targeting list
  aimed at the persona. No serverless redesign saves it.
- **Public profiles → CUT.** Identity + holdings exposure is the threat model,
  not a feature.
- **Shared portfolio → CUT as a social feature**, but preserve the *capability*
  as a **signed local export**: the user generates an encrypted, signed snapshot
  to share deliberately with their own accountant/family. Serverless,
  user-initiated, no leakage — gate-compliant.
- **Referrals → CONDITIONAL KEEP.** Keep only if built privacy-preservingly
  (local referral codes, no server-side social graph linking referrer↔referee).
  Otherwise disable.

Net: the "4 social features need a server" problem mostly dissolves — three are
cut on principle; the survivor (referrals) is kept only serverlessly.

---

## 5. Structure & monetization

### Structure: "B — security depth ladder"

Keep a wallet-dashboard shape, but make the value ladder *sophistication of
protection*, with the §2 filter as the guardrail against sprawl. (Considered and
rejected: "A — vault, not dashboard" was more aggressive but riskier on product
surface; "C — self-hosted power-user" fought the busy HNW persona's patience.)

### The SHIELD-vs-Guardian resolution: two axes, not one ladder

The confusion comes from treating SHIELD and Guardian as rungs on one ladder.
They are two different axes:

- **Software axis (DIY):** Free → paid software tiers. More money = more
  protection depth.
- **Service axis (done-with-you):** Guardian sits *on top of* the software, not
  above it on the same line. You do not buy Guardian *instead of* the top
  software tier — Guardian *includes* it and adds humans.

One-sentence sell: **"Buy SHIELD to operate maximum security yourself. Buy
Guardian to have our team operate it with you."**

### Tier structure

- **Free** — full wallet + **all life-safety security** (duress PIN, panic wipe,
  decoy balances) + baseline privacy. Life-safety is free *on principle*: nobody
  is unprotected because they couldn't pay. This is also the mission/PR story.
- **Pro (~$5–8/mo) — *protect yourself, day to day.*** Advanced personal
  hardening: deeper anomaly detection, transaction-simulation depth, spending
  limits, multi-decoy + custom duress scenarios, hardware-wallet support.
- **SHIELD (top software rung) — *protect across time, devices, and
  succession.*** Everything in Pro **plus** resilience/continuity: inheritance /
  dead-man's-switch, privacy-preserving software social-recovery, multi-device +
  air-gapped companion, priority access to new protections. The literal "all
  software features, self-serve, no consulting" tier.
- **Guardian ($100+/mo)** — SHIELD software + bespoke human service (secure
  setup, monitoring, incident response, recovery). A service category, not a
  software rung.

**The axis is clean:** Pro = harden the present; SHIELD = harden across time;
Guardian = delegate to people. This non-arbitrary boundary is what keeps the two
software rungs from collapsing back into confusion.

---

## 6. Data-source architecture ("clean data path," gate 2 made concrete)

A feature has a clean data path if its data comes *only* from:

1. **On-device** — computed locally from what the wallet already holds
   (accounts, local tx cache, notes).
2. **User-controlled RPC** — ship a sensible default endpoint but make
   bring-your-own-RPC trivial; *disclose* that the default RPC provider sees the
   user's addresses.
3. **User-supplied API key** — for any third-party data, the user brings their
   own key; the leak relationship is theirs, consciously.
4. **Explicit opt-in for any shared/default indexer** — each such feature shows
   *"this reveals your address to X"* and requires opt-in. No silent network
   calls; ideally an inspectable egress allowlist.

**Accepted consequence:** fiat/price data inherently needs an external source,
so **portfolio fiat values are OFF by default**. Crypto balances (on-device
truth) always show; converted dollar values light up only when the user opts
into a price source or supplies a key. This is the strict-by-default tax, and it
is on-brand.

---

## 7. Launch sequencing (most blockers aren't code)

Code is ahead of go-to-market. Parallelize by lead time.

1. **Unblocked now (pure code):** execute this scope spec — *immediately*
   honest-disable the 6–8 fabricators, then triage the 40 shells (wire Pile 1,
   disable Pile 2, cut Pile 3 + social), collapse to the vault core. No external
   dependency.
2. **Long-lead, start in parallel today:** legal entity formation (critical
   path — gates billing *and* iOS) and entering the independent-audit queue
   (2–3 mo).
3. **Asset scope = page scope.** 1 of 10 assets is verified; the persona needs
   the assets they actually hold (ETH, major stables, probably BTC), not a long
   tail. Verify those; defer the rest. Asset sprawl is the same disease as page
   sprawl — the wedge prunes both.
4. **Mainnet** stays gated behind audit + per-asset verification. **Claims
   discipline until audit:** every security feature is marketed *"designed to /
   provisional, pending independent audit"* — never "audited" until it is. The
   honesty problem fought in the UI must not reappear in the marketing.

---

## 8. Non-goals (YAGNI guardrails)

- Mainstream feature parity — DeFi dashboards, in-app swaps/trading, NFT
  galleries. They dilute the wedge and mostly fail gate 2. Not now, likely
  never.
- Public/social/engagement features — cut (§4).
- Multi-chain breadth beyond what the persona holds — deferred.
- Any server dependency not strictly justified and privacy-preserving —
  default no.
- Marketing security as "audited" before the audit exists — prohibited.

---

## Decisions captured (for traceability)

| Question | Decision |
|---|---|
| The wedge (Q4) | Max-security self-custody for high-risk users |
| Primary persona | HNW holders facing physical coercion |
| Data posture | Strict by default (privacy is free baseline, not a paid lever) |
| Structure | B — security depth ladder, governed by the §2 filter |
| Social features (Q2) | Leaderboard/profiles CUT; shared-portfolio → signed local export; referrals conditional/serverless |
| SHIELD vs Guardian (Q3) | Two axes: software ladder (Free/Pro/SHIELD) + Guardian service on top |
| Paid software tiers | Two — Pro (harden present) and SHIELD (harden across time) |
| Fiat values | Off by default; opt-in price source |

## Open items deferred to the plan

- Name-by-name classification of the ~40 shells into Pile 1/2/3.
- Exact asset shortlist to verify first (ETH, stables, BTC candidates).
- Whether referrals can be built fully serverlessly, or get disabled.
- Concrete feature lists finalizing the Pro/SHIELD line.
