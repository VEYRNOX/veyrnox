// The three places a universal/app link for /r/<code> has to agree (#2527):
// Apple's association file, the Android manifest, and the handler. A path
// claimed in one and not the others is a link that opens the app and drops
// the code — or opens the browser and never reaches the app.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..', '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

describe('/r/<code> universal-link association', () => {
  it('AASA claims /r/* for the app', () => {
    const aasa = JSON.parse(read('public/.well-known/apple-app-site-association'));
    const components = aasa.applinks.details.flatMap((d) => d.components);
    expect(components.some((c) => c['/'] === '/r/*')).toBe(true);
    // And still claims the two paths that were there before — a rewrite that
    // dropped one would silently break pairing or the Transak return.
    expect(components.some((c) => c['/'] === '/wc*')).toBe(true);
    expect(components.some((c) => c['/'] === '/buy/return*')).toBe(true);
  });

  it('Android manifest has an autoVerify filter for veyrnox.com/r/', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const filters = manifest.split('<intent-filter').slice(1);
    const rFilter = filters.find((f) => f.includes('android:pathPrefix="/r/"'));
    expect(rFilter).toBeDefined();
    expect(rFilter.startsWith(' android:autoVerify="true"')).toBe(true);
    expect(rFilter).toContain('android:host="veyrnox.com"');
    expect(rFilter).toContain('android:scheme="https"');
  });

  it('DeepLinkHandler routes veyrnox.com/r/ to the referral capture', () => {
    const src = read('src/components/DeepLinkHandler.jsx');
    expect(src).toContain("u.pathname.startsWith('/r/')");
    expect(src).toContain("captureReferralFromUrl(u, 'universal_link')");
  });
});
