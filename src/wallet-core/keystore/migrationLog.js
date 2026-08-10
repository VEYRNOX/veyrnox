// Shared, LOG-1-safe reporter for the AAD v:3 vault migration (#1111).
//
// WHY THIS EXISTS
// The v:3 migration hooks (native.js _unlockInner, web.js unlock) and the
// rotation/repersist reseal branches must NEVER fail an otherwise-successful
// unlock — a migration is a best-effort background upgrade. But they must also
// not SWALLOW the failure: a device that can never migrate is otherwise
// indistinguishable from one that already has, so a permanently-stuck vault
// stays invisible forever. This is the same policy native.js already states for
// the M2c up-migration (see logM2cMigrationFailure there); this module is its
// sibling for the v:3 path, shared so the sanitiser exists in ONE place rather
// than being copied into both keystores.
//
// LOG-1: only an allowlisted, hardcoded literal ever crosses the console
// boundary. The error object itself is never passed to console.* — some logger
// configurations serialise attached fields, and these errors can carry the
// vault blob, the ciphertext, the kekWrap, or key material.

// Codes/messages reachable from the v:3 reseal + write path:
//   VAULT_MALFORMED           — vault.js encryptVaultWithDekV3 structural reject
//                               (incomplete binding: a caller bug)
//   MALFORMED_VAULT           — kek.js parseVaultBlob (KEK_ERR), defensive
//   VAULT_WRITE_VERIFY_FAILED — native.js safeWriteVault read-back mismatch
const ALLOWED_AAD_V3_CODES = Object.freeze([
  'VAULT_MALFORMED',
  'MALFORMED_VAULT',
  'VAULT_WRITE_VERIFY_FAILED',
]);

// Platform error constructors we are willing to name. Anything else — including
// a crafted object whose `constructor.name` is attacker-chosen — degrades to
// 'unknown error'. Keeps the "no caller-controlled text" contract literally true.
const ALLOWED_ERROR_CONSTRUCTORS = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'DOMException',      // crypto.subtle.encrypt rejection
  'OperationError',    // WebCrypto, some engines
]);

/**
 * Reduce an arbitrary thrown value to a single allowlisted literal, or a
 * shape-only description. Never returns caller-controlled text.
 *
 * Matches on `.code` OR `.message`, because the two throw styles in this path
 * differ: vault.js/kek.js attach a stable `.code`, while safeWriteVault throws
 * a bare `new Error('VAULT_WRITE_VERIFY_FAILED')` with no code. Matching the
 * message against the SAME allowlist is still LOG-1-safe — the value emitted is
 * the allowlist entry, never the error's own string.
 *
 * @param {unknown} e
 * @returns {string}
 */
export function safeAadV3Detail(e) {
  if (e && typeof e === 'object') {
    const err = /** @type {{code?:unknown, message?:unknown}} */ (e);
    for (const allowed of ALLOWED_AAD_V3_CODES) {
      if (err.code === allowed || err.message === allowed) return allowed;
    }
    // Constructor name is a useful diagnostic (DOMException from subtle.encrypt
    // vs a plain Error), but it is NOT inherently safe: `constructor.name` is
    // attacker-reachable on a crafted throw (`{ constructor: { name: '<text>' }}`),
    // which would put caller-controlled text on the console and break this
    // module's own "allowlisted literals only" contract. Codex [P3], 2026-08-09.
    // So the constructor name is itself allowlisted.
    const ctor = /** @type {{constructor?:{name?:unknown}}} */ (e).constructor;
    if (ctor && typeof ctor.name === 'string' && ALLOWED_ERROR_CONSTRUCTORS.has(ctor.name)) {
      return `${ctor.name} (unknown code)`;
    }
  }
  return 'unknown error';
}

/**
 * Report a failed AAD v:3 migration/reseal. Never throws — a logger fault must
 * not turn a best-effort migration into a failed unlock.
 * @param {unknown} e
 */
export function logAadV3MigrationFailure(e) {
  try {
    console.error('[keystore] AAD v:3 migration failed:', safeAadV3Detail(e));
  } catch {
    /* a console that throws must not break unlock (I4: degrade, never escalate) */
  }
}
