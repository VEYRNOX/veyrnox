import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the path-selection logic extracted from HardwareWalletContext.
// Import the module after setting the env stub each time.

describe('HardwareWalletContext BTC path selection', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uses testnet path when VITE_ALLOW_BTC_MAINNET is not set', async () => {
    vi.stubEnv('VITE_ALLOW_BTC_MAINNET', '');
    const { BTC_PATH, BTC_CURRENCY_LEDGER, BTC_COIN_TREZOR } = await import('@/context/HardwareWalletContext');
    expect(BTC_PATH).toBe("84'/1'/0'/0/0");
    expect(BTC_CURRENCY_LEDGER).toBe('bitcoin_testnet');
    expect(BTC_COIN_TREZOR).toBe('test');
  });

  it('uses mainnet path when VITE_ALLOW_BTC_MAINNET=true', async () => {
    vi.stubEnv('VITE_ALLOW_BTC_MAINNET', 'true');
    const { BTC_PATH, BTC_CURRENCY_LEDGER, BTC_COIN_TREZOR } = await import('@/context/HardwareWalletContext');
    expect(BTC_PATH).toBe("84'/0'/0'/0/0");
    expect(BTC_CURRENCY_LEDGER).toBe('bitcoin');
    expect(BTC_COIN_TREZOR).toBe('btc');
  });

  it('Trezor manifest email is not a personal address', async () => {
    vi.stubEnv('VITE_ALLOW_BTC_MAINNET', '');
    const { TREZOR_MANIFEST_EMAIL } = await import('@/context/HardwareWalletContext');
    expect(TREZOR_MANIFEST_EMAIL).not.toContain('21stclick');
    expect(TREZOR_MANIFEST_EMAIL).toMatch(/@veyrnox\./);
  });
});
