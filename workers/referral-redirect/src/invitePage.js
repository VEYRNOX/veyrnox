// workers/referral-redirect/src/invitePage.js
//
// The page a person sees when they tap a Veyrnox invite link WITHOUT the app
// installed. With the app installed, iOS universal links and Android app links
// open the app before this page is ever requested.
//
// Replaces a 302 into the web wallet (/?ref=CODE on veyrnox-prod.pages.dev).
// That landed invitees on a wallet entry screen, with the invite as a card under
// four tiles, and in any browser holding a persisted `veyrnox-demo=1` it showed
// a seeded demo dashboard and no invite at all (src/api/demoClient.js).
//
// Deliberately plain: no wallet code, no cookies, no storage, no analytics, no
// third-party requests (inline SVG; system fonts only, so the CSS names no
// brand font it cannot load). The clipboard is written
// only from a tap. CSP allows exactly one inline <style> and one inline
// <script>, via a per-response nonce.

// Same store listings the app uses (ReferralHandoff.jsx, referralAttribution.js).
export const APP_STORE_URL = 'https://apps.apple.com/app/id6790188660';
export const playStoreUrl = (code) =>
  'https://play.google.com/store/apps/details?id=com.veyrnox.app&referrer='
  + encodeURIComponent(`ref=${code}`);
const PLAY_PLAIN_URL = 'https://play.google.com/store/apps/details?id=com.veyrnox.app';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Platform only reorders the buttons; both are always shown.
export const platformOf = (ua = '') =>
  /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'other';

// Copy of public/veyrnox-icon.svg (inlined: this page makes no requests).
const LOGO = `<svg class="logo" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="h" x1="120" y1="80" x2="392" y2="432" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7BEBD7"/><stop offset="1" stop-color="#32B6A0"/></linearGradient><linearGradient id="v" x1="188" y1="180" x2="324" y2="340" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#86EEDB"/><stop offset="1" stop-color="#3CC3AD"/></linearGradient><linearGradient id="f" x1="256" y1="104" x2="256" y2="408" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#12211F"/><stop offset="1" stop-color="#0A0F12"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="#0B0F14"/><path d="M169 104 L343 104 L431 256 L343 408 L169 408 L81 256 Z" fill="url(#f)" stroke="url(#h)" stroke-width="20" stroke-linejoin="round"/><path d="M188 188 L256 330 L324 188" fill="none" stroke="url(#v)" stroke-width="42" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const CSS = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
  background:radial-gradient(120% 70% at 50% 0%,#0f2723 0%,#050608 60%);color:#e6eaef;
  font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{width:100%;max-width:420px;text-align:center}
.logo{width:64px;height:64px;display:block;margin:0 auto 16px}
.word{letter-spacing:.32em;font-weight:700;font-size:14px;color:#aeb7c2;margin:0 0 28px}
h1{font-size:26px;line-height:1.25;margin:0 0 8px;font-weight:700}
.sub{color:#9aa4b1;margin:0 0 28px}
.card{background:#0c1116;border:1px solid #1d222b;border-radius:16px;padding:20px;margin:0 0 20px}
.label{font-size:13px;color:#9aa4b1;margin:0 0 8px}
.code{font:600 28px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;
  color:#e6eaef;user-select:all;-webkit-user-select:all;margin:0 0 16px;word-break:break-all}
.btn{display:block;width:100%;padding:14px 16px;border-radius:12px;font-family:inherit;font-size:16px;font-weight:600;line-height:1.2;text-decoration:none;
  border:1px solid #546178;background:#111820;color:#e6eaef;cursor:pointer;margin:0 0 12px}
.btn:focus-visible{outline:2px solid #4adac2;outline-offset:2px}
.primary{background:#4adac2;border-color:#4adac2;color:#062019}
.card .btn{margin:0}
.status{font-size:14px;color:#4adac2;margin:0}
.status[data-state="error"]{color:#e7b14c}
.status:not(:empty){margin-top:10px}
ol{text-align:left;color:#b8c0ca;padding-left:20px;margin:8px 0 24px}
li{margin:0 0 6px}
.fine{font-size:13px;color:#7f8a97;margin:0}
`;

