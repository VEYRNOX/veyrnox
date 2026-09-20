// src/api/__tests__/tipEdge.entitlementLookup.test.js
//
// tip-chat's entitlement gate must query RevenueCat API v2, not v1.
//
// The v1 version of this lookup could never return true, for two independent
// reasons measured on 2026-09-20 against a live subscriber holding
// ai_security_protection (VEYRNOX/veyrnox#2662):
//
//   - the secret we hold is a v2-generation `sk_` key, and v1 answers
//     `403 code 7723 "secret API key incompatible with RevenueCat API V1"`;
//   - it read `subscriber.entitlements.active`, which does not exist on the v1
//     REST subscriber (that shape belongs to the SDK's CustomerInfo).
//
// Both deny silently, so the gate looked healthy while rejecting every paying
// subscriber. These assertions are structural, like tipEdge.chatRoute.test.js:
// the function is Deno source that vitest cannot execute.
//
// Comment lines are stripped before matching ON PURPOSE. The fix documents the
// v1 shape it replaced, so an unscoped "v1 is absent" assertion would match the
// explanation and fail on correct code.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(
  resolve(process.cwd(), 'supabase/functions/tip-chat/index.ts'),
  'utf8',
);

const CODE = SOURCE.split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

describe('tip-chat entitlement lookup', () => {
  it('calls the RevenueCat v2 active_entitlements endpoint', () => {
    expect(CODE).toContain('https://api.revenuecat.com/v2');
    expect(CODE).toContain('/active_entitlements');
  });

  it('does not call the v1 subscribers endpoint in executable code', () => {
    expect(CODE).not.toContain('api.revenuecat.com/v1');
  });

  it('does not read the SDK-only entitlements.active shape', () => {
    expect(CODE).not.toMatch(/entitlements\s*\)?\s*\.active\b/);
    expect(CODE).not.toContain(").active");
  });

  it('denies when the project id is unconfigured, rather than admitting', () => {
    // I4: the v2 lookup needs REVENUECAT_PROJECT_ID, which v1 did not. An
    // unset secret must fail closed — the `return false` guard is what makes a
    // half-configured environment reject instead of bypassing the gate.
    expect(CODE).toContain("Deno.env.get('REVENUECAT_PROJECT_ID')");
    expect(CODE).toMatch(/if \(!projectId\) return false;/);
  });

  it('resolves the entitlement id from its lookup_key', () => {
    // Pinning the opaque `entl...` id in config would drift silently against
    // the identifier the store and paywall use.
    expect(CODE).toContain('lookup_key');
    expect(CODE).toContain('REQUIRED_ENTITLEMENT');
  });
});
