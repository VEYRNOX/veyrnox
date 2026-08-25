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
#import "RaspIntegrityPlugin.h"
#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <LocalAuthentication/LocalAuthentication.h>
#import <os/log.h>
// sys/mman.h for mlock/munlock — pin key material pages in physical RAM so
// they cannot be swapped to disk during the narrow window between SE decryption
// and resetBytesInRange zeroing (item 11).
#import <sys/mman.h>

static NSString * const KEYCHAIN_SVC = @"com.veyrnox.app";
static NSString * const KEY_ENC_H    = @"veyrnox_kek_enc_h_v3";   // ECIES ciphertext blob
static NSString * const SE_KEY_TAG   = @"com.veyrnox.kek.se.v3";  // Secure Enclave key tag

// iOS-F9: shared unified-logging handle. All plugin traces go through this one
// os_log_t so they land under a single filterable subsystem/category
// (subsystem "com.veyrnox", category "HardwareKek") in the system log.
//
// Why os_log, not NSLog: on iOS 26+ NSLog output is NOT reliably streamable via
// `idevicesyslog` / `log collect` / Console.app device filtering, so the getHardwareFactor
// SE-unlock trace could not be captured off-device to tie a KEK-gated Sepolia send to the
// SE-unlock path (iOS-F9). os_log lands in the unified log and is collectable with e.g.:
//   log collect --device --last 5m   (then filter subsystem == com.veyrnox)
//   log stream --predicate 'subsystem == "com.veyrnox"' --info
//
// Level: OS_LOG_TYPE_INFO (os_log_info). INFO is captured by `log collect` and is the
// honest level for operational (non-error) traces. All dynamic string args use
// %{public}s so the fixed markers are readable, not <private>-redacted. NOTE: no secret
// material is ever logged — only fixed markers, byte lengths, and OSStatus codes. H's
// bytes are NEVER logged.
static os_log_t VeyrnoxKekLog(void) {
    static os_log_t log;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        log = os_log_create("com.veyrnox", "HardwareKek");
    });
    return log;
}

// #2079 — is this error the user DISMISSING the biometric sheet, as opposed to the
// sheet being presented and failing to match?
//
// The distinction is load-bearing downstream, not cosmetic: a cancel routes to
// KEK_ERR.USER_CANCELLED, which WalletEntry renders as "Unlock cancelled — try again
// when ready" (never "restore from your seed phrase"), and which stepUpFactorOutcome
// counts as a dismissal rather than a presented-and-failed factor.
//
// Deliberately NARROW. errSecAuthFailed (-25293) and LAErrorAuthenticationFailed are a
// failed MATCH — a wrong face is not a cancellation, and reporting it as one would tell
// the step-up layer no factor was ever presented. Both stay on the generic path.
// LAErrorUserFallback ("Use passcode") is likewise excluded here: it is a request for
// another factor, not an abort, and the caller's own fallback path handles it.
static BOOL VeyrnoxKekIsCancelError(NSError *e) {
    if (e == nil) return NO;
    if ([e.domain isEqualToString:NSOSStatusErrorDomain]) {
        return e.code == errSecUserCanceled;
    }
    if ([e.domain isEqualToString:LAErrorDomain]) {
        return e.code == LAErrorUserCancel
            || e.code == LAErrorSystemCancel
            || e.code == LAErrorAppCancel;
    }
    return NO;
}

// Apple ECIES: ephemeral ECDH + X9.63-SHA256 KDF + AES-GCM, in one primitive.
#define VEYRNOX_ECIES_ALGO kSecKeyAlgorithmECIESEncryptionCofactorX963SHA256AESGCM

// NOTE: The CAP_PLUGIN(...) registration macro is in HardwareKekPluginBridge.m
// (separate translation unit) so its forward `@interface : NSObject` does not
// bind this @implementation to NSObject. Here the class is a real CAPPlugin.

@interface HardwareKekPlugin (PrivateMethods)
// 2026-07-14 audit MEDIUM: storeKeychainItem returns OSStatus so enroll can
// reject KEYCHAIN_STORE_FAILED on non-success SecItemAdd (see @implementation).
- (OSStatus)storeKeychainItem:(NSString *)label data:(NSData *)data;
- (NSData *)loadKeychainItem:(NSString *)label;
- (OSStatus)deleteKeychainItem:(NSString *)label;
- (OSStatus)deleteSecureEnclaveKey;
@end

