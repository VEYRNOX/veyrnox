// App-Bridging-Header.h — exposes local Objective-C plugin headers to Swift.
//
// AppDelegate.swift calls RaspIntegrityPlugin.earlyCheck() before the Capacitor
// bridge initialises (a pre-WebView native gate). Swift can only see an
// Objective-C class if its header is imported here and this file is wired via
// the SWIFT_OBJC_BRIDGING_HEADER build setting — without it, `RaspIntegrityPlugin`
// is simply not in scope for Swift, even though the .m file is in the same target.
#import "RaspIntegrityPlugin.h"
