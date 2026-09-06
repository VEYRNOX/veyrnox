// src/__tests__/android-manifest.test.js
//
// Static invariants over android/app/src/main/AndroidManifest.xml. Both target
// permissions that are load-bearing on Play launch:
//
//   1. CAMERA must be declared — without it, Capacitor's WebView
//      onPermissionRequest can't grant the runtime permission, and the QR
//      scanner in the Send flow silently fails ("Camera access denied").
//   2. RECORD_AUDIO is declared for Voice Commands — Play's crypto-app policy
//      reviewers ask why. A justifying <!-- comment --> above the permission
//      lets a reviewer eyeballing the manifest see the answer without opening
//      the Data Safety form.
//
// This test does NOT run Gradle — it's a pure read of the source manifest, so
// it runs fast under vitest on any dev box and catches manifest drift at PR
// time.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MANIFEST_PATH = join(process.cwd(), 'android/app/src/main/AndroidManifest.xml');
const manifest = readFileSync(MANIFEST_PATH, 'utf8');

function getManifestDeclarations(xml) {
  // Only XML declaration lines can request a permission or configure a service.
  // Selecting those lines avoids rewriting XML to remove explanatory comments.
  return xml
    .split(/\r?\n/)
    .filter((line) => {
      const declaration = line.trimStart();
      return declaration.startsWith('<uses-permission') || declaration.startsWith('<service');
    })
    .join('\n');
}

function getRequestedPermissions(xml) {
  return [...getManifestDeclarations(xml).matchAll(/<uses-permission\s+android:name="([^"]+)"/g)]
    .map((match) => match[1]);
}

describe('AndroidManifest.xml — Play launch invariants', () => {
  it('declares android.permission.CAMERA (QR scanner won\'t work without it)', () => {
    expect(manifest).toMatch(/<uses-permission\s+android:name="android\.permission\.CAMERA"\s*\/>/);
  });

  it('declares <uses-feature android.hardware.camera required="false"> (tablets without cameras can still install)', () => {
    expect(manifest).toMatch(/<uses-feature\s+android:name="android\.hardware\.camera"\s+android:required="false"\s*\/>/);
  });

  it('declares android.permission.RECORD_AUDIO (Voice Commands feature)', () => {
    expect(manifest).toMatch(/<uses-permission\s+android:name="android\.permission\.RECORD_AUDIO"\s*\/>/);
  });

  it('has a justifying comment above RECORD_AUDIO (Play crypto-app policy review)', () => {
    // The comment must sit ABOVE the RECORD_AUDIO permission line, with no
    // other <uses-permission> line between them. Match a comment block ending
    // with `-->` immediately before the RECORD_AUDIO declaration.
    const recordAudioBlock = /-->\s*<uses-permission\s+android:name="android\.permission\.RECORD_AUDIO"\s*\/>/;
    expect(manifest).toMatch(recordAudioBlock);
  });

  it('RECORD_AUDIO justification names the feature (Voice Commands / speech recognition) so a reviewer can grep', () => {
    // Extract the comment block that immediately precedes RECORD_AUDIO and
    // assert it mentions Voice Commands OR speech recognition. Kept as a
    // substring check so future re-wording (as long as it names the feature)
    // doesn't break the test.
    const commentBefore = manifest.split('<uses-permission android:name="android.permission.RECORD_AUDIO"')[0];
    const lastComment = commentBefore.match(/<!--[\s\S]*?-->\s*$/);
    expect(lastComment, 'comment block immediately above RECORD_AUDIO').toBeTruthy();
    const commentText = lastComment[0];
    expect(commentText).toMatch(/Voice Commands|speech.?recognition|speech recognizer/i);
  });

  it('has a justifying comment above CAMERA that mentions QR', () => {
    const commentBefore = manifest.split('<uses-permission android:name="android.permission.CAMERA"')[0];
    const lastComment = commentBefore.match(/<!--[\s\S]*?-->\s*$/);
    expect(lastComment, 'comment block immediately above CAMERA').toBeTruthy();
    expect(lastComment[0]).toMatch(/QR|barcode/i);
  });

  // Enforces the removal made by #2363. The manifest already says "Do NOT re-add
  // these to unblock a build" — this is the check behind that instruction, so a
  // re-add fails CI instead of relying on a reader noticing the comment.
  //
  // Why it matters: FOREGROUND_SERVICE_MEDIA_PROJECTION triggers Play's mandatory
  // Foreground service permissions declaration, which blocks EVERY pending change
  // on the app — not just the release that reintroduced it. The capability is
  // unreachable regardless (VITE_BUG_REPORT_ENABLED is set nowhere, so
  // BugReportButton renders null), and the live store listing declares no screen
  // capture.
  //
  // Slice 3 of docs/bug-report-recording-plan.md is the named un-pin condition:
  // the commit that flips VITE_BUG_REPORT_ENABLED and publishes the Play Data
  // Safety / Apple App Privacy amendments re-adds all four manifest lines and
  // deletes this test. BugReportPlugin.kt carries the exact declarations to
  // restore. Do not weaken this to make an unrelated build pass.
  //
  // Asserted against DECLARATIONS ONLY, with comments stripped first. The
  // manifest's removal note names both permissions, so a whole-file match would
  // fire on the comment explaining the removal and this pin would fail on
  // correct code.
  it('does not request foreground-service permissions (slice 3 re-adds them with the store disclosure)', () => {
    const declarations = getManifestDeclarations(manifest);
    const requested = getRequestedPermissions(manifest);
    expect(requested).not.toContain('android.permission.FOREGROUND_SERVICE');
    expect(requested).not.toContain('android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION');
    // The <service> entry is the other half — without it the permissions are
    // pointless, and with it Play still reads the app as using media projection.
    expect(declarations).not.toMatch(/android:foregroundServiceType/);
  });

  // Guards the pin above against passing vacuously. If the manifest were ever
  // emptied, truncated, or read from the wrong path, every `not.toContain`
  // assertion would pass on an empty string. This asserts the parse actually
  // found the permissions the app genuinely ships.
  it('the declaration parse still sees the real permissions (guards the pin above)', () => {
    const requested = getRequestedPermissions(manifest);
    expect(requested).toContain('android.permission.CAMERA');
    expect(requested).toContain('android.permission.INTERNET');
  });
});
