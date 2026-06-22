import styles from './SessionProposalModal.module.css';
import { useWalletConnect } from '@/lib/WalletConnectProvider.jsx';
import { useState } from 'react';
import { checkDappDomain } from '@/risk/knownBadDapps.js';

export function SessionProposalModal({ proposal, onClose }) {
  const { approveSession, rejectSession, evmAddress } = useWalletConnect();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const meta = proposal.params?.proposer?.metadata ?? {};
  const requiredNs = proposal.params?.requiredNamespaces ?? {};
  const methods = requiredNs.eip155?.methods ?? [];
  const chains = requiredNs.eip155?.chains ?? [];

  const [ackKnownBad, setAckKnownBad] = useState(false);
  const dapp = checkDappDomain(meta.url);

  async function handleApprove() {
    setBusy(true);
    setErr(null);
    try {
      await approveSession(proposal.id);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    try {
      await rejectSession(proposal.id);
      onClose();
    } catch {
      onClose(); // always close on reject
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.title}>Connect to dApp?</h2>

        {dapp.flagged && (
          <div className={styles.riskAlert}>
            <p className={styles.riskTitle}>⚠ Known scam / phishing site</p>
            <p className={styles.riskBody}>{dapp.reason}</p>
            <p className={styles.riskDomain}>{dapp.domain}</p>
            <label className={styles.riskCheck}>
              <input
                type="checkbox"
                checked={ackKnownBad}
                onChange={(e) => setAckKnownBad(e.target.checked)}
              />
              I understand this site is flagged as a phishing risk and want to connect anyway.
            </label>
          </div>
        )}

        <div className={styles.dappInfo}>
          {meta.icons?.[0] && (
            <img src={meta.icons[0]} alt="" className={styles.icon} width={48} height={48} />
          )}
          <div>
            <p className={styles.dappName}>{meta.name ?? 'Unknown dApp'}</p>
            <p className={styles.dappUrl}>{meta.url ?? ''}</p>
          </div>
        </div>

        <p className={styles.label}>Connecting wallet</p>
        <p className={styles.address}>{evmAddress ?? '—'}</p>

        {chains.length > 0 && (
          <>
            <p className={styles.label}>Requested chains</p>
            <ul className={styles.list}>
              {chains.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </>
        )}

        {methods.length > 0 && (
          <>
            <p className={styles.label}>Requested methods</p>
            <ul className={styles.list}>
              {methods.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </>
        )}

        <p className={styles.warning}>
          Only connect to dApps you trust. This wallet will be visible to the dApp once connected.
        </p>

        {err && <p className={styles.error}>{err}</p>}

        <div className={styles.actions}>
          <button className={styles.rejectBtn} onClick={handleReject} disabled={busy}>
            Reject
          </button>
          <button className={styles.approveBtn} onClick={handleApprove} disabled={busy || (dapp.flagged && !ackKnownBad)}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}
