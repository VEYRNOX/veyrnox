import styles from './ActiveSessions.module.css';
import { useWalletConnect } from '@/lib/WalletConnectProvider.jsx';
import { getNetworkByChainId } from '@/wallet-core/evm/networks.js';
import { useState } from 'react';

// Show the bare host (drop scheme + trailing slash) so a long dApp URL stays
// scannable and truncates cleanly instead of wrapping the card.
function displayHost(url, fallback) {
  if (typeof url !== 'string' || !url) return fallback;
  return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

export function ActiveSessions() {
  const { sessions, disconnect, refreshSessions } = useWalletConnect();
  const [disconnecting, setDisconnecting] = useState(null);

  if (!sessions.length) {
    return <p className={styles.empty}>No dApps connected yet. Pair one above to get started.</p>;
  }

  async function handleDisconnect(topic) {
    setDisconnecting(topic);
    try { await disconnect(topic); } catch { refreshSessions(); }
    setDisconnecting(null);
  }

  return (
    <ul className={styles.list}>
      {sessions.map((s) => {
        const meta = s.peer?.metadata ?? {};
        const name = meta.name || 'Unknown dApp';
        const host = displayHost(meta.url, `${s.topic.slice(0, 16)}…`);
        // M11 — expiry is enforced on the signing path; surface it here too so a
        // stale connection that should be revoked/reconnected is visible.
        const isExpired = !(typeof s.expiry === 'number' && s.expiry * 1000 > Date.now());
        const expiry = new Date(s.expiry * 1000).toLocaleDateString();
        const accounts = s.namespaces?.eip155?.accounts ?? [];
        const chainIds = [...new Set(
          accounts.map((a) => parseInt(a.split(':')[1], 10)).filter((id) => !Number.isNaN(id)),
        )];
        const chainNames = chainIds.map((id) => {
          try { return getNetworkByChainId(id).name; } catch { return `Chain ${id}`; }
        });
        const busy = disconnecting === s.topic;

        return (
          <li key={s.topic} className={styles.item} data-expired={isExpired || undefined}>
            {meta.icons?.[0]
              ? <img src={meta.icons[0]} alt="" className={styles.icon} width={36} height={36} />
              : <span className={styles.iconFallback} aria-hidden="true">{name.charAt(0)}</span>}

            <div className={styles.info}>
              <p className={styles.name} title={name}>{name}</p>
              <p className={styles.url} title={meta.url || ''}>{host}</p>
              <div className={styles.meta}>
                {isExpired
                  ? <span className={styles.statusExpired} title={`Expired ${expiry} — signing disabled`}>Expired</span>
                  : <span className={styles.status}>Expires {expiry}</span>}
                {chainNames.map((c) => <span key={c} className={styles.chip}>{c}</span>)}
              </div>
            </div>

            <button
              className={styles.revokeBtn}
              onClick={() => handleDisconnect(s.topic)}
              disabled={busy}
              aria-label={`Revoke connection to ${name}`}
            >
              {busy ? '…' : 'Revoke'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
