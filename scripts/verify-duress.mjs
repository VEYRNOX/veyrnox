// Throwaway verification harness for the duress/decoy flow (NOT a committed test).
// Exercises the REAL wallet-core modules + crypto, replicating the exact
// WalletProvider.unlock logic (primary -> duress fallback -> rethrow original).
import 'fake-indexeddb/auto';
import { webKeyStore } from '../src/wallet-core/keystore/web.js';
import { generateMnemonic } from '../src/wallet-core/mnemonic.js';
import { deriveEvmAccount } from '../src/wallet-core/derivation.js';
import { clearVault } from '../src/wallet-core/evm/vaultStore.js';
import { setDuressVault, tryDuressUnlock, clearDuressVault, hasDuressVault } from '../src/wallet-core/duress.js';

const REAL_PW = 'real-pin-2468';
const DURESS_PW = 'duress-pin-1357';

// Mirror WalletProvider.unlock exactly.
async function unlock(pw) {
  try {
    const m = await webKeyStore.unlock(pw);
    return { ok: true, decoy: false, addr: deriveEvmAccount(m, 0).address };
  } catch (primaryErr) {
    const d = await tryDuressUnlock(pw);
    if (d == null) return { ok: false, error: primaryErr.message };
    return { ok: true, decoy: true, addr: deriveEvmAccount(d, 0).address };
  }
}

await clearVault();
await clearDuressVault();

// Case A: no duress configured yet — wrong + (would-be duress) password both fail identically.
const beforeDuress = await unlock(DURESS_PW);

const realMnemonic = generateMnemonic(128);
await webKeyStore.createVault(realMnemonic, REAL_PW);
const realAddr = deriveEvmAccount(realMnemonic, 0).address;

const decoyMnemonic = generateMnemonic(128);
await setDuressVault(decoyMnemonic, DURESS_PW);
const decoyAddr = deriveEvmAccount(decoyMnemonic, 0).address;

const realRes = await unlock(REAL_PW);
const duressRes = await unlock(DURESS_PW);
const wrongRes = await unlock('totally-wrong-guess');
const wrongRes2 = await unlock('another-bad-guess');

const result = {
  realAddr, decoyAddr, addrsDiffer: realAddr !== decoyAddr,
  beforeDuress, realRes, duressRes, wrongRes,
  checks: {
    real_opens_real: realRes.ok && !realRes.decoy && realRes.addr === realAddr,
    duress_opens_decoy: duressRes.ok && duressRes.decoy && duressRes.addr === decoyAddr,
    duress_hides_real: duressRes.addr !== realAddr && decoyMnemonic !== realMnemonic,
    wrong_fails: !wrongRes.ok && !!wrongRes.error,
    // Deniability invariant: two DIFFERENT wrong guesses (vault + decoy present)
    // yield the IDENTICAL error, and the duress unlock above succeeds silently.
    wrong_error_identical: wrongRes.error === wrongRes2.error,
    decoy_configured: await hasDuressVault(),
  },
};
console.log(JSON.stringify(result, null, 2));
const allPass = Object.values(result.checks).every(Boolean) && result.addrsDiffer;
console.log('\nALL CHECKS PASS:', allPass);
process.exit(allPass ? 0 : 1);
