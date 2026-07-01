# Design spec (v2): onboarding = PIN setup (credential markers) → empty dashboard → create wallet

**Date:** 2026-06-09
**Status:** UNAUDITED-PROVISIONAL · testnet · PIN cohort · `src/` → PR, verify gate
**Authoritative source:** `onboarding-authoritative-flow-brief.md` (PIN-first; matches the diagram Al confirmed). This **supersedes** the earlier `onboarding-rework-authoritative-brief.md` explore-first ordering.
**Supersedes:** `2026-06-09-onboarding-simplify-pin-design.md` (the provision-at-PIN model — PIN creation == wallet creation — is the WRONG model and is reworked here).

> **CORRECTION (PIN-first).** An earlier revision of this spec said "explore-first preserved" (fresh device → empty dashboard → PIN-create). The authoritative brief reverses that: **PIN-create comes BEFORE the dashboard.** A fresh device routes to PIN-create FIRST; the empty dashboard is reached only AFTER the PIN is set. The diagram and clarifications below are updated to match.

Clarifications resolved with the user (this turn):
- **PIN credential = markers only.** Phase 1 persists ONLY `authModel='pin'` + the device decoy salt; `realPin` is held in memory for the session. No PIN secret/verifier on disk. On restart with no wallet, the PIN is re-picked.
- **PIN-first ordering.** A fresh device lands on **PIN-create**, before any dashboard. The view-only empty dashboard is rendered only after Phase-1 PIN setup commits its markers; it is never the cold-mount landing. (Pinned by `lib/onboardingEntry.js` + its test.)
- **Import = under PIN + chaff (atomic).** Importing a seed from the empty dashboard encrypts it under the in-memory `realPin` and provisions both chaff slots in the same fail-closed atomic block as Create Wallet; the device stays PIN cohort.

---

## Model overview

Wallet creation is split into two deliberate phases. **A decoy is a decoy *of the real wallet*, so the deniability chaff slots can only be written once the real wallet exists (Phase 2).** That is structural, not a preference.

```
fresh device ─► PHASE 1: PIN setup (credential markers only)   ◄── FIRST, before any dashboard
                   │  choose 6-digit PIN ─► confirm
                   │  persist authModel='pin' + device salt; hold realPin in memory
                   ▼
              EMPTY DASHBOARD (real app shell, no wallet)  ── "No wallet yet"   ◄── AFTER the PIN
                   │  ┌─ "Create Wallet" ─┐         ┌─ "Import an existing seed" ─┐
                   ▼  ▼                   ▼         ▼                             ▼
              PHASE 2: atomic, fail-closed wallet provisioning (uses in-memory realPin)
                   primary + stealth pool + secondary(chaff) + tertiary(chaff), backedUp:false
                   ▼ commit
              WALLET DASHBOARD (+ existing unbacked-wallet backup nudge)
                   ▼ reload
              PIN PAD ("Enter your PIN")
```

---

## Phase 1 — PIN setup writes CREDENTIAL MARKERS ONLY (no wallet)

Entry: the fresh-open landing. A vault-less cold mount routes directly to the PIN-create view (PIN-first; no pre-PIN dashboard).

1. Choose a 6-digit PIN (`realPin` in memory).
2. Confirm (re-enter, must match).
3. On match, **persist markers only** and hold the PIN in memory:
   - `setAuthModel('pin')`
   - `getOrCreateDeviceSalt()` (Option-A deterministic-decoy salt)
   - store `realPin` as a transient **`pendingPin`** in `WalletProvider` (in-memory ref/state; **never persisted**)
   - **Do NOT write `primary`, `secondary`, `tertiary`, or any PIN verifier.**
4. Enter explore mode → render the **empty dashboard** (real app shell) with **Create Wallet** + **Import** affordances (driven by `pendingPin` being set).

**On-disk after Phase 1:** `authModel='pin'` + device salt; `primary`/`secondary`/`tertiary` absent. State = "PIN set (this session), no wallet."

**Restart in this state:** `pendingPin` is gone (memory cleared); `hasVault()===false` → PIN-first, so the cold mount lands back on PIN-create (re-pick). The stale `authModel='pin'` marker is harmless (no vault to unlock). Re-picking is cheap and writes the same markers.

---

## Phase 2 — wallet creation: a SEPARATE, deliberate action from the empty dashboard

