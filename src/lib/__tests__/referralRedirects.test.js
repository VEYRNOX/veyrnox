import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const redirects = readFileSync(path.resolve(here, '../../../public/_redirects'), 'utf8');

describe('referral share edge redirect', () => {
  it('preserves the referral code for a cold Pages request', () => {
    expect(redirects).toMatch(/^\/r\/\*\s+\/\?ref=:splat\s+302$/m);
    expect(redirects).not.toContain('/?ref=:code');
  });
});
