// HardwareKekPluginBridge.m — Capacitor registration for HardwareKekPlugin.
//
// This is a SEPARATE translation unit on purpose. The CAP_PLUGIN macro expands
// to `@interface HardwareKekPlugin : NSObject` as a forward declaration plus a
// (CAPPluginCategory) that registers the JS method table. Keeping it out of
// HardwareKekPlugin.m ensures the real @implementation there binds to the
// `: CAPPlugin` base declared in HardwareKekPlugin.h — not to NSObject.

#import <Capacitor/Capacitor.h>

CAP_PLUGIN(HardwareKekPlugin, "HardwareKek",
  CAP_PLUGIN_METHOD(enroll, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(isEnrolled, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(clearCredential, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getHardwareFactor, CAPPluginReturnPromise);
)
