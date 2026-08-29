import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../');
const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const dependabot = readFileSync(resolve(repoRoot, '.github/dependabot.yml'), 'utf8');

describe('Digital Shield signing-path dependency pins', () => {
  it('declares the UR parsing packages as exact direct dependencies', () => {
    expect(pkg.dependencies['@keystonehq/keystone-sdk']).toBe('0.12.3');
    expect(pkg.dependencies['@keystonehq/bc-ur-registry']).toBe('0.8.0');
    expect(pkg.dependencies['@keystonehq/bc-ur-registry-eth']).toBe('0.22.1');
    expect(pkg.dependencies['@keystonehq/bc-ur-registry-sol']).toBe('0.9.5');
    expect(pkg.dependencies['@ngraveio/bc-ur']).toBe('1.1.13');
    expect(pkg.dependencies['@scure/base']).toBe('1.2.6');
  });

  it('keeps the signing-path packages out of grouped Dependabot bumps', () => {
    expect(dependabot).toMatch(/dependency-name: "@keystonehq\/keystone-sdk"/);
    expect(dependabot).toMatch(/dependency-name: "@keystonehq\/bc-ur-registry"/);
    expect(dependabot).toMatch(/dependency-name: "@keystonehq\/bc-ur-registry-eth"/);
    expect(dependabot).toMatch(/dependency-name: "@keystonehq\/bc-ur-registry-sol"/);
    expect(dependabot).toMatch(/dependency-name: "@ngraveio\/bc-ur"/);
    expect(dependabot).toMatch(/dependency-name: "@scure\/base"/);
  });
});
