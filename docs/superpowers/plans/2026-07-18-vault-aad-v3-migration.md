# Vault AAD v:3 migration — bind `hardwareKekVersion` + `kekSalt` + `kekWrap` to auth-tag

**Owner:** unassigned
**Filed against:** [issue #1111](https://github.com/VEYRNOX/veyrnox/issues/1111)
**Status:** PLANNING (not implemented) — needs owner sign-off + Codex second-pass on the plan before any code lands
**Blast radius:** every KEK-enrolled native vault on installed base (iOS + Android)

## Intent

Close #1111 — the current v:2 kek-dek AAD binds only `{v, kdf}`. GCM structurally catches most tampers (wrong `kekWrap` → wrong DEK → auth-tag fails), but an attacker with vault-file write access can down-stamp `hardwareKekVersion` (e.g. `3 → 2`) without invalidating the tag. If any future code path branches on that stamp for a security decision, the downgrade is silent.

Fold `hardwareKekVersion`, `kekSalt`, and `kekWrap` into the kek-dek AAD so any bit-flip on those fields produces `DECRYPT_FAILED` at the cipher layer, not a policy decision downstream.

## Non-goals

- **Not** changing the plaintext cipher, key derivation, or KDF params.
- **Not** touching web (`web.js`) — WebAuthn PRF path does not carry `hardwareKekVersion`; scope is native-only.
- **Not** unifying with the argon2id `vaultAad` shape (that path already binds `{v, kdf, salt}` — different constraint).
- **Not** an on-unlock hot-path migration (PR #662 explicitly removed the last one because it fired a triple biometric sheet).

## Users

All native-vault users. Web users are unaffected. Users who never enrolled hardware KEK stay on argon2id (also unaffected).

## Constraints (must-hold)

1. **No lockout of installed base.** A v:2 blob on disk today must keep unlocking with the exact H it was wrapped under.
2. **No on-unlock hot-path migration.** Migration re-writes must happen on `changePassword` / `upgradeKekToV3` — never inside `_unlockInner`.
3. **Fail-closed on downgrade attempt.** If a v:3 blob is tampered (any AAD-covered field flipped), `decryptVaultWithDek` must throw at the GCM layer, not degrade silently.
4. **Preserve PR #1079's kek-dek salt exclusion.** The stale-salt exclusion (v:2 kek-dek AAD excludes `blob.salt` because native.js spreads a prior Argon2id blob into the kek-dek blob) must NOT be broken.
5. **Preserve PR #1076's `newV` propagation on `safeWriteVault` write path.** Every kek-dek write site must forward the version so on-disk `v` matches the AAD used to seal.
6. **I3 preserved.** No new deniability tells (no user-visible upgrade banner in a decoy session; no localStorage marker that survives panic wipe).

## Invariants touched

- **I4** (fail honest, fail closed): the AAD extension IS the invariant strengthening — down-stamp attempts now fail closed at the cipher, not the policy.
- **Vault construction** (CLAUDE.md § Security invariants): stamped `hardwareKekVersion` now cryptographically bound to the blob, not just annotated.

Not touched: I1 (keys never leave device), I2 (no silent egress), I3 (deniability), I5 (backend untrusted), I6 (hardware binding). No behavioural change for a legitimate unlock.

## Risks

**HIGH — lockout of installed base if the migration is asymmetric.** Any code path that reads a v:2 blob and calls `decryptVaultWithDek` with v:3-shape AAD produces GCM auth-tag mismatch that presents as "wrong password or corrupted vault." Exactly the class PR #1076 introduced twice; PR #1079 was the emergency fix. Mitigation: `vaultAad()` gates on `blob.v`, NEVER on a constant. Every call site reads AAD from the blob it's about to open, not from `VAULT_VERSION`.

**MEDIUM — Codex-review-only fix cycle time.** PR #1076 landed a P1 chain that survived unit tests because the tests didn't exercise `changePassword → decryptVaultWithDek` through `native.js`. Same test-gap must not repeat here. Mitigation: the test slice below explicitly covers the round-trip through `native.js`, not just the pure `vault.js` API.

**MEDIUM — `changePassword` biometric-prompt count.** The KEK-preserving `changePassword` currently fires 2 biometric prompts (per PR #1028 → PR #1038: `getHardwareFactorWithLockoutFallback` reduced from 3 to 2). Adding a v:2→v:3 upgrade inside this path must NOT add a third. Verify by reading `changePassword`'s current call sequence before touching it.

**LOW — race between `upgradeKekToV3` and `changePassword`.** Both write the vault; both should stamp v:3. If a user runs both concurrently (unlikely in the UI), the write-lock in `withLockSuppressed` serialises them. Verify but do not over-engineer.

**LOW — argon2id-side collateral.** `vaultAad` for argon2id already binds `{v, kdf, salt}`. Changing the kek-dek branch must not alter the argon2id byte-image. Test slice pins both.

## Honest scope

- **BUILT** target only; NOT device-verified without a real KEK-enrolled Pixel + iPhone unlock + `changePassword` + `upgradeKekToV3` round trip.
- No on-chain txid required (vault path, not signing path).
- Codex second-pass required before merge — this is the exact class of change that surfaces P1 regressions.
- Independent third-party audit remains outstanding.

## Design sketch

### `vault.js`

```js
// VAULT_VERSION bumps 2 → 3.
const VAULT_VERSION = 3;

// vaultAad extension for kek-dek AAD, gated on the BLOB'S v (not the constant).
// v:2 kek-dek: {v, kdf} — unchanged (installed base opens exactly as today).
// v:3 kek-dek: {v, kdf, hardwareKekVersion, kekSalt, kekWrap} — bound.
export function vaultAad(blob) {
  const v = blob.v;
  const kdf = blob.kdf;
  // …argon2id branch unchanged…
  if (kdf === 'kek-dek') {
    // Read AAD-covered fields FROM the blob so v:2 and v:3 can coexist.
    if (v >= 3) {
      const parts = [
        `"v":${JSON.stringify(v)}`,
        `"kdf":"kek-dek"`,
        `"hardwareKekVersion":${JSON.stringify(blob.hardwareKekVersion)}`,
        `"kekSalt":${JSON.stringify(blob.kekSalt)}`,
        `"kekWrap":${JSON.stringify(blob.kekWrap)}`,
      ];
      return enc.encode('{' + parts.join(',') + '}');
    }
    // v:2 falls through to today's {v, kdf} shape — byte-identical to current code.
    return enc.encode(`{"v":${JSON.stringify(v)},"kdf":"kek-dek"}`);
  }
  // …
}

// vaultNeedsRekey extended: v:2 kek-dek now flags for lazy upgrade on
// changePassword / upgradeKekToV3 (NOT on _unlockInner).
export function vaultNeedsRekey(vault) {
  const v = vault?.v ?? 0;
  return v < VAULT_VERSION;
}
```

### `native.js` — every kek-dek write site MUST stamp `v: VAULT_VERSION` and forward it through `safeWriteVault`

Call sites already touched by PR #1076 / #1079 (do not miss any):

- `enrollKek` — new enrollments stamp v:3.
- `_unlockInner` — READ v from blob, use for AAD gating. Do NOT rewrite here.
- `changePassword` (KEK branch) — after successful decrypt with the blob's own v, re-seal at v:3. This is the primary migration path.
- `upgradeKekToV3` — extend from "salt-binding only" to "salt-binding + AAD extension." Idempotent check gates on `blob.hardwareKekVersion === 3 && blob.v === 3`.
- `saveVaultContents` — preserves existing v across writes; NEVER downgrades. If reading a v:2 blob, keeps v:2 on write. Migration happens only on `changePassword` / `upgradeKekToV3`.
- (Any other `encryptVaultWithDek` caller — grep before landing.)

### Migration UX

- No user-visible upgrade banner. The migration is silent — happens on next password change or explicit "Upgrade protection" tap.
- Never on unlock (PR #662 rule).
- `upgradeKekToV3` idempotent — safe to tap on an already-v:3 vault.

## Test slice

The test gap that let PR #1076 ship two P1s was: unit tests exercised `vaultAad` in isolation, not the round trip through `native.js`. Do not repeat.

### Pure `vault.js` (extend `vault-aad-canonical.test.js`)

- Golden vector: v:2 kek-dek AAD byte-image UNCHANGED from current code (installed base contract).
- Golden vector: v:3 kek-dek AAD byte-image matches the fixed field order (`v, kdf, hardwareKekVersion, kekSalt, kekWrap`).
- Round-trip: encrypt v:3 → decrypt v:3 succeeds.
- Tamper: flip any AAD-covered field on a v:3 blob (`hardwareKekVersion`, `kekSalt`, `kekWrap`) → decrypt throws.
- Cross-version tamper: rewrite v:3 blob's `v` field to `2` → decrypt throws (would compute wrong AAD).
- `vaultNeedsRekey(v2_kekdek)` returns `true`; `vaultNeedsRekey(v3_kekdek)` returns `false`.

### Integration through `native.js` (new `native.kek-v3-migration.test.js`)

- **Fresh enroll → v:3.** `enrollKek` on a new vault stamps `v:3` and `hardwareKekVersion: 3`; unlock succeeds.
- **v:2 installed base → v:2 unlock.** Load a v:2 kek-dek blob via `_unlockInner` — succeeds without migration. Blob on disk stays v:2.
- **v:2 → v:3 on `changePassword`.** After successful `changePassword` from a v:2 vault, on-disk blob is v:3 with `hardwareKekVersion: 3`; next unlock succeeds.
- **v:2 → v:3 on `upgradeKekToV3`.** Explicit upgrade path — same expected end state as `changePassword`.
- **`saveVaultContents` preserves v.** Adding a wallet to a v:2 vault does NOT bump to v:3 (that's the `changePassword`/`upgradeKekToV3` job); the wallet-add write must round-trip v:2.
- **Down-stamp attack on v:3.** Flip `hardwareKekVersion: 3 → 2` on a v:3 blob on disk; next unlock fails closed (currently succeeds — this test is the operative regression fence).
- **Salt-tamper attack on v:3.** Flip a byte of `kekSalt` on a v:3 blob; next unlock fails closed at the cipher layer, not "wrong PIN."
- **kekWrap-tamper attack on v:3.** Flip a byte of `kekWrap` on a v:3 blob; unlock fails closed.

### Codex second-pass targets

Before merge, ask Codex to specifically look for:
1. Any `encryptVaultWithDek` call site that spreads a stale blob and drops `v: VAULT_VERSION` (PR #1076 P1 #2 class).
2. Any `decryptVaultWithDek` caller that reads AAD from `VAULT_VERSION` instead of the blob's own `v`.
3. Any `changePassword` path that fires an extra biometric prompt (PR #1028 / #1038 count invariant).
4. Any v:2 → v:3 rewrite from inside `_unlockInner` (PR #662 rule — must not exist).
5. Whether the migration honours PR #1079's kek-dek stale-salt exclusion (the extended AAD must NOT accidentally re-introduce `blob.salt` for kek-dek).

## Rollback

If a P1 regression surfaces post-merge:
- **Revert PR** (kek-dek migration is contained to `vault.js` + `native.js`; no schema on-disk change until first `changePassword` / `upgradeKekToV3`).
- Users who ran `changePassword` post-merge and post-migration have v:3 blobs on disk. Reverting `vault.js` alone would break them. **Two-file revert or forward-fix required** — never revert `vault.js` alone.
- Pre-plan a forward-fix branch alongside the initial merge so rollback is symmetric.

## Step-by-step landing sequence

1. **RED tests first** — land `vault-aad-canonical-v3.test.js` + `native.kek-v3-migration.test.js` with all cases red against current main. Confirm every red is meaningful (not a fixture typo).
2. **`vault.js` extension** — `VAULT_VERSION` bump + `vaultAad` v:3 branch. Only the pure module changes; native.js untouched. RED tests for `vault.js` go GREEN; native.js tests still RED.
3. **`native.js` write-site sweep** — one commit per call site: `enrollKek`, `changePassword`, `upgradeKekToV3`, `saveVaultContents`. Each commit runs its subset of RED tests → GREEN.
4. **Codex second-pass** on the combined diff.
5. **Owner review** — required before merge (single-collaborator repo, but this is a class of change that historically hit P1 regressions).
6. **Merge** — squash, single commit on main.
7. **Device verification** — Pixel + iPhone, KEK-enrolled vault, run `changePassword` → confirm on-chain send from v:3 vault (real testnet txid). If a real device is not available, land as BUILT/INTERNAL and defer verification to the next device session.
8. **CLAUDE.md update** — record v:3 as verified/deferred with honest scope note.

## Owner decisions needed before implementation

- [ ] Green-light the design sketch (or request revisions to field order, AAD shape, etc.).
- [ ] Confirm the "no on-unlock migration" rule (PR #662) still stands — the plan assumes it.
- [ ] Confirm scope is native-only (web unaffected — WebAuthn PRF has no `hardwareKekVersion`).
- [ ] Confirm rollback strategy — forward-fix branch pre-planned, or revert-and-lockout accepted.
- [ ] Assign an owner. (Currently unassigned — this document is the ask, not the commitment.)
