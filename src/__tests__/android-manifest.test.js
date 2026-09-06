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

// Returns the <uses-permission> and <service> OPENING TAGS, whole, with prose
// removed. Two properties matter, they fail in opposite directions, and both are
// mutation-checked in the tests below:
//
//   1. Comments are stripped FIRST. The manifest's own removal note names both
//      foreground-service permissions, so matching them in prose would fire on
//      correct code — the absence-check-hits-its-own-comment trap. Fails SAFE
//      (cries wolf), which is why it is the easier of the two to notice.
//   2. Tags are matched WHOLE, across newlines — never line by line. Both of
//      these elements are routinely written across several lines:
//
//        <service
//            android:name=".BugReportRecorderService"
//            android:exported="false"
//            android:foregroundServiceType="mediaProjection" />
//
//      Under a line filter only `<service` survives; `foregroundServiceType` is
//      on line four and starts with `android:`, so it is dropped. Restoring that
//      block verbatim — the single most likely way this pin regresses, since it
//      is exactly what #2363 removed — would leave the tests green. Fails
//      DANGEROUS: silent, and a defeated pin reads exactly like a passing one.
//
// A line-prefix version of this helper was on main between #2369 and this
// change. It was replaced after mutation testing showed the multi-line <service>
// block no longer turned the pin red. Do not reintroduce line-based selection;
// "select only declaration lines" is the shape of the bug, not the fix.
function getManifestDeclarations(xml) {
  // Strip to a FIXED POINT, not in one pass. A single replace can reassemble the
  // sequence it removes — `<!<!-- -->-- x -->` leaves a live `<!-- x -->` behind —
  // which is what CodeQL's js/incomplete-multi-character-sanitization flags
  // (alerts 30 and 31 on #2369, alert 32 on this branch's first revision).
  //
  // The security framing does not apply here: the input is our own checked-in
  // manifest, not attacker-controlled markup, and nothing downstream is an HTML
  // sink. The CORRECTNESS one does. A declaration that survives one pass and
  // disappears on the next would be invisible to the pins below, and that
  // direction fails silently.
  //
  // #2369 answered the same alerts by dropping comment-stripping for a line
  // filter. That cleared the alert and defeated the pin (see the note above).
  // Looping clears the alert and keeps the pin.
  let withoutComments = xml;
  let previous;
  do {
    previous = withoutComments;
    withoutComments = previous.replace(/<!--[\s\S]*?-->/g, '');
  } while (withoutComments !== previous);
  // `[^>]*` assumes no attribute VALUE contains a literal `>`. True for every
  // Android attribute we ship, and untrue in general XML — a value like
  // `android:name="a>b"` truncates the match and the tail of the tag becomes
  // invisible, which is this file's dangerous failure direction all over again.
  // Left as-is because a correct XML parser is a dependency this test does not
  // need; recorded because "the markup is shaped how I assume" is precisely
  // what defeated the pin twice (#2369, and the single-pass strip above).
  return (withoutComments.match(/<(?:uses-permission|service)\b[^>]*>/g) || []).join('\n');
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

// The pins above are only as good as the parser underneath them, and a parser
// that quietly stops seeing a declaration turns every `not.toContain` into a
// pass. These run against fixed strings rather than the real manifest, so they
// fail for one reason only: the parser regressed.
describe('getManifestDeclarations — parser properties the pins depend on', () => {
  it('captures attributes of a multi-line <service> (a line filter sees only the first line)', () => {
    const xml = [
      '<application>',
      '    <service',
      '        android:name=".BugReportRecorderService"',
      '        android:exported="false"',
      '        android:foregroundServiceType="mediaProjection" />',
      '</application>',
    ].join('\n');
    expect(getManifestDeclarations(xml)).toMatch(/android:foregroundServiceType/);
  });

  it('captures the name of a multi-line <uses-permission>', () => {
    const xml = [
      '<uses-permission',
      '    android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />',
    ].join('\n');
    expect(getRequestedPermissions(xml))
      .toContain('android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION');
  });

  it('ignores declarations that appear inside comments (so prose cannot fail a build)', () => {
    const xml = [
      '<!-- Removed: <uses-permission',
      '     android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />',
      '     and its <service android:foregroundServiceType="mediaProjection" /> entry. -->',
      '<uses-permission android:name="android.permission.INTERNET" />',
    ].join('\n');
    expect(getRequestedPermissions(xml)).toEqual(['android.permission.INTERNET']);
    expect(getManifestDeclarations(xml)).not.toMatch(/foregroundServiceType/);
  });

  it('strips comments to a fixed point (one pass can reassemble a comment)', () => {
    // `<!<!-- -->-- ... -->` : removing the inner `<!-- -->` splices the outer
    // opener back together, so a single-pass strip leaves a live comment behind
    // and everything inside it stays visible to the matcher.
    const xml = [
      '<!<!-- -->-- <uses-permission',
      '    android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" /> -->',
      '<uses-permission android:name="android.permission.INTERNET" />',
    ].join('\n');
    expect(getRequestedPermissions(xml)).toEqual(['android.permission.INTERNET']);
  });
});

// Everything above checks that the mediaProjection declarations are ABSENT from
// the manifest. Nothing checked that the note explaining their absence is still
// PRESENT — and comments are stripped before matching, so deleting it fails no
// test. That note is the slice-3 recipe: the exact declarations to re-add, and
// why they went (see #2363, and docs/app-store-recording-plan.md). Losing it
// costs a future session the archaeology this one already did.
//
// Deliberately asserts BOTH halves. Present-in-a-comment alone would still pass
// if someone restored the live declarations and kept the note; absent-from-
// declarations alone is what the pins above already do. Together they say the
// one thing that matters: documented, not deployed.
describe('AndroidManifest.xml — the slice-3 re-add recipe survives as prose', () => {
  const comments = (manifest.match(/<!--[\s\S]*?-->/g) || []).join('\n');
  const declarations = getManifestDeclarations(manifest);

  it.each([
    ['FOREGROUND_SERVICE_MEDIA_PROJECTION', /FOREGROUND_SERVICE_MEDIA_PROJECTION/],
    ['the service class name', /BugReportRecorderService/],
    ['the foregroundServiceType value', /foregroundServiceType="mediaProjection"/],
    ['the flag that gates re-adding them', /VITE_BUG_REPORT_ENABLED/],
  ])('keeps %s in a comment, and only in a comment', (_label, pattern) => {
    expect(comments).toMatch(pattern);
    expect(declarations).not.toMatch(pattern);
  });
});
