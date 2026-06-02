// pages/SuspiciousAddressChecker.jsx
//
// Recipient address screening. This page runs the REAL, local wallet-core
// screening — `isLocallyFlagged` (the burn/null/known-scam-sink list) and
// `screenRecipient` (address-poisoning look-alike detection) from
// wallet-core/evm/poison.js — over an address the user pastes, screening
// look-alikes against the addresses they have actually saved (their Address Book).
//
// HONESTY CONTRACT (mirrors poison.js):
//   - It NEVER says an address is "legitimate" / "safe". Absence from a local
//     known-bad list is NOT safety, and the UI says so explicitly.
//   - It reports only what the real screen found: on the local known-bad list, a
//     look-alike of one of YOUR saved addresses (possible poisoning), an exact
//     match of a saved address, or "not flagged by local screening — not a
//     guarantee".
//   - Local-only: no key, no network, no third-party reputation feed (that screen
//     is on the roadmap, not built — we do not pretend to have it). EVM addresses
//     only; BTC/SOL are out of this screen's scope and labelled as such.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAddress } from "ethers";
import { base44 } from "@/api/base44Client";
import { Search, ShieldAlert, AlertTriangle, Info, Copy, Check, ServerCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { screenRecipient, isLocallyFlagged } from "@/wallet-core/evm/poison";

// Verdict shapes — NONE asserts safety. The "clear" case is explicitly framed as
// "not a guarantee", matching the simulation/preview language used app-wide.
function buildVerdict(address, knownAddresses) {
  const addr = (address || "").trim();
  if (!addr) return null;

  if (!isAddress(addr)) {
    return {
      level: "info",
      title: "Not an EVM address",
      detail:
        "This screen covers EVM (0x…) addresses only — it checks the local known-bad list and screens for " +
        "address-poisoning look-alikes against your saved contacts. A BTC or Solana address is not screened here.",
      flagged: false,
    };
  }

  if (isLocallyFlagged(addr)) {
    return {
      level: "high",
      title: "On the local known-bad list",
      detail:
        "This address is on the local flagged list (e.g. a burn/null sink or a known scam sink). " +
        "Sending here is very likely a mistake or a scam.",
      flagged: true,
    };
  }

  const screen = screenRecipient(addr, knownAddresses);
  if (screen.suspicious) {
    return {
      level: "high",
      title: "Look-alike of a saved address (possible poisoning)",
      detail:
        "This matches the first and last characters of an address in your Address Book but differs in the " +
        "middle — exactly the address-poisoning pattern. Compare every character, not just the ends, before sending.",
      flagged: true,
      lookAlikes: screen.lookAlikes,
    };
  }
  if (screen.known) {
    return {
      level: "info",
      title: "Matches an address in your Address Book",
      detail:
        "This exactly matches an address you've saved. That tells you it's one you've added before — it is NOT, " +
        "by itself, a guarantee the address is safe or that the saved entry wasn't poisoned. Verify independently.",
      flagged: false,
    };
  }

  return {
    level: "clear",
    title: "Not flagged by local screening",
    detail:
      "Not on the local known-bad list, and not a look-alike of any address in your Address Book. This is NOT a " +
      "safety check — absence from a local blocklist does not mean the address is safe or legitimate. A live " +
      "threat-intel reputation feed is on the roadmap, not built. Always verify the recipient independently.",
    flagged: false,
  };
}

const LEVEL_CFG = {
  high: { color: "text-destructive", bg: "bg-destructive/10 border-destructive/30", Icon: ShieldAlert },
  info: { color: "text-muted-foreground", bg: "bg-secondary/40 border-border", Icon: Info },
  clear: { color: "text-muted-foreground", bg: "bg-secondary/40 border-border", Icon: Info },
};

export default function SuspiciousAddressChecker() {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState([]);

  // The user's saved addresses — the real baseline for the poisoning look-alike
  // screen. Best-effort; an empty book just means no look-alike comparison.
  const { data: contacts = [] } = useQuery({
    queryKey: ["address-book"],
    queryFn: () => base44.entities.AddressBook.list("-created_date"),
  });
  const knownAddresses = contacts
    .map((c) => ({ address: c.address, label: c.name }))
    .filter((c) => c.address);

  const check = () => {
    const verdict = buildVerdict(address, knownAddresses);
    setResult(verdict);
    if (verdict) setHistory((h) => [{ address, ...verdict, time: new Date() }, ...h.slice(0, 4)]);
  };

  const copyAddr = () => { navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const cfg = result ? LEVEL_CFG[result.level] || LEVEL_CFG.info : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Recipient Address Screening</h1>
        <p className="text-sm text-muted-foreground">Check an address against the local known-bad list and screen it for address-poisoning look-alikes of your saved contacts</p>
      </div>

      <div className="p-5 rounded-xl border border-border bg-card space-y-4">
        <div>
          <label className="text-sm font-medium mb-1.5 block">Wallet Address (EVM 0x…)</label>
          <div className="flex gap-2">
            <Input placeholder="0x… recipient address" value={address} onChange={(e) => { setAddress(e.target.value); setResult(null); }} onKeyDown={(e) => e.key === "Enter" && address && check()} className="font-mono text-sm flex-1" />
            <Button disabled={!address} onClick={check} className="gap-2 shrink-0">
              <Search className="h-4 w-4" /> Screen
            </Button>
          </div>
        </div>
        {address && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-muted-foreground truncate">{address}</span>
            <button onClick={copyAddr} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
      </div>

      {result && cfg && (
        <div className={`p-5 rounded-xl border ${cfg.bg} space-y-3`}>
          <div className="flex items-start gap-3">
            <cfg.Icon className={`h-6 w-6 shrink-0 ${cfg.color}`} />
            <div>
              <p className={`font-bold ${cfg.color}`}>{result.title}</p>
              <p className="text-sm text-muted-foreground mt-1">{result.detail}</p>
            </div>
          </div>
          {result.lookAlikes?.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-border/50">
              <p className="text-xs font-semibold text-muted-foreground">Resembles your saved address{result.lookAlikes.length > 1 ? "es" : ""}:</p>
              {result.lookAlikes.map((la, i) => (
                <p key={i} className="text-xs font-mono break-all">{la.label ? `${la.label}: ` : ""}{la.address}</p>
              ))}
            </div>
          )}
          {result.flagged && (
            <p className="text-xs text-muted-foreground border-t border-border/50 pt-3 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-destructive" />
              We strongly recommend not sending funds to this address until you have verified it through independent means.
            </p>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Recent Checks</p>
          {history.map((h, i) => {
            const c = LEVEL_CFG[h.level] || LEVEL_CFG.info;
            return (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card cursor-pointer hover:bg-secondary/50 transition-colors" onClick={() => { setAddress(h.address); setResult(h); }}>
                <c.Icon className={`h-5 w-5 shrink-0 ${c.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs truncate">{h.address}</p>
                  <p className="text-[10px] text-muted-foreground">{h.time.toLocaleTimeString()}</p>
                </div>
                <span className={`text-xs font-semibold ${c.color}`}>{h.title}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="p-3 rounded-xl bg-secondary/50 border border-border flex items-start gap-2">
        <ServerCog className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Screened locally on this device — no key, no network, nothing sent to a third party. This catches
          KNOWN local patterns (flagged sinks, look-alikes of your saved contacts) only; it is not a reputation
          feed and never certifies an address as safe. Always verify addresses independently before sending.
        </p>
      </div>
    </div>
  );
}
