import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
const HS = readFileSync(join(process.cwd(), 'src/rasp/useRaspArtifact.js'), 'utf8');
describe('#1107 -- RASP bypass guard', () => {
  it('runtime hard-fail guard exists', () => {
    // Hardened 2026-08: was console.error only, now throws at module init so
    // a bypass-in-prod build cannot silently disable RASP.
    expect(/import\.meta\.env\.PROD/.test(HS)).toBe(true);
    expect(/BYPASS_RASP[\s\S]{0,200}import\.meta\.env\.PROD[\s\S]{0,200}throw\s+new\s+Error/.test(HS)).toBe(true);
  });
  it('check:rasp-bypass wired into package.json', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    expect(pkg.scripts['check:rasp-bypass']).toContain('check-rasp-bypass');
  });
  it('CI script passes', () => {
    expect(execSync('node scripts/check-rasp-bypass.mjs', { cwd: process.cwd(), encoding: 'utf8' })).toContain('PASS');
  });
  it('ci.yml includes check:rasp-bypass', () => {
    expect(readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8')).toContain('check:rasp-bypass');
  });
});
