// KekEnrollmentGate — new `mode` prop (Slice B).
//
// TDD RED first: the `mode` prop and the `kek-skip-warning` surface do not
// exist yet. Default mode='auto' must match the existing fixture in
// KekEnrollmentGate.auto-enroll.test.jsx.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';

// Framer Motion — same stub as the auto-enroll fixture.
vi.mock('motion/react', () => ({
  motion: new Proxy({}, {
    get: (_, tag) => {
      const C = ({ children, ...props }) => {
        const { variants: _v, initial: _i, animate: _a, ...rest } = props;
        return <div {...{ className: rest.className, role: rest.role, 'aria-live': rest['aria-live'], 'aria-describedby': rest['aria-describedby'], 'data-testid': rest['data-testid'] }}>{children}</div>;
      };
      C.displayName = `motion.${String(tag)}`;
      return C;
    },
  }),
  useReducedMotion: () => true,
}));

vi.mock('@/components/VaultIllustration', () => ({
  default: () => <div data-testid="vault-illus" />,
}));
vi.mock('@/components/security/PinPad', () => ({
  default: ({ onComplete }) => (
    <div data-testid="pin-pad">
      <button onClick={() => onComplete?.('12345678')}>Submit PIN</button>
    </div>
  ),
}));
vi.mock('@/components/ShakeOnKey', () => ({
  default: ({ children }) => <>{children}</>,
}));

import KekEnrollmentGate from '@/components/KekEnrollmentGate';

const GATE_TESTID = 'kek-enrollment-gate';
const AUTO_ENROLL_TESTID = 'kek-auto-enroll';
const SKIP_WARN_TESTID = 'kek-skip-warning';
const SKIP_WARN_KEY = 'veyrnox-kek-onboarding-skip-warned';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('KekEnrollmentGate — mode prop', () => {
  it('1. mode="auto" (default) behaves like the existing fixture — auto-enroll fires with the stashed PIN', async () => {
    const onEnroll = vi.fn(async () => ({ ok: true }));

    render(
      <KekEnrollmentGate
        origin="fresh"
        mode="auto"
        autoEnrollPin="12345678"
        onEnroll={onEnroll}
        onSkip={vi.fn()}
      />,
    );

    expect(screen.getByTestId(AUTO_ENROLL_TESTID)).toBeTruthy();
    expect(screen.queryByTestId(GATE_TESTID)).toBeNull();
    await waitFor(() => expect(onEnroll).toHaveBeenCalledWith('12345678'));

    // In auto mode, skipping never sets the onboarding session flag.
    // (No skip path here — auto-enroll succeeded — but the flag stays absent.)
    expect(sessionStorage.getItem(SKIP_WARN_KEY)).toBeNull();
  });

  it('2. mode="onboarding" — clicking Skip sets the session flag AND calls onSkip', () => {
    const onSkip = vi.fn();

    render(
      <KekEnrollmentGate
        origin="fresh"
        mode="onboarding"
        onEnroll={vi.fn(async () => ({ ok: true }))}
        onSkip={onSkip}
      />,
    );

    expect(screen.getByTestId(GATE_TESTID)).toBeTruthy();
    // Wallet-setup progress bar was removed from KEK — asserted absent so a
    // future re-add gets caught by review, not shipped silently.
    expect(screen.queryByRole('progressbar', { name: /wallet setup progress/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(SKIP_WARN_KEY)).toBe('1');
  });

  it('2b. mode="auto" no longer renders the wallet-setup progress bar (removed at KEK)', () => {
    render(
      <KekEnrollmentGate
        origin="fresh"
        mode="auto"
        onEnroll={vi.fn(async () => ({ ok: true }))}
        onSkip={vi.fn()}
      />,
    );

    expect(screen.queryByRole('progressbar', { name: /wallet setup progress/i })).toBeNull();
  });

  it('3. mode="onboarding" — warning renders on first skip; hidden on remount while session flag is set', () => {
    // First skip, no flag pre-seeded — warning banner appears.
    const first = render(
      <KekEnrollmentGate
        origin="fresh"
        mode="onboarding"
        onEnroll={vi.fn(async () => ({ ok: true }))}
        onSkip={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    expect(screen.getByTestId(SKIP_WARN_TESTID)).toBeTruthy();
    first.unmount();

    // Flag now set (by prior skip). Fresh mount must NOT show the warning again.
    expect(sessionStorage.getItem(SKIP_WARN_KEY)).toBe('1');
    render(
      <KekEnrollmentGate
        origin="fresh"
        mode="onboarding"
        onEnroll={vi.fn(async () => ({ ok: true }))}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.queryByTestId(SKIP_WARN_TESTID)).toBeNull();
  });

  it('4. mode="onboarding" — successful onEnroll clears the session skip-warning flag', async () => {
    sessionStorage.setItem(SKIP_WARN_KEY, '1');
    const onEnroll = vi.fn(async () => ({ ok: true }));

    await act(async () => {
      render(
        <KekEnrollmentGate
          origin="fresh"
          mode="onboarding"
          autoEnrollPin="12345678"
          onEnroll={onEnroll}
          onSkip={vi.fn()}
        />,
      );
    });

    await waitFor(() => expect(onEnroll).toHaveBeenCalledWith('12345678'));
    await waitFor(() => expect(sessionStorage.getItem(SKIP_WARN_KEY)).toBeNull());
  });
});
