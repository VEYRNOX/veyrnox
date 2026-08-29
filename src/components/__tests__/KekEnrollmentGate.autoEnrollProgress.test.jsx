// KekEnrollmentGate — honest auto-enrollment status.
//
// The former progress bar suggested measurable completion while a biometric
// approval could still be pending. The gate now reports only the true state:
// waiting for approval on this device.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

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

vi.mock('@/components/VaultIllustration', () => ({
  default: () => <div data-testid="vault-illus" />,
}));
vi.mock('@/components/security/PinPad', () => ({
  default: () => <div data-testid="pin-pad" />,
}));
vi.mock('@/components/ShakeOnKey', () => ({
  default: ({ children }) => <>{children}</>,
}));

import KekEnrollmentGate from '@/components/KekEnrollmentGate';

afterEach(() => { cleanup(); });

describe('KekEnrollmentGate — auto-enroll status', () => {
  it('reports that device approval is pending without a fake progress bar', () => {
    render(
      <KekEnrollmentGate
        origin="fresh"
        autoEnrollPin="12345678"
        onEnroll={vi.fn(() => new Promise(() => {}))}
        onSkip={vi.fn()}
      />,
    );

    expect(screen.getByTestId('vault-illus')).toBeTruthy();
    expect(screen.getByRole('status')).toHaveTextContent('Approve the prompt on your device');
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('keeps the status live for assistive technology', () => {
    render(
      <KekEnrollmentGate
        origin="fresh"
        autoEnrollPin="12345678"
        onEnroll={vi.fn(() => new Promise(() => {}))}
        onSkip={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('uses a motion-safe spinner while approval is pending', () => {
    const { container } = render(
      <KekEnrollmentGate
        origin="fresh"
        autoEnrollPin="12345678"
        onEnroll={vi.fn(() => new Promise(() => {}))}
        onSkip={vi.fn()}
      />,
    );

    const spinner = container.querySelector('[role="status"] [aria-hidden="true"]');
    expect(spinner.getAttribute('class')).toMatch(/motion-safe:animate-spin/);
  });
});
