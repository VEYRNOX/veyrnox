# Hosting & Billing Migration Plan (DECISION DOC)

> Captures the agreed target architecture for where Veyrnox runs and how
> subscriptions are billed, once the wallet is ready to launch. This is a
> LAUNCH-PREP activity, not a now activity — it does NOT block building. Recorded
> so the decision is settled and ready when you reach launch, not re-litigated.

---

## Current state (starting point)

- **Base44** hosts the public website (`veyrnox.com`) and originally hosted the
  web app interface.
- Base44 is GitHub-synced to the OLD repo `aljobson/veyrnox` (original UI/UX).
- All real wallet work (Phases A–C, verified) lives in the SEPARATE repo
  `aljobson/veyrnox-secure` — which Base44 is NOT connected to.
- Tier subscriptions currently bill through **Wix**.
- Target: native mobile apps (App Store + Google Play) plus a desktop web app;
  self-custody, non-custodial.

The core tension: the actual product now lives in `veyrnox-secure`, which Base44
isn't connected to, and the roadmap is heading to mobile, which Base44 doesn't
build at all.

---

## Target architecture (the decision)

1. **Public marketing site (`veyrnox.com`) STAYS on Base44.**
   No change. Brochure-ware, no wallet logic, no sensitive code — exactly what
   Base44 is good at. The old `veyrnox` repo + its Base44 sync stay dedicated to
   this and are left alone.

2. **The wallet app moves to YOUR control, built from `veyrnox-secure`.**
   - **Mobile** → Capacitor → App Store + Google Play (the Mobile.capacitor.md
     work).
   - **Web** → deploy the Vite build to **Cloudflare Pages** (recommended:
     generous free tier, strong security-header/CSP control which matters for a
     wallet, fast global CDN). Vercel or Netlify are equally acceptable
     alternatives. This replaces Base44 as the RUNTIME for the actual app.

3. **Billing: two rails, one source of truth.**
   - **Web tiers** → keep Wix/Stripe (you control the web payment rail).
   - **Mobile tiers** → Apple IAP / Google Play Billing. MANDATORY for store
     approval — you may NOT use Wix/Stripe for unlocking features in the mobile
     apps, and crypto can't be the payment rail. Stores take ~15–30%.
   - Behind both, a SINGLE record of "what tier is this user on," so entitlement
     is consistent regardless of how they paid. This reconciliation layer is the
     most complex piece — design it carefully (see below).

4. **Do NOT connect `veyrnox-secure` to Base44's GitHub sync.**
   That connection is PERMANENT and IRREVERSIBLE (you can't disconnect or
   transfer back, and pre-connection version history is lost). Keeping the secure
   repo independent is the whole point — it's the controlled, auditable home of
   the security-critical product. Simply never connecting it is the safe default.

---

## Why this architecture

- **Security & control:** the wallet (keys, signing, the sensitive code) lives in
  a repo and on hosting YOU control, not entangled with a no-code platform whose
  AI can edit synced code and whose sync is irreversible.
- **Store-compatible:** mobile delivery is the stores; nothing about Base44 helps
  or is needed there.
- **Build-to-sell:** "we own and control the security-critical product end to
  end" is a materially better story for an acquirer than "entangled with a
  no-code platform's hosting." Clean ownership = cleaner due diligence.
- **Keeps what works:** no pointless migration of the marketing site, which has
  no reason to move.

---

## Execution order (timing)

This is deliberately LATE — launch-prep, not now.

- **Now / ongoing:** keep building (Mobile M1 Capacitor shell, then M2 native
  secure storage). Hosting does not block any of this.
- **Before launching to real users:**
  - Stand up web hosting on Cloudflare Pages from `veyrnox-secure` (Vite build).
    Configure HTTPS, security headers / CSP (important for a wallet).
  - Wire mobile IAP / Play Billing during the mobile store-hardening phase
    (Mobile.capacitor.md M3).
  - Design + build the two-rail billing reconciliation (below).
- **Gate:** the independent third-party audit should be done before real-money
  (mainnet) launch regardless of hosting.

---

## Two-rail billing — design notes (the complex piece)

Goal: one user → one tier/entitlement, no matter how they paid.

- A backend "entitlement" record per user is the source of truth (NOT the
  payment provider). Web (Wix/Stripe) and mobile (IAP/Play) each WRITE to it via
  their webhooks/receipts; the app READS entitlement from it.
- **Receipt validation:** validate Apple/Google purchase receipts server-side
  (never trust the client) before granting a tier.
- **Cross-platform caveat:** a user who subscribes on web shouldn't be
  double-charged on mobile and vice-versa; decide the policy (e.g. entitlement
  is account-wide; the app shows "already subscribed" if entitled via another
  rail). Note store rules limit how you can steer users to cheaper web billing —
  follow current Apple/Google anti-steering rules at build time.
- **Self-custody note:** entitlement/tier is an APP feature gate, entirely
  separate from the wallet keys/funds. Billing must NEVER touch key material or
  custody funds — keep it cleanly isolated from wallet-core.

---

## Open items / to confirm at execution time
- [ ] Pick web host (Cloudflare Pages recommended) and set up deploy from
      `veyrnox-secure`.
- [ ] Security headers / CSP for the web wallet host.
- [ ] Backend entitlement store + Wix/Stripe and IAP/Play webhook integration.
- [ ] Server-side receipt validation for store purchases.
- [ ] Cross-platform entitlement + anti-steering policy (re-check current store
      rules).
- [ ] Keep `veyrnox-secure` UNCONNECTED to Base44 sync (permanent if connected).
- [ ] Confirm the marketing site stays on Base44; no wallet code there.
- [ ] (Legal) confirm non-custodial design + billing model don't trip financial
      licensing in target markets.
