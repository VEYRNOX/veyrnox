// src/lib/bugReport/captureBridge.js
//
// Capture abstraction. Slice 2c replaces the slice-1d mock with real
// Capacitor plugin calls when running on native (iOS BugReportPlugin
// from slice 2a, Android BugReportPlugin from slice 2b). Web keeps
// the mock — this feature never ships on the web build.
//
// The shape returned from stopCapture() is the contract Slice 1e-4's
// uploadClient consumes. Real captures now populate the blob; the
// mock still returns blob:null so a dev-mode invocation on web
// harmlessly falls through to uploadClient's NO_CAPTURE refuse.
//
// FLAG_SECURE (Android) — MainActivity.java sets FLAG_SECURE window-
// wide (M13), which blocks MediaProjection from capturing anything but
// black frames. This module coordinates the toggle:
//   - startCapture: setSecureFlag(false)
//   - stop() / abort(): setSecureFlag(true) BEFORE releasing recorder
//   - REFUSED entirely from decoy/demo sessions (I3 — coerced tap
//     must not disable the seized-device screenshot guard). The
//     isDeniabilityOrDemoActive() gate is the primary defence; the
//     BugReportButton already self-hides in those sessions, but this
//     is the belt-and-braces at the native chokepoint.
//
// iOS does not need FLAG_SECURE handling — ReplayKit interacts with
// the system recorder, not with a window flag; screens the user does
// not want captured are handled by the route allowlist (slice 1a).

import { Capacitor } from '@capacitor/core';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

/**
 * @typedef {Object} CaptureHandle
 * @property {() => Promise<CaptureResult>} stop
 * @property {() => Promise<void>} abort   discards buffer without producing a result
 */

/**
 * @typedef {Object} CaptureResult
 * @property {number} sizeBytes
 * @property {number} durationMs
 * @property {'mock'|'replaykit'|'mediaprojection'} source
 * @property {Uint8Array|null} blob   null on the web mock path
 */

// ── Web mock — kept for dev-mode exercise of the flow state machine.
// Never runs on the shipped app because the whole feature is gated
// behind VITE_BUG_REPORT_ENABLED (default OFF) + native-only.

class MockCaptureHandle {
  constructor() {
    this._startedAt = Date.now();
    this._aborted = false;
  }
  async stop() {
    if (this._aborted) throw new Error('CAPTURE_ABORTED');
    return /** @type {CaptureResult} */ ({
      sizeBytes: 0,
      durationMs: Date.now() - this._startedAt,
      source: 'mock',
      blob: null,
    });
  }
  async abort() { this._aborted = true; }
}

// ── Native handle — proxies to Capacitor.Plugins.BugReport.

class NativeCaptureHandle {
  /**
   * @param {'ios'|'android'} platform
   * @param {any} plugin  Capacitor.Plugins.BugReport
   */
  constructor(platform, plugin) {
    this._platform = platform;
    this._plugin = plugin;
    this._startedAt = Date.now();
    this._settled = false;
  }

  async stop() {
    if (this._settled) throw new Error('CAPTURE_ALREADY_SETTLED');
    this._settled = true;
    try {
      const result = await this._plugin.stopRecording();
      // Restore FLAG_SECURE BEFORE reading the file — a route change
      // or an unexpected renderer crash mid-read must not leave the
      // window unprotected. The plugin methods themselves are safe on
      // no-op invocations.
      await this._restoreSecureFlag();
      const bytesB64 = await this._plugin.readRecording({ path: result.path });
      // Fire-and-forget the delete — if it fails, the OS's temp/cache
      // eviction cleans up. Never block the caller on a housekeeping
      // failure that has no user-facing consequence.
      this._plugin.deleteRecording({ path: result.path }).catch(() => {});
      return /** @type {CaptureResult} */ ({
        sizeBytes: result.size ?? 0,
        durationMs: result.duration_ms ?? (Date.now() - this._startedAt),
        source: this._platform === 'ios' ? 'replaykit' : 'mediaprojection',
        blob: base64ToBytes(bytesB64.base64),
      });
    } catch (e) {
      // Ensure the flag is restored even on a stop-path failure.
      await this._restoreSecureFlag().catch(() => {});
      throw e;
    }
  }

  async abort() {
    if (this._settled) return;
    this._settled = true;
    try { await this._plugin.abortRecording(); } catch {}
    await this._restoreSecureFlag().catch(() => {});
  }

  async _restoreSecureFlag() {
    if (this._platform !== 'android') return;
    // Restore is unconditional — the I3 gate only guards the
    // CLEAR side. Setting FLAG_SECURE back to ON from any session
    // (including a decoy that somehow got here via bug) is always
    // safe: it strengthens the seized-device guarantee, never
    // weakens it.
    try { await this._plugin.setSecureFlag({ enabled: true }); } catch {}
  }
}

function base64ToBytes(b64) {
  if (typeof b64 !== 'string' || b64.length === 0) return null;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function nativePlugin() {
  try {
    return /** @type {any} */ (globalThis).Capacitor?.Plugins?.BugReport ?? null;
  } catch { return null; }
}

/**
 * Starts a screen capture and returns a handle for stopping or aborting it.
 *
 * Callers MUST NOT rely on the promise resolving before the user sees the
 * OS's own recording indicator. Consent — app-level and OS-level — has
 * already fired by the time this is called (BugReportFlow's countdown
 * finishes AFTER the app's explainer and BEFORE this).
 *
 * FAIL-CLOSED (I3): refuses to start in a decoy/demo session. The
 * BugReportButton already self-hides via isBugReportEnabled(), but this
 * is the belt-and-braces at the native chokepoint.
 *
 * @returns {Promise<CaptureHandle>}
 */
export async function startCapture() {
  if (isDeniabilityOrDemoActive()) {
    throw new Error('CAPTURE_REFUSED_DENIABILITY');
  }

  const platform = (() => {
    try { return Capacitor.getPlatform(); } catch { return 'web'; }
  })();

  if (platform !== 'ios' && platform !== 'android') {
    // Web / unknown — dev-mode mock path. Real feature is native-only.
    return new MockCaptureHandle();
  }

  const plugin = nativePlugin();
  if (!plugin) {
    // Native platform but plugin not loaded — happens in tests that
    // stub Capacitor.getPlatform() but not Plugins. Fail closed.
    throw new Error('CAPTURE_PLUGIN_UNAVAILABLE');
  }

  if (platform === 'android') {
    // Permission dance first — the Android system dialog fires inside
    // requestPermission(). Then clear FLAG_SECURE so MediaProjection
    // captures real pixels rather than black frames. The clear is
    // gated by the isDeniabilityOrDemoActive check above; no path
    // reaches this line from a decoy/demo session.
    const perm = await plugin.requestPermission();
    await plugin.setSecureFlag({ enabled: false });
    try {
      await plugin.startRecording({
        resultCode: perm.resultCode,
        dataBase64: perm.dataBase64,
      });
    } catch (e) {
      // Startup failed — restore FLAG_SECURE immediately.
      try { await plugin.setSecureFlag({ enabled: true }); } catch {}
      throw e;
    }
    return new NativeCaptureHandle('android', plugin);
  }

  // iOS
  await plugin.startRecording();
  return new NativeCaptureHandle('ios', plugin);
}
