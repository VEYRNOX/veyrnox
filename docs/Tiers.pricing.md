# Veyrnox — Tier Design & Pricing (working model)

> The subscription/revenue model. NON-CUSTODIAL throughout — tiers gate
> SECURITY/PRIVACY DEPTH and human service, never basic wallet access or which
> chains you can use. Wedge: high-stakes / high-threat self-custodians (priced for
> value protected, not for free-wallet volume).
>
> ⚠️ THIS IS A HYPOTHESIS, NOT VALIDATED. Prices ($12 / $40 / bespoke) and the
> free-vs-paid split are unproven until tested with real prospective users. Do NOT
> treat as fact in a deck — present as "model to validate." The single highest-value
> next step is willingness-to-pay validation via customer conversations.
>
> Build status (NOW vs ROADMAP): ✅ built today · 🟡 partial/building · 📋 specced ·
> 💡 idea. For any public page/deck, only ✅/🟡 may be shown as "available"; 📋/💡
> must be labelled "roadmap / coming" — overclaiming fails diligence (the 188-page
> site is the cautionary tale).

## Pricing
- **Free** — full wallet + baseline security + LIFE-SAFETY features. Adoption engine + ethical floor.
- **Secure — ~$12/mo** — privacy & advanced protection layer.
- **Vault — ~$40/mo** — high-value-protection layer (inheritance, multi-sig, controls).
- **Guardian — bespoke, £100+/mo (by application / limited slots)** — human-expert security service on top of Vault. SERVICES line, not scalable SaaS (see limits below).

## Tier × feature matrix
(status shown per feature; tier = where it's offered once built)

### Core wallet (Phase 0) — ALL TIERS
- Multi-chain: EVM 6 chains ✅, BTC ✅, SOL 🟡 ; send ✅ / receive 🟡 / balances ✅
- Multi-account HD ✅, import ✅, seed backup ✅, gas control 🟡, tx history 📋

### Baseline security (S1/S2) — ALL TIERS
- Encrypted vault ✅, biometric ✅, auto-lock ✅, token-approval revoke ✅,
  calldata decode ✅, address-poisoning/spam 🟡, local threat-intel 💡, passkeys 🟡

### Life-safety (FREE by principle — life-safety + adoption magnet)
- Duress PIN / decoy wallet ✅ · Panic wipe 💡
- RATIONALE: paywalling features that protect at-risk people under coercion is an
  ethical hazard AND a brand risk for this audience AND bad funnel logic (these are
  the word-of-mouth magnet). Incumbents offer neither at all. Free is the right call.

### AI (Phase 2 — ADVISORY ONLY, never holds keys / never transacts)
- FREE: plain-language tx explanation 💡, scam/phishing explanation 💡, educational assistant 💡
- SECURE+: portfolio Q&A over public data 💡, AI advisor/rebalancer (advisory) 💡
- ⚠️ AI-PRIVACY TENSION: AI features that call external LLMs are a PHONE-HOME surface,
  which conflicts with the no-telemetry/privacy wedge. Apply the same rule as threat-intel:
  local/on-device where possible; where a remote model is used, make it disclosed and
  optional, never default-on for privacy-tier users. Do NOT let AI become a headline —
  it's supporting cast; incumbents are adding it too, so it's not a differentiator.

### Privacy & advanced protection (S3/S4) — SECURE+
- Stealth/hidden wallets 💡, no-telemetry mode 💡, privacy routing 💡, hardware wallet 📋,
  social recovery 📋, transaction simulation 📋, RASP 📋, risk scoring 📋, login activity 📋,
  encrypted cloud backup (ciphertext) 📋

### High-value protection (S3) — VAULT+
- Inheritance/Crypto Will 📋, personal multi-sig 💡, spending policies 💡, time-locks 💡,
  address allowlists 💡, audit log 📋, hardware-key enforcement 📋

### Niceties / analytics / utilities (Phase 3)
- FREE basic: address book 💡, ENS 💡, basic charts 💡, notifications 💡, basic utilities 💡
- SECURE+: net-worth/portfolio dashboard 💡, advanced/predictive analytics 💡, tax reports 💡

### Chains (Phase 4) & dApp (Phase 5) — ALL TIERS (NOT gated)
- More EVM chains/tokens 💡; WalletConnect/dApp/Web3 browser 📋 (post-audit).
- Basic access/chains are never paywalled — monetize depth, not access.

### Guardian — HUMAN-EXPERT SERVICE (bespoke tier only)
Included (bounded deliverables):
- 1:1 secure-setup session (~90 min, one at onboarding)
- Personalised written threat model (onboarding; refreshed at quarterly review)
- Custom multi-sig / recovery / inheritance setup ASSISTANCE (advisory; client holds keys)
- Priority support channel — BEST-EFFORT, response target ~1 business day
- Quarterly security review + threat-model refresh

Explicitly NOT (critical limits — lawyer-review before advertising):
- NOT a guarantee of protection / fund safety / attack prevention
- NOT 24/7 emergency response or a "we'll save you" rescue service
- NOT custody (never holds keys/funds; all advice advisory)
- NOT legal/tax/financial advice (refer to their professionals)
- NOT incident remediation / fund recovery (best-effort help only)
Notes: services line, capacity-limited by expert time → keep slots limited. Needs
professional-liability/insurance + lawyer review of the support-promise wording
BEFORE it goes on a pricing page (the gap between what a desperate client hears and
what can be delivered is where harm + liability live).

## Why this model (for the deck)
- Solves the "how does a non-custodial / no-swap wallet make money" objection:
  subscription for SECURITY/PRIVACY DEPTH, priced to value protected.
- Free tier (great wallet + life-safety) = adoption; paid = privacy/high-value depth;
  Guardian = expert service / high willingness-to-pay proof.
- Caveat for investors: niche + higher price = real ARPU but NOT MetaMask-scale volume;
  position software tiers as scalable, Guardian as high-margin add-on (not core).

## Status / next step
- This model is DESIGNED, not VALIDATED. Next: test willingness-to-pay with real
  high-stakes self-custodians (customer discovery). That converts this from "good
  design" into "evidence for a raise." More building does not validate pricing.

## Related docs
- docs/WalletRoadmap.md — full feature roadmap + statuses (source of truth for scope)
- docs/WalletFeatures.spec.md — canonical scope + competitor/out-of-scope split
- docs/Security.roadmap.md — S1–S4 detail + AI guardrails
