// Tests for the pure PIN + Action Password two-factor gate decision.
import { describe, it, expect } from 'vitest';
import { evaluateTwoFactor, TWO_FACTOR } from '@/lib/twoFactorGate';

describe('evaluateTwoFactor — the PIN + Action Password critical-action gate', () => {
  it('allows ONLY when both the PIN and the Action Password verify', () => {
    expect(evaluateTwoFactor({ pinOk: true, passwordOk: true })).toEqual({
      allowed: true,
      code: TWO_FACTOR.ALLOW,
      message: null,
    });
  });

  it('blocks when the PIN is wrong (password right)', () => {
    const r = evaluateTwoFactor({ pinOk: false, passwordOk: true });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe(TWO_FACTOR.PIN_WRONG);
  });

  it('blocks when the Action Password is wrong (PIN right)', () => {
    const r = evaluateTwoFactor({ pinOk: true, passwordOk: false });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe(TWO_FACTOR.PASSWORD_WRONG);
  });

  it('blocks with BOTH_WRONG when neither verifies — without hinting which was closer', () => {
    const r = evaluateTwoFactor({ pinOk: false, passwordOk: false });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe(TWO_FACTOR.BOTH_WRONG);
  });

  it('FAILS CLOSED: a missing/undefined factor result counts as NOT verified', () => {
    expect(evaluateTwoFactor({}).allowed).toBe(false); // both missing
    expect(evaluateTwoFactor({ pinOk: true }).allowed).toBe(false); // password missing
    expect(evaluateTwoFactor({ passwordOk: true }).allowed).toBe(false); // pin missing
    expect(evaluateTwoFactor(undefined).allowed).toBe(false); // no args at all
  });

  it('blocks with NOT_CONFIGURED when the active set has no Action Password — even if both inputs are "ok"', () => {
    const r = evaluateTwoFactor({ pinOk: true, passwordOk: true, actionPasswordConfigured: false });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe(TWO_FACTOR.NOT_CONFIGURED);
  });

  it('NOT_CONFIGURED takes precedence over a wrong factor (nothing to enforce yet)', () => {
    const r = evaluateTwoFactor({ pinOk: false, passwordOk: false, actionPasswordConfigured: false });
    expect(r.code).toBe(TWO_FACTOR.NOT_CONFIGURED);
  });

  it('every blocked verdict carries a non-empty user-facing message; ALLOW carries null', () => {
    expect(evaluateTwoFactor({ pinOk: true, passwordOk: true }).message).toBeNull();
    const blocked = [
      { pinOk: false, passwordOk: true },
      { pinOk: true, passwordOk: false },
      { pinOk: false, passwordOk: false },
      { pinOk: true, passwordOk: true, actionPasswordConfigured: false },
    ];
    for (const inp of blocked) {
      const m = evaluateTwoFactor(inp).message;
      expect(typeof m).toBe('string');
      expect(m.length).toBeGreaterThan(0);
    }
  });

  it('is a pure function of its inputs (no hidden state across calls)', () => {
    const a = evaluateTwoFactor({ pinOk: true, passwordOk: true });
    const b = evaluateTwoFactor({ pinOk: true, passwordOk: true });
    expect(a).toEqual(b);
    // a wrong call in between does not poison a subsequent good call
    evaluateTwoFactor({ pinOk: false, passwordOk: false });
    expect(evaluateTwoFactor({ pinOk: true, passwordOk: true }).allowed).toBe(true);
  });
});
