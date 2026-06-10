// src/notify/__tests__/failClosed.test.js
//
// Build brief §2 (I4 fail honest / fail closed) + §4 (risk emits only at >= CAUTION)
// + §1/§9 (no approval source — HONEST-DISABLED). The emitter is a self-contained
// in-memory pub/sub: the thin push-points the live flows will call later.
//
// The load-bearing guarantee here: a failure in the notification path is DROPPED
// SILENTLY and never propagates back to the emitter's caller — so emitting a
// notification can never block a tx broadcast or an unlock. A throwing subscriber
// must not break delivery to the others, and the emit call itself must not throw.

import { describe, it, expect, beforeEach } from 'vitest';
import * as events from '../events.js';
import { buildNotification, EVENT } from '../notify.js';
import { LEVEL } from '../../risk/levels.js';

let unsubs = [];
const track = (u) => {
  unsubs.push(u);
  return u;
};
beforeEach(() => {
  unsubs.forEach((u) => u());
  unsubs = [];
});

describe('events.js — in-memory emitter, fail-closed (§2 I4)', () => {
  it('delivers emitted events to subscribers and stops after unsubscribe', () => {
    const got = [];
    const unsub = track(events.subscribe((e) => got.push(e)));
    events.emitSendConfirmed({ ts: 1, amount: '0.5 ETH', to: '0xabc' });
    expect(got).toHaveLength(1);
    expect(got[0].type).toBe(EVENT.SEND_CONFIRMED);
    expect(got[0].amount).toBe('0.5 ETH');

    unsub();
    events.emitReceiveDetected({ ts: 2, amount: '1 ETH' });
    expect(got).toHaveLength(1); // no delivery after unsubscribe
  });

  it('emitRiskFired only emits at >= CAUTION (OK/INFO are not notification-worthy)', () => {
    const got = [];
    track(events.subscribe((e) => got.push(e)));
    events.emitRiskFired({ ts: 1, score: { level: LEVEL.OK, sentence: null } });
    events.emitRiskFired({ ts: 2, score: { level: LEVEL.INFO, sentence: 'x' } });
    expect(got).toHaveLength(0);

    events.emitRiskFired({ ts: 3, score: { level: LEVEL.CAUTION, sentence: 'careful' } });
    events.emitRiskFired({ ts: 4, score: { level: LEVEL.RISK, sentence: 'danger' } });
    expect(got.map((e) => e.score.level)).toEqual([LEVEL.CAUTION, LEVEL.RISK]);
  });

  it('a throwing subscriber is isolated — the others still receive', () => {
    const got = [];
    track(events.subscribe(() => { throw new Error('subscriber blew up'); }));
    track(events.subscribe((e) => got.push(e)));
    events.emitSendConfirmed({ ts: 1, amount: '0.5 ETH', to: '0xabc' });
    expect(got).toHaveLength(1);
  });

  it('emit never throws back to the caller (cannot block a tx/unlock path)', () => {
    // A subscriber that maps via buildNotification on a MALFORMED event will throw;
    // the emitter must swallow it so the broadcasting caller is never affected.
    track(events.subscribe((e) => { buildNotification(e); }));
    expect(() => events.emitRiskFired({ ts: 1, score: { level: LEVEL.RISK, sentence: 'x' } })).not.toThrow();
    // Even a directly hostile subscriber cannot escape the emitter.
    track(events.subscribe(() => { throw new Error('nope'); }));
    expect(() => events.emitReceiveDetected({ ts: 2, amount: '1 ETH' })).not.toThrow();
  });

  it('exposes NO approval emitter (HONEST-DISABLED — approve() is not exposed)', () => {
    const approvalEmitter = Object.keys(events).find((k) => /approv/i.test(k));
    expect(approvalEmitter).toBeUndefined();
  });
});
