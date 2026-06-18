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
  Wallet, Shield, Bell, BarChart3, Zap,
  Search, ChevronRight, Book, Layers, Users, CreditCard, KeyRound,
  Lock, Smartphone, Globe, FileText, ShieldAlert, LifeBuoy,
  LayoutDashboard, Send, Download, Image as ImageIcon, Coins
} from "lucide-react";

// Scope contract: docs/WalletFeatures.spec.md (canonical three-way split).
// This catalogue lists ONLY self-custody-safe, in-scope features (spec A = in-scope
// + B = self-custody-safe gaps). Everything in spec section C (custodial / regulated
// — swaps, perps, staking/yield/lending, fiat ramps, bank links, KYC/DID, NFT
// minting, DAO/payroll, encrypted messaging, etc.) is deliberately NOT built and is
// not listed here.
//
// Status is HONEST, cross-checked against actual implementation (wallet-core + real
// routes):
//   "available" — built and working today (testnet; mainnet gated until audited)
//   "roadmap"   — in scope and specced, NOT yet built ("coming soon")
const features = [
  { category: "Core Wallet", icon: Wallet, items: [
    { name: "Multi-Account HD Wallet", desc: "BIP-39 seed with multi-account derivation; keys held locally", status: "available" },
    { name: "Import Wallet", desc: "Restore from seed phrase or private key", status: "available" },
    { name: "Encrypted Vault", desc: "Argon2id + AES-256-GCM at rest; plaintext keys never leave device", status: "available" },
    { name: "Backup & Reveal Seed", desc: "Seed phrase + encrypted QR backup behind explicit warnings", status: "available" },
    { name: "Send Crypto", desc: "Locally-signed native transfers; ETH/Sepolia is live, other assets are receive-only pending per-asset send verification", status: "available" },
    { name: "Receive Crypto", desc: "Per-chain derived address + locally-generated QR", status: "available" },
    { name: "Live Balances", desc: "Read live from chain RPC / explorer providers", status: "available" },
    { name: "Transaction History", desc: "Per-chain read-only history with privacy disclosures", status: "available" },
    { name: "Gas / Fee Control", desc: "Per-chain fee tiers + custom fee before signing", status: "available" },
    { name: "ENS / SNS Resolution", desc: "Resolve .eth and .sol names on send (resolution only)", status: "available" },
  ]},
  { category: "Networks & Assets", icon: Coins, items: [
    { name: "EVM Networks", desc: "Ethereum, Polygon, Arbitrum, Optimism, Avalanche, BNB Chain", status: "available" },
    { name: "Bitcoin", desc: "BIP-84 native-segwit stack (testnet; mainnet gated)", status: "available" },
    { name: "Solana", desc: "ed25519 / SLIP-0010 stack (devnet; mainnet gated)", status: "available" },
    { name: "ERC-20 Tokens", desc: "USDC and USDT via the shared token path", status: "available" },
    { name: "Additional Tokens", desc: "More ERC-20 tokens (DAI, LINK …) reuse the token path", status: "roadmap" },
    { name: "Additional Networks", desc: "More EVM chains (Base, zkSync …), config-level", status: "roadmap" },
  ]},
  { category: "Access & Authentication", icon: KeyRound, items: [
    { name: "Passkey Unlock", desc: "FIDO2 / WebAuthn unlock gate; never holds keys", status: "available" },
    { name: "Biometric Unlock", desc: "Face ID / Touch ID unlock gate with fallback", status: "available" },
    { name: "Native Secure Storage", desc: "Secure Enclave / Android Keystore hardening", status: "roadmap" },
    { name: "Session Manager & Auto-Lock", desc: "Idle / background auto-lock + session view", status: "available" },
    { name: "Account Access & Recovery", desc: "Non-custodial change-password (re-encrypts seed) + seed-phrase recovery; no custodial reset", status: "available" },
    { name: "Hardware Wallet", desc: "Ledger / Trezor cold-key signing", status: "roadmap" },
  ]},
  { category: "Transaction Safety", icon: ShieldAlert, items: [
    { name: "Token Approvals (View + Revoke)", desc: "Inspect and revoke ERC-20 allowances; flag unlimited", status: "available" },
    { name: "Address-Poisoning Warnings", desc: "Look-alike recipient detection on send", status: "available" },
    { name: "Spam Token Filter", desc: "Auto-hide airdropped scam tokens with override", status: "available" },
    { name: "Calldata Decode & Approval Guard", desc: "Human-readable calldata before signing", status: "available" },
    { name: "Suspicious-Address Screening", desc: "Local suspicious-address + OFAC sanctions screening; warns, never blocks", status: "available" },
    { name: "Transaction Simulation", desc: "Local-first pre-sign preview of balance / approval changes with risk flags", status: "available" },
    { name: "Anomaly / Fraud Detection", desc: "Local rule-based flags for deviations from your own history (unusual amount, new-recipient-large, approve-then-transfer)", status: "available" },
  ]},
  { category: "Recovery & Duress", icon: LifeBuoy, items: [
    { name: "Duress PIN", desc: "Decoy wallet under coercion (genuine separate vault)", status: "available" },
    { name: "Stealth / Hidden Wallets", desc: "Deniable hidden-wallet pool; count-hiding", status: "available" },
    { name: "Panic Wipe", desc: "Irreversible local key-material destruction", status: "available" },
    { name: "Crypto Will / Inheritance", desc: "Self-custody inheritance (secret-sharing + dead-man's-switch; no custodial backstop)", status: "roadmap" },
    { name: "Encrypted Cloud Backup", desc: "Ciphertext-only vault backup", status: "roadmap" },
  ]},
  { category: "Monitoring & Risk", icon: Shield, items: [
    { name: "RASP", desc: "Browser-level automation detection active (navigator.webdriver → HOOKED → signing blocked). Degradation policy + send-path wiring built. OS-level probes (root/jailbreak) pending native plugin + audit. UNAUDITED-PROVISIONAL.", status: "available" },
    { name: "Audit Log", desc: "Opt-in local activity log. At most 100 { type, ts } entries encrypted as AES-GCM vault blob — no amounts, addresses, or wallet identity. Off by default; no-op in decoy/hidden sessions.", status: "available" },
    { name: "Spending Limits", desc: "Rule-based per-transaction and daily spending limits (warn-with-acknowledgement)", status: "available" },
  ]},
  { category: "Portfolio & Analytics", icon: BarChart3, items: [
    { name: "Portfolio Dashboard", desc: "Read-only net-worth view across wallets and chains", status: "roadmap" },
    { name: "Net-Worth Tracker", desc: "Aggregate crypto holdings over time", status: "roadmap" },
    { name: "P&L Tracking", desc: "Realised / unrealised profit and loss", status: "roadmap" },
    { name: "On-Chain Analytics", desc: "Insights over public on-chain data", status: "roadmap" },
    { name: "Fee Analytics", desc: "Track and optimise fees paid", status: "roadmap" },
    { name: "What-If Simulator", desc: "Model hypothetical allocation changes (executes nothing)", status: "roadmap" },
    { name: "Tax Report", desc: "Read-only capital gains / loss export", status: "roadmap" },
  ]},
  { category: "Prices & Alerts", icon: Bell, items: [
    { name: "Price Charts", desc: "Historical price charts", status: "roadmap" },
    { name: "Price Alerts", desc: "Threshold notifications (advisory; never trades)", status: "roadmap" },
    { name: "Watchlist", desc: "Track assets you don't hold", status: "roadmap" },
    { name: "Notifications & Push", desc: "Notification centre + push delivery", status: "roadmap" },
  ]},
  { category: "NFTs", icon: ImageIcon, items: [
    { name: "NFT Gallery (Display-Only)", desc: "View owned NFTs; no minting or marketplace", status: "roadmap" },
    { name: "Multi-Chain NFT Viewing", desc: "View NFTs across chains (display only)", status: "roadmap" },
  ]},
  { category: "Payments & Utilities", icon: CreditCard, items: [
    { name: "Address Book", desc: "Saved, labelled addresses with per-chain validation for safer sends", status: "available" },
    { name: "Message Signing", desc: "Sign arbitrary messages for proof-of-ownership", status: "roadmap" },
    { name: "Split Bill", desc: "Split a cost; each pays from their own wallet", status: "roadmap" },
    { name: "Payment Links", desc: "Shareable request-to-pay link / QR (no processing)", status: "roadmap" },
    { name: "Recurring Payments", desc: "Self-initiated, user-signed each time (no auto-debit)", status: "roadmap" },
  ]},
  { category: "Referrals", icon: Users, items: [
    { name: "Referral Tracker", desc: "Privacy-preserving referral sign-ups; no ranking or public profiles (cut on principle)", status: "roadmap" },
  ]},
  { category: "AI Assistant (Advisory-Only)", icon: Zap, items: [
    { name: "Transaction Explanation", desc: "Plain-language description of a transaction", status: "roadmap" },
    { name: "Scam & Phishing Explanation", desc: "Explain why something looks risky", status: "roadmap" },
    { name: "Educational Assistant", desc: "Answer gas / approval / format questions", status: "roadmap" },
    { name: "Portfolio Q&A", desc: "Questions over public on-chain data (never trades)", status: "roadmap" },
  ]},
  { category: "dApp Connectivity (Post-Audit)", icon: Globe, items: [
    { name: "WalletConnect / dApp Connector", desc: "Connect to dApps; high-risk, post-audit only", status: "roadmap" },
    { name: "Web3 Browser", desc: "In-app dApp browser; post-audit only", status: "roadmap" },
  ]},
  { category: "Platform", icon: Smartphone, items: [
    { name: "Desktop Web App", desc: "Runs in the browser today", status: "available" },
    { name: "Demo Mode", desc: "Browse without a backend or funded wallet", status: "available" },
    { name: "iOS App", desc: "Native iOS shell (submission gated on Apple org account)", status: "roadmap" },
    { name: "Android App", desc: "Native Android shell (scaffolded)", status: "roadmap" },
    { name: "Voice Commands", desc: "Hands-free read-only actions; never unattended signing", status: "roadmap" },
  ]},
];

