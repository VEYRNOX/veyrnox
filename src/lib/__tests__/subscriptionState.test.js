import { describe, it, expect, vi, beforeEach } from 'vitest';

const getCustomerInfo = vi.fn();
vi.mock('../purchases', () => ({
  SAFETY_PLUS_ENTITLEMENT: 'safety_plus',
  AI_SECURITY_PROTECTION_ENTITLEMENT: 'ai_security_protection',
  getCustomerInfo: (...a) => getCustomerInfo(...a),
}));
let deniable = false;
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => deniable,
}));

const {
  describeSubscription, deriveSubscriptionView, readLastPaid, writeLastPaid,
  resolveSubscriptionDetail, LAST_PAID_KEY, SUBSCRIPTION_STATUS: S,
} = await import('../subscriptionState');

const ent = (over = {}) => ({ isActive: true, willRenew: true, expirationDate: '2027-03-01T00:00:00Z', billingIssueDetectedAt: null, ...over });
const info = (active) => ({ entitlements: { active } });

beforeEach(() => {
  vi.clearAllMocks();
  deniable = false;
  localStorage.clear();
});

describe('describeSubscription', () => {
  it('active, cancelled (willRenew=false) and billing retry are distinguished', () => {
    expect(describeSubscription(info({ safety_plus: ent() })).status).toBe(S.ACTIVE);
    expect(describeSubscription(info({ safety_plus: ent({ willRenew: false }) })).status).toBe(S.CANCELLED);
    expect(describeSubscription(info({ safety_plus: ent({ billingIssueDetectedAt: '2027-02-01T00:00:00Z' }) })).status).toBe(S.BILLING_RETRY);
  });

  it('billing issue wins over willRenew=false', () => {
    const d = describeSubscription(info({ safety_plus: ent({ willRenew: false, billingIssueDetectedAt: 'x' }) }));
    expect(d.status).toBe(S.BILLING_RETRY);
  });

  it('carries the parsed expiry and null for a missing/garbage one', () => {
    expect(describeSubscription(info({ safety_plus: ent() })).expiresAt).toBe(Date.parse('2027-03-01T00:00:00Z'));
    expect(describeSubscription(info({ safety_plus: ent({ expirationDate: null }) })).expiresAt).toBeNull();
    expect(describeSubscription(info({ safety_plus: ent({ expirationDate: 'nope' }) })).expiresAt).toBeNull();
  });

  it('AI Security Protection wins when both are active, same as resolveTier', () => {
    const d = describeSubscription(info({ safety_plus: ent(), ai_security_protection: ent() }));
    expect(d.tier).toBe('ai_security_protection');
  });

  it('returns null for nothing active, inactive entitlements and malformed shapes', () => {
    expect(describeSubscription(info({}))).toBeNull();
    expect(describeSubscription(info({ safety_plus: ent({ isActive: false }) }))).toBeNull();
    expect(describeSubscription(undefined)).toBeNull();
    expect(describeSubscription({ entitlements: {} })).toBeNull();
  });

  it('ignores a prototype-polluted entitlement (own-property check)', () => {
    expect(describeSubscription(info(Object.create({ safety_plus: ent() })))).toBeNull();
  });
});

describe('deriveSubscriptionView / last-paid record', () => {
  it('nothing active + a record = expired; nothing active + no record = none', () => {
    const last = { tier: 'safety_plus', expiresAt: 5 };
    expect(deriveSubscriptionView(null, last)).toMatchObject({ status: S.EXPIRED, expiresAt: 5, lastTier: 'safety_plus' });
    expect(deriveSubscriptionView(null, null).status).toBe(S.NONE);
  });

  it('round-trips, and rejects a tampered record', () => {
    writeLastPaid({ tier: 'ai_security_protection', expiresAt: 9 });
    expect(readLastPaid()).toEqual({ tier: 'ai_security_protection', expiresAt: 9 });
    localStorage.setItem(LAST_PAID_KEY, JSON.stringify({ tier: 'root', expiresAt: 1 }));
    expect(readLastPaid()).toBeNull();
    localStorage.setItem(LAST_PAID_KEY, '{not json');
    expect(readLastPaid()).toBeNull();
  });

  it('I3: never writes the record in a deniability/demo session', () => {
    deniable = true;
    writeLastPaid({ tier: 'safety_plus', expiresAt: 1 });
    expect(localStorage.getItem(LAST_PAID_KEY)).toBeNull();
  });
});

describe('resolveSubscriptionDetail', () => {
  it('store unreachable is reported as unreachable, never as expired', async () => {
    getCustomerInfo.mockRejectedValue(new Error('offline'));
    expect(await resolveSubscriptionDetail()).toEqual({ reachable: false, detail: null });
  });

  it('I3: makes no customer-info call in a deniability/demo session', async () => {
    deniable = true;
    expect((await resolveSubscriptionDetail()).reachable).toBe(false);
    expect(getCustomerInfo).not.toHaveBeenCalled();
  });

  it('reachable with an active entitlement returns its detail', async () => {
    getCustomerInfo.mockResolvedValue(info({ safety_plus: ent({ willRenew: false }) }));
    const r = await resolveSubscriptionDetail();
    expect(r.reachable).toBe(true);
    expect(r.detail.status).toBe(S.CANCELLED);
  });
});
