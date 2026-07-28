// FirstRunTour — behaviour, not placement.
//
// FirstRunTour.placement.test.js is a source-level guard on WHERE the tour is
// wired. It cannot tell you the component still works: it never renders it.
// That gap is why the deletion in PR #1403 and the restore in PR #1414 both
// went in with no executable evidence of the tour actually showing.
//
// This suite renders it. The four things worth pinning:
//   1. armed  -> the tour shows, on step 1 of 5
//   2. unarmed -> nothing renders and onDone fires immediately (a plain unlock
//      must never get a full-screen modal over it)
//   3. finishing consumes the arm and sets the seen marker, so it is
//      once-per-device
//   4. I3 — armTour() in a decoy/demo session writes NOTHING to the shared
//      localStorage the real session reads

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';

// Deniability predicate — flipped per-test. Default: real session.
const deniability = { active: false };
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => deniability.active,
}));

// Motion — stub the animation layer but keep the props the component relies on
// for interaction (onClick drives both the backdrop dismiss and stopPropagation).
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
let armTour;
let shouldShowTour;

beforeEach(async () => {
  deniability.active = false;
  localStorage.clear();
  vi.resetModules();
  const mod = await import('@/components/FirstRunTour');
  FirstRunTour = mod.default;
  armTour = mod.armTour;
  shouldShowTour = mod.shouldShowTour;
});

afterEach(cleanup);

describe('FirstRunTour — arming', () => {
  it('armTour() sets the armed marker in a real session', () => {
    armTour();
    expect(localStorage.getItem(ARMED)).toBe('1');
    expect(shouldShowTour()).toBe(true);
  });

  it('I3 — armTour() writes NOTHING in a decoy/demo session', () => {
    deniability.active = true;
    armTour();
    // Not merely "does not show" — the key must never reach the shared
    // localStorage the real session reads. Same bar as the K-2 fix (PR #1262).
    expect(localStorage.getItem(ARMED)).toBeNull();
    expect(shouldShowTour()).toBe(false);
  });

  it('a seen marker suppresses the tour even when armed', () => {
    localStorage.setItem(SEEN, '1');
    armTour();
    expect(shouldShowTour()).toBe(false);
  });
});

describe('FirstRunTour — rendering', () => {
  it('shows step 1 of 5 when armed', async () => {
    armTour();
    render(<FirstRunTour />);
    expect(await screen.findByText('Quick Tour · 1/5', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText('Security Dashboard')).toBeTruthy();
  });

  it('renders nothing and calls onDone when NOT armed', async () => {
    const onDone = vi.fn();
    render(<FirstRunTour onDone={onDone} />);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Quick Tour/)).toBeNull();
  });

  it('advances through all five security steps and ends on "Get Started"', async () => {
    armTour();
    render(<FirstRunTour />);
    await screen.findByText('Quick Tour · 1/5', {}, { timeout: 3000 });

    // The five steps are the F-P3-3 remediation content — the features that
    // have no other discovery path.
    const titles = [
      'Security Dashboard',
      'Duress PIN',
      'Stealth Wallets',
      'Personal Backup',
      'Hardware Protection',
    ];
    for (let i = 0; i < titles.length; i++) {
      expect(screen.getByText(titles[i])).toBeTruthy();
      expect(screen.getByText(`Quick Tour · ${i + 1}/5`)).toBeTruthy();
      const advance = screen.getByText(i < titles.length - 1 ? 'Next' : 'Get Started');
      fireEvent.click(advance);
    }
  });

  it('finishing consumes the arm and records seen — once per device', async () => {
    armTour();
    const onDone = vi.fn();
    render(<FirstRunTour onDone={onDone} />);
    await screen.findByText('Quick Tour · 1/5', {}, { timeout: 3000 });

    fireEvent.click(screen.getByText('Skip'));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(localStorage.getItem(SEEN)).toBe('1');
    expect(localStorage.getItem(ARMED)).toBeNull(); // consumed, not left primed
    expect(shouldShowTour()).toBe(false);
  });
});
