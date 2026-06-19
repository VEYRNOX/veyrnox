# Open question for the independent audit — stealth slot-salt: universal vs. write-only

> **What this is:** a single, focused **open deniability question** surfaced during the
> 2026-06-19 AI-assisted review (see `ai-review-2026-06-19-unaudited-features.md`) and the
> F-02 remediation. It is **not** a confirmed bug and **not** a fix request — it is a design
> trade-off in PROVISIONAL, audit-gated deniability code that the independent auditor should
> resolve. Flagged here so it reaches the audit alongside `docs/Audit.scope.md`.
>
> **Honesty caveat:** the AI reviewer changed its mind on this twice before settling. Treat
> the analysis below as a lead to verify independently, not a verdict.

## Scope
`src/wallet-core/stealth.js` (the hidden-wallet / chaff-pool deniability stack), in relation
to `panic.js` (panic wipe) and `deniabilityUnlock.js` (constant-KDF unlock). Tied to the
F-02..F-05 panic-wipe residue work (`d269e54`, `32e7954`).

## Background
F-02 found that a panic wipe could leave `veyrnox-stealth-slot-salt` in localStorage, and
that a post-wipe reveal re-created it. Two commits shipped:
- **`d269e54`** — `panic.js` now wipes + inspects all 8 deniability-tell keys (incl. the
  stealth salt); `panic.test.js` pins the full membership.
- **`32e7954`** — `stealth.js` split the salt accessor into read-only (`readStealthSalt` /
  `readSlotForSecret`) vs. create-on-write (`getOrCreateStealthSalt`), so a reveal can no
  longer provision the salt; an absent-salt miss spends one dummy KDF to preserve the
  constant 1-KDF stealth-slot timing.

## The verified fact
After `32e7954`, the slot-salt is **write-only**: it is provisioned **only** by
`createHiddenWallet` / `moveWalletToHidden` (via `slotForSecret` → `getOrCreateStealthSalt`).
It is **not** provisioned by:
- `ensureStealthPool` — seeds chaff at fixed `SLOT_KEYS`, never touches the salt; and
- `tryRevealHidden` — now uses `readSlotForSecret` (read-only).

**Consequence:** on a device with a primary vault but **no hidden wallet**,
`veyrnox-stealth-slot-salt` does **not** exist. Its presence therefore correlates with
"a hidden wallet was (or had been) created."

## The trade-off the auditor should weigh
| | Pre-`32e7954` (reveal provisions salt) | `32e7954` (write-only salt) |
|---|---|---|
| Live-device storage dump | Salt provisioned on every unlock → **universal** → presence reveals nothing | Salt present **iff** a hidden wallet exists → a **distinguisher / tell** |
| After a panic wipe | Salt cleared, but a later unlock re-creates it (harmless — universal) | Salt cleared and **stays gone** (a reveal never re-creates it) |
| Hidden-wallet-free device, failed unlock | Provisions the (universal) salt | Provisions nothing |

The deniability property at stake (I3): an adversary with the device must not be able to tell
whether hidden wallets exist. The universal chaff pool is seeded precisely so its *presence*
is non-incriminating. The write-only salt breaks that symmetry for the salt key specifically.

## Possible resolution (neither commit took it)
Provision the salt **universally in `ensureStealthPool`** (the same place/condition the chaff
pool is seeded — "whenever a primary vault exists"), so the salt is present on every wallet
device (no live-device tell) **and** absent after a panic wipe (no primary vault → not
re-seeded → stays gone). This would get both properties at once. It needs careful review:
confirm it introduces no new timing/order oracle and that `ensureStealthPool`'s "best-effort,
don't break unlock" contract still holds.

## Recommendation
- **Auditor:** decide whether write-only salt-presence is an acceptable I3 risk for the
  threat model, or whether the universal-salt option above (or another) is required. This is
  a genuine deniability design call, not a mechanical fix.
- **Engineering:** do **not** change this unilaterally pending that decision — it is
  audit-gated PROVISIONAL deniability code, and it has already absorbed significant churn.

## References
- `src/wallet-core/stealth.js` — `readStealthSalt` / `getOrCreateStealthSalt` /
  `slotForSecret` / `readSlotForSecret` / `tryRevealHidden`; `ensureStealthPool`.
- `src/wallet-core/panic.js` — `DENIABILITY_RESIDUE_KEYS`.
- `src/wallet-core/deniabilityUnlock.js` — constant-KDF unlock (reason for the dummy-KDF miss).
- Commits `d269e54`, `32e7954`. AI review: `ai-review-2026-06-19-unaudited-features.md`.
