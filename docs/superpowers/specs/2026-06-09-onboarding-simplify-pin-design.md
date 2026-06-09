# Design spec: simplify new-user onboarding (single PIN → dashboard)

**Date:** 2026-06-09
**Status:** UNAUDITED-PROVISIONAL · testnet · PIN cohort · `src/` → PR, verify gate
**Reworks:** #138 (`WalletEntry.jsx` PIN cohort onboarding)
**Scope:** Phase 1 (onboarding collapse + always-provision both deniability slots) **+** Security-drawer framing fix. Nudge system and full Face-ID-to-decoy wiring are deferred (see Out of scope).

Source briefs: `onboarding-simplify-brief.md`, `onboarding-simplify-approval-brief.md` (the two must-haves below are from the approval brief).

---

## 1. Goal & problem

New-user onboarding in #138 forces: real PIN → confirm → duress PIN → panic PIN → seed backup before the dashboard. Too much ceremony. Collapse it to **choose PIN → confirm → dashboard.**

The user-facing change is "pick one PIN, you're in." The deniability machinery that #138 set up through forced steps must instead be **provisioned silently**, so the simplification does not reopen a deniability oracle.

---

## 2. The non-negotiable: slots provisioned silently at PIN creation

When the user sets their single PIN, the **duress** slot and the **panic** slot are still provisioned automatically, with throwaway defaults, invisibly. The user picks one PIN and lands on the dashboard. (Decision: panic is always-provisioned too, not just duress — confirmed during brainstorming, because panic carries the same on-disk tell as duress.)

### Why this is mandatory

Deniability here is **single-mode**: every PIN device must be structurally identical regardless of what the user personalized. If duress/panic were *enabled later* rather than *provisioned always*, a device where the user enabled them would be observably different from one where they didn't — "is duress configured on this device?" would have a discoverable answer. That answer is the oracle that defeats deniability.

### What the oracle actually is (reconnaissance finding — reframes the brief)

- **Timing is already closed.** `wallet-core/deniabilityUnlock.js` runs a **constant 4 Argon2id KDFs** on every non-primary unlock regardless of which features are configured (unconfigured slots burn a dummy KDF on a `chaffBlob()`). So "always provision" is **not** about timing.
- **Storage footprint is the live oracle.** `duress.js` persists a `secondary` blob only when duress is set; `panic.js` persists a `tertiary` blob only when panic is set (key `tertiary`). A forensic examiner with raw device access can see *which* blobs exist. `duress.js` documents this as a known partial limitation.

Therefore: **always-provisioning closes the storage-footprint oracle** by ensuring every PIN device has `primary + stealth-pool + secondary + tertiary` on disk whether or not the user ever personalizes.

---

## 3. Onboarding — the new flow

1. Choose a 6-digit PIN.
2. Confirm it.
3. **Dashboard.** (Wallet provisioned: real set live; duress + panic slots silently provisioned with throwaway chaff; device salt + stealth pool seeded as today.)

Removed from the forced path: the duress-PIN step, the panic-PIN step, the seed-backup step, and the `BiometricOffer` screen.

### `WalletEntry.jsx` changes

- `pin-create` view: `pinStep` collapses to `real → real-confirm → (done)`. Delete the `duress` and `panic` sub-steps and the seed-backup screen branch from the create path.
- After `real-confirm` matches, call `finishPinCreate()`, which now goes **straight to the app** — no `generatedSeed` hold, no biometric offer.
- `finishPinRecover()` (the §4 PIN-recovery twin) collapses the same way: after the new PIN is confirmed, provision chaff and enter — no duress/panic steps.
- Remove now-unused state/refs tied to the deleted steps (`duressPin`, `panicPin`, `duressPinRef`, `bioEnabled`/`BiometricOffer` usage on the create path, the `generatedSeed`/`showSeed` hold for PIN create). Keep anything still used by the password cohort and import path untouched.

---

## 4. Silent always-provision — implementation

New wallet-core helper `ensureDeniabilityChaff()` (testable without React). It writes **both** chaff blobs through the **identical credential path** used by real personalization — no chaff-specific branch — and is **idempotent**, mirroring the existing `ensureStealthPool()` pattern:

