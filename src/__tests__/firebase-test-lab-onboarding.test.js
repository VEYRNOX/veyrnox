// Firebase Test Lab release-smoke regression guard.
//
// The device tests are authored in Swift / workflow YAML / Robo Script JSON, so
// Vitest cannot execute them locally. This static guard pins the pieces that
// previously drifted independently: Veyrnox's eight-digit explicit-submit
// PinPad, the fresh-install "New wallet" route, and the exact-SHA AAB handoff.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const swift = read('ios/App/AppUITests/AppUITests.swift');
const workflow = read('.github/workflows/firebase-test-lab.yml');
const ciWorkflow = read('.github/workflows/ci.yml');
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

  it('downloads the Android release artifact from CI for this exact commit', () => {
    expect(workflow).toContain('actions: read');
    expect(workflow).toContain('--commit "$SHA"');
    expect(workflow).toContain('run-id: ${{ steps.ci_run.outputs.run_id }}');
    expect(workflow).toContain('github-token: ${{ github.token }}');
    expect(workflow).toContain('.event == "workflow_dispatch"');
    expect(workflow).not.toContain('--event push');
    expect(workflow).not.toContain('dawidd6/action-download-artifact');
  });

  it('supports a manual exact-SHA Android Firebase run without enabling Play publication', () => {
    expect(ciWorkflow).toContain('build_release:');
    expect(ciWorkflow).toContain("github.event_name == 'workflow_dispatch' && inputs.build_release == true");
    expect(workflow).toContain('platform:');
    expect(workflow).toContain("inputs.platform == 'android'");
    expect(workflow).toContain("vars.IOS_FIREBASE_SIGNING_READY == 'true'");
  });
});
