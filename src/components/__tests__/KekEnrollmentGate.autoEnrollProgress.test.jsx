// KekEnrollmentGate — auto-enroll progress bar position + shape.
//
// Bug: the progress bar rendered as a fixed page footer, OUTSIDE the
// centered content stack, and reported value=100 (looked "done") while KEK
// enrollment was still running. Fix: bar moves inline, directly under the
// VaultIllustration inside the centered flex column, and is indeterminate.

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

describe('KekEnrollmentGate — auto-enroll progress bar', () => {
  it('renders the bar as a sibling of VaultIllustration, inside the centered content stack', () => {
    render(
      <KekEnrollmentGate
        origin="fresh"
        autoEnrollPin="12345678"
        onEnroll={vi.fn(() => new Promise(() => {}))}
        onSkip={vi.fn()}
      />,
    );

    const vault = screen.getByTestId('vault-illus');
    const bar = screen.getByRole('progressbar');
    // Same parent (the centered flex column), not a page-level fixed footer sibling.
    expect(bar.closest('.flex.flex-col.items-center')).toBe(vault.closest('.flex.flex-col.items-center'));
  });

  it('is indeterminate — no aria-valuenow (not a fake 100%)', () => {
    render(
      <KekEnrollmentGate
        origin="fresh"
        autoEnrollPin="12345678"
        onEnroll={vi.fn(() => new Promise(() => {}))}
        onSkip={vi.fn()}
      />,
    );

    const bar = screen.getByRole('progressbar');
    expect(bar).not.toHaveAttribute('aria-valuenow');
  });

  it('animated fill honours motion-reduce', () => {
    const { container } = render(
      <KekEnrollmentGate
        origin="fresh"
        autoEnrollPin="12345678"
        onEnroll={vi.fn(() => new Promise(() => {}))}
        onSkip={vi.fn()}
      />,
    );

    const fill = container.querySelector('[role="progressbar"] [aria-hidden="true"]');
    expect(fill.className).toMatch(/motion-reduce:animate-none/);
  });
});
