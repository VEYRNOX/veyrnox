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

    /// Idempotent: returns immediately if the wrapping key already exists.
    /// Otherwise generates a non-exportable Enclave P-256 key whose private-key
    /// use requires a current-set biometric.
    func createWrappingKey() throws {
        if loadPrivateKey() != nil { return }
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
