# Vault & authentication architecture — brief

*Status convention:*
- ***BUILT*** *= implemented on main today.*
- ***UNAUDITED-PROVISIONAL*** *= code-complete and tests green, but **not** independently
  audited and **not** on-chain verified. Audit-gated (§24), testnet/demo only. The
  "UNAUDITED" is folded into the tier name on purpose — so the caveat can't be dropped
  when the status is quoted. It NEVER means "verified" — a feature is verified only after
  a real on-chain testnet transaction confirms with a user-supplied txid.*
- ***TARGET*** *= design only, audit-gated (§24), not in code.*
- ***PLANNED*** *= roadmap, not yet specced.*

> **Verification block (2026-06-07, against `main`).** Proof gathered confirming the
> coercion layer is merged on `main` (not worktree-only) and that the §1/§5 claims match
> the code. This is *"verified merged + tests green,"* **never** *"verified secure."*
>
> - **Merged on `main`.** `duress` / `stealth` / `panic` / `deniabilityUnlock` are
>   committed to `main`, not worktree-only. History: PRs #34 (M2 constant-KDF timing) and
>   #35 (M3 Argon2id params) are merged; the SAST fix chain is on `main` — `3890cb8`
>   (M2, constant KDF count on wrong unlock), `bb9afaa` (M3, at-rest Argon2id 64→192 MiB),
>   `7bbad7b` (dummy-KDF chaff pinned to current params, so M3's raise can't reopen the
>   M2 timing tell).
> - **§1 confirmed — no KEK indirection.** `src/wallet-core/vault.js` derives the AES key
>   **directly** from the password via Argon2id (hash-wasm, `vault.js:78–90`); there is no
>   KEK-wrapping implementation. *(The literal token "KEK" appears nowhere in `src`; the
>   only mention of wrapping the vault key in a hardware keystore is an aspirational
>   comment at `vault.js:22–24`.)* Hardware-KEK-via-passkey stays **TARGET** —
>   `isSecureHardwareAvailable()` returns `false` on web (`keystore/web.js:16`).
> - **§5 residual confirmed minor.** `grep walletMeta src/wallet-core/stealth.js
>   src/wallet-core/duress.js` → empty. Stealth/duress keep separate storage; the
>   `walletMeta` residual exposes only the visible wallet-set (openly added anyway), not
>   hidden wallets — deniability holds at this layer. (`WalletProvider.jsx:948` confirms
>   duress/stealth storage is untouched on the decoy/hidden unlock op.)
> - **Tests:** 291/291 green across 27 files in `src/wallet-core/__tests__/` (~237s;
>   Argon2id at 192 MiB is the runtime cost). Deniability has dedicated tests: no-tell on
>   wrong/chaff secrets, constant slot count, byte-shape indistinguishability, and the M1
>   collision→distinct-slots case.
> - **Gate intact.** The §24 independent audit is still required before ship. Unit tests
>   confirm intended behavior; they do **not** confirm absence of side-channels. Nothing
>   here is marked audited, hardware-backed, or on-chain verified.

> **Reconciliation note (2026-06-06).** An earlier draft of this brief described the
> coercion-resistance layer (§4–§5) as "design only, none built yet." That was stale:
> the duress/decoy, stealth/hidden, and panic-wipe modules are in code and wired into
> the live unlock flow. They are **UNAUDITED-PROVISIONAL** — code-complete, tested, but
> unaudited and not on-chain verified. This brief now matches the canonical in-repo
> status doc (`docs/Feature-Status.md`, last verified 2026-06-03) and the code.

---

## 1. The vault (one per user) — BUILT

Each user has exactly **one vault**: a single encrypted container. There is no
multi-vault model.

At rest the vault holds:
- The **encrypted vault key material**. *(BUILT today: the vault key is derived
  **directly** from the user's password via Argon2id — there is no KEK-indirection
  layer yet. The **KEK-wrapped vault key with a hardware-held KEK is TARGET** — see §2.)*
- The **encrypted seed** for the real wallet-set.

Crypto (BUILT, PROVISIONAL params): Argon2id (hash-wasm, **192 MiB / t=3**, raised under
SAST finding M3) → AES-256-GCM (WebCrypto, authenticated), fresh random salt/nonce per
encryption. *The KDF work-factor is PROVISIONAL and requires audit validation; a
decrypt-with-blob-params + lazy-rekey migration exists so the audit can later raise it
per device class without locking anyone out.*

What the vault never holds at rest:
- **No plaintext seed.** The seed is derived into the JS heap **transiently**,
  only while in use, and wiped after (best-effort on web — JS cannot guarantee
  zeroization; documented honestly). Plaintext seed/QR to any persistent store
  or cloud is a rejected, fund-loss design.

---

## 2. Authenticators unwrap the vault — they are not stored secrets — BUILT

Authentication happens **once**, at onboarding/unlock, to reach the Dashboard.
A user at the Dashboard is authenticated and the vault is unlocked. There is **no
second factor, no email, no OTP** anywhere in the model.