const workflows = [
  {
    title: "Onboarding Flow",
    icon: Users,
    steps: [
      { step: 1, title: "Create or Import", desc: "Generate a new BIP-39 wallet or import an existing seed / private key" },
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
      { step: 5, title: "Confirm with Calldata", desc: "Review a human-readable summary of the transaction calldata" },
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
      { step: 1, title: "Open Token Approvals", desc: "List the ERC-20 allowances your wallet has granted" },
      { step: 2, title: "Spot Risk", desc: "Unlimited or stale approvals to unknown contracts are flagged" },
      { step: 3, title: "Build Revoke", desc: "Choose an approval to revoke; the revoke calldata is prepared" },
      { step: 4, title: "Sign Revoke", desc: "Authenticate and sign locally to shut down the exposure" },
    ]
  },
];

const STATUS_META = {
  available: { label: "Available", className: "bg-green-500/10 text-green-600 border-green-500/20" },
  roadmap: { label: "Roadmap", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
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
  const availableCount = allItems.filter(i => i.status === "available").length;
  const roadmapCount = totalFeatures - availableCount;

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Veyrnox Documentation</h1>
          <p className="text-muted-foreground mt-1">Feature guide and user workflows for a non-custodial, security-first self-custody wallet</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <FileText className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button onClick={() => {
            try {
              exportCataloguePdf({
                title: "Documentation",
                subtitle: "Feature guide for a non-custodial, security-first self-custody wallet. Scope follows docs/WalletFeatures.spec.md; \"available\" is testnet (mainnet gated until audit).",
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

      {/* Features Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Book className="h-5 w-5" />
            Feature Catalog
          </CardTitle>
          <CardDescription>
            {totalFeatures} in-scope features across {features.length} categories — {availableCount} available
            today, {roadmapCount} on the roadmap. Scope follows docs/WalletFeatures.spec.md; custodial /
            regulated features (swaps, perps, staking/yield/lending, fiat ramps, bank links, KYC/DID, NFT
            minting, etc.) are deliberately not built. "Available" is testnet; mainnet is gated until audit.
          </CardDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant="outline" className={STATUS_META.available.className}>{availableCount} Available</Badge>
            <Badge variant="outline" className={STATUS_META.roadmap.className}>{roadmapCount} Roadmap</Badge>
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
                          <TableCell className="font-medium">{feature.name}</TableCell>
                          <TableCell className="text-muted-foreground">{feature.desc}</TableCell>
                          <TableCell>
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

      {/* Technical Architecture */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Architecture
          </CardTitle>
          <CardDescription>What is built today — non-custodial by design</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-lg bg-secondary/50">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Keys & Vault
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Argon2id + AES-256-GCM vault</li>
                <li>• Keys generated &amp; held locally</li>
                <li>• Plaintext keys never leave device</li>
                <li>• Non-custodial — no key escrow</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                Transaction Safety
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Calldata decode before signing</li>
                <li>• Token approval view + revoke</li>
                <li>• Address-poisoning warnings</li>
                <li>• Spam-token filter</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <LifeBuoy className="h-4 w-4" />
                Access & Recovery
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Passkey / biometric unlock</li>
                <li>• Duress PIN (decoy wallet)</li>
                <li>• Stealth / hidden wallets</li>
                <li>• Panic wipe</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Testnet today; mainnet is gated until independent audit. Roadmap hardening (native secure
            storage, session auto-lock, RASP, audit log, encrypted ciphertext backup) is tracked in the
            feature catalog above.
          </p>
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
