// L4 — destroyWalletConnect() must disconnect every active session with
// USER_DISCONNECTED BEFORE nulling the client, so dApps receive a real
// disconnect signal and cannot keep the session open / queue requests that
// reappear on reconnect. Asserts structural behaviour, not copy.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// The module reads import.meta.env at load — give it a project id so the client
// path is exercisable, but we never hit a real relay (we inject the client).
vi.stubEnv('VITE_WALLETCONNECT_PROJECT_ID', 'test-project-id');

import {
  __setTestClient,
  destroyWalletConnect,
  getActiveSessions,
} from '../walletconnect/session.js';

describe('L4 — destroyWalletConnect disconnects active sessions first', () => {
  let disconnectCalls;

  beforeEach(() => {
    disconnectCalls = [];
  });

  it('calls disconnectSession with USER_DISCONNECTED for each active session', async () => {
    const sessions = {
      a: { topic: 'topic-a' },
      b: { topic: 'topic-b' },
    };
    __setTestClient({
      getActiveSessions: () => sessions,
      disconnectSession: vi.fn(async ({ topic, reason }) => {
        disconnectCalls.push({ topic, reason });
      }),
    });

    await destroyWalletConnect();

    const topics = disconnectCalls.map((c) => c.topic).sort();
    expect(topics).toEqual(['topic-a', 'topic-b']);
    // Every disconnect must carry the USER_DISCONNECTED sdk error code.
    for (const c of disconnectCalls) {
      expect(c.reason).toBeTruthy();
      expect(c.reason.code).toBeTypeOf('number');
    }
  });

  it('still nulls the client after disconnecting (no active sessions left)', async () => {
    __setTestClient({
      getActiveSessions: () => ({ a: { topic: 'topic-a' } }),
      disconnectSession: vi.fn(async () => {}),
    });

    await destroyWalletConnect();

    // _client is nulled, so getActiveSessions() returns the empty fallback.
    expect(getActiveSessions()).toEqual([]);
  });

  it('swallows a per-session disconnect error and still disconnects the rest', async () => {
    __setTestClient({
      getActiveSessions: () => ({
        a: { topic: 'topic-a' },
        b: { topic: 'topic-b' },
      }),
      disconnectSession: vi.fn(async ({ topic }) => {
        if (topic === 'topic-a') throw new Error('stale session');
        disconnectCalls.push({ topic });
      }),
    });

    await expect(destroyWalletConnect()).resolves.toBeUndefined();
    expect(disconnectCalls.map((c) => c.topic)).toContain('topic-b');
    expect(getActiveSessions()).toEqual([]);
  });

  it('does not throw when there is no client', async () => {
    __setTestClient(null);
    await expect(destroyWalletConnect()).resolves.toBeUndefined();
  });
});