@implementation HardwareKekPlugin

#pragma mark - enroll

- (void)enroll:(CAPPluginCall *)call {
    // Codex P1 2026-08-15 — same RASP gate as getHardwareFactor below.
    // enroll() mints the SE key + wraps H; on a compromised runtime the
    // wrap could be observed / the fresh key bound to a hostile Enclave
    // state. Match the Android HardwareKekPlugin posture: BLOCK tier
    // refuses before biometric prompt fires.
    if ([RaspIntegrityPlugin earlyCheck]) {
        [call reject:@"Device integrity check failed — hardware key access refused (I4)" :@"RASP_BLOCK" :nil :nil];
        return;
    }
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        @try {
            // L4 (staleness sweep): iOS Keychain items and the Secure Enclave key
            // survive an app uninstall. On reinstall the JS vault is gone but a
            // residual SE key + ECIES ciphertext can remain under our fixed tags,
            // so this enroll doubles as the first-run staleness clear: it removes
            // any prior credential before creating a new one.
            //
            // Pre-clear must be ROBUST, not best-effort. Previously the two
            // deletes ignored their OSStatus; if a stale SE key genuinely could
            // NOT be removed we would go on and call SecKeyCreateRandomKey under
            // the SAME application tag, producing a second, ambiguous key that
            // SecItemCopyMatching may resolve unpredictably (isEnrolled /
            // getHardwareFactor could then bind to the wrong key). To stay
            // fail-closed (I4) we treat "delete failed for a reason other than
            // 'nothing was there'" as a hard error and reject BEFORE minting a new
            // key — rather than silently stacking a second credential on top of an
            // unremovable stale one.
            //
            // errSecSuccess       = a prior credential existed and was removed.
            // errSecItemNotFound  = clean slate, nothing to remove.
            // anything else       = the stale item is stuck; do not create a new one.
            OSStatus preSeSt  = [self deleteSecureEnclaveKey];
            OSStatus preEncSt = [self deleteKeychainItem:KEY_ENC_H];
            BOOL preSeOk  = (preSeSt  == errSecSuccess || preSeSt  == errSecItemNotFound);
            BOOL preEncOk = (preEncSt == errSecSuccess || preEncSt == errSecItemNotFound);
            if (!preSeOk || !preEncOk) {
                NSString *msg = [NSString stringWithFormat:
                    @"Could not clear stale hardware credential before enroll "
                    @"(SE key OSStatus %d, ciphertext OSStatus %d) — refusing to "
                    @"create a second key under the same tag",
                    (int)preSeSt, (int)preEncSt];
                os_log_info(VeyrnoxKekLog(), "[VEYRNOX-KEK] enroll: PRE-CLEAR FAILED — %{public}s", msg.UTF8String);
                [call reject:msg :@"STALE_CLEAR_FAILED" :nil :nil];
                return;
            }

            // 1. Biometric-gated access control for the SE private key.
            CFErrorRef aclErr = NULL;
            SecAccessControlRef access = SecAccessControlCreateWithFlags(
                kCFAllocatorDefault,
                kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
                kSecAccessControlPrivateKeyUsage | kSecAccessControlBiometryCurrentSet,
                &aclErr);
            if (!access) {
                [call reject:@"Failed to create Secure Enclave access control" :@"ACL_FAILED" :nil :nil];
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
                os_log_info(VeyrnoxKekLog(), "[VEYRNOX-KEK] enroll: SE key generation FAILED: %{public}s",
                    genErr ? ((__bridge NSError *)genErr).localizedDescription.UTF8String : "(no error object)");
                [call reject:@"Secure Enclave key generation failed (device may lack SE or biometrics)" :@"SE_KEYGEN_FAILED" :nil :nil];
                if (genErr) CFRelease(genErr);
                return;
            }
            os_log_info(VeyrnoxKekLog(), "[VEYRNOX-KEK] enroll: Secure Enclave P-256 key generated (persistent, biometric ACL)");

            SecKeyRef sePub = SecKeyCopyPublicKey(sePriv);
            CFRelease(sePriv);  // private key stays in the enclave, retrieved by tag on demand
            if (!sePub) {
                [call reject:@"Failed to derive Secure Enclave public key" :@"SE_PUBKEY_FAILED" :nil :nil];
                return;
            }

            // 3. Fresh random 32-byte hardware factor H.
            uint8_t hBytes[32];
            if (SecRandomCopyBytes(kSecRandomDefault, sizeof(hBytes), hBytes) != errSecSuccess) {
                CFRelease(sePub);
                [call reject:@"Secure random generation failed" :@"RANDOM_FAILED" :nil :nil];
                return;
            }
            NSData *hData = [NSData dataWithBytes:hBytes length:sizeof(hBytes)];

            // 4. ECIES-encrypt H under the SE public key (no biometric needed for encrypt).
            if (!SecKeyIsAlgorithmSupported(sePub, kSecKeyOperationTypeEncrypt, VEYRNOX_ECIES_ALGO)) {
                memset(hBytes, 0, sizeof(hBytes));
                CFRelease(sePub);
                [call reject:@"ECIES algorithm not supported on this device" :@"ALGO_UNSUPPORTED" :nil :nil];
                return;
            }
            CFErrorRef encErr = NULL;
            CFDataRef ct = SecKeyCreateEncryptedData(sePub, VEYRNOX_ECIES_ALGO, (__bridge CFDataRef)hData, &encErr);
            memset(hBytes, 0, sizeof(hBytes));  // zero the plaintext H copy
            CFRelease(sePub);
            if (!ct) {
                [call reject:@"ECIES encryption of hardware factor failed" :@"ECIES_ENCRYPT_FAILED" :nil :nil];
                if (encErr) CFRelease(encErr);
                return;
            }
            NSData *encH = (__bridge_transfer NSData *)ct;
            os_log_info(VeyrnoxKekLog(), "[VEYRNOX-KEK] enroll: H (32B) ECIES-encrypted under SE pubkey → ciphertext %lu bytes", (unsigned long)encH.length);

            // 5. Persist only the ciphertext. The SE private key lives in the enclave.
            // 2026-07-14 audit MEDIUM: verify OSStatus. If SecItemAdd fails, roll back
            // the SE key (kSecAttrIsPermanent:@YES makes it persistent — line 137) so
            // a retry starts clean, and reject KEYCHAIN_STORE_FAILED so JS never stamps
            // hardwareKekVersion:3 on a partial enroll (fail-honest, I4).
            OSStatus storeSt = [self storeKeychainItem:KEY_ENC_H data:encH];
            if (storeSt != errSecSuccess) {
                os_log_info(VeyrnoxKekLog(), "[VEYRNOX-KEK] enroll: KEYCHAIN_STORE_FAILED (OSStatus=%d) — rolling back SE key", (int)storeSt);
                [self deleteSecureEnclaveKey];
                [call reject:[NSString stringWithFormat:@"Failed to persist encrypted hardware factor (OSStatus=%d). SE key rolled back.", (int)storeSt] :@"KEYCHAIN_STORE_FAILED" :nil :nil];
                return;
            }
            os_log_info(VeyrnoxKekLog(), "[VEYRNOX-KEK] enroll: SUCCESS — ciphertext stored, SE privkey retained in enclave");

            [call resolve:@{@"keyTier": @"SecureEnclave"}];
        } @catch (NSException *exception) {
            [call reject:[NSString stringWithFormat:@"Enroll failed: %@", exception.reason] :@"ENROLL_EXCEPTION" :nil :nil];
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
        [call reject:msg :@"CLEAR_FAILED" :nil :nil];
        return;
    }
    [call resolve:@{}];
}

