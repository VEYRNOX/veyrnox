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

  // This endpoint is unauthenticated and does no signature verification yet, so
  // every logged field is attacker-controlled. The risk is not state change —
  // the handler has no side effect beyond logging — it is an operator reading a
  // forged line and believing it.
  describe('log-field sanitisation', () => {
    it('a newline in eventID cannot forge a second log line', async () => {
      const res = await onRequestPost({
        request: req('POST', {
          eventID:
            'X\n[buy/webhook] ref=deadbeef event=ORDER_COMPLETED order=fake-999 status=COMPLETED',
          webhookData: { id: 'real-1', status: 'PROCESSING' },
        }),
      });

      expect(res.status).toBe(200);
      // Exactly one line, and it contains no line break to split on.
      expect(console.log).toHaveBeenCalledTimes(1);
      const line = console.log.mock.calls[0][0];
      expect(line).not.toContain('\n');
      expect(line).not.toContain('\r');
      // The forged fragment survives as inert text INSIDE the real entry —
      // that is fine and expected. What matters is that it cannot become an
      // entry of its own, so the line still opens with the genuine prefix and
      // still reports the real order and status.
      expect(line.startsWith('[buy/webhook] ref=')).toBe(true);
      expect(line).toContain('order=real-1');
      expect(line).toContain('status=PROCESSING');
    });

    it('strips CR, tab, DEL and the Unicode line separators', async () => {
      await onRequestPost({
        request: req('POST', {
          eventID: 'A\rB\tC\u007FD\u2028E\u2029F',
          webhookData: { id: 'x' },
        }),
      });

      const line = console.log.mock.calls[0][0];
      expect(line).toContain('event=ABCDEF');
      for (const ch of ['\r', '\t', '\u007F', '\u2028', '\u2029']) {
        expect(line).not.toContain(ch);
      }
    });

    it('caps an over-long field so a caller cannot pad the log', async () => {
      const huge = 'z'.repeat(5000);
      await onRequestPost({
        request: req('POST', { eventID: huge, webhookData: { id: huge } }),
      });

      const line = console.log.mock.calls[0][0];
      // 64 kept + a visible truncation marker, so the cut is not silent.
      expect(line).toContain(`event=${'z'.repeat(64)}…`);
      expect(line).not.toContain('z'.repeat(65));
      expect(line.length).toBeLessThan(300);
    });

    it('a field that is only control characters degrades to UNKNOWN, not empty', async () => {
      await onRequestPost({
        request: req('POST', { eventID: '\n\r\t', webhookData: {} }),
      });

      const line = console.log.mock.calls[0][0];
      expect(line).toContain('event=UNKNOWN');
    });
  });
});
