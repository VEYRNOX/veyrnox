# Phase 2 — Seized-device PIN disclosure: design proposal (LLD building block)

> **STATUS: DESIGN — AWAITING AL SIGN-OFF. DO NOT LAND COPY.**
> Per the mandatory process: diagram + design → Al reviews/signs off → *then* copy is
> written → branch → PR → verify gate. This document is the MD strawman (placement +
> decision tables + draft wording). The rendered diagram (DOCX/PDF) is the companion
> artifact. Nothing here is verified; nothing here ships until Al picks placement and
> signs off on wording word-by-word.

---

## 1. What Phase 2 is

Surface the **6-digit-PIN seized-device offline-brute-force limit** in plain language so a
user makes their threat-model decision informed. This is *state the weakness* (distinct
from Phase 1 = stop overstating). The **substance is fixed**; the open questions are
**where** (placement) and **how** (wording) — *not whether*.

Fixed substance (not in question):
- The protection is for the **in-the-moment / lost-or-grabbed** case, **not** offline
  analysis of a **seized** device kept by an attacker with time and tools.
- The 6-digit PIN is **brute-forceable offline** if the device is seized and imaged.
- **Hardware binding** (secure-element key binding) is a **fast-follow — not present in
  v1** (TARGET, audit-gated; must not be asserted as shipped).

---

## 2. Substance confirmed against real code (grounding — "verify, don't assert")

Read before drafting, so the disclosure matches what the code actually does:

| Claim in the disclosure | Code reality | Ref |
|---|---|---|
| PIN encrypts the wallet on-device | Argon2id (192 MiB, t=3, p=1) + AES-256-GCM, vault ciphertext only | `src/wallet-core/vault.js` (`KDF_PARAMS`); shown to user at `src/components/WalletEntry.jsx:754` |
| Each guess is *slow* (memory-hard) | Argon2id memory-hardness raises per-guess cost / resists GPU farms | `vault.js`, `deniabilityUnlock.js` |
| But 6 digits = small keyspace | 10⁶ combinations; memory-hardness slows, does **not** shrink the space | (keyspace is inherent) |
| No offline attempt limit | App **cannot** rate-limit a seized, imaged device (stateless at rest); unlock path has no lockout counter | `src/lib/WalletProvider.jsx` unlock path (`runPinUnlock` → `unlock`) |
| Hardware binding not yet present | KEK / secure-element binding is TARGET, audit-gated | `docs/kek-architecture-spec.md` (PRE-AUDIT) |

**Calibration note for wording:** Argon2id is a *real* lock — do not understate it (avoid
"trivially cracked"). But the keyspace is 10⁶ with no offline lockout — do not overstate
it either (avoid "safe"). Honest middle: *a real lock, but a 6-digit one; given unlimited
offline tries, it can eventually be opened.* Pair the limit with the genuine mitigations
(device passcode/OS encryption as a first barrier; slow per-guess cost; hardware binding
later) so it informs without inducing **false despair** (brief §wording).

---

## 3. Decision 1 — PLACEMENT (propose; **Al picks**)

| Option | + | − |
|---|---|---|
| **A. Onboarding first-run** | catches everyone | adds first-run friction; most deniability-entangled surface |
| **B. Security screen** | discoverable when sought, low friction | skippable; many never open it |
| **C. "What this protects against" screen** | honest, purpose-built | easy to bypass unless linked from first-run |

### Recommendation: **A-lite + C** (propose — Al decides; do not assume)

- **A-lite** — *one honest line* folded into the existing PIN-create copy, where the user
  is *already* told the PIN encrypts the wallet. No new screen, no new step, no added
  click — so first-run friction and deniability-entanglement stay minimal.
  - **Anchor:** `src/components/WalletEntry.jsx:753-754` — currently:
    *"Choose a 6-digit PIN" / "This unlocks your wallet. It encrypts your wallet on this
    device (Argon2id + AES-256-GCM)."* The seized-device caveat appends here.
