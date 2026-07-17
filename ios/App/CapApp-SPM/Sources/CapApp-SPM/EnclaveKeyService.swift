// EnclaveKeyService.swift — Security-framework logic for the M2c key-wrap plugin.
//
// PROVISIONAL — NOT AUDITED-SECURE, NOT DEVICE-VERIFIED. Part of the M2c-1
// scaffold (F-2 closure). Wraps the already-encrypted vault blob under a
// non-exportable P-256 key generated INSIDE the Secure Enclave, whose private-key
// use the OS gates on a fresh biometric (kSecAccessControl .biometryCurrentSet).
//
//   wrap   = public-key ECIES  → NO biometric prompt
//   unwrap = private-key ECIES → OS PRESENTS Face ID / Touch ID (ACL-enforced)
//
// The vault crypto (Argon2id + AES-GCM in vault.js) is UNCHANGED; this only wraps
// the ciphertext blob. The Secure Enclave path CANNOT run on the iOS Simulator
// (kSecAttrTokenIDSecureEnclave / SecureEnclave.isAvailable are false there) — it
// must be verified on a physical iPhone in M2c-2. See docs/M2cd.native-acl-plan.md.

import Foundation
import Security
import LocalAuthentication
import CryptoKit

final class EnclaveKeyService {
    // Application tag identifying the single wrapping key in the keychain.
    private let tag = "com.veyrnox.app.enclaveWrappingKey".data(using: .utf8)!
    // ECIES: ephemeral-static ECDH (cofactor) + X9.63 SHA-256 KDF + AES-GCM.
    private let algorithm: SecKeyAlgorithm = .eciesEncryptionCofactorX963SHA256AESGCM

    struct Capability {
        let backing: String        // "secureEnclave" | "none"
        let biometryEnrolled: Bool
    }

