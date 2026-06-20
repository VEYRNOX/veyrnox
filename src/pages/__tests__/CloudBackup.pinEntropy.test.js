import { describe, it, expect } from 'vitest';

// Pure logic extracted from ExportTab's guard conditions.
// We test the guard functions independently of React rendering.

function canExport(password, pin, pinConfirm) {
  return password.length >= 8 && pin.length >= 6 && pin === pinConfirm;
}

function showPinWarning(pin) {
  return pin.length >= 6 && pin.length < 8;
}

describe('CloudBackup export guard (VULN-6 floor)', () => {
  it('rejects a 4-digit PIN (old minimum)', () => {
    expect(canExport('strongpass1', '1234', '1234')).toBe(false);
  });

  it('rejects a 5-digit PIN', () => {
    expect(canExport('strongpass1', '12345', '12345')).toBe(false);
  });

  it('allows a 6-digit PIN with matching confirm', () => {
    expect(canExport('strongpass1', '123456', '123456')).toBe(true);
  });

  it('rejects when PIN and confirm do not match', () => {
    expect(canExport('strongpass1', '123456', '654321')).toBe(false);
  });

  it('rejects when backup password is shorter than 8 chars', () => {
    expect(canExport('short', '123456', '123456')).toBe(false);
  });

  it('shows PIN entropy warning for 6–7 digit PINs', () => {
    expect(showPinWarning('123456')).toBe(true);
    expect(showPinWarning('1234567')).toBe(true);
  });

  it('does NOT show warning for 8+ digit PINs', () => {
    expect(showPinWarning('12345678')).toBe(false);
  });

  it('does NOT show warning when PIN is shorter than 6 (field not yet complete)', () => {
    expect(showPinWarning('12345')).toBe(false);
  });
});
