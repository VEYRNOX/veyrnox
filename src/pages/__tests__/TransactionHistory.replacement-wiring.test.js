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
    expect(source).not.toContain('Maximum network fee');
    expect(source).toContain('Maximum execution gas fee');
    expect(source).toContain('also charges an L1 data fee on top of this');
    expect(source).toContain('OP_STACK_NETWORKS = new Set(["optimism", "optimismSepolia"])');
    expect(source).toContain('prepared.liveBaseFeePerGas');
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

  // Structural windows: each handler runs from its `const name = ` to the next
  // top-level `\n  const ` declaration in the component body.
  const handler = (name) => {
    const start = source.indexOf(`\n  const ${name} = `);
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('\n  const ', start + 1);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  };

  it('does not mark the original replaced at broadcast time; only a receipt does', () => {
    const broadcast = handler('broadcastReplacement');
    expect(broadcast).not.toContain('status: "replaced"');
    expect(broadcast).toContain('replaces_tx_hash: target.hash');
    expect(broadcast).toContain('trackReplacementOutcome({ result, target, replacementRowId })');
    const track = handler('trackReplacementOutcome');
    expect(track).toMatch(/outcome === "replacement_won"\) \{\s*if \(target\.localId\) updates\.push\(\[target\.localId, \{ status: "replaced" \}\]\)/);
    const originalWon = track.slice(track.indexOf('outcome === "original_won"'), track.indexOf('outcome === "other_won"'));
    expect(originalWon).toContain('updates.push([target.localId, { status }])');
    expect(originalWon).toContain('updates.push([replacementRowId, { status: "dropped" }])');
  });

  it('caps wrong step-up credentials and locks, without counting verifier failures', () => {
    expect(source).toContain('const REPLACEMENT_REAUTH_CAP = 5;');
    const reauth = handler('submitReplacementReauth');
    const brickedAt = reauth.indexOf('if (result?.bricked)');
    const countAt = reauth.indexOf('replacementReauthAttemptsRef.current + 1');
    expect(brickedAt).toBeGreaterThan(-1);
    expect(countAt).toBeGreaterThan(brickedAt);
    expect(reauth).toContain('if (n >= REPLACEMENT_REAUTH_CAP)');
    expect(reauth).toContain('wallet.lock()');
    const catchBlock = reauth.slice(reauth.indexOf('} catch {'));
    expect(catchBlock).not.toContain('replacementReauthAttemptsRef');
  });

  it('cancels a pending verification or 2FA continuation when the review is dismissed', () => {
    const reauth = handler('submitReplacementReauth');
    const staleCheck = reauth.indexOf('if (generation !== replacementGenerationRef.current) return;');
    const continueAt = reauth.indexOf('runReviewedReplacement(review, generation)');
    expect(staleCheck).toBeGreaterThan(-1);
    expect(continueAt).toBeGreaterThan(staleCheck);
    const run = handler('runReviewedReplacement');
    const mutateAt = run.indexOf('broadcastReplacement.mutate(review)');
    const innerCheck = run.lastIndexOf('if (generation !== replacementGenerationRef.current) return;', mutateAt);
    expect(innerCheck).toBeGreaterThan(run.indexOf('requireTwoFactor('));
    expect(handler('dismissReplacementReview')).toContain('replacementGenerationRef.current += 1');
    expect(source).toContain('useEffect(() => () => { replacementGenerationRef.current += 1; }, []);');
    expect(source).toContain('if (!open && !broadcastReplacement.isPending) dismissReplacementReview();');
  });

  it('only says "nothing was signed" for known pre-sign rejections', () => {
    const msg = handler('safeReplacementError');
    expect(msg).toContain('if (isReplacementPreSignRejection(err))');
    expect(msg).toContain('return REPLACEMENT_UNCERTAIN_MESSAGE;\n  };');
    expect(source).toContain('setReplacementError(safeReplacementError(err, "sign"))');
  });
});
