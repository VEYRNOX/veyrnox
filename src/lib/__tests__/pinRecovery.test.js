import { describe, it, expect, vi } from 'vitest';
import { provisionPinRecovery } from '../pinRecovery.js';

// A set of injected WalletProvider/wallet-core collaborators, each a spy. The
// helper is pure orchestration over these; we assert the SEQUENCE and the §4
// security invariant (recovery lands in the PIN cohort, never password, and is
// fail-closed) without standing up a React/IndexedDB harness.
function makeDeps(overrides = {}) {
  return {
    importWallet: vi.fn().mockResolvedValue(undefined),
    setDuressPin: vi.fn().mockResolvedValue({ mnemonic: 'decoy', address: '0xdecoy' }),
    setPanicPin: vi.fn().mockResolvedValue(undefined),
    setAuthModel: vi.fn(),
    getOrCreateDeviceSalt: vi.fn().mockReturnValue(new Uint8Array(16)),
    ...overrides,
  };
}

const PARAMS = {
  seed: 'test test test test test test test test test test test junk',
  realPin: '111111',
  duressPin: '222222',
  panicPin: '333333',
};

describe('provisionPinRecovery — §4 recovery re-provisions into the PIN cohort', () => {
  it('imports the seed under the real PIN and provisions the decoy under the duress PIN', async () => {
    const deps = makeDeps();
    await provisionPinRecovery(deps, PARAMS);
    expect(deps.importWallet).toHaveBeenCalledWith(PARAMS.seed, PARAMS.realPin);
    expect(deps.setDuressPin).toHaveBeenCalledWith(PARAMS.duressPin);
  });

  it('selects the PIN cohort and NEVER the password cohort (the §0/§4 leak fix)', async () => {
    const deps = makeDeps();
    await provisionPinRecovery(deps, PARAMS);
    expect(deps.setAuthModel).toHaveBeenCalledWith('pin');
    expect(deps.setAuthModel).not.toHaveBeenCalledWith('password');
  });

  it('seeds the deterministic-decoy device salt so Option A is live (no error oracle)', async () => {
    const deps = makeDeps();
    await provisionPinRecovery(deps, PARAMS);
    expect(deps.getOrCreateDeviceSalt).toHaveBeenCalled();
  });

  it('sets an optional panic PIN when one is supplied', async () => {
    const deps = makeDeps();
    await provisionPinRecovery(deps, PARAMS);
    expect(deps.setPanicPin).toHaveBeenCalledWith(PARAMS.panicPin);
  });

  it('skips the panic PIN when omitted (deterministic default, not forced)', async () => {
    const deps = makeDeps();
    await provisionPinRecovery(deps, { ...PARAMS, panicPin: '' });
    expect(deps.setPanicPin).not.toHaveBeenCalled();
  });

  it('tolerates a panic-PIN failure without aborting recovery (best-effort, like onboarding)', async () => {
    const deps = makeDeps({ setPanicPin: vi.fn().mockRejectedValue(new Error('panic slot busy')) });
    await expect(provisionPinRecovery(deps, PARAMS)).resolves.not.toThrow();
    // The cohort still flips — a flaky optional slot must not strand the user on password.
    expect(deps.setAuthModel).toHaveBeenCalledWith('pin');
  });

  it('flips the cohort only AFTER a successful import (success-only ordering)', async () => {
    const order = [];
    const deps = makeDeps({
      importWallet: vi.fn().mockImplementation(async () => { order.push('import'); }),
      setAuthModel: vi.fn().mockImplementation(() => { order.push('authModel'); }),
    });
    await provisionPinRecovery(deps, PARAMS);
    expect(order).toEqual(['import', 'authModel']);
  });

  it('FAILS CLOSED: a failed import leaves the device untouched — no cohort flip, no slots', async () => {
    const deps = makeDeps({ importWallet: vi.fn().mockRejectedValue(new Error('Invalid recovery phrase')) });
    await expect(provisionPinRecovery(deps, PARAMS)).rejects.toThrow(/Invalid recovery phrase/);
    expect(deps.setAuthModel).not.toHaveBeenCalled();
    expect(deps.setDuressPin).not.toHaveBeenCalled();
    expect(deps.setPanicPin).not.toHaveBeenCalled();
    expect(deps.getOrCreateDeviceSalt).not.toHaveBeenCalled();
  });
});
