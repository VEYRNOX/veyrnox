// Firebase Test Lab release-smoke regression guard.
//
// The device tests are authored in Swift / workflow YAML / Robo Script JSON, so
// Vitest cannot execute them locally. This static guard pins the pieces that
// previously drifted independently: Veyrnox's eight-digit explicit-submit
// PinPad, the fresh-install entry-tile route on BOTH platforms, and the
// exact-SHA APK handoff.
//
// It used to pin the iOS label as the literal "Get Started" while Android's
// Robo script clicked "New wallet". Both platforms render the same web UI, so
// that difference was never real — it was drift, and pinning it here is what
// made it durable. Slice D1 replaced the welcome hero with entry tiles on
// 2026-08-10; iOS then waited 15s for a button that could not appear, for
// sixteen days, because the xcuitest job never completed (#2109).
//
// So the label is no longer hardcoded twice. It is read out of the Swift and
// checked against src/components/EntryTiles.jsx, the component that actually
// renders it. Rename a tile and this test fails, which is the point.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const swift = read('ios/App/AppUITests/AppUITests.swift');
const entryTiles = read('src/components/EntryTiles.jsx');
const workflow = read('.github/workflows/firebase-test-lab.yml');
const ciWorkflow = read('.github/workflows/ci.yml');
const androidBuild = read('android/app/build.gradle');
const roboScriptPath = '.github/testlab/android-pin-onboarding-robo-script.json';
const roboScript = JSON.parse(read(roboScriptPath));

