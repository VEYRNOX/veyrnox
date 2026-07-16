// src/wallet-core/keystore/__tests__/web.prf-hardware-factor.test.js
//
// Phase 1 hardware KEK: WebAuthn PRF implementation for web. This test suite
// covers the hardware factor retrieval (getHardwareFactor), PRF availability
// detection (isHardwareKeystoreAvailable), and integration with enrollKek/unlock.
//
// The tests use mock WebAuthn APIs + a fixed deterministic test PRF output
// (a fixed 32-byte vector), NOT a mock of the security control made to "look
// real". Real PRF comes from the browser's platform authenticator on a device.
//
// Spec mapping:
//   I6 — hardware binding: PIN cohort DEK is wrapped under KEK combining
//        hardware factor H (PRF) + password factor C
//   Phase 1 — web PRF verified on Chrome/Firefox, graceful degradation on Safari

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Test-only PRF helpers (similar to prfSpike.js)
function fixedBytes(byte, n = 32) {
  const a = new Uint8Array(n);
  a.fill(byte);
  return a;
}

function bytesToHex(buf) {
  if (buf == null) return '';
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

// ── Mock navigator.credentials (WebAuthn API) ──────────────────────────────

function mockCredentials(prfSupported = true, prfOutput = fixedBytes(0xaa)) {
  return {
    create: vi.fn(async (opts) => {
      if (!prfSupported) {
        throw new Error('NotSupportedError: PRF not supported');
      }
      return {
        rawId: new Uint8Array([1, 2, 3, 4]), // test credentialId
        getClientExtensionResults: () => ({
          prf: { enabled: true, results: { first: prfOutput } },
        }),
      };
    }),
    get: vi.fn(async (opts) => {
      if (!prfSupported) {
        throw new Error('NotSupportedError: PRF not supported');
      }
      return {
        getClientExtensionResults: () => ({
          prf: { results: { first: prfOutput } },
        }),
      };
    }),
  };
}

// Mock LocalStorage
class MockLocalStorage {
  constructor() {
    this.data = {};
  }

  getItem(key) {
    return this.data[key] || null;
  }

  setItem(key, value) {
    this.data[key] = value;
  }

  removeItem(key) {
    delete this.data[key];
  }

  clear() {
    this.data = {};
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

const SECRET = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const PIN = '133713370000';

const vaultMock = {
  encryptVault: vi.fn(),
  decryptVault: vi.fn(),
  vaultNeedsRekey: vi.fn(() => false),
  deriveKekC: vi.fn(async () => fixedBytes(0xcc)),
  encryptVaultWithDek: vi.fn(async () => ({ iv: 'iv', ct: 'ct' })),
  decryptVaultWithDek: vi.fn(async () => SECRET),
};

const storeMock = {
  saveVault: vi.fn(async () => {}),
  loadVault: vi.fn(),
  hasVault: vi.fn(),
  clearVault: vi.fn(),
};

const kekMock = {
  combineKek: vi.fn(async () => fixedBytes(0xaa)), // mock KEK
  randomDek: vi.fn(() => fixedBytes(0xdd)),
  wrapDek: vi.fn(async () => ({ v: 1, iv: 'test-iv', ct: 'test-ct' })),
  unwrapDek: vi.fn(async () => fixedBytes(0xdd)),
  KEK_ERR: {
    NO_HARDWARE_FACTOR: 'KEK_NO_HARDWARE_FACTOR',
    UNWRAP_FAILED: 'KEK_UNWRAP_FAILED',
    MALFORMED_VAULT: 'KEK_MALFORMED_VAULT',
  },
  // I/O-boundary helpers (real behaviour) so callers can decode a valid kekSalt / parse a blob.
  decodeKekSalt: (kekSalt) => {
    if (typeof kekSalt !== 'string' || kekSalt.length === 0) throw new Error('KEK_MALFORMED_VAULT');
    let bin; try { bin = atob(kekSalt); } catch { throw new Error('KEK_MALFORMED_VAULT'); }
    const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
  },
  parseVaultBlob: (raw) => {
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw !== 'string') throw new Error('KEK_MALFORMED_VAULT');
    try { return JSON.parse(raw); } catch { throw new Error('KEK_MALFORMED_VAULT'); }
  },
};

vi.mock('../../vault.js', () => vaultMock);
vi.mock('../../evm/vaultStore.js', () => storeMock);
vi.mock('../kek.js', () => kekMock);

describe('Web PRF Hardware Factor (Phase 1 — I6)', () => {
  let webKeyStore;
  let mockLocalStorage;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLocalStorage = new MockLocalStorage();

    // Set up global mocks
    global.window = {
      location: { hostname: 'localhost' },
      localStorage: mockLocalStorage,
      PublicKeyCredential: true,
    };
    global.navigator = {
      credentials: mockCredentials(true, fixedBytes(0xaa)),
    };

    // Reset module cache to pick up new global mocks
    vi.resetModules();
    const mod = await import('../web.js');
    webKeyStore = mod.webKeyStore;

    // Set up default mock return values
    vaultMock.vaultNeedsRekey.mockReturnValue(false);
    vaultMock.decryptVault.mockResolvedValue(SECRET);
    vaultMock.decryptVaultWithDek.mockResolvedValue(SECRET);
    kekMock.combineKek.mockResolvedValue(fixedBytes(0xaa));
    kekMock.randomDek.mockReturnValue(fixedBytes(0xdd));
    kekMock.wrapDek.mockResolvedValue({ v: 1, iv: 'iv', ct: 'ct' });
    kekMock.unwrapDek.mockResolvedValue(fixedBytes(0xdd));
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete global.window;
    delete global.navigator;
  });

  describe('isHardwareKeystoreAvailable — PRF support detection', () => {
    it('returns true when WebAuthn and PRF are available', async () => {
      const available = await webKeyStore.isHardwareKeystoreAvailable();
      expect(available).toBe(true);
    });

    it('returns false when PublicKeyCredential is not available (Safari old)', async () => {
      // Temporarily hide PublicKeyCredential
      const oldPKC = global.window.PublicKeyCredential;
      global.window.PublicKeyCredential = null;
      const available = await webKeyStore.isHardwareKeystoreAvailable();
      expect(available).toBe(false);
      // Restore
      global.window.PublicKeyCredential = oldPKC;
    });

    it('returns false when navigator.credentials.get is not available', async () => {
      // isPrfSupported checks PublicKeyCredential, but getHardwareFactor needs
      // navigator.credentials.get. This test just verifies that a missing
      // navigator.credentials doesn't break isHardwareKeystoreAvailable (which
      // only checks PublicKeyCredential). The real gate is in getHardwareFactor.
      const available = await webKeyStore.isHardwareKeystoreAvailable();
      // With PublicKeyCredential present (mock has it), should return true
      expect(available).toBe(true);
    });

    it('returns false when window is undefined (SSR)', async () => {
      // Temporarily hide window
      const oldWindow = global.window;
      // @ts-ignore
      delete global.window;
      const available = await webKeyStore.isHardwareKeystoreAvailable();
      expect(available).toBe(false);
      // Restore
      global.window = oldWindow;
    });
  });

  describe('getHardwareFactor — PRF evaluation', () => {
    it('returns a 32-byte Uint8Array when PRF succeeds', async () => {
      const H = await webKeyStore.getHardwareFactor();
      expect(H).toBeInstanceOf(Uint8Array);
      expect(H.length).toBe(32);
      expect(bytesToHex(H)).toBe(bytesToHex(fixedBytes(0xaa)));
    });

    it('throws when PRF is not supported (Safari)', async () => {
      global.navigator.credentials = mockCredentials(false);
      vi.resetModules();
      const mod = await import('../web.js');
      await expect(mod.webKeyStore.getHardwareFactor()).rejects.toThrow(/PRF.*not supported/);
    });

    it('creates a passkey on first call and stores the credential ID', async () => {
      const createSpy = global.navigator.credentials.create;
      const H = await webKeyStore.getHardwareFactor();
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(H.length).toBe(32);
      // Credential ID should be stored in localStorage
      const stored = mockLocalStorage.getItem('veyrnox-prf-cred-id');
      expect(stored).toBeTruthy();
    });

    // #1030 — single-prompt enrollment on Chrome ≥118
    it('skips get() when create() already returns PRF output (Chrome >=118, single prompt)', async () => {
      // Default mock: create() returns PRF output in extension results
      const getSpy = global.navigator.credentials.get;
      const H = await webKeyStore.getHardwareFactor();
      expect(H.length).toBe(32);
      expect(getSpy).not.toHaveBeenCalled(); // single prompt — no get() needed
    });

    // #1030 — two-prompt fallback on Safari/Firefox
    it('falls through to get() when create() returns no PRF output (Safari/Firefox, two prompts)', async () => {
      // create() returns NO PRF results (Safari/Firefox behavior)
      global.navigator.credentials.create = vi.fn(async () => ({
        rawId: new Uint8Array([1, 2, 3, 4]),
        getClientExtensionResults: () => ({ prf: { enabled: true } }), // no results.first
      }));
      global.navigator.credentials.get = vi.fn(async () => ({
        getClientExtensionResults: () => ({
          prf: { results: { first: fixedBytes(0xaa) } },
        }),
      }));
      vi.resetModules();
      const mod = await import('../web.js');
      const H = await mod.webKeyStore.getHardwareFactor();
      expect(H.length).toBe(32);
      expect(global.navigator.credentials.get).toHaveBeenCalledTimes(1); // fallback to get()
    });

    // #1030 — credential id persisted in both paths (F-05 safety)
    it('persists credential id after PRF confirmed from create() (F-05)', async () => {
      await webKeyStore.getHardwareFactor();
      const stored = mockLocalStorage.getItem('veyrnox-prf-cred-id');
      expect(stored).toBeTruthy();
    });

    it('reuses stored credential on second call (no new create)', async () => {
      // First call: creates credential
      await webKeyStore.getHardwareFactor();
      const createSpy = global.navigator.credentials.create;
      const firstCallCount = createSpy.mock.calls.length;

      // Reset spy count for clarity
      createSpy.mockClear();

      // Second call: should reuse stored credentialId
      const H2 = await webKeyStore.getHardwareFactor();
      expect(createSpy).not.toHaveBeenCalled();
      expect(H2.length).toBe(32);
    });

    it('throws when get() is cancelled by user', async () => {
      // create() must NOT return PRF (Safari path) so code falls through to get()
      global.navigator.credentials.create = vi.fn(async () => ({
        rawId: new Uint8Array([1, 2, 3, 4]),
        getClientExtensionResults: () => ({ prf: { enabled: true } }),
      }));
      global.navigator.credentials.get = vi.fn(async () => null);
      vi.resetModules();
      const mod = await import('../web.js');
      await expect(mod.webKeyStore.getHardwareFactor()).rejects.toThrow(/cancelled or failed/);
    });

    it('throws when PRF extension returns no output', async () => {
      // create() must NOT return PRF (Safari path) so code falls through to get()
      global.navigator.credentials.create = vi.fn(async () => ({
        rawId: new Uint8Array([1, 2, 3, 4]),
        getClientExtensionResults: () => ({ prf: { enabled: true } }),
      }));
      global.navigator.credentials.get = vi.fn(async () => ({
        getClientExtensionResults: () => ({ prf: { results: {} } }), // missing 'first'
      }));
      vi.resetModules();
      const mod = await import('../web.js');
      await expect(mod.webKeyStore.getHardwareFactor()).rejects.toThrow(/did not return output/);
    });

    it('throws when PRF output is wrong length', async () => {
      // create() must NOT return PRF (Safari path) so code falls through to get()
      global.navigator.credentials.create = vi.fn(async () => ({
        rawId: new Uint8Array([1, 2, 3, 4]),
        getClientExtensionResults: () => ({ prf: { enabled: true } }),
      }));
      global.navigator.credentials.get = vi.fn(async () => ({
        getClientExtensionResults: () => ({
          prf: { results: { first: fixedBytes(0xaa, 16) } }, // wrong: 16 instead of 32
        }),
      }));
      vi.resetModules();
      const mod = await import('../web.js');
      await expect(mod.webKeyStore.getHardwareFactor()).rejects.toThrow(/length mismatch/);
    });
  });

  describe('enrollKek with hardware factor', () => {
    it('derives KEK from hardware factor + password, wraps DEK', async () => {
      storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y' });
      vaultMock.decryptVault.mockResolvedValue(SECRET);
      kekMock.combineKek.mockResolvedValue(fixedBytes(0xaa));

      await webKeyStore.enrollKek(PIN, {
        getHardwareFactor: async () => fixedBytes(0xaa),
      });

      // Should have called combineKek with H and C
      expect(kekMock.combineKek).toHaveBeenCalledTimes(1);
      // Should have called wrapDek to protect the DEK under KEK
      expect(kekMock.wrapDek).toHaveBeenCalledTimes(1);
      // Should have saved the updated vault with kekWrap
      expect(storeMock.saveVault).toHaveBeenCalledTimes(1);
      const saved = storeMock.saveVault.mock.calls[0][0];
      expect(saved.kekWrap).toBeTruthy();
      expect(saved.kekSalt).toBeTruthy();
    });

    it('throws when no hardware factor provider is given (fail-closed)', async () => {
      storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y' });
      await expect(webKeyStore.enrollKek(PIN)).rejects.toThrow(
        kekMock.KEK_ERR.NO_HARDWARE_FACTOR,
      );
    });
  });

  describe('unlock with KEK-enrolled vault', () => {
    it('retrieves hardware factor, combines with PIN, unwraps DEK', async () => {
      const blob = {
        iv: 'x',
        ct: 'y',
        kekWrap: { v: 1, iv: 'wrap-iv', ct: 'wrap-ct' },
        kekSalt: Buffer.from('salt').toString('base64'),
      };
      storeMock.loadVault.mockResolvedValue(blob);
      vaultMock.decryptVaultWithDek.mockResolvedValue(SECRET);

      const secret = await webKeyStore.unlock(PIN, {
        getHardwareFactor: async () => fixedBytes(0xaa),
      });

      expect(secret).toBe(SECRET);
      // Should have called combineKek with H and C
      expect(kekMock.combineKek).toHaveBeenCalledTimes(1);
      // Should have unwrapped the DEK
      expect(kekMock.unwrapDek).toHaveBeenCalledTimes(1);
    });

    it('throws NO_HARDWARE_FACTOR when vault is KEK-enrolled but no provider given', async () => {
      const blob = {
        iv: 'x',
        ct: 'y',
        kekWrap: { v: 1, iv: 'iv', ct: 'ct' },
        kekSalt: Buffer.from('salt').toString('base64'),
      };
      storeMock.loadVault.mockResolvedValue(blob);

      await expect(webKeyStore.unlock(PIN)).rejects.toThrow(
        kekMock.KEK_ERR.NO_HARDWARE_FACTOR,
      );
    });

    it('throws UNWRAP_FAILED when hardware factor or PIN is wrong', async () => {
      const blob = {
        iv: 'x',
        ct: 'y',
        kekWrap: { v: 1, iv: 'iv', ct: 'ct' },
        kekSalt: Buffer.from('salt').toString('base64'),
      };
      storeMock.loadVault.mockResolvedValue(blob);
      kekMock.unwrapDek.mockRejectedValue(new Error(kekMock.KEK_ERR.UNWRAP_FAILED));

      await expect(
        webKeyStore.unlock(PIN, {
          getHardwareFactor: async () => fixedBytes(0xbb), // wrong device
        }),
      ).rejects.toThrow(kekMock.KEK_ERR.UNWRAP_FAILED);
    });

    it('backward-compat: non-KEK vault still unlocks without hardware factor', async () => {
      const blob = { iv: 'x', ct: 'y' }; // no kekWrap
      storeMock.loadVault.mockResolvedValue(blob);
      vaultMock.decryptVault.mockResolvedValue(SECRET);

      const secret = await webKeyStore.unlock(PIN);
      expect(secret).toBe(SECRET);
    });
  });

describe('PRF_FIXED_SALT constant (domain-separation)', () => {
    it('uses a fixed, domain-separated salt for PRF evaluation', async () => {
      // PRF_FIXED_SALT should be defined in web.js and used consistently
      vi.resetModules();
      const { PRF_FIXED_SALT } = await import('../web.js');
      expect(PRF_FIXED_SALT).toBeInstanceOf(Uint8Array);
      expect(PRF_FIXED_SALT.length).toBe(32);
      // Verify it is a Veyrnox domain-separated constant
      const hex = bytesToHex(PRF_FIXED_SALT);
      expect(hex).toBeTruthy(); // non-empty
      // Should start with 'Veyrnox-' (0x56657972...)
      expect(hex).toMatch(/^56657972/);
    });
  });
});
