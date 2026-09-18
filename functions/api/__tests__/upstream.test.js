// functions/api/__tests__/upstream.test.js
//
// Bounds for the outbound calls the Pages Functions make. Before _lib/upstream.js
// every one of them ran `fetch()` with no deadline and `res.text()` with no size
// limit, so one slow or oversized upstream held a request open for as long as the
// platform allowed.
//
// The two properties worth pinning are the ones that fail SILENTLY if they
// regress: a missing signal looks identical to a working fetch until an upstream
// hangs, and an uncapped read looks identical until an upstream is huge. Neither
// shows up in a green integration test.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchUpstream, readCapped, MAX_UPSTREAM_BYTES, DEFAULT_TIMEOUT_MS } from '../_lib/upstream.js';

afterEach(() => { vi.restoreAllMocks(); });

/** A Response whose body streams `chunks` with no Content-Length. */
function streamingResponse(chunks, headers = {}) {
  const body = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });
  return new Response(body, { headers });
}

describe('fetchUpstream', () => {
  it('attaches an abort signal with a deadline', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    await fetchUpstream('https://example.test/x');

    const [, init] = spy.mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal.aborted).toBe(false);
  });

  it('passes the caller init through and does not forward timeoutMs to fetch', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    await fetchUpstream('https://example.test/x', {
      method: 'POST',
      headers: { 'X-Test': '1' },
      timeoutMs: 1234,
    });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('https://example.test/x');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'X-Test': '1' });
    expect(init.timeoutMs).toBeUndefined();
  });

  it('actually aborts when the upstream outlives the deadline', async () => {
    // Real signal, no fake timers: the only honest proof that the deadline fires.
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason));
      })
    );

    await expect(fetchUpstream('https://example.test/slow', { timeoutMs: 20 }))
      .rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('defaults the deadline rather than leaving it open-ended', () => {
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});

describe('readCapped', () => {
  it('returns the body unchanged when it is under the cap', async () => {
    const res = streamingResponse(['{"ok":', 'true}']);
    expect(await readCapped(res)).toBe('{"ok":true}');
  });

  it('decodes multi-byte characters split across chunk boundaries', async () => {
    // Guards the concat-then-decode order: decoding each chunk separately would
    // mangle a UTF-8 sequence straddling the boundary.
    const bytes = new TextEncoder().encode('héllo — wörld');
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 2)); // splits the 2-byte 'é'
        controller.enqueue(bytes.slice(2));
        controller.close();
      },
    });
    expect(await readCapped(new Response(body))).toBe('héllo — wörld');
  });

  it('rejects on a declared Content-Length over the cap even when the body is tiny', async () => {
    // Pins the cheap header check specifically: the body here is 4 bytes, so
    // the stream loop alone would happily return it. Only the Content-Length
    // branch can reject this.
    //
    // (Not asserted: that the body was never drained. `start`/`pull` both run
    // eagerly once a Response wraps the stream in this runtime, so "did not
    // read" is not observable from a test — it is a property of the runtime,
    // not of this code.)
    const res = new Response('tiny', {
      headers: { 'Content-Length': String(MAX_UPSTREAM_BYTES + 1) },
    });

    await expect(readCapped(res)).rejects.toThrow(/too large/i);
  });

  it('enforces the cap on the ACTUAL read when Content-Length lies or is absent', async () => {
    // The whole point of the stream loop: a chunked response carries no
    // Content-Length, so the header check alone is not a control.
    const res = streamingResponse(['a'.repeat(40), 'b'.repeat(40)]);
    await expect(readCapped(res, 50)).rejects.toThrow(/too large/i);
  });

  it('throws rather than returning a truncated body', async () => {
    // A silently truncated JSON body would be parsed into a WRONG answer
    // instead of an error, which is worse than failing.
    const res = streamingResponse(['{"rows":[1,2,3,4,5]}']);
    await expect(readCapped(res, 5)).rejects.toThrow();
  });

  it('throws the {status, expose} shape _middleware.js turns into a clean 502', async () => {
    const res = streamingResponse(['x'.repeat(100)]);
    const err = await readCapped(res, 10).catch((e) => e);
    expect(err.status).toBe(502);
    expect(err.expose).toBe(true);
    // Fixed token — must not reflect upstream bytes back to the caller.
    expect(err.message).toBe('Upstream response too large');
  });
});
