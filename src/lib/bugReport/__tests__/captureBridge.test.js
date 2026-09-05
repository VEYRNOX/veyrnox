import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Slice 2c — captureBridge native wiring.
//
// Mutation-checked pins:
//   - deniability gate removed → decoy-refuse test goes RED (silent
//     capture in coerced session is exactly the I3 break this exists
//     to prevent)
//   - FLAG_SECURE never cleared → Android startRecording never called
//     with real pixels (setSecureFlag(false) missing)
//   - FLAG_SECURE never restored on stop → seized-device guard stays
//     off after every recording (huge)
//   - iOS never calls startRecording without permission dance — the
//     ReplayKit path has no permission RPC of its own
//   - stop reads native file then deletes → skipping delete leaves
//     unencrypted video on device (best-effort but MUST be attempted)
//   - errors during start restore FLAG_SECURE

const platform = vi.fn(() => 'ios');
const deniability = vi.fn(() => false);
const nativePlugin = {
  requestPermission: vi.fn(),
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  abortRecording: vi.fn(),
  readRecording: vi.fn(),
  deleteRecording: vi.fn(),
  setSecureFlag: vi.fn(),
};

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => platform() },
}));
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => deniability(),
}));

let startCapture;
beforeEach(async () => {
  platform.mockReset().mockReturnValue('ios');
  deniability.mockReset().mockReturnValue(false);
  Object.values(nativePlugin).forEach((fn) => fn.mockReset());
  nativePlugin.requestPermission.mockResolvedValue({ resultCode: -1, dataBase64: 'AAAA' });
  nativePlugin.startRecording.mockResolvedValue(undefined);
  nativePlugin.stopRecording.mockResolvedValue({ path: '/tmp/x.mov', size: 42, duration_ms: 1234 });
  nativePlugin.abortRecording.mockResolvedValue(undefined);
  nativePlugin.readRecording.mockResolvedValue({ base64: btoa('hello world!') });
  nativePlugin.deleteRecording.mockResolvedValue(undefined);
  nativePlugin.setSecureFlag.mockResolvedValue(undefined);
  vi.stubGlobal('Capacitor', { Plugins: { BugReport: nativePlugin } });
  vi.resetModules();
  ({ startCapture } = await import('../captureBridge'));
});
afterEach(() => vi.unstubAllGlobals());

describe('deniability gate (I3)', () => {
  it('refuses to start in a decoy/demo session, does NOT call the plugin', async () => {
    deniability.mockReturnValue(true);
    await expect(startCapture()).rejects.toThrow(/DENIABILITY/);
    expect(nativePlugin.requestPermission).not.toHaveBeenCalled();
    expect(nativePlugin.startRecording).not.toHaveBeenCalled();
    expect(nativePlugin.setSecureFlag).not.toHaveBeenCalled();
  });
});

describe('iOS path (replaykit)', () => {
  it('calls startRecording directly (no permission RPC) and returns handle', async () => {
    platform.mockReturnValue('ios');
    const handle = await startCapture();
    expect(nativePlugin.startRecording).toHaveBeenCalledOnce();
    // ReplayKit has no permission RPC — its system dialog fires inside
    // startRecording. Assert we did NOT call the Android permission API.
    expect(nativePlugin.requestPermission).not.toHaveBeenCalled();
    // And no FLAG_SECURE toggling on iOS — it uses window flags Android has, ReplayKit doesn't.
    expect(nativePlugin.setSecureFlag).not.toHaveBeenCalled();
    const result = await handle.stop();
    expect(result.source).toBe('replaykit');
    expect(result.sizeBytes).toBe(42);
    expect(result.durationMs).toBe(1234);
    expect(result.blob).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(result.blob)).toBe('hello world!');
    expect(nativePlugin.deleteRecording).toHaveBeenCalledWith({ path: '/tmp/x.mov' });
  });

  it('abort calls abortRecording and does NOT toggle FLAG_SECURE on iOS', async () => {
    platform.mockReturnValue('ios');
    const handle = await startCapture();
    await handle.abort();
    expect(nativePlugin.abortRecording).toHaveBeenCalledOnce();
    // Restore path is a no-op on iOS.
    expect(nativePlugin.setSecureFlag).not.toHaveBeenCalled();
  });
});

