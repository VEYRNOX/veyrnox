// wallet-core/multiVault.js
//
// MULTI-SEED VAULT CONTAINER  (feat/multi-wallet-portfolio).  ⚠️ AUDIT-CRITICAL.
//
// WHAT THIS IS
// ------------
// The encrypted vault used to protect exactly ONE secret: a single BIP-39
// mnemonic string. This module turns the PLAINTEXT PAYLOAD of that same vault
// into a small JSON document holding N INDEPENDENT mnemonics — so one vault
// password unlocks a vault that contains many wallets, each its own seed.
//
// WHAT THIS DELIBERATELY IS *NOT*
// -------------------------------
// This module performs NO cryptography and touches NO storage. It only
// serialises/parses the JSON that sits INSIDE the existing AES-GCM ciphertext.
// The audited primitives are untouched and unaware of it:
//   - vault.js (Argon2id 192 MiB/t=3 + AES-256-GCM) still encrypts/decrypts a
//     single opaque string. We simply hand it `serializeContainer(...)` instead
//     of a bare mnemonic, and parse what comes back out.
//   - keystore (web.js / native.js) and vaultStore.js are unchanged: still one
//     blob at key 'primary'.
//   - derivation.js / mnemonic.js are unchanged: each wallet's mnemonic derives
//     exactly as a standalone wallet always has.
// This is the ENTIRE reason the change is "container-only": the cryptographic
// attack surface (KDF, cipher, nonce/salt handling, key derivation) does not
// move. What an auditor must review here is the SERIALISATION + MIGRATION + the
// isolation invariants below — not new crypto.
//
// ISOLATION INVARIANTS (the security contract; see multivault.test.js)
//   1. Each wallet's `mnemonic` is a standalone BIP-39 string. Deriving wallet A
//      only ever reads A.mnemonic; nothing here cross-references another wallet.
//   2. add/remove return a NEW container object with a NEW wallets array and the
//      untouched wallet entries carried over by reference-copy — mutating or
//      removing one wallet never alters another's mnemonic or id.
//   3. A wallet `id` is fresh CSPRNG output (crypto.getRandomValues — never
//      Math.random; this file lives under the check:rng-guarded wallet-core).
//
// MIGRATION (lossless, single-seed -> multi-seed)
//   An existing vault written before this change decrypts to a BARE MNEMONIC
//   string (space-separated words — never valid JSON for an object). parseVault
//   detects that and wraps it as wallet #1 in a fresh container, preserving the
//   exact mnemonic bytes. The caller (WalletProvider) then re-encrypts the
//   container under the SAME password via the unchanged vault crypto, so the old
//   wallet's funds/addresses are byte-for-byte identical — only the on-disk
//   payload shape changes. Decoy (duress) and hidden (stealth) blobs are also
//   bare mnemonics; parseVault wraps them too, but the caller does NOT persist
//   that wrapping (those stay single-seed by design — see WalletProvider).

import { validateMnemonic } from './mnemonic.js';
import { hasActionPasswordRecord } from './actionPassword.js';

// Marker that distinguishes a multi-seed container from a legacy bare mnemonic.
// Chosen to be unmistakable and to never collide with BIP-39 text.
export const MULTI_VAULT_TAG = 'veyrnox-multi-vault';
export const CONTAINER_VERSION = 1;

/**
 * Generate a wallet id: 16 bytes of CSPRNG entropy, hex-encoded. This is an
 * opaque local handle (used to key non-secret UI metadata in localStorage). It
 * is NOT derived from and reveals NOTHING about the seed.
 * @returns {string} 32-char hex id
 */
export function newWalletId() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

/** Is this parsed object a multi-seed container (vs. a legacy bare mnemonic)? */
export function isMultiContainer(obj) {
  return !!obj
    && typeof obj === 'object'
    && obj.vlt === MULTI_VAULT_TAG
    && Array.isArray(obj.wallets);
}

/**
 * Build a fresh container from a list of wallet entries (each already shaped
 * { id, mnemonic }). Defensive copy so callers can't alias our internal array.
 */