#pragma mark - getHardwareFactor

- (void)getHardwareFactor:(CAPPluginCall *)call {
    // Codex P1 2026-08-15: parity with Android HardwareKekPlugin.getHardwareFactor
    // which gates on RaspIntegrityPlugin.isBlockTier(context). Without this, a
    // hooked iPhone with injected in-page JS could invoke
    // Capacitor.Plugins.HardwareKek.getHardwareFactor(), satisfy Face ID / Touch
    // ID, and walk away with the raw hardware factor H in the attacker's JS
    // context. earlyCheck() runs the same dyld scan + CS_VALID + P_TRACED +
    // isCaptured probes AppDelegate uses at launch — cheap and BLOCK-tier.
    if ([RaspIntegrityPlugin earlyCheck]) {
        [call reject:@"Device integrity check failed — hardware key access refused (I4)" :@"RASP_BLOCK" :nil :nil];
        return;
    }
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        @try {
            NSData *encH = [self loadKeychainItem:KEY_ENC_H];
            if (!encH || encH.length == 0) {
                os_log_info(VeyrnoxKekLog(), "[VEYRNOX-KEK] getHardwareFactor: NOT ENROLLED (no ciphertext)");
                [call reject:@"No hardware key enrolled — call enroll() first" :@"NOT_ENROLLED" :nil :nil];
                return;
            }
            os_log_info(VeyrnoxKekLog(), "[VEYRNOX-KEK] getHardwareFactor: loaded ciphertext %lu bytes, retrieving SE key…", (unsigned long)encH.length);

            // Retrieve the SE private key by tag. Using it for decryption below
            // triggers the biometric (Face ID / Touch ID) prompt via its ACL.
            // iOS-F3: use LAContext with reuseDuration=0 instead of deprecated kSecUseOperationPrompt.
            LAContext *context = [[LAContext alloc] init];
            context.touchIDAuthenticationAllowableReuseDuration = 0; // no reuse — fresh auth per call
            NSData *tag = [SE_KEY_TAG dataUsingEncoding:NSUTF8StringEncoding];
            NSDictionary *query = @{
                (__bridge id)kSecClass:                    (__bridge id)kSecClassKey,
                (__bridge id)kSecAttrApplicationTag:       tag,
                (__bridge id)kSecAttrKeyType:              (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
                (__bridge id)kSecReturnRef:                @YES,
                (__bridge id)kSecUseAuthenticationContext: context,
            };
            SecKeyRef sePriv = NULL;
            OSStatus st = SecItemCopyMatching((__bridge CFDictionaryRef)query, (CFTypeRef *)&sePriv);
            if (st != errSecSuccess || !sePriv) {
                if (sePriv) CFRelease(sePriv);
                [context invalidate];
                context = nil;
                // #2079: a DISMISSAL is not a hardware failure. errSecUserCanceled (-128)
                // is the user backing out of the sheet; JS has a wipe-exempt USER_CANCELLED
                // route that says "Unlock cancelled — try again when ready" instead of
                // "hardware unavailable, restore from seed", and tells stepUpFactorOutcome
                // the factor was never presented. NARROW: errSecAuthFailed (-25293) is a
                // failed biometric MATCH, not a dismissal, and stays on the generic path.
                //
                // ARG ORDER: Capacitor's selector is reject:(message):(code). PR #2086
                // added this site as reject:(@"KEK_USER_CANCELLED", @"User cancelled") —
                // the L-7 swap that #2066 fixed across all 17 sites, reintroduced at a new
                // one. That made the fix INERT: hardware.js saw code="User cancelled" and
                // message="KEK_USER_CANCELLED", matched neither branch, and still returned
                // NO_HARDWARE_FACTOR. The ios-reject-contract tripwire from #2066 catches
                // exactly this — keep the order (message, code).
                if (st == errSecUserCanceled) {
                    os_log_info(VeyrnoxKekLog(), "[VEYRNOX-KEK] getHardwareFactor: USER CANCELLED (OSStatus %d)", (int)st);
                    [call reject:@"Unlock cancelled" :@"KEK_USER_CANCELLED" :nil :nil];
                    return;
                }
                os_log_info(VeyrnoxKekLog(), "[VEYRNOX-KEK] getHardwareFactor: SE key MISSING (OSStatus %d)", (int)st);
                // L-8 (weekly audit 2026-08-25): distinguish PERMANENT invalidation from a
                // transient failure, matching the Android sibling's
                // KeyPermanentlyInvalidatedException → KEK_KEY_PERMANENTLY_INVALIDATED route
                // (HardwareKekPlugin.kt:371-382). We got here having ALREADY loaded a
                // non-empty ciphertext, so the vault IS KEK-wrapped; if the SE private key
                // is no longer in the keychain, H is unrecoverable and seed restore is the
                // ONLY recovery. Telling that user "hardware unavailable" sends them into a
                // device-credential fallback prompt against a key that does not exist.
                //
                // NARROW ON PURPOSE — errSecItemNotFound ONLY. errSecInteractionNotAllowed
                // (device locked, our items are ThisDeviceOnly/passcode-gated),
                // errSecAuthFailed (biometric mismatch) and errSecUserCanceled are all
                // TRANSIENT and must keep the generic code; claiming "restore from seed" on
                // a locked device would be a false, alarming instruction. Anything not
                // provably permanent stays SE_KEY_MISSING → KEK_NO_HARDWARE_FACTOR, which is
                // wipe-exempt either way (hardware.js), so this is a UX-routing fix that
                // cannot make the wrong-PIN counter worse.
                if (st == errSecItemNotFound) {
                    [call reject:@"KEK_KEY_PERMANENTLY_INVALIDATED: Hardware key invalidated — biometric enrollment changed" :@"KEK_KEY_PERMANENTLY_INVALIDATED" :nil :nil];
                    return;
                }
                [call reject:@"Secure Enclave key not found — re-enrollment required" :@"SE_KEY_MISSING" :nil :nil];
                return;
            }
            os_log_info(VeyrnoxKekLog(), "[VEYRNOX-KEK] getHardwareFactor: SE key retrieved, decrypting (Face ID prompt now)…");

            if (!SecKeyIsAlgorithmSupported(sePriv, kSecKeyOperationTypeDecrypt, VEYRNOX_ECIES_ALGO)) {
                CFRelease(sePriv);
                [context invalidate];
                context = nil;
                [call reject:@"ECIES decrypt not supported on this device" :@"ALGO_UNSUPPORTED" :nil :nil];
                return;
            }

            // ECIES-decrypt H. This is the operation that presents Face ID.
            CFErrorRef decErr = NULL;
            CFDataRef pt = SecKeyCreateDecryptedData(sePriv, VEYRNOX_ECIES_ALGO, (__bridge CFDataRef)encH, &decErr);
            CFRelease(sePriv);
            // iOS-F3: invalidate the LAContext immediately after the auth-gated
            // operation completes (success or failure), releasing cached auth state.
            [context invalidate];
            context = nil;
            if (!pt) {
                // Biometric cancel/failure or key-invalidated → fail closed.
                NSString *msg = @"Face ID authentication failed or was cancelled";
                // L-8: the SE ACL is .biometryCurrentSet, so an enrollment change destroys
                // the key. Which call SURFACES that is not device-verified here — it may be
                // the SecItemCopyMatching above (handled there) or this decrypt, depending
                // on iOS version. Handle it in both places on the SAME narrow signal:
                // errSecItemNotFound (-25300) means the enclave has no such key. A cancel is
                // errSecUserCanceled (-128) and a biometric mismatch is errSecAuthFailed
                // (-25293); neither can be confused with this, so the distinction cannot
                // mislabel an ordinary failed unlock as "your key is gone".
                BOOL permanentlyInvalidated = NO;
                // #2079: cancel is a DISMISSAL, not a hardware failure — see the note at
                // the SecItemCopyMatching site above. Checked on BOTH the top-level error
                // and NSUnderlyingErrorKey, mirroring permanentlyInvalidated, because
                // SecKeyCreateDecryptedData wraps the LocalAuthentication error. Two
                // domains carry a cancel: NSOSStatusErrorDomain errSecUserCanceled (-128)
                // and LAErrorDomain LAErrorUserCancel / LAErrorSystemCancel / LAErrorAppCancel.
                // errSecAuthFailed (-25293) and LAErrorAuthenticationFailed are a failed
                // MATCH and are deliberately NOT in this set — reporting a wrong face as
                // "you cancelled" would tell stepUpFactorOutcome no factor was presented.
                BOOL userCancelled = NO;
                if (decErr) {
                    NSError *e = (__bridge NSError *)decErr;
                    if (e.localizedDescription) msg = e.localizedDescription;
                    NSError *underlying = e.userInfo[NSUnderlyingErrorKey];
                    permanentlyInvalidated =
                        ([e.domain isEqualToString:NSOSStatusErrorDomain] && e.code == errSecItemNotFound)
                        || (underlying != nil
                            && [underlying.domain isEqualToString:NSOSStatusErrorDomain]
                            && underlying.code == errSecItemNotFound);
                    userCancelled =
                        VeyrnoxKekIsCancelError(e) || (underlying != nil && VeyrnoxKekIsCancelError(underlying));
                }
                os_log_info(VeyrnoxKekLog(), "[VEYRNOX-KEK] getHardwareFactor: DECRYPT FAILED — %{public}s", msg.UTF8String);
                if (permanentlyInvalidated) {
                    [call reject:@"KEK_KEY_PERMANENTLY_INVALIDATED: Hardware key invalidated — biometric enrollment changed" :@"KEK_KEY_PERMANENTLY_INVALIDATED" :nil :nil];
                    if (decErr) CFRelease(decErr);
                    return;
                }
                // Checked AFTER permanentlyInvalidated: an invalidated key is the more
                // specific and more actionable verdict, and the two signals are disjoint
                // anyway (errSecItemNotFound vs the cancel set).
                if (userCancelled) {
                    [call reject:@"Unlock cancelled" :@"KEK_USER_CANCELLED" :nil :nil];
                    if (decErr) CFRelease(decErr);
                    return;
                }
                [call reject:msg :@"DECRYPT_FAILED" :nil :nil];
                if (decErr) CFRelease(decErr);
                return;
            }
            // iOS-F5: hold decrypted H in NSMutableData so we can zero it from the
            // heap after bridge-serialisation (ARC would release the NSData without
            // wiping the plaintext H bytes).
            //
            // Copy the plaintext out of the CFData into a mutable buffer so we can
            // zero it after use. CFData is released immediately after the copy; the
            // mutable copy is zeroed via resetBytesInRange once serialised.
            NSUInteger hLen = (NSUInteger)CFDataGetLength(pt);
            NSMutableData *h = [NSMutableData dataWithBytes:CFDataGetBytePtr(pt) length:hLen];
            // Item 11: pin H pages in physical RAM — prevents the OS from swapping
            // key material to disk during the window between SE decryption and zeroing.
            // Fail-open: a non-zero return (ENOMEM, EPERM) is silently ignored;
            // the unlock still proceeds, just without the swap-to-disk guarantee.
            mlock(h.mutableBytes, h.length);
            // M-6 (KEK audit, accepted residual 2026-07-17): hB64 is an immutable NSString
            // copy of H in base64 form — the Capacitor bridge requires a string here and
            // NSString is not zeroable. H is zeroed in our NSMutableData copy below (iOS-F5
            // fix), but the bridge intermediary persists until ARC/GC. This is an
            // architectural constraint of the Capacitor plugin protocol, not a code defect.
            // Severity LOW-MEDIUM. M2C_HARDWARE_WRAP_ENABLED stays false until the
            // independent audit confirms the residual risk is tolerable in full KEK context.
            NSString *hB64 = [h base64EncodedStringWithOptions:0];
            // Zero H from heap after bridge-serialisation (iOS-F5 — not zeroed by ARC).
            // 1. our mutable copy:
            [h resetBytesInRange:NSMakeRange(0, h.length)];
            // Unpin now that H is zeroed — the locked pages no longer hold key material.
            munlock(h.mutableBytes, h.length);
            CFRelease(pt);
            // iOS-F9 SE-unlock success marker — the device-verification procedure greps
            // this exact line in the collected system log to tie an SE unlock to a send.
            // %{public} keeps the byte-length visible; H's bytes are NEVER logged.
            os_log_info(VeyrnoxKekLog(), "[VEYRNOX-KEK] getHardwareFactor: SUCCESS — Face ID passed, H recovered (%{public}lu bytes)", (unsigned long)hLen);

            [call resolve:@{@"h": hB64}];
        } @catch (NSException *exception) {
            [call reject:[NSString stringWithFormat:@"getHardwareFactor failed: %@", exception.reason] :@"GETHF_EXCEPTION" :nil :nil];
        }
    });
}

#pragma mark - Keychain / SE Helpers

// 2026-07-14 audit MEDIUM: return OSStatus so enroll can reject KEYCHAIN_STORE_FAILED
// on a non-success SecItemAdd and roll back the persisted Secure Enclave key. Without
// this, a failed ciphertext write (keychain quota / ACL conflict / dupe race with the
// SecItemDelete above) still resolved SUCCESS to JS, which then stamped the vault as
// KEK-wrapped — locking the user out (getHardwareFactor rejects NOT_ENROLLED forever
// after). Fail-honest, I4.
- (OSStatus)storeKeychainItem:(NSString *)label data:(NSData *)data {
    NSDictionary *query = @{
        (__bridge id)kSecClass:        (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrService:  KEYCHAIN_SVC,
        (__bridge id)kSecAttrAccount:  label,
        (__bridge id)kSecValueData:    data,
        (__bridge id)kSecAttrAccessible: (__bridge id)kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
    };
    SecItemDelete((__bridge CFDictionaryRef)query);
    return SecItemAdd((__bridge CFDictionaryRef)query, NULL);
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
