import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Behavioural tripwire for scripts/patch-ios-firebase-observability.mjs.
//
// firebase-observability.test.js asserts the COMMITTED Package.swift names no
// Firebase dependency. That assertion is static, so it cannot see the patcher
// putting Firebase back on the next `npx cap sync ios` — which is exactly what
// the patcher did unconditionally until this gate landed. String-matching the
// script for the flag name would be the same class of inert guard the
// release-cert guard regressed into four times, so this runs the real script
// against a fixture and reads the file it wrote.

const SCRIPT = resolve(process.cwd(), 'scripts/patch-ios-firebase-observability.mjs');

// Minimal Package.swift carrying both anchors the patcher keys off.
const FIXTURE = `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CapApp-SPM",
    products: [
        .library(name: "CapApp-SPM", targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.0"),
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
            ]
        )
    ]
)
`;

let workdir;
const packageRelPath = 'ios/App/CapApp-SPM/Package.swift';

function runPatcher(env) {
  return execFileSync(process.execPath, [SCRIPT], {
    cwd: workdir,
    encoding: 'utf8',
    // Strip any ambient value so a developer's own shell cannot flip the result.
    env: { ...process.env, IOS_FIREBASE_OBSERVABILITY: undefined, ...env },
  });
}

function packageContents() {
  return readFileSync(join(workdir, packageRelPath), 'utf8');
}

describe('iOS Firebase sync hook', () => {
  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), 'veyrnox-fb-hook-'));
    mkdirSync(join(workdir, 'ios/App/CapApp-SPM'), { recursive: true });
    writeFileSync(join(workdir, packageRelPath), FIXTURE);
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it('injects nothing by default, so a plain `cap sync ios` leaves Package.swift clean', () => {
    const stdout = runPatcher({});

    const after = packageContents();
    expect(after).toBe(FIXTURE);
    expect(after).not.toContain('firebase-ios-sdk.git');
    expect(after).not.toContain('FirebaseCore');
    expect(after).not.toContain('FirebaseCrashlytics');
    expect(after).not.toContain('FirebasePerformance');
    expect(stdout).toContain('skipped');
  });

  it('does not treat an arbitrary truthy value as opt-in', () => {
    // Guards the exact-match check: `=== '1'`, not a loose truthiness test.
    for (const value of ['0', 'true', 'yes', '']) {
      writeFileSync(join(workdir, packageRelPath), FIXTURE);
      runPatcher({ IOS_FIREBASE_OBSERVABILITY: value });
      expect(packageContents()).toBe(FIXTURE);
    }
  });

  it('injects Firebase only when explicitly opted in', () => {
    // The other direction, so this file fails if the gate is ever hard-wired
    // shut and the Test Lab path silently stops working.
    runPatcher({ IOS_FIREBASE_OBSERVABILITY: '1' });

    const after = packageContents();
    expect(after).toContain('firebase-ios-sdk.git');
    expect(after).toContain('.product(name: "FirebaseCore", package: "firebase-ios-sdk")');
    expect(after).toContain('.product(name: "FirebaseCrashlytics", package: "firebase-ios-sdk")');
    expect(after).toContain('.product(name: "FirebasePerformance", package: "firebase-ios-sdk")');
  });

  it('is idempotent when opted in, so repeated syncs do not duplicate the entry', () => {
    runPatcher({ IOS_FIREBASE_OBSERVABILITY: '1' });
    const once = packageContents();
    runPatcher({ IOS_FIREBASE_OBSERVABILITY: '1' });

    expect(packageContents()).toBe(once);
    expect(once.match(/firebase-ios-sdk\.git/g)).toHaveLength(1);
  });
});
