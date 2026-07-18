package com.veyrnox.app

// EnclaveErrors.kt — shared typed-error code catalogue for the M2d
// VeyrnoxEnclavePlugin (wrap + unwrap). Extracted from
// EnclaveKeyService.WrapErrors in M2d-1d so unwrap-specific codes
// (CIPHERTEXT_TAMPERED, MALFORMED_BUNDLE, UNWRAP_FAILED) live alongside the
// existing wrap codes and both operations reference the same object.
//
// These strings are the cross-platform contract: the shared JS wrapper
// (src/plugins/veyrnoxEnclave.js) and the iOS bridge
// (VeyrnoxEnclavePlugin.swift) dispatch on them by exact string match. Any
// drift here is a bug that would make callers matching
// `if (e.code === 'M2D_CIPHERTEXT_TAMPERED')` silently miss.
//
// The Android bridge PluginCall.reject signature is (message, code) —
// OPPOSITE of iOS's (code, message); see the Codex 2026-07-17 P2-A note in
// VeyrnoxEnclavePlugin.kt. That is a bridge-API convention, not something
// that changes the code values themselves.
//
// Pinned by EnclaveErrorsTest.
object EnclaveErrors {
    // Shared with the pre-existing wrap flow (M2d-1c).
    const val KEY_NOT_FOUND: String = "M2D_KEY_NOT_FOUND"
    const val KEY_INVALIDATED: String = "M2D_KEY_INVALIDATED"
    const val USER_CANCEL: String = "M2D_USER_CANCEL"
    const val BIOMETRY_LOCKOUT: String = "M2D_BIOMETRY_LOCKOUT"
    const val BIOMETRY_NOT_ENROLLED: String = "M2D_BIOMETRY_NOT_ENROLLED"
    const val AUTH_FAILED: String = "M2D_AUTH_FAILED"
    const val WRAP_FAILED: String = "M2D_WRAP_FAILED"

    // Added by M2d-1d for the unwrap path.
    //
    // CIPHERTEXT_TAMPERED — javax.crypto.AEADBadTagException from
    //   Cipher.doFinal on a valid-shape bundle. Security-critical distinction:
    //   this is a byte-flip / wrong-key / IV-tamper signal — the caller may
    //   surface it loudly. Kept DISTINCT from UNWRAP_FAILED so a generic
    //   internal error is not confused with an authentication failure.
    //
    // MALFORMED_BUNDLE — EnclaveWireFormat.unpack threw
    //   (bundle shorter than IV+TAG). Pre-cipher shape error, distinct
    //   from CIPHERTEXT_TAMPERED (which requires a valid-shape bundle).
    //
    // UNWRAP_FAILED — generic fallback for cipher init / doFinal errors
    //   that are not one of the above (e.g. an unexpected provider fault).
    const val CIPHERTEXT_TAMPERED: String = "M2D_CIPHERTEXT_TAMPERED"
    const val MALFORMED_BUNDLE: String = "M2D_MALFORMED_BUNDLE"
    const val UNWRAP_FAILED: String = "M2D_UNWRAP_FAILED"
}
