// PinSetup — two-step PIN entry (new PIN → confirm PIN).
//
// TDD RED first: the component does not exist yet. These tests pin the
// externally-observable contract per Slice B plan.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

// Framer Motion — stub to avoid animation timing issues in tests.
vi.mock('motion/react', () => ({
  motion: new Proxy({}, {
    get: (_, tag) => {
      const C = ({ children, ...props }) => {
        const { variants: _v, initial: _i, animate: _a, ...rest } = props;
        return <div {...{ className: rest.className, role: rest.role, 'aria-live': rest['aria-live'], 'data-testid': rest['data-testid'] }}>{children}</div>;
      };
      C.displayName = `motion.${String(tag)}`;
      return C;
    },
  }),
  useReducedMotion: () => true,
}));

vi.mock('@/components/ShakeOnKey', () => ({
  default: ({ children }) => <>{children}</>,
}));

import PinSetup from '@/components/PinSetup';

// Type a numeric PIN into the currently-mounted PinPad, then click Submit.
// PinPad renders digit buttons with visible text "0"-"9" (tabIndex=-1, no
// aria-label) and a submit button aria-labelled "Submit PIN".
function typePin(pin) {
  for (const d of pin) {
    fireEvent.click(screen.getByRole('button', { name: d }));
  }
  fireEvent.click(screen.getByRole('button', { name: /submit pin/i }));
}

afterEach(() => { cleanup(); });

describe('PinSetup', () => {
  it('1. mounts on step 1, advances to step 2 after a valid PIN', () => {
    render(<PinSetup onDone={vi.fn()} onCancel={vi.fn()} />);

    // Step 1 heading matches the pinned owner-set copy: "Choose an 8-digit PIN".
    expect(screen.getByRole('heading', { name: /choose an 8-digit pin/i })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /confirm/i })).toBeNull();

    typePin('19283746'); // 8 digits, not sequential, not common

    // Step 2 heading (plan: "Confirm PIN").
    expect(screen.getByRole('heading', { name: /confirm/i })).toBeTruthy();
  });

  it('2. weak PIN → error, no advance. Mismatch → error, BOTH pins reset, back to step 1, no onDone.', () => {
    const onDone = vi.fn();
    const { unmount } = render(<PinSetup onDone={onDone} onCancel={vi.fn()} />);

    // Weak PIN: all zeros — checkPinStrength rejects (isAllSameDigit).
    typePin('00000000');
    expect(screen.getByRole('alert')).toBeTruthy();
    // Still on step 1.
    expect(screen.getByRole('heading', { name: /choose an 8-digit pin/i })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /confirm/i })).toBeNull();
    expect(onDone).not.toHaveBeenCalled();

    unmount();

    // Fresh mount → valid PIN → step 2 → mismatch.
    render(<PinSetup onDone={onDone} onCancel={vi.fn()} />);
    typePin('19283746');
    expect(screen.getByRole('heading', { name: /confirm/i })).toBeTruthy();

    typePin('99999999');
    // Mismatch surfaces an error.
    expect(screen.getByRole('alert')).toBeTruthy();
    // Reviewer P2: mismatch bounces user back to step 1 and resets BOTH pins,
    // matching the original WalletEntry semantics. Prevents unlimited retry on
    // the confirm step after a shoulder-surfed first entry.
    expect(screen.getByRole('heading', { name: /choose an 8-digit pin/i })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /confirm/i })).toBeNull();
    // PIN pad reset — PinPad's dot-count status reports 0 of 8.
    expect(screen.getByRole('status', { name: /0 of 8 digits entered/i })).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('3. onDone(pin) receives exactly the confirmed PIN', () => {
    const onDone = vi.fn();
    render(<PinSetup onDone={onDone} onCancel={vi.fn()} />);

    typePin('19283746');
    typePin('19283746');

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith('19283746');
  });

  it('4. onCancel fires at either step and does not fire onDone', () => {
    const onDone1 = vi.fn();
    const onCancel1 = vi.fn();
    const { unmount } = render(<PinSetup onDone={onDone1} onCancel={onCancel1} />);

    // Cancel from step 1.
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel1).toHaveBeenCalledTimes(1);
    expect(onDone1).not.toHaveBeenCalled();

    unmount();

    // Cancel from step 2.
    const onDone2 = vi.fn();
    const onCancel2 = vi.fn();
    render(<PinSetup onDone={onDone2} onCancel={onCancel2} />);
    typePin('19283746');
    expect(screen.getByRole('heading', { name: /confirm/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel2).toHaveBeenCalledTimes(1);
    expect(onDone2).not.toHaveBeenCalled();
  });

  it('5. state resets on unmount (not persisted in module scope)', () => {
    const { unmount } = render(<PinSetup onDone={vi.fn()} onCancel={vi.fn()} />);
    typePin('19283746');
    expect(screen.getByRole('heading', { name: /confirm/i })).toBeTruthy();
    unmount();

    render(<PinSetup onDone={vi.fn()} onCancel={vi.fn()} />);
    // Fresh mount lands on step 1, no lingering state.
    expect(screen.getByRole('heading', { name: /choose an 8-digit pin/i })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /confirm/i })).toBeNull();
    expect(screen.getByRole('status', { name: /0 of 8 digits entered/i })).toBeTruthy();
  });

  it('6. never writes to localStorage', () => {
    const setSpy = vi.spyOn(Storage.prototype, 'setItem');
    const onDone = vi.fn();
    render(<PinSetup onDone={onDone} onCancel={vi.fn()} />);

    // Full flow including a mismatch (which now bounces back to step 1 and
    // resets BOTH pins per reviewer P2). Exercise: step 1 → step 2 → mismatch
    // → step 1 again → step 2 → match → onDone.
    typePin('19283746');          // step 1 → step 2
    typePin('99999999');          // mismatch → back to step 1, both reset
    typePin('19283746');          // step 1 again → step 2
    typePin('19283746');          // step 2 match → onDone

    expect(onDone).toHaveBeenCalledWith('19283746');
    expect(setSpy).not.toHaveBeenCalled();
    setSpy.mockRestore();
  });
});
