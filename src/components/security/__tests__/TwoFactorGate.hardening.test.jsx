// src/components/security/__tests__/TwoFactorGate.hardening.test.jsx
//
// QA hardening for TwoFactorGate:
//   #2 whitespace/empty must not burn an attempt: with a whitespace-only PIN +
//      whitespace-only Action Password, submit must be blocked (canSubmit=false) so
//      verify() never runs and no attempt is consumed. This does NOT bypass the gate
//      (real input still required) — it just stops an accidental self-lock.
//   #4 a11y: the attempt-error <p> is role="alert"/aria-live, and the external-factor
//      helper text is associated with the submit via aria-describedby.
//
// Password-model path (getAuthModel !== 'pin') so we can type into the PIN <input>.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TwoFactorGate from '@/components/security/TwoFactorGate';

vi.mock('@/lib/authModel', () => ({ getAuthModel: () => 'password' }));

afterEach(cleanup);

describe('TwoFactorGate — #2 whitespace cannot burn an attempt', () => {
  it('whitespace-only PIN + whitespace-only Action Password keeps submit disabled and never calls verify', () => {
    const verify = vi.fn(async () => ({ allowed: false, message: 'Incorrect.' }));
    render(<TwoFactorGate mode="password" verify={verify} onSuccess={vi.fn()} />);

    const pin = screen.getByLabelText(/vault password/i);
    fireEvent.change(pin, { target: { value: '   ' } });
    const ap = screen.getByLabelText(/^action password$/i);
    fireEvent.change(ap, { target: { value: '   ' } });

    const submitBtn = screen.getByRole('button', { name: /verify & continue/i });
    expect(submitBtn.disabled).toBe(true);

    // Even if a click is forced through, verify must not have been called.
    fireEvent.click(submitBtn);
    expect(verify).not.toHaveBeenCalled();
  });

  it('non-blank PIN + non-blank Action Password enables submit (control)', () => {
    const verify = vi.fn(async () => ({ allowed: true, message: null }));
    render(<TwoFactorGate mode="password" verify={verify} onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/vault password/i), { target: { value: '12345678' } });
    fireEvent.change(screen.getByLabelText(/^action password$/i), { target: { value: 'ap-secret' } });
    expect(screen.getByRole('button', { name: /verify & continue/i }).disabled).toBe(false);
  });
});

describe('TwoFactorGate — #4 a11y', () => {
  it('the attempt error is announced (role="alert" + aria-live)', async () => {
    const verify = vi.fn(async () => ({ allowed: false, message: 'Incorrect PIN or Action Password.' }));
    render(<TwoFactorGate mode="password" verify={verify} onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/vault password/i), { target: { value: '12345678' } });
    fireEvent.change(screen.getByLabelText(/^action password$/i), { target: { value: 'ap-secret' } });
    fireEvent.click(screen.getByRole('button', { name: /verify & continue/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert.getAttribute('aria-live')).toBe('polite');
    expect(alert.textContent).toMatch(/left/i);
  });

  it('external-factor (passkey) helper text is associated with the submit via aria-describedby', () => {
    render(<TwoFactorGate mode="passkey" verify={vi.fn()} onSuccess={vi.fn()} />);
    const submitBtn = screen.getByRole('button', { name: /verify with passkey/i });
    const describedBy = submitBtn.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    // The referenced element must exist in the DOM.
    expect(document.getElementById(describedBy)).toBeTruthy();
  });
});
