// AppAttestPluginBridge.m — Capacitor registration for AppAttestPlugin.
//
// Separate translation unit, same reason as HardwareKekPluginBridge.m /
// RaspIntegrityPluginBridge.m: CAP_PLUGIN expands to @interface … : NSObject which
// would conflict with the `: CAPPlugin` base declared in AppAttestPlugin.h if they
// shared a unit.

#import <Capacitor/Capacitor.h>

CAP_PLUGIN(AppAttestPlugin, "AppAttest",
  CAP_PLUGIN_METHOD(checkAttestation, CAPPluginReturnPromise);
)
