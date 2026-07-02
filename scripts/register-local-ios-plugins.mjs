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
const LOCAL_IOS_PLUGIN_CLASSES = ['HardwareKekPlugin'];

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

if (added.length) {
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`[register-local-ios-plugins] added to packageClassList: ${added.join(', ')}`);
} else {
  console.log('[register-local-ios-plugins] local iOS plugins already registered ✓');
}
