#ifndef RaspIntegrityPlugin_h
#define RaspIntegrityPlugin_h

#import <Capacitor/Capacitor.h>

// RaspIntegrityPlugin IS a CAPPlugin. Registration macro lives in
// RaspIntegrityPluginBridge.m (separate translation unit) — same pattern as
// HardwareKekPlugin to avoid CAP_PLUGIN's NSObject forward-decl conflict.
@interface RaspIntegrityPlugin : CAPPlugin

- (void)checkIntegrity:(CAPPluginCall *)call;

@end

#endif /* RaspIntegrityPlugin_h */
