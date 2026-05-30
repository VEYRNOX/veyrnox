import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { 
  Accordion, AccordionContent, AccordionItem, AccordionTrigger 
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { FileText, Search, Download } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const featureCategories = [
  {
    category: "Core Wallet Functions",
    features: [
      {
        name: "Multi-Chain Support",
        summary: "Comprehensive blockchain network support",
        explanation: "Native support for Bitcoin, Ethereum, Solana, Polygon, BSC, Cosmos, Tron, and Sui networks. Each chain is fully integrated with its native tokens, smart contracts, and ecosystem features. Users can manage assets across all chains from a single unified interface."
      },
      {
        name: "Send/Receive Crypto",
        summary: "Secure cryptocurrency transfers",
        explanation: "Send and receive cryptocurrencies with advanced features including QR code scanning, ENS/SNS domain name resolution, address book management, and transaction validation. Includes whitelist checks and 2FA for enhanced security."
      },
      {
        name: "Cross-Chain Swap",
        summary: "Aggregate DEX swaps across chains",
        explanation: "Swap tokens across different blockchains using aggregated liquidity from multiple DEXs. The system automatically finds the best exchange rates and routes, calculating fees, slippage, and estimated gas costs for optimal trades."
      },
      {
        name: "Address Book",
        summary: "Trusted address management",
        explanation: "Save and organize frequently used wallet addresses with custom names, emojis, and network tags. Mark addresses as trusted for faster transactions and track usage frequency."
      },
      {
        name: "Transaction History",
        summary: "Complete transaction log with filtering",
        explanation: "View all incoming and outgoing transactions across all wallets and chains. Filter by date, asset, wallet, or transaction type. Export transaction data for tax reporting or personal records."
      }
    ]
  },
  {
    category: "Security & Authentication",
    features: [
      {
        name: "Passkey Authentication",
        summary: "Biometric login using WebAuthn/FIDO2",
        explanation: "Industry-leading passwordless authentication using biometric verification (Face ID, Touch ID, Windows Hello). Passkeys are cryptographically secure and phishing-resistant, providing superior protection compared to traditional passwords."
      },
      {
        name: "Email OTP 2FA",
        summary: "Two-factor authentication for high-risk actions",
        explanation: "Additional security layer requiring email verification codes for sensitive operations like large transfers, address book changes, or security settings modifications. Codes expire after 10 minutes for security."
      },
      {
        name: "Address Whitelist",
        summary: "Restrict withdrawals to pre-approved addresses",
        explanation: "Only send funds to addresses that have been explicitly whitelisted. New addresses require a waiting period and email verification before they can be used, preventing unauthorized withdrawals even if the account is compromised."
      },
      {
        name: "Transaction Limits",
        summary: "Daily and per-transaction USD limits with alerts",
        explanation: "Set maximum daily and per-transaction spending limits in USD. Receive alerts when approaching limits. Limits provide an additional safety net against large unauthorized transfers."
      },
      {
        name: "Hardware Wallet Integration",
        summary: "Ledger, Trezor, Coldcard support",
        explanation: "Connect hardware wallets for cold storage security. Supports Ledger Nano S/X, Trezor One/Model T, and Coldcard. Transactions must be physically confirmed on the device, keeping private keys offline."
      },
      {
        name: "Multi-Signature Wallets",
        summary: "M-of-N signature wallets",
        explanation: "Create wallets requiring multiple signatures for transactions (e.g., 2-of-3, 3-of-5). Ideal for businesses, families, or shared accounts. Each signer can use different authentication methods."
      },
      {
        name: "RASP Security",
        summary: "Runtime Application Self-Protection",
        explanation: "Real-time threat detection and response embedded in the application runtime. Automatically detects and blocks suspicious activities, injection attacks, and anomalous behavior patterns."
      },
      {
        name: "Geo-Blocking",
        summary: "Restrict access by country/region",
        explanation: "Block or allow access from specific countries or regions. Useful for compliance with regional regulations or personal security preferences. Can be configured to allow only specific IP ranges."
      },
      {
        name: "Audit Log",
        summary: "Immutable record of all account activities",
        explanation: "Comprehensive logging of every action taken in the wallet including logins, transactions, security changes, and API calls. Logs are immutable and timestamped for compliance and forensic analysis."
      }
    ]
  },
  {
    category: "Portfolio Management",
    features: [
      {
        name: "Dashboard Overview",
        summary: "Real-time portfolio value and allocation",
        explanation: "Centralized view of total portfolio value across all wallets, chains, and asset types. Live charts show allocation percentages, 24h changes, and P&L. Customizable widgets allow personalized dashboard layouts."
      },
      {
        name: "Net Worth Tracker",
        summary: "Track crypto + traditional assets",
        explanation: "Comprehensive net worth calculation including cryptocurrency holdings, traditional assets (property, stocks, cash, pensions), and liabilities. Provides a complete financial picture in one place."
      },
      {
        name: "Custom Index Builder",
        summary: "Create and manage custom crypto indices",
        explanation: "Build personalized crypto indices with custom weightings across multiple assets. Set rebalancing frequencies (weekly, monthly, quarterly) and track performance against benchmarks."
      },
      {
        name: "Portfolio Snapshots",
        summary: "Historical portfolio value at specific dates",
        explanation: "Capture and review portfolio value at any point in time. Compare historical snapshots to track progress, analyze performance over time, or generate reports for specific dates."
      },
      {
        name: "What-If Simulator",
        summary: "Model hypothetical trades and their impact",
        explanation: "Simulate potential trades before executing. See how buying, selling, or swapping assets would affect portfolio allocation, risk metrics, and projected returns. Test different scenarios risk-free."
      },
      {
        name: "Shared Portfolio View",
        summary: "Generate shareable portfolio links",
        explanation: "Create time-limited, privacy-controlled links to share portfolio performance with advisors, family, or investors. Choose what information to display (amounts, allocations, P&L) and set expiration dates."
      },
      {
        name: "Benchmarking",
        summary: "Compare performance against market indices",
        explanation: "Compare portfolio returns against major indices like BTC, ETH, S&P 500, or custom benchmarks. Track alpha generation and relative performance over different time periods."
      }
    ]
  },
  {
    category: "Trading & Swaps",
    features: [
      {
        name: "DEX Aggregator",
        summary: "Best-price swaps across multiple DEXs",
        explanation: "Automatically finds the best swap rates across Uniswap, PancakeSwap, SushiSwap, and other major DEXs. Splits large orders across multiple exchanges to minimize slippage and optimize execution."
      },
      {
        name: "Perpetuals Trading",
        summary: "Leveraged trading up to 50x",
        explanation: "Trade perpetual futures contracts with leverage up to 50x. Long or short cryptocurrencies with low fees. Includes risk management tools like stop-loss and take-profit orders."
      },
      {
        name: "Limit Orders",
        summary: "Price-triggered buy/sell orders",
        explanation: "Set limit orders that execute automatically when assets reach specified prices. No need to constantly monitor markets. Orders remain active until filled, cancelled, or expired."
      },
      {
        name: "Conditional Swaps",
        summary: "Auto-swap when price targets are hit",
        explanation: "Automatically execute swaps when specific price conditions are met. Set price triggers (above/below targets or percentage changes) and the system executes the swap without manual intervention."
      },
      {
        name: "Social Trading",
        summary: "Follow and copy top traders' signals",
        explanation: "Browse and follow successful traders. View their public profiles, performance stats, and trading signals. Optionally copy their trades automatically with customizable allocation percentages."
      },
      {
        name: "Trade Signals",
        summary: "AI-generated trading recommendations",
        explanation: "Receive AI-powered trading signals based on technical analysis, market sentiment, and on-chain data. Signals include entry price, targets, stop-loss, confidence levels, and detailed reasoning."
      }
    ]
  },
  {
    category: "DeFi & Yield",
    features: [
      {
        name: "Staking",
        summary: "Earn yield on PoS assets",
        explanation: "Stake proof-of-stake cryptocurrencies (ETH, SOL, ADA, etc.) to earn staking rewards. Choose validators by APR, commission rates, and reliability. Track rewards in real-time and claim or compound automatically."
      },
      {
        name: "Yield Farming",
        summary: "Liquidity provision across DeFi protocols",
        explanation: "Provide liquidity to DeFi protocols and earn trading fees plus token rewards. Access farms across multiple chains with auto-compounding options. Track impermanent loss and APY changes."
      },
      {
        name: "Lending/Borrowing",
        summary: "Collateralized loans via Aave, Compound",
        explanation: "Deposit assets as collateral and borrow against them. Access lending markets across multiple protocols. Monitor health factors, LTV ratios, and liquidation prices. Repay loans partially or fully anytime."
      },
      {
        name: "Crypto Loans",
        summary: "Track and manage collateralized debt",
        explanation: "Comprehensive loan management dashboard showing all active loans, collateral values, interest accrued, and health factors. Receive alerts before liquidation thresholds and automate repayments."
      },
      {
        name: "Auto-Rebalancing",
        summary: "Maintain target portfolio allocations",
        explanation: "Set target allocation percentages and the system automatically rebalances when drift exceeds thresholds. Uses DEX aggregators for optimal execution. Can be scheduled or triggered by allocation changes."
      },
      {
        name: "DCA Schedules",
        summary: "Dollar-cost averaging automation",
        explanation: "Automate recurring purchases at fixed intervals (daily, weekly, monthly). Spread purchases over time to reduce timing risk. Fund DCA from bank account or crypto balance."
      }
    ]
  },
  {
    category: "Payments & Banking",
    features: [
      {
        name: "Fiat Ramp",
        summary: "Buy/sell crypto via bank transfer",
        explanation: "Purchase cryptocurrency using bank transfers (SEPA, SWIFT, FPS). Support for GBP, EUR, USD and other major currencies. Competitive exchange rates with transparent fees. Settlement in 1-3 business days."
      },
      {
        name: "Recurring Payments",
        summary: "Schedule automatic crypto payments",
        explanation: "Automate regular crypto payments for subscriptions, salaries, or bills. Set frequency (weekly, monthly), amount, and recipient. Payments execute automatically from designated wallet."
      },
      {
        name: "Crypto Payroll",
        summary: "Pay employees/contractors in crypto",
        explanation: "Payroll management for crypto-native businesses. Set employee wallet addresses, salaries, and payment schedules. Automated distribution on paydays with transaction receipts and records."
      },
      {
        name: "Split Bills",
        summary: "Split expenses among multiple people",
        explanation: "Create shared bills and split costs among friends or colleagues. Participants pay their share directly from their wallets. Track who has paid and send reminders for outstanding amounts."
      },
      {
        name: "Invoice Generator",
        summary: "Create crypto payment invoices",
        explanation: "Generate professional invoices with QR codes for crypto payments. Customize with logo, line items, and due dates. Track payment status and send automatic reminders."
      },
      {
        name: "Payment Links",
        summary: "Generate merchant payment QR codes",
        explanation: "Create shareable payment links or QR codes for receiving payments. Set fixed amounts or let payers choose. Ideal for merchants, freelancers, or donations."
      },
      {
        name: "Bank Link",
        summary: "Connect European bank accounts",
        explanation: "Open Banking integration (PSD2) for European users. Link bank accounts for direct fiat deposits and withdrawals. Real-time balance verification and instant payment initiation."
      },
      {
        name: "Crypto Subscriptions",
        summary: "Manage recurring crypto subscriptions",
        explanation: "Track and manage subscriptions paid in crypto (DeFi protocols, SaaS, media). Monitor upcoming payments, total spent, and cancel anytime. Supports daily, weekly, monthly, or yearly billing."
      }
    ]
  },
  {
    category: "Analytics & Insights",
    features: [
      {
        name: "Advanced Analytics",
        summary: "Portfolio performance metrics",
        explanation: "Deep dive into portfolio performance with metrics like Sharpe ratio, win rate, max drawdown, and volatility. Analyze returns by asset, wallet, or time period. Export reports for review."
      },
      {
        name: "On-Chain Analytics",
        summary: "Track whale movements and smart money",
        explanation: "Monitor large transactions, whale wallet movements, and smart money flows. Identify trends and potential market-moving activities. Real-time alerts for significant on-chain events."
      },
      {
        name: "Spending Patterns",
        summary: "Categorize and analyze crypto spending",
        explanation: "Automatically categorize transactions (trading, DeFi, purchases, transfers). Visualize spending patterns over time with charts and insights. Identify areas to optimize spending."
      },
      {
        name: "Fee Analytics",
        summary: "Track and optimize gas fees",
        explanation: "Monitor gas fees paid across all transactions. Identify optimal times for low-fee transactions. Compare fees across chains and L2 solutions. Historical fee trends and predictions."
      },
      {
        name: "Tax Report",
        summary: "Generate capital gains/losses reports",
        explanation: "Comprehensive tax reports for crypto transactions. Calculate capital gains/losses using FIFO, LIFO, or specific identification methods. Export in formats compatible with tax software."
      },
      {
        name: "Tax Harvesting",
        summary: "Identify loss harvesting opportunities",
        explanation: "Automatically identify positions with unrealized losses that could be harvested for tax benefits. Calculate potential tax savings and suggest optimal harvesting strategies."
      },
      {
        name: "P&L Tracking",
        summary: "Real-time profit/loss by asset",
        explanation: "Track realized and unrealized P&L for each asset and wallet. View P&L over different time periods (24h, 7d, 30d, all time). Break down by asset type, chain, or wallet."
      }
    ]
  },
  {
    category: "Alerts & Automation",
    features: [
      {
        name: "Price Alerts",
        summary: "Push/email alerts for price thresholds",
        explanation: "Set alerts for when assets reach specific prices. Choose notification method (push, email, Telegram, WhatsApp). Alerts include current price and quick action buttons to trade."
      },
      {
        name: "Smart Alerts",
        summary: "AI-powered anomaly detection",
        explanation: "AI monitors portfolio and transaction patterns for anomalies. Alerts for unusual login locations, large unexpected transfers, or suspicious contract interactions. Learns from user behavior."
      },
      {
        name: "Messenger Alerts",
        summary: "Telegram/WhatsApp notifications",
        explanation: "Receive wallet notifications via Telegram or WhatsApp. Configure which events trigger messages (transactions, price alerts, security events). End-to-end encrypted messaging."
      },
      {
        name: "Webhook Builder",
        summary: "Custom webhooks for integrations",
        explanation: "Create custom webhooks to integrate with external systems. Trigger on events like transactions, price changes, or balance updates. Include secret headers for security."
      },
      {
        name: "Portfolio Automation",
        summary: "Rule-based auto-trading",
        explanation: "Create automation rules for portfolio management. Examples: 'Rebalance when allocation drifts 5%', 'Take profit when asset up 20%', 'DCA $100 weekly'. Rules execute automatically."
      },
      {
        name: "Trading Bots",
        summary: "Deploy automated trading strategies",
        explanation: "Deploy pre-built or custom trading bots. Strategies include grid trading, DCA, rebalancing, and arbitrage. Monitor bot performance and adjust parameters in real-time."
      }
    ]
  },
  {
    category: "NFTs",
    features: [
      {
        name: "NFT Portfolio",
        summary: "View NFTs across multiple chains",
        explanation: "Comprehensive NFT portfolio tracking across Ethereum, Solana, Polygon, and more. See floor values, collection stats, and rarity rankings. Automatic valuation updates."
      },
      {
        name: "NFT Gallery",
        summary: "Showcase NFTs with custom displays",
        explanation: "Create custom galleries to showcase favorite NFTs. Arrange displays, add descriptions, and share publicly or privately. Support for images, videos, and interactive NFTs."
      },
      {
        name: "NFT Minting",
        summary: "Mint NFTs directly from wallet",
        explanation: "Mint new NFTs without leaving the wallet. Upload media, set metadata, choose blockchain, and mint with one click. Support for single editions and collections."
      },
      {
        name: "Multi-Chain NFT",
        summary: "Cross-chain NFT support",
        explanation: "Manage NFTs across Ethereum, Solana, Polygon, and other chains in one interface. Bridge NFTs between chains. View and interact with chain-specific NFT standards."
      }
    ]
  },
  {
    category: "Identity & Social",
    features: [
      {
        name: "DID Management",
        summary: "Decentralized identity credentials",
        explanation: "Create and manage decentralized identity (DID) credentials. Store verifiable credentials on-chain. Use DID for KYC, reputation, or access control across dApps."
      },
      {
        name: "ENS Registration",
        summary: "Register and manage .eth domains",
        explanation: "Register Ethereum Name Service (ENS) domains directly from the wallet. Manage domain records, set primary addresses, and configure subdomains. Auto-renewal options available."
      },
      {
        name: "Public Profiles",
        summary: "Shareable trader profiles",
        explanation: "Create public trader profiles showcasing performance, win rate, and trading history. Customize privacy settings for what to display. Follow other traders and build reputation."
      },
      {
        name: "Leaderboard",
        summary: "Rank traders by performance",
        explanation: "Global and friends leaderboards ranking traders by returns, win rate, or P&L. Filter by time period, asset class, or risk level. Compete and climb the ranks."
      },
      {
        name: "Encrypted Messaging",
        summary: "End-to-end encrypted chat",
        explanation: "Send encrypted messages to other wallet users. Messages are encrypted with recipient's public key and can only be decrypted by them. Support for text, images, and files."
      },
      {
        name: "Referral Tracker",
        summary: "Track and reward referrals",
        explanation: "Generate unique referral links and track signups. Earn rewards when referred users become active. Monitor referral status (pending, joined, rewarded) and total earnings."
      }
    ]
  },
  {
    category: "Advanced Features",
    features: [
      {
        name: "DAO Governance",
        summary: "Vote on protocol proposals",
        explanation: "Participate in DAO governance across multiple protocols. View active proposals, voting power, and delegation options. Vote directly from the wallet with transaction history."
      },
      {
        name: "Carbon Tracker",
        summary: "Track crypto carbon footprint",
        explanation: "Calculate carbon emissions from crypto activities based on chain energy consumption. View offset options and purchase carbon credits. Track environmental impact over time."
      },
      {
        name: "Crypto Will",
        summary: "Estate planning and inheritance",
        explanation: "Set up digital inheritance for crypto assets. Designate beneficiaries and specify distribution percentages. Uses multi-sig or time-locked contracts for secure inheritance."
      },
      {
        name: "Fraud Detection",
        summary: "AI-powered scam detection",
        explanation: "AI analyzes transactions, contracts, and addresses for fraud indicators. Warns about known scams, phishing sites, and suspicious contracts. Real-time protection during transactions."
      },
      {
        name: "Cross-Chain Bridge",
        summary: "Bridge assets between chains",
        explanation: "Transfer assets between different blockchains using integrated bridges. Compare bridge options for speed, cost, and security. Track bridge transactions in real-time."
      },
      {
        name: "Token Approvals",
        summary: "Monitor and revoke token allowances",
        explanation: "View all token approvals granted to protocols and contracts. Revoke unnecessary or risky approvals to protect funds. Risk scoring for each approval based on contract reputation."
      },
      {
        name: "Spam Token Filter",
        summary: "Auto-hide scam tokens",
        explanation: "Automatically detect and hide spam/scam tokens airdropped to wallets. Prevents accidental interactions with malicious tokens. Option to review hidden tokens manually."
      }
    ]
  },
  {
    category: "Mobile & Accessibility",
    features: [
      {
        name: "PWA Install",
        summary: "Install as native app",
        explanation: "Install SafeDigitalWallet as a Progressive Web App on iOS, Android, or desktop. Works offline for viewing portfolio. Receives push notifications. No app store required."
      },
      {
        name: "Mobile Widget",
        summary: "Home screen portfolio widgets",
        explanation: "Add portfolio widgets to phone home screen. View balances, prices, and P&L at a glance. Customizable widgets in different sizes. Tap to open full app."
      },
      {
        name: "Voice Commands",
        summary: "Voice-controlled wallet actions",
        explanation: "Control wallet with voice commands. Ask for balances, prices, or initiate transactions hands-free. Secure voice authentication for sensitive operations."
      },
      {
        name: "Biometric Auth",
        summary: "Face ID / Touch ID login",
        explanation: "Quick and secure login using device biometrics. Supports Face ID, Touch ID, and fingerprint scanners on mobile and desktop. Falls back to passkey if biometrics unavailable."
      },
      {
        name: "DApp Connector",
        summary: "WalletConnect v2 for dApps",
        explanation: "Connect to decentralized applications using WalletConnect v2. Scan QR codes or use deep links. Manage multiple dApp sessions and revoke access anytime."
      },
      {
        name: "Web3 Browser",
        summary: "Built-in dApp browser",
        explanation: "Browse and interact with dApps directly from the wallet. Built-in Web3 provider for seamless dApp integration. Bookmark favorite dApps and browse securely."
      }
    ]
  },
  {
    category: "Risk Management",
    features: [
      {
        name: "Portfolio Risk Score",
        summary: "AI-powered portfolio risk assessment",
        explanation: "Comprehensive risk scoring based on asset volatility, concentration, correlation, and market conditions. Provides actionable recommendations to reduce risk exposure."
      },
      {
        name: "Correlation Matrix",
        summary: "Analyze asset correlations",
        explanation: "Visual matrix showing correlations between all portfolio assets. Identify overexposure to correlated assets and diversification opportunities. Updated in real-time."
      },
      {
        name: "Anomaly Detection",
        summary: "Detect unusual portfolio behavior",
        explanation: "Machine learning monitors portfolio movements and transaction patterns. Alerts for anomalies like unusual losses, unexpected balance changes, or suspicious activities."
      },
      {
        name: "Duress PIN",
        summary: "Emergency decoy wallet access",
        explanation: "Set a duress PIN that opens a decoy wallet with minimal funds when coerced. Protects real assets in emergency situations. Silent alarm notification to trusted contacts."
      },
      {
        name: "Session Manager",
        summary: "Manage active login sessions",
        explanation: "View all active sessions across devices. Remotely terminate suspicious sessions. Set session timeout preferences and receive alerts for new logins."
      }
    ]
  },
  {
    category: "Compliance & Reporting",
    features: [
      {
        name: "KYC Profile",
        summary: "Identity verification management",
        explanation: "Complete KYC verification for fiat ramps and regulatory compliance. Upload documents, track verification status, and manage identity credentials securely."
      },
      {
        name: "Transaction Receipt",
        summary: "Generate transaction receipts",
        explanation: "Automatic receipt generation for every transaction. Includes timestamp, amount, fees, counterparty, and blockchain confirmation. Export as PDF for records."
      },
      {
        name: "Suspicious Address Checker",
        summary: "Verify address reputation",
        explanation: "Check wallet addresses against known scam databases, sanctions lists, and fraud reports before sending. Protects against sending to malicious addresses."
      },
      {
        name: "Trust Score",
        summary: "Address trustworthiness rating",
        explanation: "AI-generated trust scores for addresses based on transaction history, age, and reputation. Higher scores indicate safer, more established addresses."
      }
    ]
  }
];

export default function Features() {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedCategory, setExpandedCategory] = useState(null);

  const filteredCategories = featureCategories
    .map(cat => ({
      ...cat,
      features: cat.features.filter(feature => 
        feature.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        feature.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
        feature.explanation.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }))
    .filter(cat => cat.features.length > 0);

  const totalFeatures = featureCategories.reduce((acc, cat) => acc + cat.features.length, 0);

  return (
    <div className="max-w-[1800px] mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">SafeDigitalWallet Features</h1>
          <p className="text-muted-foreground mt-1">
            {totalFeatures} features across {featureCategories.length} categories
          </p>
          <div className="flex gap-2 mt-2">
            <Badge variant="outline">14 Categories</Badge>
            <Badge variant="outline">80+ Features</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <FileText className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button onClick={async () => {
            try {
              const response = await base44.functions.invoke('generateArchitectureDocuments', {});
              if (response.data.success) {
                toast.success('Documentation uploaded to Google Drive');
                window.open(response.data.pdf.web_view_link, '_blank');
              }
            } catch (error) {
              toast.error('Failed to generate documentation');
            }
          }}>
            <Download className="h-4 w-4 mr-2" />
            Export to Drive
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

      {/* Features by Category */}
      <div className="space-y-4">
        {filteredCategories.map((category, catIdx) => (
          <Card key={category.category}>
            <CardHeader>
              <CardTitle>{category.category}</CardTitle>
              <CardDescription>{category.features.length} features</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[250px]">Feature</TableHead>
                      <TableHead className="w-[300px]">Summary</TableHead>
                      <TableHead>Explanation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {category.features.map((feature) => (
                      <TableRow key={feature.name}>
                        <TableCell className="font-semibold">{feature.name}</TableCell>
                        <TableCell className="text-muted-foreground">{feature.summary}</TableCell>
                        <TableCell className="text-sm">{feature.explanation}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredCategories.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No features found matching "{searchTerm}"
          </CardContent>
        </Card>
      )}
    </div>
  );
}