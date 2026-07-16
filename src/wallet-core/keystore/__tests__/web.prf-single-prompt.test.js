// src/wallet-core/keystore/__tests__/web.prf-single-prompt.test.js
//
// Issue #1030: Web PRF first-time enrollment fires two WebAuthn prompts.
//
// Chrome >=118 returns PRF output directly from navigator.credentials.create().
// The fix: createPrfCredential() returns the PRF output alongside credId;
// getHardwareFactor() skips the get() call when create() already yielded H.
//
// Safari/Firefox do NOT return PRF from create() — for those browsers the
// two-prompt fallback (create + get) must remain intact.
//
// Spec mapping:
//   F-05 — credential id persisted ONLY after PRF output confirmed
//   I6   — hardware binding: PRF-derived H is the device factor

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── helpers ─────────────────────────────────────────────────────────────────

function fixedBytes(byte, n = 32) {
  const a = new Uint8Array(n);
  a.fill(byte);
  return a;
}

const TEST_PRF_OUTPUT = fixedBytes(0xbb);

// ── Mock navigator.credentials ──────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {boolean} opts.createReturnsPrf - true = Chrome >=118 (PRF in create)
 * @param {Uint8Array} [opts.prfOutput]   - the 32-byte PRF result
 */
function mockCredentials({ createReturnsPrf, prfOutput = TEST_PRF_OUTPUT } = {}) {
  return {
    create: vi.fn(async () => ({
      rawId: new Uint8Array([1, 2, 3, 4]),
      getClientExtensionResults: () => createReturnsPrf
        ? { prf: { enabled: true, results: { first: prfOutput.buffer } } }
        : { prf: { enabled: true } }, // no results — Safari/Firefox
    })),
    get: vi.fn(async () => ({
      getClientExtensionResults: () => ({
        prf: { results: { first: prfOutput.buffer } },
      }),
    })),
  };
}

// ── Mock localStorage ───────────────────────────────────────────────────────

class MockLocalStorage {
  constructor() { this.data = {}; }
  getItem(k) { return this.data[k] ?? null; }
  setItem(k, v) { this.data[k] = v; }
  removeItem(k) { delete this.data[k]; }
  clear() { this.data = {}; }
}

// ── Static mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('../../evm/vaultStore.js', () => ({
  loadVault: vi.fn(async () => null),
  saveVault: vi.fn(async () => {}),
  hasVault: vi.fn(async () => false),
  clearVault: vi.fn(async () => {}),
}));

vi.mock('../../vault.js', () => ({
  encryptVault: vi.fn(),
  decryptVault: vi.fn(),
  vaultNeedsRekey: vi.fn(() => false),
  deriveKekC: vi.fn(async () => fixedBytes(0xcc)),
  encryptVaultWithDek: vi.fn(async () => ({ iv: 'iv', ct: 'ct' })),
  decryptVaultWithDek: vi.fn(async () => 'test-secret'),
}));

vi.mock('../kek.js', () => ({
  combineKek: vi.fn(async () => fixedBytes(0xaa)),
  randomDek: vi.fn(() => fixedBytes(0xdd)),
  wrapDek: vi.fn(async () => ({ v: 1, iv: 'iv', ct: 'ct' })),
  unwrapDek: vi.fn(async () => fixedBytes(0xdd)),
  KEK_ERR: {
    NO_HARDWARE_FACTOR: 'KEK_NO_HARDWARE_FACTOR',
    UNWRAP_FAILED: 'KEK_UNWRAP_FAILED',
    MALFORMED_VAULT: 'KEK_MALFORMED_VAULT',
  },
  decodeKekSalt: (s) => new Uint8Array(32),
}));

// ── Test suite ──────────────────────────────────────────────────────────────

