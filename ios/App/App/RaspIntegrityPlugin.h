#ifndef RaspIntegrityPlugin_h
#define RaspIntegrityPlugin_h

#import <Capacitor/Capacitor.h>

// RaspIntegrityPlugin IS a CAPPlugin. Registration macro lives in
// RaspIntegrityPluginBridge.m (separate translation unit) — same pattern as
// HardwareKekPlugin to avoid CAP_PLUGIN's NSObject forward-decl conflict.
@interface RaspIntegrityPlugin : CAPPlugin

- (void)checkIntegrity:(CAPPluginCall *)call;

/**
 * earlyCheck — BLOCK-tier class method called from AppDelegate BEFORE the
 * Capacitor bridge initialises. Checks hookedProcess signals (dyld scan).
 * Returns YES if BLOCK-tier signals detected (bridge must not start).
 */
+ (BOOL)earlyCheck;

@end

#endif /* RaspIntegrityPlugin_h */
