// EnclaveError.swift — typed error taxonomy for the M2c Secure Enclave plugin.
//
// PROVISIONAL — NOT AUDITED-SECURE. Part of the M2c-1 scaffold (F-2 closure).
// Each case carries a stable string `code` surfaced to JS so the unlock UI can
// switch on the failure kind without parsing a localized description.
// See docs/M2cd.native-acl-plan.md.

import Foundation
import LocalAuthentication

enum EnclaveError: Error {
    // Key lifecycle / Security-framework failures.
    case secureEnclaveUnavailable
    case keyGenerationFailed(String)
    case publicKeyUnavailable
    case algorithmUnsupported
    case keyNotFound
    case wrapFailed(String)
    case unwrapFailed(String)

    // LocalAuthentication / biometric failures (surfaced from unwrap).
    case biometryNotEnrolled
    case biometryLockout
    case userCancel
    case userFallback
    case authFailed(Int)

    // Encoding.
    case base64DecodeFailed

    // Codex ad-hoc review 2026-07-17 P2-#2: a pre-existing keychain item under our
    // application tag that is NOT backed by the Secure Enclave (e.g. left over from
    // an older dev build with a weaker ACL / non-SE token). Refuse to reuse it —
    // the caller must explicitly delete it (via deleteWrappingKey with an intent)
    // before createWrappingKey can re-create a fresh SE-backed key.
    case staleWrappingKey

    /// Stable machine code handed to JS via CAPPluginCall.reject(message, code).
    var code: String {
        switch self {
        case .secureEnclaveUnavailable: return "ENCLAVE_UNAVAILABLE"
        case .keyGenerationFailed:      return "KEY_GEN_FAILED"
        case .publicKeyUnavailable:     return "PUBLIC_KEY_UNAVAILABLE"
        case .algorithmUnsupported:     return "ALGORITHM_UNSUPPORTED"
        case .keyNotFound:              return "KEY_NOT_FOUND"
        case .wrapFailed:               return "WRAP_FAILED"
        case .unwrapFailed:             return "UNWRAP_FAILED"
        case .biometryNotEnrolled:      return "BIOMETRY_NOT_ENROLLED"
        case .biometryLockout:          return "BIOMETRY_LOCKOUT"
        case .userCancel:               return "USER_CANCEL"
        case .userFallback:             return "USER_FALLBACK"
        case .authFailed:               return "AUTH_FAILED"
        case .base64DecodeFailed:       return "BASE64_DECODE_FAILED"
        case .staleWrappingKey:         return "STALE_WRAPPING_KEY"
        }
    }

    /// Human-readable message. NEVER includes secret/blob material.
    var message: String {
        switch self {
        case .secureEnclaveUnavailable: return "No Secure Enclave on this device"
        case .keyGenerationFailed(let m): return "Enclave key generation failed: \(m)"
        case .publicKeyUnavailable:     return "Could not derive the Enclave public key"
        case .algorithmUnsupported:     return "ECIES algorithm not supported by the key"
        case .keyNotFound:              return "No Enclave wrapping key found"
        case .wrapFailed(let m):        return "Wrap failed: \(m)"
        case .unwrapFailed(let m):      return "Unwrap failed: \(m)"
        case .biometryNotEnrolled:      return "No biometrics enrolled"
        case .biometryLockout:          return "Biometrics locked out"
        case .userCancel:               return "Authentication cancelled"
        case .userFallback:             return "Password fallback requested"
        case .authFailed(let c):        return "Authentication failed (code \(c))"
        case .base64DecodeFailed:       return "Invalid base64 input"
        case .staleWrappingKey:         return "Existing wrapping key is not Secure-Enclave-backed; explicit delete required before re-create"
        }
    }
}
