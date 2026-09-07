import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

// Stub the native plugin so triggerReviewPromptIfEligible() can resolve
// without a real Capacitor runtime; the module dynamic-imports it.
vi.mock('@capacitor-community/in-app-review', () => ({
  InAppReview: { requestReview: vi.fn(async () => {}) },
}));

const browserOpen = vi.fn(async () => {});
vi.mock('@capacitor/browser', () => ({
  Browser: { open: (...args) => browserOpen(...args) },
}));

import {
  recordSuccessfulSend,
  recordMilestone,
  shouldPromptForReview,
  markDeclined,
  triggerReviewPromptIfEligible,
  openStoreForRating,
  requestFeature,
  FEATURE_REQUEST_URL,
  FEEDBACK_EMAIL,
  MIN_SENDS_BEFORE_PROMPT,
  MIN_INTERVAL_MS,
} from '@/lib/reviewPrompt';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

const KEYS = [
  'veyrnox-review-send-count',
  'veyrnox-review-last-asked-ts',
  'veyrnox-review-declined',
];

beforeEach(() => {
  KEYS.forEach((k) => localStorage.removeItem(k));
  isDeniabilityOrDemoActive.mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('reviewPrompt.shouldPromptForReview', () => {
  it('is false before the send threshold', () => {
    for (let i = 0; i < MIN_SENDS_BEFORE_PROMPT - 1; i += 1) recordSuccessfulSend();
    expect(shouldPromptForReview()).toBe(false);
  });

  it('is true once the threshold is met', () => {
    for (let i = 0; i < MIN_SENDS_BEFORE_PROMPT; i += 1) recordSuccessfulSend();
    expect(shouldPromptForReview()).toBe(true);
  });

  it('is false after declining, forever', () => {
    for (let i = 0; i < MIN_SENDS_BEFORE_PROMPT; i += 1) recordSuccessfulSend();
    markDeclined();
    expect(shouldPromptForReview()).toBe(false);
  });

  it('is false inside the 90-day cooldown after being asked', async () => {
    for (let i = 0; i < MIN_SENDS_BEFORE_PROMPT; i += 1) recordSuccessfulSend();
    await triggerReviewPromptIfEligible();
    expect(shouldPromptForReview()).toBe(false);
  });

  it('becomes true again once the cooldown expires', async () => {
    for (let i = 0; i < MIN_SENDS_BEFORE_PROMPT; i += 1) recordSuccessfulSend();
    await triggerReviewPromptIfEligible();
    // Simulate 91 days later by rewriting the timestamp.
    const past = Date.now() - MIN_INTERVAL_MS - 1000;
    localStorage.setItem('veyrnox-review-last-asked-ts', String(past));
    expect(shouldPromptForReview()).toBe(true);
  });
});

describe('reviewPrompt I3 (deniability/demo)', () => {
  it('recordSuccessfulSend is a no-op under coercion', () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    recordSuccessfulSend();
    recordSuccessfulSend();
    recordSuccessfulSend();
    // Leave coercion, count must still be zero — a decoy session cannot
    // advance the real user's trigger.
    isDeniabilityOrDemoActive.mockReturnValue(false);
    expect(shouldPromptForReview()).toBe(false);
    expect(localStorage.getItem('veyrnox-review-send-count')).toBeNull();
  });

  it('shouldPromptForReview is false even with a real threshold met', () => {
    for (let i = 0; i < MIN_SENDS_BEFORE_PROMPT; i += 1) recordSuccessfulSend();
    isDeniabilityOrDemoActive.mockReturnValue(true);
    expect(shouldPromptForReview()).toBe(false);
  });

  it('markDeclined does not write under coercion', () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    markDeclined();
    expect(localStorage.getItem('veyrnox-review-declined')).toBeNull();
  });

  it('triggerReviewPromptIfEligible does nothing under coercion', async () => {
    for (let i = 0; i < MIN_SENDS_BEFORE_PROMPT; i += 1) recordSuccessfulSend();
    isDeniabilityOrDemoActive.mockReturnValue(true);
    const fired = await triggerReviewPromptIfEligible();
    expect(fired).toBe(false);
    expect(localStorage.getItem('veyrnox-review-last-asked-ts')).toBeNull();
  });
});

