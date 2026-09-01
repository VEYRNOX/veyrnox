// Self-send tiny amounts on all 10 supported testnet assets.
// Throwaway seed only. Prints txid + explorer URL per chain.
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import {
  HDNodeWallet, JsonRpcProvider, Wallet, Contract,
  parseEther, parseUnits,
} from 'ethers';
import * as btc from '@scure/btc-signer';
import { hex } from '@scure/base';
import {
  Connection, Keypair, SystemProgram,
  Transaction, LAMPORTS_PER_SOL, clusterApiUrl,
} from '@solana/web3.js';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { ed25519 } from '@noble/curves/ed25519';

const MNEMONIC = process.env.TESTNET_MNEMONIC;
if (!MNEMONIC) {
  console.error('TESTNET_MNEMONIC env var required (throwaway testnet seed, never mainnet)');
  process.exit(1);
}

const results = [];

// ---------- EVM ----------
const EVM = [
  { key: 'sepolia',   name: 'Sepolia ETH',    rpc: 'https://ethereum-sepolia-rpc.publicnode.com',        explorer: 'https://sepolia.etherscan.io',           value: parseEther('0.0001') },
  { key: 'amoy',      name: 'Amoy MATIC',     rpc: 'https://polygon-amoy-bor-rpc.publicnode.com',        explorer: 'https://amoy.polygonscan.com',           value: parseEther('0.001') },
  { key: 'arb-sep',   name: 'Arb Sepolia',    rpc: 'https://sepolia-rollup.arbitrum.io/rpc',             explorer: 'https://sepolia.arbiscan.io',            value: parseEther('0.0001') },
  { key: 'op-sep',    name: 'OP Sepolia',     rpc: 'https://sepolia.optimism.io',                        explorer: 'https://sepolia-optimism.etherscan.io',  value: parseEther('0.0001') },
  { key: 'fuji',      name: 'Fuji AVAX',      rpc: 'https://avalanche-fuji-c-chain-rpc.publicnode.com',  explorer: 'https://testnet.snowtrace.io',           value: parseEther('0.001') },
  { key: 'bnb-t',     name: 'BNB Testnet',    rpc: 'https://bsc-testnet-rpc.publicnode.com',             explorer: 'https://testnet.bscscan.com',            value: parseEther('0.001') },
];

const evmDerive = HDNodeWallet.fromPhrase(MNEMONIC);
const evmAddr = evmDerive.address;
const evmPk = evmDerive.privateKey;

for (const c of EVM) {
  try {
    const p = new JsonRpcProvider(c.rpc);
    const w = new Wallet(evmPk, p);
    const nonce = await p.getTransactionCount(evmAddr, 'pending');
    // BNB testnet needs Standard+ gas per CLAUDE.md; bump 20% everywhere for headroom.
    const fee = await p.getFeeData();
    let overrides = { to: evmAddr, value: c.value, nonce };
    if (fee.maxFeePerGas && fee.maxPriorityFeePerGas) {
      overrides.maxFeePerGas = fee.maxFeePerGas * 12n / 10n;
      overrides.maxPriorityFeePerGas = fee.maxPriorityFeePerGas * 12n / 10n;
    } else if (fee.gasPrice) {
      overrides.gasPrice = fee.gasPrice * 12n / 10n;
    }
    const tx = await w.sendTransaction(overrides);
    console.log(`[${c.name}] sent  ${tx.hash}`);
    const r = await tx.wait(1);
    const url = `${c.explorer}/tx/${tx.hash}`;
    console.log(`[${c.name}] mined block=${r.blockNumber}  ${url}`);
    results.push({ chain: c.name, txid: tx.hash, url });
  } catch (e) {
    console.log(`[${c.name}] ERROR ${e.shortMessage || e.message}`);
    results.push({ chain: c.name, error: e.shortMessage || e.message });
  }
}

