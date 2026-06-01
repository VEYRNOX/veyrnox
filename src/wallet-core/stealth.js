// wallet-core/stealth.js
//
// STEALTH / HIDDEN WALLETS  (S3 — Direction-C individual security).  PROVISIONAL.
//
// GOAL — plausible deniability for EXTRA wallets. On top of the normal wallet(s)
// a user can sees, they may create one or more HIDDEN wallets that are NEVER
// listed, counted, or hinted at in the normal UI. A hidden wallet is revealed
// ONLY by typing its dedicated secret at the SAME unlock prompt every other
// wallet uses — there is no separate "reveal" field, no "you have N hidden
// wallets" indicator, and no menu entry that lights up. A coercer (or anyone
// inspecting the unlocked app) sees only the visible wallets and has no signal
// that a hidden one exists.
//
// RELATIONSHIP TO DURESS (wallet-core/duress.js). Duress is the DUAL of this:
// there the HIDDEN thing is your REAL wallet and you surrender a decoy. Here the
// VISIBLE wallet is real and the HIDDEN wallets are extras. Both reuse the exact
// same primitive — a real, separately-encrypted vault (its own BIP-39 mnemonic,
// encrypted with vault.js's Argon2id + AES-256-GCM, UNCHANGED) opened through
// the EXISTING WalletProvider.unlock path. No parallel secret-handling and no
// new crypto. See duress.js for the shared rationale.
//
// ───────────────────────────────────────────────────────────────────────────
// THE DENIABILITY PROBLEM WE INHERITED FROM DURESS, AND HOW THIS IMPROVES ON IT
// ───────────────────────────────────────────────────────────────────────────
// The duress self-review flagged that storing ONE extra blob under a fixed key
// ('secondary') is itself a forensic TELL: a raw storage dump shows exactly one
// extra encrypted vault exists, which proves the feature is in use and reveals
// the count (one). We apply that lesson here:
//
//   1. INDISTINGUISHABLE SLOT POOL. Instead of one keyed "hidden vault", we keep
//      a fixed-size POOL of slots in the SAME object store as the primary vault
//      ('veyrnox-vault' / 'vault'). Every slot holds an encrypted-vault-shaped
//      blob. Some slots are REAL hidden wallets; the rest are CHAFF — random
//      bytes shaped and sized exactly like a real encrypted mnemonic. Because
//      AES-GCM ciphertext is computationally indistinguishable from random, an
//      attacker who dumps the store cannot tell which slots (or HOW MANY) are
//      real wallets vs noise WITHOUT the secret. The COUNT of hidden wallets is
//      therefore not revealed.
//
//   2. POOL PRESENCE IS TIED TO THE UNIVERSAL BASELINE, NOT TO USAGE. The pool
//      is seeded with chaff for EVERY wallet that exists on the device (see
//      ensureStealthPool, called from WalletProvider whenever a primary vault is
//      present) — not only when someone creates a hidden wallet. So "the pool
//      exists" correlates with "this device has a Veyrnox wallet at all", which
//      is true of every user, and does NOT distinguish a user who has hidden
//      wallets from one who does not. An all-chaff pool is the baseline state.
//
//   3. SECRET-DERIVED PLACEMENT + CONSTANT REVEAL WORK. A hidden wallet lives in
//      the slot SHA-256(secret) mod POOL_SIZE. Reveal recomputes that slot and
//      attempts exactly ONE decryptVault on it. A wrong password derives some
//      slot, runs exactly ONE KDF on whatever blob (chaff or real) sits there,
//      and fails — the SAME work as a correct reveal that lands on chaff. Reveal
//      cost does not depend on whether any hidden wallet exists, so neither the
//      presence nor the count of hidden wallets is timeable at the prompt.
//
// ───────────────────────────────────────────────────────────────────────────
// HONEST LIMITATIONS  (threat model — PROVISIONAL, flagged for audit)
// ───────────────────────────────────────────────────────────────────────────
//   - NOT A HIDDEN VOLUME. This is runtime + count deniability, not VeraCrypt-
//     style steganography. The POOL ITSELF is an unavoidable storage artifact: a
//     forensic examiner who compares the store against a known-pristine Veyrnox
//     install can see that a fixed-size block of vault-shaped slots is present.
//     What they CANNOT learn from it is how many (if any) slots are real hidden
//     wallets, or what they contain. We hide the count and contents, not the
//     existence of the pool. Documented honestly; do not over-claim.
//   - LENGTH/STATISTICAL ATTACKS. Chaff is sized to match a real encrypted
//     mnemonic's length distribution, but we do not claim to defeat a determined
//     statistical forensic analysis of the blob bytes. Out of scope; flagged.
//   - WRITE-TIME OBSERVATION. An attacker who can snapshot storage BEFORE and
//     AFTER a hidden wallet is created sees one chaff slot change to a real one.
//     Deniability protects a SINGLE point-in-time inspection, not continuous
//     monitoring of an already-compromised device.
//   - MOVING A PREVIOUSLY-VISIBLE WALLET (moveWalletToHidden) IS WEAKER. A FRESH
//     hidden wallet the adversary never knew about leaves nothing for them to miss.
//     But HIDING a wallet that was already on screen creates a TRANSITION TELL: a
//     coercer who saw the app before can notice that wallet is now gone and demand
//     it be restored, and a before/after device comparison can detect BOTH the
//     removed visible record AND the one slot that changed from chaff to real. The
//     wallet's address/history also stay public on-chain regardless. This variant
//     is for wallets the adversary has NOT already catalogued; the UI warns the
//     user explicitly and it is flagged for specific audit scrutiny.
//   - RARE SLOT COLLISION. Two secrets can hash to the same slot; the later
//     createHiddenWallet would overwrite the earlier wallet. By design we keep
//     NO index of hidden wallets (an index readable with the primary password
//     would let a coercer enumerate them), so we cannot detect this perfectly.
//     POOL_SIZE is chosen so collisions are unlikely for a handful of wallets;
//     the create path warns and the limit is documented. Flagged for audit.
//   - LOST SECRET = LOST WALLET. Precisely because we keep no enumerable index,
//     a forgotten reveal secret makes its hidden wallet unrecoverable from this
//     app (the slot is indistinguishable from chaff without the secret). This is
//     the same property that protects you from a coercer; it cuts both ways.
//   - NATIVE. Slots are persisted via web IndexedDB. On native (M2b) the PRIMARY
//     vault is hardware-backed; a hardware-backed stealth pool is not wired yet,
//     so this is a web/demo feature today. Flagged.
//
// TESTNET ONLY. This module never touches networks, providers, or signing — it
// only encrypts, stores, and decrypts hidden-wallet mnemonics locally. It cannot
// move funds and adds no mainnet surface.

