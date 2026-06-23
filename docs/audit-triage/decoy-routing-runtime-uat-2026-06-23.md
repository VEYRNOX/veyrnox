# Decoy-PIN routing — runtime UAT + stale-doc corrections (2026-06-23)

> **WHAT THIS IS:** evidence for two honesty corrections (this PR) and the runtime
> UAT that grounds them. **Flips no status.** Internal review + first-party runtime,
> **not** the independent third-party audit the §24 gate requires.

## Trigger

An open question (owner-reported): *"correct PIN opens the $0 decoy."* An independent
honest-reviewer pass found the **live** unlock logic (`deniabilityUnlock.js`) already
implements the **v2 model** (commit `b4871b1`): a wrong PIN returns an explicit
"Incorrect PIN" error; the Option-A silent-decoy-on-wrong-PIN slot was **removed**. But
two surfaces still described the **removed** Option-A model as live.

## Runtime UAT (web build, throwaway fixture seed, 8-digit PINs)

Full routing matrix exercised, including a configured decoy (the owner's scenario):

| Input | Routes to | Evidence |
|---|---|---|
| Real PIN `30081977` | **REAL** wallet — `$1,991.35`, addr `0x90f9…a729`, id `8b3f02b8…` | on first-import unlock, returning unlock, **and with a duress PIN configured** |
| Duress PIN `52749163` | **DECOY** — `$0`, addr `0xFe53…69De` | `veyrnox-active-wallet` localStorage stays the REAL id → **no on-disk decoy tell** |
| Wrong PIN `44556677` | **"Incorrect PIN"** error, stays on unlock | v2 fix live — **no silent decoy** |

**Result:** the owner's *"correct PIN → $0 decoy"* symptom **did not reproduce**. A
returning-unlock once read `$515.75` not `$1,991.35` — ruled out as **RPC partial-load
noise** (ETH didn't load; same wallet id), **not** a decoy. Lesson: check the wallet id,
not the dollar figure.

**Untested:** the mobile Face-ID→decoy path (Face ID opens the decoy by design) — needs a
real device; a simulator has no Secure Enclave to verify it honestly.

## Corrections in this PR

- **R1 — `src/wallet-core/decoyFallback.js`**: header described Option-A ("no 8-digit PIN
  may produce an error… 4th constant slot, unconditionally") as live. It asserted a
  coercion-resistance property the shipped code **removed**. Added a SUPERSEDED banner;
  the function is dead code (tests-only) — retained for historical/audit context.
- **R2 — `docs/Feature-Status.md:140`**: still listed "Option A deterministic decoy
  fallback" as a ✅ VERIFIED shipped component. Appended a dated CORRECTION recording the
  v2 supersession + the runtime routing result (and the stale "6-digit / 111111" wording).

Scope-limited to the verified security-honesty defects. Wording nits (the recurring
"✅ VERIFIED" convention on other lines) are deferred. See `deniabilityUnlock.js` for the
authoritative v2 model.
