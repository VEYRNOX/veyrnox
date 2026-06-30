// HardwareKekPlugin.swift — iOS Secure Enclave ECIES Hardware KEK
//
// STATUS: BUILT (UNAUDITED-PROVISIONAL) — H-NEW-D fix implemented 2026-06-30.
//
// H-NEW-D FIX: migrated from standard Keychain (kSecClassGenericPassword,
// kSecAttrTokenID absent) to a Secure Enclave P-256 Key Agreement key.
// The SE private key NEVER leaves the coprocessor; biometric (Face ID /
// Touch ID with .biometryCurrentSet ACL) is required per use.
//
// Previous design (H14 / H-NEW-D gap):
//   Stored a 32-byte HMAC key as a Keychain item. Biometric ACL protected reads
//   at the OS level but a privileged process on a jailbroken device could extract
//   the raw key bytes from the Keychain blob.
//
// New design (SE-ECIES):
//   1. Generate SE P-256 Key Agreement key (private key never leaves SE).
//   2. Generate random 32-byte H at enrollment time.
//   3. Encrypt H using ECIES:
//        ephemeral = ephemeral P-256 keypair (non-SE, private key discarded)
//        shared    = ECDH(ephemeral_private, SE_public)   ← no biometric needed
//        sym       = HKDF-SHA256(shared, info="veyrnox-kek-enc-v1")
//        enc_H     = AES-GCM-seal(H, sym)
//   4. Store in Keychain (no biometric ACL on these items — they are useless
//      without the SE private key):
//        KEY_SE_REF    — opaque SE key dataRepresentation
//        KEY_EPHEM_PUB — 65-byte X9.63 ephemeral public key
//        KEY_ENC_H     — AES-GCM ciphertext + tag (48 bytes = 32+16)
//        KEY_NONCE     — 12-byte AES-GCM nonce
//   5. getHardwareFactor:
//        Load SE key, load ephemeral pub, load enc_H + nonce.
//        shared = ECDH(SE_private, ephemeral_pub)  ← FACE ID triggers here
//        sym    = HKDF-SHA256(shared, info="veyrnox-kek-enc-v1")
//        H      = AES-GCM-open(enc_H, nonce, sym)
//        return base64(H)
//
// Security invariants:
//   I4  — NEVER fabricates H; biometric failure / item-not-found → reject (fail closed)
//   SE  — private key physically non-extractable (Apple Secure Enclave coprocessor)
//   ACL — .biometryCurrentSet: Face ID / Touch ID required per read; key permanently
//         invalidated if any biometric is added or removed (same as Android
//         setInvalidatedByBiometricEnrollment(true))
//   kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly — non-migratable, device-only
//
// UNAUDITED-PROVISIONAL: awaiting independent third-party audit.
// The JS caller interface ({ h: base64, 32 bytes }) is unchanged from H14.

import Foundation
import Capacitor
import CryptoKit
import LocalAuthentication

private let KEYCHAIN_SVC  = "com.veyrnox.app"
private let KEY_SE_REF    = "veyrnox_kek_se_ref_v2"      // SE key opaque data
private let KEY_EPHEM_PUB = "veyrnox_kek_ephem_pub_v2"   // ephemeral pub key (X9.63)
private let KEY_ENC_H     = "veyrnox_kek_enc_h_v2"       // AES-GCM ciphertext+tag (32+16 bytes)
private let KEY_NONCE     = "veyrnox_kek_nonce_v2"       // AES-GCM nonce (12 bytes)

// All v1 legacy Keychain item labels — cleared on first enroll to avoid stale data.
private let LEGACY_KEY_LABEL = "veyrnox_kek_hmac_v1"

