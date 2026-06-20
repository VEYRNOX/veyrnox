// src/notify/__tests__/sources.test.js
//
// Build brief PR-2 §3 (send adapter) + §7 (fail-closed) + PR-275 (tx-risk +
// RASP/fraud adapters). sources.js is the call-site adapter layer: each function
// wraps an events.js push-point in try/catch so the emit is a provable side-effect
// that can never unwind its originating flow (I4). Tests pin: (1) correct event +
// payload fires, (2) no hostile subscriber can make the call site throw, (3) every
// adapter filters its no-op condition before emitting.

import { describe, it, expect, beforeEach } from 'vitest';
import * as events from '../events.js';
import * as sources from './../sources.js';
import { buildNotification, EVENT, NOTIFY_LEVEL } from '../notify.js';
import { LEVEL } from '../../risk/levels.js';

let unsubs = [];
const track = (u) => { unsubs.push(u); return u; };
beforeEach(() => { unsubs.forEach((u) => u()); unsubs = []; });

// ── notifySendConfirmed ───────────────────────────────────────────────────────

describe('notifySendConfirmed', () => {
  it('fires SEND_CONFIRMED with the caller payload + ts', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));

    const ok = sources.notifySendConfirmed({ amount: '0.5 ETH', to: '0xabc123', ts: 42 });

    expect(ok).toBe(true);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ type: EVENT.SEND_CONFIRMED, amount: '0.5 ETH', to: '0xabc123', ts: 42 });
  });

  it('emitted event maps to info / "Send confirmed" notification', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    sources.notifySendConfirmed({ amount: '1.25 ETH', to: '0xdeadbeef', ts: 7 });

    const n = buildNotification(got[0]);
    expect(n.level).toBe(NOTIFY_LEVEL.INFO);
    expect(n.message).toBe('Send confirmed');
    expect(n.evidence).toEqual({ amount: '1.25 ETH', to: '0xdeadbeef' });
    expect(n.ts).toBe(7);
  });

  it('a throwing subscriber NEVER makes the call site throw (I4)', () => {
    track(events.subscribe(() => { throw new Error('hostile'); }));
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    expect(() => sources.notifySendConfirmed({ amount: '0.5 ETH', to: '0xabc', ts: 1 })).not.toThrow();
    expect(got).toHaveLength(1);
  });

  it('all-hostile subscriber set cannot unwind the send', () => {
    track(events.subscribe(() => { throw new Error('nope'); }));
    track(events.subscribe(() => { throw new Error('also nope'); }));
    expect(() => sources.notifySendConfirmed({ amount: '2 ETH', to: '0xfeed', ts: 9 })).not.toThrow();
  });
});

// ── notifyRaspAlert ───────────────────────────────────────────────────────────

describe('notifyRaspAlert', () => {
  it('tier=allow → no-op (returns false, no event)', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    expect(sources.notifyRaspAlert({ tier: 'allow', sentence: 'RASP clean', ts: 1 })).toBe(false);
    expect(got).toHaveLength(0);
  });

  it('null sentence → no-op', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    expect(sources.notifyRaspAlert({ tier: 'block', sentence: null, ts: 1 })).toBe(false);
    expect(got).toHaveLength(0);
  });

  it('warn-before-sign fires RISK_FIRED at CAUTION level', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    sources.notifyRaspAlert({ tier: 'warn-before-sign', sentence: 'Emulator detected.', ts: 5 });
    expect(got).toHaveLength(1);
    expect(got[0].type).toBe(EVENT.RISK_FIRED);
    expect(got[0].score.level).toBe(LEVEL.CAUTION);
  });

  it('block tier fires RISK_FIRED at RISK level', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    sources.notifyRaspAlert({ tier: 'block', sentence: 'Root detected.', ts: 5 });
    expect(got[0].score.level).toBe(LEVEL.RISK);
  });

  it('I4: a throwing subscriber cannot unwind notifyRaspAlert', () => {
    track(events.subscribe(() => { throw new Error('hostile'); }));
    expect(() => sources.notifyRaspAlert({ tier: 'block', sentence: 'Root.', ts: 1 })).not.toThrow();
  });
});

