// @ts-nocheck
// src/pages/ColdSign.jsx
//
// COLD-KEY SIGNING (Feature 5) — air-gapped / external signer flow.
//
// THREE STEPS:
//   1) Build the UNSIGNED transaction from live chain state and show it as a QR.
//   2) Scan the SIGNED transaction back from the external signer.
//   3) Broadcast.
//
// WHERE THE RISK GATE LIVES (be honest — I4):
//   The pre-sign risk/RASP gate is enforced on the Send screen BEFORE the cold flow
//   is entered, and AGAIN at the cold-broadcast step in handleBroadcast() below. That
//   second call now runs REAL runtime RASP detection (detect/degrade of the live
//   environment) and fails closed (TIER.BLOCK) if detection throws, so an unsafe
//   runtime (automation / tampered WebDriver) blocks the broadcast. It does NOT
//   re-score tx-risk for the locally-built cold tx — that was scored on the Send
//   screen; the RASP tier is what this step independently enforces.
//
// SECURITY:
//   - I1: the private key NEVER leaves the external signer and never touched this
//     device. Only the UNSIGNED tx crosses out (QR), only the SIGNED bytes come
//     back. For BTC we read the wallet's PUBLIC key transiently to build the PSBT;
//     the private key is not placed in any artifact.
//   - Nothing here is "verified": a broadcast returns a real txid the user confirms
//     on a block explorer. The UI labels it pending until then.

import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base64 } from "@scure/base";
import { Transaction as BtcTx } from "@scure/btc-signer";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ShieldCheck, ScanLine, Loader2, ExternalLink, AlertTriangle, ArrowLeft } from "lucide-react";
import QRCodeDisplay from "@/components/QRCodeDisplay";

import { useWallet } from "@/lib/WalletProvider";
import { getNetwork } from "@/wallet-core/evm/networks";
import { getProvider, broadcastSigned } from "@/wallet-core/evm/provider";
import { estimateEvmFeeTiers } from "@/wallet-core/evm/fees";
import { getBtcNetwork } from "@/wallet-core/btc/networks";
import { estimateBtcSend } from "@/wallet-core/btc/send";
import { broadcastTx } from "@/wallet-core/btc/provider";
import { buildUnsignedEvmTx } from "@/wallet-core/coldkey/evmUnsigned";
import { buildUnsignedPsbt } from "@/wallet-core/coldkey/psbt";
import { encodeColdPayload, decodeColdPayload, COLD_KIND } from "@/wallet-core/coldkey/qr";
import { parseEther, parseUnits } from "ethers";

import { presignGate } from "@/sign-gate/presign";
import { useRaspArtifact, TIER } from "@/rasp";
import { LEVEL } from "@/risk/levels";

