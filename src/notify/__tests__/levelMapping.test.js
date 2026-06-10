// src/notify/__tests__/levelMapping.test.js
//
// Build brief §4 note ("Mirror the score's level->token mapping") + §5 (level
// priority RISK > CAUTION > INFO). A risk notification must inherit the risk
// module's level so the design-system token color is consistent across surfaces.
// Critically, INDETERMINATE escalates to CAUTION — mirroring score.js's
// fail-closed reportLevel (an un-evaluable check can never read as "safe").

import { describe, it, expect } from 'vitest';
import { buildNotification, EVENT, NOTIFY_LEVEL } from '../notify.js';
import { LEVEL } from '../../risk/levels.js';

const fromRisk = (level) =>
  buildNotification({ type: EVENT.RISK_FIRED, ts: 1, score: { level, sentence: 's' } }).level;

describe('RISK_FIRED inherits the risk module level -> display token (§4)', () => {
  it('CAUTION -> caution', () => {
    expect(fromRisk(LEVEL.CAUTION)).toBe(NOTIFY_LEVEL.CAUTION);
  });

  it('RISK -> risk', () => {
    expect(fromRisk(LEVEL.RISK)).toBe(NOTIFY_LEVEL.RISK);
  });

  it('INDETERMINATE escalates to caution (fail-closed, mirrors score.js reportLevel)', () => {
    expect(fromRisk(LEVEL.INDETERMINATE)).toBe(NOTIFY_LEVEL.CAUTION);
  });

  it('INFO / OK map to info (defensive; the emitter only emits at >= CAUTION)', () => {
    expect(fromRisk(LEVEL.INFO)).toBe(NOTIFY_LEVEL.INFO);
    expect(fromRisk(LEVEL.OK)).toBe(NOTIFY_LEVEL.INFO);
  });
});
