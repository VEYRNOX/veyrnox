// src/components/security/__tests__/TwoFactorGate.sendError.test.jsx
//
// M-4 (2026-07-08 S1-S4 audit) — Path B: downstream send failure after 2FA success.
//
// When the broadcast RPC fails AFTER the user completed 2FA, the parent
// (SendCrypto) can no longer show the TwoFactorGate via step state — it is
// already rendered. The gate must accept a `sendError` prop and display a
// persistent in-card banner so the user knows WHY the gate re-appeared and
// can re-submit without confusion.
//
// RED first (strict TDD): these tests FAIL before the `sendError` prop is
// added to TwoFactorGate.jsx.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import TwoFactorGate from '@/components/security/TwoFactorGate';

vi.mock('@/lib/authModel', () => ({ getAuthModel: () => 'password' }));

afterEach(cleanup);

describe('TwoFactorGate — M-4 sendError prop (downstream broadcast failure)', () => {
  const baseProps = {
    mode: 'password',
    verify: vi.fn(),
    onSuccess: vi.fn(),
  };

  it('RED: renders a persistent in-card error banner when sendError is set', () => {
    const err = new Error('RPC request failed: connection refused');
    render(<TwoFactorGate {...baseProps} sendError={err} />);
    // Must render an alert/banner — not a transient toast — so the user sees WHY
    // the gate re-appeared after their successful 2FA.
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/send failed|try again|could not send/i);
  });

  it('RED: does not render a send-error banner when sendError is null/undefined', () => {
    render(<TwoFactorGate {...baseProps} sendError={null} />);
    // No alert should appear when there is no error.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('RED: send-error banner is independent of the network-error state (two distinct banners)', () => {
    // sendError comes from the parent (broadcast failure); isNetworkError is internal
    // (verify() threw). Both can coexist. Only sendError is tested here.
    const err = new Error('timeout waiting for transaction');
    render(<TwoFactorGate {...baseProps} sendError={err} />);
    const alert = screen.getByRole('alert');
    // The send-error banner should mention the outcome, not verification failure.
    expect(alert.textContent).not.toMatch(/verification service/i);
  });
});
