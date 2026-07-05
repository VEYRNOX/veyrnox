// Framing guard (deniability): the Security duress/panic pages must NOT surface a
// configured-vs-not state. With slots always-provisioned, "is it set?" must have no
// observable answer in the UI — neither in copy NOR computed from blob presence.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, '..', rel), 'utf8');

// Setup pages whose copy is specific to the duress/panic set/change flow.
const SETUP_PAGES = ['pages/DuressPin.jsx', 'pages/PanicWipe.jsx'];
// Plain-language security disclosure surfaces (Phase 2 — seized-device PIN
// disclosure). Static, session-independent copy that explains the threat model;
// it must hold to the same no-configured-state guard as the setup pages so a
// security surface never drifts outside the deniability check.
// TermsLegal §D is a static reference copy of the coercion-feature limits; it
// must hold to the same no-configured-state guard so this consolidated surface
// never drifts into an "is it set?" readout.
const DISCLOSURE_PAGES = ['pages/WhatThisProtects.jsx', 'pages/TermsLegal.jsx'];
// Pages whose copy must not frame a configured-vs-not state.
const COPY_GUARDED_PAGES = [...SETUP_PAGES, ...DISCLOSURE_PAGES];
// Pages that must not COMPUTE configured-vs-not from the slot for display.
// Setup pages (DuressPin, PanicWipe) are excluded: they legitimately call
// hasDuressPin()/hasPanicPin() to drive their own set-vs-remove UI — that
// query is authorised by the user navigating to the setup screen. Disclosure
// pages and the aggregate Dashboard must never expose a configured-state oracle.
const LOGIC_GUARDED_PAGES = [...DISCLOSURE_PAGES, 'pages/SecurityDashboard.jsx'];

// Copy that frames the slot as a toggle / reveals configured state.
const FORBIDDEN_COPY = [
  'is active', 'No Duress PIN set', 'No panic/wipe PIN set',
  'Enable duress', 'Enable Duress', 'not configured', 'Disabled', 'Remove PIN',
];
// Logic that COMPUTES configured-vs-not from the slot for display.
const FORBIDDEN_LOGIC = ['hasDuressPin(', 'hasPanicPin('];

describe('Security framing — no configured-state oracle', () => {
  // The provider must not export duress/panic configured-state accessors at
  // all. Pages are grepped above, but the 2026-07-05 regression showed the API
  // itself is the attractive nuisance: an exposed hasDuressPin invites the
  // next page to call it. wallet-core keeps hasDuressVault/hasPanicVault for
  // internal unlock/chaff plumbing; the React context exposes only set/remove.
  it('lib/WalletProvider.jsx does not expose a configured-state accessor', () => {
    const src = read('lib/WalletProvider.jsx');
    for (const s of ['hasDuressPin', 'hasPanicPin']) {
      expect(src, `forbidden context API: "${s}"`).not.toContain(s);
    }
  });

  for (const page of COPY_GUARDED_PAGES) {
    it(`${page} has no configured-vs-not copy`, () => {
      const src = read(page);
      for (const s of FORBIDDEN_COPY) expect(src, `forbidden copy: "${s}"`).not.toContain(s);
    });
  }
  for (const page of LOGIC_GUARDED_PAGES) {
    it(`${page} does not compute configured state from slot presence`, () => {
      const src = read(page);
      for (const s of FORBIDDEN_LOGIC) expect(src, `forbidden logic: "${s}"`).not.toContain(s);
    });
  }
});
