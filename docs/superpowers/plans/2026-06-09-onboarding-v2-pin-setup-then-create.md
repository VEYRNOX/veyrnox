# Onboarding v2 (PIN-setup → empty dashboard → atomic create) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rework the onboarding spine so PIN setup persists credential **markers only** (no wallet) → empty dashboard → a **separate, atomic, fail-closed** Create-Wallet/Import action writes the real wallet + both deniability chaff slots. Fix Defect A (Argon2 192 MiB sequential-allocation) since Phase 2 runs from the mounted app shell. Remove the now-unneeded unlock self-heal.

**Architecture:** Phase 1 sets `authModel='pin'` + device salt and holds the PIN as a transient in-memory `pendingPin` in `WalletProvider`; it never writes `primary`/`secondary`/`tertiary`. Phase 2 (triggered from the empty dashboard) consumes `pendingPin` via the existing `provisionPinWallet`/`discardIncompleteWallet` machinery. `pendingPin` is cleared on every exit. Explore-first is preserved.

**Tech Stack:** Vite + React, ethers v6, @noble/@scure, Argon2id via hash-wasm; vitest + fake-indexeddb. No React Testing Library — components verified by running the app (Claude Preview) + IndexedDB inspection.

**Spec:** `docs/superpowers/specs/2026-06-09-onboarding-pin-setup-then-create-design.md` (v2)

**Status:** UNAUDITED-PROVISIONAL · testnet · PIN cohort. `src/` → PR, verify gate.

**Survives unchanged (do NOT rebuild):** T1 chaff + parity/unopenable tests (`19d588b`/`0f93268`); T2 recovery chaff + fail-closed (`e05053e`/`7a5582e`); T3–T5 framing + grep gate (`797b349`/`80cc20e`); `provisionPinWallet`/`provisionPinRecovery`/`discardIncompleteWallet`/clear-helpers (`7a5582e`/`ca91cd1`).

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/lib/WalletProvider.jsx` | Modify | add transient `pendingPin` + `setupPin`/`createWalletFromPendingPin`/`importWalletForPendingPin`/`clearPendingPin`; clear `pendingPin` in `lock()`; **remove the unlock self-heal**; expose new API |
| `src/components/WalletEntry.jsx` | Modify | Phase-1 PIN setup (markers + pendingPin + explore); collapse pre-PIN choose; Phase-2 create/import from the empty dashboard; clear pendingPin on abandonment; remove wallet-creating `finishPinCreate` |
| `src/wallet-core/vault.js` | Modify | Defect-A: manage Argon2 allocation so peak is 192 MiB once (yield-between-KDFs; Web-Worker fallback only if needed) |

---

## Task 1: WalletProvider — pendingPin lifecycle + Phase-1/Phase-2 methods + remove self-heal

**Files:** Modify `src/lib/WalletProvider.jsx`

- [ ] **Step 1: Remove the unlock self-heal (Hold #4 — no orphaned reference)**

Find in the `unlock` callback's `isPrimary` branch the line added by commit `ac6643f`:
```js
      if (opts.pinModel === true) void provisionDeniabilityChaff().catch(() => {});
```
Delete it and its preceding `// SELF-HEAL:` comment block. Then check whether `provisionDeniabilityChaff` is still referenced anywhere in `WalletProvider.jsx`:

Run: `git grep -n "provisionDeniabilityChaff" src/lib/WalletProvider.jsx`
If the ONLY remaining hit is the `import` line, remove that import too (it will be unused — `provisionDeniabilityChaff` is called from WalletEntry, not WalletProvider). If other references exist, keep the import.

- [ ] **Step 2: Add the transient `pendingPin` (in-memory, never persisted)**

Near the other refs/state at the top of the provider component, add:
```js
  // PHASE-1 transient: the PIN chosen during setup, held in memory ONLY until
  // Phase-2 wallet creation consumes it. NEVER persisted (markers-only model).
  // A ref (not state) so it never lands in a render snapshot; cleared on every
  // exit (success, failure, lock/background, abandonment).
  const pendingPinRef = useRef(null);
```
(`useRef` is already imported in this file; confirm.)

