// VeyrnoxSpeechRecognitionPluginBridge.m — Capacitor registration for the vendored
// iOS speech plugin (VeyrnoxSpeechRecognitionPlugin.swift).
//
// The CAP_PLUGIN macro registers the Swift class (exposed to the ObjC runtime via
// @objc(VeyrnoxSpeechRecognitionPlugin)) under the JS plugin name "SpeechRecognition"
// — the same name @capacitor-community/speech-recognition uses — so the existing JS
// import in src/context/VoiceContext.jsx routes here on iOS with no JS change. The
// class name is unique to avoid colliding with the (unlinked) npm plugin's class.
//
// See VeyrnoxSpeechRecognitionPlugin.swift and scripts/register-local-ios-plugins.mjs
// for why this vendoring is necessary (npm plugin has no SPM support; Capacitor 8
// registers only classes named in packageClassList).

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(VeyrnoxSpeechRecognitionPlugin, "SpeechRecognition",
           CAP_PLUGIN_METHOD(available, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getSupportedLanguages, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(hasPermission, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(isListening, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(checkPermissions, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(requestPermissions, CAPPluginReturnPromise);
)
