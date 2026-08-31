// functions/api/buy/__tests__/webhook.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestPost, onRequest } from '../webhook.js';

function req(method, body) {
  return new Request('https://veyrnox-prod.pages.dev/api/buy/webhook', {
    method,
    headers: body != null ? { 'Content-Type': 'application/json' } : {},
    body: body != null ? JSON.stringify(body) : null,
  });
}

describe('buy/webhook', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('ORDER_COMPLETED returns 200 and logs event + order id', async () => {
    const res = await onRequestPost({
      request: req('POST', {
        eventID: 'ORDER_COMPLETED',
        webhookData: { id: 'abc-123', status: 'COMPLETED' },
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const line = console.log.mock.calls[0][0];
    expect(line).toContain('event=ORDER_COMPLETED');
    expect(line).toContain('order=abc-123');
    expect(line).toContain('status=COMPLETED');
  });

  it('malformed JSON body still 200 (Transak retries otherwise)', async () => {
    const bad = new Request('https://x/api/buy/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    });
    const res = await onRequestPost({ request: bad });
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalled();
  });

  it('GET is 405', async () => {
    const res = await onRequest({ request: req('GET') });
    expect(res.status).toBe(405);
  });

  it('missing webhookData does not throw — logs UNKNOWN + null', async () => {
    const res = await onRequestPost({ request: req('POST', {}) });
    expect(res.status).toBe(200);
    const line = console.log.mock.calls[0][0];
    expect(line).toContain('event=UNKNOWN');
    expect(line).toContain('order=null');
  });
});
