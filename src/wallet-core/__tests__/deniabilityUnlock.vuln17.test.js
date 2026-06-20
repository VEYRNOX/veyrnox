import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('deniabilityUnlock VULN-17 accepted residual documentation', () => {
  it('source file contains the VULN-17 ACCEPTED RESIDUAL marker', () => {
    const src = readFileSync(
      resolve(__dirname, '../deniabilityUnlock.js'),
      'utf-8',
    );
    expect(src).toContain('VULN-17 ACCEPTED RESIDUAL');
  });
});
