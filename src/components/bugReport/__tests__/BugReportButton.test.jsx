import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Slice 1b — Settings button visibility gate.
//
// Mutation-checked pins:
//   - Component consults isBugReportEnabled() on EVERY render (not once at
//     mount). Re-render after gate flips → visibility updates.
//   - Gate off → nothing in the DOM (not display:none, not empty container).
//   - Gate on → onStart fires on click.
//
// Rationale for the re-render check: if a session transitions into a
// decoy/duress state between renders (e.g. context-provider switch), the
// button must disappear WITHOUT unmount/remount hooks having to fire.

const gate = vi.fn(() => false);
vi.mock('@/lib/bugReport/bugReportEnabled', () => ({
  isBugReportEnabled: () => gate(),
}));

// The component renders a lucide-react icon; the JSDOM environment doesn't
// need to resolve SVG props, but we stub anyway to keep the mount cost low.
vi.mock('lucide-react', () => ({
  Bug: () => null,
}));

let BugReportButton;
beforeEach(async () => {
  gate.mockReset().mockReturnValue(false);
  vi.resetModules();
  const mod = await import('../BugReportButton');
  BugReportButton = mod.default;
});

describe('BugReportButton — gate off (default)', () => {
  it('renders nothing when isBugReportEnabled() is false', () => {
    const onStart = vi.fn();
    const { container } = render(<BugReportButton onStart={onStart} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('bug-report-button')).toBeNull();
    expect(onStart).not.toHaveBeenCalled();
  });
});

describe('BugReportButton — gate on', () => {
  it('renders the button when isBugReportEnabled() is true', () => {
    gate.mockReturnValue(true);
    render(<BugReportButton onStart={() => {}} />);
    const btn = screen.getByTestId('bug-report-button');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent(/report a problem/i);
  });

  it('invokes onStart when tapped', () => {
    gate.mockReturnValue(true);
    const onStart = vi.fn();
    render(<BugReportButton onStart={onStart} />);
    fireEvent.click(screen.getByTestId('bug-report-button'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe('BugReportButton — re-evaluates on every render (belt-and-braces)', () => {
  it('hides mid-life when the gate flips false', () => {
    gate.mockReturnValue(true);
    const { rerender } = render(<BugReportButton onStart={() => {}} />);
    expect(screen.getByTestId('bug-report-button')).toBeInTheDocument();

    // Session transitions into a decoy/demo context between renders.
    gate.mockReturnValue(false);
    rerender(<BugReportButton onStart={() => {}} />);

    // Mutation defence: if the component ever caches the gate result at
    // mount, this row goes green with the button still present.
    expect(screen.queryByTestId('bug-report-button')).toBeNull();
  });
});
