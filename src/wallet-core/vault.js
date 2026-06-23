// wallet-core/vault.js
//
// Encrypted key vault: the heart of self-custody.
//
// SECURITY RATIONALE
// ------------------
// The seed/keys are encrypted at rest with a key derived from the user's
// password via a MEMORY-HARD KDF (Argon2id). Only the resulting ciphertext
// blob may ever touch the backend or sync. The backend stores ciphertext it
// CANNOT decrypt — this is what makes the wallet non-custodial even with an
// untrusted server (see threat model: "malicious backend").
//
// Construction:
//   - KDF:        Argon2id (hash-wasm) — memory-hard, resists GPU/ASIC cracking.
//   - Cipher:     AES-256-GCM via WebCrypto (authenticated; detects tampering).
//   - Salt/nonce: fresh random per encryption from crypto.getRandomValues.
//
// IMPORTANT LIMITATIONS (be honest about these in your threat model):
//   - JavaScript cannot guarantee memory zeroization or prevent secrets from
//     lingering in GC'd buffers. We zero what we can; true secret hygiene on
//     web is best-effort. Mobile/extension with OS keystore is stronger.
//   - Password strength bounds everything. Pair with a strength meter and,
//     ideally, wrap the vault key in a device keystore (Secure Enclave /
//     Android Keystore) so the password is not the sole factor.

import { argon2id } from 'hash-wasm';

// CURRENT at-rest KDF parameters (used for every NEW encryption). SAST finding M3
// raised these: on web the password is the SOLE factor protecting the seed (no
// hardware key-wrap; web.js isSecureHardwareAvailable() === false), and this KDF
// is not gating an interactive login — it stands between an exfiltrated ciphertext
// blob and the user's seed, offline and GPU/ASIC-crackable. 64 MiB cleared only the
// OWASP interactive-login floor; for a single-factor at-rest seed vault we want a
// more conservative, memory-hard cost (memory is the lever against parallel
// cracking hardware).
//
// CHOSEN: 192 MiB / t=3 — 3x the memory-hardness of the old 64 MiB, deliberately
// BALANCED for a phone rather than maxed out. Measured unlock-KDF latency (desktop
// browser, native WASM): 64 MiB ~160 ms -> 192 MiB ~440 ms; a low-end phone runs
// ~2-4x slower (~1-1.7 s), which is tolerable for an infrequent seed-vault unlock
// without risking the webview-memory pressure / multi-second stalls a flat 256 MiB
// (~720 ms desktop, ~2-3 s low-end phone) would bring with no per-device tuning yet.
//
// ⚠️ THE CHOSEN VALUES REQUIRE INDEPENDENT AUDIT VALIDATION (see
// docs/Security.roadmap.md): the right point on the security/unlock-latency curve
// is device-dependent. The migration below (decrypt-with-blob-params + lazy rekey)
// EXISTS precisely so the audit can later raise this — e.g. to 256 MiB on capable
// devices, tuned by device class — without locking anyone out. EXPORTED so the
// stealth chaff pool advertises the SAME params (otherwise chaff vs real blobs
// would differ by their kdf field — a deniability tell).
export const KDF_PARAMS = Object.freeze({
  parallelism: 1,
  iterations: 3,
  memorySize: 196608, // KiB == 192 MiB
  hashLength: 32,     // 256-bit key for AES-256
});

// LEGACY params used by vaults encrypted before M3. We do NOT decrypt with the
// CURRENT params — we read each blob's OWN recorded params (paramsFromVault), so
// existing vaults keep opening. This is the floor for blobs whose kdf field is
// absent/partial (none in practice — encryptVault has always recorded kdf).
const LEGACY_KDF_PARAMS = Object.freeze({
  parallelism: 1,
  iterations: 3,
  memorySize: 65536, // KiB == 64 MiB
  hashLength: 32,
});

// Upper bounds on KDF params accepted from a stored/IMPORTED blob. A blob records
// its own Argon2id params (M3 migration), and on the backup-import path those params
// are ATTACKER-CONTROLLED (vaultBackup.decodeBinary reads them via getUint32 with no
// ceiling). deriveKey() feeds memorySize straight into argon2id, which allocates that
// many KiB BEFORE the AES-GCM tag is checked — so an unbounded value is a
// pre-authentication resource-exhaustion (OOM) vector. Ceilings are generous (well
// above CURRENT params) yet cap the worst-case allocation/work to a survivable bound.
const MAX_KDF_PARAMS = Object.freeze({
  parallelism: 4,
  iterations: 12,
  memorySize: 1048576, // KiB == 1 GiB (CURRENT is 192 MiB)
  hashLength: 64,
});

// Floors guard against a malformed/too-weak record (and non-integers). The real
// protection is the memorySize/iterations CEILING; the floors are defense-in-depth.
const MIN_KDF_PARAMS = Object.freeze({
  parallelism: 1,
  iterations: 1,
  memorySize: 1024, // KiB == 1 MiB
  hashLength: 16,   // AES-128 minimum (CURRENT is 32)
});

/**
 * Reject KDF params (read from a stored or imported blob) that are not positive
 * integers within [MIN_KDF_PARAMS, MAX_KDF_PARAMS]. Throws a GENERIC error — a blob
 * with out-of-range params is malformed/tampered/malicious, not a credential signal,
 * so this leaks no oracle. Called by paramsFromVault before any argon2id derivation.
 * @param {{parallelism:number,iterations:number,memorySize:number,hashLength:number}} p
 * @returns {p}
 */
