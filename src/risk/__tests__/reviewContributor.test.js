import { describe, expect, it } from 'vitest';

import { buildReviewContributor } from '@/risk/reviewContributor.js';

const RECIPIENT = '0x1111111111111111111111111111111111111111';

describe('buildReviewContributor', () => {
  it('marks an allowlisted recipient as trusted', () => {
    const review = buildReviewContributor({
      recipient: RECIPIENT,
      currency: 'ETH',
      whitelist: [{ address: RECIPIENT, currency: 'ETH' }],
    });
    expect(review.level).toBe('OK');
    expect(review.summary).toMatch(/explicitly trusted/i);
    expect(review.evidence.kind).toBe('whitelist');
  });

  it('marks a saved or known counterparty as familiar', () => {
    const review = buildReviewContributor({
      recipient: RECIPIENT,
      currency: 'ETH',
      knownAddresses: [{ address: RECIPIENT, label: 'your saved contact "Alice"' }],
    });
    expect(review.level).toBe('OK');
    expect(review.summary).toMatch(/saved contact/i);
    expect(review.evidence.kind).toBe('known_counterparty');
  });

  it('flags a first-time recipient honestly', () => {
    const review = buildReviewContributor({
      recipient: RECIPIENT,
      currency: 'ETH',
      history: [],
      knownAddresses: [],
      whitelist: [],
      sessionMeta: { name: 'Some dApp', url: 'https://app.example.org' },
    });
    expect(review.level).toBe('INFO');
    expect(review.summary).toMatch(/first-time recipient/i);
    expect(review.summary).toMatch(/Some dApp/i);
  });
});
