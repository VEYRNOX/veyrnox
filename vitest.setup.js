// vitest.setup.js
import '@testing-library/jest-dom';
//
// jsdom installs its OWN realm's typed-array constructors as globals. ethers v6
// computes hashes via node:crypto (createHash), which returns Node Buffers whose
// prototype chain points at Node's *native* Uint8Array. Under jsdom, ethers'
// internal `value instanceof Uint8Array` checks then fail cross-realm, breaking
// BIP-44 derivation (Mnemonic.fromPhrase -> sha256). Restore the native
// constructor so cross-realm byte arrays validate correctly. This affects only
// the test environment; the browser/app uses real WebCrypto + native arrays.
import { Buffer } from 'node:buffer';

const NativeUint8Array = Object.getPrototypeOf(Buffer.prototype).constructor;
if (globalThis.Uint8Array !== NativeUint8Array) {
  globalThis.Uint8Array = NativeUint8Array;
}

// localStorage shim for broken host environments. Node >= 22 ships an EXPERIMENTAL
// global `localStorage` that is DISABLED unless `--localstorage-file` is passed
// (on Node 26 here it is `undefined`); that disabled global shadows jsdom's
// window.localStorage, so every localStorage-backed module (stealth slot salt,
// auth-model, demo balances, panic residue, …) silently no-ops and its tests fail
// — e.g. getOrCreateStealthSalt re-generates a fresh salt each call, so a hidden
// wallet's write-slot != read-slot and createHiddenWallet's self-verify throws.
// Install a minimal in-memory Storage ONLY when the host's localStorage doesn't
// round-trip, so older Nodes with a working jsdom localStorage are left untouched.
function localStorageWorks() {
  try {
    const k = '__veyrnox_ls_probe__';
    globalThis.localStorage.setItem(k, '1');
    const ok = globalThis.localStorage.getItem(k) === '1';
    globalThis.localStorage.removeItem(k);
    return ok;
  } catch {
    return false;
  }
}

if (!localStorageWorks()) {
  const makeStorage = () => {
    const map = new Map();
    return {
      get length() { return map.size; },
      key(i) { return Array.from(map.keys())[i] ?? null; },
      getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
      setItem(k, v) { map.set(String(k), String(v)); },
      removeItem(k) { map.delete(String(k)); },
      clear() { map.clear(); },
    };
  };
  const storage = makeStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  if (typeof globalThis.window !== 'undefined') {
    Object.defineProperty(globalThis.window, 'localStorage', { value: storage, configurable: true, writable: true });
  }
}
