// #2575: Cloudflare Pages deploys main as the public web wallet. That bundle
// must be a VITE_RELEASE build: demoClient removes the ?demo/localStorage path
// at compile time only when this flag is set.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/deploy-preview.yml'),
  'utf8',
);

describe('production Pages build (#2575)', () => {
  it('uses the release build for main and preserves the staging build for previews', () => {
    const buildStep = workflow.slice(
      workflow.indexOf('- name: Build'),
      workflow.indexOf('- name: Compute deploy branch slug'),
    );

    expect(buildStep).toMatch(
      /if \[ "\$\{\{ github\.ref \}\}" = "refs\/heads\/main" \]; then[\s\S]*?npm run build:release[\s\S]*?else[\s\S]*?npm run build:staging/,
    );
  });
});
