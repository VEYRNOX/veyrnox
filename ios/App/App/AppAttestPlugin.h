#ifndef AppAttestPlugin_h
#define AppAttestPlugin_h

#import <Capacitor/Capacitor.h>

// Real base class: AppAttestPlugin IS a CAPPlugin. The CAP_PLUGIN registration
// macro lives in AppAttestPluginBridge.m (a separate translation unit) so its
// forward `@interface : NSObject` cannot bind the @implementation below to the
// wrong superclass — same split as HardwareKekPlugin.h / RaspIntegrityPlugin.h.
@interface AppAttestPlugin : CAPPlugin

- (void)checkAttestation:(CAPPluginCall *)call;

@end

#endif /* AppAttestPlugin_h */
