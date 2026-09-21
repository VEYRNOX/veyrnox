// @vitest-environment node
// The relay used to read Transak's response with an uncapped res.text(), so a
// misbehaving upstream could make the relay VM buffer an unbounded body.
import { describe, it, expect, beforeAll } from 'vitest';

let readCappedResponse;
let MAX_RESPONSE_BYTES;

beforeAll(async () => {
  process.env.TRANSAK_PROXY_NO_LISTEN = '1';
  ({ readCappedResponse, MAX_RESPONSE_BYTES } = await import('../server.mjs'));
});

const streamOf = (sizes) => new ReadableStream({
  start(c) { for (const n of sizes) c.enqueue(new Uint8Array(n)); c.close(); },
});

describe('relay upstream response cap', () => {
  it('passes a normal-sized response through byte-for-byte', async () => {
    const body = JSON.stringify({ data: { accessToken: 'tok' } });
    const buf = await readCappedResponse(new Response(body));
    expect(buf.toString()).toBe(body);
  });

  it('rejects an oversized declared Content-Length before reading', async () => {
    const res = new Response('x', { headers: { 'content-length': String(MAX_RESPONSE_BYTES + 1) } });
    await expect(readCappedResponse(res)).rejects.toThrow(/too large/);
  });

  it('rejects an oversized chunked body with no Content-Length', async () => {
    const res = new Response(streamOf([MAX_RESPONSE_BYTES, 1]));
    await expect(readCappedResponse(res)).rejects.toThrow(/too large/);
  });

  it('accepts a body exactly at the cap', async () => {
    const buf = await readCappedResponse(new Response(streamOf([MAX_RESPONSE_BYTES])));
    expect(buf.length).toBe(MAX_RESPONSE_BYTES);
  });
});
