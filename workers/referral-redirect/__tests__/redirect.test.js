// veyrnox.com/r/<code> Worker (#2529): the invite landing page.
//
// Until 2026-09-14 this Worker 302'd into the web wallet, where invitees landed
// on a wallet entry screen, or on a seeded demo dashboard in any browser holding
// `veyrnox-demo=1`. It now serves a standalone page, and must never send anyone
// into the wallet. Validation is still the Pages function's (fail closed).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import worker, { AASA_PATH, PATH_RE } from '../src/index.js';
import { APP_STORE_URL, playStoreUrl, renderInvitePage } from '../src/invitePage.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36';

const hit = (path, { method = 'GET', host = 'veyrnox.com', ua = IPHONE } = {}) =>
  worker.fetch(new Request(`https://${host}${path}`, { method, headers: { 'user-agent': ua } }));
const html = async (path, opts) => (await hit(path, opts).text());
const read = (p) => readFileSync(resolve(__dirname, '../../..', p), 'utf8');

describe('veyrnox.com/r/<code> invite page', () => {
  it('serves a 200 HTML page for a valid code, never a redirect', async () => {
    const res = hit('/r/VYX-STRKLB');
    expect(res.status).toBe(200);
    expect(res.headers.get('Location')).toBeNull();
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    const body = await res.text();
    expect(body).toContain('You’ve been invited to Veyrnox');
    expect(body).toContain('<p class="code">VYX-STRKLB</p>');
    expect(body).toContain('data-code="VYX-STRKLB"');
  });

  it('never points into the web wallet (the demo-dashboard trap)', async () => {
    const body = await html('/r/VYX-STRKLB');
    expect(body).not.toMatch(/pages\.dev|\?ref=|demo/i);
  });

  it('offers both stores: App Store copies the code, Google Play carries the Install Referrer', async () => {
    const body = await html('/r/VYX-STRKLB');
    expect(body).toContain(`href="${APP_STORE_URL}" data-copy>Copy code &amp; get it on the App Store</a>`);
    expect(body).toContain('href="https://play.google.com/store/apps/details?id=com.veyrnox.app&amp;referrer=ref%3DVYX-STRKLB"');
    expect(body).toContain('<button class="btn" type="button" data-copy>Copy code</button>');
  });

  it('leads with the visitor\'s platform', async () => {
    const ios = await html('/r/VYX-STRKLB', { ua: IPHONE });
    const android = await html('/r/VYX-STRKLB', { ua: ANDROID });
    expect(ios.indexOf('App Store')).toBeLessThan(ios.indexOf('Google Play'));
    expect(android.indexOf('Google Play')).toBeLessThan(android.indexOf('App Store'));
    expect(android).toMatch(/class="btn primary" href="https:\/\/play\.google\.com/);
    expect(ios).toContain(`class="btn primary" href="${APP_STORE_URL}"`);
  });

  it('normalises case the same way the Pages function does', async () => {
    expect(await html('/r/vyx-strklb')).toContain('<p class="code">VYX-STRKLB</p>');
  });

  it.each([
    ['a malformed code', '/r/VYX-STRIKE'],       // I is not in the alphabet
    ['injected query text', '/r/VYX-STRKLB%26x'],
    ['no code', '/r/'],
    ['a nested path', '/r/VYX-STRKLB/extra'],
    // #2534: filter(Boolean) collapsed these to a valid single segment. Pages
    // routing never sends them to the function (verified live 2026-09-12).
    ['a doubled leading slash', '/r//VYX-STRKLB'],
    ['a doubled trailing slash', '/r/VYX-STRKLB//'],
  ])('fails closed on %s: 404 invalid-invite page, no code, no referrer', async (_label, path) => {
    const res = hit(path);
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain('This invite link isn’t valid');
    expect(body).toContain('data-code=""');
    expect(body).not.toContain('referrer=');
    expect(body).not.toContain('data-copy');
  });

  // Pages runs [code].js for ONE trailing slash (verified live 2026-09-12), so
  // the Worker must too — otherwise the same link attributes on one host only.
  it('accepts a single trailing slash, as Pages routing does', async () => {
    expect(hit('/r/VYX-STRKLB/').status).toBe(200);
  });

  it('uses the same path rule as the native reader', () => {
    expect(read('src/lib/referralAttribution.js')).toContain(`const PATH_RE = ${PATH_RE};`);
  });

  it('uses the same store listings as the app', () => {
    expect(read('src/components/ReferralHandoff.jsx')).toContain(`const APP_STORE_URL = "${APP_STORE_URL}";`);
    const attribution = read('src/lib/referralAttribution.js');
    expect(attribution).toContain("'https://play.google.com/store/apps/details?id=com.veyrnox.app&referrer='");
    expect(attribution).toContain('encodeURIComponent(`ref=${code}`)');
    expect(playStoreUrl('VYX-STRKLB')).toBe('https://play.google.com/store/apps/details?id=com.veyrnox.app&referrer=ref%3DVYX-STRKLB');
  });

  it('serves www.veyrnox.com identically', async () => {
    expect(hit('/r/VYX-STRKLB', { host: 'www.veyrnox.com' }).status).toBe(200);
  });

  it('answers HEAD (link previewers) with the same status and headers, no body', async () => {
    const res = hit('/r/VYX-STRKLB', { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(await res.text()).toBe('');
  });

  it('sends the hygiene headers and a nonce CSP that matches the one inline style and script', async () => {
    const res = hit('/r/VYX-STRKLB');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toMatch(/default-src 'none'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    const nonce = csp.match(/script-src 'nonce-([0-9a-f]+)'/)[1];
    expect(csp).toContain(`style-src 'nonce-${nonce}'`);
    const body = await res.text();
    expect(body.match(/<script\b[^>]*>/gi)).toEqual([`<script nonce="${nonce}">`]);
    expect(body.match(/<style\b[^>]*>/gi)).toEqual([`<style nonce="${nonce}">`]);
    expect(hit('/r/VYX-STRKLB').headers.get('Content-Security-Policy')).not.toContain(nonce);
  });

  it('loads nothing from anywhere: no external scripts, styles, fonts, images or inline style attributes', async () => {
    const body = await html('/r/VYX-STRKLB');
    expect(body).not.toMatch(/<(link|img|iframe)\b/i);
    expect(body).not.toMatch(/\bsrc=/i);
    expect(body).not.toMatch(/\sstyle="/i);
    expect(body).not.toMatch(/@import|url\(\s*['"]?https?:/i);
  });

  it('writes the clipboard only from a tap', async () => {
    const body = await html('/r/VYX-STRKLB');
    const scriptStart = body.indexOf('>', body.indexOf('<script')) + 1;
    const scriptEnd = body.lastIndexOf('</script>');
    const script = body.slice(scriptStart, scriptEnd);
    expect(script).toContain("addEventListener('click'");
    expect(script.match(/clipboard\.writeText/g)).toHaveLength(1);
    // copy() is defined once and called exactly once, inside the click handler.
    const calls = [...script.matchAll(/\bcopy\(\)/g)].map((m) => m.index);
    const defn = script.indexOf('function copy()');
    const handler = script.indexOf("addEventListener('click'");
    expect(calls.filter((i) => i !== defn + 'function '.length)).toHaveLength(1);
    expect(calls.filter((i) => i !== defn + 'function '.length)[0]).toBeGreaterThan(handler);
    expect(script).not.toMatch(/readText|DOMContentLoaded|onload/);
  });

  // Runs the page script against a minimal stub DOM (no jsdom needed).
  const runScript = async (body, { clipboard } = {}) => {
    const scriptStart = body.indexOf('>', body.indexOf('<script')) + 1;
    const script = body.slice(scriptStart, body.lastIndexOf('</script>'));
    const writes = [];
    const el = (attrs) => {
      const a = { ...attrs };
      const node = {
        text: attrs.text, handler: null,
        getAttribute: (k) => (k in a ? a[k] : null),
        setAttribute: (k, v) => { a[k] = v; },
        hasAttribute: (k) => k in a,
        addEventListener: (_t, fn) => { node.handler = fn; },
        set textContent(v) { node.text = v; writes.push(v); },
        get textContent() { return node.text; },
      };
      return node;
    };
    const status = el({});
    const code = body.match(/data-code="([^"]*)"/)[1];
    const button = el({ 'data-copy': '' });
    const store = el({ 'data-copy': '', href: APP_STORE_URL, text: 'Copy code & get it on the App Store' });
    const document = {
      body: { getAttribute: () => code },
      getElementById: () => status,
      querySelectorAll: () => [button, store],
    };
    const window = { location: { href: 'https://veyrnox.com/r/VYX-STRKLB' } };
    const timers = [];
    new Function('document', 'navigator', 'window', 'setTimeout', script)(
      document, { clipboard }, window, (fn) => timers.push(fn));
    const flush = async () => { await new Promise((r) => setImmediate(r)); timers.splice(0).forEach((fn) => fn()); };
    const click = async (node) => {
      const e = { prevented: false, preventDefault() { this.prevented = true; } };
      node.handler.call(node, e);
      await flush();
      return e;
    };
    return { status, button, store, window, writes, click };
  };

  it('a failed copy on the App Store button stays on the page and says so', async () => {
    const t = await runScript(await html('/r/VYX-STRKLB'), { clipboard: { writeText: () => Promise.reject(new Error('denied')) } });
    const e = await t.click(t.store);
    expect(e.prevented).toBe(true);
    expect(t.window.location.href).not.toBe(APP_STORE_URL);
    expect(t.status.textContent).toMatch(/^Copy failed/);
    expect(t.status.getAttribute('data-state')).toBe('error');
    expect(t.store.textContent).toBe('Continue to the App Store');
    // Second tap is a plain link: no preventDefault, so the browser follows href.
    const again = await t.click(t.store);
    expect(again.prevented).toBe(false);
  });

  it('treats a missing clipboard API as a failed copy', async () => {
    const t = await runScript(await html('/r/VYX-STRKLB'), { clipboard: undefined });
    await t.click(t.store);
    expect(t.window.location.href).not.toBe(APP_STORE_URL);
    expect(t.status.getAttribute('data-state')).toBe('error');
  });

  it('a successful copy on the App Store button goes to the store', async () => {
    const copied = [];
    const t = await runScript(await html('/r/VYX-STRKLB'), { clipboard: { writeText: (c) => { copied.push(c); return Promise.resolve(); } } });
    await t.click(t.store);
    expect(copied).toEqual(['VYX-STRKLB']);
    expect(t.window.location.href).toBe(APP_STORE_URL);
    expect(t.status.getAttribute('data-state')).toBe('ok');
  });

  it('re-announces a repeated copy result by clearing the live region first', async () => {
    const t = await runScript(await html('/r/VYX-STRKLB'), { clipboard: { writeText: () => Promise.resolve() } });
    await t.click(t.button);
    await t.click(t.button);
    expect(t.writes).toEqual(['', 'Code copied', '', 'Code copied']);
  });

  it('keeps teal for success only, and names no brand font it cannot load', async () => {
    const body = await html('/r/VYX-STRKLB');
    const css = body.slice(body.indexOf('<style'), body.indexOf('</style>'));
    expect(css).toContain('.status[data-state="error"]{color:#e7b14c}');
    expect(css).not.toMatch(/\.code\{[^}]*#4adac2/);
    expect(css).not.toMatch(/Schibsted Grotesk|IBM Plex Mono/);
    // --border token (218 18% 40%): the raised-contrast value, not #2f3a47.
    expect(css).toContain('border:1px solid #546178');
  });

  it('escapes the code even if a caller skipped validation', () => {
    const page = renderInvitePage({ code: '<img src=x onerror=alert(1)>', nonce: 'n' });
    expect(page).not.toContain('<img');
    expect(page).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('veyrnox.com apple-app-site-association (#2527)', () => {
  const onDisk = readFileSync(resolve(__dirname, '../../../public/.well-known/apple-app-site-association'), 'utf8');

  it('serves the repo file byte-for-byte as JSON, 200, no redirect', async () => {
    const res = hit(AASA_PATH);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Location')).toBeNull();
    expect(await res.text()).toBe(onDisk);
  });

  it('claims /r/* for the app', async () => {
    const body = JSON.parse(await hit(AASA_PATH).text());
    const paths = body.applinks.details.flatMap((d) => d.components.map((c) => c['/']));
    expect(paths).toContain('/r/*');
  });
});
