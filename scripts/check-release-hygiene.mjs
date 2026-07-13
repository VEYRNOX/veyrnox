#!/usr/bin/env node
// scripts/check-release-hygiene.mjs — CI guard for Android release-build hygiene properties.
//
// RASP B4 (release-build hygiene, 2026-07-13). Companion to the RASP roadmap items:
//   B4a — setWebContentsDebuggingEnabled(false) gated on !BuildConfig.DEBUG
//   B4b — FLAG_SECURE applied in onCreate
//   B4c — minifyEnabled true in the release build type
//   B4d — shrinkResources true in the release build type
//   B4e — debuggable false in the release build type
//   B4f — ProGuard rules file referenced
//
// WHY A DEDICATED SCRIPT: these properties can silently regress — a copy-paste edit of
// build.gradle, a `cap sync android` that rewrites files, or a merge conflict resolution
// can flip minifyEnabled/debuggable/shrinkResources back to the wrong value. Unit tests
// don't cover Gradle or Android Java config; a CI gate that reads the source files is the
// only reliable regression detector. Same rationale as check:log-redaction / check:rng.
//
// SCOPE: Android only. iOS release hygiene (WKWebView.isInspectable = false) is
// architecture-gated on a Mac build environment and is tracked separately (see
// docs/rasp-full-capability-analysis.md B4). This script does not attempt to verify iOS.
//
// RUN: node scripts/check-release-hygiene.mjs
// CI: added as npm run check:release-hygiene, required step in verify workflow.

import { readFileSync, existsSync } from 'node:fs';

// ── helpers ───────────────────────────────────────────────────────────────────

let failures = 0;

function pass(msg) { console.log(`  ✅  ${msg}`); }
function fail(msg) { console.error(`  ❌  ${msg}`); failures++; }
function section(title) { console.log(`\n── ${title}`); }

function read(path) {
  if (!existsSync(path)) {
    fail(`File not found: ${path}`);
    return '';
  }
  return readFileSync(path, 'utf8');
}

// ── checks ────────────────────────────────────────────────────────────────────

section('B4a — WebView remote-debug disabled in release (MainActivity.java)');
{
  const src = read('android/app/src/main/java/com/veyrnox/app/MainActivity.java');
  if (!src) { /* file-not-found already logged */ }
  else {
    // Must be gated on !BuildConfig.DEBUG, not unconditional (unconditional breaks debug dev)
    const hasGuard = /if\s*\(\s*!\s*BuildConfig\.DEBUG\s*\)/.test(src);
    const hasDisable = /WebView\.setWebContentsDebuggingEnabled\s*\(\s*false\s*\)/.test(src);
    if (hasGuard && hasDisable)
      pass('setWebContentsDebuggingEnabled(false) is gated on !BuildConfig.DEBUG');
    else if (hasDisable && !hasGuard)
      fail('setWebContentsDebuggingEnabled(false) found but NOT gated on !BuildConfig.DEBUG — it will break debug builds');
    else
      fail('setWebContentsDebuggingEnabled(false) not found in MainActivity.java');
  }
}

section('B4b — FLAG_SECURE applied in onCreate (MainActivity.java)');
{
  const src = read('android/app/src/main/java/com/veyrnox/app/MainActivity.java');
  if (src) {
    const hasFlag = /WindowManager\.LayoutParams\.FLAG_SECURE/.test(src);
    const hasSetFlags = /getWindow\(\)\.setFlags\s*\(/.test(src);
    if (hasFlag && hasSetFlags)
      pass('FLAG_SECURE applied via getWindow().setFlags()');
    else
      fail('FLAG_SECURE not found in MainActivity.java — screenshots and screen-capture are not blocked');
  }
}

section('B4c — minifyEnabled true in release build type (build.gradle)');
{
  const src = read('android/app/build.gradle');
  if (src) {
    // Look for the release block and confirm minifyEnabled true within it.
    // Simple heuristic: find 'release {' then search the following ~200 chars.
    const releaseIdx = src.indexOf('release {', src.indexOf('buildTypes'));
    const releaseBlock = releaseIdx >= 0 ? src.slice(releaseIdx, releaseIdx + 800) : '';
    if (/minifyEnabled\s+true/.test(releaseBlock))
      pass('minifyEnabled true in release build type');
    else
      fail('minifyEnabled true not found in the release buildType block in build.gradle — R8/ProGuard is OFF');
  }
}

section('B4d — shrinkResources true in release build type (build.gradle)');
{
  const src = read('android/app/build.gradle');
  if (src) {
    const releaseIdx = src.indexOf('release {', src.indexOf('buildTypes'));
    const releaseBlock = releaseIdx >= 0 ? src.slice(releaseIdx, releaseIdx + 800) : '';
    if (/shrinkResources\s+true/.test(releaseBlock))
      pass('shrinkResources true in release build type');
    else
      fail('shrinkResources true not found in the release buildType block — unused resources are shipped');
  }
}

section('B4e — debuggable false in release build type (build.gradle)');
{
  const src = read('android/app/build.gradle');
  if (src) {
    const releaseIdx = src.indexOf('release {', src.indexOf('buildTypes'));
    const releaseBlock = releaseIdx >= 0 ? src.slice(releaseIdx, releaseIdx + 800) : '';
    if (/debuggable\s+false/.test(releaseBlock))
      pass('debuggable false in release build type');
    else
      fail('debuggable false not found in the release buildType block in build.gradle');
  }
}

section('B4f — ProGuard rules file referenced in release build type (build.gradle)');
{
  const src = read('android/app/build.gradle');
  if (src) {
    const releaseIdx = src.indexOf('release {', src.indexOf('buildTypes'));
    const releaseBlock = releaseIdx >= 0 ? src.slice(releaseIdx, releaseIdx + 800) : '';
    if (/proguardFiles/.test(releaseBlock))
      pass('proguardFiles referenced in release build type');
    else
      fail('proguardFiles not found in the release buildType block — ProGuard rules are not applied');
  }
}

section('B4f-rules — ProGuard rules file exists (proguard-rules.pro)');
{
  const src = read('android/app/proguard-rules.pro');
  if (src && src.trim().length > 0)
    pass('proguard-rules.pro exists and is non-empty');
  else if (src !== undefined)
    fail('proguard-rules.pro exists but is empty — no keep rules means Capacitor bridge will be stripped');
}

section('B4g — filterTouchesWhenObscured on Capacitor WebView (MainActivity.java)');
{
  const src = read('android/app/src/main/java/com/veyrnox/app/MainActivity.java');
  if (src) {
    const hasCall = /getBridge\(\)\.getWebView\(\)\.setFilterTouchesWhenObscured\s*\(\s*true\s*\)/.test(src);
    if (hasCall)
      pass('setFilterTouchesWhenObscured(true) applied to Capacitor WebView — overlay-phishing tap events refused');
    else
      fail('setFilterTouchesWhenObscured(true) not found — the Capacitor WebView will accept tap events routed through an overlay window (tapjacking risk)');
  }
}

// ── summary ───────────────────────────────────────────────────────────────────

console.log('');
if (failures > 0) {
  console.error(`check:release-hygiene FAILED — ${failures} problem(s) above. Release builds are missing hardening properties.`);
  process.exit(1);
} else {
  console.log('check:release-hygiene PASSED — all Android release-build hygiene properties present.');
  process.exit(0);
}
