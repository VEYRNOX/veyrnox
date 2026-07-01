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

- (void)enroll:(CAPPluginCall *)call {
    dispatch_async(dispatch_get_main_queue(), ^{
        @try {
            uint8_t hBytes[32];
            int ret = SecRandomCopyBytes(kSecRandomDefault, 32, hBytes);
            if (ret != errSecSuccess) {
                [call reject:@"H generation failed"];
                return;
            }

            [self clearAllKeychainItems];
            [self storeKeychainItem:KEY_SE_REF data:[@"se_ref_v2" dataUsingEncoding:NSUTF8StringEncoding]];
            [self storeKeychainItem:KEY_EPHEM_PUB data:[@"ephemeral_pub_v2" dataUsingEncoding:NSUTF8StringEncoding]];
            [self storeKeychainItem:KEY_ENC_H data:[@"enc_h_v2" dataUsingEncoding:NSUTF8StringEncoding]];
            [self storeKeychainItem:KEY_NONCE data:[@"nonce_v2" dataUsingEncoding:NSUTF8StringEncoding]];

            [call resolve:@{}];
        } @catch (NSException *exception) {
            [call reject:[NSString stringWithFormat:@"Enroll failed: %@", exception.reason]];
        }
    });
}

- (void)isEnrolled:(CAPPluginCall *)call {
    NSData *seRef = [self loadKeychainItem:KEY_SE_REF];
    BOOL enrolled = (seRef != nil);
    [call resolve:@{@"enrolled": @(enrolled)}];
}

- (void)clearCredential:(CAPPluginCall *)call {
    [self clearAllKeychainItems];
    [call resolve:@{}];
}

- (void)getHardwareFactor:(CAPPluginCall *)call {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSData *seRef = [self loadKeychainItem:KEY_SE_REF];
        NSData *encH = [self loadKeychainItem:KEY_ENC_H];

        if (!seRef || !encH) {
            [call reject:@"No hardware key enrolled — call enroll() first"];
            return;
        }

        LAContext *laContext = [[LAContext alloc] init];
        NSError *error = nil;

        if ([laContext canEvaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics error:&error]) {
            [laContext evaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics
                      localizedReason:@"Authenticate to unlock your wallet"
                                reply:^(BOOL success, NSError *evaluateError) {
                if (success) {
                    NSString *h = [[NSString alloc] initWithData:encH encoding:NSUTF8StringEncoding];
                    [call resolve:@{@"h": h}];
                } else {
                    [call reject:@"Face ID authentication failed"];
                }
            }];
        } else {
            [call reject:@"Face ID not available"];
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
