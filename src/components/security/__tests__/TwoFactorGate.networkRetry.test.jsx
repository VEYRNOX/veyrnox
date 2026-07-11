// src/components/security/__tests__/TwoFactorGate.networkRetry.test.jsx
//
// Regression tests for M-4 (2026-07-08 S1-S4 audit):
//   After a 2FA network failure (verify() throws), the component must:
//   1. Show a descriptive error message.
//   2. Render a "Try again" button.
//   3. NOT increment the attempt counter (network failures must not burn a cap slot).
//   4. NOT clear the PIN/password fields so the user can retry without re-typing.
//   5. On "Try again" click, clear the error and re-invoke verify() (the full gate — no bypass).
//
// Uses password-model path (getAuthModel !== 'pin') so we can inspect <input> fields.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import TwoFactorGate from '@/components/security/TwoFactorGate';

vi.mock('@/lib/authModel', () => ({ getAuthModel: () => 'password' }));

afterEach(cleanup);

describe('TwoFactorGate — M-4 network-failure retry affordance', () => {
  async function fillAndSubmit() {
    const pinInput = screen.getByLabelText(/vault password/i);
    const apInput = screen.getByLabelText(/^action password$/i);
    fireEvent.change(pinInput, { target: { value: 'mypin' } });
    fireEvent.change(apInput, { target: { value: 'mypassword' } });
    const submitBtn = screen.getByRole('button', { name: /verify & continue/i });
    fireEvent.click(submitBtn);
  }

  it('shows an error message when verify() throws', async () => {
    const verify = vi.fn().mockRejectedValue(new Error('Network timeout'));
    render(<TwoFactorGate mode="password" verify={verify} onSuccess={vi.fn()} />);
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(screen.getByRole('alert').textContent).toMatch(/connection|service|try again/i);
  });

  it('renders a "Try again" button on network failure', async () => {
    const verify = vi.fn().mockRejectedValue(new Error('Network timeout'));
    render(<TwoFactorGate mode="password" verify={verify} onSuccess={vi.fn()} />);
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
    });
  });

  it('does not render "Try again" on a wrong-credential failure (only on throws)', async () => {
    const verify = vi.fn().mockResolvedValue({ allowed: false, message: 'Incorrect.' });
    render(<TwoFactorGate mode="password" verify={verify} onSuccess={vi.fn()} />);
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('does not increment the attempt counter on network failure', async () => {
    // After ATTEMPT_CAP wrong-credential failures, onLock is called.
    // A network failure must not contribute to that count — we verify by
    // exhausting the remaining cap with wrong-credential responses after
    // one network failure, confirming onLock fires after exactly ATTEMPT_CAP
    // real wrong-credential attempts.
    const onLock = vi.fn();
    let callCount = 0;
    const verify = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('Network timeout');
      return { allowed: false, message: 'Incorrect.' };
    });
    render(<TwoFactorGate mode="password" verify={verify} onSuccess={vi.fn()} onLock={onLock} />);

    // First call: network failure — should NOT burn an attempt.
    await fillAndSubmit();
    await waitFor(() => screen.getByRole('button', { name: /try again/i }));
    expect(onLock).not.toHaveBeenCalled();

    // Now exhaust ATTEMPT_CAP (5) wrong-credential failures via the submit button.
    // Because the first call did not burn an attempt, we need exactly 5 more to lock.
    for (let i = 0; i < 5; i++) {
      const pinInput = screen.getByLabelText(/vault password/i);
      const apInput = screen.getByLabelText(/^action password$/i);
      fireEvent.change(pinInput, { target: { value: 'wrong' } });
      fireEvent.change(apInput, { target: { value: 'wrong' } });
      fireEvent.click(screen.getByRole('button', { name: /verify & continue/i }));
      await waitFor(() => expect(verify).toHaveBeenCalledTimes(i + 2));
    }
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('re-invokes verify() when "Try again" is clicked — does not skip the gate', async () => {
    let callCount = 0;
    const verify = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('Network timeout');
      // Second call succeeds.
      return { allowed: true };
    });
    const onSuccess = vi.fn();
    render(<TwoFactorGate mode="password" verify={verify} onSuccess={onSuccess} />);

    await fillAndSubmit();
    await waitFor(() => screen.getByRole('button', { name: /try again/i }));

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    // verify() must have been called twice — once failing, once succeeding.
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it('clears the error and "Try again" button on a successful retry', async () => {
    let callCount = 0;
    const verify = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('Network timeout');
      return { allowed: true };
    });
    render(<TwoFactorGate mode="password" verify={verify} onSuccess={vi.fn()} />);

    await fillAndSubmit();
    await waitFor(() => screen.getByRole('button', { name: /try again/i }));

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });
});
