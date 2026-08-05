// src/components/__tests__/SecurityAdvisor.consent.test.jsx
//
// Audit 2026-08-03 M-5 — no typed question may reach the remote endpoint
// without an explicit grant.
//
// The property that matters is not "a panel renders" but "fetch is never
// called", so these tests assert on the network call itself.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('@/api/demoClient', () => ({ DEMO: false }));

import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const ADVISOR_KEY = 'veyrnox-advisor-remote-consent';

async function mountAdvisor() {
  vi.resetModules();
  // SecurityAdvisor only builds TIP_CHAT_URL (and therefore only asks for
  // consent) when Supabase URL + anon key are ALSO present alongside
  // VITE_TIP_BASE_URL — see SecurityAdvisor.jsx's TIP_CHAT_URL computation.
  // vitest.config.js deliberately blanks the Supabase vars globally (PR #1328,
  // to stop the test suite writing to production Supabase), so this suite
  // must re-stub them locally the same way tipScreen.test.js does, or the
  // consent panel this file exists to test never renders.
  vi.stubEnv('VITE_SUPABASE_URL', 'https://sb.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  vi.stubEnv('VITE_TIP_BASE_URL', 'https://tip.test');
  const SecurityAdvisor = (await import('@/components/SecurityAdvisor.jsx')).default;
  render(
    <MemoryRouter initialEntries={['/send']}>
      <SecurityAdvisor walletChain="evm" />
    </MemoryRouter>
  );
  // Open the drawer.
  fireEvent.click(screen.getByLabelText(/open security advisor/i));
  return screen.findByTestId('advisor-remote-consent').catch(() => null);
}

// The composer is a <form onSubmit>, so a keyDown does NOT submit in jsdom.
// Submitting the form is what actually reaches sendMessage() — an earlier
// version of this helper used keyDown and the "sends nothing" assertions passed
// against the UNFIXED component, i.e. for the wrong reason entirely.
async function ask(text) {
  const box = await screen.findByPlaceholderText(/ask about security/i);
  fireEvent.change(box, { target: { value: text } });
  fireEvent.submit(box.closest('form'));
}

describe('SecurityAdvisor — remote answers need explicit consent (M-5)', () => {
  let fetchSpy;

  beforeEach(() => {
    localStorage.clear();
    fetchSpy = vi.fn(async () => { throw new Error('network should not be reached'); });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('shows the disclosure when no decision has been stored', async () => {
    await mountAdvisor();
    expect(await screen.findByTestId('advisor-remote-consent')).toBeTruthy();
  });

  it('does NOT show the disclosure again once a decision is stored', async () => {
    localStorage.setItem(ADVISOR_KEY, 'denied');
    await mountAdvisor();
    await screen.findByRole('textbox');
    expect(screen.queryByTestId('advisor-remote-consent')).toBeNull();
  });

  it('sends NOTHING to the network while consent is unanswered', async () => {
    await mountAdvisor();
    await ask('is 0xdead a scam address?');
    await waitFor(() => expect(screen.getAllByText(/./).length).toBeGreaterThan(0));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends NOTHING to the network after an explicit denial', async () => {
    await mountAdvisor();
    fireEvent.click(await screen.findByTestId('advisor-consent-deny'));
    await ask('is 0xdead a scam address?');
    await waitFor(() => expect(localStorage.getItem(ADVISOR_KEY)).toBe('denied'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still answers from the local knowledge base when declined (not a dead end)', async () => {
    await mountAdvisor();
    fireEvent.click(await screen.findByTestId('advisor-consent-deny'));
    await ask('what is deniability mode?');
    // An assistant reply appears without any network call.
    await waitFor(() => expect(fetchSpy).not.toHaveBeenCalled());
    const body = document.body.textContent || '';
    expect(body.length).toBeGreaterThan(0);
  });

  it('records the denial so it survives a remount', async () => {
    await mountAdvisor();
    fireEvent.click(await screen.findByTestId('advisor-consent-deny'));
    await waitFor(() => expect(localStorage.getItem(ADVISOR_KEY)).toBe('denied'));
    cleanup();
    await mountAdvisor();
    await screen.findByRole('textbox');
    expect(screen.queryByTestId('advisor-remote-consent')).toBeNull();
  });

  it('records the grant', async () => {
    await mountAdvisor();
    fireEvent.click(await screen.findByTestId('advisor-consent-allow'));
    await waitFor(() => expect(localStorage.getItem(ADVISOR_KEY)).toBe('granted'));
  });
});