const SCRIPT = `
(function(){
  var code = document.body.getAttribute('data-code');
  var status = document.getElementById('status');
  function copy(){
    if (!code || !navigator.clipboard) return Promise.reject();
    return navigator.clipboard.writeText(code);
  }
  // Clear, then write after a beat, so a repeated result is a real change
  // that screen readers announce again.
  function say(msg, state){
    if (!status) return;
    status.textContent = '';
    status.setAttribute('data-state', state);
    setTimeout(function(){ status.textContent = msg; }, 50);
  }
  var els = document.querySelectorAll('[data-copy]');
  for (var i = 0; i < els.length; i++) {
    els[i].addEventListener('click', function(e){
      var el = this;
      var go = el.getAttribute('href');
      // After a failed copy the store button is a plain link.
      if (el.hasAttribute('data-copy-failed')) return;
      if (go) e.preventDefault();
      copy().then(function(){
        say('Code copied', 'ok');
        if (go) window.location.href = go;
      }, function(){
        // Stay on the page: leaving now would hide this and lose the code.
        if (go) {
          el.setAttribute('data-copy-failed', '');
          el.textContent = 'Continue to the App Store';
          say('Copy failed. Press and hold the code to copy it, then tap Continue to the App Store.', 'error');
        } else {
          say('Copy failed. Press and hold the code to copy it.', 'error');
        }
      });
    });
  }
})();
`;

function storeButtons(code, platform) {
  const apple = code
    ? `<a class="btn ${platform === 'android' ? '' : 'primary'}" href="${APP_STORE_URL}" data-copy>Copy code &amp; get it on the App Store</a>`
    : `<a class="btn ${platform === 'android' ? '' : 'primary'}" href="${APP_STORE_URL}">Download on the App Store</a>`;
  const google = code
    ? `<a class="btn ${platform === 'android' ? 'primary' : ''}" href="${esc(playStoreUrl(code))}">Get it on Google Play</a>`
    : `<a class="btn ${platform === 'android' ? 'primary' : ''}" href="${PLAY_PLAIN_URL}">Get it on Google Play</a>`;
  return platform === 'android' ? google + apple : apple + google;
}

export function renderInvitePage({ code, userAgent = '', nonce }) {
  const platform = platformOf(userAgent);
  const title = code ? 'You’ve been invited to Veyrnox' : 'This invite link isn’t valid';
  const body = code
    ? `<h1>You’ve been invited to Veyrnox</h1>
<p class="sub">A self-custody crypto wallet. Your keys stay on your device.</p>
<section class="card">
  <p class="label">Your invite code</p>
  <p class="code">${esc(code)}</p>
  <button class="btn" type="button" data-copy>Copy code</button>
  <p class="status" id="status" role="status" aria-live="polite"></p>
</section>
${storeButtons(code, platform)}
<ol>
  <li>Install Veyrnox.</li>
  <li>Open it and tap <strong>Have a referral code?</strong></li>
  <li>Tap <strong>Paste</strong>, then <strong>Apply</strong>. On Android, installing from the Google Play button above applies the code for you.</li>
</ol>
<p class="fine">Already have Veyrnox? Open this link on your phone and it opens the app.</p>`
    : `<h1>This invite link isn’t valid</h1>
<p class="sub">Ask the person who invited you to share their link again. You can still get Veyrnox:</p>
${storeButtons(null, platform)}`;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${title}</title>
<meta property="og:title" content="${title}">
<meta property="og:description" content="Veyrnox is a self-custody crypto wallet. Your keys stay on your device.">
<style nonce="${nonce}">${CSS}</style>
</head>
<body data-code="${code ? esc(code) : ''}"><main>
${LOGO}
<p class="word">VEYRNOX</p>
${body}
</main>
${code ? `<script nonce="${nonce}">${SCRIPT}</script>` : ''}
</body></html>`;
}

export function inviteResponse({ code, userAgent, method }) {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    'Permissions-Policy': 'clipboard-write=(self), camera=(), microphone=(), geolocation=()',
  };
  const status = code ? 200 : 404;
  const html = method === 'HEAD' ? null : renderInvitePage({ code, userAgent, nonce });
  return new Response(html, { status, headers });
}