Triggered by **Create Wallet**, **Import an existing seed**, or a wallet-requiring action (e.g. **Send**) tapped on the empty dashboard while `pendingPin` is set. All write the real wallet AND both chaff slots as ONE atomic, fail-closed block, reusing the existing `provisionPinWallet` orchestrator (commit `7a5582e`) and `discardIncompleteWallet` teardown (`ca91cd1`).

**Create Wallet** → `provisionPinWallet({createWallet, provisionDeniabilityChaff, setAuthModel, getOrCreateDeviceSalt, discardIncompleteWallet}, { pin: pendingPin })`:
1. `createWallet(pendingPin)` → `primary` blob + stealth pool (Argon2id 64 MiB).
2. `provisionDeniabilityChaff()` → `secondary` (duress chaff) + `tertiary` (panic chaff), each via the same `setDuressVault`/`setPanicVault` → `encryptVault` path as a real credential (no chaff branch). **Defect-A memory management applies here (see below).**
3. `setAuthModel('pin')` + `getOrCreateDeviceSalt()` (idempotent; markers already set in Phase 1).
4. Wallet is `backedUp:false`.
5. **COMMIT** — on success, clear `pendingPin`, the vault is unlocked → wallet dashboard + the existing unbacked-wallet backup nudge.

**Import an existing seed** → an atomic import-under-PIN twin (mirrors `provisionPinRecovery`, commit `7a5582e`, which is already fail-closed): `importWallet(seed, pendingPin)` → `provisionDeniabilityChaff()` (discard+rethrow on failure) → markers. Device stays PIN cohort (NOT the legacy `setAuthModel('password')` path). On success clear `pendingPin`.

**Fail-closed (Defect-B, carried forward — now on Phase-2 create/import, not `finishPinCreate`):** if ANY step fails, `provisionPinWallet`/the import twin calls `discardIncompleteWallet()` (rolls back any partial `primary`, writes no chaff, clears markers, locks — no `wasWiped`), rethrows; the dashboard shows an honest "Wallet setup failed, try again" and stays on the empty dashboard. The empty dashboard is held until `primary + secondary + tertiary` are all committed (the provisioning gate, repurposed). **Never** a half-provisioned wallet; **never** a wallet rendered over absent chaff (I4). No wallet > a defenseless wallet that claims to be defended.

---

## Defect A — manage Argon2 allocation in Phase 2 (now in scope)

Phase 2 runs **from the mounted (empty) app shell**, so the 3 sequential 64 MiB Argon2 KDFs (primary + 2 chaff) run under the app's memory pressure — the exact condition under which the chaff KDF threw `RangeError: Invalid typed array length` in browser verification (the dashboard-mounted `chaffProbe` failed; unmounted onboarding KDFs succeeded). Root cause (systematic-debugging): `hash-wasm` instantiates a fresh ~64 MiB WASM memory per `argon2id()` call (`index.umd.js:244-248`); under the mounted app, allocating the next 64 MiB before the previous is reclaimed exceeds the budget.

**Fix — make peak 64 MiB once, not concurrent. Never lower chaff's KDF params** (chaff must be byte-identical to personalized; the T1 `chaff.kdf === real.kdf` parity test forbids it). Approach, in order:
1. **Diagnose** whether a yield-between-KDFs (`await` a macrotask so the previous instance is GC-eligible before the next allocates) suffices on the empty-dashboard app shell. Test against a memory-constrained context, not just the dev box.
2. If insufficient, **run each Argon2 in a short-lived Web Worker that is terminated after the call**, so the OS reclaims its 64 MiB before the next KDF — deterministic peak of one 64 MiB at a time. This is a `vault.js`/`deriveKey` change affecting all KDF callers; scope carefully and verify unlock/decrypt still work.

Verify the fix against a mobile-like constraint (the deploy target has *less* headroom than the dev box).

---

## Self-heal (was T7) — REMOVED

With fail-closed atomic creation, a wallet is either fully provisioned (primary + both chaff) or absent (just markers, no wallet) — there is no under-provisioned wallet to heal. The unlock-time `provisionDeniabilityChaff` self-heal (commit `ac6643f`) is **removed**. (A "PIN set, no wallet" device has no vault to unlock, so it never reaches the unlock self-heal anyway.)

---

## What survives unchanged (do NOT rebuild)

