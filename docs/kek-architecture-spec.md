# KEK Architecture — PIN-as-spine, hardware-bound, coercion-preserving

**Status:** TARGET (design). On build: **UNAUDITED-PROVISIONAL.**
**Scope:** the key-encryption-key layer that binds seed decryption to device hardware while preserving the duress/stealth/panic deniability model.
**Owner:** Al · **Reviewer (required before status drop):** independent audit
**Framing:** PRE-AUDIT.

This document is self-contained. It states the problem, the resolved design, the
keying construction, the four credential paths, the deniability rules, and the
open empirical/audit questions, so it stands alone as an audit input and as the
brief a Claude Code session builds from.

---

## 1. The problem this closes

Today `vault.js` derives the wallet key **directly** from the PIN/passphrase via
Argon2id (192 MiB / t=3). The seed's encryption key is reachable with the PIN
**alone**. The biometric gate is an *app-level chokepoint* — it gates whether the
app runs the derivation, but no key material is bound to the device's secure
element.

The gap: an attacker with (a) the PIN and (b) a copy of the encrypted vault can
derive everything **off-device**. Nothing in the chain requires *this* device's
hardware. This is the known WebView-wallet limitation the KEK target addresses.

**Goal:** make the seed undecryptable without *both* a typed credential factor
**and** a hardware operation only this device's secure element can perform — without
weakening the coercion model in the process.

---

## 2. The governing asymmetry (the principle the whole design rests on)

> **A biometric can be compelled. Knowledge cannot.**

A face or finger can be physically forced in front of the phone (mugging, border,
compelled unlock). A *number* cannot be extracted from someone's head — they can
always give a different valid number instead.

Therefore: **anything compellable must resolve to the wallet the user is willing to
surrender.** Face ID is compellable → Face ID resolves to the **decoy**. The real
set sits behind the one thing that cannot be physically extracted — the typed real
PIN.

If Face ID opened the real set, it would be a coercion **bypass** of the entire
duress stack (`duress.js`, `stealth.js`, `panic.js`, `deniabilityUnlock.js`): the
attacker never needs to ask for a PIN, they just hold up the phone. That negates the
coercion model rather than weakening it. Hence the rule is a requirement, not a
preference.

---

## 3. The keying stack (unlock path)

The PIN is the **spine**: it is both the entry point and the set-selector. The
hardware factor binds in as a *set-agnostic side input*.

```
        Typed 6-digit PIN                Face ID
        (entry point;                    (authorizes the PRF
         selects WHICH set)               operation only)
              │                                │
              ▼                                ▼
   Argon2id(PIN, salt_set) → C        passkey.prf(salt_fixed) → H
   192 MiB / t=3                      H never leaves secure element
   the set-selecting factor           ONE operation, identical for every set
              │                                │
              └──────────────┬─────────────────┘
                             ▼
                  KEK = KDF(H ‖ C)
                  combine, domain-separated
                             │
                             ▼
                  KEK unwraps DEK_set
                  (the set's data-encryption key)
                             │
                             ▼
                  DEK_set decrypts seed_set
                  (which seed depends on which PIN)
```

### Why each piece sits where it does

- **H is computed once, identically, for every credential.** Same fixed salt into
  `prf`, same `H` out, regardless of which PIN follows. This is the D7 constraint
  made concrete: there is exactly **one** hardware-bound credential on the device, so
  a forensic look at the secure element reveals one passkey — not one-per-set. **The
  number of wallet-sets is invisible at the hardware layer.** Binding hardware
  per-set would itself be a deniability leak.

- **C is what forks.** The *entered* PIN (real / duress / panic) runs through
  Argon2id with a set-specific salt and produces a different `C`, which combines with
  the same `H` to produce a different `KEK`, which unwraps a different `DEK`, which
  decrypts a different seed-set. Hardware says "this device"; the typed secret says
  "this intent → this set."

