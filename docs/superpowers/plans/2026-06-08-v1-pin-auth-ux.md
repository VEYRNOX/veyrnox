# v1 PIN Auth UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v1 6-digit PIN authentication entry surface (KEK-less) on the existing `vault.js` Argon2id derivation: four-path resolution, Face-ID-to-decoy, and §7 Option A (deterministic decoy-from-any-PIN, no error state), for a new PIN cohort only.

**Architecture:** The PIN string is passed verbatim as the `password` into the unchanged `vault.js`/`keyStore` crypto. The already-built four-path unlock (`WalletProvider.unlock` → `resolveDeniabilityUnlock`) is extended with a **4th constant Argon2id KDF slot** (deterministic decoy) that runs unconditionally so total-miss is timing-indistinguishable from any enrolled hit. A non-secret per-device marker `veyrnox-auth-model='pin'` selects the PIN surface + Option A; existing password vaults are untouched. Face ID caches and replays the **duress PIN** (never the real PIN), resolving to the decoy through the unchanged duress path.

**Tech Stack:** Vite + React, Vitest (jsdom), `hash-wasm` (Argon2id), `@scure/bip39`, existing `wallet-core` modules.

**Spec:** `docs/superpowers/specs/2026-06-08-v1-pin-auth-ux-design.md`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/wallet-core/mnemonic.js` | Add `mnemonicFromEntropy(bytes)` (BIP-39 entropy→mnemonic) | Modify |
| `src/wallet-core/decoyFallback.js` | Deterministic decoy derivation (Argon2id, memory-hard) + device-salt accessor | Create |
| `src/lib/authModel.js` | Non-secret cohort marker (`pin`/`password`) + the biometric re-cache decision helper | Create |
| `src/wallet-core/deniabilityUnlock.js` | Add the 4th unconditional KDF slot; return `fallbackDecoyMnemonic` | Modify |
| `src/lib/WalletProvider.jsx` | Option-A branch in `unlock`; `changePassword` real-PIN re-cache guard | Modify |
| `src/components/security/PinPad.jsx` | 6-digit numeric pad + always-present "Re-enter" control | Create |
| `src/components/WalletEntry.jsx` | Auth-model routing; PIN onboarding (real+duress+optional panic+Face-ID-to-decoy); returning PIN unlock | Modify |
| `src/wallet-core/__tests__/decoyFallback.test.js` | Determinism, validity, memory-hard (not cheap-hash) | Create |
| `src/wallet-core/__tests__/deniability-timing.test.js` | Add PIN-cohort 4-slot **execution** assertions | Modify |
| `src/lib/__tests__/authModel.test.js` | Cohort marker + re-cache guard | Create |

---

## Task 1: `mnemonicFromEntropy` helper

**Files:**
- Modify: `src/wallet-core/mnemonic.js`
- Test: `src/wallet-core/__tests__/mnemonic-from-entropy.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/wallet-core/__tests__/mnemonic-from-entropy.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { mnemonicFromEntropy, validateMnemonic } from '../mnemonic.js';

