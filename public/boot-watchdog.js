// Boot watchdog. Motivation: Apple 1.0.1 rejection #3 (2026-09-10,
// iPad Air 11-inch M3 iPadOS 26.6.1) reported "blank page upon launch".
// If React never mounts anything into #root — bundle failed to load,
// an early module threw before RootErrorBoundary attached, a CSP block,
// a WebKit regression — a plain-HTML fallback appears at 5s so the
// user never sees a blank screen.
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
(function () {
  var start = Date.now();
  function check() {
    try {
      var root = document.getElementById('root');
      if (root && root.firstChild) return; // React mounted
      if (Date.now() - start < 5000) { setTimeout(check, 500); return; }
      if (!root) return;
      root.innerHTML =
        '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#050608;color:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;">' +
          '<div style="max-width:420px;text-align:center;">' +
            '<div style="width:56px;height:56px;margin:0 auto 16px;border-radius:14px;background:#0F141C;border:1px solid #4ADAC2;display:flex;align-items:center;justify-content:center;color:#4ADAC2;font-size:24px;font-weight:700;">V</div>' +
            '<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;">Veyrnox couldn’t start</h1>' +
            '<p style="margin:0 0 20px;color:#8B95A7;font-size:15px;line-height:1.5;">Something failed while loading the app. Your wallet data on this device is not affected. Reload to try again.</p>' +
            '<button id="veyrnox-boot-reload" style="width:100%;min-height:44px;padding:12px 16px;border-radius:12px;background:#4ADAC2;color:#050608;font-size:15px;font-weight:600;border:none;cursor:pointer;">Reload Veyrnox</button>' +
          '</div>' +
        '</div>';
      var btn = document.getElementById('veyrnox-boot-reload');
      if (btn) {
        btn.addEventListener('click', function () {
          try { location.reload(); } catch (e) { /* ignore */ }
        });
      }
    } catch (e) { /* ignore */ }
  }
  setTimeout(check, 5000);
})();
