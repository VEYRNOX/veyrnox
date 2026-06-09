# v1 PIN Auth UX — KEK-less, coercion-preserving

**Status:** TARGET (design). On build: **UNAUDITED-PROVISIONAL.**
**Scope:** the v1 authentication entry surface and unlock resolution for the new
PIN cohort, built on the EXISTING `vault.js` Argon2id derivation. No H, no KEK, no
DEK — hardware binding is deferred to the post-launch KEK fast-follow.
**Source spec:** `docs/kek-architecture-spec.md` §3 (keying stack), §5 (Face-ID-to-
decoy / entry-surface uniformity), §7 Option A (deterministic decoy-from-any-PIN).
**Reviewer (required before status drop):** independent audit.
**Framing:** PRE-AUDIT.

---

## 1. What this builds, and what already exists

The unlock orchestration is **already built**. `WalletProvider.unlock()` already
routes the four paths and `deniabilityUnlock.js` already runs a constant-KDF,
oracle-free resolution:

- real secret → primary vault (`keyStore.unlock`);
- on primary miss → `resolveDeniabilityUnlock` runs a CONSTANT 3 Argon2id KDFs
  (panic / duress / hidden, real-or-dummy, no short-circuit), then the caller
  branches panic > duress > hidden;
- on total miss → re-throws the original primary error.

`vault.js` derives the AES-256-GCM key **directly** from the typed secret via
Argon2id (192 MiB / t=3) — this IS the KEK-less derivation the task names. The
6-digit PIN is simply the `password` string passed into the unchanged crypto.

v1 adds three things in front of / around this, **for the new PIN cohort only**:

1. **A 6-digit PIN entry surface** (`PinPad`) replacing the free-text password
   field, structurally identical regardless of which credential slots exist (§5).
2. **Face-ID-to-decoy** — repoint the biometric one-tap at the duress/decoy path
   (it currently opens the REAL primary vault, which §2/§5/§11 forbid as a
   coercion bypass).
3. **Option A** (§7) — replace "throw on total miss" with a deterministic
   decoy session, so **no 6-digit PIN ever produces an error state** (no oracle).

## 2. Decisions locked before this design (from the brainstorming round)

| # | Decision |
|---|----------|
| PIN scope | **New wallets only.** A non-secret per-device marker `veyrnox-auth-model='pin'` selects the PIN surface + Option A. Existing password vaults are untouched and keep the legacy password surface. |
| Decoy + Face ID | **Onboarding provisions real PIN + duress PIN + decoy seed**, so Face-ID-to-decoy works from day one (every device is the same single-mode machine). Reuses existing `createWallet` / `setDuressVault` machinery — no new crypto. |
| Panic | **Onboarding prompts panic-PIN setup with an explicit, honest skip** (review item 2). Not omitted, not forced. Reuses `setPanicVault`. |
| Option A UX | **Pure Option A + a generic, set-existence-independent "Re-enter" control** on the pad — softens the fat-finger-real-PIN case without creating an oracle. |
| Biometric cache | **Duress PIN only, never the real PIN** (review item 3). No code path caches the real PIN. |
| Argon2id cost | **Stays at the shared 192 MiB / t=3.** It cannot be raised for just the PIN path — `KDF_PARAMS` is shared with the stealth chaff pool, so a different `kdf` field on the real blob would be a deniability tell. The 10⁶ weakness is FLAGGED for audit, not patched here. |

## 3. The timing-correctness core (review item 1 — the line in the sand)

Option A must be **timing-indistinguishable** from the enrolled paths. A cheap-hash
fallback (e.g. SHA-256) returns near-instantly while the enrolled paths pay
memory-hard Argon2id (~0.4–1.7 s); that delta is an oracle that reads
enrolled-vs-garbage straight off the clock, defeating the entire point of Option A.

**Construction.** The deterministic-decoy derivation becomes a **4th constant KDF
slot inside `deniabilityUnlock.js`** — the module that already owns constant-KDF
resolution — run **unconditionally, with no short-circuit**, alongside the existing
three:

