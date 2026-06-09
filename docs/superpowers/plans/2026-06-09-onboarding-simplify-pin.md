# Onboarding Simplify (single PIN → dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse PIN onboarding to *choose PIN → confirm → dashboard*, while silently always-provisioning the duress and panic deniability slots so every PIN device stays structurally identical, and fix the Security-drawer framing so no configured-vs-not state is computed or shown.

**Architecture:** New idempotent `provisionDeniabilityChaff()` writes a chaff `secondary` (duress) and `tertiary` (panic) blob through the *identical* `encryptVault` path used by real personalization (no chaff branch). It is called after wallet creation, on PIN recovery, and on primary PIN unlock (self-heal). The forced duress/panic/seed-backup onboarding steps are removed. `DuressPin.jsx`/`PanicWipe.jsx` drop the `hasDuressPin()`/`hasPanicPin()`-derived "active/not set" indicator and use "set/change" framing.

**Tech Stack:** Vite + React, ethers v6, @noble/@scure, Argon2id via hash-wasm; tests in **vitest** (`npm test` → `vitest run`) with **fake-indexeddb**. No React Testing Library — React components are verified by running the dev server, not unit-tested.

**Spec:** `docs/superpowers/specs/2026-06-09-onboarding-simplify-pin-design.md`

**Status:** UNAUDITED-PROVISIONAL · testnet · PIN cohort. `src/` → PR, verify gate.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/wallet-core/provisionChaff.js` | **Create** | `provisionDeniabilityChaff()` — idempotent chaff into both slots via existing functions |
| `src/wallet-core/__tests__/provisionChaff.test.js` | **Create** | chaff present · structural parity vs personalized · idempotent/no-overwrite |
| `src/lib/pinRecovery.js` | **Modify** | swap `setDuressPin`/`setPanicPin` deps for `provisionDeniabilityChaff` |
| `src/lib/__tests__/pinRecovery.test.js` | **Modify** | update collaborators + assertions |
| `src/components/WalletEntry.jsx` | **Modify** | collapse `pin-create`/`pin-recover` to PIN+confirm; call chaff; remove duress/panic/seed-backup steps + `BiometricOffer` + dead refs |
| `src/lib/WalletProvider.jsx` | **Modify** | unlock-time self-heal call in the primary+pinModel branch |
| `src/pages/DuressPin.jsx` | **Modify** | remove computed active-indicator + Remove button; "set/change" copy |
| `src/pages/PanicWipe.jsx` | **Modify** | remove computed active-indicator + Remove button; "set/change" copy |
| `src/__tests__/security-framing.test.js` | **Create** | source-grep gate: no "active/not set" copy, no `hasDuressPin`/`hasPanicPin` display in Security pages |

---

## Task 1: `provisionDeniabilityChaff()` helper

**Files:**
- Create: `src/wallet-core/provisionChaff.js`
- Test: `src/wallet-core/__tests__/provisionChaff.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/wallet-core/__tests__/provisionChaff.test.js`:

```js
// Tests for provisionDeniabilityChaff(): always-provision both deniability slots
// with chaff that is STRUCTURALLY INDISTINGUISHABLE from a personalized blob, via
// the identical encryptVault path. Runs against real crypto (vault.js) + fake IDB.
import { describe, it, expect, beforeEach } from 'vitest';
import { provisionDeniabilityChaff } from '../provisionChaff.js';
import { hasDuressVault, setDuressVault, tryDuressUnlock } from '../duress.js';
import { hasPanicVault, setPanicVault, tryPanicUnlock } from '../panic.js';
import { generateMnemonic } from '../mnemonic.js';
import { KDF_PARAMS } from '../vault.js';
import { clearVault } from '../evm/vaultStore.js';
import { panicWipeLocal } from '../panic.js';

function unb64(str) {
  const s = atob(str); const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
function getBlob(key) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('veyrnox-vault', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault');
    };
    req.onsuccess = () => {
      const db = req.result;
      const r = db.transaction('vault', 'readonly').objectStore('vault').get(key);
      r.onsuccess = () => { db.close(); resolve(r.result ?? null); };
      r.onerror = () => { db.close(); reject(r.error); };
    };
    req.onerror = () => reject(req.error);
  });
}

