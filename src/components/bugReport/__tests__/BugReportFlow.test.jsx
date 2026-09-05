import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

// Slice 1a-1d flow tests. What the tests pin here is the walk:
// explainer → countdown → recording → review → close, and every kill
// switch that must fire regardless of whether real capture is wired.
//
// Mutations these tests catch when reintroduced:
//   - reset-on-open removed → reopen goes straight back into recording
//   - visibilitychange listener removed → hidden vis test goes red
//   - 30s cap removed → recording persists past 30s
//   - stop → close (bypasses review) → review test goes red
//   - capture handle not aborted on close → abort spy test goes red

vi.mock('lucide-react', () => ({ X: () => null }));

// Route hook mocked — this file tests flow states, not routing. A dedicated
// useRouteKillSwitch.test.js pins the hook itself.
vi.mock('@/lib/bugReport/useRouteKillSwitch', () => ({
  useRouteKillSwitch: () => {},
}));

// Capture bridge mocked so stop() resolves synchronously with fake timers.
const mockAbort = vi.fn();
const mockStop = vi.fn(() => Promise.resolve({
  sizeBytes: 0, durationMs: 3000, source: 'mock', blob: null,
}));
vi.mock('@/lib/bugReport/captureBridge', () => ({
  startCapture: () => Promise.resolve({ stop: mockStop, abort: mockAbort }),
}));

// Slice 2d — Send button now calls sendBugReport. Mock resolves with a
// ticket id by default; tests that need to hit the error branch
// re-mock inline.
const mockSendBugReport = vi.fn(() => Promise.resolve({ report_id: 'test-ticket-123' }));
vi.mock('@/lib/bugReport/uploadClient', () => ({
  sendBugReport: (...args) => mockSendBugReport(...args),
}));

// encrypt.js placeholder key — real value doesn't matter for the flow
// test; sendBugReport is stubbed above and never runs the real crypto.
vi.mock('@/lib/bugReport/encrypt', () => ({
  PLACEHOLDER_SUPPORT_PUBLIC_KEY: new Uint8Array(32),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios' },
}));

let BugReportFlow;

