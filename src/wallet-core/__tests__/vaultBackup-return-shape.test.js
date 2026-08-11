// vaultBackup downloadBackupFile return shape — Slice G+H plan §4 Codex v7 P1
// fix. Today the iOS branch collapses activityType into
// `path: 'Shared via ' + activityType`. PersonalBackup can no longer distinguish
// SaveToFiles from Mail from an ambiguous share, so it cannot pick
// markBackupCompleted vs markBackupPendingConfirmation.
//
// RED phase: new shape not yet returned. Every case here fails today because
// `activityType` is not on the returned object.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const CapacitorMock = {
  getPlatform: vi.fn(() => 'ios'),
  isNativePlatform: vi.fn(() => true),
};
const shareMock = vi.fn();
const writeFileMock = vi.fn(async () => ({ uri: 'file:///tmp/veyrnox.enc' }));
const deleteFileMock = vi.fn(async () => {});
const registerPluginMock = vi.fn(() => ({
  saveToDownloads: vi.fn(async () => ({ path: '/storage/emulated/0/Download/veyrnox.enc' })),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: CapacitorMock,
  registerPlugin: (...a) => registerPluginMock(...a),
}));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: (...a) => writeFileMock(...a), deleteFile: (...a) => deleteFileMock(...a) },
  Directory: { Cache: 'CACHE' },
}));
vi.mock('@capacitor/share', () => ({
  Share: { share: (...a) => shareMock(...a) },
}));

async function loadModule() {
  return await import('@/wallet-core/vaultBackup');
}

// Minimal envelope shape matching what encodeBinary() in vaultBackup.js
// consumes: two seals ('password' + 'pin'), each with salt/iv/ct + kdf.
const fakeSeal = () => ({
  v: 2,
  salt: 'AAAA',
  iv: 'AAAAAAAA',
  ct: 'AAAAAAAA',
  kdf: { parallelism: 1, memory: 65536, iterations: 3 },
});
const fakeEnvelope = () => ({
  created_at: 0,
  seals: { password: fakeSeal(), pin: fakeSeal() },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  CapacitorMock.getPlatform.mockReturnValue('ios');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('downloadBackupFile — new return shape', () => {
  it('iOS SaveToFiles → { saved:true, activityType:"com.apple.UIKit.activity.SaveToFiles", path:<string> }', async () => {
    CapacitorMock.getPlatform.mockReturnValue('ios');
    shareMock.mockResolvedValue({ activityType: 'com.apple.UIKit.activity.SaveToFiles' });
    const { downloadBackupFile } = await loadModule();
    const result = await downloadBackupFile(fakeEnvelope());
    expect(result).toMatchObject({
      saved: true,
      activityType: 'com.apple.UIKit.activity.SaveToFiles',
    });
    expect(typeof result.path).toBe('string');
  });

  it('iOS ambiguous activityType (mail/message) → { saved:true, activityType:<other>, path:<string> }', async () => {
    CapacitorMock.getPlatform.mockReturnValue('ios');
    shareMock.mockResolvedValue({ activityType: 'com.apple.UIKit.activity.Mail' });
    const { downloadBackupFile } = await loadModule();
    const result = await downloadBackupFile(fakeEnvelope());
    expect(result.saved).toBe(true);
    expect(result.activityType).toBe('com.apple.UIKit.activity.Mail');
    expect(typeof result.path).toBe('string');
  });

  it('iOS absent activityType → { saved:true, activityType:undefined, path:"Saved via share sheet" }', async () => {
    CapacitorMock.getPlatform.mockReturnValue('ios');
    shareMock.mockResolvedValue({});
    const { downloadBackupFile } = await loadModule();
    const result = await downloadBackupFile(fakeEnvelope());
    expect(result.saved).toBe(true);
    expect(result.activityType).toBeUndefined();
    expect(result.path).toBe('Saved via share sheet');
  });

  it('Android → { saved:true, activityType:undefined, path:<string> }', async () => {
    CapacitorMock.getPlatform.mockReturnValue('android');
    const { downloadBackupFile } = await loadModule();
    const result = await downloadBackupFile(fakeEnvelope());
    expect(result.saved).toBe(true);
    expect(result.activityType).toBeUndefined();
    expect(typeof result.path).toBe('string');
  });
});
