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
});
