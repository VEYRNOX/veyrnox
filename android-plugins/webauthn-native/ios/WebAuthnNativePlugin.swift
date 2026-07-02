import Foundation
import Capacitor
import LocalAuthentication
import Security
import CryptoKit

@objc(WebAuthnNativePlugin)
public class WebAuthnNativePlugin: CAPPlugin {
    private let keychain = SecureKeychain()

    @objc func registerCredential(_ call: CAPPluginCall) {
        let userId = call.getString("userId") ?? "default"

        // Generate cryptographic key in Secure Enclave
        do {
            try keychain.generateSecureEnclaveKey(forUser: userId)

            // Prompt for biometric enrollment
            let context = LAContext()
            context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: "Enroll biometric for wallet unlock") { success, error in
                DispatchQueue.main.async {
                    if success {
                        let credentialId = self.generateCredentialId(userId: userId)
                        let pubKey = try? self.keychain.getPublicKey(forUser: userId)

                        call.resolve([
                            "credentialId": credentialId,
                            "publicKey": pubKey?.base64EncodedString() ?? "",
                            "attestationObject": "attestation_placeholder"
                        ])
                    } else {
                        call.reject("Biometric enrollment cancelled", nil, error)
                    }
                }
            }
        } catch {
            call.reject("Registration failed", nil, error)
        }
    }

    @objc func authenticateCredential(_ call: CAPPluginCall) {
        let credentialId = call.getString("credentialId") ?? ""
        let challenge = call.getString("challenge") ?? ""

        let context = LAContext()
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: "Unlock your wallet") { success, error in
            DispatchQueue.main.async {
                if success {
                    do {
                        let signature = try self.keychain.sign(data: challenge.data(using: .utf8) ?? Data(), forUser: "default")

                        call.resolve([
                            "clientDataJSON": challenge.data(using: .utf8)?.base64EncodedString() ?? "",
                            "authenticatorData": "authenticator_data",
                            "signature": signature.base64EncodedString()
                        ])
                    } catch {
                        call.reject("Authentication failed", nil, error)
                    }
                } else {
                    call.reject("Biometric authentication cancelled", nil, error)
                }
            }
        }
    }

    private func generateCredentialId(userId: String) -> String {
        let credId = "credential_\(userId)_\(Date().timeIntervalSince1970)"
        return credId.data(using: .utf8)?.base64EncodedString() ?? ""
    }
}

/**
 * Secure Keychain wrapper for Secure Enclave operations
 */
class SecureKeychain {
    private let keyTag = "com.veyrnox.webauthn.key"

    /**
     * Generate a key in Secure Enclave with biometric protection
     */
    func generateSecureEnclaveKey(forUser userId: String) throws {
        let access = try! SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
            .biometryCurrentSet,
            nil
        ) as SecAccessControl

        let keyAttributes: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: "\(keyTag)_\(userId)".data(using: .utf8) ?? Data(),
                kSecAttrAccessControl as String: access
            ]
        ]

        var error: Unmanaged<CFError>?
        guard let _ = SecKeyCreateRandomKey(keyAttributes as CFDictionary, &error) else {
            throw error?.takeRetainedValue() as Error? ?? NSError(domain: "SecureKeychain", code: -1)
        }
    }

    /**
     * Get public key from Secure Enclave
     */
    func getPublicKey(forUser userId: String) throws -> Data {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrApplicationTag as String: "\(keyTag)_\(userId)".data(using: .utf8) ?? Data(),
            kSecReturnRef as String: true
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        guard status == errSecSuccess, let privateKey = item as? SecKey else {
            throw NSError(domain: "SecureKeychain", code: Int(status))
        }

        guard let publicKey = SecKeyCopyPublicKey(privateKey) else {
            throw NSError(domain: "SecureKeychain", code: -1)
        }

        guard let pubKeyData = SecKeyCopyExternalRepresentation(publicKey, nil) as Data? else {
            throw NSError(domain: "SecureKeychain", code: -1)
        }

        return pubKeyData
    }

    /**
     * Sign data with Secure Enclave key
     */
    func sign(data: Data, forUser userId: String) throws -> Data {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrApplicationTag as String: "\(keyTag)_\(userId)".data(using: .utf8) ?? Data(),
            kSecReturnRef as String: true
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        guard status == errSecSuccess, let privateKey = item as? SecKey else {
            throw NSError(domain: "SecureKeychain", code: Int(status))
        }

        var signError: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(
            privateKey,
            .ecdsaSignatureMessageX962SHA256,
            data as CFData,
            &signError
        ) as Data? else {
            throw signError?.takeRetainedValue() as Error? ?? NSError(domain: "SecureKeychain", code: -1)
        }

        return signature
    }
}