describe('web.js getHardwareFactor — single-prompt enrollment (#1030)', () => {
  let webKeyStore;
  let mockStore;
  let mockCreds;

  beforeEach(() => {
    mockStore = new MockLocalStorage();
    global.window = {
      location: { hostname: 'localhost' },
      localStorage: mockStore,
      PublicKeyCredential: {
        isConditionalMediationAvailable: async () => true,
      },
    };
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete global.window;
    delete global.navigator;
  });

  async function loadModule(creds) {
    global.navigator = { credentials: creds };
    vi.resetModules();
    const mod = await import('../web.js');
    return mod.webKeyStore;
  }

  // ────────────────────────────────────────────────────────────────────────
  // RED test 1: Chrome >=118 — create() returns PRF output => single prompt
  // ────────────────────────────────────────────────────────────────────────
  it('skips get() when create() already returns PRF output (Chrome >=118)', async () => {
    mockCreds = mockCredentials({ createReturnsPrf: true });
    webKeyStore = await loadModule(mockCreds);

    const H = await webKeyStore.getHardwareFactor();

    // create() called exactly once
    expect(mockCreds.create).toHaveBeenCalledTimes(1);
    // get() must NOT be called — single prompt
    expect(mockCreds.get).toHaveBeenCalledTimes(0);
    // H is the expected 32-byte PRF output
    expect(H).toBeInstanceOf(Uint8Array);
    expect(H.length).toBe(32);
    expect(H[0]).toBe(0xbb);
  });

  // ────────────────────────────────────────────────────────────────────────
  // RED test 2: Safari/Firefox — create() has no PRF => falls through to get()
  // ────────────────────────────────────────────────────────────────────────
  it('falls through to get() when create() returns no PRF output (Safari)', async () => {
    mockCreds = mockCredentials({ createReturnsPrf: false });
    webKeyStore = await loadModule(mockCreds);

    const H = await webKeyStore.getHardwareFactor();

    // Both create() and get() called — two prompts (expected on Safari)
    expect(mockCreds.create).toHaveBeenCalledTimes(1);
    expect(mockCreds.get).toHaveBeenCalledTimes(1);
    // H is still valid
    expect(H).toBeInstanceOf(Uint8Array);
    expect(H.length).toBe(32);
    expect(H[0]).toBe(0xbb);
  });

  // ────────────────────────────────────────────────────────────────────────
  // F-05: credential id persisted ONLY after PRF output confirmed
  // ────────────────────────────────────────────────────────────────────────
  it('F-05: persists credential id after single-prompt PRF (Chrome path)', async () => {
    mockCreds = mockCredentials({ createReturnsPrf: true });
    webKeyStore = await loadModule(mockCreds);

    await webKeyStore.getHardwareFactor();

    const stored = mockStore.getItem('veyrnox-prf-cred-id');
    expect(stored).toBeTruthy();
    expect(typeof stored).toBe('string');
  });

  it('F-05: persists credential id after two-prompt PRF (Safari path)', async () => {
    mockCreds = mockCredentials({ createReturnsPrf: false });
    webKeyStore = await loadModule(mockCreds);

    await webKeyStore.getHardwareFactor();

    const stored = mockStore.getItem('veyrnox-prf-cred-id');
    expect(stored).toBeTruthy();
    expect(typeof stored).toBe('string');
  });

  // ────────────────────────────────────────────────────────────────────────
  // Safety: wrong-length PRF from create() falls through to get()
  // ────────────────────────────────────────────────────────────────────────
  it('falls through to get() when create() PRF output is wrong length', async () => {
    const badPrf = fixedBytes(0xcc, 16); // 16 bytes, not 32
    mockCreds = mockCredentials({ createReturnsPrf: true, prfOutput: badPrf });

    // Override get() to return a valid 32-byte PRF
    mockCreds.get = vi.fn(async () => ({
      getClientExtensionResults: () => ({
        prf: { results: { first: TEST_PRF_OUTPUT.buffer } },
      }),
    }));

    webKeyStore = await loadModule(mockCreds);
    const H = await webKeyStore.getHardwareFactor();

    // Wrong-length from create() => must fall through to get()
    expect(mockCreds.create).toHaveBeenCalledTimes(1);
    expect(mockCreds.get).toHaveBeenCalledTimes(1);
    expect(H.length).toBe(32);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Returning user (credId already in localStorage) — get()-only, unchanged
  // ────────────────────────────────────────────────────────────────────────
  it('returning user: uses get() only, does not call create()', async () => {
    mockCreds = mockCredentials({ createReturnsPrf: true });
    // Pre-populate localStorage with a stored credential id
    mockStore.setItem('veyrnox-prf-cred-id', 'AQIDBA');

    webKeyStore = await loadModule(mockCreds);
    const H = await webKeyStore.getHardwareFactor();

    // Returning user: no create(), only get()
    expect(mockCreds.create).toHaveBeenCalledTimes(0);
    expect(mockCreds.get).toHaveBeenCalledTimes(1);
    expect(H).toBeInstanceOf(Uint8Array);
    expect(H.length).toBe(32);
  });
});