```
// wallet-core/provisionChaff.js (new)
import { generateMnemonic } from './mnemonic.js';
import { hasDuressVault, setDuressVault } from './duress.js';
import { hasPanicVault,  setPanicVault }  from './panic.js';

// 32 random bytes, base64 → a high-entropy throwaway password, generated and
// discarded here. The chaff blob it produces is genuinely unopenable (nobody
// holds this password) and byte-indistinguishable from a personalized blob.
function throwawayPassword() { /* crypto.getRandomValues(32) → base64 */ }

// Idempotent: provision a chaff blob ONLY when the slot is empty. NEVER
// overwrites an existing blob — so a personalized duress/panic credential is
// preserved, and a missing slot (failed earlier write) is backfilled.
export async function ensureDeniabilityChaff() {
  if (!(await hasDuressVault())) {
    await setDuressVault(generateMnemonic(128), throwawayPassword()); // → 'secondary'
  }
  if (!(await hasPanicVault())) {
    await setPanicVault(throwawayPassword());                          // → 'tertiary'
  }
}
```

- **Reuses existing functions verbatim.** `setDuressVault`/`setPanicVault` go through the same `encryptVault` path; no new storage surface.
- **Idempotent / never-overwrite.** Guarding on `hasDuressVault()`/`hasPanicVault()` means: (a) a personalized blob is never clobbered by a later chaff pass, and (b) a slot that failed to write at creation is backfilled on the next call. This is the wallet's own provisioning check — it is internal and never surfaced as a configured-vs-not indicator (see §8).
- **strength = 128** for the duress chaff mnemonic — matches `setDuressPin`'s default so chaff and personalized `secondary` carry an identical-length plaintext (→ identical ct length). `setPanicVault` already uses `generateMnemonic(128)` internally for both chaff and personalized, so `tertiary` parity is automatic.
- **Call sites mirror `ensureStealthPool()`** exactly: invoked after `createWallet(realPin)` (PIN onboarding), after `importWallet` (PIN recovery), **and on every PIN-cohort `unlock`** so a device that somehow missed provisioning self-heals to the universal footprint. Because it is idempotent and never overwrites, the unlock-time call is safe and adds no oracle. Ordering/best-effort identical to today's `getOrCreateDeviceSalt()` / `ensureStealthPool()` seeding.

### Must-have #2 — identical credential path, no chaff branch (CONFIRMED)

The chaff password flows through `setDuressVault`/`setPanicVault` → `encryptVault` → Argon2id at the shared `KDF_PARAMS` with the same random-salt handling as any real credential. There is **no chaff-specific shortcut, parameter, or code path.** Indistinguishability is structural (the chaff genuinely went through the real path), not hopeful.

Behavior/timing parity on a non-real PIN entry: "chaff blob present but doesn't match" is the **same** code path as "real duress blob present but doesn't match" — `tryDuressUnlock`/`tryPanicUnlock` attempt decrypt, GCM auth fails, return null/false, fall through to the Option-A deterministic decoy (`deriveDeterministicDecoyMnemonic`). Timing is identical by construction (the constant-4-KDF design in `deniabilityUnlock.js`); stated here explicitly.

---

## 5. Deniability invariant — why it holds

| Property | Before personalization (simple onboarding) | After personalization | Result |
|---|---|---|---|
| On-disk blobs | `primary, stealth-pool, secondary(chaff), tertiary(chaff)` | `primary, stealth-pool, secondary(real), tertiary(real)` | **Same key set** |
| Blob shape/size/KDF params | `encryptVault` output | `encryptVault` output | **Identical (tested, §7)** |
| KDFs per non-primary unlock | 4 (constant) | 4 (constant) | **Same** |
| Unlock UI / error text | unchanged | unchanged | **Same** |

A device that did simple onboarding is byte-indistinguishable on disk and at the prompt from one where the user later personalized duress/panic.

---

## 6. Face-ID consequence (deferred, no regression)

#138 cached the *user-chosen duress PIN* for Face-ID-to-decoy on the (now-removed) backup screen. With no duress step there is no user-chosen duress PIN to cache, so **Face-ID-to-decoy is not set up at onboarding**; it is wired when the user sets a custom duress PIN in Security (deferred follow-up). No deniability regression: "no Face ID configured" is **uniform** across all fresh devices — nothing to distinguish. Onboarding presents no biometric step.

---

## 7. Seed backup

The wallet is created `backedUp:false`. The **existing** surface in `WalletPortfolioPage.jsx` covers it:

