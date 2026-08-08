// src/api/__tests__/tipClient.unknownVerdict.test.js
//
// Tests for the 'unknown' verdict added by #1615.
//
// 'unknown' means no threat source could screen the address — all skipped or
// errored. The whole point of the change is that absent data must NOT read as
// benign: it maps to a CAUTION level and requires a positive acknowledgment,
// exactly like a real warning.
//
// This is the same class as M-4 (an unvalidated response reading as "no
// threat") and as the L-8/OUTCOME_PREAMBLE lessons: an I4 guarantee that is not
// pinned by a test is a guarantee that quietly stops holding. `unknown` is one
// `case` label away from falling through to 'info' and rendering a green CLEAR
// tick over an address nobody actually screened.
//
// MUTATION RESULT, recorded honestly rather than claimed:
//   - removing `case 'unknown': return 'medium'` does NOT turn these red,
//     because the M-4 `default: return 'medium'` already covers it. That case
//     label is documentation, not behaviour. Worth knowing before someone
//     deletes it as dead code — or, worse, "simplifies" the default while
//     assuming the explicit case still guards 'unknown'.
//   - removing 'unknown' from requiresAcknowledgment DOES turn one red. That
//     is the only genuinely new behaviour in #1615's tipClient change.
//
// The assertions below therefore pin the OBSERVABLE guarantee ('unknown' is
// cautionary and must be acknowledged) rather than the implementation path
// that currently delivers it — which is the right level, since either route
// satisfies I4 and the default is separately pinned below.
//
// Pure functions, no mocks needed.

import { describe, it, expect } from 'vitest';
import { verdictToRiskLevel, requiresAcknowledgment } from '@/api/tipClient.js';

describe("verdictToRiskLevel — 'unknown' is cautionary, never benign", () => {
  it("maps 'unknown' to medium, not info", () => {
    // The bug this guards: falling through to the 'info' default would render
    // an emerald CLEAR badge for an address no source was able to check.
    expect(verdictToRiskLevel('unknown')).toBe('medium');
  });

  it("never maps 'unknown' to the same level as a clean allow", () => {
    expect(verdictToRiskLevel('unknown')).not.toBe(verdictToRiskLevel('allow'));
  });

  it('keeps the established verdicts unchanged', () => {
    expect(verdictToRiskLevel('block')).toBe('high');
    expect(verdictToRiskLevel('warn')).toBe('medium');
    expect(verdictToRiskLevel('allow')).toBe('info');
  });

  it('still treats an unrecognised verdict as cautionary (M-4)', () => {
    // Both defaults are cautionary — adding 'unknown' must not have reopened
    // the M-4 hole for values this build predates.
    for (const v of ['renamed_by_backend', '', null, undefined, 42, {}]) {
      expect(verdictToRiskLevel(v)).not.toBe('info');
    }
  });
});

describe("requiresAcknowledgment — 'unknown' must be acknowledged", () => {
  it("requires an ack for 'unknown'", () => {
    // A user must positively acknowledge that TIP could NOT screen the address
    // before proceeding — silence here is the failure mode the change exists
    // to remove.
    expect(requiresAcknowledgment('unknown')).toBe(true);
  });

  it('still requires an ack for block and warn', () => {
    expect(requiresAcknowledgment('block')).toBe(true);
    expect(requiresAcknowledgment('warn')).toBe(true);
  });

  it('does not require an ack for a genuine allow', () => {
    // The other direction: if everything demanded an ack the prompt would be
    // noise and users would click through it, which is how a real warning
    // stops working.
    expect(requiresAcknowledgment('allow')).toBe(false);
  });
});
