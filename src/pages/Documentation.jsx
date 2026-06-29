import { useState } from "react";
import { exportCataloguePdf } from "@/lib/pdfExport";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger
} from "@/components/ui/accordion";
import {
  Wallet, Shield, Bell, BarChart3,
  Search, ChevronRight, Book, Layers, Users, CreditCard, KeyRound,
  Smartphone, FileText, ShieldAlert, LifeBuoy,
  LayoutDashboard, Send, Download, Image as ImageIcon, Coins
} from "lucide-react";

// Scope contract: docs/WalletFeatures.spec.md (canonical three-way split).
// This catalogue lists ONLY self-custody-safe, in-scope features (spec A = in-scope
// + B = self-custody-safe gaps). Everything in spec section C (custodial / regulated
// — swaps, perps, staking/yield/lending, fiat ramps, bank links, KYC/DID, NFT
// minting, DAO/payroll, encrypted messaging, etc.) is deliberately NOT built and is
// not listed here.
//
// All features listed here are "available" — built and working today
// (testnet/Solana-testnet-verified; live network unlocked 2026-06-17 per internal audit).
const features = [
  { category: "Core Wallet", icon: Wallet, items: [
    { name: "Multi-Account HD Wallet", desc: "Recovery phrase standard (BIP-39) seed with multi-account derivation; keys held locally", status: "available" },
    { name: "Import Wallet", desc: "Restore from seed phrase or private key", status: "available" },
    { name: "Encrypted Vault", desc: "Strong on-device encryption at rest; plaintext keys never leave device", status: "available" },
    { name: "Backup & Reveal Seed", desc: "Seed phrase + encrypted QR backup behind explicit warnings", status: "available" },
    { name: "Send Crypto", desc: "Locally-signed transfers for all 10 assets (ETH, MATIC, ARB, OP, AVAX, BNB, BTC, SOL, USDC, USDT) — each confirmed on a test network or Solana test network with an on-chain txid", status: "available" },
    { name: "Receive Crypto", desc: "Per-chain derived address + locally-generated QR", status: "available" },
    { name: "Live Balances", desc: "Read live from chain network connection / explorer providers", status: "available" },
    { name: "Transaction History", desc: "Per-chain read-only history with privacy disclosures", status: "available" },
    { name: "Network Fee Control", desc: "Per-chain fee tiers + custom fee before signing", status: "available" },
    { name: "ENS / SNS Resolution", desc: "Resolve .eth and .sol names on send (resolution only)", status: "available" },
  ]},
  { category: "Networks & Assets", icon: Coins, items: [
    { name: "Ethereum-compatible Networks", desc: "Ethereum, Polygon, Arbitrum, Optimism, Avalanche, BNB Chain", status: "available" },
    { name: "Bitcoin", desc: "Bitcoin address standard (BIP-84) native-segwit stack; test-network-verified (live network unlocked, not yet live-network-verified)", status: "available" },
    { name: "Solana", desc: "Solana signing key / key derivation standard stack; Solana test network verified (live network unlocked, not yet live-network-verified)", status: "available" },
    { name: "Ethereum Token Standard (ERC-20) Tokens", desc: "USDC and USDT via the shared token path", status: "available" },
  ]},
  { category: "Access & Authentication", icon: KeyRound, items: [
    { name: "FIDO2 Passkey Unlock", desc: "FIDO2/WebAuthn passkey unlock gate — phishing-resistant, device-bound credential; keys are never held by the passkey system", status: "available" },
    { name: "Biometric Unlock", desc: "Face ID / Touch ID unlock gate with fallback", status: "available" },
    { name: "PIN Unlock", desc: "Numeric-PIN onboarding + returning-PIN unlock over the same Argon2id vault, with Face-ID-to-decoy. No hardware-bound KEK yet — a numeric PIN is offline-exhaustible on a seized device; hardware-KEK is the audit-gated fast-follow. UNAUDITED-PROVISIONAL.", status: "available" },
    { name: "Two-Factor at Critical Actions", desc: "Opt-in second factor before sensitive actions (send, reveal seed, duress/hidden setup): PIN + Action Password (per-set knowledge factor) or PIN + Passkey (possession, fails closed). Primary-set today; decoy/hidden parity audit-gated. UNAUDITED-PROVISIONAL.", status: "available" },
    { name: "Session Manager & Auto-Lock", desc: "Idle / background auto-lock + session view", status: "available" },
    { name: "Account Access & Recovery", desc: "Non-custodial change-password (re-encrypts seed) + seed-phrase recovery; no custodial reset", status: "available" },
    { name: "Hardware Wallet", desc: "Trezor (WebUSB, Chrome/Edge) — cold-key address derivation and transaction signing for ETH, BTC, and SOL; BTC and SOL send paths wired 2026-06-29. Private key never leaves the hardware device (I1). Decoy/hidden sessions block all Trezor egress (I3). Built, not device-verified.", status: "available" },
  ]},
  { category: "Transaction Safety", icon: ShieldAlert, items: [
    { name: "Token Approvals (View + Revoke)", desc: "Inspect and revoke token allowances; flag unlimited", status: "available" },
    { name: "Address-Poisoning Warnings", desc: "Look-alike recipient detection on send", status: "available" },
    { name: "Spam Token Filter", desc: "Auto-hide airdropped scam tokens with override", status: "available" },
    { name: "Transaction Data Decode & Approval Guard", desc: "Human-readable transaction data before signing", status: "available" },
    { name: "Suspicious-Address Screening", desc: "Local blocklist screening of burn / known-bad addresses (includes one known OFAC-sanctioned address); warns, never blocks. No live sanctions feed.", status: "available" },
    { name: "Transaction Simulation", desc: "Local-first pre-sign preview of balance / approval changes with risk flags", status: "available" },
    { name: "Anomaly / Fraud Detection", desc: "Local rule-based flags for deviations from your own history (unusual amount, new-recipient-large, approve-then-transfer)", status: "available" },
    { name: "Pre-Sign Risk Verdict", desc: "On-device signals (fresh recipient, unlimited/fresh-spender approval, poisoning, ENS mismatch, dust, transaction data mismatch, value anomaly) combine into one pre-sign verdict; a high-RISK verdict requires an explicit 'Sign anyway' acknowledgement, indeterminate fails closed to caution. Local-only, warns-not-blocks, never claims 'safe'. UNAUDITED-PROVISIONAL.", status: "available" },
  ]},
  { category: "Recovery & Duress", icon: LifeBuoy, items: [
    { name: "Duress PIN", desc: "Decoy wallet under coercion (genuine separate vault)", status: "available" },
    { name: "Stealth / Hidden Wallets", desc: "Deniable hidden-wallet pool; count-hiding", status: "available" },
    { name: "Panic Wipe", desc: "Irreversible local key-material destruction", status: "available" },
    { name: "Encrypted Personal Backup", desc: "Export/import vault as a strongly encrypted file; plaintext keys never leave device. UNAUDITED-PROVISIONAL.", status: "available" },
  ]},
  { category: "Monitoring & Risk", icon: Shield, items: [
    { name: "RASP", desc: "Browser-level automation detection active (navigator.webdriver → HOOKED → signing blocked). Degradation policy + send-path wiring built. OS-level probes (root/jailbreak) pending native plugin (independent audit complete 2026-06-23; real-device verification still needed). UNAUDITED-PROVISIONAL.", status: "available" },
    { name: "Audit Log", desc: "Opt-in local activity log. At most 100 { type, ts } entries encrypted in the vault — no amounts, addresses, or wallet identity. Off by default; no-op in decoy/hidden sessions.", status: "available" },
    { name: "Spending Limits", desc: "Rule-based per-transaction and daily spending limits (warn-with-acknowledgement)", status: "available" },
  ]},
  { category: "Portfolio & Analytics", icon: BarChart3, items: [
    { name: "Portfolio Dashboard", desc: "Read-only net-worth view across wallets and chains; live prices I2-gated behind opt-in", status: "available" },
    { name: "Net-Worth Tracker", desc: "Aggregate crypto net worth from on-device portfolio balances; I2-gated live price conversion", status: "available" },
    { name: "P&L Tracking", desc: "Realised/unrealised P&L records on-device; current prices from CryptoCompare (I2-gated)", status: "available" },
    { name: "On-Chain Analytics", desc: "Address-level tx lookup and inbound/outbound activity breakdown via public network connection", status: "available" },
    { name: "Fee Analytics", desc: "Stateless native-unit network fee totals computed on-device from chain history; Ethereum-compatible chains fail honest to 'unavailable'", status: "available" },
    { name: "Tax Report", desc: "Exports raw tx data (date/type/asset/amount/fee/tx_hash) as CSV — no invented prices. Directs to Koinly/CoinTracker. Not tax advice.", status: "available" },
  ]},
  { category: "Prices & Alerts", icon: Bell, items: [
    { name: "Price Charts", desc: "Real OHLCV candlestick data from CryptoCompare histoday; I2-gated", status: "available" },
    { name: "Price Alerts", desc: "Threshold notifications (advisory; never trades); evaluation I2-gated", status: "available" },
    { name: "Watchlist", desc: "Track assets you don't hold; real opt-in price feeds from CryptoCompare (I2-gated)", status: "available" },
    { name: "Notifications & Push", desc: "Web Push API opt-in subscription with test trigger; advisory only, never initiates transactions", status: "available" },
  ]},
  { category: "NFTs", icon: ImageIcon, items: [
    { name: "NFT Gallery (Display-Only)", desc: "View owned NFTs; no minting or marketplace. Records stored locally.", status: "available" },
    { name: "Multi-Chain NFT Viewing", desc: "Cross-chain NFT display with chain filtering (display only)", status: "available" },
  ]},
  { category: "Payments & Utilities", icon: CreditCard, items: [
    { name: "Address Book", desc: "Saved, labelled addresses with per-chain validation for safer sends", status: "available" },
    { name: "Message Signing", desc: "Sign plain messages with wallet key (ethers.js); proof-of-ownership / off-chain auth. No dApp-initiated signing.", status: "available" },
    { name: "Recurring Payments", desc: "Recurring payment schedule reminders; user signs each time. No autonomous auto-debit.", status: "available" },
  ]},
  { category: "Referrals", icon: Users, items: [
    { name: "Referral Tracker", desc: "Local referral-code tracking (random code, not seed-derived); no ranking or public profiles. Local-only by default — if a referral backend is configured at build time, the referral code (not balances or seed) is sent to it on register/redeem/status.", status: "available" },
  ]},
  { category: "Platform", icon: Smartphone, items: [
    { name: "Demo Mode", desc: "Browse without a backend or funded wallet", status: "available" },
    { name: "Voice Commands", desc: "Web Speech API navigation commands; read-only (navigate, check balances). Never initiates or signs transactions.", status: "available" },
  ]},
  { category: "Subscriptions", icon: CreditCard, items: [
    { name: "Free & Safety Plus Plans", desc: "Optional Free & Safety Plus plans to unlock features — the only fee VEYRNOX charges", status: "available" },
  ]},
];

