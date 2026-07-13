// @ts-nocheck
import styles from './SessionProposalModal.module.css';
import { useWalletConnect } from '@/lib/WalletConnectProvider.jsx';
import { useState } from 'react';
import { checkDappDomain, LOCAL_KNOWN_BAD } from '@/risk/knownBadDapps.js';
import { getNetworkByChainId } from '@/wallet-core/evm/networks.js';
import { SUPPORTED_CHAIN_IDS } from '@/wallet-core/evm/walletconnect/router.js';

// Render a CAIP-2 chain string ("eip155:11155111") as a friendly network name,
// falling back to the raw string for unsupported / unknown chains.
function chainLabel(caip2) {
  const chainId = parseInt(caip2.replace(/^eip155:/, ''), 10);
  try {
    return getNetworkByChainId(chainId).name;
  } catch {
    return caip2;
  }
}

function chainId(caip2) {
  return parseInt(caip2.replace(/^eip155:/, ''), 10);
}

export function SessionProposalModal({ proposal, onClose }) {
  const { approveSession, rejectSession, evmAddress } = useWalletConnect();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const meta = proposal.params?.proposer?.metadata ?? {};
  const requiredNs = proposal.params?.requiredNamespaces ?? {};
  const optionalNs = proposal.params?.optionalNamespaces ?? {};
  const methods = requiredNs.eip155?.methods ?? [];
  const chains = requiredNs.eip155?.chains ?? [];
  const optionalChains = optionalNs.eip155?.chains ?? [];
  const optionalMethods = optionalNs.eip155?.methods ?? [];

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

        <p className={styles.honestyCaveat}>
          Veyrnox checks against {LOCAL_KNOWN_BAD.length} known scam domains. A clean result does not confirm this site is safe — always verify the dApp URL independently.
        </p>

        <div className={styles.dappInfo}>
          {meta.icons?.[0] && (
            <img src={meta.icons[0]} alt="" className={styles.icon} width={48} height={48} />
          )}
          <div>
            <p className={styles.dappName}>{meta.name ?? 'Unknown dApp'}</p>
            <p className={styles.dappUrl}>{meta.url ?? ''}</p>
          </div>
        </div>

        <p className={styles.domainCaveat}>
          Domain check covers a limited blocklist — absence does not confirm safety.
        </p>

        <p className={styles.label}>Connecting wallet</p>
        <p className={styles.address}>{evmAddress ?? '—'}</p>

        {chains.length > 0 && (
          <>
            <p className={styles.label}>Required chains</p>
            <ul className={styles.list}>
              {chains.map((c) => <li key={c}>{chainLabel(c)}</li>)}
            </ul>
            {chains.some((c) => !SUPPORTED_CHAIN_IDS.has(chainId(c))) && (
              <p className={styles.warning}>
                Unsupported chains will be excluded from the approved session.
              </p>
            )}
          </>
        )}

        {optionalChains.length > 0 && (
          <>
            <p className={styles.label}>Also requested (optional)</p>
            <ul className={`${styles.list} ${styles.optionalList}`}>
              {optionalChains.map((c) => <li key={c}>{chainLabel(c)}</li>)}
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

        {(optionalChains.length > 0 || optionalMethods.length > 0) && (
          <div className={styles.optionalSection}>
            <p className={styles.label}>Optional chains also requested</p>
            {optionalChains.length > 0 && (
              <ul className={styles.list}>
                {optionalChains.map((c) => <li key={c}>{chainLabel(c)}</li>)}
              </ul>
            )}
            {optionalMethods.length > 0 && (
              <>
                <p className={styles.label}>Optional methods also requested</p>
                <ul className={styles.list}>
                  {optionalMethods.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </>
            )}
            <p className={styles.optionalNote}>
              These are optional — the dApp has declared it can work without them. They will be included in the approved session if your wallet supports them.
            </p>
          </div>
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
