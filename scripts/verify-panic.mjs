// Throwaway verification harness for the PANIC WIPE flow (NOT a committed test).
// ⚠️ DESTRUCTIVE primitive. Exercises the REAL wallet-core modules + crypto,
// replicating the exact WalletProvider.unlock routing (primary -> PANIC ->
// duress -> stealth -> rethrow) and asserting the wipe invariants.
//
//   node scripts/verify-panic.mjs
import 'fake-indexeddb/auto';
import { webKeyStore } from '../src/wallet-core/keystore/web.js';
import { generateMnemonic } from '../src/wallet-core/mnemonic.js';
import { deriveEvmAccount } from '../src/wallet-core/derivation.js';
import { clearVault } from '../src/wallet-core/evm/vaultStore.js';
import { setDuressVault, hasDuressVault, tryDuressUnlock, clearDuressVault } from '../src/wallet-core/duress.js';
import {
  ensureStealthPool, createHiddenWallet, tryRevealHidden, wipeStealthPool,
} from '../src/wallet-core/stealth.js';
import {
  setPanicVault, hasPanicVault, tryPanicUnlock, panicWipeLocal, inspectKeyMaterial,
} from '../src/wallet-core/panic.js';

const REAL_PW = 'main-pass-2468';
const DURESS_PW = 'duress-pass-1357';
const HIDDEN_SECRET = 'hidden-key-9753';
const PANIC_PW = 'burn-everything-0000';

// Mirror WalletProvider.unlock EXACTLY: primary -> panic(wipe) -> duress ->
// stealth -> rethrow. Returns the outcome kind so we can assert routing + wipe.
async function unlock(pw) {
  try {
    const m = await webKeyStore.unlock(pw);
    return { ok: true, kind: 'real', addr: deriveEvmAccount(m, 0).address };
  } catch (primaryErr) {
    if (await tryPanicUnlock(pw)) {
      await panicWipeLocal();
      return { ok: false, kind: 'panic-wiped', error: primaryErr.message };
    }
    const d = await tryDuressUnlock(pw);
    if (d != null) return { ok: true, kind: 'decoy', addr: deriveEvmAccount(d, 0).address };
    const h = await tryRevealHidden(pw);
    if (h != null) return { ok: true, kind: 'hidden', addr: deriveEvmAccount(h, 0).address };
    return { ok: false, kind: 'miss', error: primaryErr.message };
  }
}

// --- fresh slate ---
await clearVault();
await clearDuressVault();
await wipeStealthPool();
await panicWipeLocal();

// --- populate a device with EVERY kind of key material ---
const realMnemonic = generateMnemonic(128);
const realAddr = deriveEvmAccount(realMnemonic, 0).address;
await webKeyStore.createVault(realMnemonic, REAL_PW);
await ensureStealthPool();
await setDuressVault(generateMnemonic(128), DURESS_PW);
const hidden = await createHiddenWallet(HIDDEN_SECRET);
await setPanicVault(PANIC_PW);

const beforeReport = await inspectKeyMaterial();

// The real PIN opens the real wallet; the panic PIN does NOT (wrong password for
// the primary), so it routes to the panic branch only on the failure path.
const realRes = await unlock(REAL_PW);
const duressRes = await unlock(DURESS_PW);
const hiddenRes = await unlock(HIDDEN_SECRET);
const wrongRes = await unlock('totally-wrong-guess');

// Now fire the panic PIN through the SAME unlock routing.
const panicRes = await unlock(PANIC_PW);
const afterReport = await inspectKeyMaterial();

// After the wipe, every previously-opening secret must now MISS.
const realAfter = await unlock(REAL_PW);
const duressAfter = await unlock(DURESS_PW);
const hiddenAfter = await unlock(HIDDEN_SECRET);
const panicConfiguredAfter = await hasPanicVault();
const duressConfiguredAfter = await hasDuressVault();

const result = {
  realAddr,
  hiddenAddr: hidden.address,
  before: { keys: beforeReport.indexedDbKeys.length, clean: beforeReport.clean },
  after: { keys: afterReport.indexedDbKeys.length, clean: afterReport.clean },
  checks: {
    // BEFORE the wipe everything routes correctly (panic does NOT shadow them).
    real_opens_real: realRes.ok && realRes.kind === 'real' && realRes.addr === realAddr,
    duress_opens_decoy: duressRes.ok && duressRes.kind === 'decoy',
    hidden_opens_hidden: hiddenRes.ok && hiddenRes.kind === 'hidden' && hiddenRes.addr === hidden.address,
    wrong_misses: !wrongRes.ok && wrongRes.kind === 'miss',
    // Panic PIN populated the right amount of key material first (primary +
    // secondary + tertiary + 12 stealth slots = 15).
    populated_before: beforeReport.vaultBlobCount === 15 && beforeReport.clean === false,
    // The panic PIN routes to the wipe (a wrong password can never reach it).
    panic_pin_wipes: !panicRes.ok && panicRes.kind === 'panic-wiped',
    // The wipe surfaces the SAME generic primary error (no "wiped!" tell).
    panic_error_is_generic: panicRes.error === wrongRes.error,
    // AFTER the wipe NOTHING recoverable remains.
    clean_after_wipe: afterReport.clean === true && afterReport.vaultBlobCount === 0,
    // And every secret that previously opened a wallet now misses.
    real_gone: !realAfter.ok,
    duress_gone: !duressAfter.ok && !duressConfiguredAfter,
    hidden_gone: !hiddenAfter.ok,
    panic_marker_gone: panicConfiguredAfter === false,
  },
};

console.log(JSON.stringify(result, null, 2));
const allPass = Object.values(result.checks).every(Boolean);
console.log('\nALL CHECKS PASS:', allPass);
process.exit(allPass ? 0 : 1);
