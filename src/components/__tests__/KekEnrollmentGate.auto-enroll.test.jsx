// KekEnrollmentGate — auto-enrollment on fresh wallet creation.
//
// When autoEnrollPin is passed (fresh create path), the gate should enroll
// silently without showing the PIN pad. On failure, it falls back to the
// manual gate with the PIN pad visible.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

// Framer Motion — stub to avoid animation timing issues in tests.
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

// Stub sub-components that aren't relevant to this test.
vi.mock('@/components/VaultIllustration', () => ({
  default: () => <div data-testid="vault-illus" />,
}));
vi.mock('@/components/security/PinPad', () => ({
  default: ({ onComplete, ...props }) => (
    <div data-testid="pin-pad">
      <button onClick={() => onComplete?.('12345678')}>Submit PIN</button>
    </div>
  ),
}));
vi.mock('@/components/ShakeOnKey', () => ({
  default: ({ children }) => <>{children}</>,
}));

import KekEnrollmentGate from '@/components/KekEnrollmentGate';

const AUTO_ENROLL_TESTID = 'kek-auto-enroll';
const GATE_TESTID = 'kek-enrollment-gate';

afterEach(() => { cleanup(); });

describe('KekEnrollmentGate — auto-enrollment', () => {
  it('1. autoEnrollPin provided → shows auto-enroll progress, NOT the PIN pad', async () => {
    const onEnroll = vi.fn(async () => ({ ok: true }));
    const onSkip = vi.fn();

    render(
      <KekEnrollmentGate
        origin="fresh"
        autoEnrollPin="12345678"
        onEnroll={onEnroll}
        onSkip={onSkip}
      />,
    );

    // Should show auto-enroll progress view.
    expect(screen.getByTestId(AUTO_ENROLL_TESTID)).toBeTruthy();
    expect(screen.queryByTestId(GATE_TESTID)).toBeNull();
    expect(screen.getByText(/sealing into hardware/i)).toBeTruthy();

    // Should call onEnroll with the stashed PIN.
    await waitFor(() => expect(onEnroll).toHaveBeenCalledWith('12345678'));
  });

  it('2. auto-enroll succeeds → onEnroll called with stashed PIN, gate clears', async () => {
    const onEnroll = vi.fn(async () => ({ ok: true }));
    const onSkip = vi.fn();

    render(
      <KekEnrollmentGate
        origin="fresh"
        autoEnrollPin="87654321"
        onEnroll={onEnroll}
        onSkip={onSkip}
      />,
    );

    await waitFor(() => expect(onEnroll).toHaveBeenCalledWith('87654321'));
    // onEnroll returned { ok: true } — caller (WalletEntry) handles dismiss.
    expect(onEnroll).toHaveBeenCalledTimes(1);
  });

  it('3. auto-enroll fails → falls back to manual gate with PIN pad', async () => {
    const onEnroll = vi.fn(async () => ({
      ok: false,
      msg: 'Something went wrong. Please try again.',
      isInsecureTier: false,
      isWrongPin: false,
    }));
    const onSkip = vi.fn();

    render(
      <KekEnrollmentGate
        origin="fresh"
        autoEnrollPin="12345678"
        onEnroll={onEnroll}
        onSkip={onSkip}
      />,
    );

    // Initially shows auto-enroll progress.
    expect(screen.getByTestId(AUTO_ENROLL_TESTID)).toBeTruthy();

    // After failure, should show the manual gate with error.
    await waitFor(() => expect(screen.getByTestId(GATE_TESTID)).toBeTruthy());
    expect(screen.queryByTestId(AUTO_ENROLL_TESTID)).toBeNull();
    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
  });

  it('4. auto-enroll fails with insecure tier → shows skip-only (no PIN pad)', async () => {
    const onEnroll = vi.fn(async () => ({
      ok: false,
      msg: "This device doesn't meet the hardware security requirement.",
      isInsecureTier: true,
      isWrongPin: false,
    }));
    const onSkip = vi.fn();

    render(
      <KekEnrollmentGate
        origin="fresh"
        autoEnrollPin="12345678"
        onEnroll={onEnroll}
        onSkip={onSkip}
      />,
    );

    // After insecure-tier failure, should show the manual gate with skip option.
    await waitFor(() => expect(screen.getByTestId(GATE_TESTID)).toBeTruthy());
    expect(screen.getByText(/doesn't meet the hardware security requirement/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeTruthy();
  });

  it('5. no autoEnrollPin → shows manual gate immediately (no auto-enroll attempt)', async () => {
    const onEnroll = vi.fn(async () => ({ ok: true }));
    const onSkip = vi.fn();

    render(
      <KekEnrollmentGate
        origin="restored"
        onEnroll={onEnroll}
        onSkip={onSkip}
      />,
    );

    // Should show the manual gate, not the auto-enroll view.
    expect(screen.getByTestId(GATE_TESTID)).toBeTruthy();
    expect(screen.queryByTestId(AUTO_ENROLL_TESTID)).toBeNull();
    // Should NOT auto-enroll.
    expect(onEnroll).not.toHaveBeenCalled();
  });

  it('6. auto-enroll only attempts once even if props don\'t change', async () => {
    const onEnroll = vi.fn(async () => ({
      ok: false,
      msg: 'Something went wrong.',
      isInsecureTier: false,
      isWrongPin: false,
    }));

    const { rerender } = render(
      <KekEnrollmentGate
        origin="fresh"
        autoEnrollPin="12345678"
        onEnroll={onEnroll}
        onSkip={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByTestId(GATE_TESTID)).toBeTruthy());
    expect(onEnroll).toHaveBeenCalledTimes(1);

    // Re-render with same props — should NOT retry.
    rerender(
      <KekEnrollmentGate
        origin="fresh"
        autoEnrollPin="12345678"
        onEnroll={onEnroll}
        onSkip={vi.fn()}
      />,
    );

    // Wait a tick to ensure no async call is pending.
    await new Promise((r) => setTimeout(r, 50));
    expect(onEnroll).toHaveBeenCalledTimes(1);
  });

  it('7. unmount during auto-enroll → no state update on unmounted component', async () => {
    let resolveEnroll;
    const onEnroll = vi.fn(() => new Promise((r) => { resolveEnroll = r; }));

    const { unmount } = render(
      <KekEnrollmentGate
        origin="fresh"
        autoEnrollPin="12345678"
        onEnroll={onEnroll}
        onSkip={vi.fn()}
      />,
    );

    expect(screen.getByTestId(AUTO_ENROLL_TESTID)).toBeTruthy();

    // Unmount while onEnroll is still pending.
    unmount();

    // Resolve the pending enroll — the live flag should prevent state updates.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    resolveEnroll({ ok: false, msg: 'Too late', isInsecureTier: false, isWrongPin: false });
    await new Promise((r) => setTimeout(r, 50));

    // No React "Can't perform a state update on an unmounted component" warning.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
