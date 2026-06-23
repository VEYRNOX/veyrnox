import { describe, it, expect, vi } from 'vitest';
import { provisionPinWallet } from '../pinOnboarding.js';

function makeDeps() {
  return {
    createWallet: vi.fn().mockResolvedValue('seed words'),
    provisionDeniabilityChaff: vi.fn().mockResolvedValue(undefined),
    setAuthModel: vi.fn(),
    discardIncompleteWallet: vi.fn().mockResolvedValue(undefined),
  };
}

describe('provisionPinWallet', () => {
  it('happy path: create -> chaff -> cohort, no teardown', async () => {
    const order = [];
    const deps = makeDeps();
    deps.createWallet.mockImplementation(async () => { order.push('create'); return 'seed'; });
    deps.provisionDeniabilityChaff.mockImplementation(async () => { order.push('chaff'); });
    deps.setAuthModel.mockImplementation(() => { order.push('cohort'); });

    await provisionPinWallet(deps, { pin: '123456' });

    expect(deps.createWallet).toHaveBeenCalledWith('123456');
    expect(order).toEqual(['create', 'chaff', 'cohort']);
    expect(deps.setAuthModel).toHaveBeenCalledWith('pin');
    expect(deps.discardIncompleteWallet).not.toHaveBeenCalled();
  });

  it('FAIL CLOSED: chaff throws -> tear down, do NOT mark cohort/salt, rethrow', async () => {
    const deps = makeDeps();
    deps.provisionDeniabilityChaff.mockRejectedValue(new Error('Invalid typed array length: 201327616'));

    await expect(provisionPinWallet(deps, { pin: '123456' })).rejects.toThrow('Invalid typed array length');

    expect(deps.createWallet).toHaveBeenCalledTimes(1);     // wallet was created...
    expect(deps.discardIncompleteWallet).toHaveBeenCalledTimes(1); // ...then torn down
    expect(deps.setAuthModel).not.toHaveBeenCalled();       // never marked PIN cohort
  });

  it('createWallet throws: no chaff, no teardown (nothing was created), rethrow', async () => {
    const deps = makeDeps();
    deps.createWallet.mockRejectedValue(new Error('create failed'));

    await expect(provisionPinWallet(deps, { pin: '123456' })).rejects.toThrow('create failed');

    expect(deps.provisionDeniabilityChaff).not.toHaveBeenCalled();
    expect(deps.discardIncompleteWallet).not.toHaveBeenCalled();
    expect(deps.setAuthModel).not.toHaveBeenCalled();
  });

  it('if teardown itself throws, the ORIGINAL chaff error still propagates', async () => {
    const deps = makeDeps();
    deps.provisionDeniabilityChaff.mockRejectedValue(new Error('chaff-fail'));
    deps.discardIncompleteWallet.mockRejectedValue(new Error('teardown-also-failed'));

    await expect(provisionPinWallet(deps, { pin: '123456' })).rejects.toThrow('chaff-fail');
  });
});
