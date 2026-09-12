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
// Which paths reach the function is decided by Pages routing, not by the
// function, so the Worker has to reproduce that match itself. Measured on the
// live Pages host 2026-09-12 (#2534), not inferred from the docs:
//   /r/CODE, /r/CODE/                          -> function runs (302 ?ref=CODE)
//   /r//CODE, /r/CODE//, /r/CODE/extra, /r/    -> no function (SPA, no ref)
// PATH_RE is that rule, and src/lib/referralAttribution.js (native) uses the
// same one. A non-match is handed over as an array, which the function treats
// as "not a referral link". Do not split-and-filter the path: filter(Boolean)
// collapses empty segments and accepted /r//CODE, which Pages does not.
import { onRequest } from '../../../functions/r/[code].js';
// Bundled as text (wrangler [[rules]]; vitest: the `aasa-text` plugin in
// vitest.config.js). One file, served on the apex, versioned with the handler.
import aasa from '../../../public/.well-known/apple-app-site-association';

// Keep identical to PATH_RE in src/lib/referralAttribution.js.
export const PATH_RE = /^\/r\/([^/]+)\/?$/;

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
    const m = PATH_RE.exec(pathname);
    const code = m ? m[1] : [];

    const res = onRequest({ request, params: { code } });
    const headers = new Headers(res.headers);
    headers.set('Location', new URL(res.headers.get('Location') || '/', APP_ORIGIN).toString());
    return new Response(null, { status: res.status, headers });
  },
};