Three unlock methods, in priority order:
1. **PIN / password** — Argon2id KDF input. — **BUILT**
2. **Biometric** (FIDO2 / passkey) — **UNAUDITED-PROVISIONAL** (app-layer gate, not OS-enforced ACL)
3. **Face ID** (FIDO2 / passkey) — **UNAUDITED-PROVISIONAL** (app-layer gate, not OS-enforced ACL)

If 2 or 3 are unavailable, the fallback is **1 (PIN/password)**.

How each relates to the vault key:
- **PIN/password** is a **key-derivation input** (Argon2id KDF), not a stored value. The
  vault never holds it; it holds material only the correct secret can unwrap.
  A stored-and-compared secret would break both deniability and the duress model, so
  it is never stored. — **BUILT**
- **Biometric / FIDO2 / passkey** is implemented today as an **app-layer gate**
  (`runPasskeyGate` / `biometric.js`) that runs *before* the vault is read and is
  **independent of the vault key** — losing the passkey never costs funds (passkey loss
  ≠ fund loss), and a deliberate password-only escape hatch fails closed. It is **not**
  yet an OS-enforced ACL or a secure-element key-wrap. — **UNAUDITED-PROVISIONAL** (app-layer gate, not OS-enforced ACL)

Unifying model: **multiple authenticators, one wrapped vault key, seed transient
in memory.**

> **BUILT vs TARGET split within this section.** PIN/biometric/FIDO2 unlock → real
> wallet-set is **BUILT** (biometric/passkey as a PROVISIONAL app-layer gate). The
> **hardware-KEK release via passkey** (true secure-element binding: Secure Enclave /
> StrongBox / TPM holding the KEK; OS-enforced ACL, M2c/M2d) is **TARGET**, audit-gated
> (§24). On the current WebView build `isSecureHardwareAvailable() === false` — there is
> **no real secure-element KEK binding yet**, and the password is the sole at-rest factor.

---

## 3. The real wallet-set — BUILT

The vault's real wallet-set is the visible, openly-managed multi-wallet UX. A user
either:
- **Creates** a new wallet/portfolio of digital assets, or
- **Imports** their own seed — migrating from another wallet (e.g. MetaMask).

These wallets are openly added and openly counted ("1 wallet in this portfolio").
This visible count is **ordinary UX, not a security property** — it carries no
deniability claim. The visible layer also supports **named portfolios**, **per-wallet
rename**, and **per-wallet backup tracking** (each seed warns until confirmed backed up).

> **Seed-handling note:** the **import** path is the moment a plaintext seed enters
> the app. Invariant **B1** (round-trip verify at creation/import before claiming
> success) and the transient-heap rule apply most acutely here.

---

## 4. Coercion-resistance model — UNAUDITED-PROVISIONAL, audit-gated §24

**This layer is in code and wired into the live unlock flow — but it is PROVISIONAL:
testnet/demo, not independently audited, not on-chain verified.** It must not be
described externally as audited or production-ready (see §7).

The model: one vault, with credential-determined outcomes. **The *credential* the user
enters at the single unlock prompt determines which side surfaces** — there is no
"mode" toggle for an observer to notice.

Unlock routing (BUILT): after the primary unlock attempt fails, the failed-password
path runs `resolveDeniabilityUnlock(password)`, which evaluates a **constant 3 KDFs**
(panic, duress, stealth slots — real or chaff) so the **count of configured features is
not timeable** (SAST M2 fix, `deniabilityUnlock.js`). The caller then branches
panic → duress → hidden. The real unlock flow is untouched on a correct password.

### Credential → outcome

| Credential | Outcome | Status |
|---|---|---|
| Normal PIN / biometric / FIDO2 | Real wallet-set | **BUILT** |
| Duress PIN/password | Opens the decoy — a **real, separately-encrypted vault**, not a fake-balance UI (`duress.js`) | **UNAUDITED-PROVISIONAL**, §24 |
| Stealth / hidden secret | Reveals a hidden wallet from a chaff-slot pool (`stealth.js`; 256-slot pool, multi-chain reveal) | **UNAUDITED-PROVISIONAL**, §24 |
| Wipe / panic / nuke PIN | Destroys local key material — fires `panicWipe()` with no confirmation dialog (`panic.js`) | **UNAUDITED-PROVISIONAL**, §24 |

Terminology:
- A **duress PIN** is an alternate secret used under coercion; here it opens the
  **decoy** (the user appears to comply; the attacker sees a plausible, genuinely-empty
  testnet wallet; the real set stays invisible). The decoy is its own BIP-39 mnemonic
  encrypted with the **same** crypto as the primary — byte-for-byte the same blob shape.
- A **stealth / hidden** secret reveals an independently-encrypted hidden wallet that
  lives among indistinguishable chaff slots.
