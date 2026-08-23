import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

const androidRoot = read('android/build.gradle');
const androidApp = read('android/app/build.gradle');
const androidManifest = read('android/app/src/main/AndroidManifest.xml');
const androidActivity = read('android/app/src/main/java/com/veyrnox/app/MainActivity.java');
const iosPackage = read('ios/App/CapApp-SPM/Package.swift');
const iosBootstrapPath = 'ios/App/CapApp-SPM/Sources/CapApp-SPM/FirebaseObservability.swift';
const iosHasBootstrap = existsSync(resolve(process.cwd(), iosBootstrapPath));
const iosDelegate = read('ios/App/App/AppDelegate.swift');
const iosTests = read('ios/App/AppUITests/AppUITests.swift');
const ci = read('.github/workflows/ci.yml');
const firebaseWorkflow = read('.github/workflows/firebase-test-lab.yml');
const configFetcher = read('.github/scripts/fetch-firebase-config.sh');
const packagePatcher = read('scripts/patch-ios-firebase-observability.mjs');
const packageJson = read('package.json');

describe('Firebase staging observability', () => {
  it('adds current Crashlytics and Performance SDK/plugin wiring on Android', () => {
    expect(androidRoot).toContain('firebase-crashlytics-gradle:3.0.7');
    expect(androidRoot).toContain('firebase:perf-plugin:2.0.2');
    expect(androidApp).toContain("firebase-bom:34.16.0");
    expect(androidApp).toContain("firebase-crashlytics'");
    expect(androidApp).toContain("firebase-perf'");
    expect(androidApp).not.toContain('firebase-analytics');
  });

  it('keeps production disabled and explicitly enables staging/Test Lab', () => {
    expect(androidApp).toContain("project.findProperty('FIREBASE_OBSERVABILITY_ENABLED')");
    expect(androidApp).toContain(
      'buildConfigField "boolean", "FIREBASE_OBSERVABILITY_ENABLED", "${firebaseObservabilityEnabled}"',
    );
    expect(androidApp).toContain(
      'buildConfigField "boolean", "FIREBASE_OBSERVABILITY_SMOKE", "false"',
    );
    expect(androidApp).toContain(
      'buildConfigField "boolean", "FIREBASE_OBSERVABILITY_SMOKE", "true"',
    );
    expect(androidManifest).toContain('firebase_crashlytics_collection_enabled');
    expect(androidManifest).toContain('firebase_performance_collection_enabled');
    // F-1 Gap 3: the HARD Performance kill switch. `..._enabled=false` can be
    // undone by setPerformanceCollectionEnabled(true) at runtime; `_deactivated`
    // cannot. Must be true everywhere EXCEPT the Test Lab variant, so assert the
    // placeholder is wired, negated from the opt-in flag, and overridden to
    // false in firebaseTest only.
    expect(androidManifest).toContain('firebase_performance_collection_deactivated');
    expect(androidManifest).toContain('${firebasePerformanceDeactivated}');
    expect(androidApp).toContain(
      'manifestPlaceholders.firebasePerformanceDeactivated = !firebaseObservabilityEnabled',
    );
    const firebaseTestVariant = androidApp.slice(androidApp.indexOf('firebaseTest {'));
    expect(firebaseTestVariant).toContain(
      'manifestPlaceholders.firebasePerformanceDeactivated = false',
    );
    expect(androidActivity).toContain('BuildConfig.FIREBASE_OBSERVABILITY_ENABLED');
    // F-1: Test Lab is the only channel — no "staging" build_channel branch.
    expect(androidActivity).toContain('"build_channel", "firebase_test_lab"');
    expect(androidActivity).not.toContain(': "staging"');
    expect(androidActivity).toContain('VEYRNOX_FIREBASE_NONFATAL_SMOKE');
    expect(androidActivity).toContain('newTrace("staging_launch_smoke")');
    expect(androidActivity).not.toContain('setUserId');
  });

  it('strips Firebase from the iOS app while keeping the CI tripwires', () => {
    expect(iosPackage).not.toContain('firebase-ios-sdk.git');
    expect(iosPackage).not.toContain('FirebaseCore');
    expect(iosPackage).not.toContain('FirebaseCrashlytics');
    expect(iosPackage).not.toContain('FirebasePerformance');
    expect(iosPackage).not.toContain('FirebaseAnalytics');
    expect(iosHasBootstrap).toBe(false);
    expect(iosDelegate).not.toContain('configureIfEnabled()');
    expect(iosTests).not.toContain('--firebase-observability-smoke');
    expect(iosTests).not.toContain('GoogleService-Info.plist');
    expect(iosTests).not.toContain('Crashlytics');
    expect(packageJson).toContain('"capacitor:sync:after"');
    expect(packagePatcher).toContain('firebase-ios-sdk.git');
    expect(packagePatcher).toContain('FirebaseCrashlytics');
    expect(packagePatcher).toContain('FirebasePerformance');
  });

  it('fetches a Firebase config ONLY for the isolated Test Lab builds', () => {
    expect(configFetcher).toContain('gcloud auth print-access-token');
    expect(configFetcher).toContain('configFileContents');
    expect(ci).toContain('1:567659013773:android:166961ac09b49c5f8864c4');
    expect(ci).toContain('com.veyrnox.app.firebase.testlab');
    expect(firebaseWorkflow).toContain('1:567659013773:ios:dcdda7378e804f388864c4');
    expect(firebaseWorkflow).toContain('actions: write');
    expect(firebaseWorkflow).toContain('gh workflow run ci.yml');
    expect(firebaseWorkflow).toContain('-f build_firebase_test=true');
    expect(firebaseWorkflow).toContain('EXPECTED_EVENT:');

    // ── F-1 (2026-08-15): Test Lab-only ──────────────────────────────────
    // The store-bound jobs must NOT fetch a Firebase config or enable
    // collection. Firebase ships only in the isolated firebaseTest APK
    // (distinct applicationId, bundle task disabled) and the ios-smoke job.
    const androidStoreJob = ci.slice(
      ci.indexOf('  android-release:'),
      ci.indexOf('  android-firebase-test:'),
    );
    const iosStoreJob = firebaseWorkflow.slice(
      firebaseWorkflow.indexOf('  publish-ios-staging:'),
    );
    expect(androidStoreJob).not.toContain('fetch-firebase-config.sh');
    expect(androidStoreJob).not.toContain('-PFIREBASE_OBSERVABILITY_ENABLED=');
    expect(iosStoreJob).not.toContain('fetch-firebase-config.sh');
    expect(iosStoreJob).not.toContain('VEYRNOX_FIREBASE_OBSERVABILITY=YES');
    expect(iosStoreJob).not.toContain('--firebase-observability-smoke');
    expect(iosStoreJob).not.toContain('Crashlytics/upload-symbols');

    // The artifact-level tripwires (F-1 Gap 1). These inspect the BUILT
    // output, which is the assertion that actually keeps a release clean —
    // the string checks here only stop the tripwires being silently deleted,
    // which is this repo's documented failure mode (release-cert guard, ×4).
    expect(androidStoreJob).toContain('Firebase production-clean guard');
    expect(androidStoreJob).toContain('android/app/google-services.json');
    expect(iosStoreJob).toContain('GoogleService-Info.plist');
    expect(iosStoreJob).toContain('Firebase must be Test Lab-only');

    // Test Lab itself still fetches its config and uploads symbols.
    const iosSmokeJob = firebaseWorkflow.slice(
      firebaseWorkflow.indexOf('  ios-smoke:'),
      firebaseWorkflow.indexOf('  publish-ios-staging:'),
    );
    expect(iosSmokeJob).toContain('fetch-firebase-config.sh');
    // The smoke launch argument is supplied by the XCUITest, not the workflow
    // (asserted against iosTests above) — which is exactly why the staging job
    // above can be checked for its absence.
    expect(iosSmokeJob).toContain('DEBUG_INFORMATION_FORMAT=dwarf-with-dsym');
    expect(iosSmokeJob).toContain('Crashlytics/upload-symbols');
  });
});
