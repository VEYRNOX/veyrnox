# Design: Last-successful-unlock timestamp

**Date:** 2026-06-16
**Status:** DESIGN — pre-implementation. On build: **BUILT / UNAUDITED-PROVISIONAL** (no on-chain
artifact, so never "verified"). Surfaced (the decision note wants it shown); **not** audit-gated — it is a
single timestamp in the existing primary container, no new cryptographic construction.
**Owner:** Al · **Reviewer:** independent audit (as part of the standing S1–S4 review, not a per-feature gate)
**Cross-refs:** `docs/Feature-Status.md` §6 ("Decision note — Login activity re-scope (last-unlock
timestamp)" — this builds the recommended successor), `docs/audit-log-login-activity-deniability-decision.md`
(the deniability constraints this honors), `src/lib/WalletProvider.jsx` (`unlock()`), `src/wallet-core/multiVault.js`.

---

## 1. Problem (one sentence)

A self-custody deniable wallet has no account to show sign-in history for, but the owner still wants a
**tamper signal** — "when was this vault last opened?" — that a coercer or device thief cannot use to prove
a hidden set exists or which credential was used.

## 2. Background (why the obvious designs were rejected — from the §6 decision note)

- Cross-device sign-in history + location/map: needs a backend (removed with base44) and is a
  surveillance/forensic artifact that conflicts with the deniability stack. **Out of scope.**
- Plaintext failed-unlock counter: failed attempts occur BEFORE the vault is unlocked, so there is no key
  to encrypt under → forces an unencrypted on-disk artifact (a forensic tell). **Rejected.**
- In-memory-only counter: deniability-clean but useless (does not survive restart). **Rejected.**
- **Chosen (this spec):** a "last successful unlock" timestamp stored IN-VAULT, recorded only on a
  successful PRIMARY unlock (sidesteps the "no key before unlock" wall), shown to the owner as a tamper
  signal. Deniability-clean.

## 3. Settled decisions (from brainstorming, 2026-06-16)

1. **Session scope: PRIMARY-ONLY.** Stored/read/shown in the primary session only. Decoy/hidden sessions
   never read or write it. Rationale: decoy/hidden are stored as **bare mnemonics** with no field to carry a
   timestamp; giving them an independent stored value would reopen the bare-mnemonic chaff-length
   distinguisher that blocks the Action-Password-2FA TARGET (audit-gated). Primary-only avoids it entirely
   and is consistent with the audit-log primary-only decision.
2. **Surfacing: Security Dashboard.** A "Last opened" row on `src/pages/SecurityDashboard.jsx`. (Unlike the
   audit log, this feature IS surfaced — the decision note explicitly wants it shown.)
3. **Storage: Approach A — in-container field**, re-encrypted at unlock. Chosen over a separate
   HKDF-keyed blob (Approach B) because at `unlock()` the container is already decrypted, so the
   **previous** value is read for free (A costs +1 Argon2id for the write; B would cost +2 — an extra
   decrypt to read the prev value — for no benefit). Plaintext-on-disk (C) rejected: the deniability
   property requires the value be in-vault so a decoy session cannot read the primary's.

## 4. Architecture

Three small, well-bounded pieces: a pure container field (storage), a primary-branch write at unlock
(record), and a Security Dashboard row (display).

### 4.1 `src/wallet-core/multiVault.js` — optional `lastUnlockAt` field
Mirror the existing optional `actionPassword` field exactly. `lastUnlockAt` is a number (epoch ms) or absent.
- `makeContainer(wallets, actionPassword, lastUnlockAt)` — carry it when provided.
- `serializeContainer(container)` — write `lastUnlockAt` only when present (absent stays absent → no tell).
- `parseVault(plaintext)` — read it back via `makeContainer(parsed.wallets, parsed.actionPassword, parsed.lastUnlockAt)`.
- `addWallet` / `removeWallet` — carry it over unchanged (like `actionPassword`).
- New pure helper `withLastUnlockAt(container, ts)` — returns a NEW container with the field set (keeps the
  mutation out of `unlock()` and is unit-testable in isolation).
