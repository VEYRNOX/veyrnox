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
Status per feature: ✅ built · 🟡 building · 📋 specced · 💡 planned.
Tier = where it's offered once built. Chains/dApp access never gated — monetize depth, not access.

| Feature (status) | Free | Secure ~$12 | Vault ~$40 | Guardian £100+ |
|---|---|---|---|---|
| **Core wallet** | | | | |
| Multi-chain: EVM (6) ✅, BTC ✅, SOL 🟡 | ✅ | ✅ | ✅ | ✅ |
| Send ✅ / receive 🟡 / balances ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-account HD ✅, import ✅, seed backup ✅ | ✅ | ✅ | ✅ | ✅ |
| Gas control 🟡, transaction history 📋 | ✅ | ✅ | ✅ | ✅ |
| **Baseline security** | | | | |
| Encrypted vault ✅, biometric ✅, auto-lock ✅ | ✅ | ✅ | ✅ | ✅ |
| Token-approval revoke ✅, calldata decode ✅ | ✅ | ✅ | ✅ | ✅ |
| Address-poisoning / spam warnings 🟡 | ✅ | ✅ | ✅ | ✅ |
| Local threat-intel (open-source feeds) 💡 | ✅ | ✅ | ✅ | ✅ |
| FIDO2 / passkeys 🟡 | ✅ | ✅ | ✅ | ✅ |
| **Life-safety (free by principle)** | | | | |
| Duress PIN / decoy wallet ✅ | ✅ | ✅ | ✅ | ✅ |
| Panic wipe 💡 | ✅ | ✅ | ✅ | ✅ |
| **AI (advisory only — never holds keys)** | | | | |
| Plain-language tx explanation 💡 | ✅ | ✅ | ✅ | ✅ |
| Scam / phishing explanation 💡 | ✅ | ✅ | ✅ | ✅ |
| Educational assistant 💡 | ✅ | ✅ | ✅ | ✅ |
| Portfolio Q&A (public on-chain data) 💡 | — | ✅ | ✅ | ✅ |
| AI portfolio advisor (advisory) 💡 | — | ✅ | ✅ | ✅ |
| **Privacy & advanced protection** | | | | |
| Stealth / hidden wallets 💡 | — | ✅ | ✅ | ✅ |
| No-telemetry / fully-local mode 💡 | — | ✅ | ✅ | ✅ |
| Privacy routing (Tor / RPC) 💡 | — | ✅ | ✅ | ✅ |
| Hardware wallet integration 📋 | — | ✅ | ✅ | ✅ |
| Social recovery (guardians) 📋 | — | ✅ | ✅ | ✅ |
| Transaction simulation 📋, RASP 📋, risk scoring 📋 | — | ✅ | ✅ | ✅ |
| Login activity / security dashboard 📋 | — | ✅ | ✅ | ✅ |
| Encrypted cloud backup (ciphertext) 📋 | — | ✅ | ✅ | ✅ |
| **High-value protection** | | | | |
| Inheritance / Crypto Will 📋 | — | — | ✅ | ✅ |
| Personal multi-sig (2-of-3, 3-of-5) 💡 | — | — | ✅ | ✅ |
| Spending policies / daily limits 💡 | — | — | ✅ | ✅ |
| Time-locks 💡, address allowlists 💡 | — | — | ✅ | ✅ |
| Audit log 📋, hardware-key enforcement 📋 | — | — | ✅ | ✅ |
| **Niceties / analytics / utilities** | | | | |
| Address book, ENS, basic charts 💡 | ✅ | ✅ | ✅ | ✅ |
| Net-worth / portfolio dashboard 💡 | — | ✅ | ✅ | ✅ |
| Advanced / predictive analytics, tax reports 💡 | — | ✅ | ✅ | ✅ |
| Notifications, widgets, voice commands 💡 | basic | ✅ | ✅ | ✅ |
| Self-custody utilities (signing, savings, invoices) 💡 | basic | ✅ | ✅ | ✅ |
| **Chains & dApp (not tier-gated)** | | | | |
| More EVM chains / tokens 💡 | ✅ | ✅ | ✅ | ✅ |
| WalletConnect / dApp / Web3 browser 📋 (post-audit) | ✅ | ✅ | ✅ | ✅ |
| **Guardian — human-expert service** | | | | |
| 1:1 setup session, written threat model | — | — | — | ✅ |
| Quarterly review, priority support channel | — | — | — | ✅ |
| Custom multi-sig / recovery / inheritance help | — | — | — | ✅ |

**Life-safety free — rationale:** paywalling features that protect at-risk people under
coercion is an ethical hazard AND a brand risk for this audience AND bad funnel logic
(they're the word-of-mouth magnet). Incumbents offer neither. Free is the right call.

**AI-privacy tension:** AI features calling external LLMs are a PHONE-HOME surface that
conflicts with the no-telemetry/privacy wedge. Prefer local/on-device; where a remote
model is used, make it disclosed + optional, never default-on for privacy-tier users.
AI is supporting cast, not a headline (incumbents are adding it too — not a differentiator).

## Guardian — HUMAN-EXPERT SERVICE (bespoke tier only)
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
