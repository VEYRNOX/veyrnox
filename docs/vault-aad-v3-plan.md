# Vault AAD v:3 migration plan (#1111)

Status: PLANNED. Tracking issue: #1111. Owner decision pending.

## Background

`vaultAad(blob)` (`src/wallet-core/vault.js`) builds the GCM `additionalData`
covering plaintext blob fields an attacker could swap without touching the
ciphertext. For Argon2id blobs (v:2) that is `{v, kdf, salt}`. For kek-dek blobs
the salt field is excluded (Codex P1 #1: `encryptVaultWithDek` seals AAD off a
salt-free stub, so including a stale spread-in `salt` would desync encrypt and
decrypt).

## The residual (I-1, info)

kek-dek blobs do NOT bind `kekWrap`, `kekSalt`, or `hardwareKekVersion` into the
AAD. In practice the `kekVersion` is already enforced by the salt-binding chain
(v3 `kekSalt` → `combineKek` → KEK → `wrapDek`), so a version-swap attack
short-circuits at unwrap. The residual is that these fields are not directly
authenticated by GCM at the vault layer — they are only defended by the
downstream key-derivation chain refusing to produce a working DEK.

Rated INFO in the 2026-07-28 internal audit: not exploitable on its own, but a
belt-and-braces v:3 migration is the honest fix.

## Migration approach — atomic, single-transaction

Bump `VAULT_VERSION` 2 → 3. On unlock:

1. Read the current v:2 kek-dek blob.
2. Derive the DEK via the existing KEK-unwrap path (unchanged).
3. Decrypt the vault payload with the v:2 AAD (existing shape).
4. Rebuild `vaultAad` for v:3 to additionally cover `kekWrap`, `kekSalt`, and
   `hardwareKekVersion` (canonical field order, matching the existing pattern
   in #1110 so JSON iteration order cannot desync).
5. Re-encrypt the payload with the v:3 AAD using the SAME DEK — no new key
   derivation, no PIN prompt, no user-visible step.
6. Write the resulting v:3 blob atomically (single write, replacing the v:2
   blob under the same storage key). No cross-blob invariants — each vault
   entry migrates independently.

The migration must run inside the same critical section as unlock so a crash
between decrypt-with-v:2 and write-of-v:3 cannot leave a partially-migrated
state. If the write fails, the in-memory DEK is discarded and the v:2 blob is
untouched on disk — next unlock retries.

Argon2id blobs (which already bind `salt`) do not need any change; the
`includeSalt` branch stays as-is.

## Test plan

- Unit: a v:2 kek-dek fixture round-trips through the migration path and the
  resulting v:3 blob decrypts on the v:3 AAD path.
- Unit: swapping `kekWrap`, `kekSalt`, or `hardwareKekVersion` on a v:3 blob
  causes `decryptVaultWithDek` to throw (GCM auth failure) — the property we
  are actually buying.
- Unit: `vaultAad` for v:3 uses canonical field order and is byte-identical
  regardless of input property insertion order (mirror the #1110 test).
- Regression: existing v:2 Argon2id blobs continue to decrypt unchanged; the
  Argon2id AAD path is not touched.
- Fuzz: interrupt the migration between decrypt and write; confirm next unlock
  still succeeds and the on-disk blob is exactly the pre-migration v:2 blob.

## Rollback strategy

v:3 blobs cannot be read by pre-migration code. The rollback path is therefore
not "read v:3 with old client" — it is "avoid shipping v:3 until the migration
is proven".

- Ship the v:3 writer behind a feature flag (default off). Roll out to the
  internal cohort first, verify on real devices, then flip.
- If a defect surfaces after flip, ship a client that flips the flag back to
  off. New writes go out as v:2 again; already-migrated v:3 blobs are still
  readable by the same client (the v:3 reader stays enabled — only the writer
  is gated). No user is stranded.
- Emergency downgrade of an already-migrated blob is possible in the same
  critical-section shape: read v:3, decrypt with v:3 AAD, re-encrypt with v:2
  AAD, write. Reserved for a defect severe enough to justify losing the AAD
  strengthening; not the normal path.
- No destructive SQL, no schema migration on the server — vault blobs live on
  device, so rollback is entirely client-side.

## Non-goals for #1111

- Not changing the KEK-unwrap chain, `combineKek`, or `wrapDek`.
- Not touching Argon2id (v:2) blob AAD.
- Not adding a user-visible re-enroll step. The migration must be silent.
