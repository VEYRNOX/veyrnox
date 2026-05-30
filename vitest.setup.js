// vitest.setup.js
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
