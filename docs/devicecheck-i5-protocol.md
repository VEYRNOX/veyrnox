# iOS DeviceCheck — I5-safe validation protocol (DRAFT for owner review)

**Status:** DRAFT · not implemented · not audited · issue [#2277](https://github.com/VEYRNOX/veyrnox/issues/2277) DoD 2.
**Scope:** design of the independent DeviceCheck signal that complements App Attest at the pre-sign gate on iOS.
**Related:** `docs/rasp-attestation-egress-decision.md` (Option B signed off 2026-07-13), `ios/App/App/AppAttestPlugin.m`, `src/rasp/attestation.js`.

> Codeless. This doc decides what the signal MEANS, how the server MUST behave, and what fails closed. Only after the owner signs off do items 3–6 of #2277 get code.

---

## 1. Why DeviceCheck at all

App Attest already proves "a Secure-Enclave key was attested by Apple on genuine hardware for this app bundle." What it does NOT prove:
- The token exchange happened live at pre-sign time (a stored attestation blob can be replayed).
- The device has not been previously flagged as compromised by the app itself.

DeviceCheck adds ONE independent signal: **Apple's DeviceCheck servers accept a live-generated token from this device right now.** That is orthogonal to App Attest's SE-key assertion and cannot be forged without a live iOS device.

## 2. What we deliberately do NOT use

DeviceCheck exposes two persistent bits per device that our server can set/read via Apple's API. **We do not use the bits.** Using them would make our backend authoritative over which devices may sign — a direct I5 violation (backend-untrusted). Bit state also creates a per-device server-side record that outlives an app uninstall, a privacy tell we do not need.

The signal we take from DeviceCheck is single-valued: **Apple accepted a fresh token from a real iOS device**, or it did not.

## 3. Protocol

Trust boundary: the client is authoritative over the gate decision. The server relays Apple's accept/reject, signs a short-lived receipt, and holds no bit state.

```
client                          server (Cloudflare Worker)         Apple
──────                          ─────────────────────────         ─────
generateToken() ──token──▶
send { nonce, token, ts } ────▶ nonce fresh? ts within 60s?
                                bind (nonce||bundleId) as tx_id
                                POST /v1/query_two_bits ────────▶ validate token
                                                                  200 no-bits / 4xx
                                receipt = JWT{
                                  iss: veyrnox-attest,
                                  iat, exp (iat+120s),
                                  tx_id, nonce,
                                  apple_ok: bool
                                } signed ES256
                              ◀── receipt ────────────────────────
verify(receipt.sig, pinned pubkey)
require receipt.nonce == our nonce
require receipt.tx_id == sha256(nonce||bundleId)
require receipt.exp not passed
signal = receipt.apple_ok
```

Notes on each step:

- **Nonce.** 32 bytes CSPRNG, single-use, held in memory on the client for the duration of the exchange. Never persisted. Same shape as the App Attest clientDataHash nonce, but independent (do not reuse).
- **Timestamp.** Client sends `ts`. Server rejects `|now - ts| > 60s`. Prevents stale-token replay.
- **Apple call.** Server calls `POST https://api.devicecheck.apple.com/v1/query_two_bits` (production) with our DeviceCheck JWT signing key. We read; we never write. The two bits are ignored — only Apple's 200-with-body vs 4xx/`Bit State Not Found` tells us "Apple recognised the token as a live device."
  - `Bit State Not Found` for a first-ever token is a valid ACCEPT (the device is real, just never had bits written). Distinguish this from `Invalid Device Token` which is REJECT.
- **Receipt.** ES256 JWT, `exp = iat + 120s`. Public key pinned in the iOS binary (embedded as a constant, same pattern as `PlayIntegrityJwsVerifier`). Server holds only the private key.
- **Client verification.** Full signature check, nonce equality, tx_id equality, exp check. Any mismatch → treat as UNAVAILABLE, not REJECT (a broken server must not fabricate BLOCK either).

## 4. What the client does with the signal

Fed into `composeConditions` as a second attestation input alongside App Attest:

| App Attest | DeviceCheck | Composed |
|---|---|---|
| CLEAN | apple_ok=true | CLEAN |
| CLEAN | apple_ok=false | **INTEGRITY_FAIL** |
| INTEGRITY_FAIL | either | INTEGRITY_FAIL (existing) |
| INTEGRITY_UNAVAILABLE | apple_ok=true | INTEGRITY_UNAVAILABLE (WARN — one leg not enough) |
| INTEGRITY_UNAVAILABLE | UNAVAILABLE | INTEGRITY_UNAVAILABLE (existing) |
| CLEAN | UNAVAILABLE (network/server) | INTEGRITY_UNAVAILABLE (WARN — same posture as one leg missing) |

**Escalation to `INTEGRITY_FAIL` when BOTH legs are UNAVAILABLE (DoD 3 + 5) is deliberately NOT enabled in this design's first landing.** It stays WARN until DoD 6 device evidence proves both legs work on real hardware. Same ordering hazard as #2276 DoD 3: the session latch at `attestation.js:298` self-renews a BLOCK once tripped.

## 5. Per-session cache

Cache the receipt's `apple_ok` on the client, keyed by app process lifetime, invalidated on:
- app lock event (same trigger as the existing latch reset)
- receipt `exp` reached (120s from server iat)
- deniability/demo session entered

Purpose: avoid a fresh Apple round-trip on every pre-sign inside one session. Not a state store — a rate-limit on our own egress.

## 6. Invariant compliance

| Invariant | How this design holds it |
|---|---|
| **I1** keys never leave device | Payload is nonce + Apple's opaque token. No key material. |
| **I2** no silent egress | Fires at pre-sign gate only, same trigger as App Attest. User has just initiated a signing action. |
| **I3** deniability sacred | `attestationProbeSource()` already checks `isDeniabilityOrDemoActive()` FIRST. Same guard applies — zero DeviceCheck egress in decoy/demo. |
| **I4** fail honest/closed | Broken signature, expired receipt, network fail, malformed response → UNAVAILABLE, never CLEAN. Apple explicit REJECT → INTEGRITY_FAIL. |
| **I5** backend untrusted | Server relays and signs a receipt; client validates the receipt with a pinned key and makes the gate decision. Server holds no bit state and cannot decide "this device may sign." |

The residual I5 concern is that our server COULD lie: return `apple_ok:true` for a token Apple actually rejected. Two things bound it: (a) the client cannot detect this lie (the ceiling of a server that stands between us and Apple's endpoint), (b) the wrong direction of the lie is the safe one — the server cannot fabricate a BLOCK, because a bad signature or bad nonce maps to UNAVAILABLE not FAIL. A lying server can WARN-when-it-should-BLOCK, never BLOCK-when-it-should-WARN. That trade is consistent with Option B's stated posture that a backend may relay but not decide.

## 7. Where the server lives

Preferred: **new Cloudflare Worker `veyrnox-attest`** (separate from `veyrnox-tip`). Justification:
- Keeps DeviceCheck private key isolated from the AI chat surface.
- Same infra pattern (Wrangler, HMAC-signed request from a Supabase Edge Function proxy) the locked chain already uses.
- Rotatable independently.

Owner decision needed before implementation. Alternative is a Supabase Edge Function, but a Worker matches the "core infra wiring" pattern in CLAUDE.md — the reason `veyrnox-tip` is a Worker rather than an Edge Function.

Secrets needed:
- `APPLE_DEVICECHECK_KEY_ID` — Apple's key identifier.
- `APPLE_DEVICECHECK_TEAM_ID` — `R54268MWFV`.
- `APPLE_DEVICECHECK_PRIVATE_KEY` — `.p8`, wrangler secret.
- `RECEIPT_SIGNING_PRIVATE_KEY` — ES256, wrangler secret. Public key pinned in iOS binary.

## 8. What this doc does NOT commit to

- Any timing or cost estimate.
- The receipt signing key rotation cadence (needs its own decision — pinning a single public key in the binary means rotation requires an app release).
- Whether the same receipt signing key is reused across environments (recommend NO — separate keys per env, like the Transak split).
- The rate-limit per device on the Worker side (recommend 1 per pre-sign gate, hard cap 60/hour, but this is a Worker config detail).

## 9. Owner decisions required to unblock code

1. Approve or amend the "we never write bits" position (§2).
2. Approve or amend "Cloudflare Worker, not Edge Function" (§7).
3. Approve or amend "escalate-to-FAIL stays off until DoD 6 device evidence" (§4).
4. Approve or amend the receipt lifetime (`exp = iat + 120s`, §3).
5. Approve or amend the session cache scope (§5).

Once (1)–(5) are settled, code lands under items 3–6 of #2277, behind a build flag defaulting off. Item 7 (real-iPhone exercise) then flips the flag once evidence exists. Item 3 escalation lands last.