function makeContainer(wallets, actionPassword, lastUnlockAt) {
  const c = {
    vlt: MULTI_VAULT_TAG,
    v: CONTAINER_VERSION,
    wallets: wallets.map((w) => ({ id: w.id, mnemonic: w.mnemonic })),
  };
  // Optional per-SET Action Password (the 2FA second factor) — a serialized Argon2id
  // verifier record (see actionPassword.js). Lives INSIDE the encrypted container so
  // its PRESENCE is not an on-disk tell (deniability I3): each set (real/duress/decoy)
  // is a separate blob and carries its own. Attached ONLY when present, so a container
  // without one serialises byte-identically to before — no on-disk churn for existing
  // vaults. Structural validity is enforced in validateContainer.
  if (actionPassword != null) c.actionPassword = actionPassword;
  // Optional last-successful-unlock timestamp (epoch ms). Like actionPassword it
  // lives INSIDE the encrypted container (so its presence is not an on-disk tell)
  // and is attached ONLY when set, so a container without it serialises byte-
  // identically to before. Primary-set only — decoy/hidden are never persisted.
  if (lastUnlockAt != null) c.lastUnlockAt = lastUnlockAt;
  return c;
}

/**
 * Wrap a single legacy mnemonic as wallet #1 of a new container. Used by the
 * lossless single-seed -> multi-seed migration. The mnemonic bytes are preserved
 * exactly; only a wrapping object + a fresh id are added.
 * @param {string} mnemonic
 * @returns {{ container: object, walletId: string }}
 */
export function migrateLegacyMnemonic(mnemonic) {
  const id = newWalletId();
  return { container: makeContainer([{ id, mnemonic }]), walletId: id };
}

/**
 * Parse the DECRYPTED vault payload into a container.
 *
 * Returns { container, migrated, walletId? }:
 *   - migrated=false : payload already was a multi-seed container.
 *   - migrated=true  : payload was a legacy BARE MNEMONIC; we wrapped it as
 *                      wallet #1 and return its walletId. The caller decides
 *                      whether to persist the re-wrap (primary: yes; decoy/
 *                      hidden: no).
 *
 * Throws only on a payload that is neither a valid container nor a valid BIP-39
 * mnemonic (corruption) — never for a normal legacy vault.
 *
 * @param {string} plaintext - the string returned by decryptVault()
 */
export function parseVault(plaintext) {
  if (typeof plaintext !== 'string') {
    throw new Error('Vault payload is not a string');
  }
  // A multi-seed container is JSON for an object; a BIP-39 mnemonic is
  // space-separated words and never parses to an object. Try JSON first.
  let parsed = null;
  const trimmed = plaintext.trim();
  if (trimmed.startsWith('{')) {
    try { parsed = JSON.parse(trimmed); } catch { parsed = null; }
  }
  if (isMultiContainer(parsed)) {
    validateContainer(parsed);
    // Normalise (defensive copy + strip any unknown fields) so downstream code
    // sees a canonical shape regardless of what was on disk. The per-set Action
    // Password record (if any) is carried over — validateContainer above has
    // already confirmed it is well-formed.
    return {
      container: makeContainer(parsed.wallets, parsed.actionPassword, parsed.lastUnlockAt),
      migrated: false,
    };
  }
  // Legacy path: the payload must be a single bare mnemonic.
  if (!validateMnemonic(plaintext)) {
    throw new Error('Unrecognized vault payload: neither a multi-seed container nor a valid mnemonic');
  }
  const { container, walletId } = migrateLegacyMnemonic(plaintext);
  return { container, migrated: true, walletId };
}

/**
 * Validate a container's structural invariants. Throws on anything malformed so
 * a corrupted/garbage payload can never masquerade as a usable wallet set.
 */
export function validateContainer(container) {
  if (!isMultiContainer(container)) throw new Error('Not a multi-seed container');
  if (container.wallets.length === 0) throw new Error('Container has no wallets');
  const ids = new Set();
  for (const w of container.wallets) {
    if (!w || typeof w !== 'object') throw new Error('Malformed wallet entry');
    if (typeof w.id !== 'string' || w.id.length === 0) throw new Error('Wallet entry missing id');
    if (typeof w.mnemonic !== 'string' || !validateMnemonic(w.mnemonic)) {
      throw new Error('Wallet entry has an invalid mnemonic');
    }
    if (ids.has(w.id)) throw new Error('Duplicate wallet id in container');
    ids.add(w.id);
  }
  // An Action Password record is OPTIONAL, but if present it must be a well-formed
  // serialized verifier — a garbage record must not masquerade as a usable second
  // factor (fail closed: a malformed one would deserialise to null at verify time
  // anyway, but we reject it at the structural boundary too).
  if (container.actionPassword != null && !hasActionPasswordRecord(container.actionPassword)) {
    throw new Error('Container has a malformed Action Password record');
  }
  if (container.lastUnlockAt != null && typeof container.lastUnlockAt !== 'number') {
    throw new Error('Container has a malformed lastUnlockAt');
  }
  return true;
}

