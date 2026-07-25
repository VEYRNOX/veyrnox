# 10K Subscriber Growth Plan — Design Spec

**Date:** 2026-07-24
**Status:** Draft
**Goal:** 10,000 paying Safety Plus subscribers ($5.99/mo or $49.99/yr)
**Timeline:** 6 months to ~4,500 paid (honest), 8-9 months to 10K
**Budget:** $1-5K/month ($2,100/mo average)
**Team:** Founder + 1-2 people

## 1. Strategy: Referral-Engine + Content Hybrid

Two growth engines working together:

1. **Content** (top of funnel) — security-focused posts that demonstrate Veyrnox's
   unique coercion-resistance features. Drives installs and awareness.
2. **Referral system** (compounding loop) — paid subscribers become referrers, each
   bringing 2-4 new paid users/month via the existing 4-tier commission system.

Content feeds the referral engine. The referral engine compounds what content starts.

```
Content (top of funnel) --> Install + Free trial --> Paid Safety Plus
     |                                                    |
  Referral code in content                    Subscriber becomes referrer
     ^                                                    |
     '---------------- Referral loop <--------------------'
```

## 2. Funnel Math

### Conversion assumptions (conservative, crypto security benchmarks)

| Stage                          | Rate    |
| ------------------------------ | ------- |
| Content impression -> click    | 0.5-1%  |
| Click -> install               | 15-25%  |
| Install -> wallet created      | 60-70%  |
| Wallet created -> paid (30d)   | 8-12%   |
| Paid -> active referrer        | 15-20%  |
| Active referrer -> new paid/mo | 2-4     |

### 6-month projection

| Month | New paid (organic+content) | New paid (referral) | Cumulative paid | MRR      |
| ----- | -------------------------- | ------------------- | --------------- | -------- |
| 1     | 80                         | 0                   | 80              | $479     |
| 2     | 150                        | 40                  | 270             | $1,617   |
| 3     | 200                        | 160                 | 630             | $3,774   |
| 4     | 250                        | 450                 | 1,330           | $7,967   |
| 5     | 300                        | 900                 | 2,530           | $15,155  |
| 6     | 350                        | 1,600               | 4,480           | $26,835  |

Reaching 10K requires the viral coefficient (k) to exceed 0.7. Best case (k > 1.0)
hits 10K at month 6; base case hits 10K at month 8-9.

## 3. Target Pools

| Pool                           | Size est. | Why they convert                          | Channel                              |
| ------------------------------ | --------- | ----------------------------------------- | ------------------------------------ |
| Privacy/security crypto X      | ~500K     | Coercion resistance is unique             | X/Farcaster, CT influencers          |
| Post-hack victims              | ~200K     | Fear-motivated, will pay for real security | Reddit, hack post-mortems            |
| Emerging market holders        | Millions  | Coercion resistance solves a real problem  | Telegram, local communities          |
| DeFi power users               | ~1M+      | WalletConnect + RASP = upgrade from MM     | DeFi Discord/Telegram, partnerships  |
| Bitcoin holders going multichain| ~300K    | BTC + EVM + SOL in one HD wallet           | Bitcoin podcasts, newsletters        |
| Crypto newsletter audiences    | ~2M agg.  | Educated, subscription-tolerant            | Sponsorships + referral codes        |

## 4. Channel Strategy

### Phase 1 — Pre-launch seeding (Weeks -4 to 0)

Goal: 500-1,000 waitlist + 50 founding referrers.

1. **"Wrench Test" launch content** — 60-second deniability demo, posted as X thread.
   Hook: "Your wallet just failed the $5 wrench test. Here's one that doesn't."
   Budget: $0.

2. **Founding Referrer Program** — DM 100-150 crypto security accounts. Offer
   pre-assigned Gold-tier referral code (10% commission from day 1). First 50 accepted
   get founding status. Budget: $0 upfront, commission-only.

3. **Landing page with email capture** — veyrnox.com waitlist. Budget: $0.

### Phase 2 — Launch & ignition (Months 1-2)

