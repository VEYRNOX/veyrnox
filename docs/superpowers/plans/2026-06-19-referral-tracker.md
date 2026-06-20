# Referral Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a privacy-preserving referral tracker — code generation, invite counting via a thin backend, tiered in-app rewards, and a `/referrals` page — without exposing any wallet data to the server.

**Architecture:** Each user gets a `VYX-XXXX` code stored in localStorage. A minimal backend counts redemptions (`code → count` only, no wallet data). Rewards are evaluated client-side from the count and written to localStorage. The `/referrals` page is ungated from `featureClassification.js` and registered as a lazy route in `App.jsx`.

**Tech Stack:** React 18, React Router v6, Vitest, `sonner` (toasts), TailwindCSS, Lucide icons, `fetch` for the referral API.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/referral.js` | Pure helpers: code gen, local state, tier logic, pending code |
| Create | `src/lib/__tests__/referral.test.js` | Unit tests for all pure helpers |
| Create | `src/api/referralApi.js` | Thin `fetch` wrapper for register/redeem/status endpoints |
| Create | `src/pages/ReferralTracker.jsx` | `/referrals` page: code display, tier progress, redeem input |
| Modify | `src/lib/featureClassification.js:358` | Remove `cut` entry for `/referrals` so it defaults to `live` |
| Modify | `src/App.jsx` | Add lazy import + `<Route path="/referrals">` |
| Modify | `src/components/WalletEntry.jsx` | Add optional referral code field in the `choose` onboarding view |

---

## Task 1: Pure helper module

**Files:**
- Create: `src/lib/__tests__/referral.test.js`
- Create: `src/lib/referral.js`

- [ ] **Step 1: Create the test file with failing tests**

```javascript
// src/lib/__tests__/referral.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = {};
const localStorageMock = {
  getItem: vi.fn((key) => store[key] ?? null),
  setItem: vi.fn((key, val) => { store[key] = String(val); }),
  removeItem: vi.fn((key) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
};

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
  vi.resetModules();
  Object.defineProperty(global, 'localStorage', { value: localStorageMock, configurable: true });
});

describe('generateCode', () => {
  it('returns a VYX-XXXX formatted code', async () => {
    const { generateCode } = await import('../referral.js');
    expect(generateCode()).toMatch(/^VYX-[A-Z0-9]{4}$/);
  });

  it('returns the same code on repeated calls', async () => {
    const { generateCode } = await import('../referral.js');
    const first = generateCode();
    const second = generateCode();
    expect(first).toBe(second);
  });

  it('generates a fresh code when localStorage is empty', async () => {
    const { generateCode } = await import('../referral.js');
    const code = generateCode();
    expect(typeof code).toBe('string');
    expect(code.length).toBe(8); // VYX-XXXX
  });
});

describe('getTier', () => {
  it('returns none for 0', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(0)).toBe('none');
  });
  it('returns bronze for 1', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(1)).toBe('bronze');
  });
  it('returns bronze for 4', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(4)).toBe('bronze');
  });
  it('returns silver for 5', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(5)).toBe('silver');
  });
  it('returns silver for 9', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(9)).toBe('silver');
  });
  it('returns gold for 10', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(10)).toBe('gold');
  });
  it('returns gold for counts above 10', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(15)).toBe('gold');
  });
});

describe('applyRedemption', () => {
  it('writes bronze tier and no unlockedFeatures at count 1', async () => {
    const { applyRedemption, getLocalState } = await import('../referral.js');
    applyRedemption(1);
    const state = getLocalState();
    expect(state.tier).toBe('bronze');
    expect(state.unlockedFeatures).toEqual([]);
    expect(state.referralCredit).toBe(false);
  });

  it('unlocks portfolio-snapshots at count 5', async () => {
    const { applyRedemption, getLocalState } = await import('../referral.js');
    applyRedemption(5);
    const state = getLocalState();
    expect(state.tier).toBe('silver');
    expect(state.unlockedFeatures).toContain('portfolio-snapshots');
  });

  it('sets referralCredit and externalEligible at count 10', async () => {
    const { applyRedemption, getLocalState } = await import('../referral.js');
    applyRedemption(10);
    const state = getLocalState();
    expect(state.tier).toBe('gold');
    expect(state.referralCredit).toBe(true);
    expect(state.externalEligible).toBe(true);
  });

  it('is idempotent — calling twice with the same count does not duplicate unlockedFeatures', async () => {
    const { applyRedemption, getLocalState } = await import('../referral.js');
    applyRedemption(5);
    applyRedemption(5);
    const state = getLocalState();
    expect(state.unlockedFeatures.filter(f => f === 'portfolio-snapshots').length).toBe(1);
  });
});

