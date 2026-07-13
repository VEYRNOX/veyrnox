// @ts-nocheck
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
//      the slot HKDF-SHA256(deviceSalt, secret) mod POOL_SIZE. Reveal recomputes that slot and
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
//   - SLOT COLLISION (M1 — fund-loss hardening). Two DIFFERENT secrets can hash
//     to the same slot. The slot is HKDF-SHA256(deviceSalt, secret) mod POOL_SIZE, a uniform draw
//     over POOL_SIZE buckets, so by the birthday bound the chance that SOME pair
//     among k hidden wallets collides is ≈ k(k-1)/(2·POOL_SIZE). The original
//     POOL_SIZE = 12 made this materially likely ("a handful" understated it):
//     ~8% at 2 wallets, ~24% at 3, ~42% at 4. We now use POOL_SIZE = 256, which
//     drops those to ~0.4% / ~1.2% / ~2.3% — about a 21× reduction (raising the
//     pool only costs one-time chaff-seeding; reveal still touches ONE slot, so
//     unlock cost is unchanged). The math is the lever here; see below for why a
//     hard guard is impossible.
//
//     WHY WE CANNOT FULLY "REFUSE ON COLLISION" (the honest limit, flagged for
//     audit). To refuse, createHiddenWallet would have to tell "this slot holds a
//     DIFFERENT user's-real hidden wallet" apart from "this slot holds chaff."
//     But real and chaff blobs are AES-GCM-vs-random — computationally
//     INDISTINGUISHABLE WITHOUT the owning secret, which the create path does not
//     have for OTHER hidden wallets. Any mechanism that let the creator detect a
//     foreign real wallet (a readable index, a recognizable-chaff marker, a key
//     derived from the primary password) would EQUALLY let a coercer enumerate or
//     COUNT hidden wallets from a storage dump — which is exactly the deniability
//     property this module exists to protect. So strict per-collision refusal and
//     count-hiding are mutually exclusive here; we choose count-hiding and shrink
//     the collision probability instead. What createHiddenWallet CAN and now DOES
//     guard is the DETECTABLE case (the same secret re-used — handled idempotently
//     below) plus a post-write self-verify so a write that did not land is caught
//     loudly rather than silently. LOST-on-collision of a *different* wallet under
//     a *colliding* secret remains a (now-rare) residual, documented for the user
//     and flagged for audit. See createHiddenWallet + SAST_FINDINGS.md M1.
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
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { deriveEvmAccount } from './derivation.js';
import { makeContainer, serializeContainer, parseVault, newWalletId, FIXED_LEN } from './multiVault.js';
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
// POOL_SIZE does NOT affect unlock cost — only the one-time seeding cost — which
// is why M1 raises it from 12 to 256: a ~21× cut in slot-collision probability
// (and thus in silent hidden-wallet fund loss) at zero unlock-latency cost. The
// uniform 'vault:N' key shape is unchanged, so this introduces no new storage
// tell relative to the prior pool — it is the same artifact, just larger.
const POOL_SIZE = 256;
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

// Per-device HKDF salt for the slot-mapping function. Stored in localStorage (not
// secret per RFC 5869, but device-specific) so an attacker with only an offline
// image of the IndexedDB pool cannot precompute which slot belongs to a dictionary
// word without also knowing this device's salt. Without it, unkeyed SHA-256 lets an
// attacker map all dictionary candidates to slots instantly (offline dictionary
// attack on the mapping is cheap; Argon2id on the contents is the only cost).
// NOTE: rotating or clearing this salt orphans any existing hidden-wallet slots —
// their `slotForSecret()` will compute a DIFFERENT slot and not find the blob.
// Never regenerate it after first use. This is PROVISIONAL; a native KEK layer is
// the planned stronger binding (see docs/Security.roadmap.md).
const STEALTH_SLOT_SALT_KEY = 'veyrnox-stealth-slot-salt';

// READ-ONLY salt accessor: returns the persisted per-device salt bytes, or null if
// none exists (or it is malformed). NEVER writes. This is what the read/reveal
// paths use so a reveal can NEVER provision a salt — see the WRITE-vs-READ split
// note on slotForSecret/readSlotForSecret below and panic.js (a post-wipe reveal
// probe must not re-create the 'veyrnox-stealth-slot-salt' deniability tell the
// wipe just erased; it is in panic.js DENIABILITY_RESIDUE_KEYS, F-02).
function readStealthSalt() {
  try {
    const stored = localStorage.getItem(STEALTH_SLOT_SALT_KEY);
    if (stored && /^[0-9a-f]{32}$/i.test(stored)) return hexToBytes(stored);
  } catch { /* fall through */ }
  return null;
}