Goal: 270 paid, 30+ active referrers.

4. **Staggered app store launch** — Play production -> Apple. Each is a content moment.

5. **Weekly security content** — 2 posts/week, alternating "Wrench Test" scenarios
   (SIM swap, border crossing, home invasion, evil maid, corrupt official) and
   "Under the Hood" technical posts (hardware KEK, Argon2id, RASP, WalletConnect
   gating, vault AAD binding, open audit scope).

6. **Podcast guest spots** (free, not sponsorships) — What Bitcoin Did, Darknet
   Diaries, Citadel Dispatch, Stephan Livera, Unchained, regional pods.

7. **Micro-influencer seeding** — 10-15 crypto X accounts (5K-50K followers), $50-150
   each for honest review posts. Budget: $500-1,500/mo.

### Phase 3 — Referral flywheel (Months 3-4)

Goal: Referral-driven growth exceeds organic. 1,330 cumulative paid.

8. **Referral UX improvements** — Native Share API, post-transaction referral prompt,
   tier progress indicator, deep link attribution (see Section 5).

9. **"Security Challenge" campaign** — Monthly: "Can you break into this wallet?"
   $500 bounty. Budget: $500/mo.

10. **Emerging market push** — Spanish/Portuguese content translation, 10-20 regional
    Telegram groups. Budget: $500/mo.

### Phase 4 — Compounding (Months 5-6)

Goal: 4,500 paid, referral loop self-sustaining.

11. **Protocol partnerships** — Approach 3-5 DeFi protocols with traction data.
12. **Retention offers** — Trigger 50% retention discount at month 3 churn cliff.
13. **Community-generated content** — $100/mo prize for best "Why I switched" thread.

### Budget summary

| Line item                      | Monthly | 6-month total |
| ------------------------------ | ------- | ------------- |
| Micro-influencer reviews       | $1,000  | $6,000        |
| Security challenge bounty      | $500    | $3,000        |
| Emerging market localization   | $500    | $3,000        |
| Community content prizes       | $100    | $600          |
| Referral commissions (from rev)| Variable| ~$1,600       |
| **Total out-of-pocket**        | **$2,100** | **$12,600** |

## 5. Product Changes Required

### 5a. Referral sharing upgrade (HIGH impact)

**Current:** Copy-to-clipboard only in `ReferralTracker.jsx:271-279`.

Changes needed:

1. **Native Share API** — `navigator.share()` with fallback to clipboard. Pre-filled
   message with referral code.
   - File: `src/pages/ReferralTracker.jsx`

2. **Post-transaction referral prompt** — Bottom sheet after first `send_completed`.
   Show once, dismiss permanently.
   - Files: send completion flow, new component

3. **Tier progress indicator** — Progress bar on referral tracker: "12/100 paid
   referrals -> Silver (5% commission)". Uses existing `get_referral_paid_count` RPC.
   - File: `src/pages/ReferralTracker.jsx`

4. **Deep link attribution** — `veyrnox.com/r/VYX-XXXXXX` stores code in localStorage,
   auto-applies discount at paywall. Check for `?ref=` param on app open.
   - Files: `src/lib/onboardingEntry.js`, landing page, `src/pages/SafetyPlus.jsx`

### 5b. Paywall timing (HIGH impact)

**Current:** No paywall during onboarding. Subscription page exists but isn't surfaced.

Changes needed:

1. **Day-3 soft paywall** — Non-blocking modal after 3+ `session_start` events on
   different days. Dismissable, shown once.
   - Files: new component, wired in app shell

2. **Post-backup nudge** — After `backup_confirmed` event: "Your seed is backed up.
   Safety Plus adds hardware binding so a stolen backup can't be used elsewhere."
   - Files: backup completion flow

3. **Free tier gating** — Define what free users lose:
   - Free: basic wallet, send/receive, backup
   - Safety Plus: hardware KEK, RASP, WalletConnect spend limits, priority support
   - **Keep deniability FREE** — it's the viral hook that drives content and demos.
     Gate the "enterprise security" layer (KEK + RASP + spend limits).

