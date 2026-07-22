#!/usr/bin/env node
// check-log-redaction-patch.mjs — CI guard for the LOG-1 debug-bridge redaction patch.
//
// Independent-audit follow-up (docs/audit-triage/independent-audit-2026-07-06-android-kek-suite.md, F4.1).
//
// WHY: Capacitor's debug bridge logger echoes every native plugin call/result to the WebView
// console, which Android relays to logcat on debug builds — leaking the hardware KEK factor H
// and the encrypted vault blob (finding LOG-1). The fix is a patch-package patch that redacts
// HardwareKek / SecureStorage payloads inside node_modules' native-bridge.js.
//
// THE RISK THIS GUARDS: a patch-package patch is silently DROPPED when its target dependency
// is bumped past the pinned version (currently @capacitor/{android,ios}+8.4.2) — patch-package logs
// a warning but `npm install` still succeeds, so the leak re-opens with no error and no failing
// build. This guard reads the INSTALLED files and FAILS CI if the redaction markers are absent.
//
// RUN: after `npm install` (postinstall → patch-package has applied the patches).

import { readFileSync, existsSync } from 'node:fs';

// Patch targets — must match patches/@capacitor+{android,ios}+<version>.patch.
const TARGETS = [
  'node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js',
  'node_modules/@capacitor/ios/Capacitor/Capacitor/assets/native-bridge.js',
];

// Markers injected by the redaction patch. All must be present in each target.
const MARKERS = ['VEYRNOX_SENSITIVE_PLUGINS', 'VEYRNOX_REDACTED', 'veyrnoxSanitizeResult'];

let failed = false;

for (const file of TARGETS) {
  if (!existsSync(file)) {
    console.error(
      `[check-log-redaction] MISSING: ${file}\n` +
      '  → node_modules is not installed, or Capacitor moved the bridge asset so the patch ' +
      'target path changed. Run `npm install` first; if the path moved, refresh patches/.',
    );
    failed = true;
    continue;
  }
  const src = readFileSync(file, 'utf8');
  const missing = MARKERS.filter((m) => !src.includes(m));
  if (missing.length) {
    console.error(
      `[check-log-redaction] NOT REDACTED: ${file}\n` +
      `  → missing markers: ${missing.join(', ')}\n` +
      '  → the LOG-1 redaction patch did not apply (most likely a @capacitor version bump ' +
      'past the version pinned in the patches/ filenames). Re-create it with ' +
      '`npx patch-package @capacitor/android @capacitor/ios` ' +
      'after re-applying the redaction, then re-verify no H / vault payload reaches logcat.',
    );
    failed = true;
  } else {
    console.log(`[check-log-redaction] OK: ${file}`);
  }
}

if (failed) {
  console.error(
    '[check-log-redaction] FAILED — the debug-bridge log-redaction patch (LOG-1) is not ' +
    'applied. See docs/audit-triage/independent-audit-2026-07-06-android-kek-suite.md (F4.1).',
  );
  process.exit(1);
}

console.log('[check-log-redaction] all sensitive-plugin bridge payloads are redacted (LOG-1 OK).');
