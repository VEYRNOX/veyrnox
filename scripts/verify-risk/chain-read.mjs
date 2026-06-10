// scripts/verify-risk/chain-read.mjs
//
// Risk Scoring v1 — VERIFICATION INSTRUMENT (optional, read-only). NOT product code.
//
// Read-only Sepolia helpers that turn the (D) cases (S5 ENS, S7 code-at-address)
// from FIXTURES into REAL on-chain data. These do pure reads — resolveName and
// getCode — with NO signer and NO private key. They never broadcast.
//
// This is the bridge described in the corrected plan: S5's realness enters via
// `ensCache`, and S7's via `chainData.recipientCode`. Use this to capture a real
// resolution / real code blob, paste it into the relevant case (cases.mjs) or a
// case JSON, and re-score. ONLY THEN is the (D) data real; even then "verified"
// requires recording the named real source in the verification log.
//
// Requires an RPC endpoint (read-only is fine):
//   SEPOLIA_RPC_URL=https://… node scripts/verify-risk/chain-read.mjs ens <name>
//   SEPOLIA_RPC_URL=https://… node scripts/verify-risk/chain-read.mjs code <0xaddress>
//
// It is intentionally NOT invoked by run.mjs — run.mjs stays fully offline.

import { JsonRpcProvider, isAddress } from 'ethers';

const SEPOLIA_CHAIN_ID = 11155111;

function providerOrExit() {
  const url = process.env.SEPOLIA_RPC_URL;
  if (!url) {
    console.error('SEPOLIA_RPC_URL is not set. This is a read-only RPC endpoint (no key).');
    process.exit(2);
  }
  return new JsonRpcProvider(url, SEPOLIA_CHAIN_ID);
}

/** Real ENS resolution → the address to place in ensCache, or null if unresolved. */
export async function resolveEns(name, provider = providerOrExit()) {
  const resolved = await provider.resolveName(name);
  return resolved ? resolved.toLowerCase() : null;
}

/** Real eth_getCode → the string to place in chainData.recipientCode. */
export async function getCode(address, provider = providerOrExit()) {
  if (!isAddress(address)) throw new Error(`not an address: ${address}`);
  return provider.getCode(address);
}

// ---- CLI ------------------------------------------------------------------
const [cmd, arg] = process.argv.slice(2);
if (cmd === 'ens' && arg) {
  const provider = providerOrExit();
  const resolved = await resolveEns(arg, provider);
  console.log(JSON.stringify({
    source: 'sepolia.resolveName',
    name: arg,
    resolved,
    cacheEntry: resolved ? { [arg]: resolved } : null,
    note: resolved
      ? 'Paste cacheEntry into a case ensCache. Record name→resolved as the (D) source in the log.'
      : 'Unresolved — the production analogue is "absent from cache" ⇒ S5 INDETERMINATE.',
  }, null, 2));
} else if (cmd === 'code' && arg) {
  const provider = providerOrExit();
  const code = await getCode(arg, provider);
  console.log(JSON.stringify({
    source: 'sepolia.eth_getCode',
    address: arg,
    isContract: code !== '0x',
    recipientCode: code.length > 18 ? code.slice(0, 18) + '…' : code,
    fullLength: code.length,
    note: 'Use the FULL code (not the truncated preview) as chainData.recipientCode. Record the address as the (D) source.',
  }, null, 2));
} else if (cmd) {
  console.error('usage: chain-read.mjs ens <name> | code <0xaddress>   (needs SEPOLIA_RPC_URL)');
  process.exit(2);
}