```
post-primary-miss, PIN cohort — EVERY outcome runs exactly 4 Argon2id KDFs:
  1. constantPanic           (real attempt or dummy pad)        1 KDF
  2. constantDuress          (real attempt or dummy pad)        1 KDF
  3. tryRevealHidden         (real slot or chaff)               1 KDF
  4. deterministicFallback   (Argon2id(pin, deviceSalt))        1 KDF   ← NEW
then the caller branches:  panic > duress > hidden > fallback
```

- Slot 4 calls `argon2id` at the **shared `KDF_PARAMS` (192 MiB / t=3)** — the SAME
  memory-hard cost as a real attempt — and **always succeeds** (it always yields a
  valid BIP-39 decoy mnemonic). It runs even when an enrolled path wins; the wasted
  work is the property, not a bug.
- Therefore **panic-hit, duress-hit, hidden-hit, and total-miss all cost an
  identical 4 KDFs** and are mutually timing-indistinguishable. On a total miss the
  caller opens the fallback decoy session instead of throwing → no error state.
- This raises the constant-KDF invariant from **3 → 4 for the PIN cohort**.
- The **password cohort is unchanged**: it runs the original 3 KDFs and still
  throws on total miss (no Option A). Cohort itself is not a hidden property — the
  entry surfaces (PIN pad vs password field) are visibly different — so a timing
  difference *between* cohorts leaks nothing the UI doesn't already show. Within
  each cohort, all post-miss outcomes are uniform.

**Test (new, mandatory).** A constant-work test asserting that **all four KDF slots
(panic / duress / hidden / deterministic-fallback) EXECUTE unconditionally on every
post-miss unlock** — across enrolled-hit, duress-hit, panic-hit, and total-miss —
with no data-dependent short-circuit or early exit, each at `KDF_PARAMS.memorySize`.

> **Assert execution, not callability/count.** A bare "Argon2id was called 4 times"
> assertion passes even if some slot is conditionally skipped on a branch (e.g. the
> fallback short-circuited once duress hit) and a different slot ran twice — which
> reopens the timing oracle. The test must observe that **each specific slot's KDF
> ran regardless of which path ultimately wins** (e.g. tag/identify each slot's KDF
> invocation and assert all four are present on every outcome), not merely that the
> total reached four. This is the single assertion the whole timing-
> indistinguishability claim rests on. The existing determinism / no-throw unit
> tests will NOT catch a timing regression, so this is its own explicit assertion.

## 4. Components

### 4.1 `src/components/security/PinPad.jsx` (new)
Mobile-first 6-digit numeric pad. Stateless presentation: `value`, `onChange`,
`onComplete`, `disabled`. Renders six positions + digit keys + the always-present
**"Re-enter" (clear)** control. The control and the whole surface are byte-identical
whether or not a real/duress/hidden set exists (§5, audit line-item 5). No security
logic lives here — it only collects six digits and hands them up.

### 4.2 `src/wallet-core/decoyFallback.js` (new — pure, unit-tested)
```
deriveDeterministicDecoyMnemonic(pin, deviceSalt) -> Promise<string mnemonic>
```
- `argon2id(pin, deviceSalt, KDF_PARAMS)` (imported from `vault.js`) →
  binary output → first 16 bytes as 128-bit BIP-39 entropy → mnemonic.
- **Memory-hard, not a cheap hash** (§3). Deterministic: same `(pin, deviceSalt)`
  → same mnemonic, so the same wrong PIN always opens the same empty wallet
  (believable, consistent re-entry — determinism is for plausibility, not secrecy).
- `deviceSalt`: a once-generated, non-secret 16-byte value in localStorage
  (`veyrnox-pin-decoy-salt`), created at PIN-wallet creation. A seized device
  exposes it — irrelevant, the derived wallets are genuinely empty.
- Reuses `mnemonic.js` for entropy→mnemonic; does NOT touch `vault.js` internals.

### 4.3 `src/wallet-core/deniabilityUnlock.js` (modified)
Add the 4th constant slot (§3). New signature returns the fallback too, and a flag
gates whether slot 4 runs (PIN cohort = yes; password cohort = no, preserving its
3-KDF + throw behavior):
```
resolveDeniabilityUnlock(pin, { deterministicFallback, deviceSalt })
  -> { panic, duressMnemonic, hiddenMnemonic, fallbackDecoyMnemonic }
```
`fallbackDecoyMnemonic` is `null` when `deterministicFallback` is false.

