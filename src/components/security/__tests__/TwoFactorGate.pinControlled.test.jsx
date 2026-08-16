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
    // Codex P3 2026-08-15: the dot row no longer exposes a status /
    // digit-count aria-label (side channel — see PinPad.jsx). Detect
    // controlled wiring by counting filled dots (bg-primary is the fill
    // class). If onChange is missing, the click throws inside PinPad
    // instead of advancing the count.
    const { container } = render(<TwoFactorGate verify={vi.fn()} onSuccess={vi.fn()} />);
    const filled = () => container.querySelectorAll('span.bg-primary').length;

    expect(filled()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    expect(filled()).toBe(1);
  });
});
