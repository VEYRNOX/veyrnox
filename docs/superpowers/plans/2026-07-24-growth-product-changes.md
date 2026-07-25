# Growth Product Changes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the product changes that unblock the 10K subscriber growth strategy — analytics events for funnel visibility, referral sharing upgrades for viral loop, deep link attribution, paywall timing for conversion, and a post-transaction referral prompt.

**Architecture:** All changes are additive — new events in the existing trackEvent system, new UI affordances in existing pages, and a new lightweight modal component using the existing `useModalA11y` hook. No new routes or backend RPCs in this plan (backend changes like `get_referral_leaderboard` and fraud prevention are a separate follow-up plan).

**Tech Stack:** React, Vite, Capacitor, Supabase RPC, RevenueCat, localStorage, Web Share API, framer-motion

## Global Constraints

- All new code must be gated by `isDeniabilityOrDemoActive()` — zero state leaks in decoy/demo sessions (I3).
- All localStorage keys must use the `veyrnox-` prefix.
- All analytics events are best-effort fire-and-forget — never block the app on tracking failure (I4).
- All new UI must respect `useReducedMotion()` for animations.
- Design system: calm near-black surfaces (#050608 → #1D222B), teal accent (#4ADAC2), Schibsted Grotesk / IBM Plex Mono.

---

### Task 1: Add growth analytics events to trackEvent.js

**Files:**
- Modify: `src/api/trackEvent.js:34-43`
- Test: `src/api/__tests__/trackEvent.test.js` (create if not exists, or add to existing)

**Interfaces:**
- Consumes: existing `trackEvent(event, metadata)` function, `EVENT` constant object
- Produces: 4 new event constants — `EVENT.REFERRAL_CODE_APPLIED`, `EVENT.PAYWALL_SHOWN`, `EVENT.PAYWALL_DISMISSED`, `EVENT.PAYWALL_CONVERTED`

- [ ] **Step 1: Write the failing test**

Create or extend the test file to verify the new constants exist:

```js
// src/api/__tests__/trackEvent.test.js
import { describe, it, expect } from 'vitest';
import { EVENT } from '@/api/trackEvent';

describe('EVENT constants', () => {
  it('includes growth analytics events', () => {
    expect(EVENT.REFERRAL_CODE_APPLIED).toBe('referral_code_applied');
    expect(EVENT.PAYWALL_SHOWN).toBe('paywall_shown');
    expect(EVENT.PAYWALL_DISMISSED).toBe('paywall_dismissed');
    expect(EVENT.PAYWALL_CONVERTED).toBe('paywall_converted');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/__tests__/trackEvent.test.js`
Expected: FAIL — `EVENT.REFERRAL_CODE_APPLIED` is `undefined`

- [ ] **Step 3: Add the 4 new event constants**

In `src/api/trackEvent.js`, add to the `EVENT` object (after line 42, before the closing `}`):

```js
export const EVENT = {
  WALLET_CREATED: 'wallet_created',
  WALLET_IMPORTED: 'wallet_imported',
  SESSION_START: 'session_start',
  SEND_COMPLETED: 'send_completed',
  RECEIVE_VIEWED: 'receive_viewed',
  WC_SESSION_APPROVED: 'wc_session_approved',
  BACKUP_CONFIRMED: 'backup_confirmed',
  REFERRAL_CODE_APPLIED: 'referral_code_applied',
  PAYWALL_SHOWN: 'paywall_shown',
  PAYWALL_DISMISSED: 'paywall_dismissed',
  PAYWALL_CONVERTED: 'paywall_converted',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/__tests__/trackEvent.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/trackEvent.js src/api/__tests__/trackEvent.test.js
git commit -m "feat(analytics): add growth funnel event constants

referral_code_applied, paywall_shown, paywall_dismissed, paywall_converted
— all best-effort, I3-gated via existing trackEvent() pipeline."
```

---

### Task 2: Wire referral_code_applied event into redeem flow

**Files:**
- Modify: `src/pages/ReferralTracker.jsx:291-307` (the `handleRedeem` success path)
- Test: manual — the redeem flow is deeply coupled to Supabase RPC mocking

**Interfaces:**
- Consumes: `trackEvent(EVENT.REFERRAL_CODE_APPLIED, metadata)` from Task 1
- Produces: a `referral_code_applied` event fires on successful code redemption

- [ ] **Step 1: Add trackEvent import to ReferralTracker.jsx**

At the top of `src/pages/ReferralTracker.jsx`, add:

```js
import { trackEvent, EVENT } from '@/api/trackEvent';
```

- [ ] **Step 2: Fire the event on successful redeem**

In `handleRedeem`, after `toast.success('Referral code applied!')` (line 307), add:

```js
void trackEvent(EVENT.REFERRAL_CODE_APPLIED, { code: input, source: 'manual_entry' }).catch(() => {});
```

This goes AFTER `markRedeemed(input)` and the `applyRedemption()` call — analytics must never block the redemption path (I4). The `source: 'manual_entry'` distinguishes from future deep-link attribution (`source: 'deep_link'`).

- [ ] **Step 3: Commit**

```bash
git add src/pages/ReferralTracker.jsx
git commit -m "feat(analytics): fire referral_code_applied on manual redeem"
```

---

### Task 3: Add native Share API to referral code sharing

**Files:**
- Modify: `src/pages/ReferralTracker.jsx:271-279` (the `copyCode` function and its button)

**Interfaces:**
- Consumes: `navigator.share()` (Web Share API), `navigator.clipboard.writeText()` (fallback)
- Produces: a share button that uses native share on mobile, clipboard on desktop

- [ ] **Step 1: Replace copyCode with shareOrCopy**

In `src/pages/ReferralTracker.jsx`, replace the `copyCode` function (lines 271-279) with:

```js
const shareOrCopy = async () => {
  const shareText = `I use Veyrnox — a crypto wallet with a panic button. Get a discount on Safety Plus with my code: ${code}`;
  const shareUrl = `https://veyrnox.com/r/${code}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Veyrnox Referral', text: shareText, url: shareUrl });
      toast.success('Shared!');
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
      // Share API failed — fall through to clipboard
    }
  }

  await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`).catch(() => {
    toast.error('Copy failed — select the code manually.');
    return;
  });
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
  toast.success('Code copied!');
};
```

