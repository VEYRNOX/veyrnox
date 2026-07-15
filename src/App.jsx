import { lazy, Suspense } from 'react';
// App-wide toast host. MUST be the sonner Toaster: every toast call in the app
// (31 files) imports `toast` from "sonner", so the Radix `ui/toaster` that used
// to be mounted here rendered nothing — its useToast() store had zero writers,
// so every success/error toast (backup downloaded, copy, errors, …) was silently
// invisible. Mounting the sonner host makes those toasts actually appear.
import { Toaster } from "@/components/ui/sonner"
import { ThemeProvider } from 'next-themes'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { WalletProvider } from '@/lib/WalletProvider';
import { TrezorProvider } from '@/context/TrezorContext';
import { TierProvider } from '@/lib/TierProvider';
import WalletGate from '@/components/WalletGate';
import { NotificationsProvider } from '@/notify/useNotifications';
import { Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import EnvBadge from '@/components/EnvBadge';
import DemoBanner from '@/components/DemoBanner';
import { VoiceProvider } from '@/context/VoiceContext';
import VoiceFab from '@/components/VoiceFab';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const SendCrypto = lazy(() => import('./pages/SendCrypto'));
const ReceiveCrypto = lazy(() => import('./pages/ReceiveCrypto'));
const Settings = lazy(() => import('./pages/Settings'));
const ConnectWallet = lazy(() => import('./pages/ConnectWallet'));
const PriceAlerts = lazy(() => import('./pages/PriceAlerts'));
const Calculator = lazy(() => import('./pages/Calculator'));
const Analytics = lazy(() => import('./pages/Analytics'));
const TaxReport = lazy(() => import('./pages/TaxReport'));
const SecurityCenter = lazy(() => import('./pages/SecurityCenter'));
const NFTPortfolio = lazy(() => import('./pages/NFTPortfolio'));
const PortfolioSnapshots = lazy(() => import('./pages/PortfolioSnapshots'));
const PLTracking = lazy(() => import('./pages/PLTracking'));
const OnChainAnalytics = lazy(() => import('./pages/OnChainAnalytics'));
const SpendingPatterns = lazy(() => import('./pages/SpendingPatterns'));
const RecurringPayments = lazy(() => import('./pages/RecurringPayments'));
const PushNotificationsPage = lazy(() => import('./pages/PushNotificationsPage'));
const AdvancedAnalytics = lazy(() => import('./pages/AdvancedAnalytics'));
const MultiChainNFT = lazy(() => import('./pages/MultiChainNFT'));
const FraudDetection = lazy(() => import('./pages/FraudDetection'));
const RaspSecurity = lazy(() => import('./pages/RaspSecurity'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const NewsSentimentPage = lazy(() => import('./pages/NewsSentimentPage'));
const NotificationCentre = lazy(() => import('./pages/NotificationCentre'));
const SavingsGoals = lazy(() => import('./pages/SavingsGoals'));
const InvoiceGenerator = lazy(() => import('./pages/InvoiceGenerator'));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'));
const AddressBook = lazy(() => import('./pages/AddressBook'));
const NetWorthTracker = lazy(() => import('./pages/NetWorthTracker'));
const BudgetLimits = lazy(() => import('./pages/BudgetLimits'));
const FeeAnalytics = lazy(() => import('./pages/FeeAnalytics'));
const HardwareWalletPage = lazy(() => import('./pages/HardwareWalletPage'));
const BiometricAuth = lazy(() => import('./pages/BiometricAuth'));
const AnomalyDetection = lazy(() => import('./pages/AnomalyDetection'));
const PortfolioRewind = lazy(() => import('./pages/PortfolioRewind'));
const CustomIndexBuilder = lazy(() => import('./pages/CustomIndexBuilder'));
const VoiceCommands = lazy(() => import('./pages/VoiceCommands'));
const AssetCorrelationTimeline = lazy(() => import('./pages/AssetCorrelationTimeline'));
const CustomDashboardWidgets = lazy(() => import('./pages/CustomDashboardWidgets'));
const WalletSeedQR = lazy(() => import('./pages/WalletSeedQR'));
const DuressPin = lazy(() => import('./pages/DuressPin'));
const WalletAccessReset = lazy(() => import('./pages/WalletAccessReset'));
const StealthWallets = lazy(() => import('./pages/StealthWallets'));
const PanicWipe = lazy(() => import('./pages/PanicWipe'));
const PortfolioRiskScore = lazy(() => import('./pages/PortfolioRiskScore'));
const CorrelationMatrix = lazy(() => import('./pages/CorrelationMatrix'));
const SessionManager = lazy(() => import('./pages/SessionManager'));
const LoginActivity = lazy(() => import('./pages/LoginActivity'));
const TransactionReceipt = lazy(() => import('./pages/TransactionReceipt'));
const TransactionHistory = lazy(() => import('./pages/TransactionHistory'));
const SuspiciousAddressChecker = lazy(() => import('./pages/SuspiciousAddressChecker'));
const TokenApprovals = lazy(() => import('./pages/TokenApprovals'));
const NetworkManager = lazy(() => import('./pages/NetworkManager'));
const WatchWallets = lazy(() => import('./pages/WatchWallets'));
const PriceCharts = lazy(() => import('./pages/PriceCharts'));
const PersonalBackup = lazy(() => import('./pages/PersonalBackup'));
const GasFeeControl = lazy(() => import('./pages/GasFeeControl'));
const SpamTokenFilter = lazy(() => import('./pages/SpamTokenFilter'));
const HDWalletManager = lazy(() => import('./pages/HDWalletManager'));
const TrustScore = lazy(() => import('./pages/TrustScore'));
const SolanaTokens = lazy(() => import('./pages/SolanaTokens'));
const CryptoDetailPage = lazy(() => import('./pages/CryptoDetailPage'));

// DEV-ONLY: throwaway PRF-in-WebView spike that gates the KEK build (see
// src/dev/prfSpike.js). import.meta.env.DEV is statically false in any production
// `vite build`, so this lazy import AND its /dev/prf-spike route are dead-code-
// eliminated and NEVER ship — the same lock as the dev send-ungate.
const PrfSpike = import.meta.env.DEV ? lazy(() => import('./pages/dev/PrfSpike')) : null;
const CryptoSigning = lazy(() => import('./pages/CryptoSigning'));
const LiveBalances = lazy(() => import('./pages/LiveBalances'));
const WalletConnect = lazy(() => import('@/pages/WalletConnect.jsx'));
// LandingGuard owns the public /landing route: it renders LandingPage ONLY on a
// confirmed no-vault device and otherwise redirects through WalletGate to the PIN
// pad (closes the reload-to-/landing lock bypass). It imports LandingPage itself,
// so keeping the guard lazy preserves the page's code-split chunk.
const LandingGuard = lazy(() => import('./components/LandingGuard'));
const Documentation = lazy(() => import('./pages/Documentation'));
const Features = lazy(() => import('./pages/Features'));
const DAppSecurityAlerts = lazy(() => import('./pages/DAppSecurityAlerts'));
const SecurityScanner = lazy(() => import('./pages/SecurityScanner'));
const SecurityDashboard = lazy(() => import('./pages/SecurityDashboard'));
const WhatThisProtects = lazy(() => import('./pages/WhatThisProtects'));
const TermsLegal = lazy(() => import('./pages/TermsLegal'));
const Subscription = lazy(() => import('./pages/Subscription'));
const SafetyPlus = lazy(() => import('./pages/SafetyPlus'));
const ReferralTracker = lazy(() => import('./pages/ReferralTracker'));

const AuthenticatedApp = () => {
  // Render the main app
  return (
    <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center"><div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" /></div>}>
    <Routes>
      <Route path="/landing" element={<LandingGuard />} />
      {/* Hosted-account auth routes are gone (base44 removal complete, Phase 4).
          There is no hosted account — the seed/vault is the identity — so any
          stale /login, /register, /forgot-password, /reset-password or
          /onboarding link redirects to "/", which the WalletGate resolves to the
          on-device create/import/unlock front door. Seed-password recovery lives
          there ("Forgot password? Restore from seed"). */}
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/register" element={<Navigate to="/" replace />} />
      <Route path="/forgot-password" element={<Navigate to="/" replace />} />
      <Route path="/reset-password" element={<Navigate to="/" replace />} />
      {/* On-device vault gate: in the local build a locked vault renders the
          create/import/unlock front door instead of any wallet screen. This is
          now the SOLE access gate (the former hosted-account ProtectedRoute was
          removed with the SDK). In demo mode it is a pass-through. */}
      <Route element={<WalletGate />}>
        {/* One session notification queue for the whole authenticated shell — the
            bell badge + toast (Layout) and the Notification Centre page read the
            SAME store. Mounted here, under WalletGate, so it unmounts and wipes on
            lock/reload (I3 deniability — no residual). */}
        <Route element={<NotificationsProvider />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/send" element={<SendCrypto />} />
          <Route path="/receive" element={<ReceiveCrypto />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/connect" element={<ConnectWallet />} />
          <Route path="/walletconnect" element={<WalletConnect />} />
          <Route path="/alerts" element={<PriceAlerts />} />
          <Route path="/calculator" element={<Calculator />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/tax" element={<TaxReport />} />
          <Route path="/security" element={<SecurityCenter />} />
          <Route path="/security-dashboard" element={<SecurityDashboard />} />
          <Route path="/what-this-protects" element={<WhatThisProtects />} />
          <Route path="/terms-legal" element={<TermsLegal />} />
          <Route path="/nft" element={<NFTPortfolio />} />
          <Route path="/snapshots" element={<PortfolioSnapshots />} />
          <Route path="/pl" element={<PLTracking />} />
          <Route path="/onchain" element={<OnChainAnalytics />} />
          <Route path="/spending" element={<SpendingPatterns />} />
          <Route path="/recurring" element={<RecurringPayments />} />
          <Route path="/push" element={<PushNotificationsPage />} />
          <Route path="/advanced-analytics" element={<AdvancedAnalytics />} />
          <Route path="/nft-multichain" element={<MultiChainNFT />} />
          <Route path="/fraud" element={<FraudDetection />} />
          <Route path="/rasp-security" element={<RaspSecurity />} />
          <Route path="/audit-log" element={<AuditLog />} />
          <Route path="/news-sentiment" element={<NewsSentimentPage />} />
          <Route path="/notifications" element={<NotificationCentre />} />
          <Route path="/savings" element={<SavingsGoals />} />
          <Route path="/invoices" element={<InvoiceGenerator />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/address-book" element={<AddressBook />} />
          <Route path="/net-worth" element={<NetWorthTracker />} />
          <Route path="/budget" element={<BudgetLimits />} />
          <Route path="/duress-pin" element={<DuressPin />} />
          <Route path="/wallet-access" element={<WalletAccessReset />} />
          <Route path="/stealth-wallets" element={<StealthWallets />} />
          <Route path="/panic-wipe" element={<PanicWipe />} />
          <Route path="/risk-score" element={<PortfolioRiskScore />} />
          <Route path="/correlation" element={<CorrelationMatrix />} />
          <Route path="/session-manager" element={<SessionManager />} />
          <Route path="/login-activity" element={<LoginActivity />} />
          <Route path="/receipt" element={<TransactionReceipt />} />
          <Route path="/tx-history" element={<TransactionHistory />} />
          <Route path="/transaction-history" element={<Navigate to="/tx-history" replace />} />
          <Route path="/history" element={<Navigate to="/tx-history" replace />} />
          <Route path="/hardware-wallets" element={<Navigate to="/hardware-wallet" replace />} />
          <Route path="/security-center" element={<Navigate to="/security" replace />} />
          <Route path="/address-screening" element={<Navigate to="/address-checker" replace />} />
          <Route path="/address-checker" element={<SuspiciousAddressChecker />} />
          <Route path="/fee-analytics" element={<FeeAnalytics />} />
          <Route path="/correlation-timeline" element={<AssetCorrelationTimeline />} />
          <Route path="/dashboard-widgets" element={<CustomDashboardWidgets />} />
          <Route path="/wallet-seed-qr" element={<WalletSeedQR />} />
          <Route path="/hardware-wallet" element={<HardwareWalletPage />} />
          <Route path="/personal-backup" element={<PersonalBackup />} />
          <Route path="/biometric-auth" element={<BiometricAuth />} />
          <Route path="/anomaly-detection" element={<AnomalyDetection />} />
          <Route path="/portfolio-rewind" element={<PortfolioRewind />} />
          <Route path="/index-builder" element={<CustomIndexBuilder />} />
          <Route path="/voice-commands" element={<VoiceCommands />} />
          <Route path="/token-approvals" element={<TokenApprovals />} />
          <Route path="/network-manager" element={<NetworkManager />} />
          <Route path="/watch-wallets" element={<WatchWallets />} />
          <Route path="/price-charts" element={<PriceCharts />} />
          <Route path="/gas-fees" element={<GasFeeControl />} />
          <Route path="/spam-filter" element={<SpamTokenFilter />} />
          <Route path="/hd-wallet" element={<HDWalletManager />} />
          <Route path="/trust-score" element={<TrustScore />} />
          <Route path="/solana" element={<SolanaTokens />} />
          <Route path="/asset/:symbol" element={<CryptoDetailPage />} />
          <Route path="/crypto-signing" element={<CryptoSigning />} />
          <Route path="/live-balances" element={<LiveBalances />} />
          <Route path="/dapp-alerts" element={<DAppSecurityAlerts />} />
          <Route path="/security-scanner" element={<SecurityScanner />} />
          <Route path="/docs" element={<Documentation />} />
          <Route path="/features" element={<Features />} />
          <Route path="/plans" element={<Subscription />} />
          <Route path="/safety-plus" element={<SafetyPlus />} />
          <Route path="/referrals" element={<ReferralTracker />} />
        </Route>
        </Route>
        {/* Onboarding created a hosted-style wallet *entity* with a fabricated
            address. In the local build the real first run is the on-device
            create/import flow (WalletGate -> WalletEntry), so redirect there. */}
        <Route path="/onboarding" element={<Navigate to="/" replace />} />
      </Route>
      {import.meta.env.DEV && PrfSpike && (
        <Route path="/dev/prf-spike" element={<PrfSpike />} />
      )}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" storageKey="veyrnox-theme">
      <WalletProvider>
        <TrezorProvider>
        <TierProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router>
              <VoiceProvider>
                <DemoBanner />
                <EnvBadge />
                <AuthenticatedApp />
                <VoiceFab />
              </VoiceProvider>
            </Router>
            <Toaster />
          </QueryClientProvider>
        </TierProvider>
        </TrezorProvider>
      </WalletProvider>
    </ThemeProvider>
  )
}

export default App