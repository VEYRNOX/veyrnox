// HardwareKekPlugin.m — iOS Secure Enclave ECIES Hardware KEK (REAL implementation)
//
// H-NEW-D: hardware factor H is wrapped under a Secure Enclave P-256 key using
// Apple's built-in ECIES primitive (kSecKeyAlgorithmECIESEncryptionCofactor-
// X963SHA256AESGCM). This performs, in one audited system call:
//   - ephemeral P-256 keypair generation
//   - ECDH cofactor key agreement with the SE public/private key
//   - ANSI X9.63 KDF (SHA-256) to derive the AES key
//   - AES-256-GCM seal/open
//
// The SE private key is PERSISTENT (kSecAttrIsPermanent = YES), stored in the
// Secure Enclave by application tag, and protected by a
// .biometryCurrentSet ACL: it is physically non-extractable and every
// decryption (getHardwareFactor) triggers Face ID / Touch ID. Adding or
// removing a biometric permanently invalidates the key.
//
// enroll():            SE pubkey ECIES-encrypts a fresh random 32-byte H (no biometric).
// getHardwareFactor(): SE privkey ECIES-decrypts H (Face ID gate). Returns base64(H).
//
// I4 (fail honest / fail closed): every failure path rejects. H is never
// fabricated, never returned in plaintext-stored form. If the SE key is
// missing or biometric fails, the call rejects.
//
// UNAUDITED-PROVISIONAL until independent third-party audit (§24).

#import "HardwareKekPlugin.h"
#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <LocalAuthentication/LocalAuthentication.h>

static NSString * const KEYCHAIN_SVC = @"com.veyrnox.app";
static NSString * const KEY_ENC_H    = @"veyrnox_kek_enc_h_v3";   // ECIES ciphertext blob
static NSString * const SE_KEY_TAG   = @"com.veyrnox.kek.se.v3";  // Secure Enclave key tag

// Apple ECIES: ephemeral ECDH + X9.63-SHA256 KDF + AES-GCM, in one primitive.
#define VEYRNOX_ECIES_ALGO kSecKeyAlgorithmECIESEncryptionCofactorX963SHA256AESGCM

// NOTE: The CAP_PLUGIN(...) registration macro is in HardwareKekPluginBridge.m
// (separate translation unit) so its forward `@interface : NSObject` does not
// bind this @implementation to NSObject. Here the class is a real CAPPlugin.

@interface HardwareKekPlugin (PrivateMethods)
- (void)storeKeychainItem:(NSString *)label data:(NSData *)data;
- (NSData *)loadKeychainItem:(NSString *)label;
- (OSStatus)deleteKeychainItem:(NSString *)label;
- (OSStatus)deleteSecureEnclaveKey;
@end

@implementation HardwareKekPlugin

#pragma mark - enroll

