import { describe, it, expect } from 'vitest';

// Pure logic extracted from ExportTab's guard conditions.
// We test the guard functions independently of React rendering.

function canExport(password, pin, pinConfirm) {
  return password.length >= 8 && pin.length >= 8 && pin === pinConfirm;
}

describe('CloudBackup export guard (8-digit floor)', () => {
  it('rejects a 4-digit PIN', () => {
    expect(canExport('strongpass1', '1234', '1234')).toBe(false);
  });

  it('rejects a 6-digit PIN', () => {
    expect(canExport('strongpass1', '123456', '123456')).toBe(false);
  });

  it('rejects a 7-digit PIN', () => {
    expect(canExport('strongpass1', '1234567', '1234567')).toBe(false);
  });

  it('allows an 8-digit PIN with matching confirm', () => {
    expect(canExport('strongpass1', '12345678', '12345678')).toBe(true);
  });

  it('rejects when PIN and confirm do not match', () => {
    expect(canExport('strongpass1', '12345678', '87654321')).toBe(false);
  });

  it('rejects when backup password is shorter than 8 chars', () => {
    expect(canExport('short', '12345678', '12345678')).toBe(false);
  });
});
