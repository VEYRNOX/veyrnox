import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { 
  Accordion, AccordionContent, AccordionItem, AccordionTrigger 
} from "@/components/ui/accordion";
import { 
  Wallet, Shield, ArrowDownUp, Bell, BarChart3, Key, Globe, Zap, 
  Search, ChevronRight, Book, Layers, Users, CreditCard, TrendingUp,
  Lock, ScanLine, RefreshCw, Cloud, Smartphone, Vote, Leaf, Bot,
  MessageSquare, Landmark, Receipt, Target, Share2, FileText,
  LayoutDashboard, Send, Download
} from "lucide-react";

const features = [
  { category: "Core Wallet", icon: Wallet, items: [
    { name: "Multi-Chain Support", desc: "Bitcoin, Ethereum, Solana, Polygon, BSC, Cosmos, Tron, Sui", status: "Active" },
    { name: "Send/Receive", desc: "Secure crypto transfers with QR scanning and ENS/SNS resolution", status: "Active" },
    { name: "Cross-Chain Swap", desc: "Aggregate DEX swaps across multiple chains", status: "Active" },
    { name: "Address Book", desc: "Save and manage trusted wallet addresses", status: "Active" },
    { name: "Transaction History", desc: "Complete transaction log with filtering and export", status: "Active" },
  ]},
  { category: "Security", icon: Shield, items: [
    { name: "Passkey Authentication", desc: "Biometric login using WebAuthn/FIDO2", status: "Active" },
    { name: "Email OTP 2FA", desc: "Two-factor authentication for high-risk actions", status: "Active" },
    { name: "Address Whitelist", desc: "Restrict withdrawals to pre-approved addresses", status: "Active" },
    { name: "Transaction Limits", desc: "Daily/per-transaction USD limits with alerts", status: "Active" },
    { name: "Hardware Wallet", desc: "Ledger, Trezor, Coldcard integration", status: "Active" },
    { name: "Multi-Sig Wallets", desc: "M-of-N signature wallets for enhanced security", status: "Active" },
    { name: "RASP Security", desc: "Runtime Application Self-Protection", status: "Active" },
    { name: "Geo-Blocking", desc: "Restrict access by country/region", status: "Active" },
  ]},
  { category: "Portfolio Management", icon: BarChart3, items: [
    { name: "Dashboard Overview", desc: "Real-time portfolio value, allocation charts, P&L tracking", status: "Active" },
    { name: "Net Worth Tracker", desc: "Track crypto + traditional assets (property, stocks, cash)", status: "Active" },
    { name: "Custom Index Builder", desc: "Create and manage custom crypto indices", status: "Active" },
    { name: "Portfolio Snapshots", desc: "Time-travel portfolio value at historical dates", status: "Active" },
    { name: "What-If Simulator", desc: "Model hypothetical trades and their impact", status: "Active" },
    { name: "Shared Portfolio View", desc: "Generate shareable portfolio links with privacy controls", status: "Active" },
    { name: "Benchmarking", desc: "Compare performance against market indices", status: "Active" },
  ]},
  { category: "Trading & Swaps", icon: ArrowDownUp, items: [
    { name: "DEX Aggregator", desc: "Best-price swaps across Uniswap, PancakeSwap, etc.", status: "Active" },
    { name: "Perpetuals Trading", desc: "Leveraged trading with up to 50x", status: "Active" },
    { name: "Limit Orders", desc: "Price-triggered buy/sell orders", status: "Active" },
    { name: "Conditional Swaps", desc: "Auto-swap when price targets are hit", status: "Active" },
    { name: "Social Trading", desc: "Follow and copy top traders' signals", status: "Active" },
    { name: "Trade Signals", desc: "AI-generated trading recommendations", status: "Active" },
  ]},
  { category: "DeFi & Yield", icon: TrendingUp, items: [
    { name: "Staking", desc: "Earn yield on ETH, SOL, and other PoS assets", status: "Active" },
    { name: "Yield Farming", desc: "Liquidity provision across DeFi protocols", status: "Active" },
    { name: "Lending/Borrowing", desc: "Collateralized loans via Aave, Compound", status: "Active" },
    { name: "Crypto Loans", desc: "Track and manage collateralized debt positions", status: "Active" },
    { name: "Rebalancing", desc: "Auto-rebalance portfolio to target allocations", status: "Active" },
    { name: "DCA Schedules", desc: "Dollar-cost averaging automation", status: "Active" },
  ]},
  { category: "Payments & Banking", icon: CreditCard, items: [
    { name: "Fiat Ramp", desc: "Buy/sell crypto via bank transfer (SEPA, SWIFT, FPS)", status: "Active" },
    { name: "Recurring Payments", desc: "Schedule automatic crypto payments", status: "Active" },
    { name: "Crypto Payroll", desc: "Pay employees/contractors in crypto", status: "Active" },
    { name: "Split Bills", desc: "Split expenses and collect from multiple people", status: "Active" },
    { name: "Invoice Generator", desc: "Create crypto payment invoices with QR codes", status: "Active" },
    { name: "Payment Links", desc: "Generate merchant payment QR codes", status: "Active" },
    { name: "Bank Link", desc: "Connect European bank accounts via Open Banking", status: "Active" },
    { name: "Subscriptions", desc: "Track and manage recurring crypto subscriptions", status: "Active" },
  ]},
  { category: "Analytics & Insights", icon: BarChart3, items: [
    { name: "Advanced Analytics", desc: "Portfolio performance, win rate, Sharpe ratio", status: "Active" },
    { name: "On-Chain Analytics", desc: "Track whale movements, smart money flows", status: "Active" },
    { name: "Spending Patterns", desc: "Categorize and analyze crypto spending", status: "Active" },
    { name: "Fee Analytics", desc: "Track gas fees and optimize transaction costs", status: "Active" },
    { name: "Tax Report", desc: "Generate capital gains/losses reports", status: "Active" },
    { name: "Tax Harvesting", desc: "Identify loss harvesting opportunities", status: "Active" },
    { name: "P&L Tracking", desc: "Real-time profit/loss by asset and wallet", status: "Active" },
  ]},
  { category: "Alerts & Automation", icon: Bell, items: [
    { name: "Price Alerts", desc: "Push/email alerts for price thresholds", status: "Active" },
    { name: "Smart Alerts", desc: "AI-powered anomaly detection alerts", status: "Active" },
    { name: "Messenger Alerts", desc: "Telegram/WhatsApp notifications", status: "Active" },
    { name: "Webhook Builder", desc: "Custom webhooks for external integrations", status: "Active" },
    { name: "Portfolio Automation", desc: "Rule-based auto-trading and rebalancing", status: "Active" },
    { name: "Trading Bots", desc: "Deploy automated trading strategies", status: "Active" },
  ]},
  { category: "NFTs", icon: Image, items: [
    { name: "NFT Portfolio", desc: "View NFTs across multiple chains", status: "Active" },
    { name: "NFT Gallery", desc: "Showcase NFTs with custom displays", status: "Active" },
    { name: "NFT Minting", desc: "Mint NFTs directly from the wallet", status: "Active" },
    { name: "Multi-Chain NFT", desc: "Support for Ethereum, Solana, Polygon NFTs", status: "Active" },
  ]},
  { category: "Identity & Social", icon: Users, items: [
    { name: "DID Management", desc: "Decentralized identity credentials", status: "Active" },
    { name: "ENS Registration", desc: "Register and manage .eth domains", status: "Active" },
    { name: "Public Profiles", desc: "Shareable trader profiles with stats", status: "Active" },
    { name: "Leaderboard", desc: "Rank traders by performance", status: "Active" },
    { name: "Encrypted Messaging", desc: "End-to-end encrypted chat between users", status: "Active" },
    { name: "Referral Tracker", desc: "Track and reward referrals", status: "Active" },
  ]},
  { category: "Advanced Features", icon: Zap, items: [
    { name: "DAO Governance", desc: "Vote on proposals across protocols", status: "Active" },
    { name: "Carbon Tracker", desc: "Track and offset crypto carbon footprint", status: "Active" },
    { name: "Crypto Will", desc: "Estate planning and inheritance setup", status: "Active" },
    { name: "Fraud Detection", desc: "AI-powered scam detection", status: "Active" },
    { name: "Cross-Chain Bridge", desc: "Bridge assets between chains", status: "Active" },
    { name: "Token Approvals", desc: "Monitor and revoke token allowances", status: "Active" },
    { name: "Spam Token Filter", desc: "Auto-hide scam tokens", status: "Active" },
  ]},
  { category: "Mobile & Accessibility", icon: Smartphone, items: [
    { name: "PWA Install", desc: "Install as native app on iOS/Android", status: "Active" },
    { name: "Mobile Widget", desc: "Home screen portfolio widgets", status: "Active" },
    { name: "Voice Commands", desc: "Voice-controlled wallet actions", status: "Active" },
    { name: "Biometric Auth", desc: "Face ID / Touch ID login", status: "Active" },
    { name: "DApp Connector", desc: "WalletConnect v2 for dApp access", status: "Active" },
    { name: "Web3 Browser", desc: "Built-in dApp browser", status: "Active" },
  ]},
];

