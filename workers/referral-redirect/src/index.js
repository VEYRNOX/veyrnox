// workers/referral-redirect/src/index.js
//
// veyrnox.com/r/<code>  ->  200  invite landing page (src/invitePage.js)
//
// Until 2026-09-14 this 302'd to https://veyrnox-prod.pages.dev/?ref=<code>,
// the web wallet. Invitees without the app landed on a wallet entry screen, and
// in any browser holding a persisted `veyrnox-demo=1` they got a seeded demo
// dashboard with no invite at all. The page is now served here and never loads
// wallet code. People WITH the app never reach it: iOS universal links and
// Android app links open the app on /r/* first.
//
// One source of truth for validation: the Pages function (functions/r/[code].js)
// still decides whether a code is valid. It is called unchanged and its
// `Location: /?ref=CODE` (valid) or `/` (fail closed) is read back. That function
// keeps serving the old redirect on the Pages host itself.
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
import { inviteResponse } from './invitePage.js';
// Bundled as text (wrangler [[rules]]; vitest: the `aasa-text` plugin in
// vitest.config.js). One file, served on the apex, versioned with the handler.
import aasa from '../../../public/.well-known/apple-app-site-association';

// Keep identical to PATH_RE in src/lib/referralAttribution.js.
export const PATH_RE = /^\/r\/([^/]+)\/?$/;

export const AASA_PATH = '/.well-known/apple-app-site-association';

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

    // The Pages function validates; its Location carries the normalised code
    // (`/?ref=CODE`) or nothing (`/`, fail closed).
    const res = onRequest({ request, params: { code } });
    const ref = new URLSearchParams((res.headers.get('Location') || '/').split('?')[1] || '').get('ref');
    return inviteResponse({
      code: ref,
      userAgent: request.headers.get('user-agent') || '',
      method: request.method,
    });
  },
};
