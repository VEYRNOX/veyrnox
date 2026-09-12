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

// The host that actually serves the wallet app. veyrnox.com is not it (#2529).
export const APP_ORIGIN = 'https://veyrnox-prod.pages.dev';

export default {
  fetch(request) {
    const segments = new URL(request.url).pathname.split('/').filter(Boolean); // ['r', code, ...]
    const rest = segments.slice(1);
    const code = rest.length === 1 ? rest[0] : rest;

    const res = onRequest({ request, params: { code } });
    const headers = new Headers(res.headers);
    headers.set('Location', new URL(res.headers.get('Location') || '/', APP_ORIGIN).toString());
    return new Response(null, { status: res.status, headers });
  },
};
