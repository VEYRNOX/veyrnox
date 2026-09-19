// Boot watchdog. Motivation: Apple 1.0.1 rejection #3 (2026-09-10,
// iPad Air 11-inch M3 iPadOS 26.6.1) reported "blank page upon launch".
// If the app never puts anything VISIBLE on screen — bundle failed to load,
// an early module threw before RootErrorBoundary attached, a CSP block, a
// WebKit regression, or a tree that mounts and renders nothing — a
// plain-HTML fallback appears at 5s so the user never sees a blank screen.
//
// THIS FILE EXISTS BECAUSE OF CSP (#2595). The same code lived inline in
// index.html from PR #2500 until 2026-09-19 and NEVER ONCE RAN: script-src
// is 'self' 'wasm-unsafe-eval' with no 'unsafe-inline' and no hash, so the
// browser blocked it on every load, in dev and in production. Do not move
// this back inline, and do not add a sha256- hash to script-src instead —
// a hash pins the exact bytes, so the next edit to this file silently
// re-disables the watchdog with CI still green. 'self' already allows a
// same-origin src, which is why no CSP change was needed.
//
// For the same reason the Reload button is wired with addEventListener and
// NOT an inline onclick= attribute: script-src without 'unsafe-inline'
// blocks inline event handlers too, so an onclick would load fine and then
// do nothing when tapped — a Reload button that does not reload.
//
// ---------------------------------------------------------------------
// #2628: this tests for PAINT, not for mount. The previous condition was
// `if (root && root.firstChild) return;` and it was blind to the exact
// failure it was written to catch: a tree that mounts and renders nothing
// satisfies firstChild forever, so the fallback never appeared and the
// user sat on a blank screen. Reproduced deterministically — appending one
// bare <div> to #root before the deadline left the page white with
// {childCount:1, rectH:0, textLen:0, hasFallback:false} at 13s.
//
// THREE THINGS HERE ARE LOAD-BEARING. Do not "simplify" any of them.
//
// 1. The paint signal is a DESCENDANT with a non-zero box, never #root's
//    own box. src/index.css:277 sets `#root { height: 100% }` under the
//    767.98px media query, and in a production build the CSS is a separate
//    <link> that applies before any JS runs — so on mobile an EMPTY #root
//    already measures full viewport height. A root-box height check would
//    report "painted" on a blank production phone screen, which is worse
//    than the bug this replaced.
//
// 2. The fallback is an OVERLAY on <body>, not `root.innerHTML = ...`.
//    Writing innerHTML was safe only while the check fired exclusively on
//    an empty root. Now that it can fire on a MOUNTED tree, clobbering
//    #root would destroy React's live DOM and the app could never recover
//    — turning a slow boot into a permanent brick.
//
// 3. Polling CONTINUES after the fallback is shown, and the overlay is
//    removed the moment real content paints. This is what makes the
//    deadline safe rather than safety-critical: a boot that is merely slow
//    gets its card removed automatically instead of being "replaced with
//    an error screen" (#2628 step 5). In the healthy path polling stops at
//    the first tick that sees content, so steady-state cost is zero.
//
// DEADLINE_MS is INHERITED from the previous implementation, not measured.
// #2628 step 5 (define the timeout from real-device startup measurements)
// is still open. Point 3 is why shipping the inherited value is defensible
// in the meantime — do not read 5000 here as a verified number.
(function () {
  var DEADLINE_MS = 5000;
  var POLL_MS = 500;
  var MAX_NODES = 200;

  var start = Date.now();
  var overlay = null;

  // Painted == at least one descendant of #root occupies real pixels.
  // Deliberately ignores #root itself (see note 1 above).
  //
  // 1b. It also ignores #boot-shell and everything inside it. That element is
  //     index.html's static pre-JS shell: a position:fixed, inset:0 box living
  //     INSIDE #root, so it satisfies the width/height test on the very first
  //     tick. Counting it would report "painted" before React has done
  //     anything and keep reporting it forever — the watchdog would never fire
  //     again, silently, which is precisely the failure mode of #2595. The
  //     shell is not app content; it is what the user looks at INSTEAD of app
  //     content, so excluding it is the honest reading of "has the app
  //     painted". Pinned by "boot shell alone is not paint" in
  //     e2e/boot-watchdog.spec.js — do not drop either the skip or the pin.
  function hasVisibleContent(root) {
    if (!root) return false;
    var shell = document.getElementById('boot-shell');
    var els = root.querySelectorAll('*');
    var limit = els.length < MAX_NODES ? els.length : MAX_NODES;
    for (var i = 0; i < limit; i++) {
      var el = els[i];
      if (shell && (el === shell || shell.contains(el))) continue;
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return true;
    }
    return false;
  }

  function showFallback() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'veyrnox-boot-fallback';
    overlay.setAttribute('role', 'alert');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;' +
      'justify-content:center;padding:24px;background:#050608;color:#F5F7FA;' +
      'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;';
    overlay.innerHTML =
      '<div style="max-width:420px;text-align:center;">' +
        '<div style="width:56px;height:56px;margin:0 auto 16px;border-radius:14px;background:#0F141C;border:1px solid #4ADAC2;display:flex;align-items:center;justify-content:center;color:#4ADAC2;font-size:24px;font-weight:700;">V</div>' +
        '<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;">Veyrnox couldn’t start</h1>' +
        '<p style="margin:0 0 20px;color:#8B95A7;font-size:15px;line-height:1.5;">Something failed while loading the app. Your wallet data on this device is not affected. Reload to try again.</p>' +
        '<button id="veyrnox-boot-reload" style="width:100%;min-height:44px;padding:12px 16px;border-radius:12px;background:#4ADAC2;color:#050608;font-size:15px;font-weight:600;border:none;cursor:pointer;">Reload Veyrnox</button>' +
      '</div>';
    document.body.appendChild(overlay);
    var btn = document.getElementById('veyrnox-boot-reload');
    if (btn) {
      btn.addEventListener('click', function () {
        try { location.reload(); } catch (e) { /* ignore */ }
      });
    }
  }

  function hideFallback() {
    if (!overlay) return;
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  function check() {
    try {
      var root = document.getElementById('root');
      if (hasVisibleContent(root)) {
        hideFallback();
        return; // healthy — stop polling for good
      }
      if (Date.now() - start >= DEADLINE_MS) showFallback();
    } catch (e) { /* ignore */ }
    setTimeout(check, POLL_MS);
  }

  setTimeout(check, DEADLINE_MS);
})();
