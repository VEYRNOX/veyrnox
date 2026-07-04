# WalletConnect Security Controls Audit — 2026-07-04

## Summary

All five documented security controls (C3 RASP gate, H7 chain binding, H8 address binding, M9 gas cap, M11 session expiry) are **BUILT, unit-tested, and correctly implemented**. No security gaps found. However, **two documentation discrepancies** were discovered:

1. **H7 chain binding:** Code rejects no-chainId domains (fail-closed), but CLAUDE.md claims they "sign through" (backwards-compat). Code is stricter and correct.
2. **Error code naming:** Code emits `CHAIN_ID_MISMATCH` (with underscore), CLAUDE.md lists `CHAINID_MISMATCH` (no underscore). Cosmetic but affects log grepping.

## Controls Status

| Control | File | Implementation | Test Coverage | Status |
|---------|------|---|---|---|
| **C3** — RASP pre-sign gate | `src/sign-gate/presign.js:42` | `presignGate()` called first in all handlers | `WalletConnectProvider.c3.test.jsx` + `presignGate.test.js` | ✅ BUILT |
| **H7** — EIP-712 chain binding | `src/lib/WalletConnectProvider.jsx:192-217` | Resolves session CAIP-2 vs domain.chainId, rejects mismatch | `WalletConnectProvider.c3.test.jsx:226-284` | ✅ BUILT |
| **H8** — personal_sign address binding | `src/lib/WalletConnectProvider.jsx:151-174` | Validates param order (EIP-1474 vs MetaMask), rejects if neither is wallet address | `WalletConnectProvider.personalSign.test.js` | ✅ BUILT |
| **M9** — 1M gas cap | `src/lib/WalletConnectProvider.jsx:58-265` | Clamps dApp gas and estimates to 1M limit | `WalletConnectProvider.gasCap.test.js` | ✅ BUILT |
| **M11** — Session expiry gate | `src/lib/WalletConnectProvider.jsx:110-386` | `assertSessionLive` runs first, rejects if expired/absent | `WalletConnectProvider.sessionExpiry.test.js` | ✅ BUILT |

## Bonus Finding: H-NEW-B (Step-up Re-auth)

**Sixth guard** not listed in CLAUDE.md but present in code:
- `isSendReauthRequired()` `WalletConnectProvider.jsx:275-277` — checks auth window age
- Runs second (after M11 session liveness) — enforces recent re-auth before signing
- Security benefit: prevents stale auth windows from signing WC requests

## Key Findings

### 1. H7 Behavior Change (Documentation Gap)

**CLAUDE.md clause:**
> "No-chainId domain signs through (EIP-712 backwards-compat)"

**Actual code behavior:**
```javascript
// WalletConnectProvider.jsx:210-217
if (sessionChainId && domainChainId && sessionChainId !== domainChainId) {
  // CHAIN_ID_MISMATCH reject
}
if (!domainChainId) {
  // ALSO rejects as CHAIN_ID_MISMATCH
}
```

**Confirmed by tests:**
- `WalletConnectProvider.c3.test.jsx:269-283` — "rejects CHAIN_ID_MISMATCH when domain.chainId is absent (fail closed)"
- `WalletConnectProvider.presignGate.test.js:290-301` — comment says "supersedes the earlier 'backwards compatible / skip the check' behaviour"

**Reality:** Code is stricter (fail-closed) than documented. This is a **documentation drift**, not a security bug. Code is correct; CLAUDE.md should be updated.

### 2. Error Code Naming

**CLAUDE.md:** `CHAINID_MISMATCH`  
**Code:** `CHAIN_ID_MISMATCH` (line 211)

Grep logs for the wrong string → no match. Minor but worth fixing for consistency.

### 3. H8 Duplication Risk

Pure helper functions `resolvePersonalSignMessage` and `assertPersonalSignAddress` are unit-tested but **not called** by the live handler. The logic is reimplemented inline at `WalletConnectProvider.jsx:151-174`. Both implementations currently agree, but this duplication is a drift risk.

**Recommendation:** Either use the pure exports in the live handler, or remove the unused pure helpers to avoid bifurcation.

### 4. txLevel Neutralized for WC

`presignGate` is called with `txLevel=null` for all WalletConnect signing (vs. in-app Send which scores tx risk). **Intended design:** WalletConnect only uses RASP tier gating, not tx-risk scoring. Confirm this is the intended security posture.

## Architecture

**Three-layer enforcement pattern:**

1. **Session liveness** (M11): `assertSessionLive` — first check, fails closed on expired/absent session
2. **Step-up re-auth** (H-NEW-B): `isSendReauthRequired` — recent-auth window gate
3. **RASP gating** (C3): `presignGate` — environment tier rejection
4. **Method-specific validation** (H7, H8): per-method checks (chain binding, address binding)
5. **Key access** (`withPrivateKey`) — only reached if all above pass

All guards use fail-closed rejection + `rejectRequest` on the wire.

## Recommendations

1. **Update CLAUDE.md §WalletConnect** to reflect the actual H7 behavior (fail-closed on no-chainId, not backwards-compat sign-through)
2. **Fix error code naming** to use `CHAIN_ID_MISMATCH` consistently in documentation
3. **Resolve H8 duplication** — consolidate the two implementations or remove unused exports
4. **Document H-NEW-B** (step-up re-auth) in CLAUDE.md as a sixth guard in the WalletConnect stack

## Test Coverage

All five controls are covered:
- Unit tests (pure helpers): `presignGate.test.js`, `gasCap.test.js`, `sessionExpiry.test.js`, etc.
- Integration tests: `WalletConnectProvider.c3.test.jsx` (all handlers, all guards)
- Structural tests: `wcfixes.test.js` guards against silent reordering of guards

No test gaps. Coverage is thorough and behavioral.

## Verified by

- Manual code read of `src/lib/WalletConnectProvider.jsx` (499 lines)
- Test file inspection across 6 test suites
- Cross-reference with `src/wallet-core/evm/walletconnect/router.js` and `session.js`

**Status:** BUILT, unit-tested, no security gaps. Documentation needs minor updates for accuracy.
