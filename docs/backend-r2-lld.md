# Backend R2 storage — low-level design (LLD)

Status: DESIGN reference — provisional, PRE-AUDIT. Not a security sign-off.
Scope: Encrypted backup sync only (C1-C6). Push and opt-in data relay are OUT of
scope for this document and are separate services reusing these auth/Worker patterns.
Last updated: 2026-06-07

> THIS IS A DESIGN HYPOTHESIS AND AN AUDIT BRIEF, NOT A CERTIFICATION. No security
> property here is verified. Build of this backend is GATED on the independent audit.
> Crypto constructions (KDF/AEAD params, the capability-proof scheme) must be chosen
> and reviewed BEFORE any coding. Do not market as "secure" or "audited".

## Scope recommendation (and why)

v1 is encrypted backup sync only. Push and opt-in data relay are separable services
with different threat surfaces — push touches a per-user routing identifier, data
relay touches external providers. Bundling all three into the R2 design now couples
three audits into one and widens the blast radius before the first one clears. Ship
the storage substrate first; the others reuse the same auth and Worker patterns later.

Auth recommendation: passphrase-derived capability, NO account. An account
reintroduces an identity-to-object link server-side, which is exactly the A2/A6
linkage the threat model exists to prevent. Deriving the access credential from the
same passphrase that encrypts the blob means the backend stores no secret it could
leak and keeps no user record. This has a subtle pitfall (the credential must not be
derivable back to the encryption key) which section 1 handles explicitly.

## 0. Storage invariants (rejection criteria, not goals)

The R2 substrate inherits the product invariants I1-I5 and adds storage-specific
ones. These are rejection criteria: a design that violates any is rejected outright,
regardless of feature value.

- S1 — Ciphertext only. R2 stores AEAD ciphertext. The Worker never sees plaintext,
  holds no decryption key, has no code path that could decrypt.
- S2 — No identity at rest. No object, key name, or metadata field links a blob to a
  person, device, address, or account. The object key is opaque and derived, not
  assigned.
- S3 — Worker is stateless and keyless w.r.t. user data. It holds credentials to
  REACH R2, never credentials to READ user content.
- S4 — Total backend compromise (Worker + R2 + Cloudflare account) loses zero funds
  and reveals no targeting list. Same line as I1, applied to storage: what isn't held
  can't leak.
- S5 — Deniability passthrough. The substrate cannot distinguish a real backup from a
  decoy: both are equal-sized ciphertext under indistinguishable keys. The backend
  must not be able to tell how many real wallets a passphrase protects.

## 1. Cryptographic key schema (all on-device)

The passphrase is the root of everything. From it the device derives, via one
Argon2id pass, a master secret, then splits it with HKDF into purpose-bound sub-keys.
The split is what lets the access credential and the encryption key both come from
the passphrase without one being derivable from the other.

```
passphrase + per-artifact salt
        |  Argon2id (m=256 MiB, t=3, p=1)   <- params are an audit line-item
        v
   master_secret (32 B)
        |  HKDF-SHA-256, distinct info= labels
        |-- enc_key = HKDF(master, "veyrnox/enc/v1")    -> never leaves device
        |-- obj_id  = HKDF(master, "veyrnox/objid/v1")  -> object key name (opaque)
        \-- cap_key = HKDF(master, "veyrnox/cap/v1")    -> proves write/read right
```

Three properties that have to hold, and why:

- obj_id is a 32-byte HKDF output rendered as base32 — it is the R2 object key. The
  backend never assigns it; the client computes it. Because it is a KDF output over
  passphrase+salt, two different passphrases yield unrelated keys, and the backend
  cannot enumerate or guess them (S2).
- cap_key proves the caller holds the passphrase WITHOUT revealing it and WITHOUT
  being reversible to enc_key. The HKDF domain separation guarantees that learning
  cap_key (e.g. a Worker log leak) tells an attacker nothing about enc_key. THIS IS
  THE SUBTLE PITFALL FLAGGED IN THE AUTH RECOMMENDATION: if you derived the capability
  and the encryption key from the same value without separation, a Worker-side leak
  would compromise the blob. It does not here, because of the distinct HKDF info
  labels.
- The salt is stored inside the encrypted artifact's header and is also needed to
  derive obj_id — so the client keeps a local copy of the salt (in the vault), and
  recovery requires passphrase + salt. For pure passphrase-only recovery on a new
  device, the salt must be either memorized-derivable or stored in the user's personal
  cloud alongside the blob. That tension is a real design decision — see RR3.

## 2. Data model in R2

One logical object per backup slot. No directory of users, no manifest, no index.

```
Key:    backups/<base32(obj_id)>
Body:   [ version(1B) | salt(16B) | nonce(24B) | AEAD ciphertext + tag ]
Custom metadata:  NONE  (R2 custom metadata is plaintext; any field breaks S2)
HTTP metadata:    content-type: application/octet-stream only
```

