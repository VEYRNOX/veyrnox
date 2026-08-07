// src/components/__tests__/TransactionPreview.revert-degraded.test.jsx
//
// TransactionPreview had NO test file at all, which is why the two states it
// exists to communicate could regress unseen. Both are safety-critical and both
// only became reachable when #1597 restored `willRevert` (it had no assignment
// anywhere in evm/simulate.js, so its branch was dead and a genuine revert was
// reported at `info`):
//
//   willRevert  → "this transaction will FAIL" must be said ONCE, and must be
//                 announced to assistive tech, because it arrives asynchronously
//                 in place of a spinner while the user is deciding whether to sign.
//   degraded    → a check we INTENDED to run did not run, so the
//                 "No known risk patterns detected" summary must not appear —
//                 it would read as a clean bill of health for a transaction
//                 nobody checked.
//
// `degraded` is deliberately distinct from `simulated: false`: BTC and SOL return
// the latter BY DESIGN (decode-only, nothing to dry-run) with their risk
// assessment intact, so gating the summary on `!simulated` would suppress it on
// every BTC/SOL preview. That distinction is pinned below.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TransactionPreview from '@/components/TransactionPreview';

// The summary sentence is split across <span>s ("No <b>known</b> risk patterns
// detected — <b>not</b> a guarantee…"), so getByText/queryByText can never match
// it and every negative assertion written that way passes VACUOUSLY. Read the
// flattened textContent instead, and prove the positive case first so the
// negatives below are known to be capable of failing.
const SUMMARY = /No known risk patterns detected/i;
const hasSummary = (container) => SUMMARY.test(container.textContent.replace(/\s+/g, ' '));
const FAIL_TITLE = /Transaction predicted to FAIL/i;

/** A clean EVM result: dry-run ran, nothing found. */
const clean = (over = {}) => ({
  chain: 'evm',
  simulated: true,
  degraded: false,
  willRevert: false,
  revertReason: null,
  decoded: { kind: 'native' },
  risks: [],
  source: { mode: 'local-rpc', queries: ['eth_getCode', 'eth_getBalance', 'eth_call'], thirdParty: false },
  ...over,
});

describe('TransactionPreview — degraded suppresses the no-known-risks summary', () => {
  it('shows the summary when the dry-run actually ran and found nothing', () => {
    const { container } = render(<TransactionPreview result={clean()} />);
    expect(hasSummary(container)).toBe(true);
  });

  it('withholds the summary when the simulation degraded', () => {
    // The eth_call never answered. We know NOTHING about this transaction, so a
    // reassuring summary here is the same mistake as rendering it after a throw.
    const { container } = render(<TransactionPreview result={clean({
      simulated: false,
      degraded: true,
      risks: [{
        level: 'medium',
        code: 'simulation_unavailable',
        title: 'Transaction simulation unavailable',
        detail: 'Your RPC did not complete the dry-run. Proceeding without an outcome preview.',
      }],
    })} />);

    expect(hasSummary(container)).toBe(false);
    expect(screen.getByText(/Transaction simulation unavailable/i)).toBeTruthy();
  });

  it('still shows the summary for BTC, which is simulated:false BY DESIGN', () => {
    // The guard must key off `degraded`, never `!simulated` — BTC/SOL are
    // decode-only and have nothing to dry-run, yet their risk assessment ran in
    // full. Gating on `!simulated` would silently suppress this.
    const { container } = render(<TransactionPreview result={clean({
      chain: 'btc',
      simulated: false,
      degraded: undefined,      // BTC's simulator does not set the field at all
      willRevert: null,         // nor this one
      decoded: { inputCount: 2, outputCount: 2, totalIn: '0.023' },
    })} />);

    expect(hasSummary(container)).toBe(true);
  });
});

describe('TransactionPreview — a predicted revert is stated once, and announced', () => {
  const reverting = () => clean({
    willRevert: true,
    revertReason: 'ERC20: transfer amount exceeds balance',
    risks: [{
      level: 'high',
      code: 'will_revert',
      title: 'Transaction predicted to FAIL',
      detail: 'Simulated against your RPC, this transaction reverts: ERC20: transfer amount exceeds balance. Signing it would spend gas without doing what you intended.',
    }],
  });

  it('renders the failure heading exactly once', () => {
    // The component has a DEDICATED `result.willRevert` block, and evm/simulate.js
    // ALSO unshifts a level:'high' `will_revert` entry into `risks` — which the
    // generic risk-row list would render again, identically styled. Both paths
    // were unreachable while willRevert was dead, so restoring it surfaced the
    // duplicate for the first time. Doubling a signing warning reads as a bug.
    render(<TransactionPreview result={reverting()} />);
    expect(screen.getAllByText(FAIL_TITLE)).toHaveLength(1);
  });

  it('puts the failure warning in an alert region so it is announced', () => {
    // It replaces a "Simulating against your RPC…" spinner asynchronously, while
    // the user is deciding whether to sign. Without a live region a screen-reader
    // user is never told the transaction is predicted to fail.
    render(<TransactionPreview result={reverting()} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(FAIL_TITLE);
  });

  it('withholds the no-known-risks summary on a predicted revert', () => {
    const { container } = render(<TransactionPreview result={reverting()} />);
    expect(hasSummary(container)).toBe(false);
  });

  it('does not swallow OTHER actionable risks alongside the revert', () => {
    // Only the `will_revert` entry is de-duplicated against the dedicated block.
    // Every other risk must still render — a filter that dropped them would trade
    // one bug for a worse one.
    render(<TransactionPreview result={clean({
      willRevert: true,
      revertReason: 'reverted',
      risks: [
        { level: 'high', code: 'will_revert', title: 'Transaction predicted to FAIL', detail: 'x' },
        { level: 'high', code: 'entire_balance', title: 'Sends almost your entire balance', detail: 'y' },
      ],
    })} />);

    expect(screen.getAllByText(FAIL_TITLE)).toHaveLength(1);
    expect(screen.getByText(/Sends almost your entire balance/i)).toBeTruthy();
  });

  it('never reassures on a will_revert risk, even without the willRevert flag', () => {
    // Guards the de-duplication above. `actionable` has `will_revert` stripped
    // for rendering; if the summary were keyed on `actionable.length` instead of
    // the unfiltered set, this inconsistent-but-possible shape would print
    // "No known risk patterns detected" over a predicted failure — the display
    // filter buying its way into a reassurance.
    const { container } = render(<TransactionPreview result={clean({
      willRevert: false,
      risks: [{ level: 'high', code: 'will_revert', title: 'Transaction predicted to FAIL', detail: 'x' }],
    })} />);

    expect(hasSummary(container)).toBe(false);
  });
});
