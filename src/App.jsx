import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from 'next-themes'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { WalletProvider } from '@/lib/WalletProvider';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Navigate } from 'react-router-dom';
import Layout from './components/Layout';
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
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'));
const NFTPortfolio = lazy(() => import('./pages/NFTPortfolio'));
const PortfolioSnapshots = lazy(() => import('./pages/PortfolioSnapshots'));
const PLTracking = lazy(() => import('./pages/PLTracking'));
const OnChainAnalytics = lazy(() => import('./pages/OnChainAnalytics'));
const SpendingPatterns = lazy(() => import('./pages/SpendingPatterns'));
const AIPortfolioAdvisor = lazy(() => import('./pages/AIPortfolioAdvisor'));
const SmartAlerts = lazy(() => import('./pages/SmartAlerts'));
const RecurringPayments = lazy(() => import('./pages/RecurringPayments'));
const WalletConnectPage = lazy(() => import('./pages/WalletConnectPage'));
const PushNotificationsPage = lazy(() => import('./pages/PushNotificationsPage'));
const MultiSigWallets = lazy(() => import('./pages/MultiSigWallets'));
const AdvancedAnalytics = lazy(() => import('./pages/AdvancedAnalytics'));
const Community = lazy(() => import('./pages/Community'));
const Web3Browser = lazy(() => import('./pages/Web3Browser'));
const MultiChainNFT = lazy(() => import('./pages/MultiChainNFT'));
const FraudDetection = lazy(() => import('./pages/FraudDetection'));
const AccountAccess = lazy(() => import('./pages/AccountAccess'));
const RASPSecurity = lazy(() => import('./pages/RASPSecurity'));
const PaymentLinks = lazy(() => import('./pages/PaymentLinks'));
const RiskScoring = lazy(() => import('./pages/RiskScoring'));
const CarbonTracker = lazy(() => import('./pages/CarbonTracker'));
const CryptoWillPage = lazy(() => import('./pages/CryptoWillPage'));
const NewsSentimentPage = lazy(() => import('./pages/NewsSentimentPage'));
const NotificationCentre = lazy(() => import('./pages/NotificationCentre'));
const SavingsGoals = lazy(() => import('./pages/SavingsGoals'));
const InvoiceGenerator = lazy(() => import('./pages/InvoiceGenerator'));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const AIAssistant = lazy(() => import('./pages/AIAssistant'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const AddressBook = lazy(() => import('./pages/AddressBook'));
const NetWorthTracker = lazy(() => import('./pages/NetWorthTracker'));
const PortfolioBenchmark = lazy(() => import('./pages/PortfolioBenchmark'));
const WhatIfSimulator = lazy(() => import('./pages/WhatIfSimulator'));
const BudgetLimits = lazy(() => import('./pages/BudgetLimits'));
const LoginActivityMap = lazy(() => import('./pages/LoginActivityMap'));
const FeeAnalytics = lazy(() => import('./pages/FeeAnalytics'));
const HardwareWalletPage = lazy(() => import('./pages/HardwareWalletPage'));
const BiometricAuth = lazy(() => import('./pages/BiometricAuth'));
const AnomalyDetection = lazy(() => import('./pages/AnomalyDetection'));
const TaxHarvesting = lazy(() => import('./pages/TaxHarvesting'));
const PortfolioRewind = lazy(() => import('./pages/PortfolioRewind'));
const CustomIndexBuilder = lazy(() => import('./pages/CustomIndexBuilder'));
const MessengerAlerts = lazy(() => import('./pages/MessengerAlerts'));
const VoiceCommands = lazy(() => import('./pages/VoiceCommands'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const PublicProfiles = lazy(() => import('./pages/PublicProfiles'));
const AIRebalancer = lazy(() => import('./pages/AIRebalancer'));
const AssetCorrelationTimeline = lazy(() => import('./pages/AssetCorrelationTimeline'));
const CustomDashboardWidgets = lazy(() => import('./pages/CustomDashboardWidgets'));
const SharedPortfolioView = lazy(() => import('./pages/SharedPortfolioView'));
const ReferralTracker = lazy(() => import('./pages/ReferralTracker'));
const WalletSeedQR = lazy(() => import('./pages/WalletSeedQR'));
const DuressPin = lazy(() => import('./pages/DuressPin'));
const StealthWallets = lazy(() => import('./pages/StealthWallets'));
const PanicWipe = lazy(() => import('./pages/PanicWipe'));
const PortfolioRiskScore = lazy(() => import('./pages/PortfolioRiskScore'));
const CorrelationMatrix = lazy(() => import('./pages/CorrelationMatrix'));
const SplitBill = lazy(() => import('./pages/SplitBill'));
const MerchantQR = lazy(() => import('./pages/MerchantQR'));
const SessionManager = lazy(() => import('./pages/SessionManager'));
const TransactionReceipt = lazy(() => import('./pages/TransactionReceipt'));
const TransactionHistory = lazy(() => import('./pages/TransactionHistory'));
const SuspiciousAddressChecker = lazy(() => import('./pages/SuspiciousAddressChecker'));
const TokenApprovals = lazy(() => import('./pages/TokenApprovals'));
const NetworkManager = lazy(() => import('./pages/NetworkManager'));
const WatchWallets = lazy(() => import('./pages/WatchWallets'));
const PriceCharts = lazy(() => import('./pages/PriceCharts'));
const GasFeeControl = lazy(() => import('./pages/GasFeeControl'));
const SpamTokenFilter = lazy(() => import('./pages/SpamTokenFilter'));
const HDWalletManager = lazy(() => import('./pages/HDWalletManager'));
const TrustScore = lazy(() => import('./pages/TrustScore'));
const SolanaTokens = lazy(() => import('./pages/SolanaTokens'));
const TronWallet = lazy(() => import('./pages/TronWallet'));
const NFTGallery = lazy(() => import('./pages/NFTGallery'));
const CryptoSigning = lazy(() => import('./pages/CryptoSigning'));
const LiveBalances = lazy(() => import('./pages/LiveBalances'));
const DAppConnector = lazy(() => import('./pages/DAppConnector'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const Documentation = lazy(() => import('./pages/Documentation'));
const Features = lazy(() => import('./pages/Features'));
const SamsungKeystore = lazy(() => import('./pages/SamsungKeystore'));
const CloudBackup = lazy(() => import('./pages/CloudBackup'));
const DAppSecurityAlerts = lazy(() => import('./pages/DAppSecurityAlerts'));
const BlockExplorer = lazy(() => import('./pages/BlockExplorer'));
const SecurityScanner = lazy(() => import('./pages/SecurityScanner'));
const ERC20Discovery = lazy(() => import('./pages/ERC20Discovery'));
const Products = lazy(() => import('./pages/Products'));

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center"><div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" /></div>}>
    <Routes>
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/send" element={<SendCrypto />} />
          <Route path="/receive" element={<ReceiveCrypto />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/connect" element={<ConnectWallet />} />
          <Route path="/alerts" element={<PriceAlerts />} />
          <Route path="/calculator" element={<Calculator />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/tax" element={<TaxReport />} />
          <Route path="/security" element={<SecurityCenter />} />
          <Route path="/audit" element={<AuditLogPage />} />
          <Route path="/nft" element={<NFTPortfolio />} />
          <Route path="/snapshots" element={<PortfolioSnapshots />} />
          <Route path="/pl" element={<PLTracking />} />
          <Route path="/onchain" element={<OnChainAnalytics />} />
          <Route path="/spending" element={<SpendingPatterns />} />
          <Route path="/advisor" element={<AIPortfolioAdvisor />} />
          <Route path="/smart-alerts" element={<SmartAlerts />} />
          <Route path="/recurring" element={<RecurringPayments />} />
          <Route path="/walletconnect" element={<WalletConnectPage />} />
          <Route path="/push" element={<PushNotificationsPage />} />
          <Route path="/multisig" element={<MultiSigWallets />} />
          <Route path="/advanced-analytics" element={<AdvancedAnalytics />} />
          <Route path="/community" element={<Community />} />
          <Route path="/web3" element={<Web3Browser />} />
          <Route path="/nft-multichain" element={<MultiChainNFT />} />
          <Route path="/fraud" element={<FraudDetection />} />
          <Route path="/account-access" element={<AccountAccess />} />
          <Route path="/rasp" element={<RASPSecurity />} />
          <Route path="/payment-links" element={<PaymentLinks />} />
          <Route path="/risk" element={<RiskScoring />} />
          <Route path="/carbon" element={<CarbonTracker />} />
          <Route path="/will" element={<CryptoWillPage />} />
          <Route path="/news-sentiment" element={<NewsSentimentPage />} />
          <Route path="/notifications" element={<NotificationCentre />} />
          <Route path="/savings" element={<SavingsGoals />} />
          <Route path="/invoices" element={<InvoiceGenerator />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/ai-assistant" element={<AIAssistant />} />
          <Route path="/address-book" element={<AddressBook />} />
          <Route path="/net-worth" element={<NetWorthTracker />} />
          <Route path="/benchmark" element={<PortfolioBenchmark />} />
          <Route path="/what-if" element={<WhatIfSimulator />} />
          <Route path="/budget" element={<BudgetLimits />} />
          <Route path="/login-map" element={<LoginActivityMap />} />
          <Route path="/duress-pin" element={<DuressPin />} />
          <Route path="/stealth-wallets" element={<StealthWallets />} />
          <Route path="/panic-wipe" element={<PanicWipe />} />
          <Route path="/risk-score" element={<PortfolioRiskScore />} />
          <Route path="/correlation" element={<CorrelationMatrix />} />
          <Route path="/split-bill" element={<SplitBill />} />
          <Route path="/merchant-qr" element={<MerchantQR />} />
          <Route path="/session-manager" element={<SessionManager />} />
          <Route path="/receipt" element={<TransactionReceipt />} />
          <Route path="/tx-history" element={<TransactionHistory />} />
          <Route path="/address-checker" element={<SuspiciousAddressChecker />} />
          <Route path="/fee-analytics" element={<FeeAnalytics />} />
          <Route path="/correlation-timeline" element={<AssetCorrelationTimeline />} />
          <Route path="/dashboard-widgets" element={<CustomDashboardWidgets />} />
          <Route path="/shared-portfolio" element={<SharedPortfolioView />} />
          <Route path="/referrals" element={<ReferralTracker />} />
          <Route path="/wallet-seed-qr" element={<WalletSeedQR />} />
          <Route path="/hardware-wallet" element={<HardwareWalletPage />} />
          <Route path="/biometric-auth" element={<BiometricAuth />} />
          <Route path="/anomaly-detection" element={<AnomalyDetection />} />
          <Route path="/tax-harvest" element={<TaxHarvesting />} />
          <Route path="/portfolio-rewind" element={<PortfolioRewind />} />
          <Route path="/index-builder" element={<CustomIndexBuilder />} />
          <Route path="/messenger-alerts" element={<MessengerAlerts />} />
          <Route path="/voice-commands" element={<VoiceCommands />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/public-profiles" element={<PublicProfiles />} />
          <Route path="/ai-rebalancer" element={<AIRebalancer />} />
          <Route path="/token-approvals" element={<TokenApprovals />} />
          <Route path="/network-manager" element={<NetworkManager />} />
          <Route path="/watch-wallets" element={<WatchWallets />} />
          <Route path="/price-charts" element={<PriceCharts />} />
          <Route path="/gas-fees" element={<GasFeeControl />} />
          <Route path="/spam-filter" element={<SpamTokenFilter />} />
          <Route path="/hd-wallet" element={<HDWalletManager />} />
          <Route path="/trust-score" element={<TrustScore />} />
          <Route path="/solana" element={<SolanaTokens />} />
          <Route path="/tron" element={<TronWallet />} />
          <Route path="/nft-gallery" element={<NFTGallery />} />
          <Route path="/crypto-signing" element={<CryptoSigning />} />
          <Route path="/live-balances" element={<LiveBalances />} />
          <Route path="/dapp-connect" element={<DAppConnector />} />
          <Route path="/samsung-keystore" element={<SamsungKeystore />} />
          <Route path="/cloud-backup" element={<CloudBackup />} />
          <Route path="/dapp-alerts" element={<DAppSecurityAlerts />} />
          <Route path="/block-explorer" element={<BlockExplorer />} />
          <Route path="/security-scanner" element={<SecurityScanner />} />
          <Route path="/erc20-discovery" element={<ERC20Discovery />} />
          <Route path="/products" element={<Products />} />
          <Route path="/docs" element={<Documentation />} />
          <Route path="/features" element={<Features />} />
        </Route>
        <Route path="/onboarding" element={<Onboarding />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" storageKey="veyrnox-theme">
    <AuthProvider>
      <WalletProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </WalletProvider>
    </AuthProvider>
    </ThemeProvider>
  )
}

export default App