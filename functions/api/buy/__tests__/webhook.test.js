// functions/api/buy/__tests__/webhook.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestPost, onRequest, computeTransakSignature } from '../webhook.js';

const SECRET = 'test-transak-secret';
const ENV = { TRANSAK_WEBHOOK_SECRET: SECRET };

async function signedReq(method, bodyObj, { rawBody, secret = SECRET, signature } = {}) {
  const body = rawBody != null ? rawBody : bodyObj != null ? JSON.stringify(bodyObj) : null;
  const headers = { 'Content-Type': 'application/json' };
  if (body != null) {
    headers['X-Transak-Signature'] =
      signature != null ? signature : await computeTransakSignature(body, secret);
  }
  return new Request('https://veyrnox-prod.pages.dev/api/buy/webhook', {
    method,
    headers,
    body,
  });
}

function unsignedReq(method, body) {
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
    const request = await signedReq('POST', {
      eventID: 'ORDER_COMPLETED',
      webhookData: { id: 'abc-123', status: 'COMPLETED' },
    });
    const res = await onRequestPost({ request, env: ENV });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const line = console.log.mock.calls[0][0];
    expect(line).toContain('event=ORDER_COMPLETED');
    expect(line).toContain('order=abc-123');
    expect(line).toContain('status=COMPLETED');
  });

  it('malformed JSON body still 200 when signature is valid', async () => {
    const raw = '{not json';
    const request = new Request('https://x/api/buy/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Transak-Signature': await computeTransakSignature(raw, SECRET),
      },
      body: raw,
    });
    const res = await onRequestPost({ request, env: ENV });
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalled();
  });

  it('GET is 405', async () => {
    const res = await onRequest({ request: unsignedReq('GET'), env: ENV });
    expect(res.status).toBe(405);
  });

  it('missing webhookData does not throw — logs UNKNOWN + null', async () => {
    const request = await signedReq('POST', {});
    const res = await onRequestPost({ request, env: ENV });
    expect(res.status).toBe(200);
    const line = console.log.mock.calls[0][0];
    expect(line).toContain('event=UNKNOWN');
    expect(line).toContain('order=null');
  });

  describe('signature verification', () => {
    it('rejects with 401 when X-Transak-Signature header is missing', async () => {
      const request = unsignedReq('POST', { eventID: 'ORDER_COMPLETED' });
      const res = await onRequestPost({ request, env: ENV });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' });
      expect(console.log).not.toHaveBeenCalled();
    });

    it('rejects with 401 when signature does not match body', async () => {
      const request = await signedReq(
        'POST',
        { eventID: 'ORDER_COMPLETED' },
        { signature: '00'.repeat(32) },
      );
      const res = await onRequestPost({ request, env: ENV });
      expect(res.status).toBe(401);
      expect(console.log).not.toHaveBeenCalled();
    });

    it('rejects with 401 when signed with the wrong secret', async () => {
      const request = await signedReq(
        'POST',
        { eventID: 'ORDER_COMPLETED' },
        { secret: 'attacker-secret' },
      );
      const res = await onRequestPost({ request, env: ENV });
      expect(res.status).toBe(401);
    });

    it('fails closed with 500 when TRANSAK_WEBHOOK_SECRET is unset', async () => {
      const request = await signedReq('POST', { eventID: 'ORDER_COMPLETED' });
      const res = await onRequestPost({ request, env: {} });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ ok: false, error: 'server_misconfigured' });
    });
  });

  // Even a signed caller (compromised backend) must not be able to forge log
  // lines — logSafe stays as defense-in-depth.
  describe('log-field sanitisation', () => {
    it('a newline in eventID cannot forge a second log line', async () => {
      const request = await signedReq('POST', {
        eventID:
          'X\n[buy/webhook] ref=deadbeef event=ORDER_COMPLETED order=fake-999 status=COMPLETED',
        webhookData: { id: 'real-1', status: 'PROCESSING' },
      });
      const res = await onRequestPost({ request, env: ENV });

      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledTimes(1);
      const line = console.log.mock.calls[0][0];
      expect(line).not.toContain('\n');
      expect(line).not.toContain('\r');
      expect(line.startsWith('[buy/webhook] ref=')).toBe(true);
      expect(line).toContain('order=real-1');
      expect(line).toContain('status=PROCESSING');
    });

    it('strips CR, tab, DEL and the Unicode line separators', async () => {
      const request = await signedReq('POST', {
        eventID: 'A\rB\tC\u007FD\u2028E\u2029F',
        webhookData: { id: 'x' },
      });
      await onRequestPost({ request, env: ENV });

      const line = console.log.mock.calls[0][0];
      expect(line).toContain('event=ABCDEF');
      for (const ch of ['\r', '\t', '\u007F', '\u2028', '\u2029']) {
        expect(line).not.toContain(ch);
      }
    });

    it('caps an over-long field so a caller cannot pad the log', async () => {
      const huge = 'z'.repeat(5000);
      const request = await signedReq('POST', { eventID: huge, webhookData: { id: huge } });
      await onRequestPost({ request, env: ENV });

      const line = console.log.mock.calls[0][0];
      expect(line).toContain(`event=${'z'.repeat(64)}…`);
      expect(line).not.toContain('z'.repeat(65));
      expect(line.length).toBeLessThan(300);
    });

    it('a field that is only control characters degrades to UNKNOWN, not empty', async () => {
      const request = await signedReq('POST', { eventID: '\n\r\t', webhookData: {} });
      await onRequestPost({ request, env: ENV });

      const line = console.log.mock.calls[0][0];
      expect(line).toContain('event=UNKNOWN');
    });
  });
});