### 4.4 `src/lib/WalletProvider.jsx` (modified)
- `unlock(pin, opts)` — when `opts.pinModel`, pass `deterministicFallback:true` +
  the device salt; on total miss use `fallbackDecoyMnemonic` to open the **existing
  ephemeral decoy session** (`setIsDecoy(true)`, in-memory only, never persisted —
  the same branch duress/hidden already use) instead of throwing. Password cohort:
  unchanged (throws on miss).
- `unlockWithBiometric()` / `enableBiometricUnlock()` — cache and replay the
  **duress PIN**, never the real PIN. Face ID therefore resolves to the configured
  lived-in decoy through the unchanged duress path. (Review item 3.)
- `changePassword()` — in the PIN cohort, do **not** re-cache the real PIN into the
  biometric store; the biometric secret stays the duress PIN, independent of
  real-PIN changes. (Review item 3 guard.)

### 4.5 `src/components/WalletEntry.jsx` (modified)
- Reads `veyrnox-auth-model`. `'pin'` → render the PIN surfaces below; otherwise →
  the existing password surfaces, unchanged.
- **Returning user (PIN):** `PinPad` → `unlock(pin, {pinModel:true})`. The
  Face-ID-to-decoy button (when enabled + cached) → `unlockWithBiometric()`.
- **First-run (PIN), reusing existing machinery:**
  1. set real PIN (pad) + confirm;
  2. set duress PIN (pad, must differ from real) → generate decoy seed →
     `setDuressVault(decoySeed, duressPin)`;
  3. **optional** panic PIN (pad) with explicit skip → `setPanicVault(panicPin)`;
  4. `createWallet(realPin)`; real seed shown ONCE for mandatory backup;
  5. **optional** "Enable Face ID (opens your everyday wallet)" →
     `enableBiometricUnlock(duressPin)`;
  6. write `veyrnox-auth-model='pin'` + the decoy salt.

## 5. Data flow (returning PIN user)

```
PinPad(6 digits) ─▶ unlock(pin, {pinModel:true})
   │
   ├─ primary Argon2id attempt ── hit ─▶ real wallet            (1 KDF, fast)
   │
   └─ miss ─▶ resolveDeniabilityUnlock (4 KDFs, no short-circuit)
                 panic   ─▶ wipe + throw generic error
                 duress  ─▶ decoy session (isDecoy)
                 hidden  ─▶ hidden session
                 else    ─▶ deterministic decoy session (Option A — no error)

Face ID ─▶ unlockWithBiometric() ─▶ replays cached DURESS PIN ─▶ decoy session
```

## 6. The Argon2id-cost finding (explicit deliverable — #1 audit line-item)

A 6-digit PIN is **10⁶ = 1,000,000** candidates. Under the shared `KDF_PARAMS`
(192 MiB / t=3, ~0.4–1.7 s/guess), an attacker who has **seized the device and
extracted the ciphertext** can exhaust the entire keyspace **offline in roughly
hours to ~a day** on a modest memory-hard cracking rig. Memory-hardness raises the
per-guess cost but cannot rescue a 10⁶ keyspace — the space is simply small.

**Why v1 does not strengthen it.** `KDF_PARAMS` is exported and the stealth chaff
pool advertises the SAME params; the real primary blob's `kdf` field must byte-match
chaff or it becomes a real-vs-chaff distinguisher (a deniability tell). So Argon2id
**cannot** be raised for only the PIN path — raising it is a device-wide,
deniability-sensitive, audit-gated decision, not a v1 tweak. v1 keeps 192 MiB / t=3
and flags this as the headline audit item.

**Why this is acceptable for v1, narrowly:** testnet-only; UNAUDITED-PROVISIONAL;
and the hardware KEK fast-follow (a hardware factor the offline attacker cannot
perform) is what actually closes the gap. It is NOT acceptable for mainnet and the
caveat cannot drop until the audit reviews it.

## 7. Threat-model note (carried in code headers + here)

