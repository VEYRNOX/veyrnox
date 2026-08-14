// Firebase Test Lab release-smoke regression guard.
//
// The device tests are authored in Swift / workflow YAML / Robo Script JSON, so
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
const roboScriptPath = '.github/testlab/android-pin-onboarding-robo-script.json';
const roboScript = JSON.parse(read(roboScriptPath));

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

  it('uses a Robo script to click the custom Android PinPad instead of inventing text fields', () => {
    expect(workflow).toContain(`--robo-script ${roboScriptPath}`);
    expect(workflow).not.toContain('--robo-directives');

    const clicks = roboScript
      .filter(({ eventType }) => eventType === 'VIEW_CLICKED')
      .map(({ visionText }) => visionText);
    const pin = '24681024';
    expect(clicks).toEqual([
      'New wallet',
      ...pin,
      'Continue',
      ...pin,
      'Continue',
    ]);
    expect(roboScript.some(({ eventType }) => eventType === 'VIEW_TEXT_CHANGED')).toBe(false);
    expect(roboScript).toContainEqual(expect.objectContaining({
      eventType: 'ASSERTION',
      contextDescriptor: expect.objectContaining({ visionText: 'Created.' }),
    }));
  });

  it('downloads the isolated Android Firebase artifact from CI for this exact commit', () => {
    expect(workflow).toContain('actions: read');
    expect(workflow).toContain('--commit "$SHA"');
    expect(workflow).toContain('run-id: ${{ steps.ci_run.outputs.run_id }}');
    expect(workflow).toContain('github-token: ${{ github.token }}');
    expect(workflow).toContain('.event == "workflow_dispatch"');
    expect(workflow).not.toContain('--event push');
    expect(workflow).not.toContain('dawidd6/action-download-artifact');
    expect(workflow).toContain('name: veyrnox-firebase-test-apk');
    expect(workflow).toContain('--app artifacts/app-firebaseTest.apk');
    expect(workflow).not.toContain('--app artifacts/app-release.aab');
  });

  it('builds a non-publishable release-hardened Firebase APK with matching RASP signing', () => {
    expect(ciWorkflow).toContain('build_firebase_test:');
    expect(ciWorkflow).toContain("inputs.build_firebase_test == true");
    expect(ciWorkflow).toContain("github.ref == 'refs/heads/main' && github.event_name == 'push'");
    expect(ciWorkflow).toContain('android-firebase-test:');
    expect(ciWorkflow).toContain('./gradlew assembleFirebaseTest');
    expect(ciWorkflow).toContain('name: veyrnox-firebase-test-apk');
    expect(ciWorkflow).not.toContain('./gradlew bundleFirebaseTest');

    expect(androidBuild).toContain('firebaseTest {');
    expect(androidBuild).toContain('initWith release');
    expect(androidBuild).toContain('applicationIdSuffix ".firebase.testlab"');
    expect(androidBuild).toContain("project.findProperty('FIREBASE_TEST_CERT_SHA256')");
    expect(androidBuild).toContain("it.name == 'assembleFirebaseTest'");
    expect(androidBuild).toContain('cert.equalsIgnoreCase(uploadSha)');
    expect(androidBuild).toContain("it.name == 'bundleFirebaseTest'");
    expect(androidBuild).toContain('enabled = false');
  });

  it('runs Firebase without re-signing and preserves useful per-axis diagnostics', () => {
    expect(workflow).toContain('--no-resign');
    expect(workflow).toContain('MATRIX_ID');
    expect(workflow).toContain('testing.googleapis.com/v1/projects/${PROJECT_ID}/testMatrices/${MATRIX_ID}');
    expect(workflow).toContain('invalidMatrixDetails');
    expect(workflow).toContain('infrastructureFailure');
    expect(workflow).toContain('${{ github.run_id }}-${{ github.run_attempt }}');
  });

  it('supports a manual exact-SHA Android Firebase run without enabling Play publication', () => {
    expect(workflow).toContain('platform:');
    expect(workflow).toContain("inputs.platform == 'android'");
    expect(workflow).toContain("vars.IOS_FIREBASE_SIGNING_READY == 'true'");
  });
});
