import { describe, it, expect } from 'vitest';
import { SAFETY_PLUS_FEATURES, AI_SECURITY_PROTECTION_FEATURES } from '../tier';
import { SAFETY_PLUS_ROUTES, AI_SECURITY_PROTECTION_ROUTES } from '../safetyPlusRoutes';

// tier.js decides what /plans ADVERTISES as paid. safetyPlusRoutes.js decides
// what FeatureGate actually GATES. Nothing has ever tied the two together, and
// they drifted apart twice:
//
//   - the /safety-plus hub carried a "Message Signing" row pointing at
//     /crypto-signing after that path had already left SAFETY_PLUS_ROUTES
//     (noted in passing in aef80e15's own commit body);
//   - aef80e15 then ungated /crypto-signing in safetyPlusRoutes.js and removed
//     the hub row, but left "Message signing" in SAFETY_PLUS_FEATURES — so
//     /plans kept billing a free feature at $5.99/mo until 2026-09-01.
//
// Both directions matter and they fail differently:
//   advertised-but-ungated → the paywall claims money for something free
//                            (dishonest, the case above);
//   gated-but-unadvertised → a subscriber hits TierLockedPage for a feature
//                            the plans page never told them they were buying.
//
// So this maps every paid feature NAME to the route(s) that deliver it, and
// asserts the mapping is total and bidirectional. Adding a paid feature means
// adding a line here — that is the point, not friction to route around: the
// map is where "did I gate this?" becomes a question you cannot skip.

// null = deliberately unrouted. These live inside the Send flow rather than on
// a standalone path, so FeatureGate cannot gate them and the tier.js header
// says so. Each carries WHY, because "it's fine, it's embedded" is exactly the
// hand-wave a real drift would hide behind.
const SEND_EMBEDDED = 'send-flow, no standalone route';

/** @type {Record<string, string[] | typeof SEND_EMBEDDED>} */
const SAFETY_PLUS_FEATURE_ROUTES = {
  'Duress PIN': ['/duress-pin'],
  'Stealth / hidden wallets': ['/stealth-wallets'],
  'Panic wipe': ['/panic-wipe'],
  'Calldata decode & approval guard': SEND_EMBEDDED,
  'Address-poisoning warnings': SEND_EMBEDDED,
  'Risk scoring (pre-sign gate)': SEND_EMBEDDED,
  'Hardware wallet (Digital Shield)': ['/hardware-wallet'],
  'Transaction simulation': SEND_EMBEDDED,
  'Anomaly / fraud detection': ['/anomaly-detection', '/fraud'],
  'Suspicious-address screening': ['/address-checker'],
  'Token approvals (view + revoke)': ['/token-approvals'],
  'Spending limits': ['/budget'],
  'Spam token filter': ['/spam-filter'],
  'Encrypted personal backup': ['/personal-backup'],
  'Audit log': ['/audit-log'],
  'Advanced analytics': ['/advanced-analytics'],
  'Recurring payments': ['/recurring'],
};

describe('tier feature lists vs route gates — parity', () => {
  it('every advertised Safety Plus feature is mapped', () => {
    const unmapped = SAFETY_PLUS_FEATURES
      .map((f) => f.name)
      .filter((name) => !(name in SAFETY_PLUS_FEATURE_ROUTES));
    expect(unmapped, 'new paid feature with no route mapping — add it above').toEqual([]);
  });

  it('every advertised Safety Plus feature is actually gated', () => {
    const advertisedNames = new Set(SAFETY_PLUS_FEATURES.map((f) => f.name));
    for (const [name, routes] of Object.entries(SAFETY_PLUS_FEATURE_ROUTES)) {
      if (!advertisedNames.has(name)) continue; // covered by the stale-mapping test
      if (routes === SEND_EMBEDDED) continue;
      for (const route of routes) {
        expect(
          SAFETY_PLUS_ROUTES,
          `/plans advertises "${name}" as Safety Plus but ${route} is not gated — ` +
            'either gate the route or move the feature out of SAFETY_PLUS_FEATURES',
        ).toContain(route);
      }
    }
  });

  it('every gated Safety Plus route is advertised', () => {
    const advertisedNames = new Set(SAFETY_PLUS_FEATURES.map((f) => f.name));
    const claimed = new Set(
      Object.entries(SAFETY_PLUS_FEATURE_ROUTES)
        .filter(([name, routes]) => routes !== SEND_EMBEDDED && advertisedNames.has(name))
        .flatMap(([, routes]) => /** @type {string[]} */ (routes)),
    );
    for (const route of SAFETY_PLUS_ROUTES) {
      expect(
        claimed,
        `${route} is gated behind Safety Plus but no SAFETY_PLUS_FEATURES entry ` +
          'advertises it — a subscriber would hit TierLockedPage for something ' +
          'the plans page never sold them',
      ).toContain(route);
    }
  });

  it('has no stale mappings for features no longer advertised', () => {
    const advertised = new Set(SAFETY_PLUS_FEATURES.map((f) => f.name));
    const stale = Object.keys(SAFETY_PLUS_FEATURE_ROUTES).filter((n) => !advertised.has(n));
    expect(stale, 'mapping kept for a feature removed from SAFETY_PLUS_FEATURES').toEqual([]);
  });

  // The specific regression this file was written for. Message signing is FREE
  // (owner ruling, recorded in aef80e15: "/security-scanner and /crypto-signing
  // remain FREE ... generic message signing stay in Free tier"). Kept as a named
  // case so a re-added line fails with the reason rather than a generic diff.
  it('does not bill message signing, which is free', () => {
    const names = SAFETY_PLUS_FEATURES.map((f) => f.name);
    expect(names).not.toContain('Message signing');
    expect(SAFETY_PLUS_ROUTES).not.toContain('/crypto-signing');
    expect(AI_SECURITY_PROTECTION_ROUTES).not.toContain('/crypto-signing');
  });

  it('AI-tier features exist and the tier gates at least one route', () => {
    expect(AI_SECURITY_PROTECTION_FEATURES.length).toBeGreaterThan(0);
    expect(AI_SECURITY_PROTECTION_ROUTES.length).toBeGreaterThan(0);
  });
});
