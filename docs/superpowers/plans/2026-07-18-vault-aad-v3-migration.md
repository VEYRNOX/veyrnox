# Vault AAD v:3 migration — bind `hardwareKekVersion` + `kekSalt` + `kekWrap` to auth-tag

**Owner:** unassigned
**Filed against:** [issue #1111](https://github.com/VEYRNOX/veyrnox/issues/1111)
**Status:** PLANNING — REVISION 2 (Codex plan-pass returned REQUIRES_PLAN_REVISION on r1)
**Blast radius:** every KEK-enrolled native vault on installed base (iOS + Android)

## Revision history

- **r1** (2026-07-18, merged PR #1139): initial plan. Codex second-pass returned `REQUIRES_PLAN_REVISION` — 4 P1s + 3 P2s ([#1111 comment](https://github.com/VEYRNOX/veyrnox/issues/1111#issuecomment-5008592301)). Findings:
  - P1a: `encryptVaultWithDek(secret, dek)` seals AAD from an internal `{v, kdf, iv}` stub — the caller (`native.js`) knows `hardwareKekVersion`/`kekSalt`/`kekWrap` only AFTER seal. r1 implicitly assumed seal-time knowledge → immediate lockout on first v:3 seal.
  - P1b: `changePassword` / `upgradeKekToV3` rotate `{kekWrap, kekSalt, hardwareKekVersion}` while preserving `blob.iv` / `blob.ct` — seed ciphertext sealed under v:2 AAD would fail v:3 AAD verification on next unlock.
  - P1c: Plan said "native-only" but `VAULT_VERSION` is a shared global. Bumping to 3 breaks argon2id `decryptVault` (`v ∈ {1, 2}` only), plus `duress.js` / `stealth.js` / `vaultBackup.js` which reuse the shared encrypt/decrypt.
  - P1d: `vaultBackup.js` `isValidBlob()` / `isValidBackup()` (`vaultBackup.js:189,201,207`) accept only v:1 or v:2 — v:3 seals fail backup verify.
  - P2a: `saveVaultContents` (`native.js:780`) takes `newV` from `encryptVaultWithDek()` — plan's "preserve v" contract inexpressible with current helper.
  - P2b: `withLockSuppressed` (`native.js:219,450`) is NOT a write lock; it's a lock-suppression counter. r1's concurrency claim was false.
  - P2c: Rollback scope too narrow — mixed-version storage would strand v:3 non-KEK blobs even if primary KEK vault wasn't migrated.

- **r2** (this document): closes all r1 findings. Redesign summarized in "Design sketch (r2)" below. Requires a second Codex plan-pass before any code lands.

## Intent

Close #1111 — the current v:2 kek-dek AAD binds only `{v, kdf}`. GCM structurally catches most tampers (wrong `kekWrap` → wrong DEK → auth-tag fails), but an attacker with vault-file write access can down-stamp `hardwareKekVersion` (e.g. `3 → 2`) without invalidating the tag. If any future code path branches on that stamp for a security decision, the downgrade is silent.

Fold `hardwareKekVersion`, `kekSalt`, and `kekWrap` into the kek-dek AAD so any bit-flip on those fields produces `DECRYPT_FAILED` at the cipher layer, not a policy decision downstream.

## Non-goals

- **Not** changing the plaintext cipher, key derivation, or KDF params.
- **Not** touching web (`web.js`) — WebAuthn PRF path does not carry `hardwareKekVersion`; scope is native-only.
- **Not** unifying with the argon2id `vaultAad` shape (that path already binds `{v, kdf, salt}` — different constraint).
- **Not** an on-unlock hot-path migration (PR #662 explicitly removed the last one because it fired a triple biometric sheet).
- **Not** bumping the argon2id `VAULT_VERSION` from 2 (r1 mistake — see r2 fix under "P1c" below).

## Users

All native-vault users. Web users are unaffected. Users who never enrolled hardware KEK stay on argon2id (also unaffected).

## Constraints (must-hold)

1. **No lockout of installed base.** A v:2 blob on disk today must keep unlocking with the exact H it was wrapped under.
2. **No on-unlock hot-path migration.** Migration re-writes must happen on `changePassword` / `upgradeKekToV3` — never inside `_unlockInner`.
3. **Fail-closed on downgrade attempt.** If a v:3 blob is tampered (any AAD-covered field flipped), `decryptVaultWithDek` must throw at the GCM layer, not degrade silently.
4. **Preserve PR #1079's kek-dek salt exclusion.** The stale-salt exclusion (v:2 kek-dek AAD excludes `blob.salt` because native.js spreads a prior Argon2id blob into the kek-dek blob) must NOT be broken.
5. **Preserve the KEK-branch `changePassword` biometric-prompt count invariant** (PR #1028 / PR #1038 established 2 prompts on the KEK branch — a re-seal step must not add a third).
6. **Argon2id path is untouched.** No new `v` values on the argon2id branch; `decryptVault` / `duress.js` / `stealth.js` / `vaultBackup.js` continue to accept `v ∈ {1, 2}` for argon2id blobs.
7. **I3 preserved.** No new deniability tells (no user-visible upgrade banner in a decoy session; no localStorage marker that survives panic wipe).

## Invariants touched

- **I4** (fail honest, fail closed): the AAD extension IS the invariant strengthening — down-stamp attempts now fail closed at the cipher, not the policy.
- **Vault construction** (CLAUDE.md § Security invariants): stamped `hardwareKekVersion` now cryptographically bound to the blob, not just annotated.

Not touched: I1 (keys never leave device), I2 (no silent egress), I3 (deniability), I5 (backend untrusted), I6 (hardware binding). No behavioural change for a legitimate unlock.

## Risks (r2)

- **HIGH — lockout on any AAD/blob shape mismatch.** Closed in r2 by the `encryptVaultWithDek` signature change (P1a fix). Every migration path now composes the FINAL wrap-shape FIRST, hands it to a single sealer, and the on-disk blob equals the sealed shape byte-for-byte.
- **HIGH — argon2id collateral.** Closed in r2 by the per-kdf version scheme (P1c fix). `VAULT_VERSION_ARGON2ID = 2` stays; a NEW `KEK_BLOB_VERSION = 3` gates the kek-dek path only.
- **HIGH — installed v:2 KEK vaults bricked on migration.** Closed in r2 by the re-seal step (P1b fix). `changePassword` / `upgradeKekToV3` decrypt inner → generate fresh IV → re-encrypt under new AAD as part of the migration transaction.
- **MEDIUM — Codex-review-only fix cycle time.** Same class as r1. Mitigated by full integration-through-`native.js` test slice, PLUS a second Codex plan-pass (this doc awaiting r2 review).
- **MEDIUM — biometric prompt count regression.** The re-seal step uses the SAME DEK just derived for the migration write — no extra `getHardwareFactorWithLockoutFallback` call, no extra biometric prompt. Prompt count invariant preserved.
- **LOW — race between `upgradeKekToV3` and `saveVaultContents`.** Closed in r2 by the write-mutex (P2b fix). Both paths acquire a single in-memory `Mutex` on the native keystore before their read-modify-write cycle.
- **LOW — backup restore of a v:3 blob on an older client.** Closed in r2 by the backup validator update (P1d fix) landing atomically with the AAD extension.

## Design sketch (r2)

### `vault.js` — per-kdf version constants

```js
// Argon2id path — unchanged. Constant name renamed for clarity.
const VAULT_VERSION_ARGON2ID = 2;

// KEK-dek path — NEW. v:2 kek-dek → {v, kdf}. v:3 kek-dek → {v, kdf, hardwareKekVersion, kekSalt, kekWrap}.
const KEK_BLOB_VERSION = 3;

// vaultAad gates strictly on blob.v so v:2 and v:3 coexist on disk without collision.
export function vaultAad(blob) {
  const v = blob.v;
  const kdf = blob.kdf;
  if (kdf === 'kek-dek') {
    if (v >= 3) {
      // Fixed field order: v, kdf, hardwareKekVersion, kekSalt, kekWrap.
      return enc.encode(
        `{"v":${JSON.stringify(v)},"kdf":"kek-dek",` +
        `"hardwareKekVersion":${JSON.stringify(blob.hardwareKekVersion)},` +
        `"kekSalt":${JSON.stringify(blob.kekSalt)},` +
        `"kekWrap":${JSON.stringify(blob.kekWrap)}}`
      );
    }
    // v:2 kek-dek — byte-identical to current code (installed base contract).
    return enc.encode(`{"v":${JSON.stringify(v)},"kdf":"kek-dek"}`);
  }
  // Argon2id branch — unchanged.
  // (existing {v, kdf, salt} shape)
}
```

### `vault.js` — `encryptVaultWithDek` accepts an aadShape callback (P1a fix)

```js
// NEW signature: caller passes an aadShape function that returns the FINAL blob shape
// (the wrap composition, NOT just {v, kdf, iv}). AAD is built from that shape, and
// the caller then persists the SAME shape verbatim. No stub, no divergence.
//
// Backward-compat wrapper preserves the v:2 caller contract for callers that don't
// need the extended AAD.
export async function encryptVaultWithDek(secret, dek, aadShape = null) {
  const iv = randomBytes(12);
  const seal = { v: KEK_BLOB_VERSION, kdf: 'kek-dek', iv: b64(iv) };
  // Legacy callers: aadShape null → v:2 shape (byte-identical to current).
  const shapeForAad = aadShape
    ? aadShape({ ...seal, iv: b64(iv) })
    : { v: 2, kdf: 'kek-dek' };
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: vaultAad(shapeForAad) },
    dek,
    enc.encode(secret),
  );
  return { ...seal, ct: b64(ct), v: shapeForAad.v };
}
```

`native.js` then calls it with an explicit shape that includes the final wrap:

```js
// native.js — inside changePassword / upgradeKekToV3 / enrollKek / saveVaultContents
const sealed = await encryptVaultWithDek(secretString, dek, (partial) => ({
  ...partial,
  v: KEK_BLOB_VERSION,
  hardwareKekVersion: newHardwareKekVersion,
  kekSalt: newKekSalt,
  kekWrap: newKekWrap,
}));
await safeWriteVault({
  ...sealed,
  hardwareKekVersion: newHardwareKekVersion,
  kekSalt: newKekSalt,
  kekWrap: newKekWrap,
});
```

### `vault.js` — `decryptVaultWithDek` reads shape from disk (P1b fix)

```js
// AAD gate reads FROM the blob it's about to open — never from a constant.
export async function decryptVaultWithDek(blob, dek) {
  const v = blob.v ?? 1;
  const gcmOpts = { name: 'AES-GCM', iv: b64u(blob.iv) };
  // v:1 kek-dek: legacy no-AAD path (backward compat).
  // v:2 kek-dek: {v, kdf} AAD (PR #1076).
  // v:3 kek-dek: {v, kdf, hardwareKekVersion, kekSalt, kekWrap} AAD.
  if (v >= 2) gcmOpts.additionalData = vaultAad(blob);
  // If shape doesn't match what was sealed, GCM throws — fail closed at the cipher.
  return dec.decode(await crypto.subtle.decrypt(gcmOpts, dek, b64u(blob.ct)));
}
```

### `native.js` — re-seal on migration (P1b fix)

`changePassword` KEK branch and `upgradeKekToV3` MUST decrypt the inner seed with the CURRENT (v:2) shape, then re-seal it with the NEW (v:3) shape and NEW IV in a single atomic transaction:

```js
// native.js: changePassword (KEK branch) and upgradeKekToV3 both do:
//
//   1. read on-disk blob (v:2 kek-dek)
//   2. hardware unlock → derive OLD H, OLD kek → unwrap OLD dek → decrypt inner seed
//   3. generate NEW kekSalt, NEW hardwareKekVersion=3, NEW H (via SE/StrongBox),
//      NEW kek, NEW dek, NEW kekWrap
//   4. RE-SEAL the seed with encryptVaultWithDek(seed, newDek, aadShape=v3-shape)
//   5. write the v:3 blob atomically — everything or nothing
```

The re-seal reuses the same biometric prompt that already fires for the migration write — no extra prompt (invariant #5).

### `vault.js` — `vaultNeedsRekey` per-kdf gated (P1c fix)

```js
export function vaultNeedsRekey(vault) {
  const v = vault?.v ?? 0;
  const kdf = vault?.kdf;
  if (kdf === 'kek-dek') return v < KEK_BLOB_VERSION;
  // Argon2id blobs are pinned at v:2 — never flag for rekey by this function.
  return v < VAULT_VERSION_ARGON2ID;
}
```

### `vaultBackup.js` — `isValidBlob` accepts v:3 for kek-dek only (P1d fix)

```js
function isValidBlob(b) {
  if (!b || typeof b !== 'object') return false;
  const v = b.v;
  if (b.kdf === 'kek-dek') {
    return typeof v === 'number' && v >= 1 && v <= KEK_BLOB_VERSION;
  }
  // Argon2id path — unchanged.
  return typeof v === 'number' && v >= 1 && v <= VAULT_VERSION_ARGON2ID;
}
```

**Backup file backward-compat:** an older client trying to restore a v:3 backup file would fail this validator — same class as any protocol bump. Ship a version-check disclosure sentence in the backup UI ("This backup was created with a newer app version. Update to restore.").

### `native.js` — real write-mutex (P2b fix)

```js
// A single in-memory Mutex serializes every write path that mutates the vault blob:
// enrollKek, changePassword, upgradeKekToV3, saveVaultContents, unenrollKek.
// Reads (_unlockInner) do NOT acquire the mutex.
//
// Implementation: a Promise-chained queue. Each caller awaits the previous write's
// resolution before starting its own read-modify-write. Mutex is process-local
// (the app's JS context is single-threaded per WebView; the mutex protects against
// concurrent user actions triggering overlapping writes, not against multi-process).
//
// withLockSuppressed retained for its ACTUAL job (suppressing the auto-lock timer
// during a hardware-KEK flow). Renaming for clarity to avoid the r1 confusion:
// suppressLockTimer.
```

### `saveVaultContents` (P2a fix)

`saveVaultContents` reads the on-disk `v`, calls `encryptVaultWithDek` with an aadShape that PRESERVES the read `v` (never bumps), and writes the same shape back. If the on-disk vault is v:2, the write is v:2. Migration to v:3 happens ONLY on `changePassword` / `upgradeKekToV3` (the two migration paths).

### Rollback scope (P2c fix)

Any client running the v:3-capable code has:
- Native KEK vaults that may be v:2 (installed base) or v:3 (post-migration).
- Argon2id vaults (bare wallet / duress / hidden / backup) that are ALL v:2 (unchanged by this plan).

A revert of `vault.js` + `native.js` + `vaultBackup.js` (three files, atomic revert) restores the pre-migration state. Argon2id blobs remain readable because we NEVER changed their `v`. Post-migration v:3 KEK vaults would need to fall back to their pre-migration v:2 form — for that, the migration write MUST NOT delete the pre-migration blob until the new blob is successfully persisted AND readable. Concretely:

```
migration transaction:
  a. read v:2 blob → blob_v2
  b. decrypt inner seed with blob_v2's shape
  c. compose blob_v3 (fresh iv, new wrap, new AAD)
  d. write blob_v3 to a STAGING key ("veyrnox-vault-staging")
  e. read blob_v3 back, decrypt, verify seed matches
  f. atomically rename staging → primary (delete v:2 last)
```

Rollback recipe (documented in the revert PR body):
1. Revert `vault.js`, `native.js`, `vaultBackup.js` — atomic.
2. Users with a v:3 primary blob on disk see "please tap Restore from backup" — but the pre-migration v:2 seed is still recoverable from the biometric because the rollback client's `decryptVaultWithDek` will refuse v:3, so the user goes through the standard restore-from-seed flow using their existing backup file.
3. Post-rollback, no v:3 blob is ever created, so the situation stabilises.

**Alternative to accept-lockout-on-rollback:** provide a `downgradeKekToV2` function alongside `upgradeKekToV3` from day one, gated behind an owner debug UI. Ship it disabled but ready. Escape hatch, not a normal user path.

## Honest scope

- **BUILT** target only; NOT device-verified without a real KEK-enrolled Pixel + iPhone unlock + `changePassword` + `upgradeKekToV3` round trip.
- No on-chain txid required (vault path, not signing path).
- Codex second-pass required on THIS r2 doc before merge.
- Independent third-party audit remains outstanding per CLAUDE.md.

## Test slice (r2)

The test gap that let PR #1076 ship two P1s was: unit tests exercised `vaultAad` in isolation, not the round trip through `native.js`. Do not repeat.

### Pure `vault.js` (extend `vault-aad-canonical.test.js`)

- Golden vector: v:2 kek-dek AAD byte-image UNCHANGED from current code (installed base contract).
- Golden vector: v:3 kek-dek AAD byte-image matches the fixed field order.
- Round-trip: `encryptVaultWithDek(secret, dek, aadShape_v3)` + `decryptVaultWithDek(blob_v3, dek)` succeeds; AAD byte-image equals the on-disk blob.
- Backward compat: `encryptVaultWithDek(secret, dek)` (no aadShape) → v:2 blob → `decryptVaultWithDek(blob_v2, dek)` succeeds and BYTE-MATCHES current AAD.
- Tamper: flip any AAD-covered field on a v:3 blob (`hardwareKekVersion`, `kekSalt`, `kekWrap`) → decrypt throws.
- Cross-version tamper: rewrite v:3 blob's `v` field to `2` → decrypt throws (AAD shape switches, tag fails).
- `vaultNeedsRekey`: v:2 kek-dek returns true; v:3 kek-dek returns false; v:2 argon2id returns false; v:1 argon2id returns true.
- Argon2id path untouched: v:2 argon2id round-trip byte-identical to pre-r2 code.

### Integration through `native.js` (new `native.kek-v3-migration.test.js`)

- **Fresh enroll → v:3.** `enrollKek` on a new vault stamps `v:3` and `hardwareKekVersion: 3`; unlock succeeds.
- **v:2 installed base → v:2 unlock.** Load a v:2 kek-dek blob via `_unlockInner` — succeeds without migration. Blob on disk stays v:2.
- **v:2 → v:3 on `changePassword` re-seals seed ciphertext.** After successful `changePassword` from a v:2 vault, on-disk blob is v:3, `iv` is DIFFERENT from the pre-migration blob (proves re-seal, not just wrap-rewrite), unlock succeeds.
- **v:2 → v:3 on `upgradeKekToV3` re-seals seed ciphertext.** Same expected end state as `changePassword`; verify `iv` changed.
- **`saveVaultContents` preserves v.** Add-wallet on a v:2 vault → blob stays v:2. Add-wallet on a v:3 vault → blob stays v:3. NEVER auto-bumps.
- **Down-stamp attack on v:3.** Flip `hardwareKekVersion: 3 → 2` on a v:3 blob on disk; next unlock fails closed (currently succeeds).
- **Salt-tamper attack on v:3.** Flip a byte of `kekSalt` on a v:3 blob; unlock fails closed at cipher, not "wrong PIN."
- **kekWrap-tamper attack on v:3.** Flip a byte of `kekWrap` on a v:3 blob; unlock fails closed.
- **Staged-write rollback safety.** Kill the migration transaction between step (d) and step (f) — on next start, the on-disk primary is still v:2 (staged v:3 blob is orphaned but harmless), unlock proceeds normally.
- **Concurrency: `changePassword` racing `saveVaultContents`.** Launch both concurrently; the mutex serialises them; last-writer state is deterministic; neither corrupts the other.
- **Argon2id unaffected.** Bare / duress / hidden vaults all remain v:2, encrypt and decrypt unchanged.

### Backup path (new `vaultBackup-v3.test.js`, closing P1d)

- `isValidBlob` accepts v:3 kek-dek, rejects v:4 kek-dek, still rejects v:3 argon2id.
- `createBackupEnvelope` from a v:3 primary produces a valid envelope; `verifyBackupEnvelope` accepts it; round-trip restores identically.
- `parseBackupFile` handles a v:3 envelope from a real device dump.
- Older-client compatibility: a fake pre-r2 `isValidBlob` (rejects v:3) throws a specific "backup requires app update" error rather than a generic parse failure.

### Codex second-pass targets (r3 review)

Before merging the implementation PR, ask Codex to specifically look for:
1. Any `encryptVaultWithDek` call site missing the new `aadShape` argument (silent v:2 stamp).
2. Any `decryptVaultWithDek` caller reading AAD from a constant instead of `blob.v`.
3. Any `changePassword` or `upgradeKekToV3` path that skips the re-seal step (P1b regression).
4. Any code path that emits `v: 3` on an argon2id blob (P1c regression).
5. Any `saveVaultContents` path that bumps `v` on a non-migration write (P2a regression).
6. Any race in the migration transaction between staged write and primary rename (rollback safety).
7. Whether the new `Mutex` is actually held across the full read-modify-write, not just the write.
8. Whether the `withLockSuppressed → suppressLockTimer` rename introduces any missed call site.

## Rollback (r2)

If a P1 regression surfaces post-merge:

**Case A: no user has migrated yet (or the bug is in the pre-migration path).** Revert `vault.js`, `native.js`, `vaultBackup.js` — atomic three-file revert. Nothing on disk changed shape.

**Case B: some users have migrated to v:3.** Two paths:
- (a) Ship a forward-fix that stays on v:3 and resolves the P1 without changing on-disk shape. Preferred.
- (b) Revert AND ship a `downgradeKekToV2` migration in the revert PR that safely re-seals v:3 → v:2. Requires the staged-write pattern in reverse. Ugly. Only if (a) is impossible.

The staged-write pattern (migration step (d)–(f)) means Case B is bounded: the pre-migration v:2 blob is deleted ONLY AFTER the v:3 blob is successfully persisted and verified readable. If the migration transaction dies mid-way, the on-disk primary stays v:2.

## Step-by-step landing sequence (r2)

1. **Codex second-pass on THIS r2 doc.** Must return `SAFE_TO_IMPLEMENT` before starting.
2. **RED tests first** — land the full test slice (pure, integration, backup) with all cases red against current main. Confirm every red is meaningful.
3. **`vault.js` — constants + `vaultAad` v:3 branch + `encryptVaultWithDek` aadShape API.** Only pure module changes. Pure tests go GREEN.
4. **`vault.js` — `decryptVaultWithDek` blob-shape gate + `vaultNeedsRekey` per-kdf.** More pure tests GREEN.
5. **`vaultBackup.js` — `isValidBlob` per-kdf gate.** Backup tests GREEN.
6. **`native.js` — Mutex introduction + `withLockSuppressed → suppressLockTimer` rename.** No functional change yet. Existing tests stay GREEN.
7. **`native.js` — write-site sweep, one commit per site: `enrollKek`, `changePassword` KEK branch, `upgradeKekToV3`, `saveVaultContents`, `unenrollKek`.** Each commit runs its subset of integration tests → GREEN.
8. **Codex second-pass on the combined diff.**
9. **Owner review** — required before merge.
10. **Merge** — squash, single commit on main.
11. **Device verification** — Pixel + iPhone: fresh enroll (v:3), unlock, `changePassword`, `upgradeKekToV3`, tamper attack. Real testnet txid from the v:3 vault confirms the KEK-gated send still fires.
12. **CLAUDE.md update** — record v:3 as verified/deferred with honest scope note.

## Owner decisions needed before implementation

- [ ] Green-light the r2 design (per-kdf version constants; `aadShape` callback; migration re-seal; staged-write; real Mutex).
- [ ] Approve the older-client backup restore message wording.
- [ ] Decide on the `downgradeKekToV2` escape hatch — ship-disabled-from-day-one, or defer.
- [ ] Confirm the "no on-unlock migration" rule (PR #662) still stands — the plan assumes it.
- [ ] Confirm scope stays native-only (web unaffected — WebAuthn PRF has no `hardwareKekVersion`).
- [ ] Assign an owner. (Currently unassigned — this document is the ask, not the commitment.)
