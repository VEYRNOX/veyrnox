// src/risk/signals/__tests__/s9-tip-threat.unknown.test.js
//
// Audit 2026-08-03 M-4, second layer.
//
// tipScreen.js now validates the response shape, so an unrecognised verdict
// should never reach S9. This file pins the behaviour anyway, because S9 is
// reachable from anywhere that populates chainData.tipResult and "the caller
// already validated it" is exactly the assumption H-6 was about: a contract
// nobody is obliged to honour is not a control.
//
// The rule: only an explicit 'allow' is OK. Everything else the signal does not
// recognise is CAUTION, never a silent pass.
//
// `tipResult` absent stays OK — that is the feature being off (opt-out,
// deniability, unconfigured), not a failed screening. The send gate is what
// guarantees an in-flight screening is never scored as absent (H-1).

import { describe, it, expect } from 'vitest';
import { s9TipThreat } from '../s9-tip-threat.js';
import { LEVEL } from '../../levels.js';

const run = (tipResult) => s9TipThreat({}, {}, { tipResult });

describe('s9TipThreat — unrecognised verdicts are not a silent pass (M-4)', () => {
  it('an explicit allow is OK', () => {
    expect(run({ verdict: 'allow', signals: [] }).level).toBe(LEVEL.OK);
  });

  it('an unrecognised verdict string is CAUTION, not OK', () => {
    expect(run({ verdict: 'probably_fine', signals: [] }).level).toBe(LEVEL.CAUTION);
  });

  it('a missing verdict is CAUTION', () => {
    expect(run({ signals: [] }).level).toBe(LEVEL.CAUTION);
  });

  it('a non-string verdict is CAUTION', () => {
    expect(run({ verdict: 7, signals: [] }).level).toBe(LEVEL.CAUTION);
    expect(run({ verdict: null, signals: [] }).level).toBe(LEVEL.CAUTION);
  });

  it('sanctions still dominate regardless of verdict', () => {
    expect(run({ verdict: 'allow', sanctions: true, signals: [] }).level).toBe(LEVEL.RISK);
  });

  it('block and warn are unchanged', () => {
    expect(run({ verdict: 'block', signals: [] }).level).toBe(LEVEL.RISK);
    expect(run({ verdict: 'warn', signals: [] }).level).toBe(LEVEL.CAUTION);
  });

  it('error remains CAUTION', () => {
    expect(run({ verdict: 'error', signals: [] }).level).toBe(LEVEL.CAUTION);
  });

  it('an ABSENT tipResult stays OK — that is the feature being off, not a failure', () => {
    expect(run(null).level).toBe(LEVEL.OK);
    expect(run(undefined).level).toBe(LEVEL.OK);
  });
});
