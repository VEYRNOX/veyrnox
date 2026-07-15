// register-local-ios-plugins.mjs — run AFTER every `cap sync`.
//
// WHY THIS EXISTS (root cause of a hard-to-find "plugin is not implemented on ios"):
// Capacitor 8's iOS bridge registers plugins ONLY from the class names listed in
// `ios/App/App/capacitor.config.json` → `packageClassList` (see CapacitorBridge.swift
// `registerPlugins()`). It does NOT scan the Objective-C runtime. `cap sync` regenerates
// that file from the npm-installed plugins and therefore DROPS any LOCAL native plugin
// that lives in the App target rather than an npm package. Our Secure Enclave Hardware
// KEK plugin (`HardwareKekPlugin`, ios/App/App/HardwareKekPlugin.{h,m}+Bridge.m) is such
// a local plugin — so without this step it silently fails to register and every KEK call
// throws "HardwareKek plugin is not implemented on ios" (surfaced to the user as the
// generic "Something went wrong"). capacitor.config.json is gitignored + generated, so the
// registration cannot be committed there; this script re-adds it deterministically.
//
// Idempotent. Safe to run repeatedly. No-op if the config isn't generated yet.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// Local (non-npm) native iOS plugin classes that must be in packageClassList.
// VeyrnoxSpeechRecognitionPlugin is our vendored Voice Commands plugin — it serves
// the JS plugin name "SpeechRecognition" on iOS because @capacitor-community/
// speech-recognition (Cap 7, podspec-only) cannot link into this SPM-based Cap 8
// app. See ios/App/App/VeyrnoxSpeechRecognitionPlugin.swift for the full rationale.
// RaspIntegrityPlugin is the iOS RASP probe (ObjC, ios/App/App/RaspIntegrityPlugin.m +
// RaspIntegrityPluginBridge.m) — added to the Xcode target in PR #826 but cap sync
// drops it on every run because it is not an npm package.
// AppAttestPlugin is the iOS remote-attestation probe (ObjC, ios/App/App/AppAttestPlugin.m +
// AppAttestPluginBridge.m) — RASP Phase 2b. Same cap-sync drop hazard as the other
// local plugins: it is not an npm package, so it must be re-added here every run.
const LOCAL_IOS_PLUGIN_CLASSES = ['HardwareKekPlugin', 'VeyrnoxSpeechRecognitionPlugin', 'RaspIntegrityPlugin', 'AppAttestPlugin'];

// Class names `cap sync` may regenerate into packageClassList but that are NOT
// actually linked into the iOS binary. "SpeechRecognition" is the npm plugin's ObjC
// class; it never links on iOS (no SPM support), so leaving it in packageClassList
// makes Capacitor attempt NSClassFromString on a missing class. Our vendored
// VeyrnoxSpeechRecognitionPlugin provides the "SpeechRecognition" JS name instead.
const STALE_IOS_PLUGIN_CLASSES = ['SpeechRecognition'];

const cfgPath = 'ios/App/App/capacitor.config.json';

if (!existsSync(cfgPath)) {
  console.log(`[register-local-ios-plugins] ${cfgPath} not found (run \`cap sync\` first) — skipping`);
  process.exit(0);
}

const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
cfg.packageClassList = Array.isArray(cfg.packageClassList) ? cfg.packageClassList : [];

const added = [];
for (const cls of LOCAL_IOS_PLUGIN_CLASSES) {
  if (!cfg.packageClassList.includes(cls)) {
    cfg.packageClassList.push(cls);
    added.push(cls);
  }
}

const removed = [];
for (const cls of STALE_IOS_PLUGIN_CLASSES) {
  const i = cfg.packageClassList.indexOf(cls);
  if (i !== -1) {
    cfg.packageClassList.splice(i, 1);
    removed.push(cls);
  }
}

if (added.length || removed.length) {
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  if (added.length) console.log(`[register-local-ios-plugins] added to packageClassList: ${added.join(', ')}`);
  if (removed.length) console.log(`[register-local-ios-plugins] removed stale (unlinked) classes: ${removed.join(', ')}`);
} else {
  console.log('[register-local-ios-plugins] local iOS plugins already registered ✓');
}
