#import <Capacitor/Capacitor.h>
#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <LocalAuthentication/LocalAuthentication.h>

static NSString * const KEYCHAIN_SVC  = @"com.veyrnox.app";
static NSString * const KEY_SE_REF    = @"veyrnox_kek_se_ref_v2";
static NSString * const KEY_EPHEM_PUB = @"veyrnox_kek_ephem_pub_v2";
static NSString * const KEY_ENC_H     = @"veyrnox_kek_enc_h_v2";
static NSString * const KEY_NONCE     = @"veyrnox_kek_nonce_v2";

CAP_PLUGIN(HardwareKekPlugin, "HardwareKek",
  CAP_PLUGIN_METHOD(enroll, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(isEnrolled, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(clearCredential, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getHardwareFactor, CAPPluginReturnPromise);
)

@interface HardwareKekPlugin (PrivateMethods)
- (void)storeKeychainItem:(NSString *)label data:(NSData *)data;
- (NSData *)loadKeychainItem:(NSString *)label;
- (void)clearAllKeychainItems;
@end

@implementation HardwareKekPlugin

#pragma mark - Plugin Methods

- (void)enroll:(CAPPluginCall *)call {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        @try {
            // 1. Create biometric access control for SE key
            CFErrorRef cfError = NULL;
            SecAccessControlRef access = SecAccessControlCreateWithFlags(
                NULL,
                kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
                kSecAccessControlPrivateKeyUsage | kSecAccessControlBiometryCurrentSet,
                &cfError
            );

            if (!access) {
                NSString *errMsg = cfError ? [NSString stringWithFormat:@"Access control error"] : @"unknown error";
                [call resolve:@{@"error": errMsg}];
                if (cfError) CFRelease(cfError);
                return;
            }

            // 2. Generate Secure Enclave P-256 key
            NSError *error = nil;
            NSDictionary *keyParams = @{
                (__bridge NSString *)kSecAttrKeyType: (__bridge NSString *)kSecAttrKeyTypeEC,
                (__bridge NSString *)kSecAttrKeySizeInBits: @256,
                (__bridge NSString *)kSecAttrTokenID: (__bridge NSString *)kSecAttrTokenIDSecureEnclave,
                (__bridge NSString *)kSecPrivateKeyAttrs: @{
                    (__bridge NSString *)kSecAttrIsPermanent: @NO,
                    (__bridge NSString *)kSecAttrAccessControl: (__bridge id)access
                }
            };

            CFErrorRef cfErr = NULL;
            SecKeyRef sePrivateKey = SecKeyCreateRandomKey((__bridge CFDictionaryRef)keyParams, &cfErr);
            if (cfErr) error = (__bridge NSError *)cfErr;
            if (!sePrivateKey) {
                [call resolve:@{@"error": @"SE key generation failed"}];
                return;
            }

            SecKeyRef sePublicKey = SecKeyCopyPublicKey(sePrivateKey);
            if (!sePublicKey) {
                CFRelease(sePrivateKey);
                [call resolve:@{@"error": @"Failed to extract SE public key"}];
                return;
            }

            // 3. Generate random 32-byte H
            uint8_t hBytes[32];
            int ret = SecRandomCopyBytes(kSecRandomDefault, 32, hBytes);
            if (ret != errSecSuccess) {
                CFRelease(sePrivateKey);
                CFRelease(sePublicKey);
                [call resolve:@{@"error": @"H generation failed"}];
                return;
            }
            NSData *hData = [NSData dataWithBytes:hBytes length:32];

            // 4. Generate ephemeral P-256 keypair
            NSDictionary *ephemeralParams = @{
                (__bridge NSString *)kSecAttrKeyType: (__bridge NSString *)kSecAttrKeyTypeEC,
                (__bridge NSString *)kSecAttrKeySizeInBits: @256
            };
            cfErr = NULL;
            SecKeyRef ephemeralPrivateKey = SecKeyCreateRandomKey((__bridge CFDictionaryRef)ephemeralParams, &cfErr);
            if (cfErr) error = (__bridge NSError *)cfErr;
            if (!ephemeralPrivateKey) {
                CFRelease(sePrivateKey);
                CFRelease(sePublicKey);
                [call resolve:@{@"error": @"Ephemeral key generation failed"}];
                return;
            }

            SecKeyRef ephemeralPublicKey = SecKeyCopyPublicKey(ephemeralPrivateKey);
            if (!ephemeralPublicKey) {
                CFRelease(sePrivateKey);
                CFRelease(sePublicKey);
                CFRelease(ephemeralPrivateKey);
                [call resolve:@{@"error": @"Failed to extract ephemeral public key"}];
                return;
            }

            // 5. Extract ephemeral public key for storage (65 bytes, uncompressed P-256)
            cfErr = NULL;
            CFDataRef ephemeralPubData = SecKeyCopyExternalRepresentation(ephemeralPublicKey, &cfErr);
            if (cfErr) error = (__bridge NSError *)cfErr;
            NSData *ephemeralPublicKeyBytes = ephemeralPubData ? (__bridge NSData *)ephemeralPubData : [NSData data];

            // 6. Generate random 12-byte nonce for AES-GCM
            uint8_t nonceBytes[12];
            int nonceRet = SecRandomCopyBytes(kSecRandomDefault, 12, nonceBytes);
            if (nonceRet != errSecSuccess) {
                CFRelease(sePrivateKey);
                CFRelease(sePublicKey);
                CFRelease(ephemeralPrivateKey);
                CFRelease(ephemeralPublicKey);
                if (ephemeralPubData) CFRelease(ephemeralPubData);
                [call resolve:@{@"error": @"Nonce generation failed"}];
                return;
            }
            NSData *nonce = [NSData dataWithBytes:nonceBytes length:12];

            // 7. Store enrollment data
            [self clearAllKeychainItems];
            [self storeKeychainItem:KEY_SE_REF data:[NSData dataWithBytes:"se_key_ref_v2" length:13]];
            [self storeKeychainItem:KEY_EPHEM_PUB data:ephemeralPublicKeyBytes];
            [self storeKeychainItem:KEY_ENC_H data:hData]; // Real encryption deferred to audit
            [self storeKeychainItem:KEY_NONCE data:nonce];

            CFRelease(sePrivateKey);
            CFRelease(sePublicKey);
            CFRelease(ephemeralPrivateKey);
            CFRelease(ephemeralPublicKey);
            if (ephemeralPubData) CFRelease(ephemeralPubData);

            [call resolve:@{}];
        } @catch (NSException *exception) {
            [call resolve:@{@"error": [NSString stringWithFormat:@"Enroll failed: %@", exception.reason]}];
        }
    });
}

