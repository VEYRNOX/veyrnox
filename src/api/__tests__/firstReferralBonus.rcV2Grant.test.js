// src/api/__tests__/firstReferralBonus.rcV2Grant.test.js
//
// first-referral-bonus must grant through RevenueCat API v2.
//
// It called `POST /v1/subscribers/{id}/entitlements/{ent}/promotional` until
// 2026-09-20 and could never have succeeded: the secret we hold is a
// v2-generation `sk_` key and v1 rejects it with `403 code 7723`. Same root
// cause as the Advisor entitlement gate (VEYRNOX/veyrnox#2662). The audit
// table on production was empty, so no referrer was actually denied a bonus —
// timing, not a property of the code.
//
// Structural assertions, like tipEdge.entitlementLookup.test.js: this is Deno
// source that vitest cannot execute. Comment lines are stripped before
// matching ON PURPOSE — the fix documents the v1 call it replaced, so an
// unscoped absence check would match its own explanation and fail on correct
// code.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(
  resolve(process.cwd(), 'supabase/functions/first-referral-bonus/index.ts'),
  'utf8',
);

const CODE = SOURCE.split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

describe('first-referral-bonus RevenueCat grant', () => {
  it('grants via the v2 grant_entitlement action', () => {
    expect(CODE).toContain('https://api.revenuecat.com/v2');
    expect(CODE).toContain('/actions/grant_entitlement');
  });

  it('does not call the v1 subscribers endpoint in executable code', () => {
    expect(CODE).not.toContain('api.revenuecat.com/v1');
    expect(CODE).not.toContain('/promotional');
  });

  it('sends an absolute expires_at, not a v1 duration string', () => {
    // v2 takes ms-since-epoch; v1's `duration` is not accepted and the value
    // this file used ('P1M') was not even a valid v1 duration.
    expect(CODE).toContain('expires_at: bonusExpiresAt()');
    expect(CODE).not.toMatch(/duration:\s*BONUS_DURATION/);
  });

  it('fails closed when REVENUECAT_PROJECT_ID is unset', () => {
    // v2 needs the project id, which v1 did not. Absent config must deny
    // before a claim is held (I4).
    expect(CODE).toContain("Deno.env.get('REVENUECAT_PROJECT_ID')");
    expect(CODE).toMatch(/!rcProjectId\)\s*\{/);
  });

  it('holds rather than releases the claim when the entitlement id will not resolve', () => {
    // A resolution failure is config or outage, not a verdict about this
    // referrer — releasing would let a retry double-grant later.
    const guard = CODE.slice(CODE.indexOf('rcEntitlementApiId'));
    expect(guard).toMatch(/audit\('rc_5xx_held'/);
  });
});
