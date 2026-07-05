import { useState, useEffect } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import styles from './WalletConnect.module.css';
import { WalletConnectProvider, useWalletConnect } from '@/lib/WalletConnectProvider.jsx';
import { SessionProposalModal } from '@/components/walletconnect/SessionProposalModal.jsx';
import { RequestApprovalModal } from '@/components/walletconnect/RequestApprovalModal.jsx';
import { ActiveSessions } from '@/components/walletconnect/ActiveSessions.jsx';
import { useWallet } from '@/lib/WalletProvider.jsx';
import { WALLETCONNECT_PROJECT_ID } from '@/wallet-core/evm/walletconnect/projectId.js';
import { DEMO } from '@/api/demoClient';

// Committed public default in projectId.js keeps this true on every build (worktree,
// fresh clone, CI) so the connector is never accidentally honest-disabled after an
// APK rebuild; VITE_WALLETCONNECT_PROJECT_ID still overrides it.
const CONFIGURED = Boolean(WALLETCONNECT_PROJECT_ID);

const POPULAR_DAPPS = [
  { name: 'Binance Web3 Wallet', url: 'https://www.binance.com/en/web3wallet', category: 'Exchange', chains: ['ETH', 'BNB', 'MATIC'] },
  { name: 'Uniswap', url: 'https://app.uniswap.org', category: 'DEX', chains: ['ETH', 'MATIC', 'ARB', 'OP'] },
  { name: '1inch', url: 'https://app.1inch.io', category: 'DEX Aggregator', chains: ['ETH', 'BNB', 'MATIC', 'ARB', 'OP', 'AVAX'] },
  { name: 'PancakeSwap', url: 'https://pancakeswap.finance', category: 'DEX', chains: ['BNB', 'ETH', 'MATIC', 'ARB', 'OP'] },
  { name: 'Aave', url: 'https://app.aave.com', category: 'Lending', chains: ['ETH', 'MATIC', 'ARB', 'OP', 'AVAX'] },
  { name: 'Curve', url: 'https://curve.fi', category: 'DEX', chains: ['ETH', 'MATIC', 'ARB', 'OP', 'AVAX'] },
  { name: 'OpenSea', url: 'https://opensea.io', category: 'NFT', chains: ['ETH', 'MATIC', 'ARB', 'OP'] },
  { name: 'Blur', url: 'https://blur.io', category: 'NFT', chains: ['ETH'] },
  { name: 'dYdX', url: 'https://dydx.exchange', category: 'Perps', chains: ['ETH', 'ARB'] },
  { name: 'GMX', url: 'https://app.gmx.io', category: 'Perps', chains: ['ARB', 'AVAX'] },
  { name: 'Raydium', url: 'https://raydium.io', category: 'DEX', chains: ['ETH'] },
  { name: 'Trader Joe', url: 'https://traderjoexyz.com', category: 'DEX', chains: ['AVAX', 'ARB', 'BNB'] },
];

