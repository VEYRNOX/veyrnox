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
    expect(step).toMatch(/listing="\$\(bounded \d+ xcrun simctl spawn "\$IOS_SIMULATOR_UDID" launchctl list\)" \|\| return 2/);
    expect(step).toContain(String.raw`grep -q 'UIKitApplication:com\.veyrnox\.app\[' <<<"$listing"`);
    // No `… | grep -q`. This step runs under `bash -e` without pipefail, so
    // that pipe is correct today; the ban keeps the check correct if pipefail
    // is ever enabled, where an early grep exit is SIGPIPE (141) and would
    // read as "not running" while the app is up. Scoped to code lines: the
    // step's own comment quotes the retired pipe, and an absence check must
    // not fire on the documentation of what it removed.
    const stepCode = step.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
    expect(stepCode).not.toMatch(/\|\s*grep\s+-q/);
    // After terminate: poll; anything but a definite "not running" (still
    // running OR a failed/timed-out query) reboots the simulator, then a
    // definite "not running" (state 1) is required or the step fails.
    const terminate = at('simctl terminate "$IOS_SIMULATOR_UDID" com.veyrnox.app');
    const poll = at('wait_until_gone && state=0 || state=$?', terminate);
    const notGone = at('if [ "$state" -ne 1 ]; then', poll);
    const reboot = at('xcrun simctl bootstatus "$IOS_SIMULATOR_UDID" -b', notGone);
    const recheck = at('app_state && state=0 || state=$?', reboot);
    const requireGone = at('if [ "$state" -ne 1 ]; then', recheck);
    at('exit 1', requireGone);
  });

  // #2543 runs 34753802443 / 34754922127: a simctl call (screenshot, terminate
  // or the launchd query) hung with the app healthy, and the step died on its
  // own timeout with no diagnosis. Every simctl call in the warm-up must carry
  // a bound so a hang becomes a handled failure.
  it('bounds every simctl call in the warm-up step', () => {
    const warm = workflow.indexOf('- name: Warm up the app on the simulator');
    const run = workflow.indexOf('- name: Run AppUITests');
    expect(warm).toBeGreaterThanOrEqual(0);
    expect(run).toBeGreaterThan(warm);
    const code = workflow
      .slice(warm, run)
      .split('\n')
      .filter((line) => !/^\s*#/.test(line));
    expect(code.join('\n')).toContain(`bounded() { perl -e 'alarm shift; exec @ARGV or exit 127' "$@"; }`);
    const calls = code.filter((line) => /\bxcrun simctl\b/.test(line));
    // 7 since run 34777838366: the separate `simctl boot` in recovery was
    // folded into `bootstatus -b` (see the next test).
    expect(calls.length).toBeGreaterThanOrEqual(7);
    for (const line of calls) {
      expect(line, `unbounded simctl call: ${line.trim()}`).toMatch(/\bbounded \d+ xcrun simctl\b/);
    }
  });

  // #2543 run 34777838366: CoreSimulator wedged, so shutdown timed out and a
  // separate `simctl boot` then failed on a device still Booted/Shutting Down.
  // A failed shutdown must restart CoreSimulatorService, and recovery must boot
  // via `bootstatus -b` (boots only if needed), never a bare `simctl boot`.
  it('recovers a wedged CoreSimulator instead of booting a still-booted device', () => {
    const warm = workflow.indexOf('- name: Warm up the app on the simulator');
    const run = workflow.indexOf('- name: Run AppUITests');
    const code = workflow
      .slice(warm, run)
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    expect(code).not.toMatch(/xcrun simctl boot "\$IOS_SIMULATOR_UDID"/);
    const shutdown = code.indexOf('if ! bounded 30 xcrun simctl shutdown "$IOS_SIMULATOR_UDID"; then');
    const restart = code.indexOf('killall -9 com.apple.CoreSimulator.CoreSimulatorService', shutdown);
    const boot = code.indexOf('xcrun simctl bootstatus "$IOS_SIMULATOR_UDID" -b', restart);
    expect(shutdown).toBeGreaterThan(0);
    expect(restart).toBeGreaterThan(shutdown);
    expect(boot).toBeGreaterThan(restart);
  });
});