    /// Reports whether a Secure Enclave is present AND a biometric is enrolled.
    /// Never throws. On the Simulator `backing` is "none".
    func capability() -> Capability {
        let enclave = SecureEnclave.isAvailable
        let context = LAContext()
        var error: NSError?
        let biometry = context.canEvaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics, error: &error
        )
        return Capability(backing: enclave ? "secureEnclave" : "none",
                          biometryEnrolled: biometry)
    }

    // MARK: - Key lifecycle

    /// Idempotent: returns immediately if the wrapping key already exists AND is
    /// verified to be Secure-Enclave-backed.
    ///
    /// Codex ad-hoc review 2026-07-17 P2-#2 — hardening for the M2C_ENABLED=true
    /// transition. Previously this short-circuited on `loadPrivateKey() != nil`
    /// alone, which would silently reuse a stale keychain item under our
    /// application tag left over from an older dev build with a WEAKER ACL or a
    /// non-Secure-Enclave token. Now: on reuse, query kSecReturnAttributes and
    /// assert kSecAttrTokenID == kSecAttrTokenIDSecureEnclave. If not, throw
    /// .staleWrappingKey — the caller must explicitly delete it via
    /// deleteWrappingKey({intent:'cleanup'}) (P2-#1) before we re-create. We do
    /// NOT silently delete-and-recreate, matching P2-#1's discipline of no
    /// accidental key destruction.
    ///
    /// NOT DEVICE-VERIFIED (this change made on Windows; no iOS build/test rig
    /// available). Runbook item: exercise on a physical iPhone before flipping
    /// M2C_ENABLED / M2C_HARDWARE_WRAP_ENABLED to true.
    func createWrappingKey() throws {
        if let existing = loadPrivateKeyAttributes() {
            // Reuse only if the pre-existing key is verifiably Enclave-backed.
            // kSecAttrTokenID is the string constant kSecAttrTokenIDSecureEnclave
            // when — and only when — the private key material lives in the SE.
            let tokenID = existing[kSecAttrTokenID as String] as? String
            let expected = kSecAttrTokenIDSecureEnclave as String
            if tokenID == expected {
                return
            }
            throw EnclaveError.staleWrappingKey
        }
        guard SecureEnclave.isAvailable else { throw EnclaveError.secureEnclaveUnavailable }

        var acError: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,   // §7 decision #1
            [.privateKeyUsage, .biometryCurrentSet],           // §7 decision #2
            &acError
        ) else {
            throw EnclaveError.keyGenerationFailed(cfMessage(acError))
        }

        let attributes: [String: Any] = [
            kSecAttrKeyType as String:       kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecAttrTokenID as String:       kSecAttrTokenIDSecureEnclave,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String:    true,
                kSecAttrApplicationTag as String: tag,
                kSecAttrAccessControl as String:  access,
            ],
        ]

        var genError: Unmanaged<CFError>?
        guard SecKeyCreateRandomKey(attributes as CFDictionary, &genError) != nil else {
            throw EnclaveError.keyGenerationFailed(cfMessage(genError))
        }
    }

    func deleteWrappingKey() throws {
        let query: [String: Any] = [
            kSecClass as String:              kSecClassKey,
            kSecAttrApplicationTag as String: tag,
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw EnclaveError.keyGenerationFailed("SecItemDelete OSStatus \(status)")
        }
    }

    // MARK: - wrap / unwrap

    /// Public-key encrypt. No biometric prompt.
    func wrap(blobB64: String) throws -> String {
        guard let priv = loadPrivateKey() else { throw EnclaveError.keyNotFound }
        guard let pub = SecKeyCopyPublicKey(priv) else { throw EnclaveError.publicKeyUnavailable }
        guard SecKeyIsAlgorithmSupported(pub, .encrypt, algorithm) else {
            throw EnclaveError.algorithmUnsupported
        }
        guard let plain = Data(base64Encoded: blobB64) else { throw EnclaveError.base64DecodeFailed }

        var error: Unmanaged<CFError>?
        guard let cipher = SecKeyCreateEncryptedData(pub, algorithm, plain as CFData, &error) as Data? else {
            throw EnclaveError.wrapFailed(cfMessage(error))
        }
        return cipher.base64EncodedString()
    }

    /// Private-key decrypt. The Enclave key's ACL makes the OS present a fresh
    /// biometric prompt; `reason` is shown in that sheet. Throws a typed
    /// EnclaveError on cancel / lockout / not-enrolled.
    func unwrap(ciphertextB64: String, reason: String) throws -> String {
        guard let cipher = Data(base64Encoded: ciphertextB64) else {
            throw EnclaveError.base64DecodeFailed
        }
        let context = LAContext()
        context.localizedReason = reason
        guard let priv = loadPrivateKey(context: context) else { throw EnclaveError.keyNotFound }
        guard SecKeyIsAlgorithmSupported(priv, .decrypt, algorithm) else {
            throw EnclaveError.algorithmUnsupported
        }

        var error: Unmanaged<CFError>?
        guard let plain = SecKeyCreateDecryptedData(priv, algorithm, cipher as CFData, &error) as Data? else {
            throw mapDecryptError(error)
        }
        return plain.base64EncodedString()
    }

    // MARK: - Helpers

    /// Codex ad-hoc review 2026-07-17 P2-#2: attribute-returning peer of
    /// loadPrivateKey. Used by createWrappingKey() to verify a pre-existing
    /// keychain item under our application tag is Secure-Enclave-backed
    /// (kSecAttrTokenID == kSecAttrTokenIDSecureEnclave) before short-circuiting
    /// the create path. Does NOT return the SecKey handle — pure metadata read,
    /// no biometric prompt, no LAContext.
    ///
    /// NOT DEVICE-VERIFIED (Windows dev box).
    private func loadPrivateKeyAttributes() -> [String: Any]? {
        let query: [String: Any] = [
            kSecClass as String:              kSecClassKey,
            kSecAttrApplicationTag as String: tag,
            kSecAttrKeyType as String:        kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnAttributes as String:   true,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let dict = item as? [String: Any] else { return nil }
        return dict
    }

    private func loadPrivateKey(context: LAContext? = nil) -> SecKey? {
        var query: [String: Any] = [
            kSecClass as String:            kSecClassKey,
            kSecAttrApplicationTag as String: tag,
            kSecAttrKeyType as String:      kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnRef as String:        true,
        ]
        if let context = context {
            query[kSecUseAuthenticationContext as String] = context
        }
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let object = item else { return nil }
        // Force-cast is safe: kSecReturnRef with kSecClassKey yields a SecKey.
        return (object as! SecKey)
    }

    private func cfMessage(_ error: Unmanaged<CFError>?) -> String {
        guard let error = error else { return "unknown" }
        let cf = error.takeRetainedValue()
        return (CFErrorCopyDescription(cf) as String?) ?? "unknown"
    }

    private func mapDecryptError(_ error: Unmanaged<CFError>?) -> EnclaveError {
        guard let error = error else { return .unwrapFailed("unknown") }
        let nsError = error.takeRetainedValue() as Error as NSError
        if let code = LAError.Code(rawValue: nsError.code) {
            switch code {
            case .userCancel:          return .userCancel
            case .userFallback:        return .userFallback
            case .biometryNotEnrolled: return .biometryNotEnrolled
            case .biometryLockout:     return .biometryLockout
            case .authenticationFailed: return .authFailed(nsError.code)
            default: break
            }
        }
        return .unwrapFailed(nsError.localizedDescription)
    }
}