describe('provisionDeniabilityChaff', () => {
  beforeEach(async () => {
    try { await clearVault(); } catch { /* noop */ }
    try { await panicWipeLocal(); } catch { /* noop */ }
  });

  it('provisions both slots (secondary + tertiary present)', async () => {
    expect(await hasDuressVault()).toBe(false);
    expect(await hasPanicVault()).toBe(false);
    await provisionDeniabilityChaff();
    expect(await hasDuressVault()).toBe(true);
    expect(await hasPanicVault()).toBe(true);
  });

  it('chaff blobs are STRUCTURALLY indistinguishable from personalized blobs', async () => {
    // Device A: simple onboarding (chaff only).
    await provisionDeniabilityChaff();
    const chaffDuress = await getBlob('secondary');
    const chaffPanic = await getBlob('tertiary');

    // Device B: a user later personalized both slots (real credentials).
    await setDuressVault(generateMnemonic(128), 'real-duress-1357');
    await setPanicVault('burn-everything-0000');
    const realDuress = await getBlob('secondary');
    const realPanic = await getBlob('tertiary');

    for (const [chaff, real] of [[chaffDuress, realDuress], [chaffPanic, realPanic]]) {
      // Same field set — no extra marker on chaff.
      expect(Object.keys(chaff).sort()).toEqual(Object.keys(real).sort());
      // Same KDF params (the timing/forensic-relevant fields), equal to KDF_PARAMS.
      expect(chaff.kdf).toEqual(real.kdf);
      expect(chaff.kdf).toEqual({ name: 'argon2id', ...KDF_PARAMS });
      // Same salt/iv byte-lengths as a real vault (16 / 12).
      expect(unb64(chaff.salt).length).toBe(unb64(real.salt).length);
      expect(unb64(chaff.iv).length).toBe(unb64(real.iv).length);
      expect(unb64(chaff.salt).length).toBe(16);
      expect(unb64(chaff.iv).length).toBe(12);
      // ct is a real AES-GCM ciphertext of a 12-word mnemonic (tag + plaintext).
      // Byte-exact ct length legitimately varies by mnemonic CONTENT for BOTH
      // chaff and personalized blobs, so that variance is itself non-distinguishing;
      // we assert it is a non-empty ciphertext, not an exact length.
      expect(unb64(chaff.ct).length).toBeGreaterThan(16);
    }
  });

  it('is idempotent and NEVER overwrites a personalized blob', async () => {
    // Personalize first, then a later chaff pass must not clobber it.
    await setDuressVault(generateMnemonic(128), 'real-duress-1357');
    await setPanicVault('burn-everything-0000');
    const before = { d: await getBlob('secondary'), p: await getBlob('tertiary') };

    await provisionDeniabilityChaff(); // slots already filled → no-op

    expect(await getBlob('secondary')).toEqual(before.d);
    expect(await getBlob('tertiary')).toEqual(before.p);
    // Personalized credentials still open their slots.
    expect(await tryDuressUnlock('real-duress-1357')).not.toBeNull();
    expect(await tryPanicUnlock('burn-everything-0000')).toBe(true);
  });

  it('backfills only the missing slot', async () => {
    await setDuressVault(generateMnemonic(128), 'real-duress-1357'); // only duress set
    const realDuress = await getBlob('secondary');
    expect(await hasPanicVault()).toBe(false);

    await provisionDeniabilityChaff();

    expect(await getBlob('secondary')).toEqual(realDuress); // untouched
    expect(await hasPanicVault()).toBe(true);               // backfilled
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/wallet-core/__tests__/provisionChaff.test.js`
Expected: FAIL — "Failed to resolve import '../provisionChaff.js'".

- [ ] **Step 3: Write minimal implementation**

Create `src/wallet-core/provisionChaff.js`:

```js
// wallet-core/provisionChaff.js
//
// ALWAYS-PROVISION the deniability slots. PROVISIONAL — ⚠️ FLAGGED FOR AUDIT. ⚠️
//
// Single-mode deniability requires every PIN device to be structurally identical
// regardless of what the user personalized: the storage footprint must NOT reveal
// whether a duress/panic credential was set. (Timing is already constant — see
// deniabilityUnlock.js.) So at PIN creation we silently provision a CHAFF blob in
// both the duress ('secondary') and panic ('tertiary') slots.
//
// The chaff is encrypted under a high-entropy THROWAWAY password generated and
// discarded here. Nobody holds it, so the chaff is genuinely unopenable; a
// non-enrolled PIN never matches it and falls through to the Option-A deterministic
// decoy exactly as it would past a real duress blob. The chaff goes through the
// SAME encryptVault path (same Argon2id at KDF_PARAMS, same salt handling) as a
// real credential — there is NO chaff-specific branch — so it is byte-shaped like
// a personalized blob.
//
// Idempotent and never-overwrite (mirrors stealth.js ensureStealthPool): it writes
// ONLY into an empty slot, so a personalized credential is never clobbered and a
// slot that failed to provision earlier is backfilled on the next call.
//
// TESTNET ONLY. No network/provider/signing — only local encrypt + store.

import { generateMnemonic } from './mnemonic.js';
import { hasDuressVault, setDuressVault } from './duress.js';
import { hasPanicVault, setPanicVault } from './panic.js';

// 32 random bytes → base64. Generated and discarded; never persisted.
function throwawayPassword() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

/**
 * Ensure both deniability slots hold a blob, provisioning chaff into any empty
 * slot. Idempotent; never overwrites an existing (chaff or personalized) blob.
 * strength=128 matches setDuressPin's default so chaff and personalized duress
 * blobs carry the same kind of 12-word-mnemonic plaintext.
 * @returns {Promise<void>}
 */
export async function provisionDeniabilityChaff() {
  if (!(await hasDuressVault())) {
    await setDuressVault(generateMnemonic(128), throwawayPassword());
  }
  if (!(await hasPanicVault())) {
    await setPanicVault(throwawayPassword());
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/wallet-core/__tests__/provisionChaff.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/wallet-core/provisionChaff.js src/wallet-core/__tests__/provisionChaff.test.js
git commit -m "feat(deniability): provisionDeniabilityChaff() — always-provision both slots, idempotent (UNAUDITED-PROVISIONAL)"
```

---

## Task 2: PIN-recovery re-provisions via chaff

`provisionPinRecovery` currently calls `setDuressPin(duressPin)` + `setPanicPin(panicPin)` (the now-removed user steps). It must instead call the injected `provisionDeniabilityChaff` so a recovered device matches a freshly-onboarded one.

**Files:**
- Modify: `src/lib/pinRecovery.js`
- Test: `src/lib/__tests__/pinRecovery.test.js`

- [ ] **Step 1: Update the failing test first**

Open `src/lib/__tests__/pinRecovery.test.js`. Replace the collaborators/assertions so the deps are `{ importWallet, provisionDeniabilityChaff, setAuthModel, getOrCreateDeviceSalt }` and the params are `{ seed, realPin }` (no duressPin/panicPin). Use this as the test body:

```js
import { describe, it, expect, vi } from 'vitest';
import { provisionPinRecovery } from '../pinRecovery.js';

function makeDeps() {
  return {
    importWallet: vi.fn().mockResolvedValue(undefined),
    provisionDeniabilityChaff: vi.fn().mockResolvedValue(undefined),
    setAuthModel: vi.fn(),
    getOrCreateDeviceSalt: vi.fn().mockReturnValue(new Uint8Array(16)),
  };
}
const PARAMS = { seed: 'test test test test test test test test test test test junk', realPin: '123456' };

describe('provisionPinRecovery', () => {
  it('imports under the new PIN, provisions chaff, selects the PIN cohort, seeds salt', async () => {
    const deps = makeDeps();
    await provisionPinRecovery(deps, PARAMS);
    expect(deps.importWallet).toHaveBeenCalledWith(PARAMS.seed, PARAMS.realPin);
    expect(deps.provisionDeniabilityChaff).toHaveBeenCalledTimes(1);
    expect(deps.setAuthModel).toHaveBeenCalledWith('pin'); // never 'password'
    expect(deps.getOrCreateDeviceSalt).toHaveBeenCalledTimes(1);
  });

  it('fails closed: a bad import aborts BEFORE any cohort/slot change', async () => {
    const deps = makeDeps();
    deps.importWallet.mockRejectedValue(new Error('invalid phrase'));
    await expect(provisionPinRecovery(deps, PARAMS)).rejects.toThrow('invalid phrase');
    expect(deps.provisionDeniabilityChaff).not.toHaveBeenCalled();
    expect(deps.setAuthModel).not.toHaveBeenCalled();
    expect(deps.getOrCreateDeviceSalt).not.toHaveBeenCalled();
  });

  it('selects the PIN cohort AFTER provisioning (ordering)', async () => {
    const order = [];
    const deps = makeDeps();
    deps.importWallet.mockImplementation(async () => { order.push('import'); });
    deps.provisionDeniabilityChaff.mockImplementation(async () => { order.push('chaff'); });
    deps.setAuthModel.mockImplementation(() => { order.push('cohort'); });
    await provisionPinRecovery(deps, PARAMS);
    expect(order).toEqual(['import', 'chaff', 'cohort']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/pinRecovery.test.js`
Expected: FAIL — `provisionDeniabilityChaff` is not called by the current implementation.

- [ ] **Step 3: Update `pinRecovery.js`**

Replace the body of `src/lib/pinRecovery.js` from the `export async function` down with:

```js
/**
 * Re-provision a forgotten-PIN seed recovery into the PIN cohort, producing a
 * device indistinguishable from a fresh PIN onboarding.
 *
 * @param {{
 *   importWallet: (mnemonic: string, password: string) => Promise<unknown>,
 *   provisionDeniabilityChaff: () => Promise<void>,
 *   setAuthModel: (model: 'pin'|'password') => void,
 *   getOrCreateDeviceSalt: () => Uint8Array,
 * }} deps
 * @param {{ seed: string, realPin: string }} params
 * @returns {Promise<void>}
 */
export async function provisionPinRecovery(deps, params) {
  const { importWallet, provisionDeniabilityChaff, setAuthModel, getOrCreateDeviceSalt } = deps;
  const { seed, realPin } = params;

  // 1. Import the recovered seed under the new real PIN. A throw here (invalid
  //    phrase, storage failure) aborts BEFORE any cohort/slot change — fail closed.
  await importWallet(seed, realPin);

  // 2. Silently provision both deniability slots with chaff, exactly as fresh PIN
  //    onboarding does, so the recovered device's storage footprint is identical.
  await provisionDeniabilityChaff();

  // 3. Select the PIN cohort — the whole point of §4. Never 'password'.
  setAuthModel('pin');

  // 4. Seed the deterministic-decoy salt so Option A is live (no error oracle).
  getOrCreateDeviceSalt();
}
```

Also update the module header comment block (lines ~14-22 and ~62-70): replace the `setDuressPin`/`setPanicPin` steps with the single `provisionDeniabilityChaff()` step. Keep the FAIL-CLOSED and "never 'password'" notes verbatim.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/pinRecovery.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pinRecovery.js src/lib/__tests__/pinRecovery.test.js
git commit -m "refactor(auth): PIN recovery provisions chaff (not user duress/panic) to match simplified onboarding"
```

---

## Task 3: Security-framing source-grep gate (write the failing guard first)

This is the must-have framing test: it asserts the Security pages contain no "active/not configured" copy and **do not compute a configured-vs-not state** from slot presence. It reads the source as text (no RTL needed).

**Files:**
- Create: `src/__tests__/security-framing.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/security-framing.test.js`:

```js
// Framing guard (deniability): the Security duress/panic pages must NOT surface a
// configured-vs-not state. With slots always-provisioned, "is it set?" must have no
// observable answer in the UI — neither in copy NOR computed from blob presence.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, '..', rel), 'utf8');

const PAGES = ['pages/DuressPin.jsx', 'pages/PanicWipe.jsx'];

// Copy that frames the slot as a toggle / reveals configured state.
const FORBIDDEN_COPY = [
  'is active', 'No Duress PIN set', 'No panic/wipe PIN set',
  'Enable duress', 'Enable Duress', 'not configured', 'Disabled', 'Remove PIN',
];
// Logic that COMPUTES configured-vs-not from the slot for display.
const FORBIDDEN_LOGIC = ['hasDuressPin(', 'hasPanicPin('];

describe('Security framing — no configured-state oracle', () => {
  for (const page of PAGES) {
    it(`${page} has no configured-vs-not copy`, () => {
      const src = read(page);
      for (const s of FORBIDDEN_COPY) expect(src, `forbidden copy: "${s}"`).not.toContain(s);
    });
    it(`${page} does not compute configured state from slot presence`, () => {
      const src = read(page);
      for (const s of FORBIDDEN_LOGIC) expect(src, `forbidden logic: "${s}"`).not.toContain(s);
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/security-framing.test.js`
Expected: FAIL — current `DuressPin.jsx`/`PanicWipe.jsx` contain "is active", "No … set", "Remove PIN", and `hasDuressPin(`/`hasPanicPin(`.

(Leave it failing; Tasks 4 and 5 make it pass.)

---

## Task 4: `DuressPin.jsx` — remove the configured-state oracle, "set/change" framing

**Files:**
- Modify: `src/pages/DuressPin.jsx`

- [ ] **Step 1: Drop the `duressActive` state + its refresh read**

In `src/pages/DuressPin.jsx`:
- Remove `const [duressActive, setDuressActive] = useState(false);` (line ~95).
- In `refresh` (lines ~113-116), remove the `setDuressActive(await hasDuressPin());` line. Keep the `hasVault()` read for `vaultExists` (demo gating). Result:

```js
  const refresh = useCallback(async () => {
    try { setVaultExists(await hasVault()); } catch { /* noop */ }
  }, [hasVault]);
```

- Remove `hasDuressPin` from the `useWallet()` destructure (line ~90). Keep `setDuressPin`, `removeDuressPin` (still used by the demo card).

- [ ] **Step 2: Replace the setup-card header (the oracle) with static framing**

Replace the header block (lines ~277-291, the `flex items-center justify-between` containing the active-indicator + Remove button) with:

```jsx
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-medium">Set a custom duress PIN</span>
        </div>
```

This removes both the `duressActive`-derived "Duress PIN is active / No Duress PIN set" text **and** the `duressActive`-gated "Remove PIN" button. (Personalizing always overwrites the always-present slot; there is no "remove" in the always-provisioned model — see spec §8.)

- [ ] **Step 3: Make the submit button label static**

Replace the submit button (line ~326-328) with:

```jsx
          <Button className="w-full" disabled={!pin || !confirmPin || saving} onClick={handleSave}>
            {saving ? "Saving…" : "Set / Change duress PIN"}
          </Button>
```

- [ ] **Step 4: Verify the page still renders**

Ensure a dev server is running (preview_start if needed), navigate to the Duress page, confirm it renders with the new header/button and no "active/Remove" controls, and check the console for errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/DuressPin.jsx
git commit -m "fix(deniability): DuressPin uses set/change framing, no computed configured-state"
```

---

## Task 5: `PanicWipe.jsx` — remove the configured-state oracle, "set/change" framing

**Files:**
- Modify: `src/pages/PanicWipe.jsx`

- [ ] **Step 1: Drop the `panicActive` state + its refresh read**

In `src/pages/PanicWipe.jsx`:
- Remove `const [panicActive, setPanicActive] = useState(false);` (line ~102).
- In `refresh` (lines ~123-126), remove `setPanicActive(await hasPanicPin());`. Keep `hasVault()`:

```js
  const refresh = useCallback(async () => {
    try { setVaultExists(await hasVault()); } catch { /* noop */ }
  }, [hasVault]);
```

- Remove `hasPanicPin` from the `useWallet()` destructure (line ~96-97). Keep `setPanicPin`, `removePanicPin` (used by demo) and everything else.

- [ ] **Step 2: Replace the setup-card header (the oracle) with static framing**

Replace the header block (lines ~274-288) with:

```jsx
        <div className="flex items-center gap-2 mb-4">
          <Bomb className="h-5 w-5 text-destructive" />
          <span className="font-medium">Set a panic/wipe PIN</span>
        </div>
```

(Removes the `panicActive`-derived "Panic/wipe PIN is active / No panic/wipe PIN set" text and the `panicActive`-gated "Remove PIN" button.)

- [ ] **Step 3: Make the submit button label static**

Replace the submit button (line ~331-333) with:

```jsx
          <Button className="w-full" disabled={!pin || !confirmPin || saving} onClick={handleSave}>
            {saving ? "Saving…" : "Set / Change panic/wipe PIN"}
          </Button>
```

- [ ] **Step 4: Run the framing gate — now it passes**

Run: `npm test -- src/__tests__/security-framing.test.js`
Expected: PASS (4 tests). If any FORBIDDEN string remains, fix the offending line in the page.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PanicWipe.jsx src/__tests__/security-framing.test.js
git commit -m "fix(deniability): PanicWipe uses set/change framing, no computed configured-state; add framing grep-gate"
```

---

## Task 6: Collapse onboarding to PIN + confirm, call chaff (WalletEntry)

No RTL harness exists, so this task is verified by running the app (verify gate). Edit carefully; each step is one focused change.

**Files:**
- Modify: `src/components/WalletEntry.jsx`

- [ ] **Step 1: Import the chaff helper**

Add to the wallet-core imports (near `import { getOrCreateDeviceSalt } from "@/wallet-core/decoyFallback";`):

```js
import { provisionDeniabilityChaff } from "@/wallet-core/provisionChaff";
```

- [ ] **Step 2: Rewrite `finishPinCreate` to provision chaff and enter the app**

Replace the whole `finishPinCreate` function (lines ~360-373) with:

```js
  // Finish PIN onboarding: create the real wallet under the real PIN, silently
  // always-provision both deniability slots with chaff (so every PIN device is
  // structurally identical), mark the cohort + seed the decoy salt, then enter the
  // app. No duress/panic steps, no seed-backup screen — the wallet is created
  // backedUp:false and the dashboard's existing unbacked-wallet nudge covers backup.
  const finishPinCreate = async () => {
    setBusy(true);
    try {
      await createWallet(realPin);            // real wallet, real PIN
      await provisionDeniabilityChaff();      // chaff into 'secondary' + 'tertiary'
      setAuthModel("pin");                     // select PIN surface + Option A
      getOrCreateDeviceSalt();                 // seed the deterministic-decoy salt
      setRealPin(""); setRealPinConfirm("");   // wipe transient PINs
      // createWallet already unlocked the vault; with no seed-backup hold the app
      // renders immediately.
    } catch (e) { setError(e?.message || "Failed to create wallet"); }
    finally { setBusy(false); }
  };
```

- [ ] **Step 3: Delete `finishPinBackup` (no backup screen)**

Remove the entire `finishPinBackup` function (lines ~379-393). It is no longer referenced after Step 5.

- [ ] **Step 4: Rewrite `finishPinRecover` to pass the new deps**

Replace `finishPinRecover` (lines ~403-417) with:

```js
  // PIN recovery (§4): restore the seed, RE-PROVISION into the PIN cohort so the
  // post-recovery surface is the identical PIN pad. Mirrors finishPinCreate.
  const finishPinRecover = async () => {
    setBusy(true);
    try {
      await provisionPinRecovery(
        { importWallet, provisionDeniabilityChaff, setAuthModel, getOrCreateDeviceSalt },
        { seed: recoverySeed, realPin },
      );
      setAuthModelState("pin");
      setRecoverySeed(""); setRealPin(""); setRealPinConfirm("");
      setRecovering(false);
    } catch (e) {
      setError(e?.message || "Couldn't restore from that seed phrase");
    } finally { setBusy(false); }
  };
```

- [ ] **Step 5: Collapse the `pin-create` view to real → real-confirm**

In the `view === "pin-create"` block, change the `real-confirm` step's `onComplete` so confirming the PIN finishes onboarding directly (instead of advancing to `duress`):

```jsx
            {pinStep === "real-confirm" && (
              <div className="space-y-3 text-center">
                <p className="text-sm font-medium">Confirm your PIN</p>
                <PinPad value={realPinConfirm} onChange={setRealPinConfirm} onComplete={(p) => {
                  if (p !== realPin) { setError("PINs didn't match. Choose again."); setRealPin(""); setRealPinConfirm(""); setPinStep("real"); return; }
                  setError(""); finishPinCreate();
                }} />
              </div>
            )}
```

Then **delete** the `pinStep === "duress"` and `pinStep === "panic"` blocks within `pin-create` (lines ~683-706) and the entire seed-backup `return (...)` branch guarded by `generatedSeed` for the pin-create view (the `if (!generatedSeed) { ... } return (<EntryShell>…seed grid…</EntryShell>)` — keep only the `!generatedSeed` form, and since the flow never sets `generatedSeed` for PIN create now, remove the `if (!generatedSeed)` wrapper so the view is just the PIN steps).

- [ ] **Step 6: Collapse the `pin-recover` view to seed → real → real-confirm**

In the `view === "pin-recover"` block, change the `real-confirm` `onComplete` to finish recovery directly, and delete the `duress` and `panic` blocks (lines ~802-825):

```jsx
          {pinStep === "real-confirm" && (
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium">Confirm your new PIN</p>
              <PinPad value={realPinConfirm} onChange={setRealPinConfirm} onComplete={(p) => {
                if (p !== realPin) { setError("PINs didn't match. Choose again."); setRealPin(""); setRealPinConfirm(""); setPinStep("real"); return; }
                setError(""); finishPinRecover();
              }} />
            </div>
          )}
```

- [ ] **Step 7: Remove now-dead state/refs**

Delete declarations that are no longer referenced after Steps 2-6 (confirm each with a search before deleting):
- `duressPin`, `setDuressPin_` state and `duressPinRef` (lines ~223, ~228).
- `panicPin`, `setPanicPin_` state (line ~224).
- `setDuressPin`, `setPanicPin` from the `useWallet()` destructure (line ~166) **only if** no longer referenced in WalletEntry.
- The `BiometricOffer` component usages on the PIN path and `bioEnabled` wiring tied only to the removed PIN backup screen. Keep `BiometricOffer`/`bioEnabled` if still used by the password-cohort `generate`/`import` views (it is — leave those untouched).

Run a search for each identifier before removing to avoid deleting something the password/import paths still use:

Run: `git grep -n "duressPinRef\|setDuressPin_\|setPanicPin_" src/components/WalletEntry.jsx`
Expected after edits: no matches.

- [ ] **Step 8: Lint + verify the build compiles**

Run: `npm run lint -- src/components/WalletEntry.jsx`
Expected: no errors (in particular no "unused variable" for the removed state).

- [ ] **Step 9: Verify the flow end-to-end in the browser**

Ensure the dev server is running. In the preview browser: clear storage (`indexedDB.deleteDatabase('veyrnox-vault'); localStorage.clear()`), reload `/?demo=0`, then **Create or import a wallet → Create a new wallet**. Confirm the sequence is exactly **Choose a 6-digit PIN → Confirm your PIN → Dashboard** with no duress/panic/seed-backup/biometric screens, and the dashboard shows the wallet (not explore mode). Check console for errors.

- [ ] **Step 10: Commit**

```bash
git add src/components/WalletEntry.jsx
git commit -m "feat(auth): collapse PIN onboarding to PIN+confirm; provision deniability chaff silently (UNAUDITED-PROVISIONAL)"
```

---

## Task 7: Unlock-time self-heal (WalletProvider)

Backfill chaff for any PIN-cohort device that somehow lacks it, on a real (primary) unlock. Idempotent + never-overwrite makes this safe; it must run only for the PIN cohort and only on the primary branch (not decoy/hidden/Option-A sessions).

**Files:**
- Modify: `src/lib/WalletProvider.jsx`

- [ ] **Step 1: Import the helper**

Add near the other wallet-core imports (e.g. beside `import { getOrCreateDeviceSalt } from '@/wallet-core/decoyFallback';`):

```js
import { provisionDeniabilityChaff } from '@/wallet-core/provisionChaff';
```

- [ ] **Step 2: Call it in the primary branch of `unlock`**

In `unlock`, inside the `if (isPrimary) { ... }` block (after `refreshPortfoliosState();`, around line ~969), add the PIN-cohort self-heal. `pinModel` is already in scope from `opts.pinModel`:

```js
      // SELF-HEAL: a PIN-cohort device must always carry both deniability slots
      // (storage-footprint parity). If an earlier provision failed, backfill chaff
      // now. Idempotent + never-overwrite, so this never clobbers a personalized
      // credential and never runs for the password cohort. Best-effort (mirrors
      // ensureStealthPool): a storage hiccup must not block unlock.
      if (pinModel) void provisionDeniabilityChaff().catch(() => {});
```

- [ ] **Step 3: Verify the build compiles + suite green**

Run: `npm test`
Expected: PASS (full suite, including Tasks 1-3 additions). Note: this self-heal has no dedicated unit test (it lives inside the React `unlock` callback); it is covered structurally by Task 1 (idempotent/never-overwrite) and verified behaviorally in Task 8.

- [ ] **Step 4: Commit**

```bash
git add src/lib/WalletProvider.jsx
git commit -m "feat(deniability): self-heal chaff provisioning on primary PIN unlock (idempotent)"
```

---

## Task 8: Full regression + on-device-style verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full suite + lint**

Run: `npm test`
Expected: PASS, no regressions (returning-user login, password cohort, import path untouched).

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 2: Verify storage parity in the browser (the load-bearing property)**

With the dev server running, in the preview browser console after completing a **simple** onboarding (PIN + confirm), dump the vault store and confirm all four keys exist:

```js
await new Promise(r => { const q = indexedDB.open('veyrnox-vault',1); q.onsuccess = () => { const db = q.result; const ks = db.transaction('vault','readonly').objectStore('vault').getAllKeys(); ks.onsuccess = () => { console.log('vault keys:', ks.result); db.close(); r(); }; }; });
// Expect: ['primary','secondary','tertiary', 'vault:0', ...] — secondary + tertiary present from chaff.
```

- [ ] **Step 3: Verify Option-A fall-through still works**

Lock, then unlock with a *non-real* 6-digit PIN. Confirm it opens an empty decoy session (no error), identical to behavior past a personalized duress blob.

- [ ] **Step 4: Verify Security framing in the browser**

Open the Duress and Panic pages. Confirm headers read "Set a custom duress PIN" / "Set a panic/wipe PIN", there is no "active/not set" indicator and no "Remove PIN" button, and setting a PIN then re-opening the page shows no "configured" state.

- [ ] **Step 5: Capture proof**

Screenshot the collapsed onboarding (PIN → confirm → dashboard) and the reframed Security pages for the PR.

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

```bash
git add -A && git commit -m "test: verification pass for onboarding-simplify (storage parity, Option-A, framing)"
```

---

## Notes for the PR

- Title: `feat(auth): simplify PIN onboarding to PIN+confirm; always-provision deniability slots (UNAUDITED-PROVISIONAL)`
- Call out for review (load-bearing): the **chaff structural-parity test** in `src/wallet-core/__tests__/provisionChaff.test.js` — it must assert shape/KDF-param parity vs a personalized blob, not mere presence.
- Flag for audit: chaff construction (throwaway-password blobs as storage parity) + the structural-parity guarantee, alongside `duress.js`/`panic.js`/`deniabilityUnlock.js`.
- Out of scope (deferred specs): dismissable nudge system + silence-after-N generic counter, harden-nudge re-surface-on-value, full Face-ID-to-decoy wiring in DuressPin.
