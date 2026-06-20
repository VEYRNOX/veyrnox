// src/notify/__tests__/sources.test.js
//
// Build brief PR-2 §3 (the send live edit) + §7 (fail-closed is THE load-bearing
// test of this PR: the emit at the call site must be provably a side-effect — a
// throw there can never propagate into or unwind the send path) + §8/§9 (receive
// and risk remain HONEST-DISABLED in PR-2 — no source wired).
//
// sources.js is the call-site adapter the send flow (SendCrypto, post-broadcast
// 1-conf receipt) calls. These tests pin: (1) the correct event fires with the
// right payload on the real trigger, (2) no hostile/broken subscriber can make
// the call site throw, and (3) the module wires ONLY send — receive/risk are not
// smuggled in without a real source.

import { describe, it, expect, beforeEach } from 'vitest';
import * as events from '../events.js';
import * as sources from './../sources.js';
import { buildNotification, EVENT, NOTIFY_LEVEL } from '../notify.js';

let unsubs = [];
const track = (u) => {
  unsubs.push(u);
  return u;
};
beforeEach(() => {
  unsubs.forEach((u) => u());
  unsubs = [];
});

describe('notify/sources.js — send call-site adapter (PR-2 §3)', () => {
  it('notifySendConfirmed fires SEND_CONFIRMED with the caller payload + ts', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));

    const ok = sources.notifySendConfirmed({ amount: '0.5 ETH', to: '0xabc123', ts: 42 });

    expect(ok).toBe(true);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({
      type: EVENT.SEND_CONFIRMED,
      amount: '0.5 ETH',
      to: '0xabc123',
      ts: 42,
    });
  });

  it('the emitted event maps to the expected notification (info, "Send confirmed")', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    sources.notifySendConfirmed({ amount: '1.25 ETH', to: '0xdeadbeef', ts: 7 });

    const n = buildNotification(got[0]);
    expect(n.level).toBe(NOTIFY_LEVEL.INFO);
    expect(n.message).toBe('Send confirmed');
    expect(n.evidence).toEqual({ amount: '1.25 ETH', to: '0xdeadbeef' });
    expect(n.ts).toBe(7);
  });

  // §7: the highest-value test in PR-2 — the emit must be provably a side-effect.
  it('a throwing subscriber NEVER makes the call site throw (I4 fail-closed)', () => {
    track(events.subscribe(() => { throw new Error('subscriber blew up'); }));
    // A second subscriber that maps a (valid) event still receives — delivery to
    // others is not broken by the hostile one.
    const got = [];
    track(events.subscribe((e) => got.push(e)));

    expect(() =>
      sources.notifySendConfirmed({ amount: '0.5 ETH', to: '0xabc', ts: 1 })
    ).not.toThrow();
    expect(got).toHaveLength(1);
  });

  it('even an all-hostile subscriber set cannot unwind the send (returns, no throw)', () => {
    track(events.subscribe(() => { throw new Error('nope'); }));
    track(events.subscribe(() => { throw new Error('also nope'); }));
    // The send path calls and moves on regardless of the return value.
    expect(() =>
      sources.notifySendConfirmed({ amount: '2 ETH', to: '0xfeed', ts: 9 })
    ).not.toThrow();
  });

  // All three sources are now wired (RECEIVE + RISK enabled post-PR-2):
  // notifyReceiveDetected — portfolio poll delta (WalletPortfolioPage, canManage gate, I3)
  // notifyTxRiskAlert    — scoreCurrentSend() verdict at sign time (SendCrypto, I4)
  // notifyRaspAlert / notifyFraudAlert — RASP/fraud scan (WARN/BLOCK + critical/high only)
  it('exposes send, receive, and risk adapters — all real sources now wired', () => {
    const exported = Object.keys(sources);
    expect(exported).toContain('notifySendConfirmed');
    expect(exported).toContain('notifyReceiveDetected');
    expect(exported).toContain('notifyTxRiskAlert');
    expect(exported).toContain('notifyRaspAlert');
    expect(exported).toContain('notifyFraudAlert');
  });

  it('notifyReceiveDetected is fire-and-forget (I4: returns bool, never throws)', () => {
    expect(() => sources.notifyReceiveDetected({ amount: '+$1.50', ts: 1 })).not.toThrow();
    expect(sources.notifyReceiveDetected({ amount: '', ts: 1 })).toBe(false);
  });

  it('notifyTxRiskAlert is fire-and-forget (I4: returns bool, never throws)', () => {
    expect(() => sources.notifyTxRiskAlert({ level: 'CAUTION', sentence: 'New address', signalId: null, ts: 1 })).not.toThrow();
    expect(sources.notifyTxRiskAlert({ level: 'OK', sentence: null, signalId: null, ts: 1 })).toBe(false);
    expect(sources.notifyTxRiskAlert({ level: 'INFO', sentence: null, signalId: null, ts: 1 })).toBe(false);
  });
});
