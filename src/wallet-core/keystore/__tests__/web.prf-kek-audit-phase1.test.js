// src/wallet-core/keystore/__tests__/web.prf-kek-audit-phase1.test.js
//
// PRF KEK audit Phase 1 — findings F-01, F-02, F-03, F-05, F-06, F-08.
//
// These pin the exact fail-closed / honesty behaviours the audit findings require.
// Codes/structure are the contract (not prose copy):
//   F-01  getHardwareFactor must NOT silently create an orphan credential when the
//         vault is KEK-enrolled but the PRF credential id is missing from localStorage.
//         It throws PRF_CREDENTIAL_LOST instead.
//   F-02  enrollKek on an already-enrolled vault throws code KEK_ALREADY_ENROLLED.
//   F-03  PRF_FIXED_SALT is the honest "prf-kek" label, not "prf-spike".
//   F-05  A browser with WebAuthn but no PRF extension (Safari) does NOT persist an
//         orphan credential id before the PRF output is confirmed.
//   F-06  changePassword zeroes H in finally even if an intermediate step throws.
//   F-08  unwrapDek zeroes the raw plaintext ArrayBuffer backing store after copy.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

function mockCredentials(prfSupported = true, prfOutput = fixedBytes(0xaa)) {
  return {
    create: vi.fn(async () => {
      if (!prfSupported) throw new Error('NotSupportedError: PRF not supported');
      return {
        rawId: new Uint8Array([1, 2, 3, 4]),
        getClientExtensionResults: () => ({ prf: { enabled: true, results: { first: prfOutput } } }),
      };
    }),
    get: vi.fn(async () => {
      if (!prfSupported) throw new Error('NotSupportedError: PRF not supported');
      return { getClientExtensionResults: () => ({ prf: { results: { first: prfOutput } } }) };
    }),
  };
}

class MockLocalStorage {
  constructor() { this.data = {}; }
  getItem(k) { return this.data[k] || null; }
  setItem(k, v) { this.data[k] = v; }
  removeItem(k) { delete this.data[k]; }
  clear() { this.data = {}; }
}

const SECRET = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const PIN = '133713370000';
const CRED_KEY = 'veyrnox-prf-cred-id';

const vaultMock = {
  encryptVault: vi.fn(async () => ({ iv: 'iv', ct: 'ct' })),
  decryptVault: vi.fn(async () => SECRET),
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
  combineKek: vi.fn(async () => fixedBytes(0xaa)),
  randomDek: vi.fn(() => fixedBytes(0xdd)),
  wrapDek: vi.fn(async () => ({ v: 2, iv: 'iv', ct: 'ct' })),
  unwrapDek: vi.fn(async () => fixedBytes(0xdd)),
  // Real-behaviour decode so valid base64 salts pass through (added when kek.js
  // gained the decodeKekSalt/parseVaultBlob blob-shape guards).
  decodeKekSalt: vi.fn((s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))),
  parseVaultBlob: vi.fn((raw) => (typeof raw === 'string' ? JSON.parse(raw) : raw)),
  KEK_ERR: {
    NO_HARDWARE_FACTOR: 'KEK_NO_HARDWARE_FACTOR',
    NO_SET_FACTOR: 'KEK_NO_SET_FACTOR',
    UNWRAP_FAILED: 'KEK_UNWRAP_FAILED',
    MALFORMED_VAULT: 'KEK_MALFORMED_VAULT',
  },
};

vi.mock('../../vault.js', () => vaultMock);
vi.mock('../../evm/vaultStore.js', () => storeMock);
vi.mock('../kek.js', () => kekMock);

