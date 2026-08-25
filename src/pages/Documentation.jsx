// @ts-nocheck
import { useState } from "react";
import { exportCataloguePdf } from "@/lib/pdfExport";
import { FEATURE_CATEGORIES, STATUS, resolveStatus, verifiedFeatureNames } from "@/lib/featureCatalogue";
import { toast } from "@/lib/toast";
import { Link } from "react-router";
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

// Feature catalogue — SINGLE SOURCE OF TRUTH is src/lib/featureCatalogue.js.
//
// This page used to carry its OWN parallel list of 58 features with its own
// three labels (built/target/planned -> Available/Coming Soon/Roadmap) and no
// evidence gating, while src/lib/featureCatalogue.js carried a second list of
// 70 with the txid-backed gate. Two catalogues, and the honest one was the
// unrouted one (src/pages/Features.jsx, which nothing imported). Merged
// 2026-08-24: this page now renders the catalogue, and Features.jsx is deleted.
//
// Nothing from the old list was dropped. 44 names matched outright; 9 were
// renames, preserved via the catalogue's optional `displayName` so users keep
// the plainer wording while the audit-stable `name` (which tests and
// verified-evidence keys are keyed on) is untouched; and the one genuinely
// missing category, Subscriptions, was added to the catalogue.
//
// Status labels come from resolveStatus(), so `verified` is earned by a real
// txid in docs/verified-evidence.json and can never be typed by hand.
const CATEGORY_ICONS = {
  'Core Wallet': Wallet,
  'Networks & Assets': Coins,
  'Access & Authentication': KeyRound,
  'Transaction Safety': ShieldAlert,
  'Recovery & Duress': LifeBuoy,
  'Monitoring & Risk': Shield,
  'Portfolio & Analytics': BarChart3,
  'Prices & Alerts': Bell,
  'NFTs': ImageIcon,
  'Payments & Utilities': CreditCard,
  'Referrals': Users,
  'AI Security Protection': ShieldAlert,
  'dApp Connectivity': Layers,
  'Platform': Smartphone,
  'Subscriptions': CreditCard,
};

const features = FEATURE_CATEGORIES.map((c) => ({
  category: c.category,
  icon: CATEGORY_ICONS[c.category] ?? Book,
  items: c.features.map((f) => ({
    key: f.name,
    name: f.displayName ?? f.name,
    desc: f.summary,
    // `explanation` is DELIBERATELY NOT RENDERED. Those fields are written in
    // the audit voice and carry 39 matches across 10 of the internal-wording
    // patterns that documentation-honesty.test.js bans — testnet names, change
    // numbers, transaction hashes, subsystem codenames, device models.
    // Rendering them here would undo the copy pass that removed exactly that
    // wording from this page. Summaries carry the user-facing copy, and the
    // honesty guard now scans them too, so the catalogue cannot leak audit
    // prose onto this page through a later edit.
    feature: f,
  })),
}));

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
  [STATUS.VERIFIED]: { label: "Verified",  className: "bg-accent/10 text-accent border-accent/20" },
  [STATUS.BUILT]:    { label: "Live",      className: "bg-caution/10 text-caution border-caution/20" },
  [STATUS.ROADMAP]:  { label: "Roadmap",   className: "bg-muted/50 text-muted-foreground border-border" },
};

export default function Documentation() {
  const [searchTerm, setSearchTerm] = useState("");

  // Resolve once: `verified` is honoured only with a txid evidence entry, so a
  // code-ready feature can never render as verified by inspection.
  const verifiedNames = verifiedFeatureNames();
  const statusOf = (item) => resolveStatus(item.feature, verifiedNames);

  const q = searchTerm.toLowerCase();
  const filteredFeatures = features
    .map(cat => ({
      ...cat,
      items: cat.items.filter(item =>
        // Search matches the displayed name, the audit-stable name (so an
        // internal name still finds its feature), and the shown description.
        item.name.toLowerCase().includes(q) ||
        item.key.toLowerCase().includes(q) ||
        (item.desc ?? "").toLowerCase().includes(q)
      )
    }))
    .filter(cat => cat.items.length > 0);

  const allItems = features.flatMap(cat => cat.items);
  const totalFeatures = allItems.length;
  const verifiedCount = allItems.filter(i => statusOf(i) === STATUS.VERIFIED).length;
  const builtCount    = allItems.filter(i => statusOf(i) === STATUS.BUILT).length;
  const roadmapCount  = allItems.filter(i => statusOf(i) === STATUS.ROADMAP).length;

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
            <FileText className="h-4 w-4 me-2" />
            Print
          </Button>
          <Button onClick={() => {
            try {
              exportCataloguePdf({
                title: "Documentation",
                subtitle: "Feature guide for VEYRNOX — a self-custody multi-currency wallet with FIDO2 authentication.",
                categories: features.map(c => ({
                  category: c.category,
                  items: c.items.map(i => ({ name: i.name, desc: i.desc, status: statusOf(i) })),
                })),
              });
              toast.success("Documentation PDF downloaded");
            } catch (error) {
              console.error("PDF generation failed:", error);
              toast.error("Failed to generate documentation PDF");
            }
          }}>
            <FileText className="h-4 w-4 me-2" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search features..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="ps-10"
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
            {totalFeatures} features across {features.length} categories. Custodial features (swaps, fiat off-ramp, KYC) are not built by design; the fiat on-ramp is a hand-off to a licensed third party.
          </CardDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant="outline" className={STATUS_META[STATUS.VERIFIED].className}>{verifiedCount} Verified</Badge>
            <Badge variant="outline" className={STATUS_META[STATUS.BUILT].className}>{builtCount} Live</Badge>
            {roadmapCount > 0 && <Badge variant="outline" className={STATUS_META[STATUS.ROADMAP].className}>{roadmapCount} Roadmap</Badge>}
          </div>
          <p className="text-xs text-muted-foreground pt-2 max-w-3xl">
            <b>Verified</b> means a real, explorer-confirmed transaction proves it — this page reads a
            txid evidence file and nothing else, so passing tests and code review can never turn a
            feature green. <b>Live</b> means the code is shipped and working but no on-chain evidence
            exists yet. <b>Roadmap</b> means planned for later. These labels describe what is built —
            they are not an independent security review.
          </p>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" defaultValue={["cat-0", "cat-1", "cat-2"]} className="w-full">
            {filteredFeatures.map((category, idx) => (
              <AccordionItem key={category.category} value={`cat-${idx}`}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3">
                    <category.icon className="h-5 w-5 text-primary" />
                    <div className="text-start">
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
                      {category.items.map((item) => {
                        const status = statusOf(item);
                        return (
                          <TableRow key={item.key}>
                            <TableCell className="font-medium" data-label="Feature">{item.name}</TableCell>
                            <TableCell className="text-muted-foreground" data-label="Description">{item.desc}</TableCell>
                            <TableCell data-label="Status">
                              <Badge variant="outline" className={STATUS_META[status].className}>
                                {STATUS_META[status].label}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
                          // Icon mirrors under dir="rtl" — this separates ordered
                          // workflow steps, so it must point "forward in reading
                          // direction" like a breadcrumb separator.
                          <ChevronRight className="h-4 w-4 text-muted-foreground self-center rtl:-scale-x-100" />
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
