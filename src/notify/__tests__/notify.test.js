// src/notify/__tests__/notify.test.js
//
// Build brief §4 (event set) + §5 (one notification object per event). The pure
// event -> notification mapping: correct level, correct message, evidence present.
// notify.js is a pure function (no I/O), so every mapping is asserted here in
// isolation. `ts` is supplied by the caller (the pure fn never calls Date.now /
// Math.random) so the output — including the derived id — is deterministic.

import { describe, it, expect } from 'vitest';
import { buildNotification, EVENT, NOTIFY_LEVEL } from '../notify.js';
import { LEVEL } from '../../risk/levels.js';

const RECIPIENT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const SPENDER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

describe('buildNotification — event -> notification object (§4/§5)', () => {
  it('exposes the v1 event set and the three display levels', () => {
    expect(EVENT.SEND_CONFIRMED).toBeTruthy();
    expect(EVENT.RECEIVE_DETECTED).toBeTruthy();
    expect(EVENT.RISK_FIRED).toBeTruthy();
    expect(EVENT.APPROVAL_GRANTED).toBeTruthy();
    expect(NOTIFY_LEVEL.INFO).toBe('info');
    expect(NOTIFY_LEVEL.CAUTION).toBe('caution');
    expect(NOTIFY_LEVEL.RISK).toBe('risk');
  });

  it('maps SEND_CONFIRMED to an info "Send confirmed" with amount + recipient evidence', () => {
    const n = buildNotification({
      type: EVENT.SEND_CONFIRMED,
      ts: 1000,
      amount: '0.5 ETH',
      to: RECIPIENT,
    });
    expect(n.level).toBe(NOTIFY_LEVEL.INFO);
    expect(n.message).toBe('Send confirmed');
    expect(n.ts).toBe(1000);
    expect(n.evidence.amount).toBe('0.5 ETH');
    expect(n.evidence.to).toBe(RECIPIENT);
    expect(typeof n.id).toBe('string');
    expect(n.id.length).toBeGreaterThan(0);
  });

  it('maps RECEIVE_DETECTED to an info "Received funds" with amount evidence', () => {
    const n = buildNotification({
      type: EVENT.RECEIVE_DETECTED,
      ts: 2000,
      amount: '1.0 ETH',
    });
    expect(n.level).toBe(NOTIFY_LEVEL.INFO);
    expect(n.message).toBe('Received funds');
    expect(n.evidence.amount).toBe('1.0 ETH');
  });

  it('maps APPROVAL_GRANTED to a caution "Token approval granted" with spender evidence', () => {
    // Pure mapping is present and testable even though no on-device approval
    // source is wired in v1 (approve() is deliberately not exposed — see events.js).
    const n = buildNotification({
      type: EVENT.APPROVAL_GRANTED,
      ts: 3000,
      spender: SPENDER,
    });
    expect(n.level).toBe(NOTIFY_LEVEL.CAUTION);
    expect(n.message).toBe('Token approval granted');
    expect(n.evidence.spender).toBe(SPENDER);
  });

  it('maps RISK_FIRED to the risk module\'s own sentence and level', () => {
    const scoreResult = { level: LEVEL.RISK, sentence: 'This looks like a known address-poisoning lookalike.' };
    const n = buildNotification({ type: EVENT.RISK_FIRED, ts: 4000, score: scoreResult });
    expect(n.level).toBe(NOTIFY_LEVEL.RISK);
    expect(n.message).toBe(scoreResult.sentence);
  });

  it('derives a deterministic id (no Math.random / Date.now): same event -> same id', () => {
    const ev = { type: EVENT.SEND_CONFIRMED, ts: 5000, amount: '0.5 ETH', to: RECIPIENT };
    expect(buildNotification(ev).id).toBe(buildNotification({ ...ev }).id);
  });

  it('produces distinct ids for distinct events', () => {
    const a = buildNotification({ type: EVENT.SEND_CONFIRMED, ts: 6000, amount: '0.5 ETH', to: RECIPIENT });
    const b = buildNotification({ type: EVENT.RECEIVE_DETECTED, ts: 6000, amount: '0.5 ETH' });
    expect(a.id).not.toBe(b.id);
  });

  it('throws on an unknown / malformed event type (caller fails closed — §2 I4)', () => {
    expect(() => buildNotification({ type: 'NOT_A_REAL_EVENT', ts: 7000 })).toThrow();
    expect(() => buildNotification(null)).toThrow();
  });
});
