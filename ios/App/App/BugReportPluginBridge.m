// BugReportPluginBridge.m — Capacitor registration for the vendored
// iOS ReplayKit plugin (BugReportPlugin.swift).
//
// The CAP_PLUGIN macro registers the Swift class (exposed to the ObjC
// runtime via @objc(BugReportPlugin)) under the JS plugin name
// "BugReport". Slice 2c's captureBridge.js resolves via
// Capacitor.Plugins.BugReport.
//
// See BugReportPlugin.swift and scripts/register-local-ios-plugins.mjs
// for why local plugins must be re-added to packageClassList after every
// cap sync.

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(BugReportPlugin, "BugReport",
           CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(startRecording, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(stopRecording, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(abortRecording, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(readRecording, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(deleteRecording, CAPPluginReturnPromise);
)
