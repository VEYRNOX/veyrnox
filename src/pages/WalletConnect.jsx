import { useState, useEffect } from 'react';
import styles from './WalletConnect.module.css';
import { useWalletConnect } from '@/lib/WalletConnectProvider.jsx';
import { SessionProposalModal } from '@/components/walletconnect/SessionProposalModal.jsx';
import { RequestApprovalModal } from '@/components/walletconnect/RequestApprovalModal.jsx';
import { ActiveSessions } from '@/components/walletconnect/ActiveSessions.jsx';
import { useWallet } from '@/lib/WalletProvider.jsx';

const CONFIGURED = Boolean(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID);

export default function WalletConnect() {
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

  if (!CONFIGURED) {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>WalletConnect</h1>
        <div className={styles.setupCard}>
          <p className={styles.setupTitle}>Project ID required</p>
          <p className={styles.setupBody}>
            To use WalletConnect, add your WalletConnect Cloud project ID to{' '}
            <code>.env.local</code>:
          </p>
          <pre className={styles.setupCode}>VITE_WALLETCONNECT_PROJECT_ID=your_project_id</pre>
          <p className={styles.setupBody}>
            Get a free project ID at cloud.walletconnect.com (copy this address and open it in your
            browser manually — do not click links in the wallet UI).
          </p>
        </div>
      </div>
    );
  }

  if (!isUnlocked) {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>WalletConnect</h1>
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
      <h1 className={styles.heading}>WalletConnect</h1>

      {error && <p className={styles.error}>WalletConnect error: {error}</p>}

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
        {pairError && <p className={styles.error}>{pairError}</p>}
        {!initialized && !error && <p className={styles.hint}>Initialising…</p>}
      </section>

      {pendingRequests.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Pending requests
            <span className={styles.badge}>{pendingRequests.length}</span>
          </h2>
          <ul className={styles.requestList}>
            {pendingRequests.map((r) => (
              <li
                key={`${r.topic}:${r.id}`}
                className={styles.requestItem}
                onClick={() => setActiveRequest(r)}
              >
                <span className={styles.requestMethod}>{r.params?.request?.method}</span>
                <span className={styles.requestChevron}>›</span>
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
