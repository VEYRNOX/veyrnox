// Tests for the pure PIN + Action Password two-factor gate decision.
import { describe, it, expect } from 'vitest';
import { evaluateTwoFactor, TWO_FACTOR } from '@/lib/twoFactorGate';

describe('evaluateTwoFactor — the PIN + Action Password critical-action gate', () => {
  it('allows ONLY when both the PIN and the Action Password verify', () => {
    expect(evaluateTwoFactor({ pinOk: true, passwordOk: true, actionPasswordConfigured: true })).toEqual({
      allowed: true,
      code: TWO_FACTOR.ALLOW,
      message: null,
    });
  });

  // M-G (2026-06-28): the default for actionPasswordConfigured is FALSE (fail closed).
  // A caller that omits the argument must NOT be silently treated as "configured" — the
  // gate returns NOT_CONFIGURED rather than proceeding as if a second factor were set.
  it('FAILS CLOSED on the actionPasswordConfigured default: omitting it returns NOT_CONFIGURED', () => {
    const r = evaluateTwoFactor({ pinOk: true, passwordOk: true });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe(TWO_FACTOR.NOT_CONFIGURED);
    expect(evaluateTwoFactor({}).code).toBe(TWO_FACTOR.NOT_CONFIGURED);
    expect(evaluateTwoFactor(undefined).code).toBe(TWO_FACTOR.NOT_CONFIGURED);
  });

  // H4: all wrong-credential permutations return the same opaque WRONG code and
  // the same message — no oracle that reveals which factor was correct.
  it('blocks with WRONG when only PIN is wrong', () => {
    const r = evaluateTwoFactor({ pinOk: false, passwordOk: true, actionPasswordConfigured: true });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe(TWO_FACTOR.WRONG);
  });

  it('blocks with WRONG when only Action Password is wrong', () => {
    const r = evaluateTwoFactor({ pinOk: true, passwordOk: false, actionPasswordConfigured: true });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe(TWO_FACTOR.WRONG);
  });

  it('blocks with WRONG when both factors are wrong', () => {
    const r = evaluateTwoFactor({ pinOk: false, passwordOk: false, actionPasswordConfigured: true });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe(TWO_FACTOR.WRONG);
  });

  it('oracle-prevention: all three wrong-credential cases return identical code and message (H4)', () => {
    const pinOnly  = evaluateTwoFactor({ pinOk: false, passwordOk: true,  actionPasswordConfigured: true });
    const passOnly = evaluateTwoFactor({ pinOk: true,  passwordOk: false, actionPasswordConfigured: true });
    const both     = evaluateTwoFactor({ pinOk: false, passwordOk: false, actionPasswordConfigured: true });
    expect(pinOnly.code).toBe(TWO_FACTOR.WRONG);
    expect(passOnly.code).toBe(TWO_FACTOR.WRONG);
    expect(both.code).toBe(TWO_FACTOR.WRONG);
    expect(pinOnly.message).toBe(passOnly.message);
    expect(passOnly.message).toBe(both.message);
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
    expect(evaluateTwoFactor({ pinOk: true, passwordOk: true, actionPasswordConfigured: true }).message).toBeNull();
    const blocked = [
      { pinOk: false, passwordOk: true, actionPasswordConfigured: true },
      { pinOk: true, passwordOk: false, actionPasswordConfigured: true },
      { pinOk: false, passwordOk: false, actionPasswordConfigured: true },
      { pinOk: true, passwordOk: true, actionPasswordConfigured: false },
    ];
    for (const inp of blocked) {
      const m = evaluateTwoFactor(inp).message;
      expect(typeof m).toBe('string');
      expect(m.length).toBeGreaterThan(0);
    }
  });

  // I3 DENIABILITY PARITY (H2): the gate must behave IDENTICALLY across primary,
  // decoy and hidden sessions. It deliberately has NO isDecoy/isHidden parameter:
  // session type is invisible to it, so a decoy session can never betray itself by
  // skipping the Action-Password prompt. Deniability is enforced upstream by
  // actionPasswordConfigured reading the ACTIVE set's OWN per-set record (each set
  // carries its own second factor). A "bypass in decoy" shortcut would REINTRODUCE
  // the very tell H2 removed — these tests pin that it stays out.
  it('I3: rejects any decoy/hidden bypass flag — extra session-type keys never short-circuit the gate', () => {
    // a not-configured set stays NOT_CONFIGURED no matter what session-type flags are passed
    const decoyish = evaluateTwoFactor({
      pinOk: true, passwordOk: true, actionPasswordConfigured: false,
      isDecoy: true, isHidden: true, bypassed: 'deniability-pin-only',
    });
    expect(decoyish.allowed).toBe(false);
    expect(decoyish.code).toBe(TWO_FACTOR.NOT_CONFIGURED);
    expect(decoyish).not.toHaveProperty('gatePassed');
    expect(decoyish).not.toHaveProperty('bypassed');

    // and a configured set with a wrong factor still blocks WRONG regardless of flags
    const decoyWrong = evaluateTwoFactor({
      pinOk: false, passwordOk: true, actionPasswordConfigured: true,
      isDecoy: true, isHidden: true,
    });
    expect(decoyWrong.allowed).toBe(false);
    expect(decoyWrong.code).toBe(TWO_FACTOR.WRONG);
  });

  it('I3: verdict is byte-identical whether or not isDecoy/isHidden are supplied (no session tell)', () => {
    const plain = evaluateTwoFactor({ pinOk: true, passwordOk: true, actionPasswordConfigured: true });
    const withFlags = evaluateTwoFactor({
      pinOk: true, passwordOk: true, actionPasswordConfigured: true,
      isDecoy: true, isHidden: true,
    });
    expect(withFlags).toEqual(plain);
  });

  it('is a pure function of its inputs (no hidden state across calls)', () => {
    const a = evaluateTwoFactor({ pinOk: true, passwordOk: true, actionPasswordConfigured: true });
    const b = evaluateTwoFactor({ pinOk: true, passwordOk: true, actionPasswordConfigured: true });
    expect(a).toEqual(b);
    // a wrong call in between does not poison a subsequent good call
    evaluateTwoFactor({ pinOk: false, passwordOk: false, actionPasswordConfigured: true });
    expect(evaluateTwoFactor({ pinOk: true, passwordOk: true, actionPasswordConfigured: true }).allowed).toBe(true);
  });
});