const workflows = [
  {
    title: "Onboarding Flow",
    icon: Users,
    steps: [
      { step: 1, title: "Account Creation", desc: "User registers with email + password, verifies via OTP" },
      { step: 2, title: "Passkey Setup", desc: "Enroll biometric authentication (Face ID, Touch ID, Windows Hello)" },
      { step: 3, title: "Wallet Creation", desc: "Create first wallet (BTC, ETH, SOL) with auto-generated seed phrase" },
      { step: 4, title: "Backup Seed QR", desc: "Download encrypted QR backup of seed phrase" },
      { step: 5, title: "KYC Verification", desc: "Optional identity verification for fiat ramps" },
    ]
  },
  {
    title: "Send Crypto Flow",
    icon: ArrowDownUp,
    steps: [
      { step: 1, title: "Select Wallet", desc: "Choose source wallet and asset" },
      { step: 2, title: "Enter Recipient", desc: "Paste address, scan QR, or use ENS/SNS name" },
      { step: 3, title: "Whitelist Check", desc: "System validates if address is whitelisted; warns if not" },
      { step: 4, title: "Enter Amount", desc: "Input amount with USD equivalent display" },
      { step: 5, title: "2FA Verification", desc: "Authenticate via Passkey OR Email OTP" },
      { step: 6, title: "Transaction Broadcast", desc: "Signed transaction sent to blockchain" },
      { step: 7, title: "Audit Log", desc: "Transaction recorded in immutable audit trail" },
    ]
  },
  {
    title: "Portfolio Rebalancing Flow",
    icon: RefreshCw,
    steps: [
      { step: 1, title: "Set Target Allocation", desc: "Define desired portfolio percentages (e.g., 50% BTC, 30% ETH, 20% SOL)" },
      { step: 2, title: "Enable Monitoring", desc: "System tracks drift in real-time" },
      { step: 3, title: "Drift Alert", desc: "Notification when allocation deviates > threshold (e.g., 5%)" },
      { step: 4, title: "Review Trades", desc: "System calculates optimal rebalancing trades" },
      { step: 5, title: "Execute Trades", desc: "User approves; DEX aggregator finds best routes" },
      { step: 6, title: "Confirmation", desc: "Portfolio returns to target allocation" },
    ]
  },
  {
    title: "Fiat On-Ramp Flow",
    icon: Landmark,
    steps: [
      { step: 1, title: "Select Currency", desc: "Choose fiat (GBP, EUR, USD) and crypto asset" },
      { step: 2, title: "Enter Amount", desc: "Input fiat amount to spend" },
      { step: 3, title: "Bank Link", desc: "Connect bank via Open Banking (PSD2)" },
      { step: 4, title: "KYC Check", desc: "Verify identity if first-time or large amount" },
      { step: 5, title: "SEPA/SWIFT Transfer", desc: "Initiate bank transfer to partner exchange" },
      { step: 6, title: "Crypto Credit", desc: "Crypto deposited to wallet upon settlement (1-3 days)" },
    ]
  },
  {
    title: "Staking Flow",
    icon: TrendingUp,
    steps: [
      { step: 1, title: "Select Asset", desc: "Choose stakeable asset (ETH, SOL, etc.)" },
      { step: 2, title: "Choose Validator", desc: "Select validator by APR, commission, reliability" },
      { step: 3, title: "Enter Amount", desc: "Input amount to stake" },
      { step: 4, title: "Confirm Delegation", desc: "Sign delegation transaction" },
      { step: 5, title: "Track Rewards", desc: "View accrued staking rewards in real-time" },
      { step: 6, title: "Unstake/Claim", desc: "Initiate unbonding (if applicable) and claim rewards" },
    ]
  },
  {
    title: "Price Alert Flow",
    icon: Bell,
    steps: [
      { step: 1, title: "Select Asset", desc: "Choose cryptocurrency to monitor" },
      { step: 2, title: "Set Condition", desc: "Define trigger (price above/below target)" },
      { step: 3, title: "Choose Notification", desc: "Select push, email, or Telegram/WhatsApp" },
      { step: 4, title: "Monitoring Active", desc: "Backend checks prices every 60 seconds" },
      { step: 5, title: "Alert Triggered", desc: "Notification sent when condition met" },
      { step: 6, title: "Quick Action", desc: "Alert includes link to swap/buy/sell" },
    ]
  },
];

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

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Veyrnox Documentation</h1>
          <p className="text-muted-foreground mt-1">Complete feature guide and user workflows</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <FileText className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button onClick={async () => {
            try {
              const response = await base44.functions.invoke('generateDocumentationPDF', {});
              if (response.data.success) {
                toast.success(`Documentation uploaded to Google Drive: ${response.data.file_name}`);
                window.open(response.data.web_view_link, '_blank');
              }
            } catch (error) {
              console.error('PDF generation failed:', error);
              toast.error('Failed to generate documentation PDF');
            }
          }}>
            <FileText className="h-4 w-4 mr-2" />
            Upload to Drive
          </Button>
          <Button onClick={async () => {
            try {
              const response = await base44.functions.invoke('generateArchitecturePDF', {});
              if (response.data.success) {
                toast.success(`Architecture uploaded to Google Drive: ${response.data.file_name}`);
                window.open(response.data.web_view_link, '_blank');
              }
            } catch (error) {
              console.error('PDF generation failed:', error);
              toast.error('Failed to generate architecture PDF');
            }
          }}>
            <FileText className="h-4 w-4 mr-2" />
            Upload to Drive
          </Button>
          <Button onClick={async () => {
            try {
              const response = await base44.functions.invoke('generateArchitectureDocuments', {});
              if (response.data.success) {
                toast.success('PDF and Word uploaded to Google Drive');
                window.open(response.data.pdf.web_view_link, '_blank');
              }
            } catch (error) {
              console.error('Document generation failed:', error);
              toast.error('Failed to generate documents');
            }
          }}>
            <FileText className="h-4 w-4 mr-2" />
            Upload PDF and Word
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
            {features.reduce((acc, cat) => acc + cat.items.length, 0)} features across {features.length} categories
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" defaultValue={["core", "security", "portfolio"]} className="w-full">
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
                        <TableHead className="w-[100px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {category.items.map((feature) => (
                        <TableRow key={feature.name}>
                          <TableCell className="font-medium">{feature.name}</TableCell>
                          <TableCell className="text-muted-foreground">{feature.desc}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                              {feature.status}
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
          <CardDescription>Step-by-step guides for common tasks</CardDescription>
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
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-lg bg-secondary/50">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Authentication
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• WebAuthn/FIDO2 Passkeys</li>
                <li>• Email OTP 2FA</li>
                <li>• Biometric verification</li>
                <li>• Session management</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Transaction Security
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Address whitelisting</li>
                <li>• Transaction limits</li>
                <li>• Multi-sig support</li>
                <li>• Hardware wallet integration</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Cloud className="h-4 w-4" />
                Infrastructure
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• RASP protection</li>
                <li>• Geo-blocking</li>
                <li>• Audit logging</li>
                <li>• Encrypted backups</li>
              </ul>
            </div>
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
              { path: "/swap", label: "Swap", icon: ArrowDownUp },
              { path: "/staking", label: "Staking", icon: TrendingUp },
              { path: "/rebalance", label: "Rebalancing", icon: RefreshCw },
              { path: "/alerts", label: "Price Alerts", icon: Bell },
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