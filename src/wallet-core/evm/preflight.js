// wallet-core/evm/preflight.js
//
// Pre-sign safety helpers shared by the native (send.js) and ERC-20
// (token-send.js) money paths, so the two cannot drift (they previously carried
// divergent copies — one even had a dead guard).

/**
 * Verify the RPC endpoint is ACTUALLY on the intended chain before signing.
 *
 * Uses a raw `eth_chainId` call, NOT provider.getNetwork(): the provider is
 * built with `staticNetwork: true` (see provider.js), under which getNetwork()
 * returns the constructor-pinned chainId WITHOUT querying the RPC — so a guard
 * built on it compares a value against itself and can never detect an endpoint
 * (or a user `setRpcUrl` override) pointed at the wrong chain. `provider.send`
 * always hits the RPC. Throws on mismatch OR an unreadable chainId (fail closed).
 */
export async function verifyLiveChainId(provider, expectedChainId) {
  let liveId;
  try {
    liveId = Number(BigInt(await provider.send('eth_chainId', [])));
  } catch (e) {
    throw new Error(`Could not read provider chainId: ${e.message}`);
  }
  if (liveId !== expectedChainId) {
    throw new Error(`Wrong network: provider chainId ${liveId}, expected ${expectedChainId}`);
  }
}

/**
 * Resolve the gas limit for THIS chain: estimate + 20% headroom, honoring a
 * larger user-supplied limit; on estimation failure keep whatever the caller's
 * overrides carried (or let ethers auto-fill). Mutates + returns `overrides`.
 *
 * Why it must run for BOTH native and token sends: a fee tier's `gasLimit` is
 * only a 21000 L1 simple-transfer DISPLAY hint. L2s need more intrinsic gas, and
 * an ERC-20 `transfer` needs ~45-65k — so signing a hinted 21000 gets rejected
 * ("intrinsic gas too low") or reverts out-of-gas and the send silently stalls.
 */
// Hard ceiling on gas limit accepted from the untrusted RPC (I5). A malicious or
// MITMed RPC returning estimateGas = block_gas_limit would otherwise produce a
// 30M-gas signed transaction that burns the entire fee on revert. ETH native
// transfers need 21k; ERC-20 transfers ~65k; complex DeFi interactions rarely
// exceed 500k. 1M is generous headroom without allowing fund-draining inflation.
const MAX_GAS_ESTIMATE = 1_000_000n;

export async function applyEstimatedGasLimit(provider, txRequest, overrides) {
  try {
    const raw = await provider.estimateGas(txRequest);
    // Clamp before applying headroom so a lying RPC cannot inflate the fee.
    const est = raw > MAX_GAS_ESTIMATE ? MAX_GAS_ESTIMATE : raw;
    const withHeadroom = (est * 12n) / 10n; // +20% so a tight estimate can't strand it
    overrides.gasLimit = overrides.gasLimit && overrides.gasLimit > withHeadroom
      ? overrides.gasLimit
      : withHeadroom;
  } catch {
    /* keep the hinted gasLimit, or ethers auto-fill if none was provided */
  }
  return overrides;
}
