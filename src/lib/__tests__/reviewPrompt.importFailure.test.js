import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => false,
}));

afterEach(() => {
  localStorage.clear();
  vi.doUnmock('@capacitor-community/in-app-review');
  vi.resetModules();
});

it('does not consume cooldown on import failure and releases the in-flight guard', async () => {
  vi.resetModules();
  localStorage.clear();
  vi.doMock('@capacitor-community/in-app-review', () => {
    throw new Error('plugin chunk unavailable');
  });
  const review = await import('@/lib/reviewPrompt');
  for (let i = 0; i < review.MIN_SENDS_BEFORE_PROMPT; i += 1) review.recordSuccessfulSend();
  expect(await review.triggerReviewPromptIfEligible()).toBe(false);
  expect(localStorage.getItem('veyrnox-review-last-asked-ts')).toBeNull();
  expect(review.shouldPromptForReview()).toBe(true);

  const requestReview = vi.fn(async () => {});
  vi.doMock('@capacitor-community/in-app-review', () => ({
    InAppReview: { requestReview },
  }));
  expect(await review.triggerReviewPromptIfEligible()).toBe(true);
  expect(requestReview).toHaveBeenCalledTimes(1);
});
