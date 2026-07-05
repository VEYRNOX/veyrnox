// src/wallet-core/keystore/__tests__/web.native-fence.test.js
//
// FAIL-CLOSED PLATFORM FENCE (I4 — fail honest, fail closed).
//
// web.js is STATICALLY imported by keystore/index.js on ALL platforms (bundle
// exclusion is impossible), so it can be REACHED on a native platform through a
// routing / platform-detection bug (index.js line ~23) or a direct dynamic import
// (HardwareKekSettings.jsx). On native, the correct keystore is the hardware-backed
// one (Secure Enclave / StrongBox). If the web keystore's secret-touching ops ran on
// native, they would silently write a BARE Argon2id vault to the WebView IndexedDB,
// bypassing the hardware KEK — a silent security DOWNGRADE.
//
// Today the web keystore is only INCIDENTALLY safe on native: getHardwareFactor()
// throws because the Capacitor WebView lacks window.PublicKeyCredential. But
// createVault / saveVaultContents have NO PRF dependency and would happily write a
// bare vault. If a future Android WebView gains WebAuthn, the incidental backstop
// disappears. This test pins an EXPLICIT runtime fence: every secret-touching method
// must throw WEB_KEYSTORE_WRONG_PLATFORM on native, BEFORE any crypto / storage /
// WebAuthn call.
//
// Machine code is the contract (copy can change; codes cannot).
//
// vault + store + kek are mocked (established pattern in this dir). @capacitor/core is
// mocked to SIMULATE THE PLATFORM — not to fake a security control.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── shared mocks for the collaborators web.js touches ────────────────────────
const vaultMock = {
  encryptVault: vi.fn(async () => ({ v: 1 })),
  decryptVault: vi.fn(async () => 'seed'),
  vaultNeedsRekey: vi.fn(() => false),
  deriveKekC: vi.fn(async () => new Uint8Array(32).fill(7)),
  encryptVaultWithDek: vi.fn(async () => ({ iv: 'iv', ct: 'ct' })),
  decryptVaultWithDek: vi.fn(async () => 'seed'),
};
const storeMock = {
  saveVault: vi.fn(async () => {}),
  loadVault: vi.fn(async () => null),
  hasVault: vi.fn(async () => false),
  clearVault: vi.fn(async () => {}),
};
vi.mock('../../vault.js', () => vaultMock);
vi.mock('../../evm/vaultStore.js', () => storeMock);
vi.mock('../kek.js', async () => {
  const actual = await vi.importActual('../kek.js');
  return {
    ...actual,
    combineKek: vi.fn(async () => new Uint8Array(32).fill(9)),
    randomDek: vi.fn(() => new Uint8Array(32).fill(3)),
    wrapDek: vi.fn(async () => 'wrap'),
    unwrapDek: vi.fn(async () => new Uint8Array(32).fill(4)),
  };
});

// ── platform simulation: default to NATIVE for the fenced-off block ──────────
// Mutable so each describe block can flip the simulated platform.
let nativePlatform = true;
let capacitorThrows = false;
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => {
      if (capacitorThrows) throw new Error('no capacitor semantics here');
      return nativePlatform;
    },
  },
}));

const { webKeyStore, WEB_KEYSTORE_ERR } = await import('../web.js');

const opts = { getHardwareFactor: async () => new Uint8Array(32).fill(1) };

// Every secret-touching method + a minimal valid arg tuple.
const guardedCalls = {
  createVault: () => webKeyStore.createVault('correct horse battery staple', 'correct horse battery staple'),
  saveVaultContents: () => webKeyStore.saveVaultContents('correct horse battery staple', 'correct horse battery staple'),
  unlock: () => webKeyStore.unlock('correct horse battery staple', opts),
  changePassword: () => webKeyStore.changePassword('correct horse battery staple', 'another long password!!', opts),
  enrollKek: () => webKeyStore.enrollKek('correct horse battery staple', opts),
  unenrollKek: () => webKeyStore.unenrollKek('correct horse battery staple', opts),
  getHardwareFactor: () => webKeyStore.getHardwareFactor(),
};

beforeEach(() => {
  vi.clearAllMocks();
  storeMock.loadVault.mockResolvedValue(null);
  storeMock.hasVault.mockResolvedValue(false);
  capacitorThrows = false;
});

