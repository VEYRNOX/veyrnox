import { describe, it, expect } from 'vitest';
import * as copy from '../subscriptionCopy';
import { SAFETY_PLUS_ROUTES, SAFETY_PLUS_PAGE_GATED_ROUTES } from '../safetyPlusRoutes';

const allStrings = () => {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (typeof v === 'function') out.push(v('1 January 2027'));
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(copy);
  return out;
};

describe('subscriptionCopy', () => {
  it('contains no hard-coded price or currency (store supplies prices)', () => {
    for (const s of allStrings()) expect(s).not.toMatch(/[$£€]\s?\d|\d+\.\d{2}\b/);
  });

  it('uses no fear-based language', () => {
    for (const s of allStrings()) expect(s).not.toMatch(/\b(warning|danger|lose|lost|lockout|urgent|last chance)\b/i);
  });

  it('every state message keeps wallet/assets accessible (except purely positive ones)', () => {
    for (const k of ['cancelled', 'billingRetry', 'expired']) {
      const s = typeof copy.STATE_COPY[k] === 'function' ? copy.STATE_COPY[k]('D') : copy.STATE_COPY[k];
      expect(s).toMatch(/wallet/i);
      expect(s).toMatch(/accessible/i);
    }
    expect(copy.STATE_COPY.cancelled('5 May 2027')).toContain('5 May 2027');
    expect(copy.CANCEL_FLOW.after('5 May 2027')).toContain('5 May 2027');
  });

  it('AI agent limits state the four hard limits', () => {
    expect(copy.AI_AGENT_LIMITS).toMatch(/private keys/);
    expect(copy.AI_AGENT_LIMITS).toMatch(/sign transactions/);
    expect(copy.AI_AGENT_LIMITS).toMatch(/move assets/);
    expect(copy.AI_AGENT_LIMITS).toMatch(/authorize every action/);
  });

  // The copy promises that cancellation leaves recovery management usable.
  // Pin the gating facts that make that promise true.
  it('recovery and Emergency PIN management routes are reachable on the Free tier', () => {
    for (const r of ['/personal-backup', '/duress-pin']) {
      expect(SAFETY_PLUS_ROUTES).not.toContain(r);
      expect(SAFETY_PLUS_PAGE_GATED_ROUTES).toContain(r);
    }
  });

  it('comparison never lists a capability as Free that the gates make paid', () => {
    const rows = Object.fromEntries(copy.COMPARISON_ROWS.map((r) => [r.capability, r]));
    expect(rows['Wallet access and asset movement'].free).toBe('included');
    expect(rows['Restoring from existing recovery material'].free).toBe('included');
    expect(rows['Creating Shamir Recovery Shares'].free).toBeNull();
    expect(rows['Creating an encrypted Personal Backup'].free).toBeNull();
    // additive tiers: anything on Safety Plus is on AI Security Protection
    for (const r of copy.COMPARISON_ROWS) {
      if (r.safety_plus) expect(r.ai_security_protection).toBeTruthy();
      if (r.free) expect(r.safety_plus).toBeTruthy();
    }
  });
});