- [ ] **Step 3: Clear `pendingPin` inside `lock()` (Hold #1 — background/lock exit)**

In the existing `lock` callback, add `pendingPinRef.current = null;` alongside the other in-memory secret clears. (The app auto-locks on background/visibilitychange, so this covers the "app backgrounded" abandonment path.)

- [ ] **Step 4: Add Phase-1 `setupPin`**

Add a callback:
```js
  // PHASE 1: persist credential MARKERS ONLY and hold the PIN in memory. Writes NO
  // primary/secondary/tertiary and no PIN verifier. Enters explore so the empty
  // dashboard renders; Phase-2 (createWalletFromPendingPin / importWalletForPendingPin)
  // consumes pendingPin. authModel/salt are non-secret markers (already used).
  const setupPin = useCallback((pin) => {
    setAuthModel('pin');
    getOrCreateDeviceSalt();
    pendingPinRef.current = pin;
    setExploreMode(true);
  }, []);
```
(`setAuthModel` from `@/lib/authModel` and `getOrCreateDeviceSalt` from `@/wallet-core/decoyFallback` — confirm both are imported; they are used elsewhere in this file. `setExploreMode` is the existing explore state setter used by `enterExplore`.)

- [ ] **Step 5: Add Phase-2 `createWalletFromPendingPin` (atomic, fail-closed)**

```js
  // PHASE 2 (create): atomically create the real wallet + both chaff slots under the
  // in-memory pendingPin, fail-closed (provisionPinWallet tears down on chaff failure).
  // Throws on no pendingPin (caller must have completed Phase 1) or on provisioning
  // failure (after rollback). Clears pendingPin only on success.
  const createWalletFromPendingPin = useCallback(async () => {
    const pin = pendingPinRef.current;
    if (!pin) throw new Error('No PIN set; complete PIN setup first');
    await provisionPinWallet(
      { createWallet, provisionDeniabilityChaff, setAuthModel, getOrCreateDeviceSalt, discardIncompleteWallet },
      { pin },
    );
    pendingPinRef.current = null; // consumed; createWallet already unlocked → wallet dashboard
  }, [createWallet, discardIncompleteWallet]);
```
Add `import { provisionPinWallet } from '@/lib/pinOnboarding';` (and ensure `provisionDeniabilityChaff` is imported from `@/wallet-core/provisionChaff` — if Step 1 removed it, re-add it here since Phase 2 needs it). `discardIncompleteWallet` and `createWallet` are existing callbacks in this file.

- [ ] **Step 6: Add Phase-2 `importWalletForPendingPin` (atomic, fail-closed, stays PIN cohort)**

```js
  // PHASE 2 (import): import a seed under the in-memory pendingPin and provision both
  // chaff slots in the SAME fail-closed block (mirrors provisionPinRecovery). Device
  // stays PIN cohort (never setAuthModel('password')). Clears pendingPin on success.
  const importWalletForPendingPin = useCallback(async (mnemonic) => {
    const pin = pendingPinRef.current;
    if (!pin) throw new Error('No PIN set; complete PIN setup first');
    await provisionPinRecovery(
      { importWallet, provisionDeniabilityChaff, setAuthModel, getOrCreateDeviceSalt, discardIncompleteWallet },
      { seed: mnemonic, realPin: pin },
    );
    pendingPinRef.current = null;
  }, [importWallet, discardIncompleteWallet]);
```
Add `import { provisionPinRecovery } from '@/lib/pinRecovery';` if not already imported in this file. `importWallet` is an existing callback.

- [ ] **Step 7: Add `clearPendingPin` (explicit abandonment from the UI)**

```js
  // Clear the Phase-1 PIN if the user abandons the flow before creating a wallet
  // (navigate away / cancel). Called by WalletEntry on exit paths (Hold #1).
  const clearPendingPin = useCallback(() => { pendingPinRef.current = null; }, []);
```

- [ ] **Step 8: Expose the new API + a `pendingPin` presence flag**

In the context `value` object add: `setupPin, createWalletFromPendingPin, importWalletForPendingPin, clearPendingPin`, and a boolean the UI can branch on without reading the secret:
```js
    hasPendingPin: pendingPinRef.current != null,
```
(Note: a ref change doesn't re-render; `hasPendingPin` is read at render time after `setupPin` calls `setExploreMode(true)` which DOES re-render, so the value is fresh when the empty dashboard renders. This is sufficient for the CTA branch.)

- [ ] **Step 9: Lint**

Run: `npm run lint`
Expected: clean (no unused `provisionDeniabilityChaff` import if removed in Step 1; no undefined refs).

- [ ] **Step 10: Commit**

```bash
git add src/lib/WalletProvider.jsx
git commit -m "feat(auth): pendingPin lifecycle + Phase-1/Phase-2 onboarding methods; remove unlock self-heal (UNAUDITED-PROVISIONAL)"
```

---

## Task 2: WalletEntry — rebuild the onboarding spine (Phase 1 / Phase 2)

**Files:** Modify `src/components/WalletEntry.jsx`

No React unit harness — verify by lint + browser (controller).

- [ ] **Step 1: Pull the new API from `useWallet()`**

Add to the destructure: `setupPin, createWalletFromPendingPin, importWalletForPendingPin, clearPendingPin, hasPendingPin`. Remove `provisionDeniabilityChaff`/`provisionPinWallet`/`provisionPinRecovery` direct imports from WalletEntry if they are now only used via the provider (Phase-2 logic moved into WalletProvider). Keep `createWallet`/`importWallet` only if still used by the password cohort (they are — `handleGenerate`/`handleImport`).

- [ ] **Step 2: Phase-1 — `pin-create` confirm calls `setupPin` (no wallet)**

Replace `finishPinCreate` (the function that currently calls `provisionPinWallet`) with:
```js
  // PHASE 1: PIN setup writes credential markers only and enters the empty dashboard.
  // No wallet is created here (that is Phase 2, a separate dashboard action).
  const finishPinSetup = () => {
    setupPin(realPin);            // authModel + salt + pendingPin + explore
    setRealPin(""); setRealPinConfirm("");
    setError(""); setPinStep("real"); setView("choose"); // reset; explore now renders the empty dashboard
  };
```
Update the `pin-create` view's `real-confirm` PinPad `onComplete` to call `finishPinSetup()` instead of the old wallet-creating finisher:
```jsx
                <PinPad value={realPinConfirm} onChange={setRealPinConfirm} onComplete={(p) => {
                  if (p !== realPin) { setError("PINs didn't match. Choose again."); setRealPin(""); setRealPinConfirm(""); setPinStep("real"); return; }
                  finishPinSetup();
                }} />
```
Delete the old `provisioning` gate render block and the `provisioning` state IF they were only used by the removed wallet-creating finishPinCreate (Phase 2 now owns gating — see Step 4). (Search `provisioning` before deleting.)

- [ ] **Step 3: Pre-PIN entry — "Create or import" routes to PIN-create (Phase 1)**

The explore CTA and the first-run "choose" path must route to `pin-create` for a device with no PIN yet. Ensure the explore "Create or import a wallet" button (`ExploreShell onCreate`) and any first-run create CTA call:
```js
    onCreate={() => { leaveExplore(); setError(""); setRealPin(""); setRealPinConfirm(""); setPinStep("real"); setView("pin-create"); }}
```
(The old "choose: Create new / Import" screen is no longer the pre-PIN step. If a `view==="choose"` screen remains as an intermediate, repoint its single CTA to `pin-create`; the create-vs-import choice now lives on the post-PIN empty dashboard — Step 4.)

- [ ] **Step 4: Phase-2 — empty-dashboard Create/Import affordances (gated, fail-closed)**

When `hasPendingPin` is true and no vault exists, the empty dashboard (explore Outlet) must offer **Create Wallet** and **Import**. Render these via the explore surface. Add handlers in WalletEntry:
```js
  // PHASE 2: create. Atomic + fail-closed (provider tears down on failure). Hold the
  // empty dashboard (provisioning screen) until primary+both chaff are committed.
  const [provisioning, setProvisioning] = useState(false);
  const doCreateWallet = async () => {
    setBusy(true); setProvisioning(true); setError("");
    try {
      await createWalletFromPendingPin();
      setProvisioning(false); // success → vault unlocked → wallet dashboard renders
    } catch (e) {
      // FAIL CLOSED + Hold #1: rollback already happened in the provider; clear the
      // PIN so nothing lingers. User re-picks PIN from the explore CTA to retry.
      clearPendingPin();
      setProvisioning(false);
      setError("Wallet setup couldn't finish securely, so nothing was saved. Please set your PIN and try again.");
    } finally { setBusy(false); }
  };
  const doImportWallet = async (mnemonic) => {
    setBusy(true); setProvisioning(true); setError("");
    try {
      await importWalletForPendingPin(mnemonic.trim());
      setProvisioning(false);
    } catch (e) {
      clearPendingPin();
      setProvisioning(false);
      setError(e?.message || "Couldn't import that seed phrase. Please set your PIN and try again.");
    } finally { setBusy(false); }
  };
```
Add the provisioning gate render (BEFORE `if (isUnlocked && !generatedSeed) return <Outlet/>`):
```jsx
  if (provisioning) {
    return (
      <EntryShell error={error}>
        <div className="p-6 rounded-xl border border-border bg-card text-center space-y-3">
          <RefreshCw className="h-6 w-6 text-primary mx-auto animate-spin" />
          <p className="text-sm font-medium">Setting up your wallet…</p>
          <p className="text-xs text-muted-foreground">Securing your wallet on this device. This takes a moment.</p>
        </div>
      </EntryShell>
    );
  }
```
Wire the empty-dashboard CTAs: in the explore render path (when `hasPendingPin`), present Create Wallet → `doCreateWallet()` and Import → an import-seed sub-view whose submit calls `doImportWallet(phrase)`. (Reuse the existing import textarea UI; on submit call `doImportWallet` instead of the legacy `handleImport`.) When `!hasPendingPin`, the explore CTA routes to `pin-create` (Step 3).

- [ ] **Step 5: Clear `pendingPin` on abandonment (Hold #1)**

Any control that leaves the onboarding flow without creating a wallet must call `clearPendingPin()`. Specifically: the `pin-create` "Back" button, and any "← Keep exploring" / cancel that returns to view-only without a wallet. Add `clearPendingPin()` to those handlers. (Background/lock is already covered by `lock()` in Task 1 Step 3.)

- [ ] **Step 6: Remove dead code**

Remove the old wallet-creating `finishPinCreate`, `finishPinBackup` (already gone), and any now-unused imports (`provisionPinWallet`/`provisionPinRecovery`/`provisionDeniabilityChaff` if Phase-2 logic fully moved to the provider). Keep `generatedSeed`/`BiometricOffer`/password-cohort views intact.

Run: `git grep -n "finishPinCreate\|provisionPinWallet\|provisionDeniabilityChaff" src/components/WalletEntry.jsx`
Expected: no stale references (Phase-2 goes through the provider methods).

- [ ] **Step 7: Lint**

Run: `npm run lint` — expect clean.

- [ ] **Step 8: Browser smoke (controller)**

Controller starts the worktree preview and verifies the spine renders: explore → "Create or import" → PIN-create → confirm → empty dashboard with Create Wallet/Import. (Full storage verification is Task 4.)

- [ ] **Step 9: Commit**

```bash
git add src/components/WalletEntry.jsx
git commit -m "feat(auth): v2 onboarding spine — PIN setup (markers) -> empty dashboard -> separate atomic create/import (UNAUDITED-PROVISIONAL)"
```

---

## Task 3: Defect A — manage Argon2 192 MiB allocation (vault.js)

**Files:** Modify `src/wallet-core/vault.js`

Phase 2 runs 3 sequential 192 MiB KDFs from the mounted app shell. Goal: peak 192 MiB once. **Never change `KDF_PARAMS`** (breaks T1 parity / reopens the oracle).

- [ ] **Step 1: Diagnose (controller, browser) — does yield-between-KDFs suffice?**

In the worktree preview, from the empty dashboard (app shell mounted), measure: do 3 sequential `argon2id(192 MiB)` calls succeed if each `deriveKey` yields to a macrotask after completion (giving GC a chance to reclaim the prior WASM instance before the next allocates)? Evidence step — try a minimal `await new Promise(r => setTimeout(r, 0))` before/after the Argon2 call and see if the dashboard-mounted 3-KDF sequence stops throwing `RangeError`.

- [ ] **Step 2a: If yield suffices — minimal fix**

In `deriveKey`, after the `argon2id(...)` resolves and `raw` is consumed into the WebCrypto key, yield once to let the previous WASM instance become collectable before the next derivation:
```js
async function deriveKey(password, salt, params = KDF_PARAMS) {
  const { parallelism, iterations, memorySize, hashLength } = params;
  const raw = await argon2id({ password: enc.encode(password.normalize('NFKC')), salt, parallelism, iterations, memorySize, hashLength, outputType: 'binary' });
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  zero(raw);
  // Defect-A: yield so the hash-wasm 192 MiB instance is GC-eligible before the next
  // sequential derivation allocates its own 192 MiB (peak one-at-a-time, not concurrent).
  await new Promise((r) => setTimeout(r, 0));
  return key;
}
```

- [ ] **Step 2b: If yield is insufficient — Web-Worker-per-KDF (Hold #5)**

Move ONLY the `argon2id` call into a short-lived Web Worker that is `terminate()`d after returning the derived bytes, so the OS reclaims the 192 MiB before the next KDF. **Only the derived key bytes cross the boundary** — the worker receives `{password, salt, params}` and returns the 32-byte `raw`; no seed/mnemonic ever enters the worker (deriveKey is called with the PIN/password, not the seed). Keep `importKey`/AES in the main thread. Structure: a dedicated `src/wallet-core/argon2.worker.js` + a `deriveRawInWorker(password, salt, params)` helper; `deriveKey` calls it. Verify unlock/decrypt and encrypt all still work.

- [ ] **Step 3: Verify (controller, browser, mobile-like constraint)**

Re-run the dashboard-mounted Phase-2 create and confirm all 3 KDFs succeed (no `RangeError`) and chaff is written. If possible, exercise under a constrained-memory profile (the deploy target is a phone with less headroom than the dev box). Document what was tested.

- [ ] **Step 4: Confirm no regression to existing KDF callers**

Run: `npx vitest run src/wallet-core/__tests__/vault*.test.js src/wallet-core/__tests__/provisionChaff.test.js` (and any duress/panic/stealth tests in isolation) — confirm encrypt/decrypt round-trips still pass.

- [ ] **Step 5: Commit**

```bash
git add src/wallet-core/vault.js   # + argon2.worker.js if Step 2b
git commit -m "fix(crypto): manage Argon2 192 MiB allocation so sequential KDFs peak once (Defect A; chaff params unchanged)"
```

---

## Task 4: Verification (controller — load-bearing)

**Files:** none. Worktree preview + IndexedDB inspection.

- [ ] **Step 1: Phase-1 markers-only** — after PIN + confirm (before any Create): inspect IndexedDB — NO `primary`/`secondary`/`tertiary`; localStorage has `veyrnox-auth-model='pin'` + decoy salt. Empty dashboard shows Create Wallet/Import.

- [ ] **Step 2: Phase-2 happy path (storage parity)** — tap Create Wallet → inspect IndexedDB: `primary` + stealth pool + `secondary` + `tertiary` present; `secondary`/`tertiary` shape (fields, `kdf` == KDF_PARAMS, salt 16, iv 12) equals a personalized blob (T1 parity holds); wallet `backedUp:false`; wallet dashboard + unbacked nudge.

- [ ] **Step 3: Phase-2 fail-closed (Defect-B regression guard)** — inject a chaff failure (e.g. temporarily force `provisionDeniabilityChaff` to throw via an eval-time stub, or a constrained-memory repro) → assert NO `primary` remains (rolled back), NO chaff, dashboard stays empty, honest error shown. (Orchestrator-level already covered by `pinOnboarding.test.js`; this confirms the integrated path.)

- [ ] **Step 4: Import-under-PIN** — Import a known seed from the empty dashboard → wallet under PIN + both chaff; `authModel='pin'`; storage parity per Step 2.

- [ ] **Step 5: Option-A fall-through** — lock, enter a non-enrolled PIN → opens the deterministic decoy (no error); chaff blobs don't match (verify via `resolveDeniabilityUnlock` direct probe to avoid the unfocused-tab auto-lock confounder).

- [ ] **Step 6: Restart re-pick** — reload in the "PIN set, no wallet" state → explore-first; create CTA → PIN-create (markers re-written, no breakage).

- [ ] **Step 7: Regression** — returning-user PIN unlock → dashboard; password cohort + Security framing unchanged. Run the affected unit suite (`provisionChaff`, `pinOnboarding`, `pinRecovery`, `security-framing`, `authModel`, `decoyFallback`) — all green.

- [ ] **Step 8: Capture proof** — screenshots: PIN-create, empty dashboard (Create/Import), wallet dashboard; the storage-parity dump.

---

## Self-review notes
- Spec coverage: Phase 1 (T1/T2), Phase 2 atomic+fail-closed (T1/T2/T3), Defect A (T3), self-heal removal (T1 S1), import-under-PIN (T2 S4), accepted trade (recorded in spec), all tests (T4). ✓
- Hold #1 (clear pendingPin on EVERY exit): success (T1 S5/S6); lock/background (T1 S3); abandonment/back (T2 S5); **Phase-2 failure (T2 S4 catch → clearPendingPin)**. All four exits covered; the secret never lingers beyond the flow.
- Hold #4 (clean self-heal removal): T1 S1 + import-removal check.
- Hold #5 (worker boundary): T3 S2b — only derived bytes cross; seed never enters worker.
