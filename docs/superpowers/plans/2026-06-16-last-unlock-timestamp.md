# Last-successful-unlock Timestamp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the owner a deniability-clean "last opened" tamper signal by recording a last-successful-unlock timestamp in the primary vault container and surfacing it on the Security Dashboard.

**Architecture:** An optional `lastUnlockAt` field on the multi-seed container (same shape class as the existing `actionPassword`), written at `unlock()` in the **primary branch only** via a best-effort async re-encrypt (the previous value is read for free from the already-decrypted container). A pure `formatUnlockTime` helper renders it; `SecurityDashboard.jsx` shows a "Last opened" row. Decoy/hidden sessions never read or write it.

**Tech Stack:** JS (ESM), Vitest, existing `vault.js` Argon2id+AES-GCM (reused verbatim — no new crypto), `multiVault.js` container serialization, React context (`WalletProvider`), Tailwind UI.

**Spec:** `docs/superpowers/specs/2026-06-16-last-unlock-timestamp-design.md`

---

## File Structure

- `src/wallet-core/multiVault.js` — **modify.** Add optional `lastUnlockAt` (epoch-ms number) to `makeContainer`/`serializeContainer`/`parseVault`/`validateContainer`; carry it through `addWallet`/`removeWallet`; export a pure `withLastUnlockAt(container, ts)`.
- `src/wallet-core/__tests__/multivault.test.js` — **modify.** Add round-trip + carry-over + validation tests.
- `src/lib/formatUnlockTime.js` — **create.** Pure display helper (`null → "First open on this device"`).
- `src/lib/__tests__/formatUnlockTime.test.js` — **create.** Unit tests.
- `src/lib/WalletProvider.jsx` — **modify.** New `lastUnlockAt` state; write-at-unlock in the primary branch; reset in `lock()`/decoy-hidden/create/import; expose on context.
- `src/pages/SecurityDashboard.jsx` — **modify.** Render the "Last opened" row.
- `docs/Feature-Status.md` — **modify.** Flip the §6 last-unlock line from specced-successor to BUILT.

---

## Task 1: `multiVault.js` — optional `lastUnlockAt` field + `withLastUnlockAt`

**Files:**
- Modify: `src/wallet-core/multiVault.js`
- Test: `src/wallet-core/__tests__/multivault.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `src/wallet-core/__tests__/multivault.test.js` (inside the top-level `describe`, or add a new `describe`). Use a real BIP-39 mnemonic helper already imported in that file; if none, import `generateMnemonic` from `../mnemonic.js`:

```js
import { withLastUnlockAt, serializeContainer, parseVault, addWallet, removeWallet, validateContainer } from '../multiVault.js';
import { generateMnemonic } from '../mnemonic.js';

