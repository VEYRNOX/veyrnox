// Static release-contract guard for the staging mobile packages. These checks
// pin the exact owner-requested feature set and the next unused store numbers so
// a later workflow edit cannot silently fall back to a production/default Vite
// build or omit one of the two recovery entry surfaces.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const stagingEnv = read('.env.staging');
const advisor = read('src/components/SecurityAdvisor.jsx');
const threatStore = read('src/lib/threatIntelStore.js');
const entryTiles = read('src/components/EntryTiles.jsx');
const walletEntry = read('src/components/WalletEntry.jsx');
const androidBuild = read('android/app/build.gradle');
const iosProject = read('ios/App/App.xcodeproj/project.pbxproj');

describe('staging mobile release contract', () => {
  it('turns on the Transak staging entry without embedding a client API key', () => {
    expect(stagingEnv).toContain('VITE_BUY_ENABLED=true');
    expect(stagingEnv).toContain('VITE_TRANSAK_ENVIRONMENT=STAGING');
    expect(stagingEnv).not.toMatch(/^VITE_TRANSAK_API_KEY=\S+/m);
  });

  it('checks the local threat seed first and retains the owner-authorized OFAC seed override', () => {
    const seedCheck = advisor.indexOf('lookupThreatSync(detected.address)');
    const remoteCheck = advisor.indexOf('await screenTransaction({', seedCheck);
    expect(seedCheck).toBeGreaterThanOrEqual(0);
    expect(remoteCheck).toBeGreaterThan(seedCheck);
    expect(threatStore).toContain("category: 'ofac_sanctioned'");
    expect(threatStore).toContain('owner override 2026-08-13');
  });

  it('exposes Recovery Shares from both onboarding hero variants', () => {
    expect(entryTiles).toContain('path: "shares"');
    expect(entryTiles).toContain('label: "Recovery Shares"');
    expect(walletEntry).toContain('Have 2 of 3 recovery shares?');
    expect(walletEntry).toContain('navigate("/onboarding/restore-shares")');
  });

  it('pins the store numbers of the live 1.0.2 release', () => {
    // Both numbers are CONSUMED, not "next unused": Play versionCode 57 went live
    // 2026-09-23 and Apple build 8 was approved 2026-09-24 (READY_FOR_SALE, read
    // 2026-09-26). Bump both, and this pin, before the next upload — Apple also
    // needs a new version record, since 1.0.2 is Ready for Distribution.
    // Matched with the trailing newline so a later bump to 570+ cannot satisfy
    // this pin by prefix — 'versionCode 57' is a substring of 'versionCode 570'.
    expect(androidBuild).toContain('versionCode 57\n');
    expect(androidBuild).toContain('versionName "1.0.2"');
    expect(iosProject.match(/CURRENT_PROJECT_VERSION = 8;/g)).toHaveLength(2);
    expect(iosProject.match(/MARKETING_VERSION = 1\.0\.2;/g)).toHaveLength(2);
  });
});