export function assertSaneKdfParams(p) {
  for (const name of ['parallelism', 'iterations', 'memorySize', 'hashLength']) {
    const v = p[name];
    if (!Number.isInteger(v) || v < MIN_KDF_PARAMS[name] || v > MAX_KDF_PARAMS[name]) {
      throw new Error('Vault KDF parameters out of range — refusing to derive key');
    }
  }
  return p;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/**
 * @param {string} password
 * @param {Uint8Array} salt
 * @param {{parallelism:number,iterations:number,memorySize:number,hashLength:number}} [params]
 */
async function deriveKey(password, salt, params = KDF_PARAMS) {
  const { parallelism, iterations, memorySize, hashLength } = params;
  const raw = await argon2id({
    password: enc.encode(password.normalize('NFKC')),
    salt,
    parallelism,
    iterations,
    memorySize,
    hashLength,
    outputType: 'binary',
  });
  // Import into WebCrypto as a non-extractable AES-GCM key.
  const key = await crypto.subtle.importKey('raw', /** @type {BufferSource} */ (raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  zero(raw);
  // DEFECT-A defense-in-depth: yield to a macrotask so hash-wasm's ~192 MiB Argon2
  // WASM instance from THIS derivation becomes GC-eligible before the next sequential
  // derivation allocates its own 192 MiB — keeping peak memory one-at-a-time rather
  // than concurrent. Best-effort (GC is non-deterministic) and negligible latency;
  // the v2 onboarding architecture (create from the light empty dashboard) is the
  // primary mitigation. Web-Worker-per-KDF is the documented escalation if on-device
  // testing surfaces a failure. KDF_PARAMS are NOT changed (chaff/personalized parity).
  await new Promise((resolve) => setTimeout(resolve, 0));
  return key;
}

// Read the KDF params a blob was ENCRYPTED with, so old vaults decrypt with their
// own (old) params after we raise the defaults. Falls back to LEGACY for any blob
// whose kdf field is absent/partial. This is the heart of the M3 migration: NEVER
// decrypt with the current params — decrypt with the blob's recorded params.
function paramsFromVault(vault) {
  const k = (vault && vault.kdf) || {};
  // Clamp-or-reject before these reach deriveKey/argon2id — the import path makes
  // these attacker-controlled (pre-auth DoS guard; security audit 2026-06-23 B-1/B-2).
  return assertSaneKdfParams({
    parallelism: k.parallelism ?? LEGACY_KDF_PARAMS.parallelism,
    iterations: k.iterations ?? LEGACY_KDF_PARAMS.iterations,
    memorySize: k.memorySize ?? LEGACY_KDF_PARAMS.memorySize,
    hashLength: k.hashLength ?? LEGACY_KDF_PARAMS.hashLength,
  });
}

/**
 * Whether a blob was encrypted with WEAKER params than the current default and
 * should be transparently re-encrypted (rekeyed) at the stronger params on the
 * next successful unlock. Migration is upgrade-only — we never downgrade.
 * @param {object} vault
 * @returns {boolean}
 */
export function vaultNeedsRekey(vault) {
  const p = paramsFromVault(vault);
  return p.memorySize < KDF_PARAMS.memorySize
    || p.iterations < KDF_PARAMS.iterations
    || p.parallelism < KDF_PARAMS.parallelism
    || p.hashLength < KDF_PARAMS.hashLength;
}

/**
 * Encrypt a plaintext secret (e.g. the mnemonic) into a portable vault blob.
 * The returned object is safe to persist locally and to sync to a backend.
 * @param {string} secret - LIVE SECRET (mnemonic / seed material)
 * @param {string} password
 * @returns {Promise<object>} serializable vault { v, kdf, salt, iv, ct }
 */
export async function encryptVault(secret, password) {
  const salt = randomBytes(16);
  const iv = randomBytes(12); // 96-bit nonce for GCM
  const key = await deriveKey(password, salt);
  const ptBytes = enc.encode(secret);
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, ptBytes);
  zero(ptBytes);
  return {
    v: 1,
    kdf: { name: 'argon2id', ...KDF_PARAMS },
    salt: b64(salt),
    iv: b64(iv),
    ct: b64(new Uint8Array(ctBuf)),
  };
}

/**
 * Decrypt a vault blob back to the plaintext secret.
 * GCM authentication means a wrong password OR tampered blob throws.
 * @returns {Promise<string>} the secret (LIVE SECRET — minimize lifetime)
 */
export async function decryptVault(vault, password) {
  if (vault?.v !== 1) throw new Error('Unsupported vault version');
  const salt = unb64(vault.salt);
  const iv = unb64(vault.iv);
  const ct = unb64(vault.ct);
  // Decrypt with the params THIS blob was encrypted with (M3 migration), so a
  // vault written under the old 64 MiB params still opens after the default is
  // raised. New vaults record the new params and decrypt with them.
  const key = await deriveKey(password, salt, paramsFromVault(vault));
  let ptBuf;
  try {
    ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  } catch {
    // Do not distinguish "wrong password" from "tampered blob" to the caller.
    throw new Error('Decryption failed: wrong password or corrupted vault');
  }
  const out = dec.decode(ptBuf);
  zero(new Uint8Array(ptBuf));
  return out;
}

// Best-effort zeroization. Not a guarantee in JS, but reduces window of exposure.
function zero(u8) { if (u8 && u8.fill) u8.fill(0); }

// base64 helpers (no Buffer dependency; browser-safe)
function b64(u8) { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); }
function unb64(str) { const s = atob(str); const u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; }
