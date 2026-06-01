// Throwaway verification harness for the stealth / hidden-wallets flow (NOT a
// committed test). Exercises the REAL wallet-core modules + crypto, replicating
// the exact WalletProvider.unlock routing (primary -> duress -> stealth ->
// rethrow original) and asserting the deniability invariants.
//
//   node scripts/verify-stealth.mjs
import 'fake-indexeddb/auto';
import { webKeyStore } from '../src/wallet-core/keystore/web.js';
import { generateMnemonic } from '../src/wallet-core/mnemonic.js';
import { deriveEvmAccount } from '../src/wallet-core/derivation.js';
import { clearVault } from '../src/wallet-core/evm/vaultStore.js';
import { clearDuressVault, tryDuressUnlock } from '../src/wallet-core/duress.js';
import {
  ensureStealthPool, createHiddenWallet, moveWalletToHidden, tryRevealHidden,
  hasStealthPool, wipeStealthPool,
} from '../src/wallet-core/stealth.js';

const REAL_PW = 'main-pass-2468';
const HIDDEN_A = 'hidden-key-9753';
const HIDDEN_B = 'second-hidden-2024';

// Mirror WalletProvider.unlock exactly: primary -> duress -> stealth -> rethrow.
async function unlock(pw) {
  try {
    const m = await webKeyStore.unlock(pw);
    return { ok: true, kind: 'real', addr: deriveEvmAccount(m, 0).address };
  } catch (primaryErr) {
    const d = await tryDuressUnlock(pw);
    if (d != null) return { ok: true, kind: 'decoy', addr: deriveEvmAccount(d, 0).address };
    const h = await tryRevealHidden(pw);
    if (h != null) return { ok: true, kind: 'hidden', addr: deriveEvmAccount(h, 0).address };
    return { ok: false, error: primaryErr.message };
  }
}

// Count how many of the 12 slots actually hold a real (decryptable) hidden
// wallet under a GIVEN set of secrets — the attacker does NOT have these, so this
// is only an oracle for the test, proving the count is hidden from storage alone.
// (A real attacker without the secrets cannot run this.)

await clearVault();
await clearDuressVault();
await wipeStealthPool();

// --- baseline: pool seeded for a device that has a wallet ---
const realMnemonic = generateMnemonic(128);
await webKeyStore.createVault(realMnemonic, REAL_PW);
const realAddr = deriveEvmAccount(realMnemonic, 0).address;
await ensureStealthPool();
const poolSeeded = await hasStealthPool();

// Before any hidden wallet: the reveal path must MISS for everything, and the
// pool is all-chaff (indistinguishable baseline).
const beforeHidden = await unlock(HIDDEN_A);

// --- create two hidden wallets under different secrets ---
const a = await createHiddenWallet(HIDDEN_A);
const b = await createHiddenWallet(HIDDEN_B);

// Re-create A with the SAME secret -> must be idempotent (same slot), not a 3rd.
const aAgain = await createHiddenWallet(HIDDEN_A);

// --- move an EXISTING wallet (own mnemonic) into hidden ---
const existingMnemonic = generateMnemonic(128);
const existingAddr = deriveEvmAccount(existingMnemonic, 0).address;
const moved = await moveWalletToHidden(existingMnemonic, 'move-secret-7777');
const movedReveal = await unlock('move-secret-7777');
// Clobber guard: a DIFFERENT wallet under the same secret must be refused.
let clobberRefused = false;
try { await moveWalletToHidden(generateMnemonic(128), 'move-secret-7777'); }
catch { clobberRefused = true; }

const realRes = await unlock(REAL_PW);
const hiddenARes = await unlock(HIDDEN_A);
const hiddenBRes = await unlock(HIDDEN_B);
const wrong1 = await unlock('totally-wrong-guess');
const wrong2 = await unlock('another-bad-guess');

// Raw storage inspection (what a forensic dump sees): enumerate the vault store.
// It should contain primary + a fixed pool of identical-shaped blobs. The blob
// SHAPE must be uniform (real and chaff indistinguishable by structure).
function dumpStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('veyrnox-vault', 1);
    req.onsuccess = () => {
      const db = req.result;
      const out = {};
      const st = db.transaction('vault', 'readonly').objectStore('vault');
      const keysReq = st.getAllKeys();
      const valsReq = st.getAll();
      keysReq.onsuccess = () => {
        valsReq.onsuccess = () => {
          keysReq.result.forEach((k, i) => { out[k] = valsReq.result[i]; });
          db.close();
          resolve(out);
        };
      };
      keysReq.onerror = () => reject(keysReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}
const store = await dumpStore();
const slotKeys = Object.keys(store).filter((k) => k.startsWith('vault:'));
const blobShapes = new Set(
  slotKeys.map((k) => Object.keys(store[k]).sort().join(','))
);

const result = {
  realAddr,
  hiddenA: a.address, hiddenB: b.address,
  checks: {
    pool_seeded_for_wallet_device: poolSeeded === true,
    // Before creating any hidden wallet, the secret reveals nothing (all chaff).
    no_reveal_before_creation: !beforeHidden.ok && !!beforeHidden.error,
    // Each secret opens ITS hidden wallet, with the right derived address.
    real_opens_real: realRes.ok && realRes.kind === 'real' && realRes.addr === realAddr,
    hiddenA_reveals_A: hiddenARes.ok && hiddenARes.kind === 'hidden' && hiddenARes.addr === a.address,
    hiddenB_reveals_B: hiddenBRes.ok && hiddenBRes.kind === 'hidden' && hiddenBRes.addr === b.address,
    // Re-creating with the same secret is idempotent (same address, same slot).
    recreate_same_secret_idempotent: aAgain.address === a.address && aAgain.slot === a.slot,
    // Hidden wallets are distinct real wallets, and neither equals the visible one.
    wallets_all_distinct:
      new Set([realAddr, a.address, b.address]).size === 3,
    // A hidden wallet is NEVER referenced by the visible/real session address.
    hidden_absent_from_real_session:
      realRes.addr !== a.address && realRes.addr !== b.address,
    // Wrong guesses fail with the IDENTICAL primary error (no tell, no leak of
    // how many hidden wallets exist).
    wrong_fails: !wrong1.ok && !wrong2.ok,
    wrong_error_identical: wrong1.error === wrong2.error,
    // Storage-level deniability: the pool exists as a fixed set of slots, and
    // every slot (real or chaff) has the SAME blob structure — a raw dump cannot
    // distinguish real wallets from chaff by shape.
    fixed_pool_present: slotKeys.length === 12,
    uniform_blob_shape: blobShapes.size === 1,
    // MOVE EXISTING: a user-supplied wallet is hidden and revealed by its secret
    // at the SAME exact address; a different wallet under the same secret is
    // refused (no clobber). The moved wallet is NOT the visible/real session.
    move_returns_existing_address: moved.address === existingAddr,
    move_reveals_existing_wallet: movedReveal.ok && movedReveal.kind === 'hidden' && movedReveal.addr === existingAddr,
    move_clobber_refused: clobberRefused === true,
    move_distinct_from_visible: existingAddr !== realAddr,
  },
};

console.log(JSON.stringify(result, null, 2));
const allPass = Object.values(result.checks).every(Boolean);
console.log('\nALL CHECKS PASS:', allPass);
process.exit(allPass ? 0 : 1);
