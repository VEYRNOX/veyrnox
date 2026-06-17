import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, Cpu, Plus, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { isValidAddressForCurrency } from "@/lib/addressValidation";

const TREZOR_PLATFORMS = [
  { key: "android", label: "Android" },
  { key: "ios", label: "iPhone / iPad" },
  { key: "desktop", label: "Desktop" },
];

function detectPlatform() {
  if (/Android/i.test(navigator.userAgent)) return "android";
  if (/iPad|iPhone|iPod/i.test(navigator.userAgent)) return "ios";
  return "desktop";
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={[
        "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
        active
          ? "bg-primary text-primary-foreground border-transparent"
          : "bg-card border-border text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export default function HardwareWalletPage() {
  const [activeDevice, setActiveDevice] = useState("ledger");
  const [platform, setPlatform] = useState(() => detectPlatform());

  // Ledger WebHID state
  const [ledgerStatus, setLedgerStatus] = useState("idle"); // idle | connecting | connected | error
  const [ledgerAddress, setLedgerAddress] = useState(null);
  const [ledgerError, setLedgerError] = useState(null);

  // Shared watch-import form
  const [importAddress, setImportAddress] = useState("");
  const [importCurrency, setImportCurrency] = useState("ETH");
  const [importName, setImportName] = useState("");
  const [importAdded, setImportAdded] = useState(false);

  const queryClient = useQueryClient();

  const addMutation = useMutation({
    mutationFn: (d) => base44.entities.Wallet.create({ ...d, balance: 0, is_watch_only: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watch-wallets"] });
      setImportAdded(true);
      setImportAddress("");
    },
  });

  const webHidSupported = "hid" in navigator;

  const connectLedger = useCallback(async () => {
    setLedgerStatus("connecting");
    setLedgerError(null);
    try {
      const { default: TransportWebHID } = await import("@ledgerhq/hw-transport-webhid");
      const { default: Eth } = await import("@ledgerhq/hw-app-eth");
      const transport = await TransportWebHID.create();
      try {
        const eth = new Eth(transport);
        const { address } = await eth.getAddress("44'/60'/0'/0/0");
        setLedgerAddress(address);
        setImportAddress(address);
        setImportCurrency("ETH");
        setImportName("Ledger (ETH)");
        setLedgerStatus("connected");
      } finally {
        await transport.close();
      }
    } catch (err) {
      setLedgerStatus("error");
      const msg = err?.message ?? "";
      if (err?.name === "TransportOpenUserCancelled" || msg.includes("cancelled")) {
        setLedgerError("Device picker cancelled.");
      } else if (msg.includes("No device selected") || msg.includes("not found")) {
        setLedgerError("No Ledger detected — connect via USB and open the Ethereum app on the device.");
      } else if (msg.includes("INS_NOT_SUPPORTED") || msg.includes("6d00")) {
        setLedgerError("Open the Ethereum app on your Ledger, then try again.");
      } else {
        setLedgerError(msg || "Connection failed — make sure the Ethereum app is open on your Ledger.");
      }
    }
  }, []);

  const resetLedger = () => {
    setLedgerStatus("idle");
    setLedgerAddress(null);
    setLedgerError(null);
  };

  const addressValid =
    importAddress.length > 10 && isValidAddressForCurrency(importAddress, importCurrency);

  const handleAdd = () => {
    if (!addressValid) return;
    const label =
      importName.trim() || (activeDevice === "ledger" ? "Ledger" : "Trezor Safe 5");
    addMutation.mutate({ name: label, currency: importCurrency, address: importAddress });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl border border-border bg-card">
          <Cpu className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Hardware Wallet</h1>
          <p className="text-sm text-muted-foreground">Ledger WebHID · Trezor Safe 5 guide</p>
        </div>
      </div>

      {/* Device tabs */}
      <div className="flex gap-2">
        <TabBtn active={activeDevice === "ledger"} onClick={() => setActiveDevice("ledger")}>
          Ledger
        </TabBtn>
        <TabBtn active={activeDevice === "trezor"} onClick={() => setActiveDevice("trezor")}>
          Trezor Safe 5
        </TabBtn>
      </div>

      {/* ── LEDGER ─────────────────────────────────────────────────────────── */}
      {activeDevice === "ledger" && (
        <div className="space-y-4">
          {!webHidSupported && (
            <div className="flex gap-3 p-3.5 rounded-xl border border-yellow-500/30 bg-yellow-500/5 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-yellow-500" />
              <div>
                <p className="font-medium">WebHID not available in this browser</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Use Chrome or a Chromium-based browser to connect a Ledger device over USB.
                </p>
              </div>
            </div>
          )}

          <div className="p-5 rounded-xl border border-border bg-card space-y-4">
            <p className="font-medium text-sm">Connect via WebHID</p>
            <p className="text-xs text-muted-foreground">
              Plug in your Ledger, unlock it, and open the <span className="font-medium text-foreground">Ethereum app</span> on
              the device before clicking Connect. Your private key never leaves the device.
            </p>

            {ledgerStatus === "idle" && (
              <Button onClick={connectLedger} disabled={!webHidSupported} className="gap-2 w-full">
                <Cpu className="h-4 w-4" /> Connect Ledger
              </Button>
            )}
            {ledgerStatus === "connecting" && (
              <Button disabled className="gap-2 w-full">
                <RefreshCw className="h-4 w-4 animate-spin" /> Connecting…
              </Button>
            )}
            {ledgerStatus === "connected" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-500 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4" /> Connected — ETH address retrieved
                </div>
                <p className="font-mono text-xs break-all bg-secondary rounded-lg px-3 py-2 leading-relaxed">
                  {ledgerAddress}
                </p>
                <button
                  onClick={resetLedger}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Disconnect / use a different path
                </button>
              </div>
            )}
            {ledgerStatus === "error" && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{ledgerError}</span>
                </div>
                <Button variant="outline" size="sm" onClick={connectLedger} className="gap-2">
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </Button>
              </div>
            )}
          </div>

          <div className="p-3 rounded-xl bg-secondary/50 border border-border text-xs text-muted-foreground">
            Read-only today — address retrieval and balance monitoring only. In-app transaction
            signing (sending via Ledger confirmation) is not yet wired. Use Ledger Live for
            sending.
          </div>
        </div>
      )}

      {/* ── TREZOR ─────────────────────────────────────────────────────────── */}
      {activeDevice === "trezor" && (
        <div className="space-y-4">
          {/* Compatibility table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="bg-card px-4 py-3 border-b border-border">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Trezor Safe 5 mobile compatibility
              </p>
            </div>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-medium">Android (USB-C)</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 text-green-500 font-semibold text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Full support
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    Set up, receive, send, manage accounts, confirm on device screen
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">iPhone / iPad</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 text-yellow-500 font-semibold text-xs">
                      <AlertTriangle className="h-3.5 w-3.5" /> Watch-only
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    Track balances and receive addresses — sending requires desktop or Android
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Platform tabs */}
          <div className="flex gap-2">
            {TREZOR_PLATFORMS.map((p) => (
              <TabBtn key={p.key} active={platform === p.key} onClick={() => setPlatform(p.key)}>
                {p.label}
              </TabBtn>
            ))}
          </div>

          {/* Android */}
          {platform === "android" && (
            <div className="space-y-3">
              <span className="inline-block text-xs font-semibold bg-green-500/15 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
                Full support · USB-C
              </span>
              {[
                "Install the official Trezor Suite app from the Google Play Store.",
                "Connect your Trezor Safe 5 to your Android phone using a USB-C data cable.",
                "Open Trezor Suite and follow the on-screen setup prompts.",
                "Confirm addresses and transactions directly on the Trezor Safe 5 screen.",
                "Your private keys stay on the Trezor — the phone is only the interface.",
              ].map((step, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-lg bg-card border border-border">
                  <span className="text-xs font-bold text-primary shrink-0 w-4 pt-0.5">{i + 1}.</span>
                  <p className="text-sm">{step}</p>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                You need: Trezor Safe 5 · USB-C data cable · backup cards · ~15 minutes · Android
                phone with USB-C.
              </p>
              <a
                href="https://trezor.io/trezor-suite"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3 w-3" /> Download Trezor Suite
              </a>
            </div>
          )}

          {/* iOS */}
          {platform === "ios" && (
            <div className="space-y-3">
              <span className="inline-block text-xs font-semibold bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded-full">
                Watch-only · Trezor Suite Lite
              </span>
              <div className="p-3.5 rounded-xl border border-yellow-500/30 bg-yellow-500/5 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Why iOS is limited</p>
                <p>
                  iOS does not support the USB connection required for Trezor Safe 5 to sign
                  transactions. Only the Trezor Safe 7 has full Bluetooth support on iOS. Use
                  desktop or Android for sending.
                </p>
              </div>
              {[
                "Install Trezor Suite Lite from the App Store.",
                "Add your Trezor wallet as a watch-only account inside the app.",
                "Track balances, monitor activity, and generate receive addresses.",
                "To send or sign transactions, use Trezor Suite on a desktop or Android device.",
              ].map((step, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-lg bg-card border border-border">
                  <span className="text-xs font-bold text-primary shrink-0 w-4 pt-0.5">{i + 1}.</span>
                  <p className="text-sm">{step}</p>
                </div>
              ))}
              <a
                href="https://apps.apple.com/gb/app/trezor-suite-lite/id1631884497"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3 w-3" /> Trezor Suite Lite on the App Store
              </a>
            </div>
          )}

          {/* Desktop */}
          {platform === "desktop" && (
            <div className="space-y-3">
              <span className="inline-block text-xs font-semibold bg-green-500/15 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
                Full support · USB-C
              </span>
              {[
                "Download and install Trezor Suite from trezor.io.",
                "Connect your Trezor Safe 5 via USB-C.",
                "Set up or restore your device using your backup cards.",
                "Confirm all transactions on the Trezor Safe 5 screen — keys never leave the device.",
              ].map((step, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-lg bg-card border border-border">
                  <span className="text-xs font-bold text-primary shrink-0 w-4 pt-0.5">{i + 1}.</span>
                  <p className="text-sm">{step}</p>
                </div>
              ))}
              <a
                href="https://trezor.io/trezor-suite"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3 w-3" /> Download Trezor Suite
              </a>
            </div>
          )}

          <div className="p-3 rounded-xl bg-secondary/50 border border-border text-xs text-muted-foreground">
            In-app Trezor signing is not yet wired — Trezor Connect SDK is not installed. Use
            Trezor Suite for sending.
          </div>
        </div>
      )}

      {/* ── SHARED WATCH IMPORT ─────────────────────────────────────────────── */}
      <div className="p-5 rounded-xl border border-border bg-card space-y-4">
        <div>
          <p className="font-medium">
            Add {activeDevice === "ledger" ? "Ledger" : "Trezor"} address to Veyrnox
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeDevice === "ledger"
              ? "Address auto-fills after connecting above, or paste it manually."
              : "Copy your receive address from Trezor Suite and paste it here."}
          </p>
        </div>

        {importAdded ? (
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-green-500">
              <CheckCircle2 className="h-4 w-4" /> Added to Watch Wallets
            </span>
            <button
              onClick={() => setImportAdded(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Add another
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <select
                value={importCurrency}
                onChange={(e) => setImportCurrency(e.target.value)}
                className="rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {["ETH", "BTC", "SOL", "USDC", "USDT", "MATIC", "ARB", "OP", "BNB"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input
                type="text"
                value={importAddress}
                onChange={(e) => setImportAddress(e.target.value)}
                placeholder="Paste address…"
                className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <input
              type="text"
              value={importName}
              onChange={(e) => setImportName(e.target.value)}
              placeholder={`Label (e.g. ${activeDevice === "ledger" ? "Ledger ETH" : "Trezor Safe 5"})`}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button
              onClick={handleAdd}
              disabled={!addressValid || addMutation.isPending}
              className="gap-2 w-full"
            >
              <Plus className="h-4 w-4" />
              {addMutation.isPending ? "Adding…" : "Add Watch Address"}
            </Button>
            {addMutation.isError && (
              <p className="text-xs text-destructive">Failed to save — try again.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
