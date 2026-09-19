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
//
// #2628 — WHAT IT CHECKS. The health signal used to be `root.firstChild`, i.e.
// "React mounted something". That is the wrong question, for two reasons found
// by reading main.jsx rather than by watching a screen:
//
//   1. `createRoot(...).render(...)` is the LAST statement of main.jsx, so
//      #root stays empty for the whole of module evaluation and fills the
//      instant it finishes. The check therefore flips healthy at the moment
//      the bundle finishes evaluating, whatever it then renders.
//   2. setTimeout cannot preempt synchronous work. A long evaluation of the
//      entry chunk holds the main thread, so this callback is queued until
//      evaluation completes — by which time firstChild is set. A slow boot
//      was structurally invisible to the old check: it could only ever catch
//      a bundle that never arrived at all.
//
// The signal is now the static #boot-shell element in index.html. React clears
// #root on its first commit (react-dom sets containerInfo.textContent = "" for
// an element container), so the shell's disappearance means real UI committed,
// not merely that something mounted. It also makes case 2 benign rather than
// blind: a callback deferred past a slow boot now runs after the shell is gone
// and correctly reports healthy, instead of silently passing on a set
// firstChild.
//
// If the shell is absent at boot — index.html regressed, or a stale OTA bundle
// predates it — this falls back to the old firstChild check rather than
// treating "no shell" as healthy. A missing marker must not disable the
// watchdog; that is the same silent-disable failure #2595 was.
(function () {
  var start = Date.now();
  // 10s, not the original 5s: with the shell painting immediately the user is
  // looking at the brand rather than a white screen while they wait, so buying
  // margin against a false "couldn't start" over an app that was coming up is
  // cheap. A judgement, not a measurement — no boot-duration distribution has
  // been collected on real hardware.
  var DEADLINE_MS = 10000;
  var shellAtBoot = document.getElementById('boot-shell');
  function check() {
    try {
      var root = document.getElementById('root');
      var healthy = shellAtBoot ? !shellAtBoot.isConnected : !!(root && root.firstChild);
      if (healthy) return;
      if (Date.now() - start < DEADLINE_MS) { setTimeout(check, 500); return; }
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
  setTimeout(check, DEADLINE_MS);
})();
