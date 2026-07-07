// src/wallet-core/__tests__/vaultBackup-ios.test.js
//
// Verifies the iOS share-sheet backup path: Filesystem.writeFile → Share.share
// → cleanup. Mocks Capacitor.getPlatform() to 'ios' so the branch is exercised
// without a real device.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock Capacitor core ────────────────────────────────────────────────────────
let mockPlatform = 'web';
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => mockPlatform },
  registerPlugin: vi.fn(),
}));

// ── Mock @capacitor/filesystem ─────────────────────────────────────────────────
const mockWriteFile = vi.fn();
const mockDeleteFile = vi.fn();
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: (...args) => mockWriteFile(...args),
    deleteFile: (...args) => mockDeleteFile(...args),
  },
  Directory: { Cache: 'CACHE' },
}));

// ── Mock @capacitor/share ──────────────────────────────────────────────────────
const mockShare = vi.fn();
vi.mock('@capacitor/share', () => ({
  Share: { share: (...args) => mockShare(...args) },
}));

// ── Mock keystore (withLockSuppressed just calls through) ──────────────────────
vi.mock('../keystore/index.js', () => ({
  getKeyStore: vi.fn(),
  withLockSuppressed: vi.fn((fn) => fn()),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────
const { downloadBackupFile, downloadBackupFilePicker } = await import('../vaultBackup.js');

const blob = (ct) => ({ v: 1, ct, iv: 'ZGVm', salt: 'YWJj' });
const ENVELOPE = {
  app: 'veyrnox',
  backup_v: 1,
  created_at: 1700000000000,
  seals: { password: blob('Z2hp'), pin: blob('amts') },
};

beforeEach(() => {
  mockPlatform = 'ios';
  mockWriteFile.mockResolvedValue({ uri: 'file:///tmp/veyrnox.enc' });
  mockDeleteFile.mockResolvedValue();
  mockShare.mockResolvedValue({ activityType: 'com.apple.UIKit.activity.SaveToFiles' });
});

afterEach(() => {
  vi.clearAllMocks();
  mockPlatform = 'web';
});

describe('iOS backup via share sheet', () => {
  it('writes a temp file, opens the share sheet, and cleans up', async () => {
    const result = await downloadBackupFile(ENVELOPE);

    expect(mockWriteFile).toHaveBeenCalledOnce();
    const writeArgs = mockWriteFile.mock.calls[0][0];
    expect(writeArgs.path).toBe('veyrnox.enc');
    expect(writeArgs.directory).toBe('CACHE');
    expect(typeof writeArgs.data).toBe('string'); // base64

    expect(mockShare).toHaveBeenCalledOnce();
    const shareArgs = mockShare.mock.calls[0][0];
    expect(shareArgs.url).toBe('file:///tmp/veyrnox.enc');
    expect(shareArgs.title).toBe('veyrnox.enc');

    expect(mockDeleteFile).toHaveBeenCalledOnce();
    expect(mockDeleteFile.mock.calls[0][0]).toEqual({
      path: 'veyrnox.enc',
      directory: 'CACHE',
    });

    expect(result).toEqual({ saved: true, path: 'Shared via com.apple.UIKit.activity.SaveToFiles' });
  });

  it('returns {saved: true} even when activityType is absent', async () => {
    mockShare.mockResolvedValue({});
    const result = await downloadBackupFile(ENVELOPE);
    expect(result).toEqual({ saved: true, path: 'Saved via share sheet' });
  });

  it('returns {saved: false} when user dismisses the share sheet', async () => {
    mockShare.mockRejectedValue(new Error('Share cancelled'));
    const result = await downloadBackupFile(ENVELOPE);
    expect(result).toEqual({ saved: false, path: '' });
    // Temp file still cleaned up
    expect(mockDeleteFile).toHaveBeenCalledOnce();
  });

  it('returns {saved: false} on dismiss (alternate wording)', async () => {
    mockShare.mockRejectedValue(new Error('User did dismiss the dialog'));
    const result = await downloadBackupFile(ENVELOPE);
    expect(result).toEqual({ saved: false, path: '' });
  });

  it('re-throws non-cancel errors', async () => {
    mockShare.mockRejectedValue(new Error('Network failure'));
    await expect(downloadBackupFile(ENVELOPE)).rejects.toThrow('Network failure');
    // Temp file still cleaned up even on error
    expect(mockDeleteFile).toHaveBeenCalledOnce();
  });

  it('cleans up the temp file even when deleteFile itself fails', async () => {
    mockDeleteFile.mockRejectedValue(new Error('delete failed'));
    const result = await downloadBackupFile(ENVELOPE);
    // Should not throw — deleteFile failure is swallowed
    expect(result).toEqual({ saved: true, path: 'Shared via com.apple.UIKit.activity.SaveToFiles' });
  });

  it('wraps Share.share in withLockSuppressed', async () => {
    const { withLockSuppressed } = await import('../keystore/index.js');
    await downloadBackupFile(ENVELOPE);
    expect(withLockSuppressed).toHaveBeenCalledOnce();
  });
});

describe('iOS downloadBackupFilePicker delegates to downloadBackupFile', () => {
  it('returns true when the share sheet succeeds', async () => {
    const result = await downloadBackupFilePicker(ENVELOPE);
    expect(result).toBe(true);
  });

  it('returns false when the share sheet is dismissed', async () => {
    mockShare.mockRejectedValue(new Error('Share cancelled'));
    const result = await downloadBackupFilePicker(ENVELOPE);
    expect(result).toBe(false);
  });
});

describe('web path is unchanged when platform is web', () => {
  beforeEach(() => { mockPlatform = 'web'; });

  it('does not call Filesystem or Share on web', async () => {
    // Web path uses the anchor-click approach; mock the DOM bits.
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock');
    globalThis.URL.revokeObjectURL = vi.fn();
    const result = await downloadBackupFile(ENVELOPE);
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockShare).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });
});
