// veyrnox.com/r/<code> Worker (#2529).
//
// Pins the one thing the wrapper adds — an ABSOLUTE Location on the app host —
// and that it inherits the Pages function's fail-closed handling unchanged.
// A relative Location here is the bug this Worker exists to fix: relative to
// veyrnox.com it lands on the marketing site's 404.

import { describe, it, expect } from 'vitest';
import worker, { APP_ORIGIN } from '../src/index.js';

const hit = (path, { method = 'GET', host = 'veyrnox.com' } = {}) =>
  worker.fetch(new Request(`https://${host}${path}`, { method }));

describe('veyrnox.com/r/<code> Worker', () => {
  it('redirects a valid code to the app host with ?ref=', () => {
    const res = hit('/r/VYX-STRKLB');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(`${APP_ORIGIN}/?ref=VYX-STRKLB`);
  });

  it('the Location is absolute and on the app origin, never veyrnox.com', () => {
    const loc = new URL(hit('/r/VYX-STRKLB').headers.get('Location'));
    expect(loc.origin).toBe(APP_ORIGIN);
    expect(loc.hostname).not.toMatch(/veyrnox\.com$/);
  });

  it('normalises case the same way the Pages function does', () => {
    expect(hit('/r/vyx-strklb').headers.get('Location')).toBe(`${APP_ORIGIN}/?ref=VYX-STRKLB`);
  });

  it.each([
    ['a malformed code', '/r/VYX-STRIKE'],       // I is not in the alphabet
    ['injected query text', '/r/VYX-STRKLB%26x'],
    ['no code', '/r/'],
    ['a nested path', '/r/VYX-STRKLB/extra'],
  ])('fails closed on %s: app root, no ref', (_label, path) => {
    const res = hit(path);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(`${APP_ORIGIN}/`);
  });

  it('serves www.veyrnox.com identically', () => {
    expect(hit('/r/VYX-STRKLB', { host: 'www.veyrnox.com' }).headers.get('Location'))
      .toBe(`${APP_ORIGIN}/?ref=VYX-STRKLB`);
  });

  it('answers HEAD (link previewers) like GET', () => {
    const res = hit('/r/VYX-STRKLB', { method: 'HEAD' });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(`${APP_ORIGIN}/?ref=VYX-STRKLB`);
  });

  it('keeps the Pages function’s hygiene headers', () => {
    const res = hit('/r/VYX-STRKLB');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
  });
});
