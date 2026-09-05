// src/lib/bugReport/captureBridge.js
//
// Slice 1d — capture abstraction. Returns capture metadata so the review
// screen has something to display. NO real screen capture in this slice.
//
// Slice 2 replaces the mock with:
//   - iOS: ReplayKit via a Capacitor plugin
//   - Android: MediaProjection via a Capacitor plugin
//   - Web (dev only): MediaRecorder + getDisplayMedia() — verified stub
//
// The shape returned from stopCapture() is the contract Slice 1e's upload
// helper consumes. Nothing here writes to disk or memory beyond the mock
// metadata; a real implementation MUST hold the capture buffer in a
// container that can be zeroised on abort.
//
// This module is a leaf — no imports from application code, no side
// effects at import time. Do NOT add any capture-init calls at module
// scope; that would break the "nothing runs until the user taps Start"
// property the store disclosure promises.

/**
 * @typedef {Object} CaptureHandle
 * @property {() => Promise<CaptureResult>} stop
 * @property {() => void} abort   discards buffer without producing a result
 */

/**
 * @typedef {Object} CaptureResult
 * @property {number} sizeBytes
 * @property {number} durationMs
 * @property {'mock'|'replaykit'|'mediaprojection'|'web-mediarecorder'} source
 * @property {Blob|null} blob     null in Slice 1d — real blob lands in 1e
 */

class MockCaptureHandle {
  constructor() {
    this._startedAt = Date.now();
    this._aborted = false;
  }
  /** @returns {Promise<CaptureResult>} */
  async stop() {
    if (this._aborted) throw new Error('CAPTURE_ABORTED');
    const durationMs = Date.now() - this._startedAt;
    // A slice-1d recording result has no real payload. Callers must not
    // treat blob=null as an error — it is the honest state of "no capture
    // implementation on this platform yet". Slice 1e's upload helper
    // refuses to send when blob is null.
    return /** @type {CaptureResult} */ ({
      sizeBytes: 0,
      durationMs,
      source: /** @type {const} */ ('mock'),
      blob: null,
    });
  }
  abort() {
    this._aborted = true;
  }
}

/**
 * Starts a screen capture and returns a handle for stopping or aborting it.
 * In Slice 1d the returned handle is a mock — no capture actually starts.
 *
 * Callers MUST NOT rely on the promise resolving before the user sees any
 * indicator. The design commitment (see docs/bug-report-recording-plan.md
 * §Apple 5.1.1(i)) is that consent precedes capture — this function is
 * called AFTER the countdown finishes, never before.
 *
 * @returns {Promise<CaptureHandle>}
 */
export async function startCapture() {
  return new MockCaptureHandle();
}
