// functions/r/[code].js
//
// Referral share links: /r/VYX-ABC234  ->  302  /?ref=VYX-ABC234
//
// WHY A FUNCTION AND NOT `_redirects` (#2214) — do not "simplify" this back.
// The rule lived in public/_redirects as `/r/:code  /?ref=:code  302` and never
// substituted the placeholder: every request 302'd to the LITERAL `/?ref=:code`.
// It was then changed to splat syntax (`/r/*  /?ref=:splat`) and emitted the
// literal `/?ref=:splat` instead — same bug, new string. Two syntaxes, both
// literal, verified live on veyrnox-prod.pages.dev.
//
// Cloudflare's docs say placeholders in a destination query string are supported
// (`/products/:code/:name  /products?code=:code&name=:name`), so this is not a
// documented limitation and the cause was never established. A Function does not
// depend on that behaviour at all, and Pages gives it precedence: "Redirects
// defined in the _redirects file are not applied to requests served by Pages
// Functions, even if the Function route matches the URL pattern."
//
// The failure was silent by construction — captureReferralFromUrl() validates
// against CODE_RE and simply returns early on a bad code, so a broken link looks
// identical to a visitor with no referral. Nothing errors; the referrer just
// never gets credit. Any change here must be accepted on LIVE behaviour:
//
//   curl -sSI https://veyrnox-prod.pages.dev/r/VYX-ABC234 | grep -i location
//   # want: location: /?ref=VYX-ABC234
//
// A test asserting the contents of _redirects cannot tell a working rule from a
// broken one. That is exactly how this shipped to production twice.

// Mirrors CODE_RE in src/lib/referralAttribution.js. Crockford-style alphabet:
// no I, L, O, U, 0, 1. Kept in sync deliberately — a code this rejects would be
// dropped by the client anyway, so rejecting it here avoids a pointless bounce.
const CODE_RE = /^VYX-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

const seeOther = (location) =>
  new Response(null, {
    status: 302,
    headers: {
      // Relative, and built only from a value that passed CODE_RE — never the
      // raw path segment. Guards against header injection and open redirect.
      Location: location,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });

// Single onRequest handler: a share link is followed by GET, and by HEAD from
// link previewers (the case public/_redirects was written for). Everything else
// falls through to the same safe destination rather than 405-ing a human.
export function onRequest(context) {
  const raw = context.params?.code;
  // params.code is a string for /r/<one-segment>; an array means a nested path,
  // which is not a referral link.
  let code = '';
  if (typeof raw === 'string') {
    // A malformed %-escape throws; treat it as an unparseable code, not a 500.
    try {
      code = decodeURIComponent(raw).trim().toUpperCase();
    } catch {
      code = '';
    }
  }

  // Fail closed: an unparseable code drops the ref entirely rather than
  // forwarding attacker-controlled text into the SPA's query string.
  if (!CODE_RE.test(code)) return seeOther('/');

  return seeOther(`/?ref=${encodeURIComponent(code)}`);
}
