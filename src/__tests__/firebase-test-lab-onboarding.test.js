// Firebase Test Lab release-smoke regression guard.
//
// The device tests are authored in Swift / workflow YAML / Android instrumentation, so
// Vitest cannot execute them locally. This static guard pins the pieces that
// previously drifted independently: Veyrnox's eight-digit explicit-submit
// PinPad, the fresh-install "New wallet" route, and the exact-SHA APK handoff.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const swift = read('ios/App/AppUITests/AppUITests.swift');
const workflow = read('.github/workflows/firebase-test-lab.yml');
const ciWorkflow = read('.github/workflows/ci.yml');
const androidBuild = read('android/app/build.gradle');
const androidInstrumentation = read('android/app/src/androidTest/java/com/veyrnox/app/FirebaseOnboardingSmokeTest.java');

function indexOrFail(source, needle) {
  const index = source.indexOf(needle);
  expect(index, `missing ${JSON.stringify(needle)}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe('Firebase Test Lab first-run PIN smoke', () => {
  it('drives iOS through New wallet and explicitly submits both 8-digit PIN stages', () => {
    const pin = swift.match(/let pin = "(\d+)"/)?.[1];
    expect(pin).toBe('24681024');

    const newWallet = indexOrFail(swift, 'app.buttons["New wallet"]');
    const setDigits = indexOrFail(swift, 'enterPin(app: app, digits: pin, stage: "set")');
    const setSubmit = indexOrFail(swift, 'submitPin(app: app, stage: "set")');
    const confirmDigits = indexOrFail(swift, 'enterPin(app: app, digits: pin, stage: "confirm")');
    const confirmSubmit = indexOrFail(swift, 'submitPin(app: app, stage: "confirm")');

    expect(newWallet).toBeLessThan(setDigits);
    expect(setDigits).toBeLessThan(setSubmit);
    expect(setSubmit).toBeLessThan(confirmDigits);
    expect(confirmDigits).toBeLessThan(confirmSubmit);
    expect(swift).toContain('app.buttons["Submit PIN"]');
  });

  it('uses an Android instrumentation smoke test to drive the custom PinPad explicitly', () => {
    expect(workflow).toContain('--type instrumentation');
    expect(workflow).toContain('--test "$TEST_GCS_URI"');
    expect(workflow).toContain('--test-targets "class com.veyrnox.app.FirebaseOnboardingSmokeTest"');
    expect(workflow).not.toContain('--robo-script');
    expect(workflow).not.toContain('--type robo');

    expect(androidInstrumentation).toContain('TARGET_PACKAGE = "com.veyrnox.app.firebase.testlab"');
    expect(androidInstrumentation).toContain('clickText("New wallet")');
    expect(androidInstrumentation).toContain('enterPin(PIN);');
    expect(androidInstrumentation).toContain('clickText("Submit PIN")');
    expect(androidInstrumentation).toContain('waitForAnyText("Help improve Veyrnox", "Created.")');
    expect(androidInstrumentation).toContain('By.text(text)');
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
    expect(workflow).toContain('name: veyrnox-firebase-test-test-apk');
    expect(workflow).toContain('gcloud storage cp artifacts/app-firebaseTest.apk "$APP_GCS_URI"');
    expect(workflow).toContain('gcloud storage cp artifacts/app-google-firebaseTest-androidTest.apk "$TEST_GCS_URI"');
    expect(workflow).toContain('--app "$APP_GCS_URI"');
    expect(workflow).toContain('--test "$TEST_GCS_URI"');
    expect(workflow).not.toContain('--app artifacts/app-release.aab');
  });

  it('builds a non-publishable release-hardened Firebase APK with matching RASP signing', () => {
    expect(ciWorkflow).toContain('build_firebase_test:');
    expect(ciWorkflow).toContain("inputs.build_firebase_test == true");
    expect(ciWorkflow).toContain("github.ref == 'refs/heads/main' && github.event_name == 'push'");
    expect(ciWorkflow).toContain('android-firebase-test:');
    expect(ciWorkflow).toContain('./gradlew assembleGoogleFirebaseTest');
    expect(ciWorkflow).toContain('assembleGoogleFirebaseTestAndroidTest');
    expect(ciWorkflow).toContain('name: veyrnox-firebase-test-apk');
    expect(ciWorkflow).toContain('name: veyrnox-firebase-test-test-apk');
    expect(ciWorkflow).not.toContain('./gradlew bundleFirebaseTest');

    expect(androidBuild).toContain('firebaseTest {');
    expect(androidBuild).toContain('testBuildType "firebaseTest"');
    expect(androidBuild).toContain('initWith release');
    expect(androidBuild).toContain('applicationIdSuffix ".firebase.testlab"');
    expect(androidBuild).toContain("androidTestImplementation 'androidx.test.uiautomator:uiautomator:2.3.0'");
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

  it('gates both staging store uploads on both Firebase device suites', () => {
    expect(workflow).toContain('publish_staging:');
    expect(workflow).toContain('publish-android-staging:');
    expect(workflow).toContain('publish-ios-staging:');
    expect(workflow.match(/needs: \[android-robo, ios-smoke\]/g)).toHaveLength(2);
    expect(workflow).toContain('name: veyrnox-staging-aab');
    expect(workflow).toContain('track: internal');
    expect(workflow).toContain('xcrun altool --upload-app');
    expect(workflow).toContain('npm run build:staging');
    expect(ciWorkflow).toContain('build_staging_release:');
    expect(ciWorkflow).toContain("'veyrnox-staging-aab'");
  });
});