import { encryptVault, decryptVault, KDF_PARAMS } from './vault.js';
import { generateMnemonic, validateMnemonic } from './mnemonic.js';
import { deriveEvmAccount } from './derivation.js';
// A hidden wallet is a real BIP-39 wallet, so it has the SAME multi-chain
// identity any wallet does. We reuse the EXISTING public-address-only derivation
// helpers — the same ones WalletProvider.deriveBtc/deriveSol use for the primary
// wallet — so a revealed hidden wallet shows its EVM + BTC + SOL addresses with
// no new derivation logic and no wallet-core crypto touched. These compute
// addresses locally from the mnemonic; they perform NO network I/O.
import { deriveBtcAddress } from './btc/derivation.js';
import { deriveSolAddress } from './sol/derivation.js';

// Default networks for the hidden wallet's non-EVM addresses, matching the
// primary wallet's defaults (WalletProvider.deriveBtc/deriveSol): BTC testnet,
// SOL devnet. Testnet only; mainnet stays gated in the respective networks.js.
const HIDDEN_BTC_NETWORK = 'testnet';
const HIDDEN_SOL_NETWORK = 'devnet';

// Derive a hidden wallet's PUBLIC multi-chain identity from its mnemonic. EVM
// (one secp256k1 address serves every EVM chain), BTC (BIP-84 P2WPKH testnet),
// and SOL (ed25519 devnet) — all via the existing derivation modules. No key
// material is returned or persisted; addresses only. No network access.
function deriveHiddenIdentity(mnemonic) {
  const { address: evm } = deriveEvmAccount(mnemonic, 0);
  const { address: btc, path: btcPath } = deriveBtcAddress(mnemonic, { networkKey: HIDDEN_BTC_NETWORK });
  const { address: sol, path: solPath } = deriveSolAddress(mnemonic);
  return {
    evm: { address: evm, path: "m/44'/60'/0'/0/0" },
    btc: { address: btc, path: btcPath, networkKey: HIDDEN_BTC_NETWORK },
    sol: { address: sol, path: solPath, networkKey: HIDDEN_SOL_NETWORK },
  };
}