- [ ] **Step 2: Add Share icon import**

Add `Share2` to the lucide-react import at line 3:

```js
import { Gift, Copy, CheckCircle2, ExternalLink, ChevronRight, TrendingUp, DollarSign, Mail, Share2 } from 'lucide-react';
```

- [ ] **Step 3: Update the share button UI**

Replace the copy button (lines 354-360) with a button that shows Share or Copy based on API availability:

```jsx
<button
  onClick={shareOrCopy}
  className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
>
  {copied ? <CheckCircle2 className="h-4 w-4 text-primary" /> : navigator.share ? <Share2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
  {copied ? 'Copied' : navigator.share ? 'Share' : 'Copy'}
</button>
```

- [ ] **Step 4: Verify in browser**

Start the dev server and navigate to `/referrals`. On desktop, the button should say "Copy" and copy to clipboard. On a mobile device or in a Share API-supporting browser, it should say "Share" and open the native share sheet.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ReferralTracker.jsx
git commit -m "feat(referral): native Share API with clipboard fallback

Uses navigator.share() on supported platforms (mobile), falls through
to clipboard copy on desktop. Share text includes the referral deep link."
```

---

### Task 4: Deep link referral attribution on app open

**Files:**
- Create: `src/lib/referralAttribution.js`
- Modify: `src/App.jsx` (add effect near the top of the App component)
- Test: `src/lib/__tests__/referralAttribution.test.js`

**Interfaces:**
- Consumes: `setPendingReferral(code)` from `src/lib/referral.js`, `trackEvent` from Task 1
- Produces: `captureReferralFromUrl()` — reads `?ref=VYX-XXXXXX` from the URL on app load, stores it as a pending referral

- [ ] **Step 1: Write the failing test**

```js
// src/lib/__tests__/referralAttribution.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/referral', () => ({
  setPendingReferral: vi.fn(),
  getPendingReferral: vi.fn(() => null),
}));
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('@/api/trackEvent', () => ({
  trackEvent: vi.fn(),
  EVENT: { REFERRAL_CODE_APPLIED: 'referral_code_applied' },
}));

