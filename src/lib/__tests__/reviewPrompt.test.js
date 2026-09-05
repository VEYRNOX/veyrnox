import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

// Stub the native plugin so triggerReviewPromptIfEligible() can resolve
// without a real Capacitor runtime; the module dynamic-imports it.
vi.mock('@capacitor-community/in-app-review', () => ({
  InAppReview: { requestReview: vi.fn(async () => {}) },
}));

import {
  recordSuccessfulSend,
  shouldPromptForReview,
  markDeclined,
  triggerReviewPromptIfEligible,
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