// ---------- ERC20 USDC + USDT on Sepolia ----------
const SEP_TOKENS = [
  { symbol: 'USDC', address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6, amount: '0.01' },
  { symbol: 'USDT', address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0', decimals: 6, amount: '0.01' },
];
const ERC20_ABI = ['function transfer(address,uint256) returns (bool)'];
{
  const p = new JsonRpcProvider(EVM[0].rpc);
  const w = new Wallet(evmPk, p);
  for (const t of SEP_TOKENS) {
    try {
      const c = new Contract(t.address, ERC20_ABI, w);
      const amt = parseUnits(t.amount, t.decimals);
      const tx = await c.transfer(evmAddr, amt);
      console.log(`[Sepolia ${t.symbol}] sent  ${tx.hash}`);
      const r = await tx.wait(1);
      const url = `https://sepolia.etherscan.io/tx/${tx.hash}`;
      console.log(`[Sepolia ${t.symbol}] mined block=${r.blockNumber}  ${url}`);
      results.push({ chain: `Sepolia ${t.symbol}`, txid: tx.hash, url });
    } catch (e) {
      console.log(`[Sepolia ${t.symbol}] ERROR ${e.shortMessage || e.message}`);
      results.push({ chain: `Sepolia ${t.symbol}`, error: e.shortMessage || e.message });
    }
  }
}

// ---------- BTC testnet (P2WPKH self-send) ----------
try {
  const seed = mnemonicToSeedSync(MNEMONIC);
  const root = HDKey.fromMasterSeed(seed);
  const node = root.derive("m/84'/1'/0'/0/0");
  const priv = node.privateKey;
  const pub = node.publicKey;
  const pay = btc.p2wpkh(pub, btc.TEST_NETWORK);
  const addr = pay.address;

  // Fetch UTXOs
  const uRes = await fetch(`https://mempool.space/testnet/api/address/${addr}/utxo`);
  const utxos = await uRes.json();
  if (!utxos.length) throw new Error('no UTXOs');

  const tx = new btc.Transaction();
  let inSum = 0n;
  for (const u of utxos) {
    tx.addInput({
      txid: u.txid,
      index: u.vout,
      witnessUtxo: { script: pay.script, amount: BigInt(u.value) },
    });
    inSum += BigInt(u.value);
  }
  // ~110 vB single-in single-out P2WPKH; add 30 vB per extra input.
  const vbytes = BigInt(110 + (utxos.length - 1) * 68);
  const feeRateRes = await fetch('https://mempool.space/testnet/api/v1/fees/recommended');
  const feeRate = BigInt((await feeRateRes.json()).minimumFee || 1);
  const fee = vbytes * feeRate;
  const sendAmt = 546n; // dust threshold self-send
  const change = inSum - sendAmt - fee;
  if (change < 0n) throw new Error(`insufficient: in=${inSum} need=${sendAmt + fee}`);
  tx.addOutputAddress(addr, sendAmt, btc.TEST_NETWORK);
  if (change >= 546n) tx.addOutputAddress(addr, change, btc.TEST_NETWORK);
  tx.sign(priv);
  tx.finalize();
  const rawHex = hex.encode(tx.extract());

  const pRes = await fetch('https://mempool.space/testnet/api/tx', {
    method: 'POST',
    body: rawHex,
  });
  const pTxt = await pRes.text();
  if (!pRes.ok) throw new Error(`broadcast ${pRes.status}: ${pTxt}`);
  const url = `https://mempool.space/testnet/tx/${pTxt}`;
  console.log(`[BTC testnet] sent  ${pTxt}`);
  console.log(`[BTC testnet]       ${url}`);
  results.push({ chain: 'BTC testnet', txid: pTxt, url });
} catch (e) {
  console.log(`[BTC testnet] ERROR ${e.message}`);
  results.push({ chain: 'BTC testnet', error: e.message });
}

// ---------- SOL devnet ----------
try {
  const seed = mnemonicToSeedSync(MNEMONIC);
  function slip10(seed, path) {
    let I = hmac(sha512, new TextEncoder().encode('ed25519 seed'), seed);
    for (const seg of path.slice(2).split('/')) {
      const idx = parseInt(seg.replaceAll("'", ''), 10) + 0x80000000;
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
  const priv = slip10(seed, "m/44'/501'/0'/0'");
  const pub = ed25519.getPublicKey(priv);
  const secret = new Uint8Array(64);
  secret.set(priv, 0);
  secret.set(pub, 32);
  const kp = Keypair.fromSecretKey(secret);
  const conn = new Connection(clusterApiUrl('devnet'), 'confirmed');
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: kp.publicKey });
  tx.add(SystemProgram.transfer({
    fromPubkey: kp.publicKey,
    toPubkey: kp.publicKey,
    lamports: Math.floor(0.001 * LAMPORTS_PER_SOL),
  }));
  tx.sign(kp);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  const url = `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
  console.log(`[SOL devnet] sent  ${sig}`);
  console.log(`[SOL devnet]       ${url}`);
  results.push({ chain: 'SOL devnet', txid: sig, url });
} catch (e) {
  console.log(`[SOL devnet] ERROR ${e.message}`);
  results.push({ chain: 'SOL devnet', error: e.message });
}

console.log('\n=== SUMMARY ===');
for (const r of results) {
  if (r.error) console.log(`  ${r.chain.padEnd(20)} FAIL ${r.error}`);
  else        console.log(`  ${r.chain.padEnd(20)} ${r.txid}`);
}