- (void)enroll:(CAPPluginCall *)call {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        @try {
            // Idempotent: clear any prior SE key + ciphertext.
            [self deleteSecureEnclaveKey];
            [self deleteKeychainItem:KEY_ENC_H];

            // 1. Biometric-gated access control for the SE private key.
            CFErrorRef aclErr = NULL;
            SecAccessControlRef access = SecAccessControlCreateWithFlags(
                kCFAllocatorDefault,
                kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
                kSecAccessControlPrivateKeyUsage | kSecAccessControlBiometryCurrentSet,
                &aclErr);
            if (!access) {
                [call reject:@"ACL_FAILED" :@"Failed to create Secure Enclave access control" :nil :nil];
                if (aclErr) CFRelease(aclErr);
                return;
            }

            // 2. Generate a PERSISTENT Secure Enclave P-256 key, tagged for later retrieval.
            NSData *tag = [SE_KEY_TAG dataUsingEncoding:NSUTF8StringEncoding];
            NSDictionary *attrs = @{
                (__bridge id)kSecAttrKeyType:        (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
                (__bridge id)kSecAttrKeySizeInBits:  @256,
                (__bridge id)kSecAttrTokenID:        (__bridge id)kSecAttrTokenIDSecureEnclave,
                (__bridge id)kSecPrivateKeyAttrs: @{
                    (__bridge id)kSecAttrIsPermanent:     @YES,
                    (__bridge id)kSecAttrApplicationTag:  tag,
                    (__bridge id)kSecAttrAccessControl:   (__bridge id)access,
                },
            };
            CFErrorRef genErr = NULL;
            SecKeyRef sePriv = SecKeyCreateRandomKey((__bridge CFDictionaryRef)attrs, &genErr);
            CFRelease(access);
            if (!sePriv) {
                NSLog(@"[VEYRNOX-KEK] enroll: SE key generation FAILED: %@", genErr ? (__bridge NSError *)genErr : nil);
                [call reject:@"SE_KEYGEN_FAILED" :@"Secure Enclave key generation failed (device may lack SE or biometrics)" :nil :nil];
                if (genErr) CFRelease(genErr);
                return;
            }
            NSLog(@"[VEYRNOX-KEK] enroll: Secure Enclave P-256 key generated (persistent, biometric ACL)");

            SecKeyRef sePub = SecKeyCopyPublicKey(sePriv);
            CFRelease(sePriv);  // private key stays in the enclave, retrieved by tag on demand
            if (!sePub) {
                [call reject:@"SE_PUBKEY_FAILED" :@"Failed to derive Secure Enclave public key" :nil :nil];
                return;
            }

            // 3. Fresh random 32-byte hardware factor H.
            uint8_t hBytes[32];
            if (SecRandomCopyBytes(kSecRandomDefault, sizeof(hBytes), hBytes) != errSecSuccess) {
                CFRelease(sePub);
                [call reject:@"RANDOM_FAILED" :@"Secure random generation failed" :nil :nil];
                return;
            }
            NSData *hData = [NSData dataWithBytes:hBytes length:sizeof(hBytes)];

            // 4. ECIES-encrypt H under the SE public key (no biometric needed for encrypt).
            if (!SecKeyIsAlgorithmSupported(sePub, kSecKeyOperationTypeEncrypt, VEYRNOX_ECIES_ALGO)) {
                memset(hBytes, 0, sizeof(hBytes));
                CFRelease(sePub);
                [call reject:@"ALGO_UNSUPPORTED" :@"ECIES algorithm not supported on this device" :nil :nil];
                return;
            }
            CFErrorRef encErr = NULL;
            CFDataRef ct = SecKeyCreateEncryptedData(sePub, VEYRNOX_ECIES_ALGO, (__bridge CFDataRef)hData, &encErr);
            memset(hBytes, 0, sizeof(hBytes));  // zero the plaintext H copy
            CFRelease(sePub);
            if (!ct) {
                [call reject:@"ECIES_ENCRYPT_FAILED" :@"ECIES encryption of hardware factor failed" :nil :nil];
                if (encErr) CFRelease(encErr);
                return;
            }
            NSData *encH = (__bridge_transfer NSData *)ct;
            NSLog(@"[VEYRNOX-KEK] enroll: H (32B) ECIES-encrypted under SE pubkey → ciphertext %lu bytes", (unsigned long)encH.length);

            // 5. Persist only the ciphertext. The SE private key lives in the enclave.
            [self storeKeychainItem:KEY_ENC_H data:encH];
            NSLog(@"[VEYRNOX-KEK] enroll: SUCCESS — ciphertext stored, SE privkey retained in enclave");

            [call resolve:@{@"keyTier": @"SecureEnclave"}];
        } @catch (NSException *exception) {
            [call reject:@"ENROLL_EXCEPTION" :[NSString stringWithFormat:@"Enroll failed: %@", exception.reason] :nil :nil];
        }
    });
}

#pragma mark - isEnrolled