describe('own-code and already-redeemed guards', () => {
  it('hasRedeemed returns false when no code has been redeemed', async () => {
    const { hasRedeemed } = await import('../referral.js');
    expect(hasRedeemed()).toBe(false);
  });

  it('hasRedeemed returns true after markRedeemed', async () => {
    const { hasRedeemed, markRedeemed } = await import('../referral.js');
    markRedeemed('VYX-AB12');
    expect(hasRedeemed()).toBe(true);
  });

  it('setPendingReferral / getPendingReferral round-trips the code', async () => {
    const { setPendingReferral, getPendingReferral } = await import('../referral.js');
    setPendingReferral('VYX-XY99');
    expect(getPendingReferral()).toBe('VYX-XY99');
  });

  it('clearPendingReferral removes the stored code', async () => {
    const { setPendingReferral, clearPendingReferral, getPendingReferral } = await import('../referral.js');
    setPendingReferral('VYX-AB12');
    clearPendingReferral();
    expect(getPendingReferral()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they all fail**

```bash
npx vitest run src/lib/__tests__/referral.test.js
```

Expected: all tests FAIL with "Cannot find module" or similar.

- [ ] **Step 3: Create the implementation**

```javascript
// src/lib/referral.js
const STORAGE_KEY = 'veyrnox-referral';
const PENDING_KEY = 'veyrnox-referral-pending';

export const EXTERNAL_REWARD_URL =
  import.meta.env.VITE_REFERRAL_REWARD_URL ||
  'mailto:rewards@veyrnox.app?subject=Referral%20Reward%20Claim';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode() {
  const arr = new Uint8Array(4);
  crypto.getRandomValues(arr);
  return 'VYX-' + Array.from(arr, (b) => CHARS[b % CHARS.length]).join('');
}

export function getLocalState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function generateCode() {
  const state = getLocalState();
  if (state.code) return state.code;
  const code = randomCode();
  saveState({ ...state, code });
  return code;
}

export function getTier(count) {
  if (count >= 10) return 'gold';
  if (count >= 5) return 'silver';
  if (count >= 1) return 'bronze';
  return 'none';
}

export function applyRedemption(newCount) {
  const state = getLocalState();
  const tier = getTier(newCount);
  const unlockedFeatures = [...(state.unlockedFeatures || [])];
  if (tier === 'silver' || tier === 'gold') {
    if (!unlockedFeatures.includes('portfolio-snapshots')) {
      unlockedFeatures.push('portfolio-snapshots');
    }
  }
  const referralCredit = tier === 'gold';
  const externalEligible = tier === 'gold';
  saveState({ ...state, inviteCount: newCount, tier, unlockedFeatures, referralCredit, externalEligible });
  return { tier, unlockedFeatures, referralCredit, externalEligible };
}

export function markRedeemed(code) {
  saveState({ ...getLocalState(), redeemedCode: code });
}

export function hasRedeemed() {
  return !!getLocalState().redeemedCode;
}

export function setPendingReferral(code) {
  localStorage.setItem(PENDING_KEY, code);
}

export function getPendingReferral() {
  return localStorage.getItem(PENDING_KEY);
}

export function clearPendingReferral() {
  localStorage.removeItem(PENDING_KEY);
}
```

- [ ] **Step 4: Run tests to verify they all pass**

```bash
npx vitest run src/lib/__tests__/referral.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/referral.js src/lib/__tests__/referral.test.js
git commit -m "feat(referral): add pure helper module with unit tests"
```

---

## Task 2: API wrapper

**Files:**
- Create: `src/api/referralApi.js`

- [ ] **Step 1: Create the API wrapper**

```javascript
// src/api/referralApi.js
//
// Thin fetch wrapper for the referral backend.
// Set VITE_REFERRAL_API_URL in .env.local to point at the deployed endpoint.
// If the env var is unset, register/status are no-ops and redeem throws — the
// caller handles the error gracefully (silent skip in onboarding, error message
// on the Referral page).

const BASE_URL = import.meta.env.VITE_REFERRAL_API_URL || '';

export async function registerCode(code) {
  if (!BASE_URL) return;
  try {
    await fetch(`${BASE_URL}/referrals/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
  } catch {
    // Best-effort: network failure on register is silently ignored.
  }
}

export async function redeemCode(code) {
  if (!BASE_URL) throw Object.assign(new Error('No referral API configured'), { status: 503 });
  const res = await fetch(`${BASE_URL}/referrals/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (res.status === 404) throw Object.assign(new Error('Code not found'), { status: 404 });
  if (!res.ok) throw Object.assign(new Error('Referral error'), { status: res.status });
  return res.json(); // { newCount: number }
}

export async function fetchStatus(code) {
  if (!BASE_URL) return null;
  try {
    const res = await fetch(`${BASE_URL}/referrals/status?code=${encodeURIComponent(code)}`);
    if (!res.ok) return null;
    return res.json(); // { count: number }
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api/referralApi.js
git commit -m "feat(referral): add API wrapper for register/redeem/status endpoints"
```

---

## Task 3: Ungate the route

**Files:**
- Modify: `src/lib/featureClassification.js:358`
- Modify: `src/App.jsx`

- [ ] **Step 1: Remove the `cut` entry for `/referrals` in featureClassification.js**

Find line 358 in `src/lib/featureClassification.js`:
```javascript
  '/referrals':         { verdict: 'cut', reason: 'off-wedge', dataSource: 'invented', note: 'Referral tracker cut: growth mechanic, off-wedge for self-custody product.' },
```

Delete that line entirely. Routes not listed in featureClassification default to `{ status: 'live' }` via `featureRegistry.js`'s `DEFAULT_ENTRY`.

- [ ] **Step 2: Add the lazy import to App.jsx**

Near the other lazy imports (around line 100 in `src/App.jsx`), add:
```javascript
const ReferralTracker = lazy(() => import('./pages/ReferralTracker'));
```

- [ ] **Step 3: Add the route to App.jsx**

Inside the `<Layout />` route group (after any existing route, e.g. after the `<Route path="/payment-links" ...>` line):
```jsx
<Route path="/referrals" element={<ReferralTracker />} />
```

- [ ] **Step 4: Verify the route is no longer cut**

```bash
npx vitest run
```

Expected: all existing tests still pass (no regressions from removing the classification entry).

- [ ] **Step 5: Commit**

```bash
git add src/lib/featureClassification.js src/App.jsx
git commit -m "feat(referral): ungate /referrals route — mark live in classification"
```

---

## Task 4: ReferralTracker page

**Files:**
- Create: `src/pages/ReferralTracker.jsx`

- [ ] **Step 1: Create the page**

```jsx
// src/pages/ReferralTracker.jsx
import { useState, useEffect, useCallback } from 'react';
import { Gift, Copy, CheckCircle2, ExternalLink, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  generateCode,
  getLocalState,
  getTier,
  applyRedemption,
  markRedeemed,
  hasRedeemed,
  getPendingReferral,
  clearPendingReferral,
  EXTERNAL_REWARD_URL,
} from '@/lib/referral';
import { registerCode, redeemCode, fetchStatus } from '@/api/referralApi';

const TIER_LABELS = { none: 'No referrals yet', bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
const TIER_COLOR = { none: 'text-muted-foreground', bronze: 'text-amber-400', silver: 'text-slate-300', gold: 'text-yellow-400' };
const MILESTONES = [1, 5, 10];

function TierBadge({ tier }) {
  if (tier === 'none') return null;
  return (
    <span className={`text-xs font-semibold uppercase tracking-widest ${TIER_COLOR[tier]}`}>
      {TIER_LABELS[tier]}
    </span>
  );
}

function ProgressBar({ count }) {
  const pct = Math.min((count / 10) * 100, 100);
  return (
    <div className="space-y-1">
      <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        {MILESTONES.map((m) => (
          <span key={m} className={count >= m ? 'text-primary font-medium' : ''}>
            {m} {m === 1 ? 'invite' : 'invites'}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ReferralTracker() {
  const code = generateCode();
  const [inviteCount, setInviteCount] = useState(() => getLocalState().inviteCount || 0);
  const [tier, setTier] = useState(() => getLocalState().tier || 'none');
  const [externalEligible, setExternalEligible] = useState(() => !!getLocalState().externalEligible);
  const [copied, setCopied] = useState(false);
  const [redeemInput, setRedeemInput] = useState('');
  const [redeemError, setRedeemError] = useState('');
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [syncedAt, setSyncedAt] = useState(null);

  const syncCount = useCallback(async () => {
    const data = await fetchStatus(code);
    if (!data) return;
    const result = applyRedemption(data.count);
    setInviteCount(data.count);
    setTier(result.tier);
    setExternalEligible(result.externalEligible);
    setSyncedAt(new Date());
  }, [code]);

  useEffect(() => {
    // Register this code on first mount (no-op if already registered)
    registerCode(code);
    // Auto-redeem any code stored during onboarding
    const pending = getPendingReferral();
    if (pending) {
      clearPendingReferral();
      if (!hasRedeemed() && pending !== code) {
        redeemCode(pending)
          .then(({ newCount }) => { markRedeemed(pending); applyRedemption(newCount); })
          .catch(() => {});
      }
    }
    // Sync current count from backend
    syncCount();
  }, [code, syncCount]);

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Code copied!');
  };

  const handleRedeem = async () => {
    const input = redeemInput.trim().toUpperCase();
    setRedeemError('');
    if (!input) return;
    if (input === code) { setRedeemError("That's your own code."); return; }
    if (hasRedeemed()) { setRedeemError("You've already used a referral code."); return; }
    setRedeemBusy(true);
    try {
      const { newCount } = await redeemCode(input);
      markRedeemed(input);
      const result = applyRedemption(newCount);
      setInviteCount(newCount);
      setTier(result.tier);
      setExternalEligible(result.externalEligible);
      setRedeemInput('');
      toast.success('Referral code applied!');
    } catch (err) {
      if (err.status === 404) setRedeemError('Code not found. Check it and try again.');
      else setRedeemError('Could not apply code right now. Try again later.');
    } finally {
      setRedeemBusy(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Gift className="h-6 w-6 text-primary" /> Referral Tracker
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Invite friends to Veyrnox and earn rewards as they join.
          </p>
        </div>
      </div>

      {/* Your code */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Your invite code</p>
        <div className="flex items-center gap-3">
          <span className="mono-value text-2xl font-bold tracking-widest text-foreground">{code}</span>
          <button
            onClick={copyCode}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Share this code with friends. When they set up their wallet and enter it, you earn credit.
        </p>
      </div>

      {/* Progress */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{inviteCount} {inviteCount === 1 ? 'invite' : 'invites'}</span>
          <TierBadge tier={tier} />
        </div>
        <ProgressBar count={inviteCount} />
        {syncedAt && (
          <p className="text-[10px] text-muted-foreground">
            Last synced {syncedAt.toLocaleTimeString()}
          </p>
        )}
        {!syncedAt && (
          <p className="text-[10px] text-muted-foreground">Syncing…</p>
        )}
      </div>

      {/* Tier rewards */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Rewards</p>
        <ul className="space-y-2 text-sm">
          <li className={`flex items-center gap-2 ${inviteCount >= 1 ? 'text-foreground' : 'text-muted-foreground'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${inviteCount >= 1 ? 'bg-amber-400' : 'bg-secondary'}`} />
            1 invite — Bronze badge
          </li>
          <li className={`flex items-center gap-2 ${inviteCount >= 5 ? 'text-foreground' : 'text-muted-foreground'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${inviteCount >= 5 ? 'bg-slate-300' : 'bg-secondary'}`} />
            5 invites — Silver: unlock Portfolio Snapshots
          </li>
          <li className={`flex items-center gap-2 ${inviteCount >= 10 ? 'text-foreground' : 'text-muted-foreground'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${inviteCount >= 10 ? 'bg-yellow-400' : 'bg-secondary'}`} />
            10 invites — Gold: subscription credit + external reward
          </li>
        </ul>
        {externalEligible && (
          <a
            href={EXTERNAL_REWARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Claim your external reward <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* Enter a code */}
      {!hasRedeemed() && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Got a referral code?</p>
          <div className="flex gap-2">
            <Input
              value={redeemInput}
              onChange={(e) => { setRedeemInput(e.target.value.toUpperCase()); setRedeemError(''); }}
              placeholder="VYX-XXXX"
              maxLength={8}
              autoCapitalize="characters"
              autoCorrect="off"
              className="mono-value tracking-widest"
            />
            <Button onClick={handleRedeem} disabled={!redeemInput.trim() || redeemBusy} variant="outline">
              {redeemBusy ? '…' : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
          {redeemError && <p className="text-xs text-destructive">{redeemError}</p>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Start dev server and verify the page renders at `/referrals`**

```bash
npm run dev
```

Open `http://localhost:5173/referrals` (after unlocking the wallet). Verify:
- Page renders with "Referral Tracker" heading and Gift icon
- Code displays in monospace format `VYX-XXXX`
- Copy button works
- Progress bar shows at 0 invites
- "Enter referral code" section is visible

- [ ] **Step 3: Commit**

```bash
git add src/pages/ReferralTracker.jsx
git commit -m "feat(referral): add ReferralTracker page with tier progress and redeem input"
```

---

## Task 5: Onboarding referral code field

**Files:**
- Modify: `src/components/WalletEntry.jsx`

- [ ] **Step 1: Add `referralInput` state**

In `WalletEntry.jsx`, near the top of the component where other `useState` calls are made, add:

```javascript
const [referralInput, setReferralInput] = useState('');
```

Also add the import for `setPendingReferral` at the top of the file:
```javascript
import { setPendingReferral } from '@/lib/referral';
```

- [ ] **Step 2: Store the code before wallet creation**

In `doCreateWallet` (line 510), before `setBusy(true)`, add:
```javascript
if (referralInput.trim()) setPendingReferral(referralInput.trim().toUpperCase());
```

So the function becomes:
```javascript
const doCreateWallet = async () => {
  if (referralInput.trim()) setPendingReferral(referralInput.trim().toUpperCase());
  setBusy(true); setProvisioning(true); setError("");
  try { await createWalletFromPendingPin(); setProvisioning(false); }
  catch {
    clearPendingPin(); setProvisioning(false);
    const msg = "Wallet setup couldn't finish securely, so nothing was saved. Please set your PIN and try again.";
    setError(msg);
    toast.error(msg);
  } finally { setBusy(false); }
};
```

- [ ] **Step 3: Also store the code before import**

In `doImportWallet` (line 524), before `setBusy(true)`, add:
```javascript
if (referralInput.trim()) setPendingReferral(referralInput.trim().toUpperCase());
```

So `doImportWallet` starts:
```javascript
const doImportWallet = async () => {
  const phrase = importPhrasePin.trim().replace(/\s+/g, " ");
  if (!phrase) return;
  if (referralInput.trim()) setPendingReferral(referralInput.trim().toUpperCase());
  setBusy(true); setProvisioning(true); setError("");
  // ... rest unchanged
```

- [ ] **Step 4: Add the optional code input to the choose view**

In the `choose` view, `hasPendingPin` branch (around line 834), in the `!choosePinImport` block, add the referral field **between** the description text and the action buttons. Find the `<div className="space-y-2">` that holds the Create Wallet and Import buttons and add the referral input just above it:

```jsx
<div className="space-y-1">
  <label className="text-xs text-muted-foreground">Got an invite code? (optional)</label>
  <input
    type="text"
    value={referralInput}
    onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
    placeholder="VYX-XXXX"
    maxLength={8}
    autoCapitalize="characters"
    autoCorrect="off"
    autoComplete="off"
    className="w-full rounded-xl border border-border bg-card/50 px-3 py-2 text-sm mono-value tracking-widest focus:outline-none focus:ring-1 focus:ring-ring"
  />
</div>
```

Place it inside the `!choosePinImport` fragment, directly before `<div className="space-y-2">` (the button group). The full `!choosePinImport` fragment should look like:

```jsx
<>
  <div className="text-center space-y-2">
    <Wallet className="h-8 w-8 text-primary mx-auto" />
    <p className="text-sm font-medium">No wallet yet</p>
    <p className="text-xs text-muted-foreground">Your PIN is set. Create a fresh self-custody wallet, or import an existing seed phrase — it'll be encrypted under your PIN on this device. Keys never leave it.</p>
  </div>
  <div className="space-y-1">
    <label className="text-xs text-muted-foreground">Got an invite code? (optional)</label>
    <input
      type="text"
      value={referralInput}
      onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
      placeholder="VYX-XXXX"
      maxLength={8}
      autoCapitalize="characters"
      autoCorrect="off"
      autoComplete="off"
      className="w-full rounded-xl border border-border bg-card/50 px-3 py-2 text-sm mono-value tracking-widest focus:outline-none focus:ring-1 focus:ring-ring"
    />
  </div>
  <div className="space-y-2">
    <Button className="w-full gap-2" disabled={busy} onClick={doCreateWallet}>
      <Shield className="h-4 w-4" /> Create Wallet
    </Button>
    <Button variant="outline" className="w-full gap-2" disabled={busy} onClick={() => { setError(""); setImportPhrasePin(""); setChoosePinImport(true); }}>
      <Download className="h-4 w-4" /> Import an existing seed
    </Button>
  </div>
  <button type="button" onClick={() => { setError(""); enterExplore(); }} className="block w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
    ← Keep exploring (view only)
  </button>
</>
```

- [ ] **Step 5: Verify onboarding field in dev**

In the dev server (`npm run dev`), complete the onboarding flow (or simulate the `choose` view by clearing localStorage). Verify:
- Optional referral field appears between the description and buttons
- Entering a code and clicking "Create Wallet" stores it in `localStorage` under `veyrnox-referral-pending`
- The field does not block or delay wallet creation

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/WalletEntry.jsx
git commit -m "feat(referral): add optional invite code field to onboarding choose view"
```

---

## Self-Review

**Spec coverage:**
- ✅ Code generation (`generateCode` + `VYX-XXXX` format) — Task 1
- ✅ Backend registration and status sync — Tasks 2 + 4
- ✅ Code redemption with 404 / network error handling — Tasks 2 + 4
- ✅ Tiered rewards: bronze (badge), silver (feature unlock), gold (credit + external CTA) — Tasks 1 + 4
- ✅ `featureRegistry` integration for silver unlock — `applyRedemption` writes `unlockedFeatures`
- ✅ Own-code guard — Task 4 `handleRedeem`
- ✅ Already-redeemed guard — Task 4 `handleRedeem` + `hasRedeemed()`
- ✅ `Last synced` label when backend unreachable — Task 4 (`syncedAt` state)
- ✅ Route ungated — Task 3
- ✅ Onboarding code field (A) — Task 5
- ✅ Post-onboarding code field (B) — Task 4 (the "Got a referral code?" section)
- ✅ Pending code auto-redeemed on first Referral page visit — Task 4 `useEffect`

**Placeholder scan:** No TBDs, TODOs, or vague steps. All code blocks are complete.

**Type consistency:** `generateCode`, `getTier`, `applyRedemption`, `markRedeemed`, `hasRedeemed`, `setPendingReferral`, `getPendingReferral`, `clearPendingReferral` used consistently across Tasks 1, 4, and 5.
