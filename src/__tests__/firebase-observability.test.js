import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

const androidRoot = read('android/build.gradle');
const androidApp = read('android/app/build.gradle');
const androidManifest = read('android/app/src/main/AndroidManifest.xml');
const androidActivity = read('android/app/src/main/java/com/veyrnox/app/MainActivity.java');
const iosPackage = read('ios/App/CapApp-SPM/Package.swift');
const iosBootstrap = read(
  'ios/App/CapApp-SPM/Sources/CapApp-SPM/FirebaseObservability.swift',
);
const iosDelegate = read('ios/App/App/AppDelegate.swift');
const iosTests = read('ios/App/AppUITests/AppUITests.swift');
const xcodeProject = read('ios/App/App.xcodeproj/project.pbxproj');
const ci = read('.github/workflows/ci.yml');
const firebaseWorkflow = read('.github/workflows/firebase-test-lab.yml');
const configFetcher = read('.github/scripts/fetch-firebase-config.sh');
const androidFirebaseConfig = read('.github/firebase/android/google-services.json');
const iosFirebaseConfig = read('.github/firebase/ios/com.veyrnox.app/GoogleService-Info.plist');
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
    expect(androidActivity).toContain('BuildConfig.FIREBASE_OBSERVABILITY_ENABLED');
    expect(androidActivity).toContain('? "firebase_test_lab" : "staging"');
    expect(androidActivity).toContain('VEYRNOX_FIREBASE_NONFATAL_SMOKE');
    expect(androidActivity).toContain('newTrace("staging_launch_smoke")');
    expect(androidActivity).not.toContain('setUserId');
  });

  it('adds iOS staging collection with a separate Test Lab smoke gate', () => {
    expect(iosPackage).toContain('firebase-ios-sdk.git", exact: "12.12.1"');
    expect(iosPackage).toContain('FirebaseCrashlytics');
    expect(iosPackage).toContain('FirebasePerformance');
    expect(iosPackage).not.toContain('FirebaseAnalytics');
    expect(iosBootstrap).toContain('--firebase-observability-smoke');
    expect(iosBootstrap).toContain('VeyrnoxFirebaseObservabilityEnabled');
    expect(iosBootstrap).toContain('isTestLab ? "firebase_test_lab" : "staging"');
    expect(iosBootstrap).toContain('VEYRNOX_FIREBASE_NONFATAL_SMOKE');
    expect(iosBootstrap).toContain('startTrace(name: "staging_launch_smoke")');
    expect(iosBootstrap).not.toContain('setUserID');
    expect(iosDelegate).toContain('configureIfEnabled()');
    expect(iosTests).toContain('--firebase-observability-smoke');
    expect(xcodeProject).toContain('Install Firebase config if supplied');
    expect(packageJson).toContain('"capacitor:sync:after"');
    expect(packagePatcher).toContain('firebase-ios-sdk.git');
    expect(packagePatcher).toContain('FirebaseCrashlytics');
    expect(packagePatcher).toContain('FirebasePerformance');
  });

  it('fetches exact Firebase configs for Test Lab and explicitly gated staging builds', () => {
    expect(configFetcher).toContain('gcloud auth print-access-token');
    expect(configFetcher).toContain('configFileContents');
    expect(configFetcher).toContain('projects/${project_id}/${collection}/${firebase_app_id}/config');
    expect(configFetcher).toContain('projects/-/${collection}/${firebase_app_id}/config');
    expect(ci).toContain('.github/firebase/android/google-services.json');
    expect(ci).toContain('com.veyrnox.app.firebase.testlab');
    expect(ci).toContain('-PFIREBASE_OBSERVABILITY_ENABLED=');
    expect(firebaseWorkflow).toContain('.github/firebase/ios/com.veyrnox.app/GoogleService-Info.plist');
    expect(androidFirebaseConfig).toContain('1:567659013773:android:166961ac09b49c5f8864c4');
    expect(androidFirebaseConfig).toContain('1:567659013773:android:2f04cc2942faba1f8864c4');
    expect(androidFirebaseConfig).toContain('com.veyrnox.app.firebase.testlab');
    expect(iosFirebaseConfig).toContain('1:567659013773:ios:dcdda7378e804f388864c4');
    expect(iosFirebaseConfig).toContain('com.veyrnox.app');
    expect(firebaseWorkflow).toContain('VEYRNOX_FIREBASE_OBSERVABILITY=YES');
    expect(firebaseWorkflow).toContain('actions: write');
    expect(firebaseWorkflow).toContain('gh workflow run ci.yml');
    expect(firebaseWorkflow).toContain('-f build_firebase_test=true');
    expect(firebaseWorkflow).toContain('-f build_staging_release="$PUBLISH_STAGING"');
    expect(firebaseWorkflow).toContain('EXPECTED_EVENT:');
    expect(firebaseWorkflow).toContain('DEBUG_INFORMATION_FORMAT=dwarf-with-dsym');
    expect(firebaseWorkflow).toContain('Crashlytics/upload-symbols');

    const androidStoreJob = ci.slice(
      ci.indexOf('  android-release:'),
      ci.indexOf('  android-firebase-test:'),
    );
    const iosStoreJob = firebaseWorkflow.slice(
      firebaseWorkflow.indexOf('  publish-ios-staging:'),
    );
    expect(androidStoreJob).toContain('inputs.build_staging_release == true');
    expect(androidStoreJob).toContain('.github/firebase/android/google-services.json');
    expect(iosStoreJob).toContain('.github/firebase/ios/com.veyrnox.app/GoogleService-Info.plist');
    expect(iosStoreJob).not.toContain('--firebase-observability-smoke');
  });
});
