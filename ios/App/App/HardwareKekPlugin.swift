// HardwareKekPlugin.swift — iOS Keychain HMAC-SHA256 hardware factor
//
// STATUS: BUILT (UNAUDITED-PROVISIONAL) — awaiting independent third-party audit.
//
// H14 honesty fix: this file does NOT "mirror HardwareKekPlugin.kt exactly".
// The Android side uses AndroidKeyStore (TEE/StrongBox HMAC key); the iOS side
// stores a random 32-byte secret in the Keychain protected by SecAccessControl
// with .biometryCurrentSet. The security property is equivalent (biometric-bound,
// invalidated on enrollment change, never leaves the device), but the mechanism
// is different — Keychain vs KeyStore, HMAC-SHA256 computed in Swift vs Java.
//
// Security invariants:
//   I4 — NEVER fabricates H; biometric failure / item-not-found → reject (fail closed)
//   kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly — item non-migratable, device-only
//   .biometryCurrentSet — Face ID / Touch ID required per read; key invalidated if
//     any biometric is added or removed (equivalent to Android setInvalidatedByBiometricEnrollment)
//
// NOTE: kSecUseOperationPrompt is deprecated since iOS 9. A future hardening pass
// should migrate to LAContext.evaluatePolicy + kSecUseAuthenticationContext for
// explicit control over the authentication context and re-use policy.
//
// UNAUDITED-PROVISIONAL: awaiting independent third-party audit.

import Foundation
import Capacitor
import CryptoKit
import LocalAuthentication

private let KEY_LABEL    = "veyrnox_kek_hmac_v1"
private let KEYCHAIN_SVC = "com.veyrnox.app"

// PRF_EVAL_SALT: "Veyrnox-prf-v1-kek-eval-salt!!!!" (32 bytes).
// MUST NOT change after first enrollment — changing it changes H, making every
// enrolled vault permanently undecryptable.
private let PRF_EVAL_SALT: [UInt8] = [
    0x56,0x65,0x79,0x72,0x6e,0x6f,0x78,0x2d,
    0x70,0x72,0x66,0x2d,0x76,0x31,0x2d,0x6b,
    0x65,0x6b,0x2d,0x65,0x76,0x61,0x6c,0x2d,
    0x73,0x61,0x6c,0x74,0x21,0x21,0x21,0x21
]

@objc(HardwareKekPlugin)
public class HardwareKekPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HardwareKekPlugin"
    public let jsName = "HardwareKek"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "enroll",            returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isEnrolled",        returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearCredential",   returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getHardwareFactor", returnType: CAPPluginReturnPromise),
    ]

    /// Generate and store a 32-byte HMAC key in the Keychain with biometryCurrentSet
    /// access control. Idempotent — deletes any existing key before writing.
    @objc func enroll(_ call: CAPPluginCall) {
        var keyBytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, 32, &keyBytes) == errSecSuccess else {
            call.reject("Key generation failed")
            return
        }

        var cfError: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
            .biometryCurrentSet,    // invalidated if new Face ID / Touch ID enrolled
            &cfError
        ) else {
            call.reject("Access control error: \(cfError?.takeRetainedValue().localizedDescription ?? "unknown")")
            return
        }

        // Delete existing key (idempotent re-enroll)
        deleteKey()

        let addQuery: [String: Any] = [
            kSecClass as String:              kSecClassGenericPassword,
            kSecAttrService as String:        KEYCHAIN_SVC,
            kSecAttrAccount as String:        KEY_LABEL,
            kSecValueData as String:          Data(keyBytes),
            kSecAttrAccessControl as String:  access,
        ]
        let status = SecItemAdd(addQuery as CFDictionary, nil)
        guard status == errSecSuccess else {
            call.reject("Keychain write failed: \(status)")
            return
        }
        call.resolve()
    }

    /// Check whether the key exists without triggering biometric.
    @objc func isEnrolled(_ call: CAPPluginCall) {
        let query: [String: Any] = [
            kSecClass as String:             kSecClassGenericPassword,
            kSecAttrService as String:       KEYCHAIN_SVC,
            kSecAttrAccount as String:       KEY_LABEL,
            kSecUseAuthenticationUI as String: kSecUseAuthenticationUIFail,
        ]
        let status = SecItemCopyMatching(query as CFDictionary, nil)
        // errSecInteractionNotAllowed = item exists but requires auth → enrolled
        let enrolled = (status == errSecSuccess || status == errSecInteractionNotAllowed)
        call.resolve(["enrolled": enrolled])
    }

    /// Delete the HMAC key from Keychain.
    @objc func clearCredential(_ call: CAPPluginCall) {
        deleteKey()
        call.resolve()
    }

    /// Present Face ID / Touch ID, retrieve the key, compute HMAC-SHA256(key, PRF_EVAL_SALT).
    /// Returns { h: base64 } — 32 bytes. NEVER fabricates H (I4).
    @objc func getHardwareFactor(_ call: CAPPluginCall) {
        let query: [String: Any] = [
            kSecClass as String:              kSecClassGenericPassword,
            kSecAttrService as String:        KEYCHAIN_SVC,
            kSecAttrAccount as String:        KEY_LABEL,
            kSecReturnData as String:         true,
            kSecUseOperationPrompt as String: "Authenticate to access your wallet",
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        switch status {
        case errSecSuccess:
            guard let keyData = item as? Data else {
                call.reject("Keychain returned invalid data")
                return
            }
            let key  = SymmetricKey(data: keyData)
            let mac  = HMAC<SHA256>.authenticationCode(for: Data(PRF_EVAL_SALT), using: key)
            let h    = Data(mac)
            guard h.count == 32 else {
                call.reject("HMAC output wrong length: \(h.count)")
                return
            }
            call.resolve(["h": h.base64EncodedString()])

        case errSecItemNotFound:
            call.reject("No hardware key enrolled — call enroll() first")

        case errSecUserCanceled, -128:
            call.reject("User cancelled")

        case errSecAuthFailed:
            // Biometrics changed — key is permanently invalidated; clear it (fail closed)
            deleteKey()
            call.reject("Hardware key invalidated — re-enrollment required")

        default:
            call.reject("Keychain retrieval failed: \(status)")
        }
    }

    // MARK: - Private

    private func deleteKey() {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: KEYCHAIN_SVC,
            kSecAttrAccount as String: KEY_LABEL,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
