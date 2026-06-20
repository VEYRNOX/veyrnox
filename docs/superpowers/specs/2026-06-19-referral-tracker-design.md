# Referral Tracker — Design Spec

**Date:** 2026-06-19
**Status:** Approved for implementation

---

## Goals

1. Grow the user base — users share a code with friends and the app tracks conversions.
2. Personal tracking — users see who they've invited and their current reward tier.

---

## Approach

**Option A — Referral code only.** Each user gets a short `VYX-XXXX` code. New users enter the code at onboarding or on the Referral page. A minimal backend increments a counter and returns the new count. No wallet addresses, no holdings, no identity cross the server. Privacy invariants I1–I5 are preserved.

---

## Architecture

### Client

| File | Responsibility |
|------|---------------|
| `src/lib/referral.js` | Pure helpers: generate code, read/write local state, evaluate tier |
| `src/pages/ReferralTracker.jsx` | `/referrals` screen — code display, invite count, tier progress, CTA |
| `src/api/referral.js` | API calls: register code on first launch, redeem a code, poll status |

Referral code and reward state are stored in `localStorage`. No wallet data is involved.

### Backend (new — minimal)

A single serverless endpoint (Cloudflare Worker or Vercel function) with two operations:

- `POST /referrals/register` — stores `{ code, createdAt }` on first app launch
- `POST /referrals/redeem` — increments counter for a code, returns `{ newCount, tier }`
- `GET /referrals/status?code=VYX-XXXX` — returns current count for a code

**Data stored per code:** `{ code, count, createdAt }` only. No user identity, no wallet address, no holdings.

Rate-limiting on `/redeem` by IP to deter abuse.

---

## Components & Data Flow

### `src/lib/referral.js`

- `generateCode()` — produces `VYX-XXXX` (4 random alphanumeric chars), stable across calls, creates fresh code if localStorage is empty
- `getLocalState()` — returns `{ code, inviteCount, tier, unlockedFeatures, externalEligible }`
- `applyRedemption(newCount)` — evaluates tier from count, writes reward state to localStorage
- `getTier(count)` — pure: `0 → none`, `1 → bronze`, `5 → silver`, `10 → gold`

### `src/pages/ReferralTracker.jsx`

- User's code displayed in IBM Plex Mono with copy button
- Invite count and tier progress bar (milestones: 1, 5, 10)
- Earned tier badges (teal `#4ADAC2` accent for achieved tiers)
- "Claim external reward" CTA at gold tier (mailto or Tally/Typeform URL — configurable constant)
- "Enter a referral code" input for post-onboarding code entry

### Onboarding integration

A single optional "Got an invite code?" field added to the seed creation flow. On submit, calls `POST /referrals/redeem`. Failure (invalid code, network error) is silently ignored — onboarding is never blocked.

### Data flow on referral conversion

```
New user enters code → POST /referrals/redeem
  → backend increments count, returns { newCount, tier }
  → referrer's app polls on next open: GET /referrals/status?code=VYX-XXXX
  → applyRedemption(newCount) → reward written to localStorage
```

---

## Reward Tiers

| Tier | Threshold | In-app reward | External reward |
|------|-----------|---------------|-----------------|
| Bronze | 1 referral | Badge unlocked on Referral page | — |
| Silver | 5 referrals | Unlocks Portfolio Snapshots (if not on paid plan) | — |
| Gold | 10 referrals | Subscription credit applied locally | Eligible to claim external reward (manual fulfillment) |

**Feature unlocks:** `applyRedemption()` writes `unlockedFeatures: ['portfolio-snapshots']` to localStorage. The existing `featureRegistry.js` gate mechanism is extended with a `referral` unlock source — no new gate infrastructure needed.

**Subscription credit:** stored as `referralCredit: true` in localStorage, read by the billing flow. Credit amount defined in one constant.

**External reward CTA:** "Claim your reward →" button at gold tier opens a configurable mailto or form URL. Fulfillment is manual — no backend involvement.

**Anti-gaming:** device can only redeem one code (localStorage flag). Backend rate-limits `/redeem` by IP. No wallet verification required at v1.

---

## Error Handling & Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Backend unreachable at onboarding | Silently skip, store entered code locally, retry on next open |
| Backend unreachable on Referral page | Show last known count with "Last synced X ago" label |
| Invalid / unknown code | Backend returns 404 → "Code not found" inline error, field cleared |
| User enters own code | Client detects before API call → "That's your own code" message |
| Code already redeemed on this device | `redeemedCode` localStorage flag → "You've already used a referral code" |
| Count exceeds max tier | `getTier()` is idempotent — no double reward |
| Feature already on paid plan | Silver unlock skipped if feature already accessible |
| App reinstall / new device | New code generated, prior count lost — acceptable for v1 |

---

## Testing

### Unit tests (`src/lib/referral.test.js`)

- `generateCode()` — correct format, stable across calls, fresh on empty localStorage
- `getTier(count)` — correct tier at 0, 1, 4, 5, 9, 10, 15
- `applyRedemption(count)` — correct localStorage writes per tier, idempotent on repeat
- Own-code guard — no API call made
- Already-redeemed guard — no API call made

### Integration tests (mock API)

- Successful redeem: code entered → POST → count incremented → reward applied
- Backend 404 → "Code not found" shown, onboarding not blocked
- Backend timeout → silent skip in onboarding, stale count shown on Referral page

### Manual smoke tests

- Onboarding field visible, optional, doesn't block seed creation on skip or failure
- Referral page renders at `/referrals`, code in IBM Plex Mono, copy works
- Tier progress bar advances at 1 / 5 / 10
- Gold CTA opens correct external URL

---

## Out of Scope (v1)

- Deep-link auto-fill (`veyrnox.app/join?ref=XXXX`) — future enhancement
- End-to-end test across two real devices (requires deployed backend)
- Public leaderboard or public profiles (cut on principle — leaks holdings)
- Cross-device code persistence / account recovery
