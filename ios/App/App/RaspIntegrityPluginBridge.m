// RaspIntegrityPluginBridge.m — Capacitor registration for RaspIntegrityPlugin.
//
// Separate translation unit, same reason as HardwareKekPluginBridge.m:
// CAP_PLUGIN expands to @interface … : NSObject which would conflict with the
// `: CAPPlugin` base declared in RaspIntegrityPlugin.h if they shared a unit.

#import <Capacitor/Capacitor.h>

CAP_PLUGIN(RaspIntegrityPlugin, "RaspIntegrity",
  CAP_PLUGIN_METHOD(checkIntegrity, CAPPluginReturnPromise);
)
