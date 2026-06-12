# Send-time step-up re-auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the structurally-unsatisfiable passkey/OTP send gate with a step-up re-auth that re-verifies the existing vault credential before signing — but only once a short recent-auth window has lapsed.

**Architecture:** Two new pure modules (a credential verifier reusing the vault KDF, and a pure recent-auth-window helper) wired into `WalletProvider` (capture a per-session salted verifier at unlock; expose `verifyActiveCredential` + `isSendReauthRequired`; clear on `lock`). `SendCrypto`'s verify step branches: within the window → plain Confirm & Send; lapsed → step-up prompt (PinPad/password) → `verifyActiveCredential` → `sendTx.mutate()`. The verifier NEVER calls `unlock()`, so it can't trigger panic/decoy. Behaves identically in real and decoy sessions.

**Tech Stack:** React, `hash-wasm` Argon2id (`KDF_PARAMS` from `wallet-core/vault.js`), WebCrypto, vitest.

**Spec:** `docs/superpowers/specs/2026-06-11-send-stepup-reauth-design.md`

**Known cost (accept for v1):** capturing the verifier adds one Argon2id (~the unlock KDF cost) to each `unlock()`. This keeps the verifier path-agnostic (same for real/decoy → deniability stays simple). Future optimization (derive cheaply from the unlock's existing Argon2 output) is out of scope; note it, don't build it.

**Confirmation #4 — manage the unlock-time KDF memory (Defect-A).** The verifier KDF makes **two sequential 192 MiB Argon2id derivations at `unlock()`** (vault decrypt + verifier). That is the precise pattern that caused the Defect-A `RangeError` in onboarding. `deriveRaw` in Task 1 **must** yield (`setTimeout 0`) between derivations so each WASM instance GCs before the next allocates (mirrors `vault.js` `deriveKey`) — never run them concurrently/back-to-back without the yield. Manual verification (Task 5) **must include a mobile-like / memory-constrained run**, not just the dev box.

---

## File Structure

- **Create** `src/wallet-core/credentialVerifier.js` — `createCredentialVerifier`, `verifyCredential`, `constantTimeEqual`. Reuses `KDF_PARAMS`. One responsibility: hash/verify a credential at the vault KDF cost. No React, no session state.
- **Create** `src/wallet-core/__tests__/credentialVerifier.test.js`
- **Create** `src/lib/sendReauth.js` — `REAUTH_WINDOW_MS`, `sendReauthRequired(...)`. Pure window math.
- **Create** `src/lib/__tests__/sendReauth.test.js`
- **Modify** `src/lib/WalletProvider.jsx` — refs (`verifierRef`, `lastAuthAtRef`), capture at unlock, clear at lock, `verifyActiveCredential`, `isSendReauthRequired`, context value.
- **Modify** `src/pages/SendCrypto.jsx` — replace the 2FA block with conditional Confirm/step-up; remove passkey/OTP code + state + imports.

No React-component test is added for `WalletProvider`/`SendCrypto` (the repo ships no React Testing Library; logic is extracted into the two pure modules, which are fully tested). This gap is disclosed, not hidden; the `src/` change is verified by the manual testnet send gate (final task).

---

### Task 1: Credential verifier (pure crypto)

**Files:**
- Create: `src/wallet-core/credentialVerifier.js`
- Test: `src/wallet-core/__tests__/credentialVerifier.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/wallet-core/__tests__/credentialVerifier.test.js
import { describe, it, expect } from 'vitest';
import {
  createCredentialVerifier,
  verifyCredential,
  constantTimeEqual,
} from '../credentialVerifier.js';
import { KDF_PARAMS } from '../vault.js';

// Cheap Argon2id params for the behavioural tests (full KDF_PARAMS is 192 MiB and
// slow). The params==unlock guarantee is checked separately and cheaply below.
const CHEAP = Object.freeze({ parallelism: 1, iterations: 1, memorySize: 1024, hashLength: 32 });

describe('constantTimeEqual', () => {
  it('true for identical byte arrays', () => {
    expect(constantTimeEqual(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 3))).toBe(true);
  });
  it('false when the FIRST byte differs (no early-exit short-circuit to true)', () => {
    expect(constantTimeEqual(Uint8Array.of(9, 2, 3), Uint8Array.of(1, 2, 3))).toBe(false);
  });
  it('false when the LAST byte differs (full-length scan)', () => {
    expect(constantTimeEqual(Uint8Array.of(1, 2, 9), Uint8Array.of(1, 2, 3))).toBe(false);
  });
  it('false for different lengths', () => {
    expect(constantTimeEqual(Uint8Array.of(1, 2), Uint8Array.of(1, 2, 3))).toBe(false);
  });
});

describe('createCredentialVerifier / verifyCredential', () => {
  it('verifies the correct credential and rejects a wrong one', async () => {
    const v = await createCredentialVerifier('123456', { params: CHEAP });
    expect(v.salt).toBeInstanceOf(Uint8Array);
    expect(v.salt.length).toBe(16);
    expect(v.hash.length).toBe(32);
    expect(await verifyCredential(v, '123456')).toBe(true);
    expect(await verifyCredential(v, '000000')).toBe(false);
  });

  it('uses a fresh random salt each call', async () => {
    const a = await createCredentialVerifier('pw', { params: CHEAP });
    const b = await createCredentialVerifier('pw', { params: CHEAP });
    expect(constantTimeEqual(a.salt, b.salt)).toBe(false);
  });

  // SPEC test #4 (decoy parity, unit level): the verifier binds to WHATEVER credential
  // created it and never references a "primary". A decoy-opened session therefore
  // verifies the decoy credential and rejects the real one — the property that makes
  // step-up behave identically across session types with no deniability tell.
  it('binds to the captured credential, not any "primary"', async () => {
    const decoyV = await createCredentialVerifier('decoy-pin', { params: CHEAP });
    expect(await verifyCredential(decoyV, 'decoy-pin')).toBe(true);
    expect(await verifyCredential(decoyV, 'real-pin')).toBe(false);
  });

  it('returns false (never throws) when the verifier is null/absent — fail closed', async () => {
    expect(await verifyCredential(null, 'anything')).toBe(false);
    expect(await verifyCredential(undefined, 'anything')).toBe(false);
  });

  // CONFIRMATION #1 (load-bearing): the default verifier params ARE the vault unlock
  // KDF params — never a cheaper set. Runs the real KDF once (~0.5-2s); that's fine.
  it('defaults to the vault KDF_PARAMS (verifier no weaker than the vault)', async () => {
    const v = await createCredentialVerifier('x');
    expect(v.params).toBe(KDF_PARAMS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/wallet-core/__tests__/credentialVerifier.test.js`
Expected: FAIL — `credentialVerifier.js` does not exist / exports undefined.

- [ ] **Step 3: Write minimal implementation**

```js
// src/wallet-core/credentialVerifier.js
//
// Per-session credential verifier for send-time step-up re-auth. Hashes the vault
// credential (PIN/password) at the SAME Argon2id cost as the vault unlock KDF, with a
// fresh random salt, so a captured verifier is no weaker than the vault itself. Pure:
// no session state, no unlock, no deniability machinery — verifyCredential can NEVER
// trigger panic/decoy (that is the load-bearing safety property of the feature).
//
// TESTNET-tier change; UNAUDITED-PROVISIONAL. No network, no signing.

import { argon2id } from 'hash-wasm';
import { KDF_PARAMS } from './vault.js';

const enc = new TextEncoder();

function randomSalt() {
  const s = new Uint8Array(16);
  crypto.getRandomValues(s);
  return s;
}

async function deriveRaw(credential, salt, params) {
  const raw = await argon2id({
    password: enc.encode(String(credential).normalize('NFKC')),
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memorySize,
    hashLength: params.hashLength,
    outputType: 'binary',
  });
  // DEFECT-A memory management (mirrors wallet-core/vault.js deriveKey). At unlock the
  // vault decrypt KDF and THIS verifier KDF run back-to-back; both allocate ~192 MiB in
  // hash-wasm. Yield to a macrotask so this derivation's WASM instance becomes
  // GC-eligible BEFORE the next sequential 192 MiB allocation — without it, that is the
  // exact two-concurrent-192-MiB pattern that caused the Defect-A RangeError in
  // onboarding. Keeps peak memory one-KDF-at-a-time. Negligible latency.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return raw;
}

/**
 * Capture a verifier for `credential`. `params` defaults to the vault unlock
 * KDF_PARAMS — DO NOT pass a cheaper set in production (a reduced-cost hash of a short
 * PIN in memory would be more brute-forceable than the vault). `params` override exists
 * ONLY for fast unit tests.
 * @returns {Promise<{ salt: Uint8Array, hash: Uint8Array, params: object }>}
 */
export async function createCredentialVerifier(credential, { params = KDF_PARAMS } = {}) {
  const salt = randomSalt();
  const hash = await deriveRaw(credential, salt, params);
  return { salt, hash, params };
}

/**
 * True iff `entered` reproduces `verifier.hash` (same salt + params). Constant-time
 * compare. Returns false (never throws) if the verifier is absent — fail closed.
 * @returns {Promise<boolean>}
 */
export async function verifyCredential(verifier, entered) {
  if (!verifier || !verifier.hash || !verifier.salt) return false;
  const h = await deriveRaw(entered, verifier.salt, verifier.params ?? KDF_PARAMS);
  return constantTimeEqual(h, verifier.hash);
}

/**
 * Constant-time byte-array equality: XOR-accumulate over the FULL length, no early
 * return on the first differing byte (avoids a timing side channel).
 */
export function constantTimeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/wallet-core/__tests__/credentialVerifier.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/wallet-core/credentialVerifier.js src/wallet-core/__tests__/credentialVerifier.test.js
git commit -m "feat(send): credential verifier (vault-KDF hash + constant-time compare)"
```

---

### Task 2: Recent-auth window helper (pure)

**Files:**
- Create: `src/lib/sendReauth.js`
- Test: `src/lib/__tests__/sendReauth.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/lib/__tests__/sendReauth.test.js
import { describe, it, expect } from 'vitest';
import { sendReauthRequired, REAUTH_WINDOW_MS } from '../sendReauth.js';

describe('sendReauthRequired', () => {
  it('REAUTH_WINDOW_MS is 2 minutes', () => {
    expect(REAUTH_WINDOW_MS).toBe(2 * 60 * 1000);
  });
  it('false within the window (recently authenticated)', () => {
    const now = 1_000_000;
    expect(sendReauthRequired({ lastAuthAt: now - 60_000, now, windowMs: REAUTH_WINDOW_MS })).toBe(false);
  });
  it('true once the window has lapsed', () => {
    const now = 1_000_000;
    expect(sendReauthRequired({ lastAuthAt: now - 130_000, now, windowMs: REAUTH_WINDOW_MS })).toBe(true);
  });
  it('true when lastAuthAt is null — fail closed', () => {
    expect(sendReauthRequired({ lastAuthAt: null, now: 1_000_000, windowMs: REAUTH_WINDOW_MS })).toBe(true);
  });
  it('exactly at the boundary is NOT required (<=, not <)', () => {
    const now = 1_000_000;
    expect(sendReauthRequired({ lastAuthAt: now - REAUTH_WINDOW_MS, now, windowMs: REAUTH_WINDOW_MS })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/sendReauth.test.js`
Expected: FAIL — `sendReauth.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/sendReauth.js
//
// Pure recent-auth-window math for send-time step-up. A send is friction-free while
// the session was authenticated recently; once the window lapses, step-up is required.
// The window MUST reset only on auth events (unlock / successful step-up), never on
// general activity — see WalletProvider (lastAuthAtRef).

export const REAUTH_WINDOW_MS = 2 * 60 * 1000; // 2 minutes (fixed v1 default)

/**
 * @param {{ lastAuthAt: number|null, now: number, windowMs?: number }} args
 * @returns {boolean} true when step-up re-auth is required before a send.
 */
export function sendReauthRequired({ lastAuthAt, now, windowMs = REAUTH_WINDOW_MS }) {
  if (lastAuthAt == null) return true;
  return now - lastAuthAt > windowMs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/sendReauth.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sendReauth.js src/lib/__tests__/sendReauth.test.js
git commit -m "feat(send): pure recent-auth-window helper"
```

---

### Task 3: Wire the verifier + window into WalletProvider

**Files:**
- Modify: `src/lib/WalletProvider.jsx`

No new automated test (React provider; repo has no RTL — logic lives in the Task 1/2 pure modules). Verified by the final manual send gate.

- [ ] **Step 1: Add imports**

Near the existing wallet-core imports (after line 28, `import { deriveSolAccount } ...`), add:

```js
import { createCredentialVerifier, verifyCredential } from '@/wallet-core/credentialVerifier';
import { sendReauthRequired, REAUTH_WINDOW_MS } from '@/lib/sendReauth';
```

- [ ] **Step 2: Add the refs**

Immediately after `const pendingPinRef = useRef(null);` (line 154), add:

```js
  // SEND STEP-UP RE-AUTH. verifierRef holds a per-session salted Argon2id verifier for
  // whatever credential opened THIS session (real or decoy) — see wallet-core/
  // credentialVerifier.js. lastAuthAtRef is the recent-auth-window clock. Both are refs
  // (never a render snapshot) and are cleared in lock().
  const verifierRef = useRef(null);
  const lastAuthAtRef = useRef(null);
```

- [ ] **Step 3: Clear the refs in lock()**

In `lock()`, immediately after `pendingPinRef.current = null;` (line 351), add:

```js
    verifierRef.current = null;
    lastAuthAtRef.current = null;
```

- [ ] **Step 4: Capture the verifier at the end of unlock()**

In `unlock()`, immediately after `deriveActiveAndAll();` (line 1068, which runs for BOTH the primary and decoy/hidden branches and is still inside the `password` scope), add:

```js
    // STEP-UP capture: a per-session verifier for the credential that opened THIS
    // session (real OR decoy — `password` is whatever the user typed). Path-agnostic by
    // design, so step-up behaves identically across session types (no deniability tell).
    // NOTE: this is one extra Argon2id at unlock (see plan "Known cost").
    // Set the window clock FIRST so it starts at unlock — a (rare) send during the ~1s
    // verifier derivation is then friction-free (within window) and needs no verifier.
    lastAuthAtRef.current = Date.now();
    verifierRef.current = await createCredentialVerifier(password);
```

- [ ] **Step 5: Add the two methods**

Immediately after `setupPin` is defined (it is a `useCallback` ending around line 812 with `}, []);`), add:

```js
  // STEP-UP: verify a re-entered credential against the ACTIVE session's verifier. Never
  // calls unlock()/resolveDeniabilityUnlock — so it can NEVER trigger panic/decoy. A
  // successful verify refreshes the recent-auth window. Returns false (never throws) if
  // there is no session/verifier (fail closed).
  const verifyActiveCredential = useCallback(async (entered) => {
    const ok = await verifyCredential(verifierRef.current, entered);
    if (ok) lastAuthAtRef.current = Date.now();
    return ok;
  }, []);

  // STEP-UP: is re-auth required before a send? True when the recent-auth window has
  // lapsed (or no session). Resets only on unlock + successful verifyActiveCredential.
  const isSendReauthRequired = useCallback(
    () => sendReauthRequired({ lastAuthAt: lastAuthAtRef.current, now: Date.now(), windowMs: REAUTH_WINDOW_MS }),
    [],
  );
```

- [ ] **Step 6: Expose them on the context value**

In the returned context value object, immediately after `clearPendingPin,` (line 1331), add:

```js
    // SEND STEP-UP RE-AUTH (see lib/sendReauth.js + wallet-core/credentialVerifier.js).
    verifyActiveCredential,
    isSendReauthRequired,
```

- [ ] **Step 7: Verify the app still builds and the suite is green**

Run: `npx vitest run && npx eslint src/lib/WalletProvider.jsx`
Expected: existing tests PASS; no new lint errors in `WalletProvider.jsx`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/WalletProvider.jsx
git commit -m "feat(send): capture per-session verifier; expose verifyActiveCredential + isSendReauthRequired"
```

---

### Task 4: Replace the SendCrypto 2FA gate with conditional step-up

**Files:**
- Modify: `src/pages/SendCrypto.jsx`

- [ ] **Step 1: Add imports + provider methods + cohort**

In the `useWallet()` destructure (line 64), add `lock`, `verifyActiveCredential`, `isSendReauthRequired`:

```js
  const { isUnlocked, wallets, activeWalletId, switchWallet, accounts, btcAccount, solAccount, withPrivateKey, lock, verifyActiveCredential, isSendReauthRequired } = useWallet();
```

Add these imports near the other component imports (after line 31, the `DEMO` import):

```js
import PinPad from "@/components/security/PinPad";
import { getAuthModel } from "@/lib/authModel";
```

- [ ] **Step 2: Replace the 2FA state with step-up state**

Replace the block at lines 75-81 (the `// 2FA state` group: `otpCode/otpSent/otpSecret/otpSending/passkeyPending/twoFAMethod`) with:

```js
  // STEP-UP RE-AUTH state (replaces the stranded passkey/OTP 2FA).
  const REAUTH_CAP = 5;
  const [reauthValue, setReauthValue] = useState("");
  const [reauthError, setReauthError] = useState("");
  const [reauthAttempts, setReauthAttempts] = useState(0);
  const [reauthPending, setReauthPending] = useState(false);
```

- [ ] **Step 3: Replace the 2FA handlers**

Replace `verifyPasskey`, `sendOTP`, `verifyOTP`, and `resetVerify` (lines 441-493) with:

```js
  // STEP-UP: verify the re-entered credential, then send. 5 wrong → lock() (fail closed,
  // identical in real and decoy sessions — no lockout tell).
  const submitReauth = async (entered) => {
    if (reauthPending || sendTx.isPending) return;
    setReauthPending(true);
    setReauthError("");
    try {
      const ok = await verifyActiveCredential(entered);
      if (ok) {
        setReauthValue("");
        sendTx.mutate();
        return;
      }
      const n = reauthAttempts + 1;
      setReauthAttempts(n);
      setReauthValue("");
      if (n >= REAUTH_CAP) {
        lock();
        return;
      }
      setReauthError(`Incorrect — try again (${REAUTH_CAP - n} left)`);
    } finally {
      setReauthPending(false);
    }
  };

  const resetVerify = () => {
    setReauthValue(""); setReauthError(""); setReauthAttempts(0); setApprovalAck(false);
  };
```

- [ ] **Step 4: Replace the 2FA UI block**

Replace the entire 2FA region (lines 795-881: the `{/* 2FA method picker */}`, `{/* Passkey in progress */}`, and `{/* OTP flow */}` blocks) with:

```jsx
            {/* STEP-UP RE-AUTH: friction-free within the recent-auth window; re-enter the
                vault credential once it has lapsed. Skipped in demo (fake sends, no vault). */}
            {(() => {
              const reauthRequired = !DEMO && isSendReauthRequired();
              if (!reauthRequired) {
                return (
                  <Button
                    className="w-full gap-2"
                    disabled={blockedByApproval || sendTx.isPending}
                    onClick={() => sendTx.mutate()}
                  >
                    {sendTx.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                    Confirm &amp; Send
                  </Button>
                );
              }
              const authModel = getAuthModel();
              return (
                <div className="space-y-3">
                  <p className="text-xs text-center text-muted-foreground font-medium uppercase tracking-widest">
                    Re-enter your {authModel === "pin" ? "PIN" : "password"} to authorise
                  </p>
                  {reauthError && <p className="text-xs text-center text-destructive">{reauthError}</p>}
                  {authModel === "pin" ? (
                    <PinPad
                      value={reauthValue}
                      onChange={setReauthValue}
                      onComplete={submitReauth}
                      disabled={reauthPending || sendTx.isPending || blockedByApproval}
                    />
                  ) : (
                    <>
                      <Input
                        type="password"
                        value={reauthValue}
                        onChange={(e) => setReauthValue(e.target.value)}
                        placeholder="Vault password"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter" && reauthValue && !reauthPending) submitReauth(reauthValue); }}
                      />
                      <Button
                        className="w-full gap-2"
                        disabled={!reauthValue || reauthPending || sendTx.isPending || blockedByApproval}
                        onClick={() => submitReauth(reauthValue)}
                      >
                        {reauthPending || sendTx.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                        Authorize &amp; Send
                      </Button>
                    </>
                  )}
                </div>
              );
            })()}
```

(The `Back` button at line 883 is unchanged.)

- [ ] **Step 5: Remove now-unused imports**

Run lint to surface dead imports, then delete only the ones it flags as unused (likely `EMAIL_AVAILABLE`, and possibly `Mail`, `Fingerprint`, `KeyRound`, `ShieldCheck`, and `base44` if no longer referenced):

Run: `npx eslint src/pages/SendCrypto.jsx`
Delete each `no-unused-vars` import it reports. Keep `Lock`, `ArrowUpRight`, `Loader2` (used above). Re-run until clean.

- [ ] **Step 6: Build + full suite**

Run: `npx vitest run && npx eslint src/pages/SendCrypto.jsx && npx vite build`
Expected: all green; no lint errors; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/pages/SendCrypto.jsx
git commit -m "feat(send): step-up re-auth gate (conditional on recent-auth window); remove stranded passkey/OTP"
```

---

### Task 5: Full verification + manual send gate

**Files:** none (verification only)

- [ ] **Step 1: Whole suite + lint + build**

Run: `npm test && npx eslint . && npx vite build`
Expected: all tests pass, lint clean, build green.

- [ ] **Step 2: Manual testnet send gate (the real verification)**

Per repo rule, a `src/` change to the send path is verified by a real send, not a green suite. With `VITE_DEV_UNGATE_SEND=1` in `.env.local`, `npm run dev`:
1. Create/import a real wallet (PIN cohort), unlock. **Confirmation #4:** on a
   memory-constrained / CPU-throttled device profile (DevTools → Performance → 4x/6x
   CPU + a low-memory device, or a real low-end phone), confirm `unlock()` completes and
   does **not** throw a `RangeError` from the two sequential 192 MiB KDFs (vault +
   verifier). If it does, the `deriveRaw` yield is missing/insufficient — fix before merge.
2. Send ETH (Sepolia) immediately after unlock → **within the window → plain Confirm & Send** (no re-prompt) → real tx broadcasts.
3. Wait > 2 minutes, send again → **step-up prompt appears** → correct PIN → broadcasts; wrong PIN ×5 → wallet locks.
4. Capture the explorer txid(s). Record results; do NOT mark anything "verified" without a real explorer-confirmed txid.

- [ ] **Step 3: Open the PR**

UNAUDITED-PROVISIONAL; flag the §24 audit item (touches unlock/verify path; holds a per-session verifier in memory). Note the known extra-KDF-at-unlock cost.

---

## Notes for the implementer

- **Do NOT** make `verifyActiveCredential` call `unlock()` or `resolveDeniabilityUnlock()` — that would reintroduce panic/decoy side effects. It must only re-derive + compare. This is the load-bearing safety property.
- **Do NOT** lower the verifier Argon2id params below `KDF_PARAMS` in production. The `params` override on `createCredentialVerifier` exists only for fast tests.
- The verifier is captured from `password` inside `unlock()` for every session type, so the decoy/duress holder re-enters the decoy credential and the decoy sends normally — never re-decrypt the primary container to verify (it would fail in a decoy session = a deniability tell).
- **Confirmation #4 (Defect-A):** keep the `setTimeout(0)` yield in `credentialVerifier.deriveRaw`. Without it, the vault-decrypt KDF and the verifier KDF are two concurrent/back-to-back 192 MiB allocations — the exact RangeError that broke onboarding. "Same KDF for security" (correct) must not obscure "two sequential 192 MiB KDFs" (a known failure mode). Verify on a memory-constrained profile (Task 5 Step 2.1).
