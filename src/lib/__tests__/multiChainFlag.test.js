// lib/__tests__/multiChainFlag.test.js
import { describe, it, expect, afterEach, vi } from 'vitest';
import { isMultiChainRowsEnabled } from '../multiChainFlag.js';

describe('isMultiChainRowsEnabled — Phase 1b per-chain rows, off by default', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('is OFF when the env is unset', () => {
    vi.stubEnv('VITE_MULTI_CHAIN_ROWS', undefined);
    expect(isMultiChainRowsEnabled()).toBe(false);
  });

  it('is ON only for the exact string "1"', () => {
    vi.stubEnv('VITE_MULTI_CHAIN_ROWS', '1');
    expect(isMultiChainRowsEnabled()).toBe(true);
  });

  it('is OFF for any other value ("0", "true", 1)', () => {
    vi.stubEnv('VITE_MULTI_CHAIN_ROWS', '0');
    expect(isMultiChainRowsEnabled()).toBe(false);
    vi.stubEnv('VITE_MULTI_CHAIN_ROWS', 'true');
    expect(isMultiChainRowsEnabled()).toBe(false);
  });
});
