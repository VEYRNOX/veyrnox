#ifndef HardwareKekPlugin_h
#define HardwareKekPlugin_h

#import <Capacitor/Capacitor.h>

// Real base class: HardwareKekPlugin IS a CAPPlugin. The CAP_PLUGIN registration
// macro lives in HardwareKekPluginBridge.m (a separate translation unit) so its
// forward `@interface : NSObject` cannot bind the @implementation below to the
// wrong superclass.
@interface HardwareKekPlugin : CAPPlugin

- (void)enroll:(CAPPluginCall *)call;
- (void)isEnrolled:(CAPPluginCall *)call;
- (void)clearCredential:(CAPPluginCall *)call;
- (void)getHardwareFactor:(CAPPluginCall *)call;

@end

#endif /* HardwareKekPlugin_h */