Critical R2-specific rules:

- No R2 custom metadata, ever. R2 custom metadata is stored in plaintext alongside
  the object. Any field there (timestamp, device hint, version note) becomes a
  correlation handle for a breached backend. The version byte lives inside the
  ciphertext envelope's authenticated header instead.
- Fixed-size padding. Pad every artifact to the next bucket (e.g. 64K -> 128K ->
  256K) before encryption so object size doesn't leak how much the user stores. This
  is what makes a real backup and a decoy backup indistinguishable by size (S5).
- Object Lock / versioning on, with a bounded retention. Protects against a coerced
  or malicious overwrite-to-destroy. But retention must be bounded, because indefinite
  retention of old ciphertext versions is itself a risk if the passphrase later leaks.
  Suggested: keep N=3 prior versions, 30-day floor. Bound is an audit parameter.
- Bucket is private; no public access, no presigned-URL issuance from the Worker for
  writes. All access flows through the Worker via the binding, never a direct
  client-to-R2 URL.

## 3. Worker request lifecycle (PUT path)

The Worker is the only thing with an R2 binding, and it is stateless and keyless with
respect to user data. Note what it deliberately does NOT do: no account lookup (there
is no account), no inspection of the body.

```js
export default {
  async fetch(req, env) {
    // 0. Method + size ceiling BEFORE any work (cheap DoS guard)
    if (req.method !== "PUT" && req.method !== "GET") return r(405);
    const len = +req.headers.get("content-length");
    if (req.method === "PUT" && (len > MAX_OBJ || len < MIN_OBJ)) return r(413);

    // 1. Parse opaque inputs. No account lookup — there is no account.
    const objId = req.headers.get("x-obj-id");      // base32, fixed length
    const proof = req.headers.get("x-cap-proof");   // HMAC over challenge
    const chal  = req.headers.get("x-challenge");   // server-issued, short TTL
    if (!validShape(objId, proof, chal)) return r(400);

    // 2. Verify the challenge is one WE issued and unexpired (Durable Object).
    //    Prevents replay; challenge is single-use.
    const rl = env.GATE.get(env.GATE.idFromName(objId));
    const ok = await rl.fetch("/consume", { method: "POST", body: chal });
    if (!ok.ok) return r(429);                        // rate-limited or bad challenge

    // 3. Verify capability proof in CONSTANT TIME.
    //    cap_key is NOT stored server-side; the proof is checked against a one-way
    //    commitment. (Construction is an audit line-item; see section 5 / RR2.)
    if (!constantTimeVerify(objId, chal, proof)) return r(403);

    // 4. Proxy to R2 via binding. The Worker NEVER inspects the body.
    if (req.method === "PUT")
      await env.BUCKET.put(`backups/${objId}`, req.body, { /* version policy */ });
    else
      return new Response((await env.BUCKET.get(`backups/${objId}`))?.body);

    return r(204);   // no body, no echo of anything identifying
  }
}
```

## 4. Capability-proof handshake (the riskiest construction)

This is the single piece most worth making legible before it reaches an auditor,
because it is the one most likely to be wrong if rushed. The flow, step by step:

```
1. Device  -> Worker+DO : request challenge for obj_id
2. Worker+DO            : Durable Object issues a single-use challenge, short TTL
3. DO      -> Device    : challenge
4. Device               : proof = HMAC(cap_key, challenge)   (cap_key never sent)
5. Device  -> Worker+DO : PUT { obj_id, proof, ciphertext }
6. Worker               : constant-time verify proof vs stored one-way commitment
                          (cap_key is NOT held server-side)
7. Worker  -> R2        : proxy ciphertext over the private binding
```

Property the handshake must deliver: at no point does cap_key leave the device, and
the Worker verifies against a one-way commitment rather than holding the key — so a
Worker compromise cannot forge future proofs for OTHER objects. The single-use
challenge issued by the Durable Object is what blocks replay.

The hard part, stated plainly: the Worker must verify the proof WITHOUT storing
cap_key (storing it would violate S3) and WITHOUT cap_key being equal to or derivable
from anything that unlocks the ciphertext. The clean construction is: the client
commits to cap_key at first write by storing commit = HMAC(cap_key, "commit"); that
commitment is a one-way value (not the key itself), so storing it server-side is
acceptable. The Worker then verifies proof = HMAC(cap_key, challenge) against the
commitment. THIS IS EXACTLY THE KIND OF CONSTRUCTION THAT MUST NOT BE HAND-ROLLED — it
goes to the auditor as a named line-item with a specific proposed scheme, not as
production code written now. See RR2.

## 5. Defence-in-depth layers (each assumes the one outside it is bypassed)

