// src/notify/__tests__/sessionScope.test.js
//
// Build brief §5 (queue behaviour) + §2 D-set ("No persistence", "No cardinality
// leak"). The queue is a pure, in-memory ring reducer — session-scoped only. This
// proves: the badge counts THIS session's unseen items, markAllSeen resets it,
// the ring is bounded (memory cap, not retention), and clear() (the lock/reload
// lifecycle) wipes everything back to the initial state. No persistence is
// exercised here at all — there is nothing to survive a reload.

import { describe, it, expect } from 'vitest';
import { queueReducer, initialQueue, RING_CAP } from '../queue.js';

// Minimal distinct notification objects (shape is irrelevant to the reducer).
const note = (i) => ({ id: `n${i}`, level: 'info', message: 'Received funds', ts: i, evidence: {} });

const pushAll = (count, start = 1) => {
  let s = initialQueue;
  for (let i = start; i < start + count; i++) s = queueReducer(s, { type: 'push', notification: note(i) });
  return s;
};

describe('queue — session-scoped in-memory ring (§5)', () => {
  it('starts empty with a zero badge and no toast', () => {
    expect(initialQueue.items).toEqual([]);
    expect(initialQueue.unseenCount).toBe(0);
    expect(initialQueue.latest).toBeNull();
  });

  it('push increments the unseen badge and surfaces the newest as latest (toast)', () => {
    const s = pushAll(3);
    expect(s.unseenCount).toBe(3);
    expect(s.latest.id).toBe('n3');
    expect(s.items).toHaveLength(3);
  });

  it('bounds memory at RING_CAP, evicting the oldest (not a retention feature)', () => {
    const s = pushAll(RING_CAP + 5);
    expect(s.items).toHaveLength(RING_CAP);
    // Newest retained, oldest five evicted.
    expect(s.items[0].id).toBe(`n${RING_CAP + 5}`);
    expect(s.items.some((n) => n.id === 'n1')).toBe(false);
  });

  it('markAllSeen resets the badge to zero but keeps the items', () => {
    const s = queueReducer(pushAll(4), { type: 'markAllSeen' });
    expect(s.unseenCount).toBe(0);
    expect(s.items).toHaveLength(4);
  });

  it('clear() wipes the queue back to initial (lock/reload lifecycle — nothing persists)', () => {
    const s = queueReducer(pushAll(5), { type: 'clear' });
    expect(s.items).toEqual([]);
    expect(s.unseenCount).toBe(0);
    expect(s.latest).toBeNull();
  });

  it('a fresh session (re-init) does NOT inherit the previous session\'s badge', () => {
    pushAll(7); // previous "session"
    // Re-initialising (the reducer is pure; state is never hydrated from a store)
    expect(initialQueue.unseenCount).toBe(0);
  });

  it('dismiss removes one item and clears the toast if it was the latest', () => {
    const s = queueReducer(pushAll(2), { type: 'dismiss', id: 'n2' });
    expect(s.items.some((n) => n.id === 'n2')).toBe(false);
    expect(s.latest).toBeNull();
  });

  it('ignores an unknown action (returns the same state reference)', () => {
    const s = pushAll(1);
    expect(queueReducer(s, { type: 'nope' })).toBe(s);
  });
});
