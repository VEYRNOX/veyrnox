import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEND_CRYPTO = resolve(__dirname, '../../../pages/SendCrypto.jsx');
const NETWORKS = resolve(__dirname, '../networks.js');

const sendSrc = readFileSync(SEND_CRYPTO, 'utf8');
const networksSrc = readFileSync(NETWORKS, 'utf8');

describe('H-C: single source of truth for mainnet gating', () => {
  it('SendCrypto.jsx does NOT read VITE_ALLOW_MAINNET (no runtime env gate)', () => {
    expect(sendSrc).not.toContain('VITE_ALLOW_MAINNET');
  });

  it('SendCrypto.jsx derives the network from the ALLOW_MAINNET constant', () => {
    expect(sendSrc).toMatch(/\bALLOW_MAINNET\b/);
    // and imports it from the networks module (the authority)
    expect(sendSrc).toMatch(/import\s*\{[^}]*\bALLOW_MAINNET\b[^}]*\}\s*from\s*["']@\/wallet-core\/evm\/networks["']/);
  });

  it('ALLOW_MAINNET is exported exactly once from networks.js (the authority)', () => {
    const matches = networksSrc.match(/export\s+const\s+ALLOW_MAINNET\b/g) || [];
    expect(matches.length).toBe(1);
  });
});