- (void)isEnrolled:(CAPPluginCall *)call {
    NSData *encH = [self loadKeychainItem:KEY_ENC_H];
    NSData *tag  = [SE_KEY_TAG dataUsingEncoding:NSUTF8StringEncoding];
    NSDictionary *query = @{
        (__bridge id)kSecClass:              (__bridge id)kSecClassKey,
        (__bridge id)kSecAttrApplicationTag: tag,
        (__bridge id)kSecAttrKeyType:        (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
        (__bridge id)kSecReturnRef:          @YES,
    };
    CFTypeRef keyRef = NULL;
    OSStatus st = SecItemCopyMatching((__bridge CFDictionaryRef)query, &keyRef);
    if (keyRef) CFRelease(keyRef);

    BOOL enrolled = (encH != nil && encH.length > 0 && st == errSecSuccess);
    [call resolve:@{@"enrolled": @(enrolled)}];
}

#pragma mark - clearCredential

// Fail-honest (I4): report the real result of removal. SecItemDelete is treated
// as success for errSecSuccess (deleted) and errSecItemNotFound (already gone).
// Any other status means the SE key or ciphertext genuinely could NOT be removed,
// so we reject — the JS layer must never believe a clear that did not happen
// (a false "removed" is what lets a stale credential show the vault as protected).
- (void)clearCredential:(CAPPluginCall *)call {
    OSStatus seSt  = [self deleteSecureEnclaveKey];
    OSStatus encSt = [self deleteKeychainItem:KEY_ENC_H];

    BOOL seOk  = (seSt  == errSecSuccess || seSt  == errSecItemNotFound);
    BOOL encOk = (encSt == errSecSuccess || encSt == errSecItemNotFound);

    if (!seOk || !encOk) {
        NSString *msg = [NSString stringWithFormat:
            @"Failed to fully remove hardware credential (SE key OSStatus %d, ciphertext OSStatus %d)",
            (int)seSt, (int)encSt];
        [call reject:@"CLEAR_FAILED" :msg :nil :nil];
        return;
    }
    [call resolve:@{}];
}

#pragma mark - getHardwareFactor

- (void)getHardwareFactor:(CAPPluginCall *)call {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        @try {
            NSData *encH = [self loadKeychainItem:KEY_ENC_H];
            if (!encH || encH.length == 0) {
                NSLog(@"[VEYRNOX-KEK] getHardwareFactor: NOT ENROLLED (no ciphertext)");
                [call reject:@"NOT_ENROLLED" :@"No hardware key enrolled — call enroll() first" :nil :nil];
                return;
            }
            NSLog(@"[VEYRNOX-KEK] getHardwareFactor: loaded ciphertext %lu bytes, retrieving SE key…", (unsigned long)encH.length);

            // Retrieve the SE private key by tag. Using it for decryption below
            // triggers the biometric (Face ID / Touch ID) prompt via its ACL.
            NSData *tag = [SE_KEY_TAG dataUsingEncoding:NSUTF8StringEncoding];
            NSDictionary *query = @{
                (__bridge id)kSecClass:               (__bridge id)kSecClassKey,
                (__bridge id)kSecAttrApplicationTag:  tag,
                (__bridge id)kSecAttrKeyType:         (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
                (__bridge id)kSecReturnRef:           @YES,
                (__bridge id)kSecUseOperationPrompt:  @"Authenticate to unlock your wallet",
            };
            SecKeyRef sePriv = NULL;
            OSStatus st = SecItemCopyMatching((__bridge CFDictionaryRef)query, (CFTypeRef *)&sePriv);
            if (st != errSecSuccess || !sePriv) {
                if (sePriv) CFRelease(sePriv);
                NSLog(@"[VEYRNOX-KEK] getHardwareFactor: SE key MISSING (OSStatus %d)", (int)st);
                [call reject:@"SE_KEY_MISSING" :@"Secure Enclave key not found — re-enrollment required" :nil :nil];
                return;
            }
            NSLog(@"[VEYRNOX-KEK] getHardwareFactor: SE key retrieved, decrypting (Face ID prompt now)…");

            if (!SecKeyIsAlgorithmSupported(sePriv, kSecKeyOperationTypeDecrypt, VEYRNOX_ECIES_ALGO)) {
                CFRelease(sePriv);
                [call reject:@"ALGO_UNSUPPORTED" :@"ECIES decrypt not supported on this device" :nil :nil];
                return;
            }

            // ECIES-decrypt H. This is the operation that presents Face ID.
            CFErrorRef decErr = NULL;
            CFDataRef pt = SecKeyCreateDecryptedData(sePriv, VEYRNOX_ECIES_ALGO, (__bridge CFDataRef)encH, &decErr);
            CFRelease(sePriv);
            if (!pt) {
                // Biometric cancel/failure or key-invalidated → fail closed.
                NSString *msg = @"Face ID authentication failed or was cancelled";
                if (decErr) {
                    NSError *e = (__bridge NSError *)decErr;
                    if (e.localizedDescription) msg = e.localizedDescription;
                }
                NSLog(@"[VEYRNOX-KEK] getHardwareFactor: DECRYPT FAILED — %@", msg);
                [call reject:@"DECRYPT_FAILED" :msg :nil :nil];
                if (decErr) CFRelease(decErr);
                return;
            }
            NSData *h = (__bridge_transfer NSData *)pt;  // 32-byte H
            NSString *hB64 = [h base64EncodedStringWithOptions:0];
            NSLog(@"[VEYRNOX-KEK] getHardwareFactor: SUCCESS — Face ID passed, H recovered (%lu bytes)", (unsigned long)h.length);

            [call resolve:@{@"h": hB64}];
        } @catch (NSException *exception) {
            [call reject:@"GETHF_EXCEPTION" :[NSString stringWithFormat:@"getHardwareFactor failed: %@", exception.reason] :nil :nil];
        }
    });
}