1. Edge — WAF, TLS 1.3, bot/DoS controls. Cloudflare front; no origin IP exposed.
2. Worker — capability verify + shape checks, constant-time, keyless re: user data.
3. Durable Object — rate limit, per-objId quota, single-use challenge (replay block).
4. R2 binding — no public access, no presign; Worker is the sole path to the bucket.
5. Envelope — AEAD, size padding, zero metadata; decoy and real indistinguishable (S5).
6. Bucket — private, server-side encryption on, bounded versioning vs coerced overwrite.

No layer is load-bearing alone. Layers 1-4 are compute-tier controls; layer 5 is the
client-side crypto control; layer 6 is the storage control.

## 6. Threat model (STRIDE, abbreviated)

| Threat | Vector | Control | Residual |
|---|---|---|---|
| Spoofing | Forge a write for an obj_id | Capability proof over single-use challenge; can't forge without cap_key | Weak passphrase guessable; Argon2id raises cost, doesn't eliminate |
| Tampering | Modify ciphertext at rest | AEAD tag fails on decrypt; client detects | Backend can delete/withhold (availability, not integrity) |
| Repudiation | n/a — no identities to repudiate | No account, no log of who | By design |
| Info disclosure | Breach reads R2 | Ciphertext only, no metadata, padded size | Passphrase compromise decrypts that user's blob (only theirs) |
| DoS | Flood writes, exhaust quota | WAF + DO rate-limit + size ceiling + per-objId budget | Raises cost/availability, not confidentiality |
| Elevation | Worker compromise reads all | Worker keyless re: content; sees only ciphertext passing through | Could log obj_ids + ciphertext; still cannot decrypt |
| Correlation | Link blobs to a user via timing/IP | TLS; optional proxy path; no stored IP-to-obj map | Metadata (IP/timing) leaks without proxy — disclosed, not hidden |
| Coerced destroy | Passphrase holder overwrites to wipe | Bounded versioning / object lock | Within retention window only |

The single most important row: even a total Worker + R2 + Cloudflare-account
compromise yields opaque, padded, metadata-less ciphertext with no map back to
identity. That is S4 — the same "breach loses zero" line as I1, applied to storage.
The one thing that breaks it is a weak user passphrase, which no server-side control
can fix; it is a client-side KDF-strength and passphrase-UX problem.

## 7. Residual risks (honest, audit-facing)

- RR1 — Passphrase is the whole defence. If it is weak or reused, the padded
  ciphertext is brute-forceable offline once exfiltrated. Argon2id parameters and a
  passphrase-strength gate at backup-creation are the only mitigations, and both are
  client-side.
- RR2 — The capability-proof construction is unbuilt and MUST NOT be hand-rolled.
  Section 4 describes its shape; the actual scheme (commitment storage, constant-time
  verification, replay binding) is a named audit line-item. Getting this wrong either
  breaks deniability or lets the backend distinguish/forge. Do not read the section-3
  pseudocode as buildable as-is.
- RR3 — Salt availability vs portability. Pure passphrase-only recovery on a fresh
  device needs the salt, which either lives in the user's cloud (acceptable — it is
  not secret, but it IS a correlation handle if stored unpadded) or is derived
  deterministically (weaker). This is a real fork in the design, not a settled point,
  and it shapes the whole recovery UX. Decide it explicitly, ideally with the auditor.
- RR4 — Metadata correlation (IP/timing) persists without the proxy/Tor path; most
  users won't use it. Honest claim is "you control your data," not "you are
  anonymous."
- RR5 — Versioning is a double-edged control. It defends against coerced-overwrite but
  retains old ciphertext that a later passphrase compromise would unlock. Bounded
  retention is the compromise; the bound is an audit parameter.
- RR6 — The crypto primitives named here (Argon2id m=256MiB/t=3/p=1,
  XChaCha20-Poly1305, HKDF-SHA-256) are sensible defaults, NOT audited choices. Per
  build gate 2, constructions are chosen and reviewed before coding — treat every
  parameter as a starting proposal for the auditor to confirm or change.
- RR7 — None of this is audited. Every parameter (Argon2id cost, padding buckets,
  retention N, challenge TTL) is a pre-audit estimate and a build gate.

## 8. Build gates

1. Independent audit reviews this LLD before any backend / seed-touching build.
2. Crypto constructions (KDF/AEAD params, the capability-proof scheme) chosen and
   reviewed before coding.
3. Parameters (Argon2id cost, padding buckets, retention, challenge TTL) fixed as
   audit outputs, not developer defaults.

This document is a design hypothesis and an audit brief, not a sign-off. The backend
is not built until the independent audit reviews this architecture.

## Related
docs/backend-security-architecture.md · docs/backend-platform-architecture (3 diagrams) ·
seed-backup + cloud-recovery spec (C1-C6) · docs/backend-cost-model.md ·
docs/backend-dependency-map.md