private let HKDF_INFO = Data("veyrnox-kek-enc-v1".utf8)

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

    /// Enroll: generate SE key + random H, encrypt H under ECIES, store in Keychain.
    /// Idempotent — clears any prior enrollment before writing.
    @objc func enroll(_ call: CAPPluginCall) {
        do {
            // 1. Biometric access control for the SE key.
            var cfError: Unmanaged<CFError>?
            guard let access = SecAccessControlCreateWithFlags(
                nil,
                kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
                [.privateKeyUsage, .biometryCurrentSet],
                &cfError
            ) else {
                call.reject("Access control error: \(cfError?.takeRetainedValue().localizedDescription ?? "unknown")")
                return
            }

            // 2. Generate SE P-256 Key Agreement key (private key stays in SE).
            let seKey = try SecureEnclave.P256.KeyAgreement.PrivateKey(accessControl: access)

            // 3. Generate random 32-byte H.
            var hBytes = [UInt8](repeating: 0, count: 32)
            guard SecRandomCopyBytes(kSecRandomDefault, 32, &hBytes) == errSecSuccess else {
                call.reject("H generation failed")
                return
            }
            let hData = Data(hBytes)

            // 4. Ephemeral P-256 keypair (non-SE). Private key discarded after ECDH.
            let ephemeralKey = P256.KeyAgreement.PrivateKey()

            // 5. ECDH(ephemeral_private, SE_public) — uses SE public key, no biometric.
            let sharedSecret = try ephemeralKey.sharedSecretFromKeyAgreement(with: seKey.publicKey)

            // 6. HKDF → 32-byte symmetric key.
            let symmetricKey = sharedSecret.hkdfDerivedSymmetricKey(
                using: SHA256.self,
                salt: Data(),
                sharedInfo: HKDF_INFO,
                outputByteCount: 32
            )

            // 7. AES-GCM seal H.
            let sealedBox = try AES.GCM.seal(hData, using: symmetricKey)
            let nonce     = sealedBox.nonce.withUnsafeBytes { Data($0) }
            let encH      = sealedBox.ciphertext + sealedBox.tag   // 32 + 16 = 48 bytes

            // 8. Clear legacy v1 items + current v2 items, then store fresh.
            clearAllKeychainItems()
            try storeKeychainItem(label: KEY_SE_REF,    data: seKey.dataRepresentation)
            try storeKeychainItem(label: KEY_EPHEM_PUB, data: ephemeralKey.publicKey.x963Representation)
            try storeKeychainItem(label: KEY_ENC_H,     data: encH)
            try storeKeychainItem(label: KEY_NONCE,     data: nonce)

            // ephemeralKey falls out of scope — private key never persisted.
            call.resolve()

        } catch {
            call.reject("Enroll failed: \(error.localizedDescription)")
        }
    }

    /// Check whether the SE key reference exists — no biometric triggered.
    @objc func isEnrolled(_ call: CAPPluginCall) {
        call.resolve(["enrolled": loadKeychainItem(label: KEY_SE_REF) != nil])
    }

    /// Delete all KEK Keychain items (legacy v1 + current v2).
    @objc func clearCredential(_ call: CAPPluginCall) {
        clearAllKeychainItems()
        call.resolve()
    }

    /// Retrieve H: load stored components, ECDH with SE key (Face ID triggers),
    /// decrypt H, return { h: base64 }. NEVER fabricates H (I4).
    @objc func getHardwareFactor(_ call: CAPPluginCall) {
        do {
            // 1. Load Keychain items.
            guard
                let seRefData  = loadKeychainItem(label: KEY_SE_REF),
                let ephPubData = loadKeychainItem(label: KEY_EPHEM_PUB),
                let encHData   = loadKeychainItem(label: KEY_ENC_H),
                let nonceData  = loadKeychainItem(label: KEY_NONCE)
            else {
                call.reject("No hardware key enrolled — call enroll() first")
                return
            }

            // 2. Reconstruct SE key from opaque data (biometric triggers on use, not here).
            let seKey = try SecureEnclave.P256.KeyAgreement.PrivateKey(dataRepresentation: seRefData)

            // 3. Reconstruct ephemeral public key.
            let ephemeralPublicKey = try P256.KeyAgreement.PublicKey(x963Representation: ephPubData)

            // 4. ECDH(SE_private, ephemeral_public) ← FACE ID / TOUCH ID TRIGGERS HERE.
            let sharedSecret = try seKey.sharedSecretFromKeyAgreement(with: ephemeralPublicKey)

            // 5. HKDF → same symmetric key.
            let symmetricKey = sharedSecret.hkdfDerivedSymmetricKey(
                using: SHA256.self,
                salt: Data(),
                sharedInfo: HKDF_INFO,
                outputByteCount: 32
            )

            // 6. AES-GCM open. encHData = ciphertext (32 bytes) + tag (16 bytes).
            guard encHData.count == 48 else {
                call.reject("Corrupted encrypted H: expected 48 bytes, got \(encHData.count)")
                return
            }
            let ciphertext = encHData.prefix(32)
            let tag        = encHData.suffix(16)
            let nonce      = try AES.GCM.Nonce(data: nonceData)
            let sealedBox  = try AES.GCM.SealedBox(nonce: nonce, ciphertext: ciphertext, tag: tag)
            let hData      = try AES.GCM.open(sealedBox, using: symmetricKey)

            guard hData.count == 32 else {
                call.reject("H wrong length: \(hData.count)")
                return
            }

            call.resolve(["h": hData.base64EncodedString()])

        } catch {
            let nsError = error as NSError
            // User cancelled biometric prompt.
            if nsError.code == Int(errSecUserCanceled) || nsError.code == -128
                || nsError.domain == LAErrorDomain && nsError.code == LAError.userCancel.rawValue {
                call.reject("User cancelled")
                return
            }
            // Biometrics changed — .biometryCurrentSet invalidated the SE key permanently.
            if nsError.domain == LAErrorDomain && (
                nsError.code == LAError.biometryNotEnrolled.rawValue ||
                nsError.code == LAError.biometryLockout.rawValue
            ) {
                clearAllKeychainItems()
                call.reject("Hardware key invalidated — re-enrollment required")
                return
            }
            // Auth failed (wrong biometric, key invalidated by biometry change).
            if nsError.code == Int(errSecAuthFailed) {
                clearAllKeychainItems()
                call.reject("Hardware key invalidated — re-enrollment required")
                return
            }
            call.reject("Hardware factor retrieval failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Private Keychain helpers

    private func storeKeychainItem(label: String, data: Data) throws {
        let query: [String: Any] = [
            kSecClass as String:          kSecClassGenericPassword,
            kSecAttrService as String:    KEYCHAIN_SVC,
            kSecAttrAccount as String:    label,
            kSecValueData as String:      data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status),
                          userInfo: [NSLocalizedDescriptionKey: "Keychain write failed: \(status)"])
        }
    }

    private func loadKeychainItem(label: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: KEYCHAIN_SVC,
            kSecAttrAccount as String: label,
            kSecReturnData as String:  true,
            kSecMatchLimit as String:  kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess else { return nil }
        return item as? Data
    }

    private func deleteKeychainItem(label: String) {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: KEYCHAIN_SVC,
            kSecAttrAccount as String: label,
        ]
        SecItemDelete(query as CFDictionary)
    }

    private func clearAllKeychainItems() {
        // v2 items
        for label in [KEY_SE_REF, KEY_EPHEM_PUB, KEY_ENC_H, KEY_NONCE] {
            deleteKeychainItem(label: label)
        }
        // v1 legacy item (kSecClassGenericPassword with old label)
        deleteKeychainItem(label: LEGACY_KEY_LABEL)
    }
}
