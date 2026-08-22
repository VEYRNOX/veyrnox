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

  it('uses the next unused store numbers confirmed in the consoles', () => {
    expect(androidBuild).toContain('versionCode 10');
    expect(androidBuild).toContain('versionName "1.0.1"');
    expect(iosProject.match(/CURRENT_PROJECT_VERSION = 22;/g)).toHaveLength(2);
    expect(iosProject.match(/MARKETING_VERSION = 1\.0\.1;/g)).toHaveLength(2);
  });
});