// ── notifyFraudAlert ──────────────────────────────────────────────────────────

describe('notifyFraudAlert', () => {
  it('medium severity → no-op (below threshold)', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    expect(sources.notifyFraudAlert({ sentence: 'Something odd.', severity: 'medium', ts: 1 })).toBe(false);
    expect(got).toHaveLength(0);
  });

  it('low severity → no-op', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    expect(sources.notifyFraudAlert({ sentence: 'Minor.', severity: 'low', ts: 1 })).toBe(false);
    expect(got).toHaveLength(0);
  });

  it('critical severity fires RISK_FIRED at RISK level', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    sources.notifyFraudAlert({ sentence: 'Keylogger found.', severity: 'critical', ts: 10 });
    expect(got).toHaveLength(1);
    expect(got[0].type).toBe(EVENT.RISK_FIRED);
    expect(got[0].score.level).toBe(LEVEL.RISK);
  });

  it('high severity fires RISK_FIRED at CAUTION level', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    sources.notifyFraudAlert({ sentence: 'Screen capture active.', severity: 'high', ts: 10 });
    expect(got[0].score.level).toBe(LEVEL.CAUTION);
  });

  it('empty sentence → no-op regardless of severity', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    expect(sources.notifyFraudAlert({ sentence: '', severity: 'critical', ts: 1 })).toBe(false);
    expect(got).toHaveLength(0);
  });
});

// ── notifyTxRisk (PR-275) ─────────────────────────────────────────────────────

describe('notifyTxRisk', () => {
  it('OK level → no-op (returns false, no event)', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    expect(sources.notifyTxRisk({ level: LEVEL.OK, sentence: 'All clear.', ts: 1 })).toBe(false);
    expect(got).toHaveLength(0);
  });

  it('INFO level → no-op (below notification threshold)', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    expect(sources.notifyTxRisk({ level: LEVEL.INFO, sentence: 'Minor note.', ts: 1 })).toBe(false);
    expect(got).toHaveLength(0);
  });

  it('null sentence → no-op regardless of level', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    expect(sources.notifyTxRisk({ level: LEVEL.CAUTION, sentence: null, ts: 1 })).toBe(false);
    expect(got).toHaveLength(0);
  });

  it('empty sentence → no-op', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    expect(sources.notifyTxRisk({ level: LEVEL.RISK, sentence: '', ts: 1 })).toBe(false);
    expect(got).toHaveLength(0);
  });

  it('CAUTION fires RISK_FIRED with level + sentence preserved', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));

    const ok = sources.notifyTxRisk({ level: LEVEL.CAUTION, sentence: 'First time sending to this recipient.', ts: 99 });

    expect(ok).toBe(true);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({
      type: EVENT.RISK_FIRED,
      ts: 99,
      score: { level: LEVEL.CAUTION, sentence: 'First time sending to this recipient.' },
    });
  });

  it('RISK fires RISK_FIRED at RISK level', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    sources.notifyTxRisk({ level: LEVEL.RISK, sentence: 'Unlimited approval to fresh spender.', ts: 1 });
    expect(got[0].score.level).toBe(LEVEL.RISK);
  });

  it('CAUTION event maps to the expected notification shape', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    sources.notifyTxRisk({ level: LEVEL.CAUTION, sentence: 'First time sending to this recipient.', ts: 50 });

    const n = buildNotification(got[0]);
    expect(n.level).toBe(NOTIFY_LEVEL.CAUTION);
    expect(n.ts).toBe(50);
  });

  it('I4: a throwing subscriber NEVER makes notifyTxRisk throw', () => {
    track(events.subscribe(() => { throw new Error('hostile'); }));
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    expect(() =>
      sources.notifyTxRisk({ level: LEVEL.CAUTION, sentence: 'Fresh recipient.', ts: 1 })
    ).not.toThrow();
    expect(got).toHaveLength(1);
  });
});