describe('reviewPrompt.requestFeature', () => {
  it('points at the Featurebase board', () => {
    expect(FEATURE_REQUEST_URL).toBe('https://veyrnox.featurebase.app');
  });

  it('opens the board via Capacitor Browser (no mailto when URL is set)', async () => {
    browserOpen.mockClear();
    await requestFeature();
    expect(browserOpen).toHaveBeenCalledWith({ url: FEATURE_REQUEST_URL });
  });

  it('is a no-op under coercion (no mailto navigation)', async () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    const spy = vi.spyOn(window, 'location', 'get').mockReturnValue({
      set href(_) { throw new Error('should not navigate under coercion'); },
    });
    await requestFeature();
    spy.mockRestore();
  });

  it('mailto fallback carries the triage template when Browser + window.open both fail', async () => {
    browserOpen.mockRejectedValueOnce(new Error('no browser plugin'));
    const origOpen = window.open;
    window.open = () => { throw new Error('blocked'); };
    let captured = null;
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { set href(v) { captured = v; } },
    });
    try {
      await requestFeature();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
      window.open = origOpen;
    }
    expect(captured).toContain(`mailto:${FEEDBACK_EMAIL}`);
    expect(captured).toContain('Veyrnox%20feature%20request');
    expect(captured).toContain('seed%20phrase');
  });
});

describe('reviewPrompt.recordMilestone', () => {
  it('is an alias of recordSuccessfulSend — three receives cross the threshold', () => {
    for (let i = 0; i < MIN_SENDS_BEFORE_PROMPT; i += 1) recordMilestone();
    expect(shouldPromptForReview()).toBe(true);
  });

  it('mixed send + receive milestones accumulate', () => {
    recordSuccessfulSend();
    recordMilestone();
    recordSuccessfulSend();
    expect(shouldPromptForReview()).toBe(true);
  });

  it('is a no-op under coercion (receive path)', () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    recordMilestone();
    recordMilestone();
    recordMilestone();
    isDeniabilityOrDemoActive.mockReturnValue(false);
    expect(shouldPromptForReview()).toBe(false);
  });
});

describe('reviewPrompt.openStoreForRating (manual)', () => {
  it('opens the store URL directly and does NOT call SKStoreReview', async () => {
    browserOpen.mockClear();
    const inApp = await import('@capacitor-community/in-app-review');
    inApp.InAppReview.requestReview.mockClear();
    await openStoreForRating();
    expect(browserOpen).toHaveBeenCalledTimes(1);
    const arg = browserOpen.mock.calls[0][0];
    // Web UA in vitest → falls through to WEB_URL; the point is that the
    // manual path opens SOMETHING visible instead of the silent native prompt.
    expect(arg.url).toMatch(/^https?:\/\//);
    expect(inApp.InAppReview.requestReview).not.toHaveBeenCalled();
  });

  it('is a no-op under coercion', async () => {
    browserOpen.mockClear();
    isDeniabilityOrDemoActive.mockReturnValue(true);
    await openStoreForRating();
    expect(browserOpen).not.toHaveBeenCalled();
  });
});

describe('reviewPrompt.triggerReviewPromptIfEligible', () => {
  it('marks asked-ts before calling the plugin (fire-and-forget safety)', async () => {
    for (let i = 0; i < MIN_SENDS_BEFORE_PROMPT; i += 1) recordSuccessfulSend();
    const fired = await triggerReviewPromptIfEligible();
    expect(fired).toBe(true);
    expect(Number(localStorage.getItem('veyrnox-review-last-asked-ts'))).toBeGreaterThan(0);
  });

  it('returns false when not eligible without touching the timestamp', async () => {
    const fired = await triggerReviewPromptIfEligible();
    expect(fired).toBe(false);
    expect(localStorage.getItem('veyrnox-review-last-asked-ts')).toBeNull();
  });
});