> v1 is **software key derivation**. It resists **observed coercion**: Face ID and
> the duress PIN both yield the surrendered decoy; the panic PIN wipes; and no PIN
> produces an error-state oracle (Option A) or a timing oracle (§3). It does **not**
> fully resist **offline analysis of a seized device** — a 6-digit PIN over Argon2id
> is exhaustible offline in hours–days (§6). Hardware binding (the KEK layer,
> `kek-architecture-spec.md` §3) is the planned fast-follow that makes the seed
> undecryptable without this device's secure element.

**Known accepted limitation — empty-vs-lived-in decoy under repeated live probing.**
The Option-A fallback opens a fresh-**empty** deterministic wallet, while the duress
PIN opens the **lived-in** configured decoy (both `isDecoy`). A live coercer who
makes the user enter several PINs in succession sees that one of them opens a wallet
with real, ongoing activity while the others open empty ones — which faintly hints
the empty ones are fallbacks and that a configured set (hence a real set) exists
elsewhere. This is **accepted for v1, not fixed**: the single-probe and offline
cases are already covered (the entry surface is uniform; offline is subsumed by the
conceded seized-device threat in §6), and it is the *live multi-probe* case that is
named here so the auditor can weigh it as a stated decision rather than an unstated
default. The mitigation is product, not code (the configured decoy must be genuinely
lived-in per spec §5; a freshly-set-up decoy is itself thin), and the durable fix
rides with the hardware-KEK fast-follow.

## 8. Invariant compliance

| Invariant | How v1 holds it |
|---|---|
| **I1** keys never leave device | Unchanged. PIN flows into the existing on-device Argon2id; no new egress. |
| **I2** no silent egress | No path adds a network call. The decoy salt is local, non-secret. |
| **I3** deniability is sacred | Entry surface byte-identical regardless of slots (§5). No path discloses credential type. Option A removes the error-state oracle; §3 removes the timing oracle. Face ID → decoy, never real. |
| **I4** fail honest / fail closed | A non-resolving PIN does not error — it opens a plausible empty decoy (§7). Panic still fails closed (wipe). No fallback to a global/plaintext key. |
| **I5** backend untrusted | Zero backend dependency in the auth path. |

## 9. Testing

- **`decoyFallback.js` (unit):** determinism (same pin+salt → same mnemonic);
  distinct pins → distinct, valid BIP-39 wallets; uses Argon2id at `KDF_PARAMS`
  (not a cheap hash).
- **Timing/constant-work (new, mandatory — §3):** assert all four slots (panic /
  duress / hidden / deterministic-fallback) **execute unconditionally** on every
  PIN-cohort post-miss outcome (enrolled-hit / duress-hit / panic-hit / total-miss),
  each at `KDF_PARAMS.memorySize`, with no data-dependent short-circuit — observing
  per-slot execution, NOT just a total count of 4 (§3). Password cohort still spends
  3 and throws on miss.
- **`unlock` Option A (integration):** a non-enrolled PIN opens an `isDecoy`
  session with NO throw; never persists a container/walletMeta; duress PIN still
  opens the *configured* decoy; panic still wipes.
- **Face-ID-to-decoy:** `unlockWithBiometric` opens an `isDecoy` session and NEVER
  the primary; the biometric-cached credential is the duress PIN; `changePassword`
  in the PIN cohort does not re-cache the real PIN.
- **Regression:** the full existing suite (536 tests) stays green — password-cohort
  behavior is untouched.

## 10. Audit line-items (carried forward from spec §9)

1. **KDF cost for a 6-digit input (§6)** — the 10⁶ keyspace under 192 MiB / t=3;
   exhaustible offline on a seized device. The #1 item.
2. **Option A resolution leaks nothing** via error, timing (§3 — the 4th constant
   KDF), or output (the deterministic decoy is a genuine empty wallet).
3. **Entry-surface indistinguishability (§5)** — byte-for-byte identical in
   one-set and N-set cases; the "Re-enter" control is set-existence-independent.
4. **Face-ID-to-decoy** — confirm no path caches or resolves the real set from a
   compellable factor.

## 11. Out of scope (explicit)

