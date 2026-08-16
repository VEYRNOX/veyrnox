import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const packagePath = 'ios/App/CapApp-SPM/Package.swift';
const firebasePackage =
  '        .package(url: "https://github.com/firebase/firebase-ios-sdk.git", exact: "12.12.1"),';
const firebaseProducts = [
  '                .product(name: "FirebaseCore", package: "firebase-ios-sdk"),',
  '                .product(name: "FirebaseCrashlytics", package: "firebase-ios-sdk"),',
  '                .product(name: "FirebasePerformance", package: "firebase-ios-sdk"),',
];

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
