// workers/referral-redirect/src/index.js
//
// veyrnox.com/r/<code>  ->  302  https://veyrnox-prod.pages.dev/?ref=<code>
//
// One source of truth: the validation and the fail-closed behaviour are the
// Pages function's (functions/r/[code].js), imported here rather than copied.
// That function answers with a RELATIVE Location (`/?ref=…` or `/`), which is
// right on the Pages host and wrong here — relative to veyrnox.com it would
// bounce the visitor straight back onto the marketing site's 404. The only
// thing this wrapper adds is the absolute app origin.
//
// The Pages runtime hands the function `params.code` as a string for
// /r/<one-segment> and an array for anything deeper; the function treats the
// array as "not a referral link". Reproduce exactly that shape from the path so
// its nested-path branch keeps behaving the same on both hosts.
import { onRequest } from '../../../functions/r/[code].js';
// Bundled as text (wrangler [[rules]]; vitest: the `aasa-text` plugin in
// vitest.config.js). One file, served on the apex, versioned with the handler.
import aasa from '../../../public/.well-known/apple-app-site-association';

export const AASA_PATH = '/.well-known/apple-app-site-association';

// The host that actually serves the wallet app. veyrnox.com is not it (#2529).
export const APP_ORIGIN = 'https://veyrnox-prod.pages.dev';

export default {
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === AASA_PATH) {
      // Apple requires 200 + JSON, no redirect. Short cache: Apple's CDN
      // re-fetches on its own schedule; a stale edge copy only delays a path
      // change, never breaks an existing one.
      return new Response(aasa, {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      });
    }
    const segments = pathname.split('/').filter(Boolean); // ['r', code, ...]
    const rest = segments.slice(1);
    const code = rest.length === 1 ? rest[0] : rest;

    const res = onRequest({ request, params: { code } });
    const headers = new Headers(res.headers);
    headers.set('Location', new URL(res.headers.get('Location') || '/', APP_ORIGIN).toString());
    return new Response(null, { status: res.status, headers });
  },
};