- **KEK = KDF(H ‖ C)** with domain separation (a fixed context string in the KDF) so
  the two factors cannot be transposed or confused. Both are required: `H` alone
  (vault stolen, hardware unavailable) yields nothing without `C`; `C` alone (PIN
  coerced, vault copied off-device) yields nothing without *this* authenticator.
  **That is the gap from §1 closed.**

- **Two-key layering (KEK → DEK → seed) is deliberate, not ceremony.** Wrapping the
  seed under a DEK and the DEK under the KEK lets the unlock factors rotate (change
  PIN, re-enroll biometric, rotate passkey) by **re-wrapping the DEK** — without
  re-encrypting the seed and without the seed re-entering the JS heap longer than the
  unwrap moment. Change-PIN becomes: unwrap DEK with old KEK, re-wrap with new KEK.

---

## 4. The four credential paths

| Path | Channel | Resolves to | Notes |
|---|---|---|---|
| **Real PIN** | typed | **real set** | The only path to real funds. Knowledge-gated — the one thing coercion can't extract. |
| **Face ID** | biometric | **decoy set** | The everyday convenience gesture. Compellable, therefore yields the surrender wallet. |
| **Duress PIN** | typed | **decoy set** | Deliberately given under coercion. Same destination as Face ID, reinforcing the cover. |
| **Panic PIN** | typed | **key destruction** | Resolves to the wipe path. Post-wipe the device is indistinguishable from one that never held the set (D6). |

No path records *which kind* of credential was used (D4). The system records
"unlocked," never "unlocked via duress PIN."

---

## 5. Face ID resolves to the decoy — and the decoy is a terminus, not a step

**Resolved rule (verbatim for the spec):**

> Face ID resolves to the decoy set, which is a complete and self-contained
> destination. The real set is reachable only by typing the real PIN, via an entry
> surface structurally identical whether or not a real set exists. **No affordance
> anywhere bridges decoy → real.**

### The trap to avoid

"Face ID → decoy" is correct, but there is a subtle wrong way to build it: opening
the decoy while leaving *any* onward signal — a "switch to full wallet" button, a
"use PIN for full access" prompt, a second-mode hint. That is a deniability leak. An
attacker who opens the decoy and sees "there's another mode" now knows to apply
pressure for the real PIN. **The decoy must be a terminus.** The real set is reached
by backing out and performing a *separate* unlock (typing the real PIN) on an entry
surface that looks identical regardless of whether a real set exists. The real PIN is
not a "switch" reachable from inside the decoy — it is a from-scratch unlock that
happens to resolve elsewhere.

### Operational consequence — the decoy must be lived-in

Because Face ID is the everyday gesture, the decoy is the wallet used day-to-day in
public. It **cannot** be an empty shell: an attacker who opens a decoy with three
lifetime transactions and no recent activity knows it's a prop. The decoy reached by
the daily Face ID touch must carry **real, plausible, ongoing activity** — small real
balances, real sends, a believable history. This is a product-and-behaviour
requirement, not only a code one: the user must actually *use* the decoy. The decoy's
credibility is operational, not merely structural.

---

## 6. Invariant compliance

| Invariant | How this design holds it |
|---|---|
| **I1** keys never leave device | `H` never leaves the secure element. KEK-combine and DEK-unwrap should occur as close to the boundary as possible (see §8 line-item on the native bridge). Seed lives in GC'd JS heap only for the unwrap moment, as today. |
| **I2** no silent egress | No factor, no path introduces a network call. Entirely on-device. |
| **I3** deniability is sacred | One hardware credential for all sets (no per-set hardware tell). No path discloses credential type (D4). Decoy is a terminus with no onward signal. Entry surface identical in one-set and two-set cases. |
| **I4** fail honest / fail closed | A non-resolving PIN must not error (errors are oracles — see §7). PRF failure falls back to PIN-path only if that can be done without revealing set count; otherwise fail honest. No fallback to a global/plaintext key. |
| **I5** backend untrusted | The KEK layer has zero backend dependency. No server verdict, no remote allowlist. |

---

## 7. The non-enrolled PIN problem (genuinely unsolved — needs a decision)