// Same database + store as the primary vault (see evm/vaultStore.js) and the
// duress decoy. Keeping the stealth slots in ONE shared store — rather than a
// database literally named "stealth"/"hidden" — avoids the most blatant storage
// tell. vaultStore.js is NOT imported or modified; we re-open the same IndexedDB
// by name, which is plain storage plumbing, not vault crypto.
const DB_NAME = 'veyrnox-vault';
const STORE = 'vault';

// Fixed-size pool of slots. The keys read like additional vault entries — the
// vaultStore header already anticipates this ("single-vault slice; extend to
// multiple if needed"), so 'vault:N' alongside 'primary'/'secondary' is an
// innocuous, expected shape rather than a feature-naming tell. POOL_SIZE bounds
// the collision probability (see header) while keeping the pool small enough
// that seeding it for every wallet is cheap. Reveal touches only ONE slot, so
// POOL_SIZE does not affect unlock cost.
const POOL_SIZE = 12;
const SLOT_KEYS = Object.freeze(
  Array.from({ length: POOL_SIZE }, (_, i) => `vault:${i + 1}`)
);

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function store(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function getKey(db, key) {
  return new Promise((res, rej) => {
    const r = store(db, 'readonly').get(key);
    r.onsuccess = () => res(r.result ?? null);
    r.onerror = () => rej(r.error);
  });
}

function putKey(db, key, value) {
  return new Promise((res, rej) => {
    const r = store(db, 'readwrite').put(value, key);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function b64(u8) {
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s);
}

// Which slot a secret owns. SHA-256 of the secret, first 4 bytes mod POOL_SIZE.
// This hash is computed transiently and stored NOWHERE; it only selects a slot.
// The encryption itself uses vault.js's own random Argon2id salt — this is not
// key material. An attacker cannot compute a slot without the secret, and the
// slot index alone reveals nothing.
async function slotForSecret(secret) {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  );
  const n = ((digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3]) >>> 0;
  return SLOT_KEYS[n % POOL_SIZE];
}

// A CHAFF blob: shaped and sized exactly like encryptVault() output, but with
// random bytes instead of a real ciphertext. We size the fake ciphertext to a
// real encrypted mnemonic's length by measuring a throwaway generated mnemonic
// (cheap — no KDF) and adding the 16-byte GCM tag, so chaff lengths follow the
// same distribution as real hidden-wallet slots. The salt/iv/ct are all random,
// which is indistinguishable from genuine AES-GCM output to anyone without the
// secret. Mirrors the { v, kdf, salt, iv, ct } shape of vault.js exactly.
function makeChaff() {
  // Match the user's plausible word-count choice (12 or 24) for length realism.
  const strength = randomBytes(1)[0] < 128 ? 128 : 256;
  const sample = generateMnemonic(strength);
  const ptLen = new TextEncoder().encode(sample).length;
  const GCM_TAG = 16;
  return {
    v: 1,
    // Advertise the CURRENT KDF params (imported from vault.js) so chaff blobs are
    // byte-shaped identically to real hidden-wallet blobs. If these were hardcoded
    // they would diverge when the at-rest params are raised (SAST M3), making the
    // kdf field a real-vs-chaff distinguisher — a deniability tell.
    kdf: { name: 'argon2id', ...KDF_PARAMS },
    salt: b64(randomBytes(16)),
    iv: b64(randomBytes(12)),
    ct: b64(randomBytes(ptLen + GCM_TAG)),
  };
}

/**
 * Ensure the chaff pool exists. Idempotent and NON-DESTRUCTIVE: any slot that is
 * already present (chaff OR a real hidden wallet) is left untouched; only MISSING
 * slots are filled with fresh chaff. Call this whenever a primary vault exists so
 * the pool's presence tracks "has a wallet" (universal) rather than "uses hidden
 * wallets" (the property we must hide). Best-effort: callers should not let a
 * storage hiccup here break unlock.
 */
export async function ensureStealthPool() {
  const db = await openDb();
  try {
    for (const key of SLOT_KEYS) {
      const existing = await getKey(db, key);
      if (existing == null) await putKey(db, key, makeChaff());
    }
  } finally {
    db.close();
  }
}

/**
 * Create a hidden wallet revealed by `secret`. IDEMPOTENT-AND-SAFE: if `secret`
 * already owns a real hidden wallet in its slot, that EXISTING wallet is returned
 * unchanged (so re-entering a secret never silently destroys the wallet behind
 * it). Otherwise a FRESH BIP-39 mnemonic is generated, encrypted with `secret`
 * via the SAME crypto as the primary vault, and written into the secret's slot
 * (SHA-256(secret) mod POOL_SIZE), ensuring the pool exists first. Returns the
 * hidden wallet's mnemonic + public EVM address ONCE so the UI can show a backup
 * and a fund-me address; callers MUST NOT persist the return value. Never persists
 * plaintext.
 *
 * The secret MUST differ from the primary password and any duress PIN — if it
 * matched one of those, that path would win at unlock and the hidden wallet would
 * never open. We cannot check the other secrets (we never hold them in plaintext),
 * so the caller warns the user; this is documented in the page UI.
 *
 * COLLISION CAVEAT (see header): if a DIFFERENT secret hashes to the same slot and
 * already holds a wallet, this overwrites it (the prior wallet decrypts under the
 * other secret, not this one, so we cannot tell it apart from chaff). POOL_SIZE
 * makes this unlikely for a handful of wallets; flagged for audit.
 *
 * Returns the hidden wallet's full PUBLIC multi-chain identity (EVM + BTC + SOL),
 * so the UI can show every address to fund. `address` is kept as an alias of the
 * EVM address for back-compat. No key material is returned or persisted.
 *
 * @param {string} secret
 * @param {128|256} [strength]
 * @returns {Promise<{ mnemonic: string, address: string, evm: object, btc: object, sol: object, slot: string, existing: boolean }>}
 */
export async function createHiddenWallet(secret, strength = 128) {
  if (typeof secret !== 'string' || secret.length < 4) {
    throw new Error('Reveal secret must be at least 4 characters');
  }
  await ensureStealthPool();
  const slot = await slotForSecret(secret);

  // If this secret already opens a real wallet in its slot, return it as-is —
  // never clobber a hidden wallet just because the user re-typed its secret.
  const existingMnemonic = await tryRevealHidden(secret);
  if (existingMnemonic != null) {
    const id = deriveHiddenIdentity(existingMnemonic);
    return { mnemonic: existingMnemonic, address: id.evm.address, ...id, slot, existing: true };
  }

  const mnemonic = generateMnemonic(strength);
  const blob = await encryptVault(mnemonic, secret);
  // Mirror vaultStore's guard: refuse anything that is not an encrypted blob.
  if (typeof blob !== 'object' || !blob.ct || !blob.iv || !blob.salt) {
    throw new Error('Refusing to store: not a valid encrypted vault blob');
  }
  const db = await openDb();
  try {
    await putKey(db, slot, blob);
  } finally {
    db.close();
  }
  // Derive the hidden wallet's PUBLIC multi-chain identity (so the UI can show
  // where to fund each chain) from the in-memory mnemonic via the SAME derivation
  // as the primary wallet. No key is persisted here.
  const id = deriveHiddenIdentity(mnemonic);
  return { mnemonic, address: id.evm.address, ...id, slot, existing: false };
}

/**
 * Move an EXISTING wallet (the user supplies its recovery phrase) into the hidden
 * pool, revealed by `secret`. This is the riskier "hide a wallet that was already
 * VISIBLE" variant — see the page UI for the transition-tell warning the caller
 * MUST show first. It reuses the EXACT same store path as createHiddenWallet
 * (ensure pool → secret-derived slot → encryptVault → put), so the resulting slot
 * is byte-shaped identically to a fresh hidden wallet and to chaff; the pool size,
 * hidden count, and one-KDF reveal are all UNCHANGED. No wallet-core crypto touched.
 *
 * SAFETY ORDERING (critical): this stores the wallet AND self-verifies it is
 * revealable BEFORE returning. The caller must only purge the wallet's visible
 * record (its app entry / cached balance / label) AFTER this resolves — so a
 * storage hiccup can never leave the wallet deleted-from-view yet not hidden.
 *
 * CLOBBER GUARD: unlike createHiddenWallet (which returns an existing wallet
 * untouched on a re-typed secret), a MOVE writes a specific provided wallet. If
 * `secret` already reveals a DIFFERENT hidden wallet we REFUSE rather than
 * overwrite it (which would destroy that other wallet). Re-moving the SAME wallet
 * under the same secret is idempotent.
 *
 * @param {string} mnemonic - the existing wallet's BIP-39 recovery phrase
 * @param {string} secret   - the reveal secret it will be opened with
 * @returns {Promise<{ address: string, slot: string }>}
 */
export async function moveWalletToHidden(mnemonic, secret) {
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Invalid recovery phrase: failed BIP-39 checksum/wordlist check');
  }
  if (typeof secret !== 'string' || secret.length < 4) {
    throw new Error('Reveal secret must be at least 4 characters');
  }
  await ensureStealthPool();
  const slot = await slotForSecret(secret);

  // Refuse to clobber a DIFFERENT hidden wallet already living under this secret.
  const existing = await tryRevealHidden(secret);
  if (existing != null && existing !== mnemonic) {
    throw new Error('That reveal secret is already in use by a hidden wallet. Choose a different secret.');
  }

  const blob = await encryptVault(mnemonic, secret);
  if (typeof blob !== 'object' || !blob.ct || !blob.iv || !blob.salt) {
    throw new Error('Refusing to store: not a valid encrypted vault blob');
  }
  const db = await openDb();
  try {
    await putKey(db, slot, blob);
  } finally {
    db.close();
  }

  // Self-verify: the moved wallet MUST now be revealable by its secret before the
  // caller removes the visible record. If this fails, nothing visible is purged.
  const check = await tryRevealHidden(secret);
  if (check !== mnemonic) {
    throw new Error('Move failed to verify; the wallet was NOT hidden and nothing was removed.');
  }

  const { address } = deriveEvmAccount(mnemonic, 0);
  return { address, slot };
}

/**
 * Attempt to reveal a hidden wallet with `secret`. Computes the secret's slot and
 * runs exactly ONE decryptVault on whatever blob lives there. Returns the hidden
 * wallet's mnemonic on a match, or null otherwise (chaff, wrong secret, or an
 * un-seeded pool). NEVER throws for a wrong secret — the caller (WalletProvider
 * .unlock) surfaces the primary error instead, so a miss here is indistinguishable
 * from "no hidden wallet" at the prompt. Constant work: one KDF regardless of
 * whether any hidden wallet exists (the slot always holds chaff at minimum once
 * the pool is seeded).
 *
 * @param {string} secret
 * @returns {Promise<string|null>}
 */
export async function tryRevealHidden(secret) {
  if (typeof secret !== 'string' || secret.length === 0) return null;
  const slot = await slotForSecret(secret);
  const db = await openDb();
  let blob;
  try {
    blob = await getKey(db, slot);
  } finally {
    db.close();
  }
  if (!blob) return null;
  try {
    return await decryptVault(blob, secret); // throws on wrong secret / chaff
  } catch {
    return null;
  }
}

/**
 * Whether the chaff pool has been seeded on this device (i.e. all slots present).
 * This is TRUE for any device with a wallet once ensureStealthPool has run, so it
 * is NOT a signal that hidden wallets exist — it only reflects the baseline pool.
 * Exposed for the management/demo UI, never to gate normal-wallet behaviour.
 */
export async function hasStealthPool() {
  const db = await openDb();
  try {
    for (const key of SLOT_KEYS) {
      if ((await getKey(db, key)) == null) return false;
    }
    return true;
  } finally {
    db.close();
  }
}

/**
 * Remove every stealth slot (real wallets AND chaff). Used by the demo reset and
 * as a coarse local wipe. After this, ensureStealthPool re-seeds an all-chaff
 * pool. Does NOT touch the primary or duress vault entries.
 */
export async function wipeStealthPool() {
  const db = await openDb();
  try {
    for (const key of SLOT_KEYS) {
      await new Promise((res, rej) => {
        const r = store(db, 'readwrite').delete(key);
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      });
    }
  } finally {
    db.close();
  }
}
