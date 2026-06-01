// components/TransactionSimulationDemo.jsx
//
// DEMO-ONLY harness for the Phase S2 Transaction Simulation preview. In demo
// mode the real Send→verify step can't be reached (sends are HARD-gated to a
// live, unlocked ETH wallet against a real RPC), so this lets a reviewer SEE the
// exact pre-sign preview for representative transactions on every chain —
// including the high-risk patterns it flags.
//
// It is honest: each sample runs the REAL wallet-core risk logic
// (assessEvmTransaction / describeBtcPlan / describeSolTransfer) over real
// decoded calldata/plans — only the chain-state reads are canned (clearly
// labelled), since there's no live RPC in demo. No keys, no network, no signing.

import { useState } from "react";
import { parseEther, MaxUint256 } from "ethers";
import { Activity } from "lucide-react";
import TransactionPreview from "@/components/TransactionPreview";
import { assessEvmTransaction } from "@/wallet-core/evm/simulate";
import { describeBtcPlan } from "@/wallet-core/btc/simulate";
import { describeSolTransfer } from "@/wallet-core/sol/simulate";
import { describeErc20Call } from "@/wallet-core/evm/calldata";
import { buildTokenTransfer } from "@/wallet-core/evm/token-send";
import { encodeApprove } from "@/wallet-core/evm/approvals";
import { getToken } from "@/wallet-core/evm/tokens";
import { DEMO_KNOWN_COUNTERPARTY, DEMO_POISON_ADDRESS } from "@/api/demoClient";

const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // verified Sepolia USDC (tx target)
const UNKNOWN_SPENDER = "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad"; // not in our verified list
const FRESH_EOA = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // a normal recipient
const DEMO_BALANCE_ETH = "2.4831"; // mirrors the demo Main ETH wallet
const KNOWN = [{ address: DEMO_KNOWN_COUNTERPARTY, label: "an address you've paid before" }];

// Wrap a pure EVM assessment into the same result shape simulateEvmTransaction
// returns, so the preview renders identically to the live path.
function evmResult({ decoded, txTo, valueWei = 0n, nativeBalanceWei = null, tokenSymbol = null, tokenBalance = null, targetIsContract = false, spenderIsContract = null, knownAddresses = [], willRevert = false }) {
  const a = assessEvmTransaction({
    decoded, txTo, valueWei, nativeBalanceWei, nativeSymbol: "ETH",
    networkKey: "sepolia", tokenSymbol, tokenBalance, knownAddresses,
    targetIsContract, spenderIsContract,
  });
  const risks = willRevert
    ? [{ level: "high", code: "will_revert", title: "Transaction predicted to FAIL", detail: "Simulated against your RPC, this transaction reverts: insufficient balance. Signing would spend gas for nothing." }, ...a.risks]
    : a.risks;
  return {
    chain: "evm", simulated: true, willRevert, revertReason: willRevert ? "insufficient balance" : null,
    decoded: decoded || { kind: "native" }, ...a, risks,
    source: { mode: "local-rpc", queries: ["eth_getCode", "eth_getBalance", "eth_call"], thirdParty: false },
    coverageNote:
      "Simulated locally against your own RPC — nothing was sent to any third-party scoring service. " +
      "This predicts the outcome and flags KNOWN risk patterns; it is NOT a guarantee of safety and will not catch every novel threat.",
  };
}

function buildSamples() {
  const dec = getToken("sepolia", "USDC").decimals;

  // 1. Clean native ETH send — no known risk patterns.
  const clean = evmResult({
    decoded: { kind: "native" }, txTo: FRESH_EOA,
    valueWei: parseEther("0.05"), nativeBalanceWei: parseEther(DEMO_BALANCE_ETH),
  });

  // 2. Unlimited approval to an unknown (unverified) contract.
  const approveData = encodeApprove(UNKNOWN_SPENDER, MaxUint256);
  const unlimited = evmResult({
    decoded: describeErc20Call({ data: approveData, tokenSymbol: "USDC", decimals: dec }),
    txTo: USDC, targetIsContract: true, spenderIsContract: true,
    tokenSymbol: "USDC", knownAddresses: KNOWN,
  });

  // 3. Send to a known-bad recipient (local flagged list — the burn sink).
  const knownBad = evmResult({
    decoded: { kind: "native" }, txTo: "0x000000000000000000000000000000000000dEaD",
    valueWei: parseEther("0.1"), nativeBalanceWei: parseEther(DEMO_BALANCE_ETH),
  });

  // 4. Address-poisoning look-alike recipient (USDC transfer).
  const poisonData = buildTokenTransfer({ networkKey: "sepolia", symbol: "USDC", to: DEMO_POISON_ADDRESS, amount: "250" }).data;
  const poison = evmResult({
    decoded: describeErc20Call({ data: poisonData, tokenSymbol: "USDC", decimals: dec }),
    txTo: USDC, targetIsContract: true, tokenSymbol: "USDC", tokenBalance: "1250", knownAddresses: KNOWN,
  });

  // 5. Drain — sends almost the entire balance.
  const drain = evmResult({
    decoded: { kind: "native" }, txTo: FRESH_EOA,
    valueWei: parseEther(DEMO_BALANCE_ETH), nativeBalanceWei: parseEther(DEMO_BALANCE_ETH),
  });

  // 6. Bitcoin — decoded inputs/outputs/fee (no programmable simulation on BTC).
  const btc = describeBtcPlan({
    plan: {
      inputs: [{ value: 1500000n }, { value: 800000n }],
      outputs: [{ address: "tb1qrecipientxxxxxxxxxxxxxxxxxxxxxxxx0", value: 2000000n }, { address: "tb1qselfchangexxxxxxxxxxxxxxxxxxxxx0", value: 295000n }],
      feeSats: 5000n,
    },
    fromAddress: "tb1qselfchangexxxxxxxxxxxxxxxxxxxxx0",
  });

  // 7. Solana — decoded System transfer + local rent pre-flight, with priority fee.
  const sol = describeSolTransfer({
    plan: { amountLamports: 250000000n, feeLamports: 105000n, baseFeeLamports: 5000n, priorityFeeLamports: 100000n, sendMax: false },
    fromAddress: "So1Dem0Sender1111111111111111111111111111",
    toAddress: "So1Dem0Recipient11111111111111111111111111",
  });

  return [
    { id: "clean", label: "ETH send (clean)", result: clean },
    { id: "unlimited", label: "Unlimited approval", result: unlimited },
    { id: "knownbad", label: "Known-bad recipient", result: knownBad },
    { id: "poison", label: "Look-alike (poisoning)", result: poison },
    { id: "drain", label: "Drain (entire balance)", result: drain },
    { id: "btc", label: "Bitcoin", result: btc },
    { id: "sol", label: "Solana", result: sol },
  ];
}

export default function TransactionSimulationDemo() {
  const [samples] = useState(buildSamples);
  const [active, setActive] = useState("unlimited");
  const current = samples.find((s) => s.id === active) || samples[0];

  return (
    <div className="space-y-2.5 p-3 rounded-xl border border-dashed border-primary/30 bg-primary/5">
      <p className="text-xs font-medium flex items-center gap-1.5">
        <Activity className="h-3.5 w-3.5 text-primary" />
        Transaction Simulation — demo preview
      </p>
      <p className="text-[11px] text-muted-foreground">
        This is the pre-sign preview you'd see at the verify step before approving a transaction. These are
        illustrative samples (no live RPC in demo); each runs the real risk logic over real decoded data.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {samples.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActive(s.id)}
            className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${active === s.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <TransactionPreview result={current.result} />
    </div>
  );
}
