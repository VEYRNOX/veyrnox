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

const DAPP_LOGOS = {
  'Binance Web3 Wallet': (
    <svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#F0B90B"/><path d="M16 7l3.5 3.5-2.1 2.1L16 11.2l-1.4 1.4-2.1-2.1L16 7zm-5.5 5.5L14 16l-3.5 3.5-2.1-2.1 1.4-1.4-1.4-1.4 2.1-2.1zm11 0l2.1 2.1-1.4 1.4 1.4 1.4-2.1 2.1L18 16l3.5-3.5zM16 13.9l2.1 2.1-2.1 2.1-2.1-2.1 2.1-2.1zM16 21.2l1.4-1.4 2.1 2.1L16 25l-3.5-3.5 2.1-2.1L16 21.2z" fill="#fff"/></svg>
  ),
  'Uniswap': (
    <svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#FF007A"/><path d="M12.5 8c1.2 0 2 .3 2 .3s-.3 1.2.5 1.8c.8.6 2.2.4 3.2 1.2 1.5 1.2 1 3.5.8 4.5-.2 1-.8 2.3-.2 3.5.4.8 1.2 1.2 1.2 1.2s-1 .5-1.8 1.8c-.6 1-.5 2.2-.5 2.2H14s.1-1-.5-2c-.5-.8-1.5-1.2-2-2.5-.5-1.5 0-3 .5-4s1-2 .5-3.2C12 11.6 11 11 11 11s.5-1.5.8-2c.2-.5.7-1 .7-1zm6 1.5c0 .5.4.8.8.8s.8-.3.8-.8-.4-.8-.8-.8-.8.3-.8.8z" fill="#fff"/></svg>
  ),
  '1inch': (
    <svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#1B314F"/><path d="M17.5 7c1 0 2.5 1.5 2.5 1.5l-1 2s1.5.5 2 2c.5 1.5-.5 3-1 4s-1 2.5-.5 4c.3 1 1 1.5 1 1.5l-1.5 2s-1-.5-2-1.5c-1.5-1.5-2-3.5-1.5-5.5.3-1 .8-2 .5-3-.2-.8-.8-1.2-.8-1.2L17.5 7z" fill="#D82122"/><circle cx="19" cy="10" r=".8" fill="#D82122"/></svg>
  ),
  'PancakeSwap': (
    <svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#633001"/><ellipse cx="16" cy="19" rx="7" ry="5" fill="#D1884F"/><ellipse cx="16" cy="17.5" rx="7" ry="5" fill="#FEDC90"/><circle cx="13" cy="12" r="3" fill="#D1884F"/><circle cx="19" cy="12" r="3" fill="#D1884F"/><circle cx="13" cy="11.5" r="2.2" fill="#FEDC90"/><circle cx="19" cy="11.5" r="2.2" fill="#FEDC90"/><circle cx="12.5" cy="11" r=".6" fill="#633001"/><circle cx="19.5" cy="11" r=".6" fill="#633001"/></svg>
  ),
  'Aave': (
    <svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#2EBAC6"/><path d="M21.5 23h-2.8l-1.5-3.8h-.4L15.3 23H12.5L16 13.5h.5l1.2 3h.1l1.2-3h.5L21.5 23zm-6.5-5.5h2l-1-2.8-1 2.8z" fill="#fff"/></svg>
  ),
  'Curve': (
    <svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#000"/><path d="M8 20c2-4 5-8 10-10" stroke="#FF0000" strokeWidth="2.5" strokeLinecap="round" fill="none"/><path d="M10 22c2-4 5-8 10-10" stroke="#F7EC00" strokeWidth="2.5" strokeLinecap="round" fill="none"/><path d="M12 24c2-4 5-8 10-10" stroke="#0000FF" strokeWidth="2.5" strokeLinecap="round" fill="none"/></svg>
  ),
  'OpenSea': (
    <svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#2081E2"/><path d="M9 17.5l.2-.3 4-6.2c.1-.1.2-.1.3 0 .7 1.3 1.2 2.8 1 4.3-.1.6-.4 1.2-.8 1.8l-.1.2c0 .1-.1.1-.2.1H9.2c-.1 0-.2-.1-.2-.2v.3zm14 1.5v1c0 .1 0 .1-.1.2-1.5.6-2.5 1.8-3.2 3.3 0 .1-.1.1-.2.1h-2.2c-.1 0-.2-.1-.2-.2 0-2.5 1.8-4.7 4.2-5.3.1 0 .2 0 .2.1.3.3.5.5.5.8z" fill="#fff"/></svg>
  ),
  'Blur': (
    <svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#FF6F00"/><text x="16" y="21" textAnchor="middle" fontFamily="Arial,sans-serif" fontWeight="900" fontSize="16" fill="#fff">B</text></svg>
  ),
  'dYdX': (
    <svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#6966FF"/><path d="M10 9h3l5 7-5 7h-3l5-7-5-7z" fill="#fff"/><path d="M22 9h-3l-5 7 5 7h3l-5-7 5-7z" fill="#fff" opacity=".5"/></svg>
  ),
  'GMX': (
    <svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#2D42FC"/><path d="M8 16l4-6h3l-4 6 4 6h-3l-4-6zm8 0l4-6h3l-4 6 4 6h-3l-4-6z" fill="#fff"/></svg>
  ),
  'Raydium': (
    <svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#2C2D52"/><circle cx="16" cy="16" r="7" fill="none" stroke="#4F46E5" strokeWidth="2"/><path d="M16 9v7l5 3.5" stroke="#C084FC" strokeWidth="2" strokeLinecap="round"/><circle cx="16" cy="16" r="2" fill="#C084FC"/></svg>
  ),
  'Trader Joe': (
    <svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#E53547"/><ellipse cx="16" cy="19" rx="5" ry="4.5" fill="#fff"/><circle cx="14.5" cy="18.5" r=".8" fill="#E53547"/><circle cx="17.5" cy="18.5" r=".8" fill="#E53547"/><path d="M14 21c.5.8 1.2 1 2 1s1.5-.2 2-1" stroke="#E53547" strokeWidth=".8" strokeLinecap="round" fill="none"/><path d="M10 14.5c0-1 1-2.5 6-2.5s6 1.5 6 2.5c0 1.5-2 2-6 2s-6-.5-6-2z" fill="#E53547"/><path d="M10 14.5c0-1 1-2.5 6-2.5s6 1.5 6 2.5" stroke="#fff" strokeWidth=".5" fill="none"/></svg>
  ),
};

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
            <div className={styles.dappHeader}>
              <div className={styles.dappLogo}>
                {DAPP_LOGOS[dapp.name]}
              </div>
              <div className={styles.dappInfo}>
                <span className={styles.dappName}>{dapp.name}</span>
                <span className={styles.dappCategory}>{dapp.category}</span>
              </div>
            </div>
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
        <PopularDapps />
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
