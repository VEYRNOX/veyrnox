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

  // #2543 experiment (2026-09-14): the warm-up step (launch + wait + terminate,
  // #2544-#2560) was removed after it measured no benefit: the entry-tile
  // timeout it targeted did not recur without it, and the warm-up itself hung
  // CoreSimulator in most control runs. Scoped to step names so the workflow's
  // comment explaining the removal cannot satisfy or break the check.
  it('runs the tests straight after build-for-testing, with no warm-up launch', () => {
    const steps = [...workflow.matchAll(/^\s*- name: (.+)$/gm)].map((m) => m[1].trim());
    const build = steps.indexOf('Build for testing');
    const run = steps.indexOf('Run AppUITests');
    expect(build, 'build step not found').toBeGreaterThanOrEqual(0);
    expect(run, 'run step not found').toBe(build + 1);
    expect(steps.some((n) => /warm/i.test(n))).toBe(false);
    const code = workflow.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    expect(code).not.toMatch(/simctl launch "\$IOS_SIMULATOR_UDID"/);
    expect(code).not.toContain('warmup-after-120s.png');
  });
});