- A **wipe / panic / nuke PIN** is a duress-style secret whose behaviour is destruction
  rather than decoy — it erases local data / destroys encryption keys (see §6 for scope).

---

## 5. Deniability constraints — UNAUDITED-PROVISIONAL in part; some guarantees still TARGET

These are non-negotiable. Status per constraint reflects what the code achieves today
versus what still needs the audit:

- **One vault, credential-determined real + decoy structure.** The decoy is a property
  of *how the vault unlocks*, not a separate enumerable container. — **UNAUDITED-PROVISIONAL**
- The **decoy is structurally identical** to the real wallet — it *is* a real,
  fully-functional vault with real derived addresses and genuinely-empty testnet
  history. Same layout, same chrome; no "decoy mode" branch for an observer. —
  **UNAUDITED-PROVISIONAL**
- **Constant-time resolution:** a wrong/duress/hidden/panic attempt costs the same fixed
  number of Argon2id KDFs, so feature configuration is not inferable by timing
  (`deniabilityUnlock.js`, SAST M2). — **UNAUDITED-PROVISIONAL**
- **Shared storage, no naming tell:** decoy / stealth / panic blobs live in the **same**
  IndexedDB store as the primary under neutral keys — there is no database literally
  named "duress." — **UNAUDITED-PROVISIONAL**
- **Cryptographically indistinguishable from noise/free space** (hidden existence
  protected by crypto, not just UI). The chaff-slot pool approximates this, but the
  strong "indistinguishable from free space at the storage layer" guarantee is
  **audit-pending**. A known, documented residual: **primary**-vault UI metadata
  (`walletMeta.js`) persists wallet ids/names in plaintext localStorage — acceptable for
  the already-observable primary, and **not** referenced by the separately-encrypted
  duress/stealth artifacts, so it does not weaken count-hiding. — **partly TARGET**
- **No UI element ever reveals how many wallets/seeds exist** (design-system deniability
  rule, extended to the coercion layer). — **BUILT** for the deniable artifacts.

> **Architecture guard — honored in code.** The visible multi-wallet path (§3) and the
> decoy/stealth unlock-paths (§4) are kept **architecturally separate**: a deniability
> unlock builds transient in-memory state and does **not** write the visible portfolio
> container or `walletMeta`, so the decoy never appears in the counted "Add wallet"
> list. Openly-added wallets being counted is fine; the decoy appearing in that count
> would be a deniability failure — and it does not.

---

## 6. Product decisions — mostly resolved in code

- **Coercion-PIN configuration — RESOLVED (both, independent).** The code supports a
  duress PIN **and** a separate panic/wipe PIN **simultaneously and independently**
  (`setDuressPin` and `setPanicPin` are distinct; `resolveDeniabilityUnlock` evaluates
  the panic, duress, and stealth slots independently). The user is not forced to pick one
  coercion behaviour.
- **Wipe scope — RESOLVED (full local erasure; honest non-claims).** Panic wipe clears
  the **entire** shared vault store (primary + duress decoy + stealth pool + panic
  marker) and best-effort **deletes the IndexedDB database**. It explicitly does **NOT**
  destroy: a **seed backup the user holds elsewhere** (paper/password-manager/another
  device — wipe protects the *device*, not the seed), **on-chain state**, or guarantee
  **forensic media sanitisation** (JS/IndexedDB cannot). These non-claims are stated
  plainly in the UI.
- **Duress-PIN entry point in the send flow — STILL OPEN (TARGET).** Duress/panic
  routing today is at the **unlock prompt** only. Routing a duress credential at the
  signing/re-confirm step in the send flow is **not** built; confirm coverage when the
  send re-confirmation work is specced.

---

## 7. Honest-state summary (for pitch discipline)

**BUILT today (fully):** one vault; PIN/biometric/FIDO2 unlock (PIN fallback) → real
wallet-set; create-new and import-seed (MetaMask migration); named portfolios + per-wallet
rename/backup tracking.

**UNAUDITED-PROVISIONAL — in code, tested, but unaudited and not on-chain verified;
testnet/demo, audit-gated §24:** duress PIN → decoy vault; stealth / hidden wallets
(chaff-slot pool); panic / wipe PIN (local key destruction); constant-KDF unlock timing;
Argon2id work-factor raise (SAST M3, params pending audit); biometric/passkey app-layer
unlock gate.

**TARGET / not built:** hardware-KEK release via passkey (secure-element / OS-enforced
ACL binding, M2c/M2d); the audited "indistinguishable from free space" deniability
guarantee; duress entry point in the send flow; encrypted cloud recovery; inheritance.

> **Pitch discipline (corrected).** The coercion-resistance layer — the product's
> headline differentiator — **is code, not just design.** But it is **PROVISIONAL and
> UNAUDITED.** Hold *this* line in any external claim: it exists and runs on testnet, but
> **never claim it is independently audited, production-ready, hardware-backed, or
> on-chain verified** until the §24 audit and real-device verification land. "Built" is
> not "verified."
