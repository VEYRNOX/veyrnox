/**
 * Regression tests for audit finding M-9 (2026-07-28):
 * - Redirects respect scheme/host allowlist (connect.trezor.io + https).
 * - Redirect chain is depth-capped.
 * - SHA-256 integrity mismatch fails closed.
 */

import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { createHash } from 'crypto';

import {
  fetchUrl,
  sha256,
  verifyAsset,
  loadManifestForVersion,
} from '../bundle-trezor-connect.mjs';

/**
 * Build a fake https implementation whose responses are driven by a script:
 * script is an array of { statusCode, headers, body } keyed to sequential
 * get() calls. Returns { get, calls }.
 */
function fakeHttps(script) {
  const calls = [];
  const get = (url, _opts, cb) => {
    calls.push(typeof url === 'string' ? url : url.toString());
    const step = script.shift();
    if (!step) {
      throw new Error(`fakeHttps: no scripted response for ${url}`);
    }
    const res = new EventEmitter();
    res.statusCode = step.statusCode;
    res.headers = step.headers || {};
    res.resume = () => {};
    // Deliver body asynchronously so listeners have time to attach.
    setImmediate(() => {
      cb(res);
      if (step.body !== undefined) {
        setImmediate(() => {
          res.emit('data', Buffer.from(step.body));
          res.emit('end');
        });
      }
    });
    const req = new EventEmitter();
    req.destroy = () => {};
    return req;
  };
  return { get, calls };
}

describe('fetchUrl allowlist (M-9)', () => {
  it('rejects a non-https initial URL', async () => {
    const { get } = fakeHttps([]);
    await expect(fetchUrl('http://connect.trezor.io/9/iframe.html', { httpsImpl: { get } }))
      .rejects.toThrow(/disallowed origin/);
  });

  it('rejects an off-host initial URL', async () => {
    const { get } = fakeHttps([]);
    await expect(fetchUrl('https://evil.example/9/iframe.html', { httpsImpl: { get } }))
      .rejects.toThrow(/disallowed origin/);
  });

  it('rejects a redirect that lands on a disallowed host', async () => {
    const { get } = fakeHttps([
      { statusCode: 302, headers: { location: 'https://evil.example/pwn.html' } },
    ]);
    await expect(fetchUrl('https://connect.trezor.io/9/iframe.html', { httpsImpl: { get } }))
      .rejects.toThrow(/disallowed/);
  });

  it('rejects a redirect that downgrades to http', async () => {
    const { get } = fakeHttps([
      { statusCode: 301, headers: { location: 'http://connect.trezor.io/9/iframe.html' } },
    ]);
    await expect(fetchUrl('https://connect.trezor.io/9/iframe.html', { httpsImpl: { get } }))
      .rejects.toThrow(/disallowed/);
  });

  it('follows an allowed same-host redirect', async () => {
    const body = 'hello';
    const { get, calls } = fakeHttps([
      { statusCode: 302, headers: { location: 'https://connect.trezor.io/9/iframe.v2.html' } },
      { statusCode: 200, headers: {}, body },
    ]);
    const buf = await fetchUrl('https://connect.trezor.io/9/iframe.html', { httpsImpl: { get } });
    expect(buf.toString()).toBe(body);
    expect(calls.length).toBe(2);
  });

  it('caps redirect depth at 3', async () => {
    // 4 consecutive redirects (loop) — the 4th must be rejected.
    const loop = {
      statusCode: 302,
      headers: { location: 'https://connect.trezor.io/9/iframe.html' },
    };
    const { get } = fakeHttps([loop, loop, loop, loop, loop]);
    await expect(fetchUrl('https://connect.trezor.io/9/iframe.html', { httpsImpl: { get } }))
      .rejects.toThrow(/Too many redirects/);
  });
});

describe('sha256 verification (M-9)', () => {
  it('accepts a matching hash', () => {
    const bytes = Buffer.from('the iframe');
    const digest = createHash('sha256').update(bytes).digest('hex');
    expect(() => verifyAsset('iframe.html', bytes, { 'iframe.html': digest })).not.toThrow();
  });

  it('throws on hash mismatch', () => {
    const bytes = Buffer.from('the iframe');
    expect(() => verifyAsset('iframe.html', bytes, { 'iframe.html': 'deadbeef' }))
      .toThrow(/Integrity check failed/);
  });

  it('throws when the manifest has no entry for the asset', () => {
    expect(() => verifyAsset('iframe.html', Buffer.from('x'), {}))
      .toThrow(/no pinned SHA-256/);
  });

  it('sha256 matches Node crypto', () => {
    const b = Buffer.from('abc');
    expect(sha256(b)).toBe(createHash('sha256').update(b).digest('hex'));
  });
});

describe('manifest loader (M-9)', () => {
  it('throws when the requested version has no manifest entry', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'trezor-manifest-'));
    const p = path.join(dir, 'manifest.json');
    writeFileSync(p, JSON.stringify({ versions: {} }));
    expect(() => loadManifestForVersion('9', p)).toThrow(/No pinned SHA-256/);
  });

  it('returns the asset map when the version is pinned', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'trezor-manifest-'));
    const p = path.join(dir, 'manifest.json');
    writeFileSync(p, JSON.stringify({ versions: { 9: { 'iframe.html': 'aa' } } }));
    expect(loadManifestForVersion('9', p)).toEqual({ 'iframe.html': 'aa' });
  });

  it('throws on invalid JSON', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'trezor-manifest-'));
    const p = path.join(dir, 'manifest.json');
    writeFileSync(p, '{not json');
    expect(() => loadManifestForVersion('9', p)).toThrow(/not valid JSON/);
  });
});