beforeEach(async () => {
  mockAbort.mockReset();
  mockStop.mockReset().mockImplementation(() => Promise.resolve({
    // Slice 2d: return a real blob so onSend's NO_CAPTURE guard doesn't fire.
    sizeBytes: 12, durationMs: 3000, source: 'replaykit',
    blob: new Uint8Array([1, 2, 3, 4]),
  }));
  mockSendBugReport.mockReset().mockResolvedValue({ report_id: 'test-ticket-123' });
  vi.stubGlobal('crypto', {
    ...globalThis.crypto,
    randomUUID: () => 'fixed-device-uuid-for-tests',
  });
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.resetModules();
  BugReportFlow = (await import('../BugReportFlow')).default;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

// Helper: advance timers AND flush microtasks so awaited promises resolve.
async function advance(ms) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    // Flush pending microtasks — capture-bridge Promise resolutions and
    // useState updates chained off them settle here.
    await Promise.resolve();
    await Promise.resolve();
  });
}

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
  it('continue advances to countdown, then to recording after 3s', async () => {
    render(<BugReportFlow open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('bug-report-continue'));
    expect(screen.getByTestId('bug-report-countdown')).toBeInTheDocument();
    await advance(3000);
    expect(screen.getByTestId('bug-report-recording')).toBeInTheDocument();
    expect(screen.getByTestId('bug-report-stop')).toBeInTheDocument();
  });

  it('stop from recording transitions to review (NOT close)', async () => {
    const onClose = vi.fn();
    render(<BugReportFlow open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('bug-report-continue'));
    await advance(3000);
    await act(async () => {
      fireEvent.click(screen.getByTestId('bug-report-stop'));
      await Promise.resolve();
      await Promise.resolve();
    });
    // Mutation defence: if stop calls close() directly (the pre-1d
    // behaviour), the review screen never appears and onClose fires early.
    expect(screen.getByTestId('bug-report-review')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('BugReportFlow — review', () => {
  it('shows Send and Delete buttons after stop', async () => {
    render(<BugReportFlow open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('bug-report-continue'));
    await advance(3000);
    await act(async () => {
      fireEvent.click(screen.getByTestId('bug-report-stop'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('bug-report-send')).toBeInTheDocument();
    expect(screen.getByTestId('bug-report-delete')).toBeInTheDocument();
  });

  it('Delete closes without sending', async () => {
    const onClose = vi.fn();
    render(<BugReportFlow open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('bug-report-continue'));
    await advance(3000);
    await act(async () => {
      fireEvent.click(screen.getByTestId('bug-report-stop'));
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByTestId('bug-report-delete'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockSendBugReport).not.toHaveBeenCalled();
  });
});

describe('BugReportFlow — Send (slice 2d)', () => {
  async function walkToReview() {
    render(<BugReportFlow open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('bug-report-continue'));
    await advance(3000);
    await act(async () => {
      fireEvent.click(screen.getByTestId('bug-report-stop'));
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('Send transitions to sending → sent with ticket id displayed', async () => {
    await walkToReview();
    await act(async () => {
      fireEvent.click(screen.getByTestId('bug-report-send'));
      // Let the promise chain settle: sending render, then sent render.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('bug-report-sent')).toBeInTheDocument();
    expect(screen.getByText(/test-ticket-123/)).toBeInTheDocument();
    expect(mockSendBugReport).toHaveBeenCalledTimes(1);
    // Contract with slice 1e-4: expected argument shape.
    const args = mockSendBugReport.mock.calls[0][0];
    expect(args.captureBuffer).toBeInstanceOf(Uint8Array);
    expect(args.deviceId).toBe('fixed-device-uuid-for-tests');
    expect(args.platform).toBe('ios');
    expect(args.supportPublicKey).toBeInstanceOf(Uint8Array);
    expect(args.supportPublicKey.length).toBe(32);
  });

  it('Send failure transitions to error with the message shown', async () => {
    mockSendBugReport.mockRejectedValueOnce(new Error('BUG_REPORT_ENCRYPT_PLACEHOLDER_KEY'));
    await walkToReview();
    await act(async () => {
      fireEvent.click(screen.getByTestId('bug-report-send'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('bug-report-error')).toBeInTheDocument();
    expect(screen.getByText(/PLACEHOLDER_KEY/)).toBeInTheDocument();
    // Onclose should NOT have fired on error — user gets to see the
    // message and dismiss themselves.
  });

  it('Done from sent invokes onClose', async () => {
    const onClose = vi.fn();
    render(<BugReportFlow open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('bug-report-continue'));
    await advance(3000);
    await act(async () => {
      fireEvent.click(screen.getByTestId('bug-report-stop'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('bug-report-send'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByTestId('bug-report-done'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('BugReportFlow — 30s hard cap (I2)', () => {
  it('auto-transitions to review when recording reaches 30 seconds', async () => {
    render(<BugReportFlow open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('bug-report-continue'));
    await advance(3000);
    expect(screen.getByTestId('bug-report-recording')).toBeInTheDocument();

    // Mutation defence: if the 30s cap is removed OR compared with > instead
    // of >=, the flow persists in recording and never reaches review.
    await advance(30_000);
    expect(screen.getByTestId('bug-report-review')).toBeInTheDocument();
  });
});

describe('BugReportFlow — visibilitychange kill switch', () => {
  it('aborts recording when the document goes hidden', async () => {
    const onClose = vi.fn();
    render(<BugReportFlow open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('bug-report-continue'));
    await advance(3000);
    expect(screen.getByTestId('bug-report-recording')).toBeInTheDocument();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true, get: () => 'hidden',
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT abort explainer or countdown on visibility hidden', () => {
    const onClose = vi.fn();
    render(<BugReportFlow open onClose={onClose} />);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true, get: () => 'hidden',
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('bug-report-explainer')).toBeInTheDocument();
  });
});

describe('BugReportFlow — capture handle abort on close (I2)', () => {
  it('aborts the live capture handle when close fires mid-recording', async () => {
    render(<BugReportFlow open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('bug-report-continue'));
    await advance(3000);
    // Wait one more tick for startCapture promise to store handle in ref.
    await advance(0);

    // Now trigger a close via the visibility kill switch (real code path).
    Object.defineProperty(document, 'visibilityState', {
      configurable: true, get: () => 'hidden',
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));

    // Mutation defence: if close() forgets to invoke handle.abort(), the
    // recording buffer survives — a fundamental "nothing leaves without
    // Send" break the moment slice 1e wires a real buffer.
    expect(mockAbort).toHaveBeenCalledTimes(1);
  });
});

describe('BugReportFlow — state resets between opens', () => {
  it('reopens onto explainer after a prior close from recording', async () => {
    const { rerender } = render(<BugReportFlow open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('bug-report-continue'));
    await advance(3000);
    expect(screen.getByTestId('bug-report-recording')).toBeInTheDocument();

    rerender(<BugReportFlow open={false} onClose={() => {}} />);
    rerender(<BugReportFlow open onClose={() => {}} />);

    // Without the reset-on-open effect, the flow reopens straight into
    // recording — no consent, no countdown, straight to capture. Exactly
    // the silent-capture bug I2/I4 exist to prevent.
    expect(screen.getByTestId('bug-report-explainer')).toBeInTheDocument();
    expect(screen.queryByTestId('bug-report-recording')).toBeNull();
  });
});
