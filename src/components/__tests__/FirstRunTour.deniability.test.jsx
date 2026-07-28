// C-1 (2026-07-28 internal audit): FirstRunTour must not render or mutate
// shared localStorage in a decoy/demo session. Two-chokepoint pattern
// mirroring lib/consent.js (PR #1410) — gate at shouldShowTour() and at
// dismiss()'s writes, plus the WalletEntry render site is guarded separately.
//
// This suite pins the component-level half. The rendering-under-deniability
// check for WalletEntry is source-level: the render site wraps
// <FirstRunTour /> in `!isDeniabilityOrDemoActive() && …` so a decoy session
// never mounts it in the first place.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// Deniability predicate — flipped per-test. Default: real session.
const deniability = { active: false };
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => deniability.active,
}));

// Motion stub — keep onClick wiring so dismiss paths still fire.
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }) => <>{children}</>,
  motion: new Proxy({}, {
    get: (_, tag) => {
      const C = ({ children, onClick, className, ...rest }) => (
        <div onClick={onClick} className={className} data-motion={String(tag)}>
          {children}
        </div>
      );
      C.displayName = `motion.${String(tag)}`;
      return C;
    },
  }),
}));

const ARMED = 'veyrnox-first-run-tour-armed';
const SEEN = 'veyrnox-first-run-tour-seen';

let FirstRunTour;
let shouldShowTour;

beforeEach(async () => {
  deniability.active = true; // every test in this file runs as decoy/demo
  localStorage.clear();
  vi.resetModules();
  const mod = await import('@/components/FirstRunTour');
  FirstRunTour = mod.default;
  shouldShowTour = mod.shouldShowTour;
});

afterEach(cleanup);

describe('FirstRunTour — I3 (decoy/demo session)', () => {
  it('shouldShowTour() returns false even when the ARMED key is present', () => {
    // Simulate the real session's armed state leaking through — the shared
    // localStorage is the same store the decoy sees. The predicate must still
    // refuse.
    localStorage.setItem(ARMED, '1');
    expect(shouldShowTour()).toBe(false);
  });

  it('does not mount the modal when armed', async () => {
    localStorage.setItem(ARMED, '1');
    const onDone = vi.fn();
    render(<FirstRunTour onDone={onDone} />);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Quick Tour/)).toBeNull();
  });

  it('if a stale render reaches dismiss(), it must not write SEEN or clear ARMED', async () => {
    // shouldShowTour() already blocks render in decoy sessions, so the button
    // path in this suite cannot be triggered. This test protects the WRITE
    // chokepoint directly: call the exported dismiss surface by mounting with
    // deniability temporarily off (to get the modal on screen), then flip it
    // ON before clicking dismiss. The click must be a no-op on shared state.
    localStorage.setItem(ARMED, '1');

    deniability.active = false;
    render(<FirstRunTour />);
    await screen.findByText('Quick Tour · 1/5', {}, { timeout: 3000 });

    // Now the session becomes a decoy mid-flight. The write path in dismiss()
    // must consult isDeniabilityOrDemoActive() at click time.
    deniability.active = true;

    // Pre-condition: no SEEN yet, ARMED still set.
    expect(localStorage.getItem(SEEN)).toBeNull();
    expect(localStorage.getItem(ARMED)).toBe('1');

    fireEvent.click(screen.getByText('Skip'));

    // Post-condition: shared localStorage is UNCHANGED.
    expect(localStorage.getItem(SEEN)).toBeNull();
    expect(localStorage.getItem(ARMED)).toBe('1');
  });

  it('Get Started path also leaves shared state untouched', async () => {
    localStorage.setItem(ARMED, '1');

    deniability.active = false;
    render(<FirstRunTour />);
    await screen.findByText('Quick Tour · 1/5', {}, { timeout: 3000 });

    // Walk to the final step and flip deniability on before clicking through.
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Next'));
    await screen.findByText('Quick Tour · 5/5');

    deniability.active = true;
    fireEvent.click(screen.getByText('Get Started'));

    expect(localStorage.getItem(SEEN)).toBeNull();
    expect(localStorage.getItem(ARMED)).toBe('1');
  });
});
