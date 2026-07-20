/**
 * Auto-derived wallet context interface.
 *
 * Every member corresponds to a key on the `value` object inside
 * WalletProvider (WalletProvider.jsx ≈ line 2164).  The structural-sync
 * test in __tests__/useWallet.typeSync.test.js verifies this list stays
 * in lock-step with the source — add a member to the value object and
 * the test tells you to add it here.
 */
export interface WalletContextValue {
  isUnlocked: any;
  isDecoy: any;
  wallets: any;
  activeWalletId: any;
  switchWallet: any;
  walletAddresses: any;
  addWallet: any;
  importAdditionalWallet: any;
  removeWallet: any;
  confirmWalletBackup: any;
  renameWallet: any;
  setWalletAssets: any;
  toggleWalletAsset: any;
  revealWalletMnemonic: any;
  portfolios: any;
  activePortfolioId: any;
  walletPortfolioMap: any;
  setActivePortfolio: any;
  createPortfolio: any;
  renamePortfolio: any;
  deletePortfolio: any;
  assignWalletToPortfolio: any;
  exploreMode: any;
  enterExplore: any;
  leaveExplore: any;
  requireWallet: any;
  setupPin: any;
  createWalletFromPendingPin: any;
  importWalletForPendingPin: any;
  clearPendingPin: any;
  verifyActiveCredential: any;
  verifyActiveCredentialDetailed: any;
  isVerifierReady: any;
  isSendReauthRequired: any;
  actionPasswordConfigured: any;
  hasActionPassword: any;
  verifyActionPassword: any;
  setActionPassword: any;
  clearActionPassword: any;
  hiddenWallet2faMode: any;
  setHiddenWallet2faMode: any;
  hasPendingPin: any;
  isHidden: any;
  accounts: any;
  btcAccount: any;
  deriveBtc: any;
  withBtcPrivateKey: any;
  solAccount: any;
  deriveSol: any;
  withSolPrivateKey: any;
  hasVault: any;
  vaultExists: any;
  vaultChecking: any;
  setDuressPin: any;
  removeDuressPin: any;
  addHiddenWallet: any;
  moveWalletToHidden: any;
  peekHiddenWallet: any;
  hasStealthPool: any;
  initStealthPool: any;
  removeAllHiddenWallets: any;
  wasWiped: any;
  acknowledgeWipe: any;
  panicWipe: any;
  discardIncompleteWallet: any;
  setPanicPin: any;
  removePanicPin: any;
  inspectKeyMaterial: any;
  createWallet: any;
  importWallet: any;
  unlock: any;
  changePassword: any;
  lock: any;
  deriveAccounts: any;
  withPrivateKey: any;
  clearVault: any;
  validateMnemonic: any;
  biometricPreview: any;
  enableBiometricUnlock: any;
  disableBiometricUnlock: any;
  enableDecoyBiometricUnlock: any;
  unlockWithBiometric: any;
  passkeyPreview: any;
  autoLockValue: any;
  setAutoLockTimeout: any;
  createBackup: any;
  recordAudit: any;
  auditLogEnabled: any;
  getAuditLogEnabled: any;
  toggleAuditLog: any;
  fetchAuditEntries: any;
  readAuditLogEntries: any;
  clearAuditLogEntries: any;
  lastUnlockAt: any;
  withLockSuppressed: any;
}

export function useWallet(): WalletContextValue;
export function WalletProvider(props: { children: React.ReactNode }): React.JSX.Element;