describe('container lastUnlockAt field', () => {
  const m1 = generateMnemonic(128);
  const m2 = generateMnemonic(128);
  // A container with two wallets, no lastUnlockAt yet.
  const base = parseVault(serializeContainer(addWallet(parseVault(m1).container, m2).container)).container;

  it('withLastUnlockAt sets the field, returns a new object, preserves wallets', () => {
    const out = withLastUnlockAt(base, 1750000000000);
    expect(out).not.toBe(base);                 // new object, no mutation
    expect(base.lastUnlockAt).toBeUndefined();  // input untouched
    expect(out.lastUnlockAt).toBe(1750000000000);
    expect(out.wallets.map((w) => w.id)).toEqual(base.wallets.map((w) => w.id));
  });

  it('withLastUnlockAt overwrites an existing value and preserves actionPassword', () => {
    const withAp = { ...base, actionPassword: { kdf: 'argon2id', salt: 'x', hash: 'y' } };
    const out = withLastUnlockAt(withLastUnlockAt(withAp, 1), 2);
    expect(out.lastUnlockAt).toBe(2);
    expect(out.actionPassword).toEqual(withAp.actionPassword);
  });

  it('serialize -> parse round-trips lastUnlockAt', () => {
    const stamped = withLastUnlockAt(base, 1750000000000);
    const round = parseVault(serializeContainer(stamped)).container;
    expect(round.lastUnlockAt).toBe(1750000000000);
  });

  it('a container without lastUnlockAt serialises without the key (no tell)', () => {
    expect(JSON.parse(serializeContainer(base))).not.toHaveProperty('lastUnlockAt');
  });

  it('addWallet and removeWallet carry lastUnlockAt over unchanged', () => {
    const stamped = withLastUnlockAt(base, 4242);
    const added = addWallet(stamped, generateMnemonic(128)).container;
    expect(added.lastUnlockAt).toBe(4242);
    const removed = removeWallet(added, added.wallets[0].id);
    expect(removed.lastUnlockAt).toBe(4242);
  });

  it('validateContainer rejects a non-number lastUnlockAt', () => {
    expect(() => validateContainer({ ...base, lastUnlockAt: 'nope' })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/wallet-core/__tests__/multivault.test.js -t lastUnlockAt`
Expected: FAIL — `withLastUnlockAt` is not exported / field not carried.

- [ ] **Step 3: Implement in `multiVault.js`**

(a) `makeContainer` — add a third param and attach when present (mirror `actionPassword`):

```js
function makeContainer(wallets, actionPassword, lastUnlockAt) {
  const c = {
    vlt: MULTI_VAULT_TAG,
    v: CONTAINER_VERSION,
    wallets: wallets.map((w) => ({ id: w.id, mnemonic: w.mnemonic })),
  };
  if (actionPassword != null) c.actionPassword = actionPassword;
  // Optional last-successful-unlock timestamp (epoch ms). Like actionPassword it
  // lives INSIDE the encrypted container (so its presence is not an on-disk tell)
  // and is attached ONLY when set, so a container without it serialises byte-
  // identically to before. Primary-set only — decoy/hidden are never persisted.
  if (lastUnlockAt != null) c.lastUnlockAt = lastUnlockAt;
  return c;
}
```

(b) `parseVault` — carry it through the normalise call (the `isMultiContainer` branch):

```js
    return {
      container: makeContainer(parsed.wallets, parsed.actionPassword, parsed.lastUnlockAt),
      migrated: false,
    };
```

(c) `validateContainer` — reject a malformed value (after the `actionPassword` check, before `return true`):

```js
  if (container.lastUnlockAt != null && typeof container.lastUnlockAt !== 'number') {
    throw new Error('Container has a malformed lastUnlockAt');
  }
```

(d) `serializeContainer` — write it when present (after the `actionPassword` line):

```js
  if (container.lastUnlockAt != null) out.lastUnlockAt = container.lastUnlockAt;
```

(e) `addWallet` (the `makeContainer(...)` call) — thread it:

```js
  const next = makeContainer([...container.wallets, { id, mnemonic }], container.actionPassword, container.lastUnlockAt);
```

(f) `removeWallet` (the `makeContainer(...)` call) — thread it:

```js
  return makeContainer(container.wallets.filter((w) => w.id !== walletId), container.actionPassword, container.lastUnlockAt);
```

(g) Add the exported pure helper (near `getActionPasswordRecord`):

```js
/**
 * Return a NEW container with the last-successful-unlock timestamp set. Pure;
 * does not mutate the input. The timestamp is a SET-level field (per unlock
 * identity), independent of which wallet is active.
 * @param {object} container
 * @param {number} ts epoch ms
 * @returns {object}
 */
export function withLastUnlockAt(container, ts) {
  return makeContainer(container.wallets, container.actionPassword, ts);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/wallet-core/__tests__/multivault.test.js`
Expected: PASS (new `lastUnlockAt` tests + all existing multivault tests).

- [ ] **Step 5: Commit**

```bash
git add src/wallet-core/multiVault.js src/wallet-core/__tests__/multivault.test.js
git commit -m "feat(last-unlock): optional lastUnlockAt field on the multi-seed container"
```

---

## Task 2: `formatUnlockTime` pure display helper

**Files:**
- Create: `src/lib/formatUnlockTime.js`
- Test: `src/lib/__tests__/formatUnlockTime.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/formatUnlockTime.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { formatUnlockTime } from '../formatUnlockTime.js';

describe('formatUnlockTime', () => {
  it('returns the first-open copy when there is no prior value', () => {
    expect(formatUnlockTime(null)).toBe('First open on this device');
    expect(formatUnlockTime(undefined)).toBe('First open on this device');
  });

  it('formats a mid-year timestamp to a non-empty string containing the year', () => {
    // 2026-06-14T12:00:00Z — safely mid-year so the year is 2026 in every timezone.
    const out = formatUnlockTime(Date.UTC(2026, 5, 14, 12, 0, 0));
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('2026');
  });

  it('treats a non-number as no value (fail safe)', () => {
    expect(formatUnlockTime('1750000000000')).toBe('First open on this device');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/formatUnlockTime.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/formatUnlockTime.js`**

```js
// Pure display helper for the last-successful-unlock tamper signal.
// Shows an absolute local date+time the owner can recognise (or not). Returns a
// first-open string when there is no prior value — we never fabricate a time.

/**
 * @param {number|null|undefined} ts epoch ms of the previous successful unlock
 * @returns {string}
 */
export function formatUnlockTime(ts) {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) {
    return 'First open on this device';
  }
  // Absolute local date + time. Local (not UTC) so the owner recognises the
  // wall-clock moment they last opened the wallet.
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/formatUnlockTime.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/formatUnlockTime.js src/lib/__tests__/formatUnlockTime.test.js
git commit -m "feat(last-unlock): formatUnlockTime display helper"
```

---

## Task 3: WalletProvider — write at unlock + expose on context

**Files:**
- Modify: `src/lib/WalletProvider.jsx`

No new unit test: the repo has no React component/hook test harness (verified in the audit-log work). The pure logic is covered by Tasks 1–2; this task is provider glue, verified by the full suite staying green + build.

- [ ] **Step 1: Add `lastUnlockAt` state**

Near the other `useState` declarations (e.g. by `isDecoy`/`isHidden` around line 206–213), add:

```js
  // Last SUCCESSFUL unlock timestamp (epoch ms) of the PREVIOUS primary unlock,
  // read from the container at unlock and shown to the owner as a tamper signal.
  // null in decoy/hidden/first-open. Primary-session only (deniability I3).
  const [lastUnlockAt, setLastUnlockAt] = useState(null);
```

- [ ] **Step 2: Write the stamp in the primary branch of `unlock()`**

In `unlock()`, replace the body of the `if (isPrimary) {` block (currently lines ~1135–1156) with the version below. It (a) captures the previous value for display, (b) stamps a new container, (c) folds the stamp into the migration re-encrypt when migrating or fires a best-effort async persist otherwise, and (d) uses the stamped container everywhere downstream:

```js
    if (isPrimary) {
      // Capture the PREVIOUS unlock time for display (read for free — already
      // decrypted), then stamp NOW onto the container for next time.
      const prevLastUnlock = container.lastUnlockAt ?? null;
      setLastUnlockAt(prevLastUnlock);
      const stamped = mv.withLastUnlockAt(container, Date.now());
      containerRef.current = stamped; // so in-session mutations carry it forward

      // LOSSLESS SINGLE-SEED -> MULTI-SEED MIGRATION (unchanged) — but persist the
      // STAMPED container so migration + last-unlock are ONE write, not two.
      if (migrated) {
        const firstId = mv.listWalletIds(stamped)[0];
        ensureWalletMeta(firstId, { name: 'Wallet 1', backedUp: true, enabledAssets: [...ALL_ASSET_SYMBOLS] });
        try { await keyStore.createVault(mv.serializeContainer(stamped), password); }
        catch { /* best-effort; retried next unlock */ }
      } else {
        // Persist the new last-unlock stamp. Best-effort + async: a failed write
        // never blocks unlock and can only lose a timestamp (IndexedDB put at key
        // 'primary' is atomic; the prior blob is retained on failure).
        void keyStore.createVault(mv.serializeContainer(stamped), password).catch(() => {});
      }
      const { activeWalletId: active } = reconcileWalletMeta(mv.listWalletIds(stamped));
      activeIdRef.current = active;
      setIsDecoy(false);
      setIsHidden(false);
      refreshWalletsState();
      refreshPortfoliosState();
    } else {
```

- [ ] **Step 3: Reset `lastUnlockAt` in the decoy/hidden branch**

In the `else {` branch of the same `if (isPrimary)` (the decoy/hidden block), add near its other `setIsDecoy/​setIsHidden` calls:

```js
      setLastUnlockAt(null); // never surface a last-unlock in a decoy/hidden session
```

- [ ] **Step 4: Reset in `lock()`, `createWallet`, `importWallet`**

In `lock()` (near `setIsDecoy(false); setIsHidden(false);`, ~line 382), add:

```js
    setLastUnlockAt(null);
```

In `createWallet` and `importWallet` (each near their `setUnlocked(true)`), add the same line so a brand-new wallet shows "First open":

```js
    setLastUnlockAt(null);
```

- [ ] **Step 5: Expose on the context `value`**

In the `value` object (around line 1552, near `setAutoLockTimeout,`), add:

```js
    // Last successful unlock (previous primary unlock; null in decoy/hidden/first
    // open). Shown read-only on the Security Dashboard as a tamper signal.
    lastUnlockAt,
```

- [ ] **Step 6: Run the full suite + build**

Run: `npx vitest run`
Expected: PASS (all existing + Tasks 1–2).
Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/WalletProvider.jsx
git commit -m "feat(last-unlock): record + expose last-successful-unlock (primary session only)"
```

---

## Task 4: Security Dashboard — "Last opened" row

**Files:**
- Modify: `src/pages/SecurityDashboard.jsx`

- [ ] **Step 1: Import the helper and an icon**

Add the import near the other `@/lib` imports:

```js
import { formatUnlockTime } from "@/lib/formatUnlockTime";
```

Add `History` to the existing `lucide-react` import list (the line that imports `Shield, ShieldAlert, ...`).

- [ ] **Step 2: Render the row**

`const wallet = useWallet();` already exists (line 87). Add this block immediately AFTER the closing `</div>` of the "Protections" section (the `<div>` that contains `<h2>Protections</h2>`, ending around line 252) and BEFORE the "What your PIN protects" `<Link>`:

```jsx
      {/* Last opened — a deniability-clean tamper signal. Primary-session only;
          null shows "First open on this device". IBM Plex Mono for the value. */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
        <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <History className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">Last opened</span>
          <p className="text-xs text-muted-foreground font-mono mono-value">
            {formatUnlockTime(wallet.lastUnlockAt)}
          </p>
        </div>
      </div>
```

- [ ] **Step 3: Run the suite + build**

Run: `npx vitest run`
Expected: PASS.
Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/pages/SecurityDashboard.jsx
git commit -m "feat(last-unlock): show Last opened tamper signal on the Security Dashboard"
```

---

## Task 5: Update Feature-Status doc

**Files:**
- Modify: `docs/Feature-Status.md`

- [ ] **Step 1: Update the §6 last-unlock line**

In `docs/Feature-Status.md` §6, the "Login activity (+ map)" line currently says the best-of-breed successor ("last successful unlock" timestamp) is "specced, NOT built". Update that clause to:

```
- Login activity (+ map) — ❌ original (backend/map) out of scope. Best-of-breed successor BUILT:
  "last successful unlock" timestamp — 🟡 BUILT / UNAUDITED-PROVISIONAL. Stored in-vault on the primary
  container (`lastUnlockAt`, written at unlock via a best-effort re-encrypt), primary-session only
  (decoy/hidden never read or write it → no credential/hidden-set tell), destroyed by panic wipe for free,
  shown read-only on the Security Dashboard as a tamper signal (`formatUnlockTime`). No new blob, no new
  crypto. See `docs/superpowers/specs/2026-06-16-last-unlock-timestamp-design.md`.
```

(Keep the surrounding S3 decision note intact; only the successor's status changes from specced to BUILT.)

- [ ] **Step 2: Commit**

```bash
git add docs/Feature-Status.md
git commit -m "docs(last-unlock): record last-successful-unlock timestamp as BUILT"
```

---

## Final verification

- [ ] **Run the whole suite**

Run: `npx vitest run`
Expected: PASS — all prior tests + new `multivault.test.js` cases + `formatUnlockTime.test.js`.

- [ ] **Build**

Run: `npm run build`
Expected: succeeds, no import errors.

- [ ] **Optional dev smoke (manual)**

In a dev/demo primary session: unlock, open the Security Dashboard → "Last opened" shows "First open on this device" the first time; lock and unlock again → it shows the previous unlock's date+time. Confirm a decoy/duress unlock shows "First open" (never a real timestamp). This is a sanity check, not a gate; the suite is the gate.

---

## Notes / invariants honored

- **Deniability (I3):** primary-only; decoy/hidden never read or write `lastUnlockAt`; no new blob → no count/size oracle; the value rides inside the already-existing primary vault blob.
- **Panic wipe:** the value is destroyed for free with the primary vault blob (no separate cleanup).
- **Fail-safe (I4):** the persist is best-effort/async — a write failure degrades to "First open", never blocks unlock, and can never corrupt the seed blob (atomic put; old blob retained).
- **No fake security:** a real encrypted-at-rest timestamp, shown honestly; "First open" is shown when there genuinely is no prior value.
- **Honest status:** surfaced, BUILT / UNAUDITED-PROVISIONAL; no on-chain artifact → not "verified". Not audit-gated (a single field in the already-audited container, same class as `actionPassword`).
