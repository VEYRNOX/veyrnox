import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const packagePath = 'ios/App/CapApp-SPM/Package.swift';
const firebasePackage =
  '        .package(url: "https://github.com/firebase/firebase-ios-sdk.git", exact: "12.12.1"),';
const firebaseProducts = [
  '                .product(name: "FirebaseCore", package: "firebase-ios-sdk"),',
  '                .product(name: "FirebaseCrashlytics", package: "firebase-ios-sdk"),',
  '                .product(name: "FirebasePerformance", package: "firebase-ios-sdk"),',
];

// F-1: the iOS app ships WITHOUT Firebase. `Package.swift` is tracked, and
// firebase-observability.test.js asserts the committed copy names no Firebase
// dependency at all.
//
// This patcher used to run unconditionally on every `npx cap sync ios`, so it
// injected that dependency straight back into the tracked file. The two only
// coexisted because nobody happened to commit after a sync — and building after
// one re-resolves SPM, writing Firebase's whole transitive tree into
// Package.resolved (18 pins instead of 5). An archive taken that way links
// Crashlytics and Performance, which are native-layer and consult neither
// lib/consent.js nor isDeniabilityOrDemoActive(), so a crash inside a
// decoy/duress session would transmit to Google (I3).
//
// Injection is therefore opt-in. Set IOS_FIREBASE_OBSERVABILITY=1 only for an
// isolated Firebase Test Lab iOS build, never for a build a human installs, and
// never commit the resulting Package.swift / Package.resolved.
const ENABLED = process.env.IOS_FIREBASE_OBSERVABILITY === '1';

if (!ENABLED) {
  console.log(
    '[patch-ios-firebase-observability] skipped — iOS ships without Firebase (F-1). ' +
      'Set IOS_FIREBASE_OBSERVABILITY=1 to inject for a Test Lab build.',
  );
} else {
  if (!existsSync(packagePath)) {
    console.error(`[patch-ios-firebase-observability] missing ${packagePath}`);
    process.exit(1);
  }

  let source = readFileSync(packagePath, 'utf8');

  if (!source.includes('firebase-ios-sdk.git')) {
    const anchorRegex = / {8}\.package\(url: "https:\/\/github\.com\/ionic-team\/capacitor-swift-pm\.git", exact: "\d+\.\d+\.\d+"\),/;
    const match = source.match(anchorRegex);
    if (!match) {
      console.error('[patch-ios-firebase-observability] Capacitor package anchor changed');
      process.exit(1);
    }
    source = source.replace(match[0], `${match[0]}\n${firebasePackage}`);
  }

  if (!source.includes('product(name: "FirebaseCore"')) {
    const anchor = '                .product(name: "Cordova", package: "capacitor-swift-pm"),';
    if (!source.includes(anchor)) {
      console.error('[patch-ios-firebase-observability] target dependency anchor changed');
      process.exit(1);
    }
    source = source.replace(anchor, `${anchor}\n${firebaseProducts.join('\n')}`);
  }

  writeFileSync(packagePath, source);
  console.log('[patch-ios-firebase-observability] Firebase packages present ✓');
}
