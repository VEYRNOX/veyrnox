// Read-only testnet balance check for the throwaway seed's derived addresses.
// No signing, no broadcast.
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDNodeWallet, JsonRpcProvider, Contract, formatEther, formatUnits } from 'ethers';
import * as btc from '@scure/btc-signer';
import { Connection, PublicKey, LAMPORTS_PER_SOL, clusterApiUrl } from '@solana/web3.js';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { ed25519 } from '@noble/curves/ed25519';

const MNEMONIC = process.env.TESTNET_MNEMONIC;
if (!MNEMONIC) {
  console.error('TESTNET_MNEMONIC env var required (throwaway testnet seed, never mainnet)');
  process.exit(1);
}

// ---------- EVM ----------
const EVM_CHAINS = [
  { key: 'sepolia',    name: 'Sepolia (ETH)',   rpc: 'https://ethereum-sepolia-rpc.publicnode.com',      explorer: 'https://sepolia.etherscan.io' },
  { key: 'amoy',       name: 'Amoy (MATIC)',    rpc: 'https://rpc-amoy.polygon.technology',              explorer: 'https://amoy.polygonscan.com' },
  { key: 'arb-sep',    name: 'Arb Sepolia',     rpc: 'https://sepolia-rollup.arbitrum.io/rpc',           explorer: 'https://sepolia.arbiscan.io' },
  { key: 'op-sep',     name: 'OP Sepolia',      rpc: 'https://sepolia.optimism.io',                      explorer: 'https://sepolia-optimism.etherscan.io' },
  { key: 'fuji',       name: 'Fuji (AVAX)',     rpc: 'https://avalanche-fuji-c-chain-rpc.publicnode.com', explorer: 'https://testnet.snowtrace.io' },
  { key: 'bnb-t',      name: 'BNB Testnet',     rpc: 'https://bsc-testnet-rpc.publicnode.com',           explorer: 'https://testnet.bscscan.com' },
];

const SEPOLIA_TOKENS = [
  { symbol: 'USDC', address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6 },
  { symbol: 'USDT', address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0', decimals: 6 },
];

const evmWallet = HDNodeWallet.fromPhrase(MNEMONIC);
const evmAddr = evmWallet.address;
console.log(`\n=== EVM (m/44'/60'/0'/0/0) ${evmAddr} ===`);

for (const c of EVM_CHAINS) {
  try {
    const p = new JsonRpcProvider(c.rpc);
    const bal = await p.getBalance(evmAddr);
    console.log(`  ${c.name.padEnd(20)} ${formatEther(bal).padStart(20)}   ${c.explorer}/address/${evmAddr}`);
  } catch (e) {
    console.log(`  ${c.name.padEnd(20)} ERROR ${e.shortMessage || e.message}`);
  }
}

// ERC20 balances on Sepolia
console.log(`  --- Sepolia ERC20 ---`);
const sepProvider = new JsonRpcProvider(EVM_CHAINS[0].rpc);
const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];
for (const t of SEPOLIA_TOKENS) {
  try {
    const c = new Contract(t.address, ERC20_ABI, sepProvider);
    const bal = await c.balanceOf(evmAddr);
    console.log(`  ${t.symbol.padEnd(20)} ${formatUnits(bal, t.decimals).padStart(20)}`);
  } catch (e) {
    console.log(`  ${t.symbol.padEnd(20)} ERROR ${e.shortMessage || e.message}`);
  }
}

// ---------- BTC ----------
const seed = mnemonicToSeedSync(MNEMONIC);
const root = HDKey.fromMasterSeed(seed);
const btcNode = root.derive("m/84'/1'/0'/0/0"); // testnet BIP-84
const btcPay = btc.p2wpkh(btcNode.publicKey, btc.TEST_NETWORK);
const btcAddr = btcPay.address;
console.log(`\n=== BTC testnet (m/84'/1'/0'/0/0) ${btcAddr} ===`);
try {
  const r = await fetch(`https://mempool.space/testnet/api/address/${btcAddr}`);
  const j = await r.json();
  const funded = j.chain_stats.funded_txo_sum - j.chain_stats.spent_txo_sum;
  const mempool = j.mempool_stats.funded_txo_sum - j.mempool_stats.spent_txo_sum;
  console.log(`  confirmed ${(funded / 1e8).toFixed(8)} BTC   mempool ${(mempool / 1e8).toFixed(8)} BTC`);
  console.log(`  https://mempool.space/testnet/address/${btcAddr}`);
} catch (e) {
  console.log(`  ERROR ${e.message}`);
}

// ---------- SOL ----------
// SLIP-0010 ed25519 derivation m/44'/501'/0'/0'
function slip10Ed25519(seed, path) {
  let I = hmac(sha512, new TextEncoder().encode('ed25519 seed'), seed);
  for (const seg of path.slice(2).split('/')) {
    const idx = parseInt(seg.replace("'", ''), 10) + 0x80000000;
    const buf = new Uint8Array(37);
    buf[0] = 0;
    buf.set(I.slice(0, 32), 1);
    buf[33] = (idx >>> 24) & 0xff;
    buf[34] = (idx >>> 16) & 0xff;
    buf[35] = (idx >>> 8) & 0xff;
    buf[36] = idx & 0xff;
    I = hmac(sha512, I.slice(32), buf);
  }
  return I.slice(0, 32);
}
const solPriv = slip10Ed25519(seed, "m/44'/501'/0'/0'");
const solPub = ed25519.getPublicKey(solPriv);
const solAddr = new PublicKey(solPub).toBase58();
console.log(`\n=== SOL devnet (m/44'/501'/0'/0') ${solAddr} ===`);
try {
  const conn = new Connection(clusterApiUrl('devnet'), 'confirmed');
  const bal = await conn.getBalance(new PublicKey(solAddr));
  console.log(`  ${(bal / LAMPORTS_PER_SOL).toFixed(9)} SOL`);
  console.log(`  https://explorer.solana.com/address/${solAddr}?cluster=devnet`);
} catch (e) {
  console.log(`  ERROR ${e.message}`);
}

console.log('\nDone.');