describe('web keystore native fence — machine code contract', () => {
  it('exports WEB_KEYSTORE_ERR.WRONG_PLATFORM stable code', () => {
    expect(WEB_KEYSTORE_ERR).toBeDefined();
    expect(WEB_KEYSTORE_ERR.WRONG_PLATFORM).toBe('WEB_KEYSTORE_WRONG_PLATFORM');
  });
});

describe('web keystore native fence — every secret-touching method fails closed on native', () => {
  beforeEach(() => { nativePlatform = true; });

  for (const [name, call] of Object.entries(guardedCalls)) {
    it(`${name} rejects with WEB_KEYSTORE_WRONG_PLATFORM on native`, async () => {
      let err;
      try {
        await call();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe(WEB_KEYSTORE_ERR.WRONG_PLATFORM);
    });
  }
});

describe('web keystore native fence — fails closed BEFORE any storage or WebAuthn side-effect', () => {
  beforeEach(() => { nativePlatform = true; });

  it('createVault does not write ciphertext on native', async () => {
    await expect(guardedCalls.createVault()).rejects.toMatchObject({
      code: WEB_KEYSTORE_ERR.WRONG_PLATFORM,
    });
    expect(storeMock.saveVault).not.toHaveBeenCalled();
    expect(vaultMock.encryptVault).not.toHaveBeenCalled();
  });

  it('saveVaultContents does not write ciphertext on native', async () => {
    await expect(guardedCalls.saveVaultContents()).rejects.toMatchObject({
      code: WEB_KEYSTORE_ERR.WRONG_PLATFORM,
    });
    expect(storeMock.saveVault).not.toHaveBeenCalled();
    expect(vaultMock.encryptVault).not.toHaveBeenCalled();
  });

  it('unlock does not read the vault store on native', async () => {
    await expect(guardedCalls.unlock()).rejects.toMatchObject({
      code: WEB_KEYSTORE_ERR.WRONG_PLATFORM,
    });
    expect(storeMock.loadVault).not.toHaveBeenCalled();
  });

  it('getHardwareFactor never touches navigator.credentials on native', async () => {
    // Install fresh spies as navigator.credentials.get/create so we can assert the
    // WebAuthn call is never reached before the fence throws. jsdom's
    // navigator.credentials has no own get/create, so define them directly rather
    // than vi.spyOn (which requires an existing property).
    if (typeof navigator === 'undefined') return; // no navigator: nothing to assert
    if (!navigator.credentials) {
      Object.defineProperty(navigator, 'credentials', { value: {}, configurable: true });
    }
    const getSpy = vi.fn(async () => null);
    const createSpy = vi.fn(async () => null);
    const origGet = navigator.credentials.get;
    const origCreate = navigator.credentials.create;
    navigator.credentials.get = getSpy;
    navigator.credentials.create = createSpy;

    try {
      await expect(guardedCalls.getHardwareFactor()).rejects.toMatchObject({
        code: WEB_KEYSTORE_ERR.WRONG_PLATFORM,
      });
      expect(getSpy).not.toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();
    } finally {
      navigator.credentials.get = origGet;
      navigator.credentials.create = origCreate;
    }
  });
});

describe('web keystore native fence — negative: NOT native → fence lets the method proceed', () => {
  beforeEach(() => { nativePlatform = false; });

  // On web the method may still reject for OTHER reasons (no vault, no PRF, etc.),
  // but the rejection must NOT be the platform fence.
  for (const [name, call] of Object.entries(guardedCalls)) {
    it(`${name} does not reject with WRONG_PLATFORM when not native`, async () => {
      let err;
      try {
        await call();
      } catch (e) {
        err = e;
      }
      if (err) {
        expect(err.code).not.toBe(WEB_KEYSTORE_ERR.WRONG_PLATFORM);
      }
    });
  }
});

describe('web keystore native fence — detection error is NOT treated as native (fail closed only on POSITIVE native)', () => {
  beforeEach(() => {
    nativePlatform = true; // would be native, but the probe throws
    capacitorThrows = true;
  });

  for (const [name, call] of Object.entries(guardedCalls)) {
    it(`${name} does not reject with WRONG_PLATFORM when Capacitor probe throws`, async () => {
      let err;
      try {
        await call();
      } catch (e) {
        err = e;
      }
      if (err) {
        expect(err.code).not.toBe(WEB_KEYSTORE_ERR.WRONG_PLATFORM);
      }
    });
  }
});
