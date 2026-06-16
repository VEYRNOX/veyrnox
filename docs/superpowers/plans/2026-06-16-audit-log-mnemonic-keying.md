# Audit-log Mnemonic-keying + Primary-session Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-key the audit-log primitive off the in-memory primary mnemonic (HKDF) instead of the vault password, then wire it into the call sites that actually exist, so passive events can be logged without the password WalletProvider deliberately does not retain.

**Architecture:** A pure, unit-testable helper `auditSecretForSession({isDecoy, isHidden, primaryMnemonic})` in `auditLog.js` holds BOTH the decoy/hidden hard-off gate AND the HKDF key derivation (this codebase has **no React component/hook test harness**, so the security-critical logic must live in a pure function, not inline in the provider). `recordAuditEvent`/`readAuditLog` swap their `password` param for that derived `auditSecret`. WalletProvider exposes a thin `recordAudit(type)` glue method; real call sites (`send_completed`, `approval_revoked`, `settings_changed`) call it. `approval_granted` stays allowlisted-but-unwired (the app has no allowance-grant flow).

**Tech Stack:** JS (ESM), Vitest, `@noble/hashes` (hkdf + sha256, already a dependency), existing `vault.js` Argon2id+AES-GCM (reused verbatim), React context (`WalletProvider`).

**Spec:** `docs/superpowers/specs/2026-06-16-audit-log-mnemonic-keying-design.md`

**Note on a spec refinement discovered in planning:** the spec placed the gate inline in the provider. Because there is no component test harness, this plan extracts the gate+keying into the pure `auditSecretForSession` helper so it is fully unit-testable. Behaviour is identical to the spec; only the location of the gate changed.

---

## File Structure

- `src/wallet-core/auditLog.js` — **modify.** Add `deriveAuditSecret` + `auditSecretForSession` pure helpers; rename the `password` param of `recordAuditEvent`/`readAuditLog`/`readEntries` to `auditSecret` (the value is now an HKDF output, not a password); document `approval_granted` as intentionally unwired.
- `src/wallet-core/__tests__/audit-secret.test.js` — **create.** Unit tests for the two new pure helpers.
- `src/wallet-core/__tests__/audit-log.test.js` — **unchanged** (the param rename is transparent: the tests already pass a string secret).
- `src/lib/WalletProvider.jsx` — **modify.** Import the helpers; add the `recordAudit(type)` callback; expose it on the context value.
- `src/pages/SendCrypto.jsx` — **modify.** Emit `send_completed` in the send mutation's `onSuccess`.
- `src/pages/TokenApprovals.jsx` — **modify.** Emit `approval_revoked` in the revoke mutation's `onSuccess`, real-broadcast branch only.
- `src/components/security/SessionSettings.jsx`, `BiometricUnlockSettings.jsx`, `TwoFactorSettings.jsx`, `src/pages/Settings.jsx` — **modify.** Emit `settings_changed` from each key settings mutation.
- `docs/Feature-Status.md` — **modify.** Flip the §7 audit-log "WIRING BLOCKED" note to reflect the primary-session wiring landing (multi-set storage shape stays audit-gated).

---

## Task 1: Pure helpers — `deriveAuditSecret` + `auditSecretForSession`

**Files:**
- Modify: `src/wallet-core/auditLog.js`
- Test: `src/wallet-core/__tests__/audit-secret.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `src/wallet-core/__tests__/audit-secret.test.js`:

```js
// Unit tests for the audit-log key-derivation + session gate (pure helpers).
import { describe, it, expect } from 'vitest';
import { deriveAuditSecret, auditSecretForSession } from '../auditLog.js';

const M1 = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const M2 = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';

describe('deriveAuditSecret', () => {
  it('is deterministic for one mnemonic and 32 bytes of hex', () => {
    const a = deriveAuditSecret(M1);
    const b = deriveAuditSecret(M1);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex
  });

  it('differs across mnemonics', () => {
    expect(deriveAuditSecret(M1)).not.toBe(deriveAuditSecret(M2));
  });

  it('throws on an empty/invalid mnemonic', () => {
    expect(() => deriveAuditSecret('')).toThrow();
    expect(() => deriveAuditSecret(undefined)).toThrow();
  });
});

