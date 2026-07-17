import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
const HS = readFileSync(join(process.cwd(), 'src/rasp/useRaspArtifact.js'), 'utf8');
describe('#1107 -- RASP bypass guard', () => {
  it('runtime console.error guard exists', () => {
    expect(/import\.meta\.env\.PROD/.test(HS)).toBe(true);
    expect(/BYPASS_RASP[\s\S]{0,200}import\.meta\.env\.PROD[\s\S]{0,200}console\.error/.test(HS)).toBe(true);
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