/** Serialise a container to the string handed to encryptVault(). */
export function serializeContainer(container) {
  validateContainer(container);
  const out = {
    vlt: MULTI_VAULT_TAG,
    v: CONTAINER_VERSION,
    wallets: container.wallets.map((w) => ({ id: w.id, mnemonic: w.mnemonic })),
  };
  // Include the Action Password record ONLY when configured (JSON.stringify already
  // drops undefined, but being explicit keeps a no-2FA container's payload identical
  // to the pre-feature shape).
  if (container.actionPassword != null) out.actionPassword = container.actionPassword;
  if (container.lastUnlockAt != null) out.lastUnlockAt = container.lastUnlockAt;
  return JSON.stringify(out);
}

/** Public wallet ids in container order. */
export function listWalletIds(container) {
  return container.wallets.map((w) => w.id);
}

/** Number of wallets (seeds) in the container. */
export function walletCount(container) {
  return container.wallets.length;
}

/** Find a wallet entry by id, or null. Returns the LIVE-SECRET-bearing entry. */
export function findWallet(container, walletId) {
  return container.wallets.find((w) => w.id === walletId) || null;
}

/** Does any wallet in the container already hold this mnemonic? */
export function containsMnemonic(container, mnemonic) {
  const norm = normalizeMnemonic(mnemonic);
  return container.wallets.some((w) => normalizeMnemonic(w.mnemonic) === norm);
}

// BIP-39 mnemonics compare under the same normalisation validateMnemonic uses,
// so "already in your wallet" detection isn't defeated by spacing/case.
function normalizeMnemonic(m) {
  return m.normalize('NFKD').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Return a NEW container with `mnemonic` appended as a fresh wallet. Rejects a
 * seed already present (so two slots can never silently share a seed). The
 * existing wallet entries are carried over unchanged (isolation invariant #2).
 * @returns {{ container: object, walletId: string }}
 */
export function addWallet(container, mnemonic) {
  if (!validateMnemonic(mnemonic)) throw new Error('Invalid recovery phrase');
  if (containsMnemonic(container, mnemonic)) {
    throw new Error('This recovery phrase is already in your wallet');
  }
  const id = newWalletId();
  // Carry the set's Action Password through unchanged (it is a property of the SET,
  // not of any one wallet).
  const next = makeContainer([...container.wallets, { id, mnemonic }], container.actionPassword, container.lastUnlockAt);
  return { container: next, walletId: id };
}

/**
 * Return a NEW container with the given wallet removed. The other wallets are
 * carried over unchanged (isolation invariant #2). Refuses to remove the LAST
 * wallet — an empty multi-seed vault is meaningless; the caller wipes the whole
 * vault (clearVault) instead when the user truly wants nothing left.
 * @returns {object} the new container
 */
export function removeWallet(container, walletId) {
  if (!findWallet(container, walletId)) throw new Error('Wallet not found');
  if (container.wallets.length <= 1) {
    throw new Error('Cannot remove the last wallet; wipe the vault instead');
  }
  return makeContainer(container.wallets.filter((w) => w.id !== walletId), container.actionPassword, container.lastUnlockAt);
}

// ── Action Password (2FA second factor) — per-SET, carried inside the container ──

/**
 * The active set's Action Password verifier record, or null if none is configured.
 * Feeds the `actionPasswordConfigured` input of evaluateTwoFactor() and the verify
 * call (verifyCredential(record, entered)).
 * @returns {object|null}
 */
export function getActionPasswordRecord(container) {
  return container && container.actionPassword != null ? container.actionPassword : null;
}

/**
 * Return a NEW container with the last-successful-unlock timestamp set. Pure;
 * does not mutate the input. The timestamp is a SET-level field (per unlock
 * identity), independent of which wallet is active.
 * @param {object} container
 * @param {number} ts epoch ms
 * @returns {object}
 */
export function withLastUnlockAt(container, ts) {
  return makeContainer(container.wallets, container.actionPassword, ts);
}

/**
 * Return a NEW container with the Action Password record set/replaced. The wallets
 * are carried over unchanged (isolation invariant #2) — setting the second factor
 * never touches any seed. `record` must be a well-formed serialized verifier.
 * @returns {object} the new container
 */
export function withActionPasswordRecord(container, record) {
  if (!hasActionPasswordRecord(record)) throw new Error('withActionPasswordRecord: invalid Action Password record');
  return makeContainer(container.wallets, record, container.lastUnlockAt);
}

/**
 * Return a NEW container with the Action Password removed (disables the second
 * factor for THIS set only). Wallets are carried over unchanged.
 * @returns {object} the new container
 */
export function clearActionPasswordRecord(container) {
  return makeContainer(container.wallets, undefined, container.lastUnlockAt);
}