describe('auditSecretForSession (decoy/hidden hard-off gate)', () => {
  it('returns the derived secret in a primary session', () => {
    expect(auditSecretForSession({ isDecoy: false, isHidden: false, primaryMnemonic: M1 }))
      .toBe(deriveAuditSecret(M1));
  });

  it('returns null in a decoy session', () => {
    expect(auditSecretForSession({ isDecoy: true, isHidden: false, primaryMnemonic: M1 })).toBeNull();
  });

  it('returns null in a hidden session', () => {
    expect(auditSecretForSession({ isDecoy: false, isHidden: true, primaryMnemonic: M1 })).toBeNull();
  });

  it('returns null when there is no mnemonic', () => {
    expect(auditSecretForSession({ isDecoy: false, isHidden: false, primaryMnemonic: undefined })).toBeNull();
    expect(auditSecretForSession({ isDecoy: false, isHidden: false, primaryMnemonic: '' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/wallet-core/__tests__/audit-secret.test.js`
Expected: FAIL — `deriveAuditSecret`/`auditSecretForSession` are not exported.

- [ ] **Step 3: Add the helpers to `auditLog.js`**

At the top of `src/wallet-core/auditLog.js`, add to the imports (just after the existing `import { encryptVault, decryptVault } from './vault.js';`):

```js
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
```

Then add these exports near the top of the module (e.g. just below the `AUDIT_LOG_PREF_KEY` export):

```js
// HKDF domain-separation label for the audit-log key. Bumping this rotates the
// key (and orphans any prior blob) — there is none in the wild (feature never
// shipped enabled/surfaced), so v1 is the first and only version.
const AUDIT_HKDF_INFO = 'veyrnox-audit-v1';

/**
 * Derive the audit-log encryption secret from the primary mnemonic.
 * HKDF-SHA256 gives domain separation (this key cannot collide with any other
 * use of the raw seed) and a high-entropy input; the raw mnemonic never crosses
 * the auditLog read/write API. Returns 32 bytes as a hex string, fed to
 * encryptVault/decryptVault exactly where the password used to go.
 * @param {string} primaryMnemonic the unlocked primary set's first-wallet seed
 * @returns {string} 64-char hex secret
 */
export function deriveAuditSecret(primaryMnemonic) {
  if (typeof primaryMnemonic !== 'string' || primaryMnemonic.length === 0) {
    throw new Error('deriveAuditSecret requires a non-empty mnemonic');
  }
  const ikm = utf8ToBytes(primaryMnemonic);
  return bytesToHex(hkdf(sha256, ikm, undefined /* salt */, AUDIT_HKDF_INFO, 32));
}

/**
 * The single gate that decides whether — and under what key — an audit event may
 * be recorded this session. Returns null (record NOTHING) in a decoy/hidden
 * session (the D1–D7 multi-set storage shape is audit-gated, so logging runs in
 * the primary session ONLY) or when no mnemonic is resident. Otherwise returns
 * the derived secret. Pure + side-effect-free so it is unit-testable without a
 * React render harness.
 * @param {{isDecoy:boolean, isHidden:boolean, primaryMnemonic:string|null|undefined}} session
 * @returns {string|null}
 */
export function auditSecretForSession({ isDecoy, isHidden, primaryMnemonic }) {
  if (isDecoy || isHidden) return null;
  if (typeof primaryMnemonic !== 'string' || primaryMnemonic.length === 0) return null;
  return deriveAuditSecret(primaryMnemonic);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/wallet-core/__tests__/audit-secret.test.js`
Expected: PASS (all 7 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/wallet-core/auditLog.js src/wallet-core/__tests__/audit-secret.test.js
git commit -m "feat(audit-log): HKDF key derivation + decoy/hidden session gate (pure helpers)"
```

---

## Task 2: Re-key `recordAuditEvent` / `readAuditLog` (param rename)

**Files:**
- Modify: `src/wallet-core/auditLog.js`
- Test: `src/wallet-core/__tests__/audit-log.test.js` (existing — must stay green unchanged)

- [ ] **Step 1: Confirm the existing suite is green before the rename**

Run: `npx vitest run src/wallet-core/__tests__/audit-log.test.js`
Expected: PASS (the param is a string either way; this is the baseline).

- [ ] **Step 2: Rename `password` → `auditSecret` in the three functions**

In `src/wallet-core/auditLog.js`, rename the parameter (the value is now an HKDF output, not a password) in `readEntries`, `recordAuditEvent`, and `readAuditLog`. The bodies are otherwise unchanged — `auditSecret` is passed to `encryptVault`/`decryptVault` exactly where `password` was.

`readEntries`:
```js
async function readEntries(db, auditSecret) {
  const blob = await getKey(db, AUDIT_KEY);
  if (!blob) return [];
  const json = await decryptVault(blob, auditSecret); // throws on wrong secret
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
```

`recordAuditEvent` signature + the two internal uses:
```js
export async function recordAuditEvent(type, auditSecret) {
  if (!isAuditLogEnabled()) return;
  if (!isLoggableType(type)) return;
  if (typeof auditSecret !== 'string' || auditSecret.length === 0) return;

  const db = await openDb();
  try {
    const entries = await readEntries(db, auditSecret);
    entries.push({ type, ts: Date.now() });
    const trimmed = entries.slice(-MAX_ENTRIES);
    const blob = await encryptVault(JSON.stringify(trimmed), auditSecret);
    if (typeof blob !== 'object' || !blob.ct || !blob.iv || !blob.salt) {
      throw new Error('Refusing to store: not a valid encrypted vault blob');
    }
    await putKey(db, AUDIT_KEY, blob);
  } finally {
    db.close();
  }
}
```

`readAuditLog`:
```js
export async function readAuditLog(auditSecret) {
  const db = await openDb();
  try {
    return await readEntries(db, auditSecret);
  } finally {
    db.close();
  }
}
```

Also update the JSDoc `@param {string} password` lines to `@param {string} auditSecret the HKDF-derived audit key (see deriveAuditSecret)`.

- [ ] **Step 3: Document `approval_granted` as intentionally unwired**

In `auditLog.js`, append a sentence to the `ALLOWED_EVENT_TYPES` comment block:

```js
// NOTE: 'approval_granted' is allowlisted but has NO call site — the app only
// VIEWS and REVOKES ERC-20 allowances (TokenApprovals.jsx), there is no
// allowance-grant flow to emit it. It stays on the list so a future grant flow
// can use it without re-touching the primitive.
```

- [ ] **Step 4: Run the existing suite to verify it still passes**

Run: `npx vitest run src/wallet-core/__tests__/audit-log.test.js`
Expected: PASS (unchanged — the rename is transparent to callers passing a string).

- [ ] **Step 5: Commit**

```bash
git add src/wallet-core/auditLog.js
git commit -m "refactor(audit-log): rename password param to auditSecret; document approval_granted as unwired"
```

---

## Task 3: WalletProvider `recordAudit(type)` glue + context exposure

**Files:**
- Modify: `src/lib/WalletProvider.jsx`

No new unit test: there is no React component/hook test harness in this repo (verified — no `@testing-library/react`). The security-critical logic is already covered by Task 1's pure-helper tests; this task is thin glue, verified by the full suite staying green and by preview.

- [ ] **Step 1: Import the helpers**

Add to the imports in `src/lib/WalletProvider.jsx` (near the other `@/wallet-core/*` imports):

```js
import { recordAuditEvent, auditSecretForSession } from '@/wallet-core/auditLog';
```

- [ ] **Step 2: Add the `recordAudit` callback**

Place this near the other `useCallback` definitions, before the `value` object (which ends at the `};` around line 1553). `isDecoy`/`isHidden` are state in this component; `containerRef` holds the unlocked container `{ wallets: [{ id, mnemonic }] }`:

```js
// AUDIT LOG (S4, opt-in, PROVISIONAL). Thin glue over auditLog.js. The gate +
// key derivation live in the pure auditSecretForSession helper: it returns null
// (record nothing) in a decoy/hidden session or when locked. A logging failure
// must NEVER break the user's actual action, so the whole thing is best-effort.
const recordAudit = useCallback(async (type) => {
  try {
    const secret = auditSecretForSession({
      isDecoy,
      isHidden,
      primaryMnemonic: containerRef.current?.wallets?.[0]?.mnemonic,
    });
    if (!secret) return;
    await recordAuditEvent(type, secret);
  } catch {
    /* non-security-critical aid — swallow (I4-style fail-safe for a convenience) */
  }
}, [isDecoy, isHidden]);
```

- [ ] **Step 3: Expose it on the context `value`**

In the `value` object (the one returned to `<WalletCtx.Provider value={value}>`), add a line near the other action methods (e.g. after `setAutoLockTimeout,` at ~line 1552):

```js
    // AUDIT LOG (opt-in, unsurfaced). recordAudit(type) logs an allowlisted
    // benign event in the PRIMARY session only; no-op in decoy/hidden or when the
    // user hasn't opted in. See wallet-core/auditLog.js.
    recordAudit,
```

- [ ] **Step 4: Run the full suite + build to verify nothing broke**

Run: `npx vitest run`
Expected: PASS (all existing tests + Task 1's new file).
Run: `npm run build`
Expected: build succeeds (no import/type errors).

- [ ] **Step 5: Commit**

```bash
git add src/lib/WalletProvider.jsx
git commit -m "feat(audit-log): expose recordAudit(type) from WalletProvider (primary-session, gated)"
```

---

## Task 4: Wire `send_completed` in SendCrypto

**Files:**
- Modify: `src/pages/SendCrypto.jsx`

- [ ] **Step 1: Add `recordAudit` to the `useWallet()` destructure**

At `src/pages/SendCrypto.jsx:82`, add `recordAudit` to the destructured list:

```js
  const { isUnlocked, wallets, activeWalletId, switchWallet, accounts, btcAccount, solAccount, withPrivateKey, withBtcPrivateKey, withSolPrivateKey, lock, verifyActiveCredential, isSendReauthRequired, actionPasswordConfigured, verifyActionPassword, recordAudit } = useWallet();
```

- [ ] **Step 2: Emit the event in the send mutation's `onSuccess`**

In the send `useMutation`, the `onSuccess` handler is at `src/pages/SendCrypto.jsx:648`. Add the `recordAudit` call after `setStep("done");`:

```js
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["evm-balance", networkKey, selectedWallet?.address] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setTxResult(result);
      setStep("done");
      recordAudit("send_completed"); // opt-in audit log; no-op unless enabled + primary session
    },
```

- [ ] **Step 3: Run the suite + build**

Run: `npx vitest run`
Expected: PASS.
Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/pages/SendCrypto.jsx
git commit -m "feat(audit-log): record send_completed after a successful send"
```

---

## Task 5: Wire `approval_revoked` in TokenApprovals (real branch only)

**Files:**
- Modify: `src/pages/TokenApprovals.jsx`

- [ ] **Step 1: Emit the event in the revoke mutation's `onSuccess`, gated on a real broadcast**

`TokenApprovals.jsx` already has `const wallet = useWallet();` (line 41). The revoke mutation returns `{ simulated: true|false, ... }`. Update its `onSuccess` (line 88) to record ONLY when a real (non-demo) revoke broadcast:

```js
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["token-approvals"] });
      if (!r.simulated) wallet.recordAudit("approval_revoked"); // real testnet revoke only
    },
```

- [ ] **Step 2: Run the suite + build**

Run: `npx vitest run`
Expected: PASS.
Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/TokenApprovals.jsx
git commit -m "feat(audit-log): record approval_revoked after a real revoke broadcast"
```

---

## Task 6: Wire `settings_changed` in the key settings components

**Files:**
- Modify: `src/components/security/SessionSettings.jsx`
- Modify: `src/components/security/BiometricUnlockSettings.jsx`
- Modify: `src/components/security/TwoFactorSettings.jsx`
- Modify: `src/pages/Settings.jsx`

`recordAudit` is internally gated (no-op in decoy/hidden and when the user hasn't opted in), so each call site is a one-liner with no extra guard.

- [ ] **Step 1: SessionSettings — auto-lock timeout change**

`SessionSettings.jsx:25` destructures `useWallet()`. Add `recordAudit`:

```js
  const { isUnlocked, lock, autoLockValue, setAutoLockTimeout, recordAudit } = useWallet();
```

At line 77, update the timeout button's `onClick`:

```js
                onClick={() => { setAutoLockTimeout(opt.value); recordAudit('settings_changed'); }}
```

- [ ] **Step 2: BiometricUnlockSettings — enable/disable toggle**

`BiometricUnlockSettings.jsx:24` destructures `useWallet()`. Add `recordAudit`:

```js
  const { biometricPreview, disableBiometricUnlock, recordAudit } = useWallet();
```

In `onToggle` (the handler around lines 36–44), add the record after the persist branch completes. The handler currently calls `setEnabled(v)` then persists. Add `recordAudit('settings_changed');` as the last line of the handler body:

```js
    setEnabled(v);
    if (v) {
      setBiometricUnlockEnabled(true); // persist immediately
    } else {
      disableBiometricUnlock();
    }
    recordAudit('settings_changed');
```

(Match the existing branch structure; the only addition is the final `recordAudit('settings_changed');`.)

- [ ] **Step 3: TwoFactorSettings — action-password set/clear and passkey toggle**

`TwoFactorSettings.jsx` destructures `useWallet()` ending at line 41. Add `recordAudit` to that destructure.

In `handleSetActionPassword` (success path, after line 59 `toast.success(...)`):

```js
      await setActionPassword(apVaultPw, apNew);
      resetApForm();
      toast.success(actionPasswordConfigured ? 'Action Password changed' : 'Action Password set');
      recordAudit('settings_changed');
```

In `handleClearActionPassword` (success path, after line 71 `toast.success('Action Password removed')`):

```js
      await clearActionPassword(apVaultPw);
      resetApForm();
      toast.success('Action Password removed');
      recordAudit('settings_changed');
```

In `togglePasskey2fa` (after line 88 `toast.success(...)`):

```js
    set2faPasskeyEnabled(on);
    setPasskey2fa(on);
    toast.success(on ? 'Passkey second factor on' : 'Passkey second factor off');
    recordAudit('settings_changed');
```

- [ ] **Step 4: Settings.jsx — theme toggle**

`Settings.jsx:20` destructures `const { lock } = useWallet();`. Add `recordAudit`:

```js
  const { lock, recordAudit } = useWallet();
```

At line 92, update the theme switch's `onCheckedChange`:

```js
            onCheckedChange={(checked) => { setTheme(checked ? 'dark' : 'light'); recordAudit('settings_changed'); }}
```

- [ ] **Step 5: Run the suite + build**

Run: `npx vitest run`
Expected: PASS (no behavioural change to existing tests).
Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/security/SessionSettings.jsx src/components/security/BiometricUnlockSettings.jsx src/components/security/TwoFactorSettings.jsx src/pages/Settings.jsx
git commit -m "feat(audit-log): record settings_changed from key settings mutations"
```

---

## Task 7: Update Feature-Status doc

**Files:**
- Modify: `docs/Feature-Status.md`

- [ ] **Step 1: Update the §7 audit-log line**

In `docs/Feature-Status.md` §7, the audit-log bullet currently says the primitive is "UNWIRED & not surfaced" and "WIRING BLOCKED". Update it to reflect that primary-session wiring landed while the multi-set storage shape stays audit-gated. Replace the status with:

```
- Audit log (opt-in, deniability-safe) — 🟡 BUILT / UNAUDITED-PROVISIONAL, primary-session wiring done,
  still UNSURFACED. The keying blocker is resolved: the log is now keyed off an HKDF of the primary
  mnemonic (`deriveAuditSecret`) via the pure `auditSecretForSession` gate, which records in the PRIMARY
  session only (decoy/hidden hard-off) — so WalletProvider no longer needs the password it deliberately
  doesn't retain. Wired into send_completed (SendCrypto), approval_revoked (TokenApprovals, real revoke
  only), and settings_changed (session / biometric / 2FA / theme). approval_granted stays allowlisted but
  unwired (no grant flow exists). STILL audit-gated: the D1–D7 multi-set storage shape (decoy/hidden each
  keeping an own log without a real-vs-decoy distinguisher) and any UI surfacing — nothing is surfaced;
  the featureCatalogue guard still enforces that. No on-chain artifact → not "verified".
```

Also update the §7 "Decision note — S4 completion status" audit-log line from "built but WIRING BLOCKED" to "primary-session wiring done; multi-set storage shape + surfacing still audit-gated".

- [ ] **Step 2: Commit**

```bash
git add docs/Feature-Status.md
git commit -m "docs(audit-log): record primary-session wiring landed; multi-set shape stays audit-gated"
```

---

## Final verification

- [ ] **Run the whole suite once more**

Run: `npx vitest run`
Expected: PASS — all prior tests + `audit-secret.test.js` (7 new assertions). Confirm `audit-log.test.js` (11 tests) still green.

- [ ] **Build**

Run: `npm run build`
Expected: succeeds, no DCE/import errors.

- [ ] **Optional dev smoke (manual, demo mode)**

Because the feature is unsurfaced and OFF by default, exercise it from the console in a dev/demo session: `localStorage.setItem('veyrnox-audit-log','1')`, perform a send, then in the console import-and-read isn't available — instead confirm a `quaternary` blob appears in the `veyrnox-vault` IndexedDB store and is byte-shaped like the others. This is a sanity check, not a gate; the suite is the gate. Do NOT surface a UI toggle (audit-gated).

---

## Notes / invariants honored

- **No fake security:** the gate is a real pure function with real tests; nothing is mocked to look real.
- **Deniability (I3):** decoy/hidden sessions record nothing (`auditSecretForSession` returns null); the existing hard denylist still refuses every duress/stealth/hidden/panic/decoy/seed event.
- **Honest status:** wired but UNSURFACED; caps at BUILT/UNAUDITED-PROVISIONAL; the D1–D7 multi-set storage shape remains audit-gated and out of scope.
- **Fail-safe:** a logging failure never breaks the user's action (best-effort try/catch).
