import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import BugReportFlow from '../BugReportFlow';

// Slice 1c — flow state machine. No real capture, no upload. What the tests
// pin here is the walk: explainer → countdown → recording → close, and the
// kill switches that must fire even before capture is wired.
//
// Mutation targets each row will catch when reintroduced:
//   - explainer-only open (missing continue) → advance test goes red
//   - close cleanup missing → reopen carries stale state
//   - visibility abort dropped → the vis-hidden test goes red
//   - 30s cap removed → recording persists past 30s (test fast-forwards)

vi.mock('lucide-react', () => ({ X: () => null }));

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: false }));
afterEach(() => vi.useRealTimers());

describe('BugReportFlow — closed', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(<BugReportFlow open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('BugReportFlow — explainer', () => {
  it('opens on the explainer state', () => {
    render(<BugReportFlow open onClose={() => {}} />);
    expect(screen.getByTestId('bug-report-explainer')).toBeInTheDocument();
    expect(screen.getByTestId('bug-report-continue')).toBeInTheDocument();
    expect(screen.getByTestId('bug-report-cancel')).toBeInTheDocument();
  });

  it('cancel invokes onClose', () => {
    const onClose = vi.fn();
    render(<BugReportFlow open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('bug-report-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('close button (X) invokes onClose', () => {
    const onClose = vi.fn();
    render(<BugReportFlow open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('bug-report-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('BugReportFlow — countdown → recording', () => {
  it('continue advances to countdown, then to recording after 3s', () => {
    render(<BugReportFlow open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('bug-report-continue'));
    expect(screen.getByTestId('bug-report-countdown')).toBeInTheDocument();

    // Countdown ticks: 3 → 2 → 1 → 0/'Go' → recording state
    // The transition to 'recording' happens on the render after countdown
    // hits 0. Ticks are one per second.
    act(() => vi.advanceTimersByTime(1000));
    act(() => vi.advanceTimersByTime(1000));
    act(() => vi.advanceTimersByTime(1000));
    // After 3 ticks the countdown reads 0 and the effect fires to switch
    // to 'recording' — that switch is synchronous inside the effect.
    expect(screen.getByTestId('bug-report-recording')).toBeInTheDocument();
    expect(screen.getByTestId('bug-report-stop')).toBeInTheDocument();
  });

  it('stop from recording invokes onClose', () => {
    const onClose = vi.fn();
    render(<BugReportFlow open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('bug-report-continue'));
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.click(screen.getByTestId('bug-report-stop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('BugReportFlow — 30s hard cap (I2)', () => {
  it('auto-closes when recording reaches 30 seconds', () => {
    const onClose = vi.fn();
    render(<BugReportFlow open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('bug-report-continue'));
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByTestId('bug-report-recording')).toBeInTheDocument();

    // Mutation defence: if the 30s cap is removed OR compared with > instead
    // of >=, the flow persists here and onClose never fires.
    act(() => vi.advanceTimersByTime(30_000));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('BugReportFlow — visibilitychange kill switch', () => {
  it('aborts recording when the document goes hidden', () => {
    const onClose = vi.fn();
    render(<BugReportFlow open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('bug-report-continue'));
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByTestId('bug-report-recording')).toBeInTheDocument();

    // Simulate the user backgrounding the app / OS taking a call.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true, get: () => 'hidden',
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT abort explainer or countdown on visibility hidden (only recording)', () => {
    const onClose = vi.fn();
    render(<BugReportFlow open onClose={onClose} />);
    // Still on explainer — vis change is irrelevant here.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true, get: () => 'hidden',
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('bug-report-explainer')).toBeInTheDocument();
  });
});

describe('BugReportFlow — state resets between opens', () => {
  it('reopens onto explainer after a prior close from recording', () => {
    const { rerender } = render(<BugReportFlow open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('bug-report-continue'));
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByTestId('bug-report-recording')).toBeInTheDocument();

    // Close and reopen.
    rerender(<BugReportFlow open={false} onClose={() => {}} />);
    rerender(<BugReportFlow open onClose={() => {}} />);

    // Mutation defence: without the reset-on-open effect, the flow reopens
    // straight back into recording — no consent, no countdown, straight to
    // capture. That is exactly the kind of silent-capture bug I2/I4 exist
    // to prevent.
    expect(screen.getByTestId('bug-report-explainer')).toBeInTheDocument();
    expect(screen.queryByTestId('bug-report-recording')).toBeNull();
  });
});