function indexOrFail(source, needle) {
  const index = source.indexOf(needle);
  expect(index, `missing ${JSON.stringify(needle)}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe('Firebase Test Lab first-run PIN smoke', () => {
  it('drives iOS through the entry tile it actually renders, and explicitly submits both 8-digit PIN stages', () => {
    const pin = swift.match(/let pin = "(\d+)"/)?.[1];
    expect(pin).toBe('19283746');

    // Read the label out of the create-flow retry helper rather than asserting
    // a second copy of it. Later submit controls are not entry tiles and must
    // not be checked against EntryTiles.
    const tileLabel = swift.match(/tapButtonUntilAdvanced\([\s\S]*?label: "([^"]+)"/)?.[1];
    expect(tileLabel, 'no tapButtonUntilAdvanced entry-tile call found in the Swift').toBeTruthy();

    // …and hold it against the component that renders it. EntryTiles sets an
    // explicit aria-label per tile, so this string IS the accessible name
    // XCUITest matches on. If a tile is renamed, this fails here — on every
    // PR — instead of on a device suite that may not complete for weeks.
    expect(
      entryTiles,
      `AppUITests.swift taps "${tileLabel}", which src/components/EntryTiles.jsx does not render. `
      + 'Slice D1 already broke this once (#2109) — retarget the Swift at a live tile label.',
    ).toContain(`label: "${tileLabel}"`);

    // The create path specifically: "New wallet" is the tile that routes to
    // PIN-create, which is the flow the two PIN stages below depend on.
    expect(tileLabel).toBe('New wallet');

    // Both platforms drive the same web UI, so the Android Robo script's first
    // click and the iOS tap must be the same label. They disagreed for sixteen
    // days and nothing caught it.
    const roboFirstClick = roboScript.find(({ eventType }) => eventType === 'VIEW_CLICKED');
    expect(roboFirstClick?.elementDescriptors?.[0]).toEqual({ text: tileLabel });

    const getStarted = indexOrFail(swift, 'tapButtonUntilAdvanced(');
    const getStartedLabel = indexOrFail(swift, `label: "${tileLabel}"`);
    const setDigits = indexOrFail(swift, 'enterPin(app: app, digits: pin, stage: "set")');
    const setSubmit = indexOrFail(swift, 'submitPinUntilAdvanced(app: app, stage: "set"');
    const confirmDigits = indexOrFail(swift, 'enterPin(app: app, digits: pin, stage: "confirm")');
    // Anchored on the FUNCTION NAME plus its stage, not on raw source layout.
    // This needle used to be `stage: "confirm",\n<16 spaces>advanced: { ... }`,
    // which coupled the guard to the Swift's exact indentation and to the whole
    // predicate body — a reindent or any change to the predicate would have
    // broken it, surfacing as a confusing failure in a JS test about a Swift
    // file. AppUITests.swift keeps this call on one line for that reason.
    const confirmSubmit = indexOrFail(swift, 'submitPinUntilAdvanced(app: app, stage: "confirm"');

    expect(getStarted).toBeLessThan(getStartedLabel);
    expect(getStartedLabel).toBeLessThan(setDigits);
    expect(setDigits).toBeLessThan(setSubmit);
    expect(setSubmit).toBeLessThan(confirmDigits);
    expect(confirmDigits).toBeLessThan(confirmSubmit);
    expect(swift).toContain('app.buttons["Submit PIN"]');
  });

  it('uses a Robo script to click the custom Android PinPad instead of inventing text fields', () => {
    expect(workflow).toContain(`--robo-script ${roboScriptPath}`);
    expect(workflow).not.toContain('--robo-directives');

    const clicks = roboScript
      .filter(({ eventType }) => eventType === 'VIEW_CLICKED')
      .map(({ elementDescriptors }) => elementDescriptors?.[0]);
    const pin = '19283746';
    expect(clicks).toEqual([
      { text: 'New wallet' },
      ...[...pin].map(text => ({ text })),
      { text: 'Submit PIN' },
      ...[...pin].map(text => ({ text })),
      { text: 'Submit PIN' },
    ]);
    expect(roboScript.every(({ visionText }) => visionText == null)).toBe(true);
    expect(roboScript.some(({ eventType }) => eventType === 'VIEW_TEXT_CHANGED')).toBe(false);
    expect(roboScript).toContainEqual(expect.objectContaining({
      eventType: 'ASSERTION',
      contextDescriptor: expect.objectContaining({
        elementDescriptors: [{ text: 'Help improve Veyrnox' }],
      }),
    }));
  });

  it('downloads the isolated Android Firebase artifact from CI for this exact commit', () => {
    expect(workflow).toContain('actions: write');
    expect(workflow).toContain('--commit "$SHA"');
    expect(workflow).toContain('run-id: ${{ steps.ci_run.outputs.run_id }}');
    expect(workflow).toContain('github-token: ${{ github.token }}');
    expect(workflow).toContain("EXPECTED_EVENT: ${{ github.event_name == 'workflow_dispatch' && 'workflow_dispatch' || 'push' }}");
    expect(workflow).toContain('select(.event == \\"$EXPECTED_EVENT\\")');
    expect(workflow).not.toContain('--event push');
    expect(workflow).not.toContain('dawidd6/action-download-artifact');
    expect(workflow).toContain('name: veyrnox-firebase-test-apk');
    // Google product flavour: the APK is app-google-firebaseTest.apk, not
    // app-firebaseTest.apk. The old assertion pinned the wrong filename and is
    // what made every Firebase Test Lab run under #1960 hit "APK not found".
    expect(workflow).toContain('--app artifacts/app-google-firebaseTest.apk');
    expect(workflow).not.toContain('--app artifacts/app-release.aab');
  });

  it('builds a non-publishable release-hardened Firebase APK with matching RASP signing', () => {
    expect(ciWorkflow).toContain('build_firebase_test:');
    expect(ciWorkflow).toContain("inputs.build_firebase_test == true");
    expect(ciWorkflow).toContain("github.ref == 'refs/heads/main' && github.event_name == 'push'");
    expect(ciWorkflow).toContain('android-firebase-test:');
    expect(ciWorkflow).toContain('./gradlew assembleGoogleFirebaseTest');
    expect(ciWorkflow).toContain('name: veyrnox-firebase-test-apk');
    expect(ciWorkflow).not.toContain('./gradlew bundleFirebaseTest');

    expect(androidBuild).toContain('firebaseTest {');
    expect(androidBuild).toContain('initWith release');
    expect(androidBuild).toContain('applicationIdSuffix ".firebase.testlab"');
    expect(androidBuild).toContain("project.findProperty('FIREBASE_TEST_CERT_SHA256')");
    expect(androidBuild).toContain("it.name == 'assembleGoogleFirebaseTest'");
    expect(androidBuild).toContain('cert.equalsIgnoreCase(uploadSha)');
    // Non-google flavors and all bundle tasks are disabled by pattern match,
    // not per-task name, so assert the pattern the multi-flavor build uses.
    expect(androidBuild).toContain("it.name.contains('FirebaseTest') && it.name.startsWith('bundle')");
    expect(androidBuild).toContain('enabled = false');
  });

  it('runs Firebase without re-signing and preserves useful per-axis diagnostics', () => {
    expect(workflow).toContain('--no-resign');
    expect(workflow).toContain('MATRIX_ID');
    expect(workflow).toContain('testing.googleapis.com/v1/projects/${PROJECT_ID}/testMatrices/${MATRIX_ID}');
    expect(workflow).toContain('invalidMatrixDetails');
    expect(workflow).toContain('infrastructureFailure');
    expect(workflow).toContain('toolResultsStep');
    expect(workflow).toContain('toolLogs');
    expect(workflow).toContain('${{ github.run_id }}-${{ github.run_attempt }}');
  });

  it('supports a manual exact-SHA Android Firebase run without enabling Play publication', () => {
    expect(workflow).toContain('platform:');
    expect(workflow).toContain("inputs.platform == 'android'");
    expect(workflow).toContain("vars.IOS_FIREBASE_SIGNING_READY == 'true'");
  });

  it('builds and verifies Apple-signed app and XCUITest runner artifacts before Firebase upload', () => {
    expect(workflow).toContain('secrets.IOS_ASC_PRIVATE_KEY');
    expect(workflow).toContain('secrets.IOS_ASC_KEY_ID');
    expect(workflow).toContain('secrets.IOS_ASC_ISSUER_ID');
    expect(workflow).toContain('-allowProvisioningUpdates');
    expect(workflow).toContain('-authenticationKeyPath "$ASC_KEY_PATH"');
    expect(workflow).toContain('DEVELOPMENT_TEAM=R54268MWFV');
    expect(workflow).toContain('codesign --verify --deep --strict --verbose=2 "$APP_PATH"');
    expect(workflow).toContain('codesign --verify --deep --strict --verbose=2 "$RUNNER_PATH"');
    expect(workflow).not.toContain('CODE_SIGNING_ALLOWED=NO');
    expect(workflow).not.toContain('Build unsigned app + test bundle');
  });

  it('gates iOS staging store upload on both Firebase device suites', () => {
    expect(workflow).toContain('publish_staging:');
    expect(workflow).not.toContain('publish-android-staging:');
    expect(workflow).toContain('publish-ios-staging:');
    expect(workflow.match(/needs: \[android-robo, ios-smoke\]/g)).toHaveLength(1);
    expect(workflow).toContain('xcrun altool --upload-app');
    expect(workflow).toContain('npm run build:staging');
    expect(ciWorkflow).toContain('build_staging_release:');
    expect(ciWorkflow).toContain("'veyrnox-staging-aab'");
  });
});