- the global unbacked-wallet warning (per-wallet "Back up" buttons), and
- the "Back up {wallet}" dialog, which already calls `revealWalletMnemonic(id)` to show the seed-reveal grid.

It does **not** block reaching the dashboard. The dismissable / silence-after-N nudge behaviour is deferred (Out of scope).

---

## 8. Security framing (the "+framing" scope — ships in THIS PR)

Always-provision and framing are one unit: a provisioned slot with a UI that says "not configured" is the oracle surfaced in the UI. Both ship together.

`DuressPin.jsx` / `PanicWipe.jsx` (and any Security-drawer entry points):

- Copy reads **"Set a custom duress PIN"** / **"Change your duress PIN"** and **"Set a panic/wipe PIN"** — **never** "Enable duress", "Duress: not configured", "Disabled", etc. The user is *personalizing what an always-present slot resolves to*, not turning a feature on.
- The "panic/wipe PIN" label is correct in this setup context (per #141); it must stay absent from the login surface and any coercion-reachable screen.

### Must-have framing check — logic, not just strings

- **Grep gate (copy):** a test asserts the Security UI contains no "enable" / "not configured" / "disabled" framing for duress/panic.
- **Logic grep (oracle):** confirm **no code path computes or displays a configured-vs-not state by inspecting slot/blob presence** — i.e. nothing calls `hasDuressVault()`/`hasPanicVault()` (or reads the blob) to render an "is it configured?" indicator in the Security UI. With slots always provisioned, such a check would always say "configured" anyway, but the requirement is that the configured-state is **not computed or surfaced at all.** Audit the logic, not only the literals.

---

## 9. Testing

Load-bearing test is the **chaff structural-parity** test (§ must-have #1) — same role the timing test had in the auth build.

1. **Flow:** onboarding reaches the dashboard after PIN + confirm; no duress/panic/seed-backup steps or biometric offer rendered.
2. **Chaff present:** after simple onboarding, both `secondary` and `tertiary` blobs exist.
3. **Chaff structural parity (MUST assert shape, not presence):** compare the `secondary`/`tertiary` blobs from a simple-onboarded device against the blobs from a device that later personalized duress/panic. Assert equality of: blob **format** (keys `v, kdf, salt, iv, ct`), **`kdf` params** (`name` + every `KDF_PARAMS` field), and **byte-lengths** of `salt` (16), `iv` (12), and `ct`. A test that only checks "both blobs exist" is insufficient — it passes while the oracle stays open.
4. **Option-A fall-through:** entering a non-real PIN still opens the deterministic decoy (chaff never matches); behavior identical whether the slot holds chaff or a personalized blob.
5. **Personalization overwrites:** setting a custom duress/panic PIN (via `setDuressVault`/`setPanicVault`) replaces the chaff at the same key and then opens correctly; the resulting blob is byte-parity with the chaff blob per (3) for format/params.
6. **Idempotent / never-overwrite:** calling `ensureDeniabilityChaff()` when a slot already holds a blob (chaff **or** personalized) is a no-op — it must NOT clobber a personalized credential. Calling it when a slot is empty backfills chaff. (Covers the unlock-time self-heal call.)
7. **Recovery path:** `finishPinRecover()` also provisions both chaff blobs (re-run (2)–(3) for the recovery flow).
8. **Regression:** returning-user PIN login, password cohort, and import path unchanged.
9. **Framing:** grep gate (no enable/not-configured copy) + logic check (no configured-state computed/displayed from blob presence in Security UI).

---

## 10. Out of scope (deferred follow-up specs)

- Dismissable nudge system + silence-after-N **generic** dismissal counter (no per-feature breadcrumb — itself a coercion trail).
- Harden-nudge (duress/panic) **re-surface when real value first arrives.**
- Full **Face-ID-to-decoy wiring** in `DuressPin.jsx`.

---

## 11. Audit flags (ships UNAUDITED-PROVISIONAL)

- Chaff construction (throwaway-password blobs as storage parity) and the structural-parity guarantee are flagged for independent audit alongside the deniability modules (`duress.js`/`panic.js`/`deniabilityUnlock.js`).
- Residual storage-deniability limitations already documented in `duress.js` (raw forensic access; native hardware-backed decoy slot not wired) are unchanged by this work and remain audit items.