- **T1** `provisionDeniabilityChaff()` + structural-parity + chaff-unopenable tests (`19d588b`/`0f93268`). Reused in Phase-2 step 2.
- **T2** chaff in recovery (`e05053e`) + fail-closed (`7a5582e`). Recovery still re-provisions both slots atomically.
- **T3–T5** Security framing: "Set/Change custom duress PIN" / "Set a panic/wipe PIN", never "Enable/not configured"; computed-configured-state oracle removed from `DuressPin.jsx`, `PanicWipe.jsx`, `SecurityDashboard.jsx`; grep gate on logic + copy (`797b349`/`80cc20e`).
- **Fail-closed machinery:** `pinOnboarding.js` `provisionPinWallet`, `discardIncompleteWallet`, `clearAuthModel`/`clearDeviceSalt` (`7a5582e`/`ca91cd1`).

## What is rebuilt

- **Onboarding spine (`WalletEntry.jsx`):** `finishPinCreate` no longer creates a wallet. Split into Phase-1 PIN setup (markers + `pendingPin` + enter explore) and Phase-2 dashboard-triggered create/import (atomic, fail-closed). The pre-PIN "choose: create/import" screen collapses to a single "Create or import" CTA → PIN-create; the create/import choice moves to the post-PIN empty dashboard.
- **`WalletProvider.jsx`:** add transient `pendingPin` (in-memory, never persisted) + Phase-1 `setupPin(pin)` (markers + pendingPin + enterExplore) + Phase-2 `createWalletFromPendingPin()` / `importWalletForPendingPin(seed)` consuming + clearing `pendingPin`. Wire the empty-dashboard CTAs (`requireWallet` / explore create button / Send-with-no-wallet) to Phase 2 when `pendingPin` is set.
- **Remove** the unlock self-heal (`ac6643f`).

---

## Accepted v1 deniability trade (record, don't hide)

The Phase-1 "PIN set, no wallet" state is **observable**: a device with `authModel='pin'` + salt but no `primary` is distinguishable from one that never set a PIN. The provision-at-PIN model avoided this window; this flow reintroduces it deliberately for UX. **Accepted v1 limitation** — an un-created wallet has nothing to coerce. Flagged for audit alongside the deniability module. (Note: with "markers only", the window is just non-secret markers; no PIN secret is exposed.)

---

## Tests

1. **Phase 1:** after PIN + confirm, on-disk = `authModel='pin'` + salt, and **NO `primary`/`secondary`/`tertiary`**; empty dashboard renders with Create/Import.
2. **Phase 2 happy path (browser, inspect actual IndexedDB):** after Create Wallet → `primary` + stealth pool + `secondary` + `tertiary` present; chaff structurally equal to personalized (T1 parity); `backedUp:false`; wallet dashboard shows.
3. **Phase 2 fail-closed (the Defect-B regression guard):** inject a chaff-provision failure → assert NO `primary` remains (rolled back), NO chaff, dashboard stays empty, honest error. (Covered at the orchestrator level by `pinOnboarding.test.js`; add the integration assertion.)
4. **Import-under-PIN:** importing from the empty dashboard → wallet under PIN + both chaff; `authModel='pin'` (not 'password'); same parity + fail-closed.
5. **Defect-A memory:** Phase-2 sequential KDFs do not exhaust memory under app-mounted / mobile-like constraints.
6. **Option-A fall-through:** a non-enrolled PIN opens the deterministic decoy (no error); chaff blobs don't match.
7. **Restart:** "PIN set, no wallet" → cold mount lands on PIN-create (PIN-first; re-pick PIN); no stale-state breakage.
9. **PIN-first ordering (regression guard for the prior explore-first mis-build):** a fresh device (no vault) lands on PIN-create, NOT the empty dashboard. Unit-pinned by `lib/onboardingEntry.js` (`resolveOnboardingEntry`); confirm in-browser the first screen is the PIN pad, not the dashboard.
8. **Regression:** returning-user PIN unlock, password cohort, and the Security framing unchanged.

## Process

Subagent-driven. Load-bearing reads when work returns: the **Phase-2 fail-closed test** (roll-back on chaff failure) and the **storage-parity browser proof** (IndexedDB inspection, not just dashboard render — the check that caught the prior bug). Ships UNAUDITED-PROVISIONAL; on-device "verified" only on a real result.
