# Veyrnox — Tier Design & Pricing (working model)

> The subscription/revenue model. NON-CUSTODIAL throughout — tiers gate
> SECURITY/PRIVACY DEPTH and human service, never basic wallet access or which
> chains you can use. Wedge: high-stakes / high-threat self-custodians (priced for
> value protected, not for free-wallet volume).
>
> ⚠️ THIS IS A HYPOTHESIS, NOT VALIDATED. Prices (Pro ~$5–8 / Guardian $100+) and the
> free-vs-paid split are unproven until tested with real prospective users. Do NOT
> treat as fact in a deck — present as "model to validate." The single highest-value
> next step is willingness-to-pay validation via customer conversations.
>
> Build status (NOW vs ROADMAP): ✅ built today · 🟡 partial / built-but-gated ·
> 📋 specced · 💡 idea · ❌ removed. For any public page/deck, only ✅/🟡 may be
> shown as "available"; 📋/💡 must be labelled "roadmap / coming" — overclaiming
> fails diligence (the 188-page site is the cautionary tale).
>
> ⚠️ REALITY CAVEAT (verified vs code on `main`): **send is live ONLY for
> ETH/Sepolia** — all other assets (5 EVM chains, USDC, USDT, BTC, SOL) are
> `receive_only` (receive + balance work, send gated/unverified). All security
> features are PROVISIONAL pending the independent audit. See docs/Feature-Status.md.

## Pricing
- **Free** — full wallet + baseline security + ALL life-safety. Adoption engine + ethical floor; the headline is "we never paywall your safety."
- **Pro — ~$5–8/mo (~$50–80/yr) [validate]** — privacy + advanced protection depth. Priced like a consumer security subscription (password manager / VPN anchor), for individuals.
- **Guardian — $100+/mo, by application, limited slots** — Pro + a bespoke human-expert security service. A SERVICES line (capacity-limited by expert time), not scalable SaaS — treat its revenue as proof/credibility, not projection.

> Prices are UNVALIDATED hypotheses. ~$5–8 and $100 are reasoned against consumer-security and bespoke-service anchors respectively — exactly as unproven as any other number until tested. The next real step is willingness-to-pay discovery, not refinement.

## Tier × feature matrix — BUILT ONLY (sellable today)
Only ✅ built / 🟡 built-but-gated appear here — this is the commercial promise. Roadmap items are NOT shown in priced columns (see Feature-Status.md). Chains/dApp access never gated.

| Feature (status) | Free | Pro | Guardian |
|---|:---:|:---:|:---:|
| **Core wallet** | | | |
| Multi-chain receive + balance: EVM ✅ BTC ✅ SOL ✅ | ✅ | ✅ | ✅ |
| Send: ETH live ✅ / 9 others receive_only 🟡 | ✅ | ✅ | ✅ |
| Multi-account HD ✅, import ✅, seed backup ✅ | ✅ | ✅ | ✅ |
| Gas control ✅, transaction history ✅ | ✅ | ✅ | ✅ |
| **Baseline security** | | | |
| Encrypted vault ✅, biometric ✅, auto-lock ✅ | ✅ | ✅ | ✅ |
| Approval revoke ✅, calldata decode ✅, addr validation ✅ | ✅ | ✅ | ✅ |
| Address-poisoning / spam warnings ✅ | ✅ | ✅ | ✅ |
| Suspicious-address + OFAC screening (local) ✅ | ✅ | ✅ | ✅ |
| FIDO2 / passkeys ✅ | ✅ | ✅ | ✅ |
| **Life-safety — FREE BY PRINCIPLE (the headline)** | | | |
| Duress PIN / decoy ✅, panic wipe ✅, constant-KDF timing ✅ | ✅ | ✅ | ✅ |
| **Privacy & advanced protection** | | | |
| Stealth / hidden wallets ✅ | — | ✅ | ✅ |
| Transaction simulation ✅ | — | ✅ | ✅ |
| Anomaly / fraud detection ✅ | — | ✅ | ✅ |
| Security dashboard ✅ | — | ✅ | ✅ |
| Spending policies / daily limits ✅ | — | ✅ | ✅ |
| **Niceties** | | | |
| Address book ✅, ENS/SNS resolution ✅ | ✅ | ✅ | ✅ |
| **Guardian — bounded human service** | | | |
| 1:1 setup session + written threat model (onboarding) | — | — | ✅ |
| Quarterly review + best-effort priority support | — | — | ✅ |
| Recovery / inheritance setup assistance (advisory) | — | — | ✅ |
| DFIR advisory (post-incident triage, best-effort) | — | — | ✅ |

**⚠️ Pro currently has exactly 5 built differentiators over Free** (stealth wallets, transaction simulation, anomaly detection, security dashboard, spending limits). Validate whether that justifies a paid tier before launching it. Everything else that would sweeten Pro/Guardian is roadmap, not product.

**Roadmap features are tracked in `docs/Feature-Status.md` (the source of truth) — NOT duplicated here, and NEVER shown in a priced tier column.** Inheritance, hardware wallet, M2c/d, audit-log wiring, cloud backup, RASP, no-telemetry, privacy routing, time-locks, analytics, WalletConnect are all 📋/💡 there with their blockers.

## Guardian — human-expert service (bespoke tier; client always holds their own keys)
Included (bounded, all advisory): 1:1 secure-setup session (~90 min, onboarding); personalised written threat model (refreshed quarterly); quarterly security review; priority support (best-effort, ~1 business day target); recovery/inheritance setup assistance (advisory); DFIR advisory (best-effort).

Explicitly NOT (lawyer-review before advertising): NOT a guarantee of protection/fund safety/attack prevention; NOT 24/7 emergency response or a rescue service; NOT custody (never holds keys/funds); NOT legal/tax/financial advice; NOT incident remediation/fund recovery (best-effort only). Capacity-limited by expert time → keep slots limited. Needs professional-liability insurance + lawyer review of support-promise wording BEFORE any public pricing page.

> Structural note: this is two cheap individual software tiers (Free, Pro ~$6) + one premium human-service tier (Guardian $100) — a ~15× Pro→Guardian gap. That holds ONLY because Guardian is a different category (bespoke service, by application, limited slots), not "the top software tier." A pricing page must present Guardian as a service offering, not as an adjacent software plan.

## Changes from the original 3-tier model
- Merged Secure + Vault into one **Pro** (for a high-threat/high-value niche the privacy-buyer and high-value-buyer are likely the same person; re-split only if discovery shows two populations).
- Dropped **AI** as a tier lever (not built — no LLM integration; not a differentiator; external-LLM advisor contradicts the privacy wedge).
- Matrix is now **built-only**; roadmap items live in Feature-Status.md, never in priced columns.
- **Pro repriced** to a consumer-security anchor (~$5–8); **Guardian kept at $100+** as a bespoke, limited-slot service.

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
