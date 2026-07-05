// src/rasp/browserProbe.js
//
// Browser-level RASP probe source (Phase 2a, web leg).
// BUILT · UNAUDITED-PROVISIONAL · NO EGRESS
//
// Fills the ProbeSource seam that detect() exposes for non-native builds.
// This is a real probe — not a native Capacitor plugin, but a genuine
// inspection of browser-observable signals. It sets available=true so
// detect() can return CLEAN (nothing found) instead of INTEGRITY_UNAVAILABLE.
//
// WHAT THIS CATCHES:
//   navigator.webdriver = true   → HOOKED  (Chrome DevTools Protocol /
//     Selenium-controlled browser; any tool that sets this flag — pytest,
//     Playwright default launch, WebDriverIO, etc.)
//   Legacy automation fingerprints → HOOKED  (PhantomJS, older Selenium)
//   HTML webdriver attribute       → HOOKED  (Playwright sometimes sets this)
//
// WHAT THIS DOES NOT CATCH (still requires a native plugin):
//   OS-level root / jailbreak, hardware tamper, debugger attachment,
//   frida hooks, Play Integrity / App Attest attestation.
//
// HONEST SCOPE. `rooted`, `emulator`, and `tampered` are always false here —
// the browser has no access to those signals. The probe is honest about its
// scope: it never claims CLEAN on dimensions it cannot assess.
//
// NON-BROWSER. When executed outside a browser (Node / Vitest) `window` is
// absent; the probe returns available=false, so detect() fails-closed to
// INTEGRITY_UNAVAILABLE (the safe default, identical to the native-less path).
//
// DENIABILITY (I3). Pure function of the ENVIRONMENT — no wallet-set handle,
// no key access, no egress. Returns byte-identical results across primary and
// decoy sessions.
//
// TIMING (RASP-A1, 2026-07-05 internal audit, HIGH). Signals are sampled FRESH on
// EVERY read of `browserProbeSource` — NOT frozen at module-load. A debugger,
// Frida, or WebDriver flag attached AFTER import must still trip the probe, so the
// sign-time read is what counts. Reading the export runs sampleSignals() again.

function sampleSignals() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return null; // not a browser — caller returns available: false
  }

  // navigator.webdriver is set to true by CDP-controlled browsers (Chrome, Firefox).
  // Spec: https://w3c.github.io/webdriver/#dom-navigatorautomationinformation-webdriver
  const webdriverFlag = navigator.webdriver === true;

  // HTML attribute: Playwright (and some Selenium configs) sets this on <html>.
  const webdriverAttr =
    typeof document !== 'undefined' &&
    document.documentElement != null &&
    (document.documentElement.hasAttribute('webdriver') ||
      document.documentElement.getAttribute('data-automation') === 'true');

  // Legacy fingerprints: PhantomJS, older Selenium wrappers.
  // Cast to any — these are non-standard properties not in the TS Window type.
  const w = /** @type {any} */ (window);
  const legacyPhantom =
    typeof w.callPhantom !== 'undefined' ||
    typeof w._phantom !== 'undefined';

  const legacySelenium =
    typeof w.__selenium_unwrapped !== 'undefined' ||
    typeof w.__webdriver_evaluate !== 'undefined' ||
    typeof w.__webdriver_script_fn !== 'undefined';

  const hooked = webdriverFlag || webdriverAttr || legacyPhantom || legacySelenium;

  return {
    hooked,
    tampered: false, // browser-inaccessible; only native probes can assess this
    emulator: false, // browser-inaccessible
    rooted: false,   // browser-inaccessible
  };
}

/**
 * Browser-level probe source for detect().
 *
 * RASP-A1 (2026-07-05 internal audit, HIGH): `available` and `signals` are GETTERS
 * that re-sample the environment FRESH on EVERY read — NOT a module-load snapshot.
 * detect(browserProbeSource) reads these properties at sign time, so a WebDriver
 * flag / debugger / Frida hook attached AFTER import is still caught. Callers use it
 * exactly as before (`detect(browserProbeSource)`); only the timing changed.
 *
 * In a browser: `available` is true, `signals.hooked` is true when WebDriver
 * automation is detected (false otherwise). Other signal fields (tampered, emulator,
 * rooted) are always false — the browser cannot assess them.
 *
 * In Node / Vitest (window absent): `available` is false, `signals` is undefined, so
 * detect() returns INTEGRITY_UNAVAILABLE (fail-closed safe default).
 *
 * Each read of `signals` returns a FRESH object (no shared frozen reference).
 *
 * @type {{ available: boolean, signals?: import('./detect.js').ProbeSignals }}
 */
export const browserProbeSource = Object.freeze(
  Object.defineProperties(
    {},
    {
      available: {
        enumerable: true,
        get() {
          return sampleSignals() !== null;
        },
      },
      signals: {
        enumerable: true,
        get() {
          // Fresh sample per read; undefined when not a browser (available:false).
          return sampleSignals() ?? undefined;
        },
      },
    },
  ),
);