- **C** — a fuller, purpose-built **"What this protects against"** screen, **linked from
  Security** (and optionally a "Learn more" on the A-lite line). Carries the complete
  honest model for anyone who seeks it; keeps first-run to one calm line.
  - **Link point:** `src/pages/SecurityDashboard.jsx` (posture/review area) — a static
    info row → the new screen. New route/component, e.g. `src/pages/WhatThisProtects.jsx`.

Why this pair: **coverage without burying first-run.** A-lite guarantees everyone sees the
core honest sentence; C gives the full picture without forcing it on a stressed first-run
user. (Al may instead choose A-full, B-only, or C-only — open.)

---

## 4. Decision 2 — WORDING (draft options; **Al signs off word-by-word**)

Safety copy, not marketing. Plain language for a non-technical person possibly under
stress. Honest about the limit without false despair ("protects against X, not Y"). Calm,
per the design system. **Drafts only — do not land one unilaterally.**

> **Deliberate choice across all drafts:** they say **nothing** about decoy / duress /
> hidden wallets, and never use the word "coercion." The disclosure is purely about the
> *single wallet in front of you* on a *taken device*. This is the deniability-safest
> framing (see §5) and avoids priming an adversary. Draft W-1 is the recommended
> coercion-free baseline; W-3 shows the protective contrast and is flagged for its risk.

### 4a. First-run A-lite line (appended at `WalletEntry.jsx:754`)

- **A-lite W-1 (recommended — plainest, coercion-free):**
  > "A 6-digit PIN protects your wallet on this device. If the device itself is taken,
  > a determined attacker could try PINs offline — so keep the device physically secure
  > and use your phone's own lock screen too."

- **A-lite W-2 (shorter):**
  > "Your PIN encrypts the wallet on this device. It is 6 digits — strong against a quick
  > grab, but not against someone who keeps the device to try PINs offline. Guard the
  > device itself."

- **A-lite W-3 (protective-contrast) — ❌ DECLINED by Al (2026-06-11): keep it
  coercion-free. Retained struck-through for the record; do not use.**
  > ~~"Your PIN protects against someone who glances at your screen or grabs an unlocked
  > phone. It does not protect a device taken away and analysed offline — 6 digits can be
  > tried one by one. Keep the device secure."~~
  >
  > Decision 4 resolved → wording stays factual about the taken device only (W-1/W-2).

### 4b. "What this protects against" screen — C (body copy)

Calm, sectioned like the existing `DuressPin.jsx` honest-limits blocks (tone template).

- **C heading drafts:** *"What your PIN protects — and what it doesn't"* / *"What this
  protects against"* (brief's name) / *"Your PIN, honestly."*

- **C body W-1 (recommended):**
  > **What your PIN does.** Your wallet is encrypted on this device with your 6-digit PIN.
  > Nothing leaves the device; even we can't read it. For everyday risks — a glance over
  > your shoulder, a phone grabbed for a moment — the PIN is the lock.
  >
  > **What it can't do (yet).** A 6-digit PIN is a small number of combinations. If someone
  > keeps your device and has the time and tools to copy its storage, they can try PINs
  > offline until one works. Each guess is deliberately slow, which buys time — but it does
  > not make a 6-digit PIN unbreakable.
  >
  > **What helps now.** Use your phone's own lock screen and storage encryption — that's a
  > second barrier before anyone reaches the wallet. Keep the device physically secure.
  >
  > **What's coming.** A future version will bind the key to this device's secure hardware,
  > so the PIN can't be tried offline on a copy of the storage. That isn't in this version
  > yet.

- **C body W-2 (terser, bulleted):**
  > **Your PIN encrypts the wallet on this device.** Keys never leave it.
  > - **Good for:** everyday risks — a shoulder-surf, a phone grabbed for a moment.
  > - **Not good for:** a device taken and analysed offline. 6 digits is a small space;
  >   given unlimited offline tries it can eventually be opened. Each guess is slow, which
  >   only buys time.
  > - **Help it now:** use your phone's lock screen + storage encryption; keep the device
  >   safe.
  > - **Coming later:** hardware key-binding, so the PIN can't be tried offline on a copy.
  >   Not in this version.