// CREATE-ON-WRITE salt accessor: read the salt, or generate + persist one if
// absent. ONLY the WRITE paths that ESTABLISH a hidden wallet (createHiddenWallet,
// moveWalletToHidden, via slotForSecret) may call this — so a salt is provisioned
// EXACTLY when the first real hidden wallet is, never merely by seeding the chaff
// pool or by a failed unlock attempt. (Before the read/write split, any reveal
// attempt provisioned the salt, which both leaked a "stack present" tell on
// hidden-wallet-free devices AND silently re-created the tell after a panic wipe.)
function getOrCreateStealthSalt() {
  const existing = readStealthSalt();
  if (existing) return existing;
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hex = bytesToHex(salt);
  try { localStorage.setItem(STEALTH_SLOT_SALT_KEY, hex); } catch { /* best-effort */ }
  return hexToBytes(hex); // same 16 decoded bytes as readStealthSalt will return
}

// Map a secret to its slot key under a given salt. HKDF-SHA256 keyed by the
// per-device salt maps the secret to one of POOL_SIZE slots. Without the device
// salt an offline attacker cannot precompute the slot mapping for dictionary
// candidates — they would need to try Argon2id on every slot for every candidate
// (POOL_SIZE × dict cost) rather than computing SHA-256 cheaply and targeting just
// the matching slot.
function computeSlot(secret, salt) {
  const ikm = utf8ToBytes(typeof secret === 'string' ? secret : String(secret));
  const derived = hkdf(sha256, ikm, salt, 'veyrnox-stealth-slot-v1', 4);
  const n = ((derived[0] << 24) | (derived[1] << 16) | (derived[2] << 8) | derived[3]) >>> 0;
  return SLOT_KEYS[n % POOL_SIZE];
}

// WRITE-PATH slot mapping. PROVISIONS the device salt if absent — used by the paths
// that ESTABLISH a hidden wallet (createHiddenWallet, moveWalletToHidden) and
// exposed for tests. A reveal must NOT use this (use readSlotForSecret): a read
// that provisioned a salt would re-introduce the deniability tell a panic wipe
// removed, and would leak feature presence on a hidden-wallet-free device.
// MIGRATION NOTE: this replaced an unkeyed SHA-256 mapping (VULN-7). Existing
// hidden-wallet blobs provisioned before this change now sit in different slots
// (unreachable by the new mapping). All slot blobs are chaff-indistinguishable,
// so orphaned blobs cause no information leak; the feature is PROVISIONAL and no
// migration path is provided for testnet data.
export function slotForSecret(secret) {
  return computeSlot(secret, getOrCreateStealthSalt());
}

// READ-PATH slot mapping. NEVER provisions a salt: returns null when no device
// salt exists — in which case no real hidden wallet can exist either, because the
// write paths persist the salt BEFORE writing any slot. Used by tryRevealHidden so
// a reveal (including the post-wipe reveal probe) can never re-create the salt tell.
function readSlotForSecret(secret) {
  const salt = readStealthSalt();
  return salt ? computeSlot(secret, salt) : null;
}