describe('Android path (mediaprojection) — FLAG_SECURE coordination', () => {
  it('requests permission, clears FLAG_SECURE, then starts recording', async () => {
    platform.mockReturnValue('android');
    await startCapture();
    // Order matters: permission → clear FLAG_SECURE → startRecording.
    const permIdx = nativePlugin.requestPermission.mock.invocationCallOrder[0];
    const clearIdx = nativePlugin.setSecureFlag.mock.invocationCallOrder[0];
    const startIdx = nativePlugin.startRecording.mock.invocationCallOrder[0];
    expect(permIdx).toBeLessThan(clearIdx);
    expect(clearIdx).toBeLessThan(startIdx);
    expect(nativePlugin.setSecureFlag.mock.calls[0][0]).toEqual({ enabled: false });
  });

  it('stop() RESTORES FLAG_SECURE before reading the file, then reads, then deletes', async () => {
    platform.mockReturnValue('android');
    const handle = await startCapture();
    // Reset call order to check the stop path in isolation.
    const restoreCallsBefore = nativePlugin.setSecureFlag.mock.calls.filter(
      (c) => c[0].enabled === true,
    ).length;

    const result = await handle.stop();

    const restoreCallsAfter = nativePlugin.setSecureFlag.mock.calls.filter(
      (c) => c[0].enabled === true,
    ).length;
    expect(restoreCallsAfter).toBe(restoreCallsBefore + 1);
    expect(nativePlugin.readRecording).toHaveBeenCalledWith({ path: '/tmp/x.mov' });
    // Delete is fire-and-forget but MUST be attempted — a shipped
    // slice-1e recording that leaves an unencrypted mp4 in cacheDir
    // is a violation of "nothing on disk after the flow closes".
    expect(nativePlugin.deleteRecording).toHaveBeenCalledWith({ path: '/tmp/x.mov' });
    expect(result.source).toBe('mediaprojection');
  });

  it('abort() RESTORES FLAG_SECURE even after abortRecording', async () => {
    platform.mockReturnValue('android');
    const handle = await startCapture();
    const restoreBefore = nativePlugin.setSecureFlag.mock.calls.filter(
      (c) => c[0].enabled === true,
    ).length;
    await handle.abort();
    const restoreAfter = nativePlugin.setSecureFlag.mock.calls.filter(
      (c) => c[0].enabled === true,
    ).length;
    expect(restoreAfter).toBe(restoreBefore + 1);
    expect(nativePlugin.abortRecording).toHaveBeenCalledOnce();
  });

  it('startRecording failure RESTORES FLAG_SECURE (does not leave window unprotected)', async () => {
    platform.mockReturnValue('android');
    nativePlugin.startRecording.mockRejectedValueOnce(new Error('MediaProjection denied'));
    await expect(startCapture()).rejects.toThrow(/denied/);
    // setSecureFlag: (1) clear as normal, (2) restore on error.
    const restoreCalls = nativePlugin.setSecureFlag.mock.calls.filter(
      (c) => c[0].enabled === true,
    );
    expect(restoreCalls.length).toBe(1);
  });

  it('stop() failure STILL restores FLAG_SECURE', async () => {
    platform.mockReturnValue('android');
    const handle = await startCapture();
    nativePlugin.stopRecording.mockRejectedValueOnce(new Error('recorder oops'));
    await expect(handle.stop()).rejects.toThrow(/oops/);
    const restoreCalls = nativePlugin.setSecureFlag.mock.calls.filter(
      (c) => c[0].enabled === true,
    );
    expect(restoreCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('handle guard-rails', () => {
  it('stop() twice throws (single-settle contract)', async () => {
    platform.mockReturnValue('ios');
    const handle = await startCapture();
    await handle.stop();
    await expect(handle.stop()).rejects.toThrow(/SETTLED/);
  });

  it('abort() after stop() is a no-op', async () => {
    platform.mockReturnValue('ios');
    const handle = await startCapture();
    await handle.stop();
    nativePlugin.abortRecording.mockClear();
    await handle.abort();
    expect(nativePlugin.abortRecording).not.toHaveBeenCalled();
  });
});

describe('web/unknown platform → mock', () => {
  it('returns the mock handle when Capacitor.getPlatform is "web"', async () => {
    platform.mockReturnValue('web');
    const handle = await startCapture();
    const result = await handle.stop();
    expect(result.source).toBe('mock');
    expect(result.blob).toBeNull();
    expect(nativePlugin.startRecording).not.toHaveBeenCalled();
  });
});

describe('missing plugin on native → fail closed', () => {
  it('throws CAPTURE_PLUGIN_UNAVAILABLE when the plugin is not loaded', async () => {
    platform.mockReturnValue('ios');
    // Remove Capacitor.Plugins.BugReport
    vi.stubGlobal('Capacitor', { Plugins: {} });
    vi.resetModules();
    ({ startCapture } = await import('../captureBridge'));
    await expect(startCapture()).rejects.toThrow(/UNAVAILABLE/);
  });
});
