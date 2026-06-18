# H2 — Decoy/Hidden 2FA parity (design + phased plan)

**Status:** foundation landed (this PR); format-migration is a review-gated follow-up.
**Severity:** HIGH (security audit). **Area:** coercion-resistance / deniability core.

## The finding
The Action-Password (2FA) second factor is enforced only for the **primary** set.
Decoy/duress and hidden sessions force `actionPasswordConfigured = false`, which:

1. **Bypass** — critical actions (e.g. Send) run with *no* second factor in those sessions.
2. **Distinguishability tell** — if the real wallet prompts PIN + Action Password but a
   handed-over decoy never does, a coercer who knows the setup identifies the decoy.
   That defeats the whole point of deniability.

## Root cause
The Action-Password record lives **inside the encrypted container plaintext**
(`multiVault.js` `makeContainer`/`serializeContainer`; accessor `getActionPasswordRecord`).
But **decoy (`duress.js`) and hidden (`stealth.js`) sets encrypt a *bare mnemonic*, not a
container** — there is nowhere to hang a record. `WalletProvider.jsx` (~:1160) computes
`actionPasswordConfigured` from `getActionPasswordRecord(container)`, which is always null
for those sets. `actionPassword.js` already anticipated this: *"per-SET data … each set
must carry its own (or be chaffed uniformly) so the record's PRESENCE is not a tell — that
wiring lives in the keystore layer (phase 2b)."* H2 is that phase-2b wiring.

## Design
1. **Wrap decoy/hidden payloads in a container** so they can carry an AP record
   (`duress.setDuressVault`, `stealth.createHiddenWallet`/`moveWalletToHidden` encrypt a
   `serializeContainer(...)` instead of a bare mnemonic; the unlock paths already accept a
   container via `parseVault`).
2. **Always-present record** — every container carries a record: a *real* verifier OR a
   `makeChaffActionPasswordRecord()` (this PR). So presence/length never reveal whether an
   AP is configured.
3. **Uniform chaff length** — ALL blobs (primary, decoy, hidden, and every chaff slot in
   `stealth.makeChaff` + `provisionChaff`) must encrypt the **same canonical container
   shape** with the always-present record, or the ciphertext-length distribution itself
   becomes the tell.
4. **`actionPasswordConfigured` from verify, not presence** — since every container now has
   a record, "configured" must mean *a real verify can succeed for the active set*, not
   "field is non-null".

## Design correction (2026-06-18) — prefer fixed-length padding over an always-present chaff record
The original "every container always carries a record (real OR chaff)" plan has a flaw:
once a no-AP set carries a chaff record, **record presence no longer means "configured,"**
so after unlock the gate cannot tell whether the active set actually has an Action Password.
Forcing 2FA on a chaff-only set blocks all its critical actions (a NEW tell); not forcing it
needs a real-vs-chaff marker, which is its own leak risk.

Key realisation: the AP record lives **inside the AES-GCM ciphertext**, so its presence is
invisible without that set's password. A coercer who forces the *decoy* password decrypts
only the decoy and sees the decoy's own config — there is **no cross-set presence leak**. The
ONLY cross-set observable is **ciphertext length** (+ timing). Therefore:

- **Keep the AP record present ⟺ configured** (presence keeps meaning "configured" — no marker).
- **Pad the container plaintext to a fixed length** (independent of AP-presence AND wallet
  count), and size the stealth/duress chaff to that same fixed length.

This is simpler and strictly safer than an always-present chaff record. Under it the
`makeChaffActionPasswordRecord` primitive (PR #230) is replaced by a **fixed-length padding
helper** on the container. The integration points below are unchanged except: instead of
"attach a chaff record when absent," the change is "pad serialized container to FIXED_LEN".

## Tell-hazards (and mitigations) — the reason this is review-gated
| Hazard | Mitigation |
|---|---|
| **Length** — real sets grow (mnemonic→container+AP) while chaff stays mnemonic-size | Every blob incl. all chaff encrypts the same container shape |
| **Presence field** — `actionPassword` attached only-when-present today | Make the field unconditional across ALL containers (real or chaff) |
| **Timing** — capturing a real verifier runs 192 MiB Argon2id | Chaff record uses **pure RNG, no KDF** (done — `makeChaffActionPasswordRecord`) |
| **KDF-param drift** — stale params distinguish chaff from real | Chaff `params` injected from live `KDF_PARAMS` (done) |
| **Migration** — existing primary vaults change on-disk length | One-shot uniform migration at the unlock hook (`WalletProvider.jsx` ~:1178); never lazy/partial |

## Integration points (ordered, file:line)
- `wallet-core/actionPassword.js` — `makeChaffActionPasswordRecord(params)` ✅ **this PR**
- `wallet-core/multiVault.js:83/193` — `makeContainer`/`serializeContainer` attach a record **unconditionally** (real or chaff)
- `wallet-core/stealth.js:243` — `makeChaff` sizes plaintext to the container+AP shape
- `wallet-core/stealth.js:318/386` — `createHiddenWallet`/`moveWalletToHidden` encrypt a container carrying the record
- `wallet-core/duress.js:117` — `setDuressVault` encrypts a container carrying the record
- `wallet-core/provisionChaff.js:45` — duress/panic chaff uses the same container shape
- `lib/WalletProvider.jsx:1160` — derive `actionPasswordConfigured` from a verify on the active set; drop the `isDecoy/isHidden` guards in `setActionPassword`/`clearActionPassword` (:833/:846)

## Test plan (footprint tests FIRST)
- `actionPassword.test.js` — chaff shape/unopenable/non-deterministic ✅ **this PR**
- Extend `provisionChaff.test.js` + `stealth.test.js` — assert real-vs-chaff blobs are
  length/shape-identical *after* the container+AP change (the load-bearing deniability test).
- `multivault.test.js` / `multivault-action-password.test.js` — always-present record + migration.
- `twoFactorGate.test.js` — gate fires identically for primary/decoy/hidden.
- `deniability-timing.test.js` — chaff provisioning runs no extra KDF.

## This PR (foundation only)
- `makeChaffActionPasswordRecord(params)` — the deniability-safe, unopenable, KDF-free,
  same-shape dummy record, with tests. **Behaviourally inert until the keystore wiring
  above lands** — deliberately, so the risky format-migration is reviewed on its own.