// A CHAFF blob: shaped and sized exactly like encryptVault() output, but with
// random bytes instead of a real ciphertext. We size the fake ciphertext to a
// real encrypted mnemonic's length by measuring a throwaway generated mnemonic
// (cheap — no KDF) and adding the 16-byte GCM tag, so chaff lengths follow the
// same distribution as real hidden-wallet slots. The salt/iv/ct are all random,
// which is indistinguishable from genuine AES-GCM output to anyone without the
// secret. Mirrors the { v, kdf, salt, iv, ct } shape of vault.js exactly.
function makeChaff() {
  // H2: a real hidden-wallet slot now encrypts a FIXED-LENGTH multi-seed container
  // (always exactly FIXED_LEN plaintext bytes — independent of mnemonic word-count
  // and of whether the set carries an Action-Password record). So chaff must size
  // its fake ciphertext to that SAME fixed plaintext length + the 16-byte GCM tag,
  // making every slot's ct length byte-identical (real or chaff). Previously chaff
  // matched a bare-mnemonic length; that would now be a real-vs-chaff length tell.
  const ptLen = FIXED_LEN;
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
 * (HKDF-SHA256(deviceSalt, secret) mod POOL_SIZE), ensuring the pool exists first. Returns the
 * hidden wallet's mnemonic + public EVM address ONCE so the UI can show a backup
 * and a fund-me address; callers MUST NOT persist the return value. Never persists
 * plaintext.
 *
 * The secret MUST differ from the primary password and any duress PIN — if it
 * matched one of those, that path would win at unlock and the hidden wallet would
 * never open. We cannot check the other secrets (we never hold them in plaintext),
 * so the caller warns the user; this is documented in the page UI.
 *
 * COLLISION GUARD (M1). Two failure modes are handled:
 *   (1) SAME secret re-used → returned idempotently (below), never clobbered.
 *   (2) The write must actually land → we SELF-VERIFY after writing (re-reveal
 *       under the secret and confirm it yields the new wallet) before returning,
 *       so a storage hiccup surfaces a clear error instead of a silent loss —
 *       parity with moveWalletToHidden's safety ordering.
 * RESIDUAL (see header): a DIFFERENT secret that hashes to the SAME slot still
 * overwrites the prior wallet, because real and chaff are cryptographically
 * indistinguishable without the owning secret — detecting it would break
 * count-hiding deniability. We make this RARE (POOL_SIZE = 256, ≈k(k-1)/512 for
 * k hidden wallets) rather than impossible; flagged for audit.
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
  const existingMnemonic = await revealHiddenMnemonic(secret);
  if (existingMnemonic != null) {
    const id = deriveHiddenIdentity(existingMnemonic);
    return { mnemonic: existingMnemonic, address: id.evm.address, ...id, slot, existing: true };
  }

  const mnemonic = generateMnemonic(strength);
  // H2: wrap the hidden wallet's mnemonic in a FIXED-LENGTH multi-seed container so
  // it can carry its OWN per-set Action-Password record and so its ciphertext length
  // matches the primary set's and every chaff slot's (deniability — no length tell).
  // A hidden wallet has no Action Password today (the UI does not yet collect one),
  // so the record is absent; presence still means "configured" inside the container.
  const container = makeContainer([{ id: newWalletId(), mnemonic }]);
  const blob = await encryptVault(serializeContainer(container), secret);
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
  // SELF-VERIFY (M1, parity with moveWalletToHidden): the wallet we just wrote
  // MUST be revealable by its secret before we hand it back. This catches a
  // storage write that did not land (a silent-loss path) and surfaces it loudly.
  // It does NOT — and cannot — detect a collision that overwrote a DIFFERENT
  // wallet under a colliding secret (that prior wallet is indistinguishable from
  // chaff to us); see the header for why that residual is unavoidable here.
  const verify = await revealHiddenMnemonic(secret);
  if (verify !== mnemonic) {
    throw new Error('Hidden wallet failed to verify after write; not created.');
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
  const existing = await revealHiddenMnemonic(secret);
  if (existing != null && existing !== mnemonic) {
    // SW-01: generic message — must NOT confirm that a real hidden wallet (vs
    // chaff) occupies this slot, or a caller could distinguish real from chaff.
    throw new Error('Could not store hidden wallet — check your recovery phrase and try again');
  }

  // H2: same FIXED-LENGTH container wrapping as createHiddenWallet, so a moved
  // wallet is byte-shaped identically to a fresh hidden wallet and to chaff.
  const container = makeContainer([{ id: newWalletId(), mnemonic }]);
  const blob = await encryptVault(serializeContainer(container), secret);
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
  const check = await revealHiddenMnemonic(secret);
  if (check !== mnemonic) {
    throw new Error('Move failed to verify; the wallet was NOT hidden and nothing was removed.');
  }

  const { address } = deriveEvmAccount(mnemonic, 0);
  return { address, slot };
}

/**
 * Attempt to reveal a hidden wallet with `secret`. Computes the secret's slot and
 * runs exactly ONE decryptVault on whatever blob lives there. Returns the decrypted
 * PAYLOAD STRING on a match — a multi-seed container JSON after the H2 change, or a
 * legacy bare mnemonic for hidden wallets written before it (parseVault in the
 * caller handles both) — or null otherwise (chaff, wrong secret, or an
 * un-seeded pool). NEVER throws for a wrong secret — the caller (WalletProvider
 * .unlock) surfaces the primary error instead, so a miss here is indistinguishable
 * from "no hidden wallet" at the prompt. Constant work: one KDF regardless of
 * whether any hidden wallet exists. When the device salt is present the slot always
 * holds chaff at minimum once the pool is seeded (one KDF on it); when NO device
 * salt exists (no hidden wallet was ever created) we still spend one KDF on a
 * throwaway chaff blob — never provisioning a salt — so the cost is identical and
 * a reveal can never re-create the deniability tell a panic wipe removed.
 *
 * @param {string} secret
 * @returns {Promise<string|null>}
 */
export async function tryRevealHidden(secret) {
  if (typeof secret !== 'string' || secret.length === 0) return null;
  const slot = readSlotForSecret(secret); // READ-ONLY: never provisions a salt
  if (slot == null) {
    // No device salt => no real hidden wallet can exist (the write paths persist
    // the salt BEFORE writing any slot). So this MISSES. But we still spend exactly
    // ONE KDF on a throwaway chaff blob so the reveal cost stays invariant — the
    // constant-KDF unlock path (deniabilityUnlock.js) counts on the stealth slot
    // being exactly one KDF, and short-circuiting here would leak salt-presence
    // (i.e. "a hidden wallet was created") via a 2-vs-3-KDF timing difference.
    // decryptVault on random ct always fails — this call exists purely for its KDF
    // cost — and crucially provisions NO salt, so a reveal can never re-create the
    // deniability tell a panic wipe removed (panic.js F-02).
    try { await decryptVault(makeChaff(), secret); } catch { /* KDF-cost only */ }
    return null;
  }
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

// INTERNAL: reveal a hidden wallet's first (and only) MNEMONIC, or null. Used by
// create/move (idempotency, clobber-guard, self-verify) which reason about the
// underlying seed, not the container envelope. tryRevealHidden returns the raw
// payload string (container JSON or a legacy bare mnemonic); this parses it back to
// the bare mnemonic via the shared multiVault parser, so both old and new formats
// resolve identically. Returns null on any miss or unparseable payload (fail-safe).
async function revealHiddenMnemonic(secret) {
  const payload = await tryRevealHidden(secret);
  if (payload == null) return null;
  try {
    const { container } = parseVault(payload);
    const w = container.wallets[0];
    return w ? w.mnemonic : null;
  } catch {
    return null;
  }
}

/**
 * H2 (decoy/hidden 2FA parity): set/replace the per-set Action-Password record on a
 * HIDDEN wallet, re-writing its stealth slot in place. The caller supplies the reveal
 * `secret` and the wallet's current `mnemonic` (the unlocked hidden session holds it).
 * We CONFIRM the secret currently reveals this exact wallet, then re-encrypt the slot
 * with the SAME mnemonic wrapped in a FIXED-LENGTH container carrying `record` (or no
 * record when `record` is null — disabling the second factor). The ciphertext length
 * is unchanged (padding), so this is invisible to a storage observer. Self-verifies
 * the re-write is revealable before returning. Fails closed if the secret does not
 * open this wallet.
 *
 * @param {string} secret
 * @param {string} mnemonic
 * @param {object|null} record - serialized AP verifier, or null to clear
 * @returns {Promise<void>}
 */
export async function setHiddenActionPasswordRecord(secret, mnemonic, record) {
  if (typeof secret !== 'string' || secret.length < 4) {
    throw new Error('Reveal secret must be at least 4 characters');
  }
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Invalid recovery phrase');
  }
  const current = await revealHiddenMnemonic(secret);
  if (current !== mnemonic) {
    throw new Error('Decryption failed: wrong password or corrupted vault');
  }
  // M-H: use the READ-PATH slot mapping. slotForSecret (write-path) auto-provisions
  // the per-device salt if absent — which could re-create the 'veyrnox-stealth-slot-
  // salt' forensic tell a panic wipe erased (panic.js F-02). A hidden wallet already
  // had to exist for the reveal above to succeed, so the salt is necessarily present
  // and readSlotForSecret returns a real slot; null here means the structural
  // precondition is violated, so we fail closed rather than provision a salt.
  const slot = readSlotForSecret(secret);
  if (slot == null) {
    throw new Error('Hidden wallet not found — cannot set action password record');
  }
  const container = makeContainer([{ id: newWalletId(), mnemonic }], record ?? undefined);
  const blob = await encryptVault(serializeContainer(container), secret);
  if (typeof blob !== 'object' || !blob.ct || !blob.iv || !blob.salt) {
    throw new Error('Refusing to store: not a valid encrypted vault blob');
  }
  const db = await openDb();
  try {
    await putKey(db, slot, blob);
  } finally {
    db.close();
  }
  const check = await revealHiddenMnemonic(secret);
  if (check !== mnemonic) {
    throw new Error('Hidden wallet failed to verify after write; Action Password not changed.');
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
