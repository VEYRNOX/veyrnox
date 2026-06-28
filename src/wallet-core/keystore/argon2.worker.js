// wallet-core/keystore/argon2.worker.js
// STATUS: BUILT — off-main-thread Argon2id KDF (perf only; no new crypto).
//
// Runs the SAME hash-wasm argon2id with the SAME params the main thread would —
// purely so the ~192 MiB derivation does not block the UI thread. vault.js always
// falls back to in-thread derivation on any worker fault (I4, fail closed), so this
// file can never lock a user out. KDF_PARAMS are unchanged; every set derives
// identically (no deniability/timing tell, I3).
//
// HYGIENE: no network, no persistence, no logging of secret bytes (I2/I3).
// Password is zeroed after use (must be Uint8Array — strings are rejected).
// Result buffer is transferred (moved), so no key bytes linger here.

import { argon2id } from 'hash-wasm';

// Minimum KDF params this worker will accept — mirrors vault.js MIN_KDF_PARAMS.
// Rejects downgrade attempts from a buggy or malicious caller.
const MIN_MEMORY_SIZE = 1024;   // 1 MiB (vault floor)
const MIN_ITERATIONS  = 1;

self.postMessage({ type: 'ready' });

self.onmessage = async (e) => {
  const { id, opts } = e.data || {};
  if (id == null) {
    self.postMessage({ type: 'error', id: null, message: 'missing id' });
    return;
  }

  // Require password to be a Uint8Array so zeroing is guaranteed (I4).
  if (!opts || !(opts.password instanceof Uint8Array)) {
    self.postMessage({ type: 'error', id, message: 'password must be Uint8Array' });
    return;
  }

  // Enforce param floor — reject caller-supplied params below the minimum.
  if (
    (opts.memorySize != null && opts.memorySize < MIN_MEMORY_SIZE) ||
    (opts.iterations  != null && opts.iterations  < MIN_ITERATIONS)
  ) {
    opts.password.fill(0);
    self.postMessage({ type: 'error', id, message: 'kdf-params below minimum' });
    return;
  }

  try {
    const raw = await argon2id({ ...opts, outputType: 'binary' });
    opts.password.fill(0);
    self.postMessage({ type: 'result', id, raw }, [raw.buffer]);
  } catch (err) {
    opts.password.fill(0);
    self.postMessage({ type: 'error', id, message: String((err && err.message) || err) });
  }
};
