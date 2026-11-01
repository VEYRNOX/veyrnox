import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../TransactionHistory.jsx'), 'utf8');

describe('TransactionHistory pending EVM replacement wiring', () => {
  it('offers speed-up/cancel only for pending EVM-family activity rows', () => {
    // Bound each window by structure: the component definition ends where the
    // next top-level function begins; the usage ends at the review dialog.
    const defStart = source.indexOf('function TxDetailDialog(');
    const defEnd = source.indexOf('\nfunction normalizeLocalSend(');
    expect(defStart).toBeGreaterThan(-1);
    expect(defEnd).toBeGreaterThan(defStart);
    const definition = source.slice(defStart, defEnd);
    expect(definition).toContain('canReplace &&');
    expect(definition).toContain('REPLACEMENT_ACTION.SPEED_UP');
    expect(definition).toContain('REPLACEMENT_ACTION.CANCEL');

    const useStart = source.indexOf('<TxDetailDialog\n');
    const useEnd = source.indexOf('<Dialog\n        open={!!replacementReview}');
    expect(useStart).toBeGreaterThan(-1);
    expect(useEnd).toBeGreaterThan(useStart);
    const usage = source.slice(useStart, useEnd);
    expect(usage).toContain('selected.status === "pending"');
    expect(usage).toContain('selected.family === "evm"');
    expect(usage).toContain('selected.family === "erc20"');
    expect(usage).toContain('!denySession');
  });

  it('shows the reviewed max fee and both bumped EIP-1559 rates before signing', () => {
    expect(source).toContain('Maximum network fee');
    expect(source).toContain('prepared.maxNetworkFeeWei');
    expect(source).toContain('prepared.txRequest.maxFeePerGas');
    expect(source).toContain('prepared.txRequest.maxPriorityFeePerGas');
    expect(source).toContain('Both fee rates are raised by at least 10%');
  });

  it('passes the live step-up check and transient key callback to the replacement chokepoint', () => {
    const callStart = source.indexOf('return replacePendingEvmTransaction({');
    expect(callStart).toBeGreaterThan(-1);
    const call = source.slice(callStart, callStart + 500);
    expect(call).toContain('isReauthRequired: wallet.isSendReauthRequired');
    expect(call).toContain('withPrivateKey: (signer) => wallet.withPrivateKey(account.index, signer)');
  });
});