const workflows = [
  {
    title: "Onboarding Flow",
    icon: Users,
    steps: [
      { step: 1, title: "Create or Import", desc: "Generate a new recovery phrase wallet or import an existing seed / private key" },
      { step: 2, title: "Set Unlock", desc: "Set a password and optionally enrol a passkey or biometric unlock gate" },
      { step: 3, title: "Backup Seed", desc: "Reveal and back up the recovery phrase (encrypted seed QR) behind warnings" },
      { step: 4, title: "Optional Safety Setup", desc: "Optionally configure a duress PIN, stealth wallet, or panic wipe" },
    ]
  },
  {
    title: "Send Crypto Flow",
    icon: Send,
    steps: [
      { step: 1, title: "Select Wallet & Asset", desc: "Choose the source wallet, chain, and asset" },
      { step: 2, title: "Enter Recipient", desc: "Paste an address, scan a QR, or resolve an ENS (.eth) / SNS (.sol) name" },
      { step: 3, title: "Safety Screening", desc: "Address-poisoning warnings flag look-alike recipients before you proceed" },
      { step: 4, title: "Enter Amount & Fee", desc: "Input the amount and pick a fee tier (or custom fee) for the chain" },
      { step: 5, title: "Confirm Transaction Data", desc: "Review a human-readable summary of the transaction data" },
      { step: 6, title: "Unlock & Sign", desc: "Authenticate (password / passkey / biometric); the transaction is signed locally" },
      { step: 7, title: "Broadcast", desc: "The signed transaction is broadcast and appears in transaction history" },
    ]
  },
  {
    title: "Receive Crypto Flow",
    icon: Download,
    steps: [
      { step: 1, title: "Select Chain", desc: "Choose the network you want to receive on" },
      { step: 2, title: "Show Address", desc: "The correct derived address is shown with a locally-generated QR code" },
      { step: 3, title: "Share or Copy", desc: "Copy the address or share the QR with the sender" },
      { step: 4, title: "Track Incoming", desc: "Incoming transfers appear in live balances and transaction history" },
    ]
  },
  {
    title: "Token Approval Review Flow",
    icon: ShieldAlert,
    steps: [
      { step: 1, title: "Open Token Approvals", desc: "List the token allowances your wallet has granted" },
      { step: 2, title: "Spot Risk", desc: "Unlimited or stale approvals to unknown contracts are flagged" },
      { step: 3, title: "Build Revoke", desc: "Choose an approval to revoke; the revoke transaction data is prepared" },
      { step: 4, title: "Sign Revoke", desc: "Authenticate and sign locally to shut down the exposure" },
    ]
  },
];