- Pure serialization only — NO crypto change; the AES-GCM/Argon2id primitives are untouched and unaware of
  the field; isolation invariants (each wallet's mnemonic standalone) preserved.

### 4.2 `src/lib/WalletProvider.jsx` — write at unlock (primary branch only)
Inside the `isPrimary` block of `unlock()` (the `if (isPrimary) { ... }` arm):
- Read `prev = container.lastUnlockAt ?? null` (free — the container is already decrypted) and hold it for
  display via `setLastUnlockAt(prev)`.
- AFTER `setUnlocked(true)`, fire a **best-effort async** persist (never blocks unlock):
  ```js
  const updated = mv.withLastUnlockAt(container, Date.now());
  containerRef.current = updated;
  void keyStore.createVault(mv.serializeContainer(updated), password).catch(() => {});
  ```
  This reuses the exact re-encrypt pattern the migration path already uses; a failed write leaves the prior
  blob intact (IndexedDB `put` at key `primary` is atomic) and degrades to "First open" next time.
- The **decoy/hidden branch writes nothing** (it already never persists) and calls `setLastUnlockAt(null)`.
- `lock()` calls `setLastUnlockAt(null)`.
- `createWallet`/`importWallet` do NOT set it — a brand-new wallet correctly shows "First open"; the first
  real unlock writes the first value.

### 4.3 Display — Security Dashboard
- New React state `lastUnlockAt` (the PREVIOUS value, read at unlock), exposed on the context `value`.
- `src/pages/SecurityDashboard.jsx` renders a **"Last opened"** row: the timestamp in IBM Plex Mono
  (verifiable-value styling per the design system), or "First open on this device" when null.
- Pure helper `formatUnlockTime(ts)` — absolute date+time (recognizable as a tamper signal); `null →
  "First open on this device"`. Lives next to the component or in a small util; unit-tested.

## 5. Deniability & safety invariants

- **I3 (deniability):** primary-only; decoy/hidden never read or write it → cannot reveal a hidden set or
  which credential unlocked. NO new blob is created → no count/size oracle (D7). The value rides inside the
  primary vault blob that already exists.
- **Panic wipe:** the value lives in the primary vault blob → destroyed for free by the existing
  store-clear; no separate cleanup path needed.
- **I4 (fail closed/honest):** the persist is best-effort; a write failure degrades to "First open", never
  blocks unlock, and can never corrupt the seed blob (atomic put; old blob retained on failure).
- **No fake security:** it is a real encrypted-at-rest timestamp shown honestly; "First open" is shown when
  there genuinely is no prior value rather than fabricating one.
- **Status:** no on-chain artifact → BUILT / UNAUDITED-PROVISIONAL. Surfaced; not audit-gated (no new
  construction — a single field in the already-audited container, same shape class as `actionPassword`).

## 6. Edge cases

- **First unlock of a new/imported wallet:** `lastUnlockAt` absent → display "First open"; that unlock
  writes the first value.
- **Migration unlock (legacy bare mnemonic → container):** the migration re-encrypt already runs in the
  same `isPrimary` block; the `lastUnlockAt` write composes with it (set the field on the same container
  before/with the re-encrypt; one persist, not two).
- **Read-only primary session that locks before any mutation:** the async persist still runs at unlock, so
  the value survives lock/restart.
- **Active-wallet switching within a session:** the timestamp is a CONTAINER-level field (per unlock
  identity), independent of which wallet is active — switching wallets does not change or rewrite it.

## 7. Testing (TDD — write tests first)

- `multiVault.js`:
  - `withLastUnlockAt(container, ts)` sets the field, overwrites an existing one, and preserves `wallets`
    and `actionPassword`; returns a NEW object (no mutation of the input).
  - `serializeContainer` → `parseVault` round-trips `lastUnlockAt`; a container WITHOUT it serializes
    without the key (absent stays absent — no tell).
  - `addWallet` / `removeWallet` carry `lastUnlockAt` over unchanged.
- `formatUnlockTime`: `null → "First open on this device"`; a known epoch-ms → the expected absolute string.
- No React-render test (the repo has no component/hook test harness — confirmed in the audit-log work). The
  provider write + dashboard wiring are verified by the full suite staying green + `npm run build`,
  consistent with the audit-log feature.

## 8. Scope guard (files touched)

`src/wallet-core/multiVault.js`, `src/lib/WalletProvider.jsx`, `src/pages/SecurityDashboard.jsx`, plus
their tests. **No** new crypto, **no** new vault blob, **no** decoy/hidden storage, **no** change to the
`unlock()` failure / deniability-resolution path, **no** backend.

## 9. Out of scope

- Decoy/hidden independent last-unlock values (bare-mnemonic chaff-length problem — audit-gated, same
  blocker as the 2FA TARGET).
- Failed-unlock counts / attempt history (the "no key before unlock" wall; rejected in the §6 note).
- Cross-device sign-in history, location/map (needs a backend; out of scope).
