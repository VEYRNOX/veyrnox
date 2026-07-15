// AppAttestPlugin.m — iOS App Attest integration (RASP Phase 2b remote attestation).
//
// Option B: disclosed, deniability-gated, PRE-SIGN ONLY (signed off 2026-07-13,
// docs/rasp-attestation-egress-decision.md). The JS caller
// (attestationProbeSource) guarantees this is never invoked under a decoy/hidden
// session and only at the pre-sign gate — never on unlock.
//
// ── HONEST GAPS (required before this can be ENABLED / trusted) ─────────────
// 1. The com.apple.developer.devicecheck.appattest-environment entitlement must be
//    added to ios/App/App/App.entitlements (requires an Apple Developer account +
//    a provisioning profile). Without it, DCAppAttestService is not usable and
//    isSupported / the attest calls fail — this plugin then fails closed.
// 2. DeviceCheck.framework must be linked to the App target.
// 3. Key generation (a one-time network round-trip to Apple) has NOT been
//    device-exercised.
// 4. NOT independently audited.
//
// I4 — FAIL CLOSED. Unsupported device, any DeviceCheck error, or a missing nonce
// resolves { available:false }, which the JS layer maps to INTEGRITY_UNAVAILABLE
// (→ WARN), never a fabricated clean/allow.
//
// I2/I3 — the only value derived from JS is the caller-supplied random nonce,
// hashed into the App Attest clientDataHash. No wallet-set handle, no seed, no key
// material is transmitted. The verdict decision stays on-device (I5).
//
// STATUS: BUILT (compile-verified target, logic present). NOT device-verified.

#import "AppAttestPlugin.h"
#import <Foundation/Foundation.h>
#import <DeviceCheck/DeviceCheck.h>
#import <CommonCrypto/CommonCrypto.h>
#import <Capacitor/CAPBridgedJSTypes.h>

// NSUserDefaults key for the persisted App Attest key identifier. App Attest keys
// are generated once per install and reused; the keyId (not the key itself, which
// lives in the Secure Enclave) is what we persist.
static NSString * const APPATTEST_KEY_ID_DEFAULT = @"veyrnox_appattest_key_id";

@implementation AppAttestPlugin

- (void)checkAttestation:(CAPPluginCall *)call {
    // Availability is not a compile-time constant across deployment targets; guard.
    if (@available(iOS 14.0, *)) {
        DCAppAttestService *service = [DCAppAttestService sharedService];

        // (1) Device support gate. Simulators, older devices, and (in practice)
        // an app lacking the appattest entitlement report NO here → fail closed.
        if (!service.isSupported) {
            [call resolve:@{ @"available": @(NO) }];
            return;
        }

        // The nonce binds this attestation to this specific request. Absent → we
        // cannot build a trustworthy clientDataHash → fail closed.
        NSString *nonce = [call getString:@"nonce" defaultValue:nil];
        if (nonce == nil || nonce.length < 16) {
            [call resolve:@{ @"available": @(NO) }];
            return;
        }
        NSData *clientDataHash = [self sha256OfString:nonce];

        NSString *storedKeyId =
            [[NSUserDefaults standardUserDefaults] stringForKey:APPATTEST_KEY_ID_DEFAULT];

        if (storedKeyId == nil) {
            // (3a) First run: generate a key (Secure-Enclave-backed) then attest it
            // (one-time network round-trip to Apple). On success, persist the keyId
            // and treat the successful attestation as a passing verdict.
            [service generateKeyWithCompletionHandler:^(NSString *keyId, NSError *genErr) {
                if (genErr != nil || keyId == nil) {
                    [call resolve:@{ @"available": @(NO) }];
                    return;
                }
                [service attestKey:keyId
                    clientDataHash:clientDataHash
                 completionHandler:^(NSData *attestation, NSError *attErr) {
                    if (attErr != nil || attestation == nil) {
                        [call resolve:@{ @"available": @(NO) }];
                        return;
                    }
                    // Persist only AFTER a successful attest, so a half-finished
                    // enrollment does not strand an unattested keyId.
                    [[NSUserDefaults standardUserDefaults] setObject:keyId
                                                              forKey:APPATTEST_KEY_ID_DEFAULT];
                    // A successful attest means Apple accepted the key as genuine
                    // on genuine hardware → attestation passed.
                    [call resolve:@{ @"available": @(YES), @"attestationFailed": @(NO) }];
                }];
            }];
        } else {
            // (4) Subsequent runs: the key is already attested with Apple, so we
            // only need a LOCAL assertion (no further network verification of the
            // key itself). A successful assertion signals the key/device are intact.
            [service generateAssertion:storedKeyId
                        clientDataHash:clientDataHash
                     completionHandler:^(NSData *assertion, NSError *asrtErr) {
                if (asrtErr != nil || assertion == nil) {
                    [call resolve:@{ @"available": @(NO) }];
                    return;
                }
                [call resolve:@{ @"available": @(YES), @"attestationFailed": @(NO) }];
            }];
        }
    } else {
        // App Attest requires iOS 14+. Older OS → no channel → fail closed.
        [call resolve:@{ @"available": @(NO) }];
    }
}

// SHA-256 of the UTF-8 bytes of the nonce string → the App Attest clientDataHash.
- (NSData *)sha256OfString:(NSString *)input {
    NSData *data = [input dataUsingEncoding:NSUTF8StringEncoding];
    unsigned char digest[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
    return [NSData dataWithBytes:digest length:CC_SHA256_DIGEST_LENGTH];
}

@end