import { captureReferralFromUrl } from '@/lib/referralAttribution';
import { setPendingReferral } from '@/lib/referral';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

describe('captureReferralFromUrl', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('captures a valid VYX code from ?ref param', () => {
    const url = new URL('https://veyrnox.com/?ref=VYX-AB3DEF');
    captureReferralFromUrl(url);
    expect(setPendingReferral).toHaveBeenCalledWith('VYX-AB3DEF');
  });

  it('ignores invalid codes', () => {
    const url = new URL('https://veyrnox.com/?ref=INVALID');
    captureReferralFromUrl(url);
    expect(setPendingReferral).not.toHaveBeenCalled();
  });

  it('does nothing when no ref param present', () => {
    const url = new URL('https://veyrnox.com/');
    captureReferralFromUrl(url);
    expect(setPendingReferral).not.toHaveBeenCalled();
  });

  it('does nothing in deniability mode', () => {
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    const url = new URL('https://veyrnox.com/?ref=VYX-AB3DEF');
    captureReferralFromUrl(url);
    expect(setPendingReferral).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/referralAttribution.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement captureReferralFromUrl**

```js
// src/lib/referralAttribution.js
import { setPendingReferral, getPendingReferral } from '@/lib/referral';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { trackEvent, EVENT } from '@/api/trackEvent';

const CODE_RE = /^VYX-[A-Z2-9]{6}$/;

export function captureReferralFromUrl(url = new URL(window.location.href)) {
  if (isDeniabilityOrDemoActive()) return;
  const ref = url.searchParams.get('ref')?.trim().toUpperCase();
  if (!ref || !CODE_RE.test(ref)) return;
  if (getPendingReferral() === ref) return;
  setPendingReferral(ref);
  void trackEvent(EVENT.REFERRAL_CODE_APPLIED, { code: ref, source: 'deep_link' }).catch(() => {});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/referralAttribution.test.js`
Expected: PASS

- [ ] **Step 5: Wire into App.jsx**

In `src/App.jsx`, add near the top of the `App` component (after existing imports and before `return`):

```js
import { captureReferralFromUrl } from '@/lib/referralAttribution';

// Inside the App component, add a one-time effect:
useEffect(() => { captureReferralFromUrl(); }, []);
```

This runs once on mount, captures the `?ref=` param if present, and stores it for use when the user reaches the paywall.

- [ ] **Step 6: Commit**

```bash
git add src/lib/referralAttribution.js src/lib/__tests__/referralAttribution.test.js src/App.jsx
git commit -m "feat(referral): capture ?ref= deep link on app load

Stores the referral code as pending for attribution at paywall time.
I3: no-op in deniability/demo sessions."
```

---

### Task 5: Post-transaction referral prompt

**Files:**
- Create: `src/components/ReferralPrompt.jsx`
- Modify: `src/pages/SendCrypto.jsx:134-179` (add prompt to `SendDoneView`)
- Test: `src/components/__tests__/ReferralPrompt.test.js`

**Interfaces:**
- Consumes: `getLocalState()` and `getEphemeralCode()` from `src/lib/referral.js`, `isDeniabilityOrDemoActive()`, `navigator.share()`
- Produces: `<ReferralPrompt />` — a one-time bottom card shown after first send, with share button

- [ ] **Step 1: Write the failing test**

```js
// src/components/__tests__/ReferralPrompt.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const DISMISSED_KEY = 'veyrnox-referral-prompt-dismissed';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('@/lib/referral', () => ({
  getLocalState: vi.fn(() => ({ code: 'VYX-TEST01' })),
  getEphemeralCode: vi.fn(() => 'VYX-EPHEM1'),
}));

import { shouldShowReferralPrompt } from '@/components/ReferralPrompt';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

describe('shouldShowReferralPrompt', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('returns true on first send', () => {
    expect(shouldShowReferralPrompt()).toBe(true);
  });

  it('returns false after dismissal', () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    expect(shouldShowReferralPrompt()).toBe(false);
  });

  it('returns false in deniability mode', () => {
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    expect(shouldShowReferralPrompt()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/ReferralPrompt.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ReferralPrompt component**

```jsx
// src/components/ReferralPrompt.jsx
import { useState } from 'react';
import { Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { getLocalState, getEphemeralCode } from '@/lib/referral';

const DISMISSED_KEY = 'veyrnox-referral-prompt-dismissed';

export function shouldShowReferralPrompt() {
  try {
    if (isDeniabilityOrDemoActive()) return false;
    return !localStorage.getItem(DISMISSED_KEY);
  } catch {
    return false;
  }
}

function dismissPrompt() {
  try { localStorage.setItem(DISMISSED_KEY, '1'); } catch {}
}

export default function ReferralPrompt() {
  const [visible, setVisible] = useState(shouldShowReferralPrompt);
  if (!visible) return null;

  const deniable = isDeniabilityOrDemoActive();
  const code = deniable ? getEphemeralCode() : (getLocalState().code || '');
  if (!code) return null;

  const handleShare = async () => {
    const shareText = `I use Veyrnox — a crypto wallet with a panic button. Get a discount with my code: ${code}`;
    const shareUrl = `https://veyrnox.com/r/${code}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Veyrnox Referral', text: shareText, url: shareUrl });
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    } else {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`).catch(() => {});
      toast.success('Code copied!');
    }
    dismissPrompt();
    setVisible(false);
  };

  const handleDismiss = () => {
    dismissPrompt();
    setVisible(false);
  };

  return (
    <div className="mt-4 p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium">Know someone who needs secure crypto?</p>
        <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        You just sent crypto securely. Share Veyrnox and earn commission on every subscriber.
      </p>
      <Button onClick={handleShare} variant="outline" size="sm" className="gap-1.5">
        <Share2 className="h-3.5 w-3.5" /> Share your referral code
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/ReferralPrompt.test.js`
Expected: PASS

- [ ] **Step 5: Wire into SendDoneView**

In `src/pages/SendCrypto.jsx`, add the import at the top:

```js
import ReferralPrompt from '@/components/ReferralPrompt';
```

In the `SendDoneView` component, add `<ReferralPrompt />` inside the `motion.div` container, after the "Send Another" button (after line 176, before the closing `</motion.div>`):

```jsx
<motion.div variants={item}>
  <ReferralPrompt />
</motion.div>
```

- [ ] **Step 6: Verify in browser**

Start the dev server, complete a send transaction (use `VITE_DEV_UNGATE_SEND=1` in `.env.local`). The referral prompt should appear below the "Send Another" button. Dismiss it, do another send — it should not reappear.

- [ ] **Step 7: Commit**

```bash
git add src/components/ReferralPrompt.jsx src/components/__tests__/ReferralPrompt.test.js src/pages/SendCrypto.jsx
git commit -m "feat(referral): post-transaction referral prompt

One-time prompt after first send with share/copy. Dismissed permanently
via localStorage. I3: suppressed in deniability/demo."
```

---

### Task 6: Day-3 soft paywall modal

**Files:**
- Create: `src/components/PaywallNudge.jsx`
- Modify: `src/components/Layout.jsx` (mount the nudge)
- Test: `src/components/__tests__/PaywallNudge.test.js`

**Interfaces:**
- Consumes: `trackEvent(EVENT.PAYWALL_SHOWN/DISMISSED/CONVERTED, metadata)` from Task 1, `useModalA11y()` from `src/lib/useModalA11y.js`, `isDeniabilityOrDemoActive()`, session_start count from trackEvent history
- Produces: `<PaywallNudge />` — a non-blocking modal shown after 3+ distinct session days

- [ ] **Step 1: Write the failing test for the eligibility check**

```js
// src/components/__tests__/PaywallNudge.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('@/lib/entitlement', () => ({
  useTier: vi.fn(() => ({ currentTier: 'free' })),
}));

import { shouldShowPaywallNudge } from '@/components/PaywallNudge';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

const SESSION_COUNT_KEY = 'veyrnox-session-day-count';
const NUDGE_DISMISSED_KEY = 'veyrnox-paywall-nudge-dismissed';

describe('shouldShowPaywallNudge', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('returns false when session count is below 3', () => {
    localStorage.setItem(SESSION_COUNT_KEY, '2');
    expect(shouldShowPaywallNudge('free')).toBe(false);
  });

  it('returns true when session count is 3 or more', () => {
    localStorage.setItem(SESSION_COUNT_KEY, '3');
    expect(shouldShowPaywallNudge('free')).toBe(true);
  });

  it('returns false when already dismissed', () => {
    localStorage.setItem(SESSION_COUNT_KEY, '5');
    localStorage.setItem(NUDGE_DISMISSED_KEY, '1');
    expect(shouldShowPaywallNudge('free')).toBe(false);
  });

  it('returns false when already subscribed', () => {
    localStorage.setItem(SESSION_COUNT_KEY, '5');
    expect(shouldShowPaywallNudge('safety_plus')).toBe(false);
  });

  it('returns false in deniability mode', () => {
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    localStorage.setItem(SESSION_COUNT_KEY, '5');
    expect(shouldShowPaywallNudge('free')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/PaywallNudge.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Create session day counter utility**

The session day counter increments when `session_start` fires on a new calendar day. Add to `src/components/PaywallNudge.jsx`:

```jsx
// src/components/PaywallNudge.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useModalA11y } from '@/lib/useModalA11y';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { trackEvent, EVENT } from '@/api/trackEvent';
import { useTier } from '@/lib/entitlement';

const SESSION_COUNT_KEY = 'veyrnox-session-day-count';
const SESSION_LAST_DAY_KEY = 'veyrnox-session-last-day';
const NUDGE_DISMISSED_KEY = 'veyrnox-paywall-nudge-dismissed';

export function incrementSessionDayCount() {
  try {
    if (isDeniabilityOrDemoActive()) return;
    const today = new Date().toISOString().slice(0, 10);
    const lastDay = localStorage.getItem(SESSION_LAST_DAY_KEY);
    if (lastDay === today) return;
    localStorage.setItem(SESSION_LAST_DAY_KEY, today);
    const count = parseInt(localStorage.getItem(SESSION_COUNT_KEY) || '0', 10);
    localStorage.setItem(SESSION_COUNT_KEY, String(count + 1));
  } catch {}
}

export function shouldShowPaywallNudge(currentTier) {
  try {
    if (isDeniabilityOrDemoActive()) return false;
    if (currentTier === 'safety_plus') return false;
    if (localStorage.getItem(NUDGE_DISMISSED_KEY)) return false;
    const count = parseInt(localStorage.getItem(SESSION_COUNT_KEY) || '0', 10);
    return count >= 3;
  } catch {
    return false;
  }
}

export default function PaywallNudge() {
  const { currentTier } = useTier();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const { containerRef } = useModalA11y({ active: visible, onEscape: () => handleDismiss() });

  useEffect(() => {
    if (shouldShowPaywallNudge(currentTier)) {
      setVisible(true);
      void trackEvent(EVENT.PAYWALL_SHOWN, { trigger: 'day_3' }).catch(() => {});
    }
  }, [currentTier]);

  const handleDismiss = () => {
    try { localStorage.setItem(NUDGE_DISMISSED_KEY, '1'); } catch {}
    setVisible(false);
    void trackEvent(EVENT.PAYWALL_DISMISSED, { trigger: 'day_3' }).catch(() => {});
  };

  const handleUpgrade = () => {
    handleDismiss();
    void trackEvent(EVENT.PAYWALL_CONVERTED, { trigger: 'day_3' }).catch(() => {});
    navigate('/plans');
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade to Safety Plus"
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Upgrade to Safety Plus</h2>
          </div>
          <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          You&rsquo;ve been using Veyrnox for a few days. Safety Plus adds hardware-bound encryption, 
          tamper detection, and spend limits — so even a stolen device can&rsquo;t access your keys.
        </p>
        <div className="flex gap-3">
          <Button onClick={handleUpgrade} className="flex-1">See plans</Button>
          <Button onClick={handleDismiss} variant="outline" className="flex-1">Not now</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/PaywallNudge.test.js`
Expected: PASS

- [ ] **Step 5: Wire incrementSessionDayCount into session_start**

Find where `EVENT.SESSION_START` is dispatched (likely in `WalletProvider.jsx` or the app init path). Add:

```js
import { incrementSessionDayCount } from '@/components/PaywallNudge';
```

Call `incrementSessionDayCount()` immediately after `trackEvent(EVENT.SESSION_START)`.

- [ ] **Step 6: Mount PaywallNudge in Layout.jsx**

In `src/components/Layout.jsx`, add:

```js
import PaywallNudge from '@/components/PaywallNudge';
```

Mount `<PaywallNudge />` alongside `<NotificationToast />` (around line 351):

```jsx
<NotificationToast />
<PaywallNudge />
```

- [ ] **Step 7: Verify in browser**

To test: set `veyrnox-session-day-count` to `3` in localStorage, reload. The modal should appear, be dismissable, and not reappear on next reload.

- [ ] **Step 8: Commit**

```bash
git add src/components/PaywallNudge.jsx src/components/__tests__/PaywallNudge.test.js src/components/Layout.jsx
git commit -m "feat(paywall): day-3 soft paywall nudge with analytics

Non-blocking modal after 3+ session days for free-tier users. Fires
paywall_shown/dismissed/converted events. I3: suppressed in deniability."
```

---

### Task 7: Post-backup Safety Plus nudge

**Files:**
- Create: `src/components/BackupPaywallNudge.jsx`
- Modify: `src/pages/WalletSeedQR.jsx` (add nudge after backup confirmation)
- Test: `src/components/__tests__/BackupPaywallNudge.test.js`

**Interfaces:**
- Consumes: `trackEvent(EVENT.PAYWALL_SHOWN/DISMISSED, metadata)` from Task 1, `isDeniabilityOrDemoActive()`, `useTier()`
- Produces: `<BackupPaywallNudge />` — inline card shown after backup confirmation, linking to plans

- [ ] **Step 1: Write the failing test**

```js
// src/components/__tests__/BackupPaywallNudge.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

import { shouldShowBackupNudge } from '@/components/BackupPaywallNudge';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

const KEY = 'veyrnox-backup-nudge-dismissed';

describe('shouldShowBackupNudge', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

  it('returns true for free tier', () => {
    expect(shouldShowBackupNudge('free')).toBe(true);
  });

  it('returns false for subscribers', () => {
    expect(shouldShowBackupNudge('safety_plus')).toBe(false);
  });

  it('returns false after dismissal', () => {
    localStorage.setItem(KEY, '1');
    expect(shouldShowBackupNudge('free')).toBe(false);
  });

  it('returns false in deniability mode', () => {
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    expect(shouldShowBackupNudge('free')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/BackupPaywallNudge.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement BackupPaywallNudge**

```jsx
// src/components/BackupPaywallNudge.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { trackEvent, EVENT } from '@/api/trackEvent';

const KEY = 'veyrnox-backup-nudge-dismissed';

export function shouldShowBackupNudge(currentTier) {
  try {
    if (isDeniabilityOrDemoActive()) return false;
    if (currentTier === 'safety_plus') return false;
    return !localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export default function BackupPaywallNudge({ currentTier }) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(() => shouldShowBackupNudge(currentTier));

  if (!visible) return null;

  const handleDismiss = () => {
    try { localStorage.setItem(KEY, '1'); } catch {}
    setVisible(false);
    void trackEvent(EVENT.PAYWALL_DISMISSED, { trigger: 'post_backup' }).catch(() => {});
  };

  const handleUpgrade = () => {
    void trackEvent(EVENT.PAYWALL_SHOWN, { trigger: 'post_backup' }).catch(() => {});
    navigate('/plans');
  };

  return (
    <div className="mt-4 p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">Protect this backup</p>
        </div>
        <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Your seed is backed up. Safety Plus adds hardware binding — so even if someone steals 
        this backup, they can&rsquo;t use it on another device.
      </p>
      <Button onClick={handleUpgrade} variant="outline" size="sm">
        Learn about Safety Plus
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/BackupPaywallNudge.test.js`
Expected: PASS

- [ ] **Step 5: Wire into WalletSeedQR.jsx**

In `src/pages/WalletSeedQR.jsx`, after the `setPrinted(true)` and `confirmWalletBackup()` call (around line 100), add the nudge to the rendered output. Import:

```js
import BackupPaywallNudge from '@/components/BackupPaywallNudge';
import { useTier } from '@/lib/entitlement';
```

Add `const { currentTier } = useTier();` in the component body, and render `<BackupPaywallNudge currentTier={currentTier} />` conditionally when `printed` is true, after the existing success content.

- [ ] **Step 6: Commit**

```bash
git add src/components/BackupPaywallNudge.jsx src/components/__tests__/BackupPaywallNudge.test.js src/pages/WalletSeedQR.jsx
git commit -m "feat(paywall): post-backup Safety Plus nudge

Inline card after seed backup showing hardware binding value prop.
Fires paywall events. I3: suppressed in deniability/demo."
```

---

### Task 8: Tier progress indicator enhancement

**Files:**
- Modify: `src/pages/ReferralTracker.jsx:62-120` (the `ProgressBar` component)

**Interfaces:**
- Consumes: `getTierInfo(count)` from `src/lib/referral.js` (already used)
- Produces: enhanced progress bar with "X more to unlock Y tier" messaging

The `ProgressBar` component already exists with full ARIA semantics (lines 62-120). The enhancement is to add a motivational "X more referrals to next tier" line.

- [ ] **Step 1: Update ProgressBar to show remaining count**

In `src/pages/ReferralTracker.jsx`, in the `ProgressBar` component, replace the bottom `<div>` (lines 114-117):

```jsx
<div className="flex justify-between text-[10px] text-muted-foreground">
  <span>{paidCount.toLocaleString()} paid subscribers</span>
  {info.next ? (
    <span className="font-medium text-primary">
      {(info.next.min - paidCount).toLocaleString()} more to {info.next.label} ({info.next.commission}%)
    </span>
  ) : (
    <span>Maximum tier reached</span>
  )}
</div>
```

This replaces the plain "X for Y" text with an action-oriented "X more to Y" that shows the commission rate — making the goal concrete and the reward visible.

- [ ] **Step 2: Verify in browser**

Navigate to `/referrals`. The progress bar should show "100 more to Silver (5%)" for a new user with 0 paid subscribers.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ReferralTracker.jsx
git commit -m "feat(referral): motivational tier progress messaging

Shows 'X more to [Tier] (Y%)' instead of plain count target."
```

---

## File summary

| Action | File | Task |
|--------|------|------|
| Modify | `src/api/trackEvent.js` | 1 |
| Create | `src/api/__tests__/trackEvent.test.js` | 1 |
| Modify | `src/pages/ReferralTracker.jsx` | 2, 3, 8 |
| Create | `src/lib/referralAttribution.js` | 4 |
| Create | `src/lib/__tests__/referralAttribution.test.js` | 4 |
| Modify | `src/App.jsx` | 4 |
| Create | `src/components/ReferralPrompt.jsx` | 5 |
| Create | `src/components/__tests__/ReferralPrompt.test.js` | 5 |
| Modify | `src/pages/SendCrypto.jsx` | 5 |
| Create | `src/components/PaywallNudge.jsx` | 6 |
| Create | `src/components/__tests__/PaywallNudge.test.js` | 6 |
| Modify | `src/components/Layout.jsx` | 6 |
| Create | `src/components/BackupPaywallNudge.jsx` | 7 |
| Create | `src/components/__tests__/BackupPaywallNudge.test.js` | 7 |
| Modify | `src/pages/WalletSeedQR.jsx` | 7 |

## Follow-up plan (not in scope)

These items from the growth spec need backend (Supabase) work and are a separate plan:

- Founding Referrer tier override (`is_founding_referrer` flag, Gold override)
- `get_referral_leaderboard` RPC + leaderboard UI
- Fraud prevention (velocity limit, device fingerprint cross-check, clawback)
- First-referral bonus (RevenueCat credit on first paid referral)
- Pending referral auto-apply at paywall (consuming `getPendingReferral()` during purchase)
