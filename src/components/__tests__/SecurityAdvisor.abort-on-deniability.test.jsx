// src/components/__tests__/SecurityAdvisor.abort-on-deniability.test.jsx
//
// I3: a deniability/demo session makes ZERO backend calls.
//
// SecurityAdvisor enforces that with a render gate — `if (hidden) return null`
// — which is correct for STARTING a request: no UI, no send path. It does not
// cover a request that is ALREADY IN FLIGHT.
//
// The chat endpoint is an SSE stream (#1614 wired it directly to the TIP
// Worker at /api/v1/chat), so a turn can be open for many seconds. If
// deniability or panic activates during that window the component unmounts,
// but `abortRef.current.abort()` is only ever called from `handleClose` — the
// user manually closing the drawer. There is no unmount/hidden cleanup, so the
// connection keeps streaming into the deniability session.
//
// Mid-action is precisely when someone flips to duress, so this is the case
// that matters rather than a theoretical one.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const ADVISOR_KEY = 'veyrnox-advisor-remote-consent';

const isDeniabilityOrDemoActive = vi.fn(() => false);
vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: () => isDeniabilityOrDemoActive(),
}));
vi.mock('@/api/demoClient', () => ({ DEMO: false }));
vi.mock('@/lib/TierProvider', () => ({
  useTier: () => ({ currentTier: 'safety_plus', loading: false }),
}));
vi.mock('@/lib/purchases', () => ({
  getRcUserId: vi.fn(async () => 'test-rc-user'),
}));
vi.mock('@/api/tipScreen.js', () => ({ screenTransaction: vi.fn() }));

/** A fetch that resolves with a stream we never close, so the turn stays open. */
function openEndedStream(signal) {
  return new Promise((resolve, reject) => {
    signal?.addEventListener('abort', () => {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
    resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
      body: {
        getReader: () => ({
          // Never resolves unless aborted — models an in-flight SSE turn.
          read: () => new Promise((res) => {
            signal?.addEventListener('abort', () => res({ done: true, value: undefined }));
          }),
          releaseLock: () => {},
          cancel: () => {},
        }),
      },
      json: async () => ({}),
      text: async () => '',
    });
  });
}

let rerenderFn;

async function mountAdvisor() {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://sb.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  vi.stubEnv('VITE_TIP_BASE_URL', 'https://tip.test');

  const SecurityAdvisor = (await import('@/components/SecurityAdvisor.jsx')).default;
  const utils = render(
    <MemoryRouter initialEntries={['/send']}>
      <SecurityAdvisor walletChain="ethereum" />
    </MemoryRouter>,
  );
  rerenderFn = () => utils.rerender(
    <MemoryRouter initialEntries={['/send']}>
      <SecurityAdvisor walletChain="ethereum" />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByLabelText(/open security advisor/i));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(ADVISOR_KEY, 'granted'); // consent already given
  isDeniabilityOrDemoActive.mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe('I3 — an in-flight Advisor stream is aborted when deniability activates', () => {
  it('aborts the fetch when the session becomes deniable mid-stream', async () => {
    let capturedSignal = null;
    vi.stubGlobal('fetch', vi.fn((_url, init) => {
      capturedSignal = init?.signal ?? null;
      return openEndedStream(init?.signal);
    }));

    await mountAdvisor();

    const box = await screen.findByPlaceholderText(/ask about security/i);
    fireEvent.change(box, { target: { value: 'is this address safe?' } });
    fireEvent.submit(box.closest('form'));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(capturedSignal).toBeTruthy();
    expect(capturedSignal.aborted).toBe(false);

    // Deniability activates while the turn is still open.
    isDeniabilityOrDemoActive.mockReturnValue(true);
    rerenderFn();

    // The component is gone from the DOM...
    await waitFor(() =>
      expect(screen.queryByLabelText(/open security advisor/i)).toBeNull(),
    );

    // ...and the connection must be gone with it. Unmounting alone does not
    // stop an SSE stream; something has to call abort().
    await waitFor(() => expect(capturedSignal.aborted).toBe(true));
  });

  it('does not abort while the session stays non-deniable', async () => {
    let capturedSignal = null;
    vi.stubGlobal('fetch', vi.fn((_url, init) => {
      capturedSignal = init?.signal ?? null;
      return openEndedStream(init?.signal);
    }));

    await mountAdvisor();

    const box = await screen.findByPlaceholderText(/ask about security/i);
    fireEvent.change(box, { target: { value: 'hello' } });
    fireEvent.submit(box.closest('form'));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    rerenderFn(); // an ordinary re-render must not kill a live turn
    await new Promise((r) => setTimeout(r, 20));

    expect(capturedSignal.aborted).toBe(false);
  });

  it('still makes no request at all when deniability is active from the start', async () => {
    // The pre-existing render gate. Pinned here so the new cleanup cannot be
    // mistaken for the whole of I3 for this component.
    isDeniabilityOrDemoActive.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn(() => openEndedStream()));

    vi.resetModules();
    vi.stubEnv('VITE_TIP_BASE_URL', 'https://tip.test');
    const SecurityAdvisor = (await import('@/components/SecurityAdvisor.jsx')).default;
    render(
      <MemoryRouter initialEntries={['/send']}>
        <SecurityAdvisor walletChain="ethereum" />
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText(/open security advisor/i)).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