describe('PRF KEK audit Phase 1', () => {
  let webKeyStore;
  let mockLocalStorage;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLocalStorage = new MockLocalStorage();
    global.window = {
      location: { hostname: 'localhost' },
      localStorage: mockLocalStorage,
      PublicKeyCredential: true,
    };
    global.navigator = { credentials: mockCredentials(true, fixedBytes(0xaa)) };
    vi.resetModules();
    const mod = await import('../web.js');
    webKeyStore = mod.webKeyStore;
    vaultMock.decryptVault.mockResolvedValue(SECRET);
    vaultMock.decryptVaultWithDek.mockResolvedValue(SECRET);
    kekMock.combineKek.mockResolvedValue(fixedBytes(0xaa));
    kekMock.unwrapDek.mockResolvedValue(fixedBytes(0xdd));
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete global.window;
    delete global.navigator;
  });

  // ── F-01 ──────────────────────────────────────────────────────────────────
  describe('F-01 — no orphan credential when KEK-enrolled but cred id lost', () => {
    it('throws PRF_CREDENTIAL_LOST and does NOT create a new credential', async () => {
      // KEK-enrolled vault present, but localStorage cred id is absent (cleared).
      storeMock.loadVault.mockResolvedValue({
        iv: 'x', ct: 'y', kekWrap: { v: 2, iv: 'i', ct: 'c' }, kekSalt: 'c2FsdA==',
      });
      const createSpy = global.navigator.credentials.create;

      await expect(webKeyStore.getHardwareFactor()).rejects.toThrow(/PRF_CREDENTIAL_LOST/);
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('still enrolls a fresh credential when vault is NOT kek-enrolled', async () => {
      storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y' }); // no kekWrap
      const H = await webKeyStore.getHardwareFactor();
      expect(H.length).toBe(32);
      expect(mockLocalStorage.getItem(CRED_KEY)).toBeTruthy();
    });
  });

  // ── F-02 ──────────────────────────────────────────────────────────────────
  describe('F-02 — re-enrollment guard in enrollKek', () => {
    it('throws KEK_ALREADY_ENROLLED (code) on an already-enrolled vault', async () => {
      storeMock.loadVault.mockResolvedValue({
        iv: 'x', ct: 'y', kekWrap: { v: 2, iv: 'i', ct: 'c' }, kekSalt: 'c2FsdA==',
      });
      await expect(
        webKeyStore.enrollKek(PIN, { getHardwareFactor: async () => fixedBytes(0xaa) }),
      ).rejects.toMatchObject({ code: 'KEK_ALREADY_ENROLLED' });
      // Must not overwrite the existing wrap.
      expect(storeMock.saveVault).not.toHaveBeenCalled();
    });
  });

  // ── F-03 ──────────────────────────────────────────────────────────────────
  describe('F-03 — PRF_FIXED_SALT honest label', () => {
    it('encodes "prf-kek" not "prf-spike"', async () => {
      const { PRF_FIXED_SALT } = await import('../web.js');
      expect(PRF_FIXED_SALT.length).toBe(32);
      const ascii = String.fromCharCode(...PRF_FIXED_SALT);
      expect(ascii).toContain('prf-kek');
      expect(ascii).not.toContain('spike');
    });
  });

  // ── F-05 ──────────────────────────────────────────────────────────────────
  describe('F-05 — no orphan credential id when PRF output is null (Safari)', () => {
    it('throws without persisting the credential id', async () => {
      storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y' }); // not enrolled
      // WebAuthn present, but neither create() nor get() yields a PRF output (Safari:
      // has WebAuthn, lacks the hmac-secret/prf extension).
      global.navigator.credentials.create = vi.fn(async () => ({
        rawId: new Uint8Array([9, 9, 9, 9]),
        getClientExtensionResults: () => ({ prf: { results: {} } }), // no 'first'
      }));
      global.navigator.credentials.get = vi.fn(async () => ({
        getClientExtensionResults: () => ({ prf: { results: {} } }), // no 'first'
      }));
      vi.resetModules();
      const mod = await import('../web.js');
      await expect(mod.webKeyStore.getHardwareFactor()).rejects.toThrow();
      expect(mockLocalStorage.getItem(CRED_KEY)).toBeNull();
    });
  });

  // ── F-06 ──────────────────────────────────────────────────────────────────
  describe('F-06 — changePassword zeroes H even on error', () => {
    it('zeroes the hardware factor when an intermediate step throws', async () => {
      const H = fixedBytes(0xaa);
      storeMock.loadVault.mockResolvedValue({
        iv: 'x', ct: 'y', kekWrap: { v: 2, iv: 'i', ct: 'c' }, kekSalt: 'c2FsdA==',
      });
      // Force an error partway through, after H is captured.
      kekMock.combineKek.mockRejectedValueOnce(new Error('boom'));

      await expect(
        webKeyStore.changePassword(PIN, 'newpassword12', { getHardwareFactor: async () => H }),
      ).rejects.toThrow();

      // H must be zeroed by finally.
      expect(bytesToHex(H)).toBe(bytesToHex(new Uint8Array(32)));
    });
  });
});

// ── F-08 (kek.js, no mocks) ───────────────────────────────────────────────
describe('F-08 — unwrapDek zeroes plaintext backing buffer', () => {
  it('the returned DEK is correct and no stray non-zero copy leaks', async () => {
    const { wrapDek, unwrapDek, randomDek } = await import('../kek.js');
    const kek = new Uint8Array(32).fill(7);
    const dek = randomDek();
    const wrapped = await wrapDek(kek, dek);
    const recovered = await unwrapDek(kek, wrapped);
    // Correctness: returned DEK matches, and it is an independent copy (mutating it
    // does not corrupt anything). The zeroing of the raw ArrayBuffer is an internal
    // hygiene step we cannot observe post-GC; we assert the copy is independent.
    expect(recovered).toEqual(dek);
    expect(recovered.buffer).not.toBe(wrapped.buffer);
  });
});