---

## 5. Deniability check (GATES every placement — load-bearing)

Run against **I1–I5** and **D1–D7** before anything lands, same as any first-run surface.
Assessed for the recommended **A-lite W-1 + C W-1** (static, session-independent copy that
never mentions decoy/duress/hidden/coercion):

| Invariant | Verdict | Why |
|---|---|---|
| **I1** keys never leave device | ✓ neutral | copy-only; restates I1, adds no path |
| **I2** no silent egress | ✓ neutral | static strings; no network |
| **I3** deniability is sacred | ✓ **pass** | copy is identical in real & decoy sessions (not gated on session/config); makes **zero** backend calls |
| **I4** fail honest, fail closed | ✓ aligned | this *is* the honest-disclosure of a real limit |
| **I5** backend untrusted | ✓ neutral | no backend involvement |
| **D1** per-vault scoping | ✓ n/a | not a log; no per-set data |
| **D2** structural indistinguishability | ✓ **pass** | same copy whether or not a hidden set exists — no tell |
| **D3** no cross-set events | ✓ n/a | records nothing |
| **D4** no credential-type disclosure | ✓ **pass** | never names real/duress/decoy; says nothing about *which* credential |
| **D5** fail closed | ✓ n/a | static copy |
| **D6** panic-path consistency | ✓ n/a | no logging |
| **D7** no size/existence oracle | ✓ **pass** | no per-set footprint; copy reveals no count/existence of any set |

**The load-bearing risk and how the drafts avoid it:** a seized-device disclosure read
*inside a decoy session* must not prime the adversary to suspect a *second* wallet. Drafts
W-1/W-2 never mention decoy/duress/hidden and never use "coercion" — they speak only about
the wallet in front of the reader. Brute-forcing the PIN of the wallet they're looking at
implies **no** hidden set. **Pass.**

**W-3 caveat — ✅ RESOLVED (Al, 2026-06-11): keep it coercion-free; W-3 dropped.** W-3's
*protect-vs-not* contrast edged toward the coercion framing the brief flags (*'"Resists
coercion" wording must NOT prime an adversary to suspect a hidden set'*). Per the rule
*deniability wins over coverage*, the disclosure uses **W-1/W-2 only** — factual about the
taken device, never the protective contrast. This closes the one open deniability risk in
the check above.

**Test-guard follow-through:** the new C screen (e.g. `WhatThisProtects.jsx`) and the
edited `WalletEntry.jsx` must (a) contain none of the `FORBIDDEN_COPY` strings in
`src/__tests__/security-framing.test.js`, and (b) the C screen should be **added to that
test's page list** so the guard covers it too. (Current drafts contain none of the
forbidden strings.)

---

## 6. What I need from Al (sign-off gate — STOP here)

1. **Placement:** A-lite + C (recommended) — or A-full / B-only / C-only / other?
2. **First-run wording:** W-1 (recommended) / W-2 / W-3 / edit.
3. **C-screen wording:** W-1 (recommended) / W-2 / edit; and the heading.
4. ✅ **W-3 deniability call — RESOLVED: keep it coercion-free (W-3 dropped).**

## 7. Sequence (after sign-off)

1. ← **you are here:** proposal + drafts + deniability check presented. **STOP.**
2. **Al reviews / signs off** (gate).
3. Copy lands (chosen wording only) → add C screen to `security-framing.test.js` →
   branch → PR → **verify gate** (binding on every push, incl. admin).
4. Phase 2 done → Phase 3 (release mechanics) opens.

## 8. Out of scope (do not pull in)

Phase 3 release mechanics (framer-motion manifest/lockfile drift `^11.16.4 → ^11.18.2`,
dependency-integrity pass), mainnet, the PRF probe, the audit. Phase 2 is *only* the
disclosure design.