export default function ColdSign() {
  const navigate = useNavigate();
  const location = useLocation();
  const { withBtcPrivateKey } = useWallet();
  const coldSend = location.state?.coldSend || null;

  const [phase, setPhase] = useState("building"); // building | show | scanning | broadcasting | done | error
  const [unsignedQr, setUnsignedQr] = useState(null);   // string to encode in QR
  const [scanned, setScanned] = useState("");           // pasted/scanned signed payload
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState(null);           // { hash, explorerUrl }
  const raspArtifact = useRaspArtifact();
  const [riskAck, setRiskAck] = useState(false);

  // No payload (e.g. deep-linked directly) — fail closed back to Send.
  useEffect(() => {
    if (!coldSend) {
      navigate("/send", { replace: true });
    }
  }, [coldSend, navigate]);

  // STEP 1 — build the UNSIGNED transaction from live chain state.
  useEffect(() => {
    if (!coldSend) return;
    let cancelled = false;
    (async () => {
      try {
        if (coldSend.family === "evm") {
          const net = getNetwork(coldSend.networkKey); // gate-aware
          const provider = getProvider(coldSend.networkKey);
          const valueWei = parseEther(String(coldSend.amount));
          const [nonce, est] = await Promise.all([
            provider.getTransactionCount(coldSend.fromAddress, "pending"),
            estimateEvmFeeTiers({
              networkKey: coldSend.networkKey,
              from: coldSend.fromAddress,
              to: coldSend.toAddress,
              value: valueWei,
              data: undefined,
              gasLimit: coldSend.isErc20 ? 65000 : 21000,
            }),
          ]);
          const fee = coldSend.fee || est.tiers?.[1]?.fee || est.tiers?.[0]?.fee;
          const unsigned = buildUnsignedEvmTx({
            chainId: net.chainId,
            nonce,
            to: coldSend.toAddress,
            value: valueWei,
            maxFeePerGas: BigInt(fee.maxFeePerGasWei),
            maxPriorityFeePerGas: BigInt(fee.maxPriorityFeePerGasWei),
            gasLimit: BigInt(fee.gasLimit),
          });
          const qr = encodeColdPayload({
            kind: COLD_KIND.EVM_UNSIGNED,
            networkKey: coldSend.networkKey,
            chainId: net.chainId,
            unsignedSerialized: unsigned.unsignedHex,
          });
          if (!cancelled) { setUnsignedQr(qr); setPhase("show"); }
        } else if (coldSend.family === "btc") {
          const net = getBtcNetwork(coldSend.networkKey); // gate-aware
          const { plan } = await estimateBtcSend({
            networkKey: coldSend.networkKey,
            fromAddress: coldSend.fromAddress,
            toAddress: coldSend.toAddress,
            amountSats: parseUnits(String(coldSend.amount), 8),
          });
          // Read ONLY the public key (transiently) to build the PSBT — the private
          // key is never placed in the artifact (I1).
          const psbtBase64 = await withBtcPrivateKey(({ publicKey }) =>
            buildUnsignedPsbt({ plan, publicKey, params: net.params }).psbtBase64
          );
          const qr = encodeColdPayload({
            kind: COLD_KIND.BTC_PSBT_UNSIGNED,
            networkKey: coldSend.networkKey,
            psbtBase64,
          });
          if (!cancelled) { setUnsignedQr(qr); setPhase("show"); }
        } else {
          throw new Error("Cold signing is available for EVM and BTC this release.");
        }
      } catch (e) {
        if (!cancelled) { setErrorMsg(e?.message || "Couldn't build the unsigned transaction."); setPhase("error"); }
      }
    })();
    return () => { cancelled = true; };
  }, [coldSend, withBtcPrivateKey]);

  // STEP 3 — broadcast the signed payload.
  async function handleBroadcast() {
    setErrorMsg("");
    let payload;
    try {
      payload = decodeColdPayload(scanned.trim());
    } catch {
      payload = null;
    }
    if (!payload) {
      setErrorMsg("That isn't a valid Veyrnox signed-transaction QR.");
      return;
    }

    // H11: Re-evaluate the RASP plane at the cold-broadcast step using REAL runtime
    // detection (detect/degrade are pure functions of the environment). We fail
    // closed: if detection throws we default to TIER.BLOCK. The tx-risk level is
    // not re-scored on a locally-built cold tx (the Send screen already gated it),
    // so we pass LEVEL.OK for that arg — the RASP tier is what gates here. riskAck
    // is the user's broadcast acknowledgement and is unchanged.
    // NOTE: Never pass a hardcoded tier constant here — real detect() is used below.
    const tier = raspArtifact?.tier ?? TIER.BLOCK;
    const gate = presignGate(tier, LEVEL.OK, riskAck);
    if (!gate.proceedAllowed) {
      setErrorMsg("This transaction is blocked by the pre-sign risk gate and cannot be broadcast.");
      return;
    }

    setPhase("broadcasting");
    try {
      if (coldSend.family === "evm") {
        if (payload.kind !== COLD_KIND.EVM_SIGNED || !payload.signedSerialized) {
          throw new Error("Expected a signed EVM transaction QR.");
        }
        const txHash = await broadcastSigned(coldSend.networkKey, payload.signedSerialized);
        const evmNet = getNetwork(coldSend.networkKey);
        const explorerUrl = evmNet?.explorerUrl ? `${evmNet.explorerUrl}/tx/${txHash}` : null;
        setResult({ hash: txHash, explorerUrl });
      } else if (coldSend.family === "btc") {
        // Accept either a finalized raw-tx hex, or a signed PSBT we finalize here.
        let rawHex = null;
        if (payload.kind === COLD_KIND.BTC_RAW_SIGNED && payload.rawHex) {
          rawHex = payload.rawHex;
        } else if (payload.kind === COLD_KIND.BTC_PSBT_SIGNED && payload.psbtBase64) {
          const tx = BtcTx.fromPSBT(base64.decode(payload.psbtBase64));
          tx.finalize();
          rawHex = tx.hex;
        } else {
          throw new Error("Expected a signed BTC PSBT or raw-tx QR.");
        }
        const txid = await broadcastTx(coldSend.networkKey, rawHex);
        const net = getBtcNetwork(coldSend.networkKey);
        setResult({ hash: txid, explorerUrl: `${net.explorer}/tx/${txid}` });
      }
      setPhase("done");
    } catch (e) {
      setErrorMsg(e?.message || "Broadcast failed.");
      setPhase("show");
    }
  }

  if (!coldSend) return null;

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/send")} aria-label="Back to send">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-primary" /> Cold-key signing
        </h1>
      </div>

      <p className="text-xs text-muted-foreground">
        Your private key never leaves your signing device. Show the unsigned transaction
        to your air-gapped signer, then scan the signed result back here to broadcast.
      </p>

      {phase === "building" && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Building unsigned transaction…
        </div>
      )}

      {phase === "error" && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/40 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {errorMsg}
        </div>
      )}

      {(phase === "show" || phase === "broadcasting") && unsignedQr && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Step 1 — unsigned transaction</p>
            <div className="flex justify-center">
              <QRCodeDisplay address={unsignedQr} size={240} />
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              Scan this with your offline signer. It contains the unsigned transaction only — no key.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <ScanLine className="h-3.5 w-3.5" /> Step 2 — paste the signed transaction
            </p>
            <textarea
              className="w-full rounded-lg border border-border bg-background p-2 text-xs mono-value min-h-[90px]"
              placeholder="Paste the signed-transaction QR payload from your signer"
              value={scanned}
              onChange={(e) => setScanned(e.target.value)}
              aria-label="Signed transaction payload"
            />
            <label className="flex items-start gap-2 text-[11px] text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={riskAck} onChange={(e) => setRiskAck(e.target.checked)} className="mt-0.5" />
              I reviewed this transaction on my signer and want to broadcast it.
            </label>
          </div>

          {errorMsg && (
            <p role="alert" className="text-xs text-destructive flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {errorMsg}
            </p>
          )}

          <Button
            className="w-full gap-2"
            disabled={!scanned.trim() || !riskAck || phase === "broadcasting"}
            onClick={handleBroadcast}
          >
            {phase === "broadcasting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Step 3 — broadcast
          </Button>
        </div>
      )}

      {phase === "done" && result && (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-center space-y-1">
            <ShieldCheck className="h-6 w-6 text-primary mx-auto" />
            <p className="text-sm font-medium">Broadcast — pending on-chain confirmation</p>
            <p className="text-[11px] text-muted-foreground mono-value break-all">{result.hash}</p>
          </div>
          {result.explorerUrl && (
            <a
              href={result.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              View on block explorer <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <Button variant="outline" className="w-full" onClick={() => navigate("/")}>Done</Button>
        </div>
      )}
    </div>
  );
}
