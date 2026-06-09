import { describe, it, expect, vi } from 'vitest';
import { provisionPinRecovery } from '../pinRecovery.js';

function makeDeps() {
  return {
    importWallet: vi.fn().mockResolvedValue(undefined),
    provisionDeniabilityChaff: vi.fn().mockResolvedValue(undefined),
    setAuthModel: vi.fn(),
    getOrCreateDeviceSalt: vi.fn().mockReturnValue(new Uint8Array(16)),
  };
}
const PARAMS = { seed: 'test test test test test test test test test test test junk', realPin: '123456' };

describe('provisionPinRecovery', () => {
  it('imports under the new PIN, provisions chaff, selects the PIN cohort, seeds salt', async () => {
    const deps = makeDeps();
    await provisionPinRecovery(deps, PARAMS);
    expect(deps.importWallet).toHaveBeenCalledWith(PARAMS.seed, PARAMS.realPin);
    expect(deps.provisionDeniabilityChaff).toHaveBeenCalledTimes(1);
    expect(deps.setAuthModel).toHaveBeenCalledWith('pin'); // never 'password'
    expect(deps.getOrCreateDeviceSalt).toHaveBeenCalledTimes(1);
  });

  it('fails closed: a bad import aborts BEFORE any cohort/slot change', async () => {
    const deps = makeDeps();
    deps.importWallet.mockRejectedValue(new Error('invalid phrase'));
    await expect(provisionPinRecovery(deps, PARAMS)).rejects.toThrow('invalid phrase');
    expect(deps.provisionDeniabilityChaff).not.toHaveBeenCalled();
    expect(deps.setAuthModel).not.toHaveBeenCalled();
    expect(deps.getOrCreateDeviceSalt).not.toHaveBeenCalled();
  });

  it('selects the PIN cohort AFTER provisioning (ordering)', async () => {
    const order = [];
    const deps = makeDeps();
    deps.importWallet.mockImplementation(async () => { order.push('import'); });
    deps.provisionDeniabilityChaff.mockImplementation(async () => { order.push('chaff'); });
    deps.setAuthModel.mockImplementation(() => { order.push('cohort'); });
    await provisionPinRecovery(deps, PARAMS);
    expect(order).toEqual(['import', 'chaff', 'cohort']);
  });
});
