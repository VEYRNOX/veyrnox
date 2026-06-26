// src/components/security/__tests__/TwoFactorGate.pinControlled.test.jsx
//
// Regression guard for #370 / #373. The PIN-model 2FA gate renders <PinPad> as a
// CONTROLLED input — value={pin} + onChange={setPin}. PinPad calls onChange(value)
// UNCONDITIONALLY on the first digit (PinPad.jsx) and renders its dots from the
// `value` prop, so a usage missing onChange/value throws "onChange is not a
// function" on first keypress and the dots never fill — a runtime break, not just a
// typecheck miss. This test presses a digit and asserts the entered-digit count
// advances, which can only happen when the controlled wiring is present.
//
// No jest-dom in this repo — core matchers only.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TwoFactorGate from '@/components/security/TwoFactorGate';

// getAuthModel decides PIN-model vs password-model; force the PIN pad path.
vi.mock('@/lib/authModel', () => ({ getAuthModel: () => 'pin' }));

afterEach(cleanup);

describe('TwoFactorGate — PIN-model PinPad is wired as a controlled input', () => {
  it('a digit press advances the entered-digit count (controlled wiring, no crash)', () => {
    render(<TwoFactorGate verify={vi.fn()} onSuccess={vi.fn()} />);

    // The dot row exposes "<n> of 8 digits entered" as its accessible name.
    expect(screen.getByRole('status', { name: /0 of 8 digits entered/i })).toBeTruthy();

    // Pressing "1" must flow onChange -> setPin -> back into PinPad's value prop.
    // Without onChange wired this click would throw inside PinPad instead.
    fireEvent.click(screen.getByRole('button', { name: '1' }));

    expect(screen.getByRole('status', { name: /1 of 8 digits entered/i })).toBeTruthy();
  });
});
