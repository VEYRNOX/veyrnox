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
// blob and the user's seed, offline and GPU/ASIC-crackable. The OWASP
// interactive-login floor is far too weak for a single-factor at-rest seed vault;
// we want a conservative, memory-hard cost (memory is the lever against parallel
// cracking hardware).
//
// CHOSEN: 192 MiB / t=3 — the deliberate at-rest cost for a single-factor seed
// vault. 192 MiB produces ~6-8 s unlock times on real Capacitor WebView devices
// (the WASM KDF runs ~3-5x slower there than a desktop browser due to WebView
// JIT/memory constraints). That latency is now an ACCEPTED trade-off: Face ID /
// biometric unlock (device-verified 2026-07-05) mitigates the UX cost of the slow
// password path, so the stronger offline-seizure resistance is worth it. History:
// an earlier pass lowered this to 64 MiB (PR #465, 2026-06-28) purely for unlock
// latency before biometric unlock existed; with biometrics now available the raise
// back to 192 MiB is intentional, applied to existing 64 MiB vaults via the
// lazy-rekey migration below (no lockout). EXPORTED so stealth chaff advertises the
// SAME params (otherwise chaff vs real blobs differ on the kdf field — a
// deniability tell).
export const KDF_PARAMS = Object.freeze({
  parallelism: 1,
  iterations: 3,
  memorySize: 196608, // KiB == 192 MiB
  hashLength: 32,    // 256-bit key for AES-256
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

// --- Off-main-thread Argon2id (perceived-perf only; crypto + params UNCHANGED) ---
// The KDF derivation (KDF_PARAMS.memorySize, currently 192 MiB) blocks the UI
// thread, so the unlock spinner can't animate
// and the app looks frozen. Run it in a Web Worker when one is available; ALWAYS
// fall back to the exact in-thread argon2id on ANY worker problem (unsupported,
// error, or timeout), so unlock can never break (I4, fail closed). The worker runs
// the SAME hash-wasm argon2id with the SAME opts -> byte-identical key. Identical
// for every set (params unchanged), so it adds no deniability/timing tell (I3).
let _kdfWorker = null;
let _kdfWorkerState = 'idle'; // 'idle' | 'ready' | 'broken'
let _kdfReqId = 0;
const _kdfPending = new Map();

function _disableKdfWorker() {
  _kdfWorkerState = 'broken';
  try { if (_kdfWorker) _kdfWorker.terminate(); } catch { /* ignore */ }
  _kdfWorker = null;
  for (const p of _kdfPending.values()) p.reject(new Error('kdf-worker-disabled'));
  _kdfPending.clear();
}

function _spawnKdfWorker() {
  if (_kdfWorkerState === 'broken') return null;
  if (_kdfWorker) return _kdfWorker;
  // No Worker (jsdom/test/SSR) -> in-thread only. This is the fast, no-op path.
  if (typeof Worker === 'undefined') { _kdfWorkerState = 'broken'; return null; }
  try {
    const w = new Worker(new URL('./keystore/argon2.worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'ready') { _kdfWorkerState = 'ready'; return; }
      const p = _kdfPending.get(d.id);
      if (!p) return;
      _kdfPending.delete(d.id);
      if (d.type === 'result') p.resolve(new Uint8Array(d.raw));
      else p.reject(new Error(d.message || 'kdf-worker-error'));
    };
    w.onerror = () => _disableKdfWorker();
    w.onmessageerror = () => _disableKdfWorker();
    _kdfWorker = w;
    return w;
  } catch {
    _kdfWorkerState = 'broken';
    return null;
  }
}

// Resolve a worker that has confirmed it can run (posted 'ready'), bounded by a
// short probe so a worker that constructs but can't load the module falls back
// fast instead of hanging. null -> derive in-thread.
async function _readyKdfWorker(probeMs = 3000) {
  const w = _spawnKdfWorker();
  if (!w) return null;
  if (_kdfWorkerState === 'ready') return w;
  const start = Date.now();
  while (_kdfWorkerState === 'idle' && Date.now() - start < probeMs) {
    await new Promise((r) => setTimeout(r, 25));
  }
  if (_kdfWorkerState !== 'ready') { _disableKdfWorker(); return null; }
  return w;
}

/**
 * Run hash-wasm argon2id off the main thread when possible, else in-thread. Output
 * is byte-identical either way (same impl + opts). A worker fault never propagates
 * past the in-thread fallback; only a genuine argon2id failure surfaces.
 * @returns {Promise<Uint8Array>}
 */
async function runArgon2idBinary(opts) {
  const w = await _readyKdfWorker();
  if (w) {
    try {
      return await new Promise((resolve, reject) => {
        const id = ++_kdfReqId;
        const timer = setTimeout(() => { _kdfPending.delete(id); reject(new Error('kdf-worker-timeout')); }, 60000);
        _kdfPending.set(id, {
          resolve: (v) => { clearTimeout(timer); resolve(v); },
          reject: (e) => { clearTimeout(timer); reject(e); },
        });
        w.postMessage({ id, opts });
      });
    } catch {
      _disableKdfWorker(); // this environment's worker can't derive -> stop trying
      // fall through to the in-thread derivation
    }
  }
  return /** @type {Uint8Array} */ (await argon2id({ ...opts, outputType: 'binary' }));
}

/**
 * @param {string} password
 * @param {Uint8Array} salt
 * @param {{parallelism:number,iterations:number,memorySize:number,hashLength:number}} [params]
 */
async function deriveKey(password, salt, params = KDF_PARAMS) {
  const { parallelism, iterations, memorySize, hashLength } = params;
  const pw = enc.encode(password.normalize('NFKC'));
  let raw;
  try {
    raw = await runArgon2idBinary({ password: pw, salt, parallelism, iterations, memorySize, hashLength });
  } finally {
    zero(pw); // wipe our copy of the password bytes (the worker wipes its own copy)
  }
  // Import into WebCrypto as a non-extractable AES-GCM key.
  const key = await crypto.subtle.importKey('raw', /** @type {BufferSource} */ (raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  zero(raw);
  // DEFECT-A defense-in-depth: yield to a macrotask so hash-wasm's Argon2 WASM
  // instance (KDF_PARAMS.memorySize, currently 192 MiB) from THIS derivation becomes
  // GC-eligible before the next sequential derivation allocates its own
  // KDF_PARAMS.memorySize — keeping peak memory one-at-a-time rather
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
 * Whether a blob's stored KDF params differ from the current KDF_PARAMS and should
 * be transparently re-encrypted on the next successful unlock. Triggers in both
 * directions, but the live direction is UP: vaults encrypted at the old 64 MiB
 * default are silently rekeyed to 192 MiB after one successful unlock (stronger
 * offline-seizure resistance; the ~6-8 s cost is absorbed by biometric unlock).
 * @param {object} vault
 * @returns {boolean}
 */
// Direction now UP: existing 64 MiB vaults rekey to 192 MiB on first unlock (deliberate, biometric-mitigated).
export function vaultNeedsRekey(vault) {
  const p = paramsFromVault(vault);
  return p.memorySize !== KDF_PARAMS.memorySize
    || p.iterations !== KDF_PARAMS.iterations
    || p.parallelism !== KDF_PARAMS.parallelism
    || p.hashLength !== KDF_PARAMS.hashLength;
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
/**
 * Encrypt a secret directly under a raw DEK (for KEK-enrolled vaults).
 * The DEK replaces the Argon2id-derived key so PIN rotation doesn't require
 * re-encrypting the seed — only the DEK wrap changes (spec §3).
 * @param {string} secret
 * @param {Uint8Array} dek 32-byte DEK
 * @returns {Promise<{v:number, kdf:string, iv:string, ct:string}>}
 */
export async function encryptVaultWithDek(secret, dek) {
  const iv = randomBytes(12);
  const key = await crypto.subtle.importKey('raw', /** @type {BufferSource} */ (dek), { name: 'AES-GCM' }, false, ['encrypt']);
  const ptBytes = enc.encode(secret);
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, ptBytes);
  zero(ptBytes);
  return { v: 1, kdf: 'kek-dek', iv: b64(iv), ct: b64(new Uint8Array(ctBuf)) };
}

/**
 * Decrypt a secret from a DEK-encrypted vault blob.
 * @param {{iv:string, ct:string}} vault
 * @param {Uint8Array} dek 32-byte DEK
 * @returns {Promise<string>}
 */
export async function decryptVaultWithDek(vault, dek) {
  const key = await crypto.subtle.importKey('raw', /** @type {BufferSource} */ (dek), { name: 'AES-GCM' }, false, ['decrypt']);
  try {
    const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(vault.iv) }, key, unb64(vault.ct));
    const out = dec.decode(ptBuf);
    zero(new Uint8Array(ptBuf));
    return out;
  } catch {
    throw new Error('Decryption failed: wrong DEK or corrupted vault');
  }
}

/**
 * Derive the raw 32-byte Argon2id output (the KEK C factor) for a given password
 * and salt, using the current KDF_PARAMS. Used exclusively by the KEK layer
 * (src/wallet-core/keystore/kek.js / web.js enrollKek) to compute the set factor C
 * without duplicating the argon2id import or params. NOT for direct vault encryption.
 * @param {string} password
 * @param {Uint8Array} salt  32-byte random salt (kekSalt stored alongside the blob)
 * @returns {Promise<Uint8Array>} 32-byte C factor
 */
export async function deriveKekC(password, salt) {
  const { argon2id: _argon2id } = await import('hash-wasm');
  const raw = await _argon2id({
    password: enc.encode(password.normalize('NFKC')),
    salt,
    parallelism: KDF_PARAMS.parallelism,
    iterations: KDF_PARAMS.iterations,
    memorySize: KDF_PARAMS.memorySize,
    hashLength: KDF_PARAMS.hashLength,
    outputType: 'binary',
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const result = new Uint8Array(raw);
  // M-J: zero the raw Argon2id output once copied, matching deriveKey()'s zero(raw).
  // Best-effort secret hygiene (JS cannot guarantee it) — but leaving the raw KEK-C
  // factor live in a GC'd buffer is an inconsistent, avoidable exposure window.
  if (raw && typeof raw.fill === 'function') raw.fill(0);
  return result;
}

function zero(u8) { if (u8 && u8.fill) u8.fill(0); }

// base64 helpers (no Buffer dependency; browser-safe)
function b64(u8) { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); }
function unb64(str) { const s = atob(str); const u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; }