- The hardware KEK / H / DEK layer (post-launch fast-follow; B-vs-C pending).
- Migrating existing password vaults to PINs ("new wallets only").
- The stealth/hidden onboarding (hidden wallets remain an in-app, post-onboarding
  feature; the hidden path stays wired in unlock but is not a v1 onboarding step).
- Raising Argon2id params (device-wide, deniability-sensitive, audit-gated — §6).

## 12. Seed recovery — PIN-cohort re-provision (v1-auth-surface-brief §4)

**Status:** BUILT (testnet, UNAUDITED-PROVISIONAL). Reviewed against the brief's
intended model; check 3 was failing in the shipped #138 build and is now fixed.

**Intended model.** A forgotten PIN is recovered ONLY by re-importing the seed and
setting a NEW PIN — never a custodial reset, never seed-as-instant-real-login. The
seed self-derives its wallet, so recovery is **seed-scoped**: enter seed → derive its
wallet → set a new PIN. The deniability slots (decoy/duress, panic, Option-A salt)
re-provision around the new PIN, so a recovered device is, by construction,
indistinguishable from a freshly-onboarded one (§5 entry-surface uniformity).

**The leak that was fixed (check 3).** #138's recovery reused the password import
flow (`WalletEntry.handleImport`) and flipped the device to the **password cohort**
on success (`setAuthModel('password')`). A PIN user who recovered then saw a free-text
password screen instead of everyone else's PIN pad — an observable "this user forgot
their PIN and recovered" state §0 forbids. **Fix:** a PIN-cohort "Forgot your PIN?"
now routes to a dedicated `pin-recover` flow (`WalletEntry`, view `pin-recover`):
enter seed → new PIN → confirm → duress → optional panic, then
`lib/pinRecovery.provisionPinRecovery()` runs the same provisioning as onboarding but
seeds the wallet from the imported phrase:

1. `importWallet(seed, newPin)` — encrypt the recovered seed under the new PIN;
2. `setDuressPin(duressPin)` — provision the lived-in decoy;
3. optional `setPanicPin` (best-effort, like onboarding);
4. `setAuthModel('pin')` — **never** `'password'`;
5. `getOrCreateDeviceSalt()` — seed the Option-A deterministic-decoy salt.

**Fail-closed ordering.** Everything after the import runs only once `importWallet`
resolves. A bad phrase throws BEFORE any cohort/slot change, leaving the existing PIN
vault and cohort untouched (no half-provisioned device). No seed-backup screen — the
user just supplied the seed.

**Gating checklist (brief §4) — outcome:**
1. Decoy's seed re-provisions the decoy, reveals nothing about a real set — **yes**
   (seed-scoped import + slot re-provision; no matching against device state).
2. "Wallet not found" / unrecognized-seed oracle — **none**. The only error is a
   BIP-39 checksum failure (intrinsic to the typed phrase, not device state).
3. Post-recovery surface is the PIN pad (not password) — **yes (fixed)**. Was the
   leak above; now re-provisions into the PIN cohort.
4. Instant real-set access without a new secret — **no**. A new PIN is required.

**Honest user-facing note (carried in `lib/pinRecovery.js` header + below).** The
seed is the root secret — whoever holds the real seed holds the real wallet, full
stop. The duress/decoy model protects the **day-to-day unlock** (give the duress PIN
under coercion), **not** the seed backup. A coercer who extracts the real *seed*
bypasses the PIN model entirely. This is unchanged by recovery and is the same
disclosure §4 of the brief requires.

**Verification.** `lib/__tests__/pinRecovery.test.js` (8 tests) locks the invariant
(re-provisions `'pin'`, never `'password'`; fail-closed on import error; optional
panic). Preview-driven end-to-end on testnet: onboard PIN wallet → lock → "Forgot
your PIN?" → restore a valid seed → new PIN → confirmed the device stays in the PIN
cohort, the salt is seeded, the post-recovery+lock surface is the PIN pad (no password
field), and the restored vault opens with the new PIN.

**Out of scope (tracked separately, NOT folded in):** first-run "Import an existing
seed" (no prior PIN vault) still lands in the **password cohort** via `handleImport`.
That is the same class of import-from-scratch cohort tell, but broader than §4's
recovery scope; flagged for a follow-up rather than changed here.
