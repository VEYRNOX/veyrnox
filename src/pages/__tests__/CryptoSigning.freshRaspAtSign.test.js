import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../CryptoSigning.jsx'), 'utf8');

describe('CryptoSigning — fresh RASP at sign time', () => {
  it('imports getFreshRaspArtifact instead of relying on a mount-time hook', () => {
    expect(src).toMatch(/getFreshRaspArtifact/);
    expect(src).not.toMatch(/useRaspArtifact/);
  });

  it('awaits getFreshRaspArtifact inside the sign-time gate helper', () => {
    const start = src.indexOf('const raspGuardAllowsSigning = async');
    const end = src.indexOf('const signMsg = async', start);
    const region = src.slice(start, end);
    expect(region).toMatch(/await\s+getFreshRaspArtifact\s*\(\s*\)/);
  });
});
