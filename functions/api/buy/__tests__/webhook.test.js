// functions/api/buy/__tests__/webhook.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestPost, onRequest, computeTransakSignature } from '../webhook.js';

const SECRET = 'test-transak-secret';
// Strict-mode env — used by the round-9 HMAC verification tests. Once real
// Transak traffic is captured in `warn` mode with matching signatures, flip
// TRANSAK_WEBHOOK_VERIFY_MODE=strict on Cloudflare Pages.
const ENV_STRICT = { TRANSAK_WEBHOOK_SECRET: SECRET, TRANSAK_WEBHOOK_VERIFY_MODE: 'strict' };
const ENV_OFF = { TRANSAK_WEBHOOK_SECRET: SECRET }; // default mode = off
const ENV_WARN = { TRANSAK_WEBHOOK_SECRET: SECRET, TRANSAK_WEBHOOK_VERIFY_MODE: 'warn' };

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
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('ORDER_COMPLETED returns 200 and logs event + order id', async () => {
    const request = await signedReq('POST', {
      eventID: 'ORDER_COMPLETED',
      webhookData: { id: 'abc-123', status: 'COMPLETED' },
    });
    const res = await onRequestPost({ request, env: ENV_STRICT });
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
    const res = await onRequestPost({ request, env: ENV_STRICT });
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalled();
  });

  it('GET is 405', async () => {
    const res = await onRequest({ request: unsignedReq('GET'), env: ENV_STRICT });
    expect(res.status).toBe(405);
  });

  it('missing webhookData does not throw — logs UNKNOWN + null', async () => {
    const request = await signedReq('POST', {});
    const res = await onRequestPost({ request, env: ENV_STRICT });
    expect(res.status).toBe(200);
    const line = console.log.mock.calls[0][0];
    expect(line).toContain('event=UNKNOWN');
    expect(line).toContain('order=null');
  });

  describe('signature verification (strict mode)', () => {
    it('rejects with 401 when X-Transak-Signature header is missing', async () => {
      const request = unsignedReq('POST', { eventID: 'ORDER_COMPLETED' });
      const res = await onRequestPost({ request, env: ENV_STRICT });
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
      const res = await onRequestPost({ request, env: ENV_STRICT });
      expect(res.status).toBe(401);
      expect(console.log).not.toHaveBeenCalled();
    });

    it('rejects with 401 when signed with the wrong secret', async () => {
      const request = await signedReq(
        'POST',
        { eventID: 'ORDER_COMPLETED' },
        { secret: 'attacker-secret' },
      );
      const res = await onRequestPost({ request, env: ENV_STRICT });
      expect(res.status).toBe(401);
    });

    it('falls back to log-only (no 500) when TRANSAK_WEBHOOK_SECRET is unset even in strict mode', async () => {
      // Round-10: reverts round-9 fail-closed-with-500 behaviour so a missing/
      // rotating secret does not drop every legitimate webhook.
      const request = await signedReq('POST', { eventID: 'ORDER_COMPLETED' });
      const res = await onRequestPost({ request, env: { TRANSAK_WEBHOOK_VERIFY_MODE: 'strict' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('X-Verify-Mode')).toBeNull();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('off mode (default)', () => {
    it('unsigned request returns 200 + logs the raw event', async () => {
      const request = unsignedReq('POST', {
        eventID: 'ORDER_CREATED',
        webhookData: { id: 'off-1', status: 'CREATED' },
      });
      const res = await onRequestPost({ request, env: ENV_OFF });
      expect(res.status).toBe(200);
      expect(res.headers.get('X-Verify-Mode')).toBeNull();
      const line = console.log.mock.calls[0][0];
      expect(line).toContain('event=ORDER_CREATED');
      expect(line).toContain('order=off-1');
      expect(line).toContain('mode=off');
    });

    it('no env var at all defaults to off (no 500)', async () => {
      const request = unsignedReq('POST', { eventID: 'ORDER_CREATED' });
      const res = await onRequestPost({ request, env: {} });
      expect(res.status).toBe(200);
      expect(res.headers.get('X-Verify-Mode')).toBeNull();
    });

    it('invalid mode value (e.g. "true") warns once and resolves to off', async () => {
      const request = unsignedReq('POST', { eventID: 'ORDER_CREATED' });
      const res = await onRequestPost({
        request,
        env: { TRANSAK_WEBHOOK_SECRET: SECRET, TRANSAK_WEBHOOK_VERIFY_MODE: 'true' },
      });
      expect(res.status).toBe(200);
      const warnLine = console.warn.mock.calls[0][0];
      expect(warnLine).toContain('invalid TRANSAK_WEBHOOK_VERIFY_MODE=true');
      expect(warnLine).toContain('falling back to off');
      // resolved to off → main log line reports mode=off
      const logLine = console.log.mock.calls[0][0];
      expect(logLine).toContain('mode=off');
    });
  });

  describe('warn mode', () => {
    it('bad signature returns 200 + logs WARN with detail', async () => {
      const request = await signedReq(
        'POST',
        { eventID: 'ORDER_COMPLETED', webhookData: { id: 'warn-1' } },
        { signature: '00'.repeat(32) },
      );
      const res = await onRequestPost({ request, env: ENV_WARN });
      expect(res.status).toBe(200);
      expect(res.headers.get('X-Verify-Mode')).toBeNull();
      const warnLine = console.warn.mock.calls[0][0];
      expect(warnLine).toContain('verify_warn');
      expect(warnLine).toContain('reason=signature_mismatch');
      expect(warnLine).toContain('header=');
      expect(warnLine).toContain('computed=');
      // Payload still logged so operators see the event.
      const logLine = console.log.mock.calls[0][0];
      expect(logLine).toContain('event=ORDER_COMPLETED');
      expect(logLine).toContain('order=warn-1');
    });

    it('valid signature is silent (no warn) and still 200', async () => {
      const request = await signedReq('POST', {
        eventID: 'ORDER_COMPLETED',
        webhookData: { id: 'warn-ok' },
      });
      const res = await onRequestPost({ request, env: ENV_WARN });
      expect(res.status).toBe(200);
      expect(res.headers.get('X-Verify-Mode')).toBeNull();
      expect(console.warn).not.toHaveBeenCalled();
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
      const res = await onRequestPost({ request, env: ENV_STRICT });

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
        eventID: 'A\rB\tCD E F',
        webhookData: { id: 'x' },
      });
      await onRequestPost({ request, env: ENV_STRICT });

      const line = console.log.mock.calls[0][0];
      expect(line).toContain('event=ABCDEF');
      for (const ch of ['\r', '\t', '', ' ', ' ']) {
        expect(line).not.toContain(ch);
      }
    });

    it('caps an over-long field so a caller cannot pad the log', async () => {
      const huge = 'z'.repeat(5000);
      const request = await signedReq('POST', { eventID: huge, webhookData: { id: huge } });
      await onRequestPost({ request, env: ENV_STRICT });

      const line = console.log.mock.calls[0][0];
      expect(line).toContain(`event=${'z'.repeat(64)}…`);
      expect(line).not.toContain('z'.repeat(65));
      expect(line.length).toBeLessThan(300);
    });

    it('a field that is only control characters degrades to UNKNOWN, not empty', async () => {
      const request = await signedReq('POST', { eventID: '\n\r\t', webhookData: {} });
      await onRequestPost({ request, env: ENV_STRICT });

      const line = console.log.mock.calls[0][0];
      expect(line).toContain('event=UNKNOWN');
    });
  });
});