### 5c. Analytics events (MEDIUM impact)

**Current:** 7 event types in `src/api/trackEvent.js:35-43`.

New events needed:

1. `referral_code_applied` — metadata: `{code, source}`
2. `paywall_shown` — metadata: `{trigger, day_count}`
3. `paywall_dismissed` — metadata: `{trigger}`
4. `paywall_converted` — metadata: `{plan, referral_code_used}`

Plus a Supabase SQL funnel view: `wallet_created` -> `session_start (day 3+)` ->
`paywall_shown` -> paid conversion rate.

### 5d. Onboarding for emerging markets (month 3+)

1. Device locale detection -> Spanish/Portuguese/Tagalog UI
2. Offline-capable onboarding (wallet creation is already local)

## 6. Referral Program Optimization

### Current tier problem

Bronze (2.5% = $0.15/subscriber/month) isn't motivating enough to drive the first
referral. The system rewards whales but doesn't ignite the first spark.

### Proposed changes

**6a. First-referral bonus** — Refer your first paid subscriber -> 1 month Safety Plus
free (RevenueCat credit). Costs $5.99 in lost revenue, converts a payer into a referrer.
New RPC: `check_first_referral_bonus`.

**6b. Founding Referrer tier** — 50 pre-launch influencers start at Gold (10%). Time-
limited: 6 months, then resets to earned level. Supabase flag: `is_founding_referrer`,
`founding_expires_at`.

**6c. Simplified buyer discount** — Sidestep Apple's percentage pricing problem:

| Referrer tier      | Buyer discount           | Implementation               |
| ------------------ | ------------------------ | ---------------------------- |
| Bronze / Silver    | First month free         | RevenueCat free trial +1 mo  |
| Gold / Platinum    | First 3 months 50% off   | Existing promotional offers  |

