// src/components/__tests__/SecurityAdvisor.noSnapshotEgress.test.jsx
//
// 2026-09-05 — the page snapshot must not leave the device.
//
// advisor.consent.body_1 promises the typed question "plus which screen you are
// on and which chain is selected". The wire carried 196 distinct keys published
// by 62 pages through useAdvisorSnapshot — wallet_count, transaction_count,
// current_tier, has_referral, contact_count — beside a PERSISTENT device_id,
// making the disclosure per-device and durable against an I5-untrusted backend.
//
// These tests assert on the REQUEST BODY, not on a render. The property is "the
// bytes never go", and the only place that can be observed is the fetch call.
// The consent suite next door learned this the hard way: an earlier version of
// its helper used keyDown, which does not submit the form, so its "sends
// nothing" assertions passed against the UNFIXED component.
//
// The snapshot is published here through BOTH routes that reach the send path —
// the `pageSnapshot` prop (Layout.jsx:511) and the advisorBridge CustomEvent
// (useAdvisorSnapshot) — because cutting one and leaving the other is exactly
// the shape of bug this pins.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('react-i18next', async () => {
  const wallet = /** @type {any} */ (await import('@/i18n/locales/en/wallet.json'));
  const common = /** @type {any} */ (await import('@/i18n/locales/en/common.json'));
  const bundles = { wallet: wallet.default, common: common.default };
  const resolve = (key, opts = {}) => {
    const ns = opts.ns || 'common';
    let v = bundles[ns];
    for (const p of String(key).split('.')) v = v?.[p];
    if (typeof v !== 'string') return opts.defaultValue || key;
    return v.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in opts ? String(opts[k]) : `{{${k}}}`));
  };
  return {
    useTranslation: (ns) => ({
      t: (k, o) => resolve(k, { ns, ...(o || {}) }),
      i18n: { language: 'en', resolvedLanguage: 'en' },
    }),
    Trans: ({ children }) => children,
    initReactI18next: { type: '3rdParty', init: () => {} },
    I18nextProvider: ({ children }) => children,
  };
});

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('@/api/demoClient', () => ({ DEMO: false }));
vi.mock('@/lib/TierProvider', () => ({
  useTier: () => ({ currentTier: 'ai_security_protection' }),
}));

import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const ADVISOR_KEY = 'veyrnox-advisor-remote-consent';

// Values chosen to be unmistakable if they ever appear on the wire: each is a
// real key published by a real page today (Dashboard, Subscription, AddressBook)
// carrying a sentinel value no other part of the payload could produce.
const SNAPSHOT = {
  dashboard: {
    wallet_count: 424242,
    transaction_count: 313131,
    alerts_triggered: 9,
  },
  subscription: { current_tier: 'SENTINEL_TIER', has_referral: true },
  address_book: { contact_count: 777 },
};

async function mountAdvisor({ withProp = false } = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_TIP_BASE_URL', 'https://tip.test');
  const SecurityAdvisor = (await import('@/components/SecurityAdvisor.jsx')).default;
  const { publishAdvisorContext } = await import('@/lib/advisorBridge');
  render(
    <MemoryRouter initialEntries={['/send']}>
      <SecurityAdvisor walletChain="evm" pageSnapshot={withProp ? SNAPSHOT : null} />
    </MemoryRouter>
  );
  // Route 2: the publisher bus useAdvisorSnapshot writes to.
  publishAdvisorContext(SNAPSHOT);
  fireEvent.click(screen.getByLabelText(/open vigil/i));
  return screen.findByRole('textbox');
}

async function ask(text) {
  // A form submit, not a keyDown — see the header note.
  const box = await screen.findByPlaceholderText(/ask vigil/i);
  fireEvent.change(box, { target: { value: text } });
  fireEvent.submit(box.closest('form'));
}

/** Every request body this test's fetch spy saw, as raw strings. */
function sentBodies(fetchSpy) {
  return fetchSpy.mock.calls
    .map(([, init]) => (init && typeof init.body === 'string' ? init.body : ''))
    .filter(Boolean);
}

describe('SecurityAdvisor — the page snapshot never reaches the network', () => {
  let fetchSpy;

  beforeEach(() => {
    localStorage.clear();
    // Consent already GRANTED. The point of these tests is that even a fully
    // consented request does not carry the snapshot — a denied request proves
    // nothing here, because it makes no request at all.
    localStorage.setItem(ADVISOR_KEY, 'granted');
    fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ reply: 'ok' }),
      text: async () => JSON.stringify({ reply: 'ok' }),
      body: null,
    }));
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('makes the request at all (guards against a vacuous pass)', async () => {
    // Without this, every "not present" assertion below would hold trivially
    // if the component simply stopped calling fetch — a green suite proving
    // nothing. This is the same guard the route and flag pins carry.
    await mountAdvisor();
    await ask('is this dapp safe?');
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(sentBodies(fetchSpy).length).toBeGreaterThan(0);
  });

  it('sends no page_snapshot key, via the publisher bus', async () => {
    await mountAdvisor();
    await ask('is this dapp safe?');
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    for (const body of sentBodies(fetchSpy)) {
      expect(body).not.toContain('page_snapshot');
      expect(body).not.toContain('untrusted_context');
    }
  });

  it('sends no page_snapshot key, via the pageSnapshot prop', async () => {
    // Layout.jsx passes the prop directly; cutting only the bus would leave
    // this route open.
    await mountAdvisor({ withProp: true });
    await ask('is this dapp safe?');
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    for (const body of sentBodies(fetchSpy)) {
      expect(body).not.toContain('page_snapshot');
    }
  });

  it('leaks no snapshot VALUE, by either route', async () => {
    // Key-name assertions alone would pass if the values were spread into the
    // context object under different names. Assert on the sentinel values.
    await mountAdvisor({ withProp: true });
    await ask('is this dapp safe?');
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    for (const body of sentBodies(fetchSpy)) {
      for (const sentinel of ['424242', '313131', 'SENTINEL_TIER', '777', 'wallet_count', 'contact_count']) {
        expect(body, `${sentinel} must not reach the wire`).not.toContain(sentinel);
      }
    }
  });

  it('still sends exactly what the consent copy promises', async () => {
    // The fix must not be "send nothing" — current_screen and wallet_chain are
    // disclosed and are what makes the feature work at all. If these vanish,
    // the tests above would pass for the wrong reason.
    await mountAdvisor();
    await ask('is this dapp safe?');
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const bodies = sentBodies(fetchSpy);
    expect(bodies.some((b) => b.includes('current_screen'))).toBe(true);
    expect(bodies.some((b) => b.includes('wallet_chain'))).toBe(true);
  });
});
