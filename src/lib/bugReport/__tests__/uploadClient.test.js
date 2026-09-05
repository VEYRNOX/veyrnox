import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { x25519 } from '@noble/curves/ed25519';

// Slice 1e-4 — client wiring. Pins the wire format, the argument shape
// passed to the RPC, and the fail-closed behaviour when capture is
// missing or the upload endpoint errors.
//
// Mutation targets:
//   - NO_CAPTURE refuse dropped → refuse test goes red (silent zero-byte
//     upload would follow)
//   - RPC params reshaped → RPC-call shape test goes red (SQL contract
//     depends on the exact field names)
//   - upload POST changes headers/body → upload-shape test goes red
//   - non-ok upload response silently returns → upload-error test goes red

const mockRpc = vi.fn();
vi.mock('@/api/edgeApi', () => ({ rpc: (...a) => mockRpc(...a) }));

// A stable UUID mock so tests can assert on report_id.
const FIXED_UUID = '11111111-2222-3333-4444-555555555555';

function testKeypair() {
  const sk = x25519.utils.randomPrivateKey();
  return { sk, pk: x25519.getPublicKey(sk) };
}

let sendBugReport, serializeEnvelope;
beforeEach(async () => {
  mockRpc.mockReset().mockResolvedValue(null);
  vi.stubGlobal('crypto', {
    // node's crypto.getRandomValues + subtle come from the real global.
    getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
    subtle: globalThis.crypto.subtle,
    randomUUID: () => FIXED_UUID,
  });
  vi.resetModules();
  ({ sendBugReport, serializeEnvelope } = await import('../uploadClient'));
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('serializeEnvelope', () => {
  it('lays out header as 3-byte tag + 32-byte epk + 12-byte iv + ct', () => {
    const env = {
      v: 'br1',
      epk: new Uint8Array(32).fill(0xAA),
      iv: new Uint8Array(12).fill(0xBB),
      ct: new Uint8Array(10).fill(0xCC),
    };
    const out = serializeEnvelope(env);
    expect(out.length).toBe(3 + 32 + 12 + 10);
    // 'b','r','1'
    expect(Array.from(out.slice(0, 3))).toEqual([0x62, 0x72, 0x31]);
    expect(out.slice(3, 35).every((b) => b === 0xAA)).toBe(true);
    expect(out.slice(35, 47).every((b) => b === 0xBB)).toBe(true);
    expect(out.slice(47).every((b) => b === 0xCC)).toBe(true);
  });

  it('refuses wrong format tag', () => {
    expect(() => serializeEnvelope({
      v: 'br0', epk: new Uint8Array(32), iv: new Uint8Array(12), ct: new Uint8Array(0),
    })).toThrow(/UNKNOWN_FORMAT/);
  });

  it('refuses wrong-length epk / iv', () => {
    expect(() => serializeEnvelope({
      v: 'br1', epk: new Uint8Array(31), iv: new Uint8Array(12), ct: new Uint8Array(0),
    })).toThrow(/BAD_EPK/);
    expect(() => serializeEnvelope({
      v: 'br1', epk: new Uint8Array(32), iv: new Uint8Array(11), ct: new Uint8Array(0),
    })).toThrow(/BAD_IV/);
  });
});

describe('sendBugReport — NO_CAPTURE refuse', () => {
  it('throws BUG_REPORT_NO_CAPTURE when captureBuffer is null / empty', async () => {
    const { pk } = testKeypair();
    for (const bad of [null, undefined, new Uint8Array(0), 'string', {}]) {
      await expect(sendBugReport({
        captureBuffer: bad,
        deviceId: FIXED_UUID,
        platform: 'ios',
        appVersion: '1.0.1',
        supportPublicKey: pk,
      })).rejects.toThrow(/NO_CAPTURE/);
    }
    // Neither RPC nor fetch should have been called.
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('sendBugReport — happy path', () => {
  it('reserves via RPC with the exact SQL-contract shape, then uploads', async () => {
    const { pk } = testKeypair();
    const fetchStub = vi.fn(async () => new Response(
      JSON.stringify({ ok: true, report_id: FIXED_UUID }),
      { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchStub);

    const capture = new Uint8Array(1024).fill(0x11);
    const result = await sendBugReport({
      captureBuffer: capture,
      deviceId: FIXED_UUID,
      platform: 'android',
      appVersion: '1.0.1',
      supportPublicKey: pk,
      description: 'the send button did not work',
    });

    expect(result.report_id).toBe(FIXED_UUID);

    // RPC call shape — matches sql/bug-report-upload.sql's function signature.
    expect(mockRpc).toHaveBeenCalledTimes(1);
    const [rpcName, rpcArgs] = mockRpc.mock.calls[0];
    expect(rpcName).toBe('create_bug_report_upload');
    expect(rpcArgs).toMatchObject({
      p_report_id: FIXED_UUID,
      p_device_id: FIXED_UUID,
      p_app_version: '1.0.1',
      p_platform: 'android',
    });
    expect(typeof rpcArgs.p_size_bytes).toBe('number');
    expect(rpcArgs.p_size_bytes).toBeGreaterThan(0);
    expect(rpcArgs.p_client_meta).toEqual({});

    // Upload POST shape.
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [uploadUrl, uploadInit] = fetchStub.mock.calls[0];
    expect(uploadUrl).toBe('/api/bug-report/upload');
    expect(uploadInit.method).toBe('POST');
    expect(uploadInit.headers['Content-Type']).toBe('application/octet-stream');
    expect(uploadInit.headers['X-Report-Id']).toBe(FIXED_UUID);
    expect(uploadInit.headers['X-Envelope-Size']).toBe(String(uploadInit.body.byteLength));
    // Body starts with the wire tag 'br1' — mutation defence for serialisation.
    expect(uploadInit.body[0]).toBe(0x62);
    expect(uploadInit.body[1]).toBe(0x72);
    expect(uploadInit.body[2]).toBe(0x31);
  });

  it('refuses to hit the upload endpoint if RPC reservation throws', async () => {
    const { pk } = testKeypair();
    mockRpc.mockRejectedValueOnce(new Error('bug report rate limit exceeded'));
    const fetchStub = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchStub);

    await expect(sendBugReport({
      captureBuffer: new Uint8Array(8).fill(1),
      deviceId: FIXED_UUID,
      platform: 'ios',
      appVersion: '1.0.1',
      supportPublicKey: pk,
    })).rejects.toThrow(/rate limit/);
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe('sendBugReport — upload response error', () => {
  it('throws with server-supplied error message', async () => {
    const { pk } = testKeypair();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'Body/size mismatch' }),
      { status: 400 },
    )));
    await expect(sendBugReport({
      captureBuffer: new Uint8Array(8).fill(1),
      deviceId: FIXED_UUID,
      platform: 'ios',
      appVersion: '1.0.1',
      supportPublicKey: pk,
    })).rejects.toThrow(/mismatch/);
  });

  it('throws with status code when response is unparseable', async () => {
    const { pk } = testKeypair();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 502 })));
    await expect(sendBugReport({
      captureBuffer: new Uint8Array(8).fill(1),
      deviceId: FIXED_UUID,
      platform: 'ios',
      appVersion: '1.0.1',
      supportPublicKey: pk,
    })).rejects.toThrow(/502/);
  });
});
