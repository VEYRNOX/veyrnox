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
});