A PIN that is **not** real / duress / panic cannot produce an *error*, because "wrong
PIN" is an oracle: it tells an attacker the entered PIN wasn't one of the enrolled
set, which implies the enrolled set is elsewhere — defeating deniability. Every
syntactically valid PIN must resolve to *something plausible*.

Open sub-decision (must be settled before build, flag to auditor):

- **Option A — deterministic decoy-from-any-PIN.** Any non-enrolled PIN derives a
  fresh, empty-but-real-feeling wallet deterministically from `(PIN, H)`. No error
  state exists at all. Strongest deniability; cost is that a fat-fingered real PIN
  silently opens an empty wallet (recoverable by re-entering correctly, but
  potentially alarming).
- **Option B — bounded retry with honest lockout.** Indistinguishable failure
  handling that escalates identically regardless of set existence. Harder to make
  leak-free; the lockout timing itself can become an oracle.

Recommendation: lean Option A, but this is exactly the kind of construction that
**must not be hand-rolled past the obvious** and is an explicit audit line-item.

---

## 8. Open empirical question (gates the hardware half)

**Does WebAuthn `prf` / CTAP2 `hmac-secret` actually work inside the Capacitor
WebView?**

This is the gate on the entire hardware-factor approach. WebAuthn `prf` is
well-supported via Android platform passkeys *in a clean browser context*, but a
Capacitor WebView may not expose the credential APIs needed. If it doesn't, the build
needs a **native bridge plugin** performing the FIDO2 call and handing bytes back
across the JS boundary — and that boundary is itself an audit surface, because `H`
transiting the bridge in the clear partially defeats "never leaves the SE."

**Mitigation if a bridge is required:** perform the KEK-combine and DEK-unwrap
*native-side* and hand only the decrypted-seed-or-nothing across the boundary — but
that relocates more crypto out of the audited JS, which is its own tradeoff to
document.

**This must be answered by a cheap spike BEFORE the keying is implemented.** Building
the combine against an unverified PRF assumption risks building against a fiction.

---

## 9. Audit line-items (consolidated)

These are the constructions an attacker would target and that must not be
hand-rolled. Same posture as the R2 capability-proof and the audit-log storage shape.

1. **The combine construction** — `KDF(H ‖ C)`, salt handling, domain separation,
   AEAD choice for wrap/unwrap. The exact KDF and the ordering/encoding of `H` and
   `C`.
2. **KDF cost for a 6-digit input** — the PIN space is 10^6. Argon2id (192 MiB /
   t=3) is the *only* thing between a captured vault and exhaustive offline search.
   Is the per-guess cost sufficient? This is load-bearing and explicitly in scope.
3. **Non-enrolled PIN handling (§7)** — does any resolution path leak set existence
   via error, timing, or output?
4. **Decoy exposes no "more exists" signal (§5)** — no onward affordance, no
   second-mode hint anywhere in the decoy session.
5. **Entry-surface indistinguishability** — byte-for-byte identical in one-set and
   two-set cases: no size tell, no extra latency, no missing/extra element.
6. **PRF bridge boundary (§8, if applicable)** — what crosses the native↔JS boundary
   and whether `H` is ever in the clear outside the SE.

---

## 10. Build sequencing (honest)

1. **Spec (this doc)** — done. Captures the resolved design.
2. **PRF-in-WebView spike** — Claude Code, cheap, answers §8. **Gates everything
   below.** If PRF is unreachable, §3 changes shape.
3. **KEK implementation** — Claude Code, in a worktree, behind a PR so the verify CI
   gate runs (`src/` change). Ships **UNAUDITED-PROVISIONAL**.
4. **Audit reviews §9 line-items** — only then may the provisional caveat drop.

> **Status discipline:** code-ready ≠ verified. This is security-adjacent code that
> decides whether a user's real funds decrypt. The UNAUDITED-PROVISIONAL tag cannot be
> dropped until the audit reviews the combine, the KDF cost, and the deniability
> properties. A bug here doesn't just lose money — under §5 it can lose someone's
> plausible deniability under coercion. That asymmetry is why this waits for the
> auditor.