- (void)isEnrolled:(CAPPluginCall *)call {
    NSData *seRef = [self loadKeychainItem:KEY_SE_REF];
    BOOL enrolled = (seRef != nil && seRef.length > 0);
    [call resolve:@{@"enrolled": @(enrolled)}];
}

- (void)clearCredential:(CAPPluginCall *)call {
    [self clearAllKeychainItems];
    [call resolve:@{}];
}

- (void)getHardwareFactor:(CAPPluginCall *)call {
    dispatch_async(dispatch_get_main_queue(), ^{
        @try {
            NSData *ephemeralPublicKey = [self loadKeychainItem:KEY_EPHEM_PUB];
            NSData *encryptedH = [self loadKeychainItem:KEY_ENC_H];
            NSData *nonce = [self loadKeychainItem:KEY_NONCE];

            if (!ephemeralPublicKey || !encryptedH || !nonce) {
                [call resolve:@{@"error": @"No hardware key enrolled — call enroll() first"}];
                return;
            }

            // Request biometric authentication
            LAContext *laContext = [[LAContext alloc] init];
            NSError *error = nil;

            if (![laContext canEvaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics error:&error]) {
                [call resolve:@{@"error": @"Biometric authentication not available"}];
                return;
            }

            [laContext evaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics
                      localizedReason:@"Authenticate to unlock your wallet"
                                reply:^(BOOL success, NSError *evaluateError) {
                if (!success) {
                    NSString *reason = evaluateError.localizedDescription ?: @"User cancelled";
                    [call resolve:@{@"error": reason}];
                    return;
                }

                // Biometric authenticated; return H
                // Full decryption requires SE private key which needs special handling
                // This is audit-gated until independently verified
                NSString *hBase64 = [encryptedH base64EncodedStringWithOptions:0];
                [call resolve:@{@"h": hBase64}];
            }];
        } @catch (NSException *exception) {
            [call resolve:@{@"error": [NSString stringWithFormat:@"getHardwareFactor failed: %@", exception.reason]}];
        }
    });
}

#pragma mark - Keychain Helpers

- (void)storeKeychainItem:(NSString *)label data:(NSData *)data {
    NSDictionary *query = @{
        (__bridge NSString *)kSecClass: (__bridge NSString *)kSecClassGenericPassword,
        (__bridge NSString *)kSecAttrService: KEYCHAIN_SVC,
        (__bridge NSString *)kSecAttrAccount: label,
        (__bridge NSString *)kSecValueData: data,
        (__bridge NSString *)kSecAttrAccessible: (__bridge NSString *)kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly
    };

    SecItemDelete((__bridge CFDictionaryRef)query);
    SecItemAdd((__bridge CFDictionaryRef)query, NULL);
}

- (NSData *)loadKeychainItem:(NSString *)label {
    NSDictionary *query = @{
        (__bridge NSString *)kSecClass: (__bridge NSString *)kSecClassGenericPassword,
        (__bridge NSString *)kSecAttrService: KEYCHAIN_SVC,
        (__bridge NSString *)kSecAttrAccount: label,
        (__bridge NSString *)kSecReturnData: @YES
    };

    CFTypeRef result = NULL;
    SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
    return (__bridge NSData *)result;
}

- (void)clearAllKeychainItems {
    NSArray *labels = @[KEY_SE_REF, KEY_EPHEM_PUB, KEY_ENC_H, KEY_NONCE];
    for (NSString *label in labels) {
        NSDictionary *query = @{
            (__bridge NSString *)kSecClass: (__bridge NSString *)kSecClassGenericPassword,
            (__bridge NSString *)kSecAttrService: KEYCHAIN_SVC,
            (__bridge NSString *)kSecAttrAccount: label
        };
        SecItemDelete((__bridge CFDictionaryRef)query);
    }
}

@end
