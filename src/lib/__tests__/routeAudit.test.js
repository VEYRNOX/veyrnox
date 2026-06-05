// src/lib/__tests__/routeAudit.test.js
//
// Closes the audit-vs-router drift gap. featureClassification.test.js already
// checks CLASSIFICATION covers ALL_ROUTE_PATHS, but BOTH of those are
// hand-maintained — nothing tied them to the ACTUAL routes declared in App.jsx.
// So a new <Route> added under <Layout> but forgotten in the audit would default
// to 'live' and silently escape classification (and the gate), with no failing
// test. This test scans App.jsx and asserts the gated route set is exactly
// ALL_ROUTE_PATHS, which in turn must equal CLASSIFICATION's keys.
//
// Only routes inside `<Route element={<Layout />}>` are gated (FeatureGate wraps
// the Layout Outlet). Routes outside Layout — /login + redirects, /onboarding,
// and the `*` catch-all — are intentionally ungated and excluded here.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ALL_ROUTE_PATHS, CLASSIFICATION } from '../featureClassification';

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(resolve(here, '../../App.jsx'), 'utf8');

// Extract the routes that are children of the <Layout> route. All children are
// self-closing `<Route .../>`, so the first `</Route>` after the Layout opening
// tag is Layout's own close.
const LAYOUT_MARKER = 'element={<Layout />}>';
const start = appSrc.indexOf(LAYOUT_MARKER);
const end = appSrc.indexOf('</Route>', start);
const layoutBlock = start === -1 ? '' : appSrc.slice(start + LAYOUT_MARKER.length, end);
const gatedRoutePaths = [...layoutBlock.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);

describe('route audit covers exactly the gated routes in App.jsx', () => {
  // Sentinel: if App.jsx is restructured so the Layout block can't be parsed,
  // every comparison below would pass vacuously. Fail loudly instead.
  it('parsed the Layout route block from App.jsx', () => {
    expect(start).not.toBe(-1);
    expect(gatedRoutePaths.length).toBeGreaterThan(20);
  });

  it('ALL_ROUTE_PATHS matches the routes declared under <Layout>', () => {
    const audit = new Set(ALL_ROUTE_PATHS);
    const routed = new Set(gatedRoutePaths);
    const routedButNotInAudit = gatedRoutePaths.filter((p) => !audit.has(p)); // escapes classification
    const inAuditButNotRouted = ALL_ROUTE_PATHS.filter((p) => !routed.has(p)); // stale audit entry
    expect({ routedButNotInAudit, inAuditButNotRouted }).toEqual({
      routedButNotInAudit: [],
      inAuditButNotRouted: [],
    });
  });

  it('CLASSIFICATION keys match ALL_ROUTE_PATHS', () => {
    expect(new Set(Object.keys(CLASSIFICATION))).toEqual(new Set(ALL_ROUTE_PATHS));
  });
});
