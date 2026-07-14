#ifndef RaspIntegrityPlugin_h
#define RaspIntegrityPlugin_h

#import <Capacitor/Capacitor.h>

// RaspIntegrityPlugin IS a CAPPlugin. Registration macro lives in
// RaspIntegrityPluginBridge.m (separate translation unit) — same pattern as
// HardwareKekPlugin to avoid CAP_PLUGIN's NSObject forward-decl conflict.
@interface RaspIntegrityPlugin : CAPPlugin

- (void)checkIntegrity:(CAPPluginCall *)call;

/**
 * earlyDenyAttach — preventive hardening class method: calls
 * ptrace(PT_DENY_ATTACH, 0, 0, 0) at the earliest possible moment so any
 * subsequent debugger-attach attempt receives SIGKILL. Fail-open: ptrace may
 * be patched on jailbroken devices; this is a hardening action, not a gate.
 */
+ (void)earlyDenyAttach;

/**
 * earlyCheck — BLOCK-tier class method called from AppDelegate BEFORE the
 * Capacitor bridge initialises. Calls earlyDenyAttach first, then checks
 * hookedProcess signals (dyld scan) and tamper (CS_VALID).
 * Returns YES if BLOCK-tier signals detected (bridge must not start).
 */
+ (BOOL)earlyCheck;

@end

#endif /* RaspIntegrityPlugin_h */
