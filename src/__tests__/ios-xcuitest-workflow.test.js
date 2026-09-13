import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(path.resolve(here, '../../.github/workflows/ios-xcuitest-smoke.yml'), 'utf8');

describe('iOS XCUITest smoke workflow', () => {
  it('boots a specific simulator and reuses its UDID for build and test', () => {
    expect(workflow).toMatch(/name: Boot iPhone simulator/);
    expect(workflow).toMatch(/simctl bootstatus "\$simulator_id" -b/);
    expect(workflow).toMatch(/IOS_SIMULATOR_UDID=\$simulator_id/);
    expect(workflow.match(/platform=iOS Simulator,id=\$IOS_SIMULATOR_UDID/g)).toHaveLength(2);
  });

  // #2543: the first launch of a fresh install took ~95 s to paint, which the
  // create test's 45 s entry-tile budget cannot absorb. The warm-up pays that
  // one-time cost before the test step; it only helps if it runs after the
  // build (the .app must exist) and before the tests.
  it('warms the app up between build-for-testing and the test run', () => {
    const build = workflow.indexOf('- name: Build for testing');
    const warm = workflow.indexOf('- name: Warm up the app on the simulator');
    const run = workflow.indexOf('- name: Run AppUITests');
    // indexOf returns -1 for a missing marker, which would satisfy a bare
    // ordering comparison — assert presence first.
    for (const [name, index] of [['build', build], ['warm-up', warm], ['run', run]]) {
      expect(index, `${name} step not found`).toBeGreaterThanOrEqual(0);
    }
    expect(warm).toBeGreaterThan(build);
    expect(run).toBeGreaterThan(warm);
    const step = workflow.slice(warm, run);
    // Same lifecycle as the tests, which both launch with this flag.
    expect(step).toMatch(/simctl launch "\$IOS_SIMULATOR_UDID" com\.veyrnox\.app --uitest-fresh-install/);
    expect(step).toMatch(/simctl terminate "\$IOS_SIMULATOR_UDID" com\.veyrnox\.app/);
    // Hand-off is verified, not assumed. Pinned as STRUCTURE, not just the
    // pattern: a leftover helper with its call removed must not pass (#2545
    // review).
    const at = (needle, from = 0) => {
      const i = step.indexOf(needle, from);
      expect(i, `missing ${JSON.stringify(needle)}`).toBeGreaterThanOrEqual(0);
      return i;
    };
    // Listing captured before matching, anchored pattern, and a query failure
    // is its own outcome (2), never "not running".
    expect(step).toMatch(/listing="\$\(xcrun simctl spawn "\$IOS_SIMULATOR_UDID" launchctl list\)" \|\| return 2/);
    expect(step).toContain(String.raw`grep -q 'UIKitApplication:com\.veyrnox\.app\[' <<<"$listing"`);
    // No `… | grep -q`: under the runner's pipefail an early grep exit is
    // SIGPIPE (141) and reads as "not running" while the app is up.
    expect(step).not.toMatch(/\|\s*grep\s+-q/);
    // After terminate: poll, fail on a query error, reboot if still running,
    // then require a definite "not running" (state 1).
    const terminate = at('simctl terminate "$IOS_SIMULATOR_UDID" com.veyrnox.app');
    const poll = at('wait_until_gone && state=0 || state=$?', terminate);
    const queryFail = at('if [ "$state" -eq 2 ]; then', poll);
    at('exit 1', queryFail);
    const reboot = at('xcrun simctl bootstatus "$IOS_SIMULATOR_UDID" -b', queryFail);
    const recheck = at('app_state && state=0 || state=$?', reboot);
    const requireGone = at('if [ "$state" -ne 1 ]; then', recheck);
    at('exit 1', requireGone);
  });
});