const STATUS_META = {
  available: { label: "Available", className: "bg-success/10 text-success border-success/20" },
};

export default function Documentation() {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredFeatures = features
    .map(cat => ({
      ...cat,
      items: cat.items.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.desc.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }))
    .filter(cat => cat.items.length > 0);

  const allItems = features.flatMap(cat => cat.items);
  const totalFeatures = allItems.length;

  return (
    <div className="max-w-[1600px] mx-auto p-4 sm:p-6 space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">VEYRNOX Documentation</h1>
          <p className="text-muted-foreground mt-1">Feature guide and user workflows for a blockchain-powered multi-currency self-custody wallet with FIDO2 authentication</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => window.print()}>
            <FileText className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button onClick={() => {
            try {
              exportCataloguePdf({
                title: "Documentation",
                subtitle: "Feature guide for a blockchain-powered multi-currency self-custody wallet with FIDO2 authentication. Scope follows docs/WalletFeatures.spec.md. Live network unlocked 2026-06-17 (internal audit complete).",
                categories: features.map(c => ({
                  category: c.category,
                  items: c.items.map(i => ({ name: i.name, desc: i.desc, status: i.status })),
                })),
              });
              toast.success("Documentation PDF downloaded");
            } catch (error) {
              console.error("PDF generation failed:", error);
              toast.error("Failed to generate documentation PDF");
            }
          }}>
            <FileText className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search features..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Overview */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-primary" />
              Self-Custody Architecture
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Your seed phrase is the wallet. Private keys are derived and used on-device only — they never leave your device or touch a server. There is no custodial backstop or recovery by VEYRNOX.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-primary" />
              FIDO2 / Passkey Authentication
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Unlock with a FIDO2 passkey (WebAuthn) or biometric (Face ID / Touch ID). The passkey is device-bound and phishing-resistant — it never holds or has access to your keys.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="h-4 w-4 text-primary" />
              Multi-Currency Support
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            10 assets across 8 networks: ETH, MATIC, ARB, OP, AVAX, BNB, BTC, SOL, USDC, and USDT. One HD seed derives all accounts. Each send is locally signed and individually broadcast.
          </CardContent>
        </Card>
      </div>

      {/* Features Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Book className="h-5 w-5" />
            Feature Catalog
          </CardTitle>
          <CardDescription>
            {totalFeatures} features across {features.length} categories — all available today. Custodial features (swaps, fiat, KYC) are not built by design.
          </CardDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant="outline" className={STATUS_META.available.className}>{totalFeatures} Available</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" defaultValue={["cat-0", "cat-1", "cat-2"]} className="w-full">
            {filteredFeatures.map((category, idx) => (
              <AccordionItem key={category.category} value={`cat-${idx}`}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3">
                    <category.icon className="h-5 w-5 text-primary" />
                    <div className="text-left">
                      <p className="font-semibold">{category.category}</p>
                      <p className="text-xs text-muted-foreground">{category.items.length} features</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[250px]">Feature</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-[120px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {category.items.map((feature) => (
                        <TableRow key={feature.name}>
                          <TableCell className="font-medium" data-label="Feature">{feature.name}</TableCell>
                          <TableCell className="text-muted-foreground" data-label="Description">{feature.desc}</TableCell>
                          <TableCell data-label="Status">
                            <Badge variant="outline" className={STATUS_META[feature.status].className}>
                              {STATUS_META[feature.status].label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Workflows */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Key User Workflows
          </CardTitle>
          <CardDescription>Step-by-step guides for common tasks (built features only)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {workflows.map((workflow) => (
              <Card key={workflow.title}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <workflow.icon className="h-5 w-5 text-primary" />
                    {workflow.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {workflow.steps.map((step, idx) => (
                      <div key={step.step} className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                          {step.step}
                        </div>
                        <div className="flex-1 pt-1">
                          <p className="font-semibold text-sm">{step.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                        </div>
                        {idx < workflow.steps.length - 1 && (
                          <ChevronRight className="h-4 w-4 text-muted-foreground self-center" />
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Navigation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              { path: "/", label: "Dashboard", icon: LayoutDashboard },
              { path: "/send", label: "Send Crypto", icon: Send },
              { path: "/receive", label: "Receive", icon: Download },
              { path: "/tx-history", label: "Transaction History", icon: FileText },
              { path: "/token-approvals", label: "Token Approvals", icon: ShieldAlert },
              { path: "/security", label: "Security Center", icon: Shield },
            ].map((link) => (
              <Link key={link.path} to={link.path}>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