function PopularDapps() {
  return (
    <section className={styles.section}>
      <h2 className={`${styles.sectionTitle} ${styles.sectionTitleEmphasis}`}>Popular dApps</h2>
      <p className={styles.hint}>
        Open a dApp, choose &ldquo;WalletConnect&rdquo; in its connect dialog, then paste the URI above.
      </p>
      <div className={styles.dappGrid}>
        {POPULAR_DAPPS.map((dapp) => (
          <a
            key={dapp.url}
            href={dapp.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.dappCard}
          >
            <span className={styles.dappName}>{dapp.name}</span>
            <span className={styles.dappCategory}>{dapp.category}</span>
            <div className={styles.dappChains}>
              {dapp.chains.map((c) => (
                <span key={c} className={styles.chainPill}>{c}</span>
              ))}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function WalletConnectInner() {
  const { initialized, error, pendingProposals, pendingRequests, pair } = useWalletConnect();
  const { isUnlocked } = useWallet();

  const [uri, setUri] = useState('');
  const [pairError, setPairError] = useState(null);
  const [pairing, setPairing] = useState(false);
  const [activeProposal, setActiveProposal] = useState(null);
  const [activeRequest, setActiveRequest] = useState(null);

  // Auto-surface the first pending proposal/request
  useEffect(() => {
    if (!activeProposal && pendingProposals.length) setActiveProposal(pendingProposals[0]);
  }, [pendingProposals, activeProposal]);

  useEffect(() => {
    if (!activeRequest && pendingRequests.length) setActiveRequest(pendingRequests[0]);
  }, [pendingRequests, activeRequest]);

  // Demo is a backend-less walkthrough with no unlocked vault. dApp sessions are
  // deliberately never simulated (the old fake WC session pages were deleted as
  // fake-security CRITICALs), so this must win over both the "not configured" and
  // "locked" messages below rather than falling through to a confusing generic
  // "Unlock your wallet" line. DEMO is a static, session-type-independent constant
  // (not isDecoy/isHidden or any per-session state), so this branch stays I3-safe.
  if (DEMO) {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>dApp Connector</h1>
        <div className={styles.setupCard} data-testid="wc-demo-notice">
          <p className={styles.setupTitle}>Disabled in demo mode</p>
          <p className={styles.setupBody}>
            Demo is a walkthrough — dApp sessions are never simulated, and pairing or
            signing only ever operate on a real, unlocked wallet.
          </p>
          <p className={styles.setupBody}>
            Leave demo (open <code>/?demo=0</code>) to use the dApp Connector.
          </p>
        </div>
        <PopularDapps />
      </div>
    );
  }

  if (!CONFIGURED) {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>dApp Connector</h1>
        <div className={styles.setupCard}>
          <p className={styles.setupTitle}>Project ID required</p>
          <p className={styles.setupBody}>
            To use the dApp Connector, add your WalletConnect Cloud project ID to{' '}
            <code>.env.local</code>:
          </p>
          <pre className={styles.setupCode}>VITE_WALLETCONNECT_PROJECT_ID=your_project_id</pre>
          <p className={styles.setupBody}>
            Get a free project ID at cloud.walletconnect.com (copy this address and open it in your
            browser manually — do not click links in the wallet UI).
          </p>
        </div>
        <PopularDapps />
      </div>
    );
  }

  if (!isUnlocked) {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>dApp Connector</h1>
        <p className={styles.locked}>Unlock your wallet to connect to dApps.</p>
      </div>
    );
  }

  async function handlePair() {
    if (!uri.trim()) return;
    setPairing(true);
    setPairError(null);
    try {
      await pair(uri);
      setUri('');
    } catch (e) {
      setPairError(e.message);
    } finally {
      setPairing(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>dApp Connector</h1>

      {error && (
        <p className={styles.error} role="alert">
          <AlertCircle className={styles.errorIcon} size={16} aria-hidden="true" />
          <span>dApp Connector error: {error}</span>
        </p>
      )}

      <PopularDapps />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Pair with dApp</h2>
        <p className={styles.hint}>
          In the dApp, choose &ldquo;WalletConnect&rdquo; and copy the URI or scan the QR code.
          Paste the URI below.
        </p>
        <div className={styles.pairRow}>
          <input
            className={styles.uriInput}
            type="text"
            placeholder="wc:..."
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePair()}
            disabled={!initialized || pairing}
          />
          <button
            className={styles.pairBtn}
            onClick={handlePair}
            disabled={!initialized || pairing || !uri.trim()}
          >
            {pairing ? 'Pairing…' : 'Pair'}
          </button>
        </div>
        {pairError && (
          <p className={styles.error} role="alert">
            <AlertCircle className={styles.errorIcon} size={16} aria-hidden="true" />
            <span>{pairError}</span>
          </p>
        )}
        {!initialized && !error && (
          <p className={styles.loadingRow} role="status">
            <Loader2 className={styles.spinner} size={14} aria-hidden="true" />
            <span>Initialising dApp Connector…</span>
          </p>
        )}
      </section>

      {pendingRequests.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Pending requests
            <span className={styles.badge}>{pendingRequests.length}</span>
          </h2>
          <ul className={styles.requestList}>
            {pendingRequests.map((r) => (
              <li key={`${r.topic}:${r.id}`}>
                <button
                  type="button"
                  className={styles.requestItem}
                  onClick={() => setActiveRequest(r)}
                >
                  <span className={styles.requestMethod}>{r.params?.request?.method}</span>
                  <span className={styles.requestChevron} aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Active sessions</h2>
        <ActiveSessions />
      </section>

      {activeProposal && (
        <SessionProposalModal
          proposal={activeProposal}
          onClose={() => setActiveProposal(null)}
        />
      )}

      {activeRequest && (
        <RequestApprovalModal
          request={activeRequest}
          onClose={() => setActiveRequest(null)}
          onReauthNeeded={() => {
            setActiveRequest(null);
            window.history.back();
          }}
        />
      )}
    </div>
  );
}

export default function WalletConnect() {
  return <WalletConnectProvider><WalletConnectInner /></WalletConnectProvider>;
}