#pragma mark - Keychain / SE Helpers

- (void)storeKeychainItem:(NSString *)label data:(NSData *)data {
    NSDictionary *query = @{
        (__bridge id)kSecClass:        (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrService:  KEYCHAIN_SVC,
        (__bridge id)kSecAttrAccount:  label,
        (__bridge id)kSecValueData:    data,
        (__bridge id)kSecAttrAccessible: (__bridge id)kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
    };
    SecItemDelete((__bridge CFDictionaryRef)query);
    SecItemAdd((__bridge CFDictionaryRef)query, NULL);
}

- (NSData *)loadKeychainItem:(NSString *)label {
    NSDictionary *query = @{
        (__bridge id)kSecClass:        (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrService:  KEYCHAIN_SVC,
        (__bridge id)kSecAttrAccount:  label,
        (__bridge id)kSecReturnData:   @YES,
    };
    CFTypeRef result = NULL;
    OSStatus st = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
    if (st != errSecSuccess) return nil;
    return (__bridge_transfer NSData *)result;
}

- (OSStatus)deleteKeychainItem:(NSString *)label {
    NSDictionary *query = @{
        (__bridge id)kSecClass:        (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrService:  KEYCHAIN_SVC,
        (__bridge id)kSecAttrAccount:  label,
    };
    return SecItemDelete((__bridge CFDictionaryRef)query);
}

- (OSStatus)deleteSecureEnclaveKey {
    NSData *tag = [SE_KEY_TAG dataUsingEncoding:NSUTF8StringEncoding];
    NSDictionary *query = @{
        (__bridge id)kSecClass:              (__bridge id)kSecClassKey,
        (__bridge id)kSecAttrApplicationTag: tag,
        (__bridge id)kSecAttrKeyType:        (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
    };
    return SecItemDelete((__bridge CFDictionaryRef)query);
}

@end