describe('mnemonicFromEntropy', () => {
  it('maps the canonical all-zero 128-bit entropy to the known BIP-39 mnemonic', () => {
    const entropy = new Uint8Array(16); // all zeros
    const m = mnemonicFromEntropy(entropy);
    expect(m).toBe(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    );
    expect(validateMnemonic(m)).toBe(true);
  });

  it('is deterministic and produces a valid mnemonic for arbitrary entropy', () => {
    const entropy = new Uint8Array(16).fill(7);
    expect(mnemonicFromEntropy(entropy)).toBe(mnemonicFromEntropy(entropy));
    expect(validateMnemonic(mnemonicFromEntropy(entropy))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wallet-core/__tests__/mnemonic-from-entropy.test.js`
Expected: FAIL — `mnemonicFromEntropy is not a function`.

- [ ] **Step 3: Implement the helper**

In `src/wallet-core/mnemonic.js`, update the import on line 27 and add the export. Change:

```js
import { generateMnemonic as scureGenerate, validateMnemonic as scureValidate, mnemonicToSeedSync } from '@scure/bip39';
```

to:

```js
import { generateMnemonic as scureGenerate, validateMnemonic as scureValidate, mnemonicToSeedSync, entropyToMnemonic } from '@scure/bip39';
```

Then append, after `mnemonicToSeed` (before the `normalize` helper):

```js
/**
 * Deterministically map raw entropy bytes to a checksummed BIP-39 mnemonic.
 * Used by the deterministic decoy fallback (wallet-core/decoyFallback.js): the
 * SAME entropy always yields the SAME mnemonic. 16 bytes => 12 words, 32 => 24.
 * @param {Uint8Array} entropy - 16 or 32 bytes
 * @returns {string} mnemonic (LIVE-ish: an empty decoy wallet's phrase)
 */
export function mnemonicFromEntropy(entropy) {
  return entropyToMnemonic(entropy, wordlist);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/wallet-core/__tests__/mnemonic-from-entropy.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/wallet-core/mnemonic.js src/wallet-core/__tests__/mnemonic-from-entropy.test.js
git commit -m "feat(wallet-core): add mnemonicFromEntropy (deterministic BIP-39 entropy->mnemonic)"
```

---

## Task 2: `decoyFallback.js` — deterministic, memory-hard decoy derivation

This is the heart of review item 1: the fallback MUST use Argon2id at the shared `KDF_PARAMS`, not a cheap hash, or the miss path becomes a timing oracle.

**Files:**
- Create: `src/wallet-core/decoyFallback.js`
- Test: `src/wallet-core/__tests__/decoyFallback.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/wallet-core/__tests__/decoyFallback.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Wrap hash-wasm's argon2id so we can assert the fallback is MEMORY-HARD (real
// Argon2id at the shared params), not a cheap hash. Calls through to the real impl.
const kdf = vi.hoisted(() => ({ count: 0, memorySizes: [] }));
vi.mock('hash-wasm', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    argon2id: (opts, ...rest) => {
      kdf.count += 1;
      kdf.memorySizes.push(opts && opts.memorySize);
      return orig.argon2id(opts, ...rest);
    },
  };
});

import { deriveDeterministicDecoyMnemonic, getOrCreateDeviceSalt } from '../decoyFallback.js';
import { KDF_PARAMS } from '../vault.js';
import { validateMnemonic } from '../mnemonic.js';

const SALT_KEY = 'veyrnox-pin-decoy-salt';

describe('decoyFallback — deterministic, memory-hard decoy derivation', () => {
  beforeEach(() => {
    localStorage.clear();
    kdf.count = 0;
    kdf.memorySizes = [];
  });

  it('derives a deterministic, valid BIP-39 wallet from (pin, salt)', async () => {
    const salt = getOrCreateDeviceSalt();
    const a = await deriveDeterministicDecoyMnemonic('123456', salt);
    const b = await deriveDeterministicDecoyMnemonic('123456', salt);
    expect(a).toBe(b);                    // same pin+salt => same wallet
    expect(validateMnemonic(a)).toBe(true);
  });

  it('different PINs derive different wallets', async () => {
    const salt = getOrCreateDeviceSalt();
    const a = await deriveDeterministicDecoyMnemonic('123456', salt);
    const c = await deriveDeterministicDecoyMnemonic('654321', salt);
    expect(a).not.toBe(c);
  });

  it('uses Argon2id at the shared KDF_PARAMS (memory-hard, NOT a cheap hash)', async () => {
    const salt = getOrCreateDeviceSalt();
    kdf.count = 0; kdf.memorySizes = [];
    await deriveDeterministicDecoyMnemonic('123456', salt);
    expect(kdf.count).toBe(1);                                  // exactly one KDF
    expect(kdf.memorySizes[0]).toBe(KDF_PARAMS.memorySize);     // same cost as a real attempt
  });

  it('getOrCreateDeviceSalt is stable across calls and persisted', () => {
    const s1 = getOrCreateDeviceSalt();
    const s2 = getOrCreateDeviceSalt();
    expect(Array.from(s1)).toEqual(Array.from(s2));
    expect(localStorage.getItem(SALT_KEY)).toBeTruthy();
    expect(s1.length).toBe(16);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wallet-core/__tests__/decoyFallback.test.js`
Expected: FAIL — cannot resolve `../decoyFallback.js`.

- [ ] **Step 3: Implement `decoyFallback.js`**

Create `src/wallet-core/decoyFallback.js`:

```js
// wallet-core/decoyFallback.js
//
// OPTION A (kek-architecture-spec.md §7) — DETERMINISTIC DECOY-FROM-ANY-PIN.
// PROVISIONAL. ⚠️ FLAGGED FOR INDEPENDENT AUDIT VALIDATION. ⚠️
//
// In the PIN cohort, NO 6-digit PIN may produce an error state — a "wrong PIN"
// error is an oracle that reveals the entered PIN was not one of the enrolled set
// (so a real set exists elsewhere). Any PIN that does not resolve to the primary /
// duress / hidden / panic credential instead deterministically derives a fresh,
// empty-but-real BIP-39 wallet, opened as an ephemeral decoy session.
//
// ⚠️ TIMING (the load-bearing property — review item 1). This derivation MUST be
// memory-hard at the SAME cost as a real unlock attempt, NOT a cheap hash. The
// enrolled paths each run one Argon2id KDF (~0.4-1.7 s); a cheap-hash fallback
// would return near-instantly and that delta would distinguish "enrolled" from
// "garbage" straight off the clock — the exact oracle Option A exists to erase. So
// we run argon2id at the shared KDF_PARAMS, and deniabilityUnlock.js invokes this
// as a 4th CONSTANT slot, UNCONDITIONALLY, so total-miss costs the same as any hit.
//
// Determinism is for PLAUSIBILITY, not secrecy: the same wrong PIN always opens the
// same empty wallet, so re-entry is consistent. The deviceSalt is a NON-SECRET,
// once-generated local value; a seized device exposes it, which is irrelevant — the
// derived wallets are genuinely empty (no funds to lose).
//
// TESTNET ONLY. No network/provider/signing — only a KDF + entropy->mnemonic.

import { argon2id } from 'hash-wasm';
import { KDF_PARAMS } from './vault.js';
import { mnemonicFromEntropy } from './mnemonic.js';

// Non-secret, per-device salt for the deterministic decoy. Stored once in
// localStorage so the same wrong PIN maps to the same empty wallet across attempts.
const SALT_KEY = 'veyrnox-pin-decoy-salt';
const enc = new TextEncoder();

function b64(u8) { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); }
function unb64(str) { const s = atob(str); const u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; }

/**
 * Return the device's stable, non-secret decoy salt (16 bytes), creating and
 * persisting it on first use. Best-effort on storage failure (returns a fresh
 * random salt so derivation still works, at the cost of cross-attempt stability).
 * @returns {Uint8Array}
 */
export function getOrCreateDeviceSalt() {
  try {
    const existing = localStorage.getItem(SALT_KEY);
    if (existing) return unb64(existing);
  } catch { /* storage unavailable; fall through to a fresh salt */ }
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  try { localStorage.setItem(SALT_KEY, b64(salt)); } catch { /* best-effort */ }
  return salt;
}

/**
 * Deterministically derive an empty-but-real decoy mnemonic from a PIN. Runs ONE
 * Argon2id at the shared KDF_PARAMS (memory-hard — see header), then uses the first
 * 16 bytes of output as 128-bit BIP-39 entropy. Same (pin, deviceSalt) => same
 * mnemonic.
 * @param {string} pin
 * @param {Uint8Array} deviceSalt
 * @returns {Promise<string>} a valid 12-word BIP-39 mnemonic
 */
export async function deriveDeterministicDecoyMnemonic(pin, deviceSalt) {
  const raw = await argon2id({
    password: enc.encode(String(pin).normalize('NFKC')),
    salt: deviceSalt,
    parallelism: KDF_PARAMS.parallelism,
    iterations: KDF_PARAMS.iterations,
    memorySize: KDF_PARAMS.memorySize, // SAME memory-hardness as a real attempt
    hashLength: KDF_PARAMS.hashLength,
    outputType: 'binary',
  });
  const entropy = raw.slice(0, 16); // 128-bit => 12-word mnemonic
  return mnemonicFromEntropy(entropy);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/wallet-core/__tests__/decoyFallback.test.js`
Expected: PASS (4 tests). (Each Argon2id run is ~0.5-1.5 s; the suite may take a few seconds.)

- [ ] **Step 5: Commit**

```bash
git add src/wallet-core/decoyFallback.js src/wallet-core/__tests__/decoyFallback.test.js
git commit -m "feat(wallet-core): deterministic memory-hard decoy fallback (Option A, §7)"
```

---

## Task 3: `authModel.js` — cohort marker + biometric re-cache guard

**Files:**
- Create: `src/lib/authModel.js`
- Test: `src/lib/__tests__/authModel.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/authModel.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAuthModel, setAuthModel, isPinModel, shouldCacheUnlockSecret,
} from '../authModel.js';

describe('authModel — cohort marker', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to the password cohort when unset', () => {
    expect(getAuthModel()).toBe('password');
    expect(isPinModel()).toBe(false);
  });

  it('persists and reads back the pin cohort', () => {
    setAuthModel('pin');
    expect(getAuthModel()).toBe('pin');
    expect(isPinModel()).toBe(true);
  });
});

describe('shouldCacheUnlockSecret — never re-cache the real PIN (review item 3)', () => {
  it('password cohort with biometric on: re-cache allowed', () => {
    expect(shouldCacheUnlockSecret({ authModel: 'password', biometricEnabled: true })).toBe(true);
  });

  it('PIN cohort: NEVER re-cache (the changed secret is the real PIN)', () => {
    expect(shouldCacheUnlockSecret({ authModel: 'pin', biometricEnabled: true })).toBe(false);
  });

  it('biometric off: never re-cache regardless of cohort', () => {
    expect(shouldCacheUnlockSecret({ authModel: 'password', biometricEnabled: false })).toBe(false);
    expect(shouldCacheUnlockSecret({ authModel: 'pin', biometricEnabled: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/__tests__/authModel.test.js`
Expected: FAIL — cannot resolve `../authModel.js`.

- [ ] **Step 3: Implement `authModel.js`**

Create `src/lib/authModel.js`:

```js
// lib/authModel.js
//
// NON-SECRET per-device auth cohort marker. 'pin' selects the v1 6-digit PIN
// entry surface + Option A deterministic-decoy resolution; 'password' is the
// legacy free-text vault-password surface (unchanged). Written once at PIN-wallet
// creation. This is NOT a secret and NOT a deniability tell: within the PIN cohort
// it is universal (every PIN device is the same single-mode machine), and the
// entry surfaces are visibly different anyway, so the cohort is already observable.

const KEY = 'veyrnox-auth-model';

/** @returns {'pin'|'password'} */
export function getAuthModel() {
  try { return localStorage.getItem(KEY) === 'pin' ? 'pin' : 'password'; }
  catch { return 'password'; }
}

export function setAuthModel(model) {
  try { localStorage.setItem(KEY, model === 'pin' ? 'pin' : 'password'); }
  catch { /* best-effort; defaults to password on read */ }
}

export function isPinModel() { return getAuthModel() === 'pin'; }

/**
 * Whether changePassword may re-cache the NEW secret behind the biometric gate.
 * REVIEW ITEM 3: in the PIN cohort the biometric cache holds the DURESS PIN, and
 * the secret changePassword changes is the REAL PIN — re-caching it would make
 * Face ID open the real set (the coercion bypass §2/§11 forbid). So the PIN cohort
 * NEVER re-caches. Pure for testability.
 * @param {{authModel: 'pin'|'password', biometricEnabled: boolean}} ctx
 * @returns {boolean}
 */
export function shouldCacheUnlockSecret({ authModel, biometricEnabled }) {
  return biometricEnabled && authModel !== 'pin';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/__tests__/authModel.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/authModel.js src/lib/__tests__/authModel.test.js
git commit -m "feat(lib): auth-model cohort marker + real-PIN re-cache guard"
```

---

## Task 4: `deniabilityUnlock.js` — 4th unconditional KDF slot

This is the line-in-the-sand. The test asserts the four slots **execute unconditionally per outcome** (observed via per-call salts), not merely a call-count of 4.

**Files:**
- Modify: `src/wallet-core/deniabilityUnlock.js`
- Modify: `src/wallet-core/__tests__/deniability-timing.test.js`

- [ ] **Step 1: Write the failing test additions**

In `src/wallet-core/__tests__/deniability-timing.test.js`, extend the hash-wasm mock to also record salts, and add a new PIN-cohort describe block.

Replace the existing mock factory (lines 17-28) with one that records salts too:

```js
const kdf = vi.hoisted(() => ({ count: 0, memorySizes: [], salts: [] }));
vi.mock('hash-wasm', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    argon2id: (opts, ...rest) => {
      kdf.count += 1;
      kdf.memorySizes.push(opts && opts.memorySize);
      kdf.salts.push(opts && opts.salt ? Array.from(opts.salt) : null);
      return orig.argon2id(opts, ...rest);
    },
  };
});
```

Add this import near the other imports (after the `vault.js` import on line 31):

```js
import { getOrCreateDeviceSalt } from '../decoyFallback.js';
import { validateMnemonic } from '../mnemonic.js';
```

Append a new describe block at the end of the file (before the final closing of the file):

```js
describe('PIN cohort (Option A) — 4th constant slot EXECUTES unconditionally', () => {
  // The deterministic-fallback slot must run on EVERY post-miss outcome — even when
  // an enrolled path (panic/duress/hidden) wins — or total-miss becomes timeable.
  // We assert per-slot EXECUTION (the fallback's deviceSalt appears among the KDF
  // salts) on each outcome, not merely that argon2id was called four times.
  const EXPECTED_PIN_KDFS = 4;
  let deviceSalt;

  beforeEach(async () => {
    localStorage.clear();
    await resetDevice();
    deviceSalt = getOrCreateDeviceSalt();
  });

  function fallbackRan() {
    // The fallback slot is the ONLY KDF keyed by the fixed deviceSalt.
    return kdf.salts.some((s) => s && s.length === deviceSalt.length
      && s.every((b, i) => b === deviceSalt[i]));
  }

  async function resolvePin(pw) {
    await ensureStealthPool();
    kdf.count = 0; kdf.memorySizes = []; kdf.salts = [];
    return resolveDeniabilityUnlock(pw, { deterministicFallback: true, deviceSalt });
  }

  const outcomes = [
    { name: 'total miss', setup: async () => {}, pw: WRONG_PW },
    {
      name: 'duress hit',
      setup: async () => { await setDuressVault('legal winner thank year wave sausage worth useful legal winner thank yellow', 'duress-pin-1'); },
      pw: 'duress-pin-1',
    },
    {
      name: 'panic hit',
      setup: async () => { await setPanicVault('panic-pin-1'); },
      pw: 'panic-pin-1',
    },
    {
      name: 'hidden hit',
      setup: async () => { await createHiddenWallet('hidden-secret-1'); },
      pw: 'hidden-secret-1',
    },
  ];

  for (const o of outcomes) {
    it(`spends ${EXPECTED_PIN_KDFS} KDFs AND the fallback slot executes — ${o.name}`, async () => {
      await o.setup();
      const r = await resolvePin(o.pw);
      // Exactly four KDFs, all at the shared params.
      expect(kdf.count).toBe(EXPECTED_PIN_KDFS);
      for (const m of kdf.memorySizes) expect(m).toBe(KDF_PARAMS.memorySize);
      // The 4th slot EXECUTED — even when an enrolled path won (no short-circuit).
      expect(fallbackRan()).toBe(true);
    });
  }

  it('total miss returns a valid deterministic fallback decoy (no throw, no error state)', async () => {
    const r = await resolvePin(WRONG_PW);
    expect(r.panic).toBe(false);
    expect(r.duressMnemonic).toBeNull();
    expect(r.hiddenMnemonic).toBeNull();
    expect(r.fallbackDecoyMnemonic).toBeTruthy();
    expect(validateMnemonic(r.fallbackDecoyMnemonic)).toBe(true);
    // Deterministic: same PIN+salt resolves to the same empty wallet.
    const again = await resolvePin(WRONG_PW);
    expect(again.fallbackDecoyMnemonic).toBe(r.fallbackDecoyMnemonic);
  });

  it('password cohort is unchanged: no fallback slot, 3 KDFs, null fallback', async () => {
    await ensureStealthPool();
    kdf.count = 0; kdf.salts = [];
    const r = await resolveDeniabilityUnlock(WRONG_PW); // no opts => password cohort
    expect(kdf.count).toBe(3);
    expect(r.fallbackDecoyMnemonic ?? null).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wallet-core/__tests__/deniability-timing.test.js`
Expected: FAIL — the new block fails (`resolveDeniabilityUnlock` ignores opts, spends 3 KDFs, `fallbackDecoyMnemonic` undefined; `fallbackRan()` false).

- [ ] **Step 3: Implement the 4th slot**

In `src/wallet-core/deniabilityUnlock.js`:

Add the import after line 69 (`import { ensureStealthPool, tryRevealHidden } from './stealth.js';`):

```js
import { deriveDeterministicDecoyMnemonic } from './decoyFallback.js';
```

Replace the `resolveDeniabilityUnlock` function (lines 141-152) with:

```js
export async function resolveDeniabilityUnlock(password, opts = {}) {
  // Guarantee the stealth slot holds a blob so the reveal attempt is always one
  // KDF (idempotent, non-destructive, NO KDF of its own).
  await ensureStealthPool();

  // Slots 1-3: exactly three KDFs, evaluated unconditionally — no short-circuit.
  const panic = await constantPanic(password);
  const duressMnemonic = await constantDuress(password);
  const hiddenMnemonic = await tryRevealHidden(password); // pool seeded => 1 KDF

  // Slot 4 (PIN cohort only — Option A, §7): the deterministic decoy. Runs
  // UNCONDITIONALLY (even when an enrolled path above already won) so total-miss
  // costs the SAME four KDFs as any hit and is timing-indistinguishable. The
  // caller only USES it on a total miss (priority panic > duress > hidden >
  // fallback), but it is always EXECUTED. MUST be memory-hard Argon2id at the
  // shared params (decoyFallback.js), never a cheap hash, or the miss path leaks.
  // The password cohort passes no opts, so this slot does not run (3 KDFs + the
  // caller throws on a total miss, unchanged).
  let fallbackDecoyMnemonic = null;
  if (opts.deterministicFallback) {
    fallbackDecoyMnemonic = await deriveDeterministicDecoyMnemonic(password, opts.deviceSalt);
  }

  return { panic, duressMnemonic, hiddenMnemonic, fallbackDecoyMnemonic };
}
```

Also update the JSDoc above the function: change the `@returns` line to:

```js
 * @returns {Promise<{ panic: boolean, duressMnemonic: string|null, hiddenMnemonic: string|null, fallbackDecoyMnemonic: string|null }>}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/wallet-core/__tests__/deniability-timing.test.js`
Expected: PASS — both the original password-cohort block (3 KDFs) and the new PIN-cohort block (4 KDFs, fallback executes on every outcome).

- [ ] **Step 5: Commit**

```bash
git add src/wallet-core/deniabilityUnlock.js src/wallet-core/__tests__/deniability-timing.test.js
git commit -m "feat(wallet-core): 4th unconditional KDF slot for Option A (timing-uniform miss)"
```

---

## Task 5: `WalletProvider.unlock` Option-A branch + `changePassword` guard

Wire the new resolution into the session. No new React test harness exists, so correctness of the resolution itself is covered by Task 4; here we make the minimal provider edits and verify the full suite + a preview smoke.

**Files:**
- Modify: `src/lib/WalletProvider.jsx`

- [ ] **Step 1: Add imports**

After line 83 (`import { resolveDeniabilityUnlock } from '@/wallet-core/deniabilityUnlock';`) add:

```js
import { getOrCreateDeviceSalt } from '@/wallet-core/decoyFallback';
import { getAuthModel, shouldCacheUnlockSecret } from '@/lib/authModel';
```

- [ ] **Step 2: Branch `unlock` on Option A**

In `unlock` (catch block), replace the resolution + branching (lines 900-914) with:

```js
      const pinModel = opts.pinModel === true;
      const { panic, duressMnemonic, hiddenMnemonic, fallbackDecoyMnemonic } =
        await resolveDeniabilityUnlock(
          password,
          pinModel
            ? { deterministicFallback: true, deviceSalt: getOrCreateDeviceSalt() }
            : {},
        );
      if (panic) {
        await panicWipe();
        throw primaryErr; // keys destroyed; surface a plain wrong-password failure
      }
      if (duressMnemonic != null) {
        mnemonic = duressMnemonic;
        decoy = true;
      } else if (hiddenMnemonic != null) {
        mnemonic = hiddenMnemonic;
        hidden = true;
      } else if (fallbackDecoyMnemonic != null) {
        // OPTION A (§7): a non-enrolled PIN opens a fresh, empty, deterministic
        // decoy as an ephemeral session — NO error state, NO oracle. PIN cohort
        // only (fallback is null for the password cohort, which throws below).
        mnemonic = fallbackDecoyMnemonic;
        decoy = true;
      } else {
        throw primaryErr; // password cohort total miss: unchanged behaviour
      }
```

- [ ] **Step 3: Guard `changePassword` from re-caching the real PIN**

In `changePassword` (lines 811-822), replace the biometric re-cache block:

```js
    if (isBiometricUnlockEnabled()) {
      try { await storeUnlockSecret(newPassword); } catch { /* fall back to password */ }
    }
```

with:

```js
    // REVIEW ITEM 3: never re-cache the REAL PIN behind the biometric gate. In the
    // PIN cohort the biometric cache holds the DURESS PIN (Face-ID-to-decoy); the
    // secret changed here is the REAL PIN, and caching it would make Face ID open
    // the real set — the coercion bypass §2/§11 forbid. Password cohort is
    // unchanged (re-cache the new password so Face ID keeps working).
    if (shouldCacheUnlockSecret({ authModel: getAuthModel(), biometricEnabled: isBiometricUnlockEnabled() })) {
      try { await storeUnlockSecret(newPassword); } catch { /* fall back to password */ }
    }
```

- [ ] **Step 4: Run the full suite to verify no regression**

Run: `npx vitest run`
Expected: PASS — all existing tests plus the new ones green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/WalletProvider.jsx
git commit -m "feat(lib): wire Option A decoy fallback into unlock + real-PIN re-cache guard"
```

---

## Task 6: `PinPad` component

**Files:**
- Create: `src/components/security/PinPad.jsx`

- [ ] **Step 1: Implement the component**

Create `src/components/security/PinPad.jsx`:

```jsx
// components/security/PinPad.jsx — the v1 6-digit PIN entry surface.
//
// Structurally identical regardless of which credential slots exist (spec §5):
// it only collects six digits and hands them up. The "Re-enter" (clear) control is
// ALWAYS present and set-existence-independent — it leaks nothing about whether a
// real / duress / hidden set is configured. No security logic lives here.

import { Delete } from "lucide-react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

export default function PinPad({ value, onChange, onComplete, disabled = false, length = 6 }) {
  const press = (k) => {
    if (disabled) return;
    if (k === "back") { onChange(value.slice(0, -1)); return; }
    if (k === "clear") { onChange(""); return; }
    if (value.length >= length) return;
    const next = value + k;
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  return (
    <div className="space-y-5">
      {/* Six position dots — no value echoed, identical in every configuration. */}
      <div className="flex justify-center gap-3" role="status" aria-label={`${value.length} of ${length} digits entered`}>
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full border ${i < value.length ? "bg-primary border-primary" : "border-border"}`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k) => {
          if (k === "clear") {
            return (
              <button
                key={k}
                type="button"
                disabled={disabled || value.length === 0}
                onClick={() => press(k)}
                className="h-14 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                Re-enter
              </button>
            );
          }
          if (k === "back") {
            return (
              <button
                key={k}
                type="button"
                aria-label="Delete last digit"
                disabled={disabled || value.length === 0}
                onClick={() => press(k)}
                className="h-14 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <Delete className="h-5 w-5" />
              </button>
            );
          }
          return (
            <button
              key={k}
              type="button"
              disabled={disabled}
              onClick={() => press(k)}
              className="h-14 rounded-xl bg-secondary/40 hover:bg-secondary text-xl font-semibold mono-value disabled:opacity-40"
            >
              {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `npx vite build`
Expected: build succeeds with no errors referencing PinPad.

- [ ] **Step 3: Commit**

```bash
git add src/components/security/PinPad.jsx
git commit -m "feat(ui): PinPad 6-digit entry surface (structurally uniform, §5)"
```

---

## Task 7: `WalletEntry` — PIN onboarding + returning PIN unlock + Face-ID-to-decoy

The largest UI change. Reuses existing provider methods: `createWallet(realPin)`, `setDuressPin(duressPin)`, `setPanicPin(panicPin)`, `enableBiometricUnlock(duressPin)`, `unlock(pin, {pinModel:true})`, `unlockWithBiometric()`. Writes `setAuthModel('pin')` + seeds the device salt at creation.

**Files:**
- Modify: `src/components/WalletEntry.jsx`

- [ ] **Step 1: Add imports**

After the existing import block (around line 52) add:

```jsx
import PinPad from "@/components/security/PinPad";
import { getAuthModel, setAuthModel } from "@/lib/authModel";
import { getOrCreateDeviceSalt } from "@/wallet-core/decoyFallback";
```

- [ ] **Step 2: Add PIN-cohort state**

Inside `WalletEntry`, after the existing `useState` declarations (around line 180), add:

```jsx
  // v1 PIN cohort. authModel is read once the vault-existence probe resolves.
  const [authModel, setAuthModelState] = useState("password");
  // PIN onboarding sub-steps: 'real' -> 'real-confirm' -> 'duress' -> 'panic' ->
  // 'backup'. Returning PIN users enter on the unlock pad.
  const [pinStep, setPinStep] = useState("real");
  const [realPin, setRealPin] = useState("");
  const [realPinConfirm, setRealPinConfirm] = useState("");
  const [duressPin, setDuressPin_] = useState("");
  const [panicPin, setPanicPin_] = useState("");
  const [unlockPin, setUnlockPin] = useState("");
  // Hold the chosen duress PIN across onboarding so we can cache it for Face ID
  // (Face-ID-to-decoy) at the end. A ref so it never lands in a render snapshot.
  const duressPinRef = useRef("");
```

Pull the new provider methods into the existing `useWallet()` destructure (around line 140) — add `setDuressPin, setPanicPin` to it:

```jsx
    isUnlocked, createWallet, importWallet, unlock, hasVault,
    enableBiometricUnlock, unlockWithBiometric,
    exploreMode, enterExplore, leaveExplore, confirmWalletBackup,
    setDuressPin, setPanicPin,
```

- [ ] **Step 3: Read the cohort marker in the existing probe effect**

In the `useEffect` that probes for an existing vault (around line 201-227), inside the `.then(async v => { ... })` callback, after `setVaultExists(v);` add:

```jsx
        setAuthModelState(getAuthModel());
```

- [ ] **Step 4: Add the PIN unlock handler**

After `runUnlock` (around line 291) add:

```jsx
  // Returning PIN user: submit the 6-digit PIN. pinModel:true enables Option A
  // (a non-enrolled PIN opens a deterministic empty decoy — never an error).
  const runPinUnlock = async (pin) => {
    setError(""); setBusy(true);
    try {
      await unlock(pin, { pinModel: true });
      setUnlockPin("");
    } catch (e) {
      // With Option A a valid 6-digit PIN never throws for "wrong PIN"; a throw
      // here is an infra/gate failure. Clear the pad and show a neutral message.
      setUnlockPin("");
      setError(e?.message || "Couldn't unlock. Try again.");
    } finally { setBusy(false); }
  };
```

- [ ] **Step 5: Add the PIN onboarding completion handler**

After `runPinUnlock` add:

```jsx
  // Finish PIN onboarding: create the real wallet under the real PIN, provision a
  // lived-in decoy under the duress PIN (so Face-ID-to-decoy works from day one),
  // optionally set a panic PIN, mark the cohort, seed the device salt, and (if the
  // user opted in) cache the DURESS PIN behind Face ID — NEVER the real PIN.
  const finishPinCreate = async () => {
    setBusy(true);
    try {
      const seed = await createWallet(realPin);          // real wallet, real PIN
      await setDuressPin(duressPinRef.current);          // decoy under duress PIN
      if (panicPin) { try { await setPanicPin(panicPin); } catch { /* optional */ } }
      setAuthModel("pin");                               // select PIN surface + Option A
      getOrCreateDeviceSalt();                           // seed the deterministic-decoy salt
      if (bioEnabled && bioStatus?.available) {
        // Face-ID-to-decoy: cache the DURESS PIN, never the real PIN.
        const ok = await enableBiometricUnlock(duressPinRef.current);
        if (!ok) toast.warning("Face ID wasn't enabled — your PIN is always your way in.");
      }
      setGeneratedSeed(seed);  // hold on the mandatory backup screen
      setShowSeed(false);
    } catch (e) { setError(e?.message || "Failed to create wallet"); }
    finally { setBusy(false); }
  };
```

- [ ] **Step 6: Render the returning-user PIN unlock view**

At the top of the `view === "unlock"` block (around line 375), before the existing password card, add a cohort gate that renders the PIN pad instead when `authModel === "pin"`:

```jsx
  if (view === "unlock" && authModel === "pin") {
    const bioLabel = bioStatus?.label || "Face ID";
    return (
      <EntryShell error={error}>
        <div className="p-4 rounded-xl border border-border bg-card space-y-4">
          {bioReady && !biometricFailed && (
            <>
              <Button className="w-full gap-2 h-12 text-base" disabled={busy} onClick={handleBiometricUnlock}>
                {busy ? <RefreshCw className="h-5 w-5 animate-spin" /> : <ScanFace className="h-5 w-5" />} Unlock with {bioLabel}
              </Button>
              <div className="flex items-center gap-2 py-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] text-muted-foreground">or enter your PIN</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          <div className="flex items-center justify-center gap-2 text-sm font-medium">
            <Lock className="h-4 w-4 text-muted-foreground" /> Enter your PIN
          </div>
          <PinPad value={unlockPin} onChange={setUnlockPin} onComplete={runPinUnlock} disabled={busy} />
        </div>
      </EntryShell>
    );
  }
```

- [ ] **Step 7: Render the PIN onboarding flow (create path)**

Replace the entry into the create flow so a new wallet uses the PIN onboarding. In the `view === "choose"` block, change the "Create a new wallet" button's onClick (around line 461) to start PIN onboarding:

```jsx
            <Button className="w-full gap-2" onClick={() => { setError(""); setBioEnabled(false); setPinStep("real"); setRealPin(""); setRealPinConfirm(""); setDuressPin_(""); setPanicPin_(""); duressPinRef.current = ""; setView("pin-create"); }}>
              <Shield className="h-4 w-4" /> Create a new wallet
            </Button>
```

Then add a new `view === "pin-create"` block (place it just before the `view === "generate"` block, around line 477):

```jsx
  if (view === "pin-create") {
    // Step A: choose real PIN. Step B: confirm. Step C: duress PIN (must differ).
    // Step D: optional panic PIN (explicit skip). Then the seed-backup screen.
    if (!generatedSeed) {
      return (
        <EntryShell error={error}>
          <div className="space-y-5">
            <button type="button" onClick={() => { setError(""); setView("choose"); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>

            {pinStep === "real" && (
              <div className="space-y-3 text-center">
                <p className="text-sm font-medium">Choose a 6-digit PIN</p>
                <p className="text-xs text-muted-foreground">This unlocks your wallet. It encrypts your seed on this device (Argon2id + AES-256-GCM).</p>
                <PinPad value={realPin} onChange={setRealPin} onComplete={(p) => { setError(""); setRealPinConfirm(""); setPinStep("real-confirm"); }} />
              </div>
            )}

            {pinStep === "real-confirm" && (
              <div className="space-y-3 text-center">
                <p className="text-sm font-medium">Confirm your PIN</p>
                <PinPad value={realPinConfirm} onChange={setRealPinConfirm} onComplete={(p) => {
                  if (p !== realPin) { setError("PINs didn't match. Choose again."); setRealPin(""); setRealPinConfirm(""); setPinStep("real"); return; }
                  setError(""); setPinStep("duress");
                }} />
              </div>
            )}

            {pinStep === "duress" && (
              <div className="space-y-3 text-center">
                <p className="text-sm font-medium">Set a duress PIN</p>
                <p className="text-xs text-muted-foreground">If you're ever forced to unlock, enter this instead — it opens a separate everyday wallet, never your real one. Face ID opens this wallet too. Use it day-to-day so it looks lived-in.</p>
                <PinPad value={duressPin} onChange={setDuressPin_} onComplete={(p) => {
                  if (p === realPin) { setError("Your duress PIN must be different from your real PIN."); setDuressPin_(""); return; }
                  setError(""); duressPinRef.current = p; setPinStep("panic");
                }} />
              </div>
            )}

            {pinStep === "panic" && (
              <div className="space-y-3 text-center">
                <p className="text-sm font-medium">Set a panic PIN <span className="text-muted-foreground font-normal">(optional)</span></p>
                <p className="text-xs text-muted-foreground">Entering this at unlock <b>irreversibly wipes</b> this device's wallet copy. Choose something you'd never type by accident, or skip it.</p>
                <PinPad value={panicPin} onChange={setPanicPin_} onComplete={(p) => {
                  if (p === realPin || p === duressPinRef.current) { setError("Your panic PIN must differ from your real and duress PINs."); setPanicPin_(""); return; }
                  setError(""); finishPinCreate();
                }} />
                <button type="button" disabled={busy} onClick={() => { setPanicPin_(""); finishPinCreate(); }} className="text-xs text-muted-foreground hover:text-foreground underline">
                  Skip — don't set a panic PIN
                </button>
              </div>
            )}
          </div>
        </EntryShell>
      );
    }
    // Seed-backup screen (mandatory) + optional Face ID — reuse the same shape as
    // the legacy create flow.
    return (
      <EntryShell error={error}>
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold">Your Seed Phrase (shown once)</p>
              <div className="flex gap-2">
                <button onClick={() => setShowSeed(s => !s)} aria-label={showSeed ? "Hide seed phrase" : "Reveal seed phrase"} className="p-1.5 text-muted-foreground hover:text-foreground">{showSeed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                <button onClick={copySeed} aria-label={copied ? "Seed phrase copied" : "Copy seed phrase"} className="p-1.5 text-muted-foreground hover:text-foreground">{copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}</button>
              </div>
            </div>
            {showSeed ? (
              <div className="grid grid-cols-3 gap-2">
                {generatedSeed.split(" ").map((w, i) => (
                  <div key={i} className="flex items-center gap-1.5 p-2 rounded-lg bg-secondary text-xs">
                    <span className="text-muted-foreground w-4 text-right mono-value">{i + 1}.</span>
                    <span className="mono-value font-semibold">{w}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-20 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Tap the eye icon to reveal your seed phrase</p>
              </div>
            )}
          </div>
          <div className="p-3 rounded-xl bg-secondary/30 text-xs text-muted-foreground flex items-start gap-2">
            <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span>Back up your phrase before continuing — it is never shown again and we cannot recover it for you.</span>
          </div>
          <BiometricOffer status={bioStatus} enabled={bioEnabled} onToggle={setBioEnabled} />
          <Button className="w-full gap-2" disabled={busy} onClick={() => { confirmWalletBackup(); setGeneratedSeed(""); setShowSeed(false); setView("unlock"); }}>
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} I've backed it up — Enter Wallet
          </Button>
        </div>
      </EntryShell>
    );
  }
```

> Note: the Face-ID offer here records intent only; `enableBiometricUnlock(duressPinRef.current)` already ran inside `finishPinCreate`. If you prefer the offer to gate caching, move the `enableBiometricUnlock` call into the backup-screen button handler instead — but it MUST pass `duressPinRef.current`, never `realPin`.

- [ ] **Step 8: Verify in the preview**

Start the dev server and verify the PIN flow end-to-end (clear demo first per CLAUDE.md: visit `/?demo=0`).

1. `preview_start`, then create a new wallet → set real PIN `111111`, confirm, duress `222222`, skip panic, back up seed, enter wallet.
2. Lock (QuickLock) → returning view shows the **PIN pad**, not a password field.
3. Enter `111111` → real wallet opens.
4. Lock → enter `222222` → decoy session opens (an `isDecoy` everyday wallet).
5. Lock → enter a **random** `987654` → an empty wallet opens with **no error** (Option A).
6. Confirm via `preview_console_logs` there are no errors, and `preview_screenshot` the PIN pad + an opened decoy.

Expected: every 6-digit PIN ends in an open wallet; none shows an "Unlock failed" error.

- [ ] **Step 9: Commit**

```bash
git add src/components/WalletEntry.jsx
git commit -m "feat(ui): PIN onboarding + returning PIN unlock + Face-ID-to-decoy wiring"
```

---

## Task 8: Threat-model headers, full regression, and PR

**Files:**
- Modify: `src/components/WalletEntry.jsx` (header comment only)

- [ ] **Step 1: Add the threat-model note to the entry header**

At the top of `src/components/WalletEntry.jsx`, append to the file's header comment block:

```jsx
// ── v1 PIN AUTH (UNAUDITED-PROVISIONAL) ──────────────────────────────────────
// THREAT MODEL: v1 is SOFTWARE key derivation. It resists OBSERVED coercion —
// Face ID and the duress PIN both yield the surrendered decoy; the panic PIN
// wipes; and no 6-digit PIN produces an error-state oracle (Option A) or a timing
// oracle (the 4th constant KDF slot, deniabilityUnlock.js). It does NOT fully
// resist OFFLINE analysis of a SEIZED device: a 6-digit PIN (10^6) over Argon2id
// is exhaustible offline in hours-days, and the PIN path cannot raise Argon2id
// without diverging from the shared stealth-chaff params (a deniability tell) —
// flagged as the #1 audit line-item, not patched here. Hardware binding (the KEK
// layer) is the planned fast-follow that closes the offline gap. KNOWN LIMIT:
// under repeated LIVE probing the configured lived-in decoy stands out from empty
// Option-A fallbacks — accepted for v1 (see the design spec §7).
```

- [ ] **Step 2: Run the full suite**

Run: `npx vitest run`
Expected: PASS — the full suite (previously 536 tests) plus all new tests green.

- [ ] **Step 3: Production build sanity (dead-code/҂compile check)**

Run: `npx vite build`
Expected: build succeeds.

- [ ] **Step 4: Commit and push the branch**

```bash
git add src/components/WalletEntry.jsx
git commit -m "docs(security): v1 PIN auth threat-model note in WalletEntry header"
git push -u origin HEAD
```

- [ ] **Step 5: Open the PR (so the verify CI gate runs on the src/ change)**

```bash
gh pr create --fill --title "feat(auth): v1 6-digit PIN auth UX — KEK-less, Face-ID-to-decoy, Option A (UNAUDITED-PROVISIONAL)" --body "$(cat <<'EOF'
Implements the v1 PIN authentication entry surface per docs/superpowers/specs/2026-06-08-v1-pin-auth-ux-design.md (KEK-less; built on the existing vault.js Argon2id derivation).

## What this ships (UNAUDITED-PROVISIONAL, TESTNET ONLY, new PIN cohort only)
- 6-digit PIN entry surface (`PinPad`), structurally uniform regardless of which slots exist (§5).
- Four-path resolution reusing the existing unlock: real PIN → real wallet; duress PIN → decoy; panic PIN → wipe; **Face ID → decoy** (caches/replays the duress PIN, never the real PIN).
- §7 **Option A**: a non-enrolled 6-digit PIN opens a deterministic empty decoy — no error state.
- The Option-A fallback is a **4th constant Argon2id KDF slot** run unconditionally, so total-miss is timing-indistinguishable from any enrolled hit (review item 1). Test asserts per-slot **execution** on every outcome, not a bare call-count.
- Onboarding provisions real + duress + (optional, explicit-skip) panic PIN.
- `changePassword` guarded to never re-cache the real PIN behind Face ID.

## Audit flags carried (do NOT drop the provisional caveat until reviewed)
- **#1:** the 10^6 PIN keyspace under the shared 192 MiB/t=3 Argon2id is exhaustible offline on a seized device; params can't be raised for the PIN path alone (stealth-chaff param-match constraint). Hardware KEK is the fast-follow.
- Empty-vs-lived-in decoy under repeated live probing (accepted v1 limitation).

## Tests
- `decoyFallback.test.js` (determinism, validity, memory-hard not cheap-hash)
- `deniability-timing.test.js` (PIN-cohort 4-slot unconditional execution)
- `authModel.test.js` (cohort marker + real-PIN re-cache guard)
- Full suite green.
EOF
)"
```

- [ ] **Step 6: Report the PR URL and the verify-gate status to the user.**

---

## Self-Review

**Spec coverage:**
- §1 KEK-less on vault.js → Tasks 2,4,5 (PIN as `password`, no H/KEK/DEK). ✓
- §2 decisions (new cohort marker, onboarding decoy+duress, panic-with-skip, Option A + re-enter, duress-only biometric cache, Argon2id unchanged) → Tasks 3,5,6,7. ✓
- §3 timing core (4th unconditional KDF slot, execution-not-count test) → Task 4. ✓
- §4 components (PinPad, decoyFallback, deniabilityUnlock, WalletProvider, WalletEntry) → Tasks 2,4,5,6,7. ✓
- §5 data flow → Tasks 5,7. ✓
- §6 Argon2id finding (kept at 192 MiB, flagged) → Tasks 2 (comment), 8 (header), PR body. ✓
- §7 threat-model note incl. live-probe limitation → Task 8. ✓
- §9 testing (decoyFallback unit, constant-work execution, Option A integration, Face-ID-to-decoy, regression) → Tasks 2,4 + Task 7 preview + Task 5 suite. ✓
- §10 audit line-items → PR body + headers. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type/name consistency:** `getOrCreateDeviceSalt`, `deriveDeterministicDecoyMnemonic`, `mnemonicFromEntropy`, `getAuthModel`/`setAuthModel`/`isPinModel`/`shouldCacheUnlockSecret`, `resolveDeniabilityUnlock(password, opts)` returning `{panic, duressMnemonic, hiddenMnemonic, fallbackDecoyMnemonic}`, provider `setDuressPin`/`setPanicPin`/`enableBiometricUnlock`/`unlock(pin,{pinModel})` — all consistent across tasks and match the existing codebase signatures. ✓

**Gap note (intentional):** Face-ID-to-decoy and the Option-A *session* (isDecoy, never-persisted) are verified by preview (Task 7) + the wallet-core tests (Task 4), not a React unit test — no component test harness exists (`@testing-library/react` absent). The security-critical *logic* (timing uniformity, determinism, re-cache guard) is fully unit-tested at the wallet-core/lib layer.