**6d. Referral leaderboard** — Top 10 referrers (anonymized: "VYX-A3**** — 47 referrals,
Gold"). New RPC: `get_referral_leaderboard` returning `[{rank, masked_code, paid_count,
tier}]`. Server-side masking only.

**6e. Fraud prevention**

1. Device fingerprinting — same `veyrnox-device-id` can't be referrer AND referred
   within 30 days.
2. Payment verification — commission counts on payment clear, not trial start.
3. Velocity limit — cap 20 new referrals per code per day, flag for review.
4. Clawback — refund within 72h reverses referral count. New RPC: `decrement_referral`.

### Commission payout

- Threshold: $25 minimum
- Method: USDC on-chain (dogfooding)
- Frequency: monthly, manual initially
- Tax: track cumulative payouts; >$600/yr requires 1099 in US

## 7. Content Playbook

### Core narrative

Every piece of content answers: **"What happens to your crypto when someone forces you
to unlock your phone?"** No other wallet answers this.

### Pillar 1: "Wrench Test" series (weekly)

| Week | Scenario        | Hook                                                        |
| ---- | --------------- | ----------------------------------------------------------- |
| 1    | Launch          | "Your wallet just failed the $5 wrench test."               |
| 3    | SIM swap        | "They ported your number in 12 minutes."                    |
| 5    | Border crossing | "Customs asked to see your phone."                          |
| 7    | Home invasion   | "They said 'unlock it.' You did. They saw $47."             |
| 9    | Evil maid       | "Your phone was out of sight for 20 minutes."               |
| 11   | Corrupt official| "The police told you to transfer everything."               |

### Pillar 2: "Under the Hood" (weekly, alternating)

| Week | Topic              | What it demonstrates                             |
| ---- | ------------------ | ------------------------------------------------ |
| 2    | Hardware KEK       | Seed encrypted by secure chip, not filesystem    |
| 4    | Argon2id KDF       | 192MB memory-hard derivation                     |
| 6    | RASP               | Frida/Magisk/palera1n detection at runtime       |
| 8    | WalletConnect      | Chain/address binding, gas cap, spend limits     |
| 10   | Vault AAD binding  | Blob bound to creating device                    |
| 12   | Open audit scope   | What passed, what's outstanding (I4 fail honest) |

### Reactive content

Pre-written response templates for: exchange hacks, SIM swaps, government seizures,
hardware wallet vulnerabilities. Response within 2 hours of event for maximum reach.

### Platform tactics

- **X/Twitter:** Primary. 2/week. Quote-tweet hacks within 2 hours.
- **Reddit:** Educational, don't shill. Target "which wallet" threads.
- **Farcaster:** Cross-post. Over-indexes on self-custody audience.
- **Telegram:** Emerging markets. Join groups, answer questions, share when asked.
- **YouTube Shorts/TikTok:** Month 2+. Deniability demo is perfect short-form.

### Podcast guest strategy

Target 1-2/month. Free guest spots, not sponsorships. Pitch: "We built the first
wallet with a panic button." Send 2-minute deniability demo to hosts.

Shows: What Bitcoin Did, Darknet Diaries (adjacent), Citadel Dispatch, Stephan Livera,
Unchained, regional LatAm/SEA pods.

## 8. Timeline & Go/No-Go Gates

### Pre-launch (Weeks -4 to 0)

- Ship referral UX (native share, post-tx prompt, tier progress, deep links)
- Ship paywall events + day-3 soft paywall + post-backup nudge
- Build Founding Referrer flag in Supabase
- Record deniability demo video
- DM 100-150 accounts, target 30-50 founding referrers
- Draft first 4 weeks of content

**Launch gate:**
- [ ] Referral share -> install -> code applied -> discount works end-to-end
- [ ] 20+ founding referrers confirmed
- [ ] Paywall analytics firing
- [ ] Demo video ready

### Monthly go/no-go gates

**Month 1 (target: 80 paid):**
- <30 paid: paywall or value prop broken. Diagnose before month 2 spend.
- \>80 paid, <10 referrers: referral incentive not working. Bump Bronze or add first-
  referral bonus.
- \>80 paid, >20 referrers: proceed as planned.

**Month 2 (target: 270 cumulative):**
- Key metric: referral conversion rate (% of shared codes -> paid subscriber).
- \>5%: loop working, accelerate.
- 2-5%: working, optimize UX.
- <2%: pause influencer spend, run user interviews.

**Month 3 (target: 630 cumulative) — THE BIG GATE:**
- Calculate viral coefficient: k = (avg referrals per paid) x (referral -> paid rate).
- k > 0.7: on track, continue.
- k = 0.3-0.7: increase top-of-funnel spend.
- k < 0.3: pivot to protocol partnerships as primary engine.

**Month 4 (target: 1,330 cumulative):**
- Monthly churn must be <8%. High churn kills compounding.

### Honest 10K timeline

| Scenario   | k value   | 10K at   | Requires                                    |
| ---------- | --------- | -------- | ------------------------------------------- |
| Best case  | > 1.0     | Month 6  | Viral breakout + compounding referral loop   |
| Good case  | 0.7-1.0   | Month 8  | Consistent content + working referral loop   |
| Base case  | 0.4-0.7   | Month 10 | Ongoing content + influencer spend needed    |
| Worst case | < 0.3     | 12+ / never | Pivot to partnerships or raise budget     |

## 9. Key Metrics Dashboard (weekly)

| Metric                | Source                | What it tells you             |
| --------------------- | --------------------- | ----------------------------- |
| New installs          | Play Console / ASC    | Top of funnel                 |
| wallet_created        | Supabase track_event  | Install -> activation         |
| paywall_shown -> paid | Supabase (new events) | Conversion rate               |
| referral_code_applied | Supabase (new event)  | Referral reach                |
| Paid subscribers      | RevenueCat            | The number that matters       |
| Monthly churn         | RevenueCat            | Compounding killer if >10%    |
| Viral coefficient (k) | Manual calc monthly  | Go/no-go decision driver      |
| MRR                   | RevenueCat            | Revenue trajectory            |
