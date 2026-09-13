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
    expect(warm).toBeGreaterThan(build);
    expect(run).toBeGreaterThan(warm);
    const step = workflow.slice(warm, run);
    expect(step).toMatch(/simctl launch "\$IOS_SIMULATOR_UDID" com\.veyrnox\.app/);
    expect(step).toMatch(/simctl terminate "\$IOS_SIMULATOR_UDID" com\.veyrnox\.app/);
  });
});
