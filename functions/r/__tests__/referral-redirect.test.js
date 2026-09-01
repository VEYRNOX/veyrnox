import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { onRequest } from '../[code].js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

const call = (code, method = 'GET') =>
  onRequest({ params: { code }, request: new Request('https://veyrnox.example/r/x', { method }) });

const locationOf = (res) => res.headers.get('Location');

describe('/r/:code referral redirect Function (#2214)', () => {
  // THE regression test. Both previous attempts emitted a literal placeholder
  // (`/?ref=:code`, then `/?ref=:splat`) and shipped to production, because the
  // only test asserted the CONTENTS of public/_redirects rather than behaviour.
  it('substitutes the actual code into the redirect', () => {
    const res = call('VYX-ABC234');
    expect(res.status).toBe(302);
    expect(locationOf(res)).toBe('/?ref=VYX-ABC234');
  });

  it('never emits a literal placeholder', () => {
    for (const code of ['VYX-ABC234', 'VYX-ZZZ999', 'VYX-BCD345']) {
      const loc = locationOf(call(code));
      expect(loc).not.toContain(':code');
      expect(loc).not.toContain(':splat');
      expect(loc).toBe(`/?ref=${code}`);
    }
  });

  it('uppercases and trims, matching captureReferralFromUrl', () => {
    expect(locationOf(call('vyx-abc234'))).toBe('/?ref=VYX-ABC234');
    expect(locationOf(call(' VYX-ABC234 '))).toBe('/?ref=VYX-ABC234');
  });

  it('accepts a percent-encoded code', () => {
    expect(locationOf(call('VYX%2DABC234'))).toBe('/?ref=VYX-ABC234');
  });

  // Fail closed (I4): anything that is not a well-formed code drops the ref
  // rather than forwarding attacker-controlled text into the SPA query string.
  it.each([
    ['empty', ''],
    ['wrong prefix', 'ABC-123456'],
    ['too short', 'VYX-ABC23'],
    ['too long', 'VYX-ABC2345'],
    ['excluded alphabet (I/O/0/1)', 'VYX-ABCI01'],
    ['literal placeholder :code', ':code'],
    ['literal placeholder :splat', ':splat'],
    ['crlf header injection', 'VYX-ABC234\r\nX-Injected: 1'],
    ['absolute url (open redirect)', 'https://evil.example'],
    ['protocol-relative (open redirect)', '//evil.example'],
    ['path traversal', '../../etc/passwd'],
    ['malformed percent escape', '%E0%A4%A'],
  ])('fails closed on %s', (_label, code) => {
    const res = call(code);
    expect(res.status).toBe(302);
    expect(locationOf(res)).toBe('/');
  });

  it('rejects a nested path (params.code is not a string)', () => {
    expect(locationOf(onRequest({ params: { code: ['VYX-ABC234', 'extra'] }, request: new Request('https://x/') }))).toBe('/');
  });

  it('emits only a relative Location, never an absolute URL', () => {
    for (const code of ['VYX-ABC234', 'https://evil.example', '//evil.example', ':splat']) {
      expect(locationOf(call(code)).startsWith('/')).toBe(true);
      expect(locationOf(call(code)).startsWith('//')).toBe(false);
    }
  });

  it('handles HEAD (link previewers) the same as GET', () => {
    expect(locationOf(call('VYX-ABC234', 'HEAD'))).toBe('/?ref=VYX-ABC234');
  });

  // Drift guard: the Function duplicates CODE_RE from the client. If the client
  // alphabet changes and this does not, valid links start bouncing to '/'.
  it('CODE_RE stays identical to src/lib/referralAttribution.js', () => {
    const client = readFileSync(path.join(repoRoot, 'src/lib/referralAttribution.js'), 'utf8');
    const fn = readFileSync(path.join(here, '../[code].js'), 'utf8');
    const re = (src) => src.match(/const CODE_RE = (\/\^VYX-\[[^\]]+\]\{6\}\$\/)/)?.[1];
    expect(re(client), 'client CODE_RE not found — pattern moved?').toBeTruthy();
    expect(re(fn)).toBe(re(client));
  });

  // Anti-restore guard. A /r/ rule in _redirects is dead once a Function serves
  // the path, and re-adding one is how this bug returns.
  it('public/_redirects declares no /r/ rule', () => {
    const redirects = readFileSync(path.join(repoRoot, 'public/_redirects'), 'utf8');
    const rules = redirects.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
    expect(rules.some((l) => l.startsWith('/r/'))).toBe(false);
    expect(rules.join('\n')).not.toContain('ref=:');
  });
});
