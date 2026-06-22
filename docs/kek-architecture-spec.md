# KEK Architecture — PIN-as-spine, hardware-bound, coercion-preserving

**Status:** TARGET (design). On build: **UNAUDITED-PROVISIONAL.**
**Scope:** the key-encryption-key layer that binds seed decryption to device hardware while preserving the duress/stealth/panic deniability model.
**Owner:** Al · **Reviewer (required before status drop):** independent audit
**Framing:** PRE-AUDIT.

This document is self-contained. It states the problem, the resolved design, the
keying construction, the four credential paths, the deniability rules, and the
open empirical/audit questions, so it stands alone as an audit input and as the
brief a Claude Code session builds from.

> **Single-mode by design.** Veyrnox ships exactly one unlock machine. Face-ID-to-decoy
> is **universal** — there is no "real-only" / "duress-off" configuration, and no
> user-facing toggle for deniability. Every device is the same machine; the only thing
> that varies is which credential slots a given user has populated, and that variation
> is invisible to anyone inspecting the device. **This uniformity is itself a security
> property:** if some devices ran a real-only mode and others didn't, the *mode* would
> be an oracle ("is duress configured?" → "give me the real PIN"). One mode means there
> is nothing to distinguish, one threat model to reason about, and one configuration for
> the audit to review. The rejected real-only variant is recorded in §11.

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

## 7. The non-enrolled PIN problem (BLOCKING — must be settled before build)

**This is the linchpin of single-mode indistinguishability, not a side decision.** In
one mode, a device where the user keeps a hidden real set behind the PIN must be
indistinguishable from a device the user treats as their only wallet. The thing that
makes those two cases identical is *what happens when a PIN doesn't resolve to an
enrolled set* — so this resolution is load-bearing for the core deniability claim, and
the two-config product would have depended on it too. **The build cannot ship without
it settled.**

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

### 8.1 Spike run checklist (Mac + Android session)

The harness is BUILT (in a worktree, web side only): `src/dev/prfSpike.js` (the
probe + pure outcome classifier, unit-tested) and the DEV-only screen
`src/pages/dev/PrfSpike.jsx`, wired as the route `/dev/prf-spike` in `App.jsx`
behind `import.meta.env.DEV` (statically false in any `vite build` → dead-code-
eliminated, never ships). It creates a passkey carrying the `prf` extension, then
evaluates `prf` against a FIXED salt twice (intra-session stability) and against a
stored prior-run value (cross-restart stability). It cannot be run on Windows (no
platform authenticator); run it as below and record the verdict at the end of this
section.

**Prerequisites**
- [ ] Android Studio with an **AVD Pixel_7** (API 34+), screen lock + fingerprint enrolled (Settings → Security) so a platform authenticator exists. Note its SwiftShader software-graphics constraint and whether it affects the credential APIs at all.
- [ ] **≥1 physical Android device** with screen lock + biometric enrolled — the emulator is NOT authoritative for secure-element behaviour (brief §3); the physical device is the real result.
- [ ] Repo checked out, `npm install` done.

**Run it (live-reload — the DEV route only exists under the Vite dev server)**
- [ ] `/dev/prf-spike` exists ONLY when `import.meta.env.DEV` is true, so the WebView must load from the Vite **dev server**, never a release bundle (a `vite build` strips the route by design). Start it: `npm run dev -- --host` and note the LAN URL.
- [ ] Run Capacitor against it in live-reload: `npx cap run android --livereload --external` (or set `server.url` to the LAN dev URL in `capacitor.config`, then `npx cap run android`).
- [ ] In the WebView, navigate to `/dev/prf-spike`.

**Probe — emulator first, then the physical device (authoritative)**
- [ ] Tap **Run probe** → approve the biometric prompt (creates the credential, runs `get()` #1 and #2). Record: `prf.enabled`? bytes returned? #1 == #2 (intra-stable)? note the hex.
- [ ] **Fully kill** the app (swipe from recents) and relaunch → `/dev/prf-spike` → **Run probe** again (it re-evaluates the STORED credential). Record: does it match the stored prior value? match = stable across restart.
- [ ] Repeat the full sequence on the physical device; note model + Android version + authenticator.

**Read the verdict (the screen prints it)**
- **A** — stable intra + across restart → proceed to the KEK build (spec §3 stands).
- **A_PENDING** — stable this session, no prior value yet → relaunch and re-run to confirm A.
- **WEBVIEW_FAIL** — `prf` unreachable/unsupported in the WebView. NOT a final no: the next step is the **native-bridge probe** (a small Capacitor FIDO2 / CTAP2 `hmac-secret` plugin) to decide outcome **B vs C** (brief §3 step 4). Establish viability only — do NOT build the full KEK bridge.
- **C** — `prf` reachable but UNSTABLE (per-call or per-restart) → stop; redesign the hardware factor (StrongBox/Keystore-wrapped key), spec §3 changes materially.

**Record the result here (turns §8 from "open" → "resolved")**
- [ ] Emulator: outcome ____, prf.enabled ____, intra-stable ____, cross-restart ____, hex ____
- [ ] Physical device (____ / Android ____): outcome ____, intra-stable ____, cross-restart ____, hex ____
- [ ] **Resolved outcome (physical device wins): ____** — then update the §8 header line above from "open" to "resolved: outcome X (date, device)" and proceed per brief §4.

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
   - *Implementation note (BUILT, UNAUDITED-PROVISIONAL — needs this review):* the
     PIN pad now submits on an explicit action at ANY length (commit "explicit-submit
     PIN pad"), with `length` controlling only the dot-display count. This was done to
     unbrick legacy 6-digit vaults after the 6→8 widening WITHOUT storing a PIN length
     (a stored length would itself leak set-existence, §7). It also removes the prior
     auto-submit-at-8 "expected length is 8" tell. Two items for the auditor here:
     (a) confirm the always-present, never-length-gated submit control introduces no
     new tell; and (b) a **pre-existing** surface inside this line-item — the position
     dots fill to `value.length` and the pad's `aria-label` reads "N of M digits
     entered", a per-keystroke readout of the *current user's* own PIN length
     (shoulder-surf / screen-reader). Not a device-comparison leak, but it lives in
     this surface and predates the change — assess whether it should be masked.
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

---

## 11. Rejected: the real-only / high-value variant

A "real-only" configuration was considered — Face ID / biometric opens the **real**
wallet directly, no decoy, for users who don't want the duress model (framed as a
high-value / convenience option). **Rejected.** Recorded here so it isn't
re-litigated.

Two reasons:

1. **It is a coercion bypass.** If Face ID opens the real set, a compelled face (mugger,
   border, court order) opens the real wallet, and the entire duress stack becomes
   theatre — the attacker never needs to ask for a PIN. §2's asymmetry forbids this.

2. **The trade is backwards for exactly the people who would ask for it.** High-value
   holders are *higher* coercion targets, not lower. Offering them convenience-over-
   coercion-resistance optimizes the wrong axis for the worst-exposed users.

There is also a structural reason single-mode is safer than offering both: if some
devices ran real-only and others didn't, the **mode itself** becomes an oracle — an
attacker who can establish "this device has duress configured" knows to demand the
real PIN. Single-mode removes the question by making every device the same machine
(see the framing note at the top). Deniability is a property of the whole device's
observable state, not of one user's settings.
