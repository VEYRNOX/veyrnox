import styles from './ActiveSessions.module.css';
import { useWalletConnect } from '@/lib/WalletConnectProvider.jsx';
import { getNetworkByChainId } from '@/wallet-core/evm/networks.js';
import { useState } from 'react';

export function ActiveSessions() {
  const { sessions, disconnect, refreshSessions } = useWalletConnect();
  const [disconnecting, setDisconnecting] = useState(null);

  if (!sessions.length) {
    return <p className={styles.empty}>No active sessions</p>;
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
        // M11 — expiry is enforced on the signing path; also mark it here so the
        // user can see a stale connection that should be revoked/reconnected.
        const isExpired = !(typeof s.expiry === 'number' && s.expiry * 1000 > Date.now());
        const expiry = new Date(s.expiry * 1000).toLocaleDateString();
        const accounts = s.namespaces?.eip155?.accounts ?? [];
        const chainIds = [...new Set(accounts.map((a) => {
          const parts = a.split(':');
          return parseInt(parts[1], 10);
        }).filter((id) => !isNaN(id)))];
        const chainNames = chainIds.map((id) => {
          try { return getNetworkByChainId(id).name; } catch { return `eip155:${id}`; }
        });
        return (
          <li key={s.topic} className={styles.item} data-expired={isExpired || undefined}>
            <div className={styles.info}>
              {meta.icons?.[0] && <img src={meta.icons[0]} alt="" className={styles.icon} width={32} height={32} />}
              <div>
                <p className={styles.name}>{meta.name ?? 'Unknown dApp'}</p>
                <p className={styles.url}>{meta.url ?? s.topic.slice(0, 16) + '…'}</p>
                <p className={styles.expiry}>
                  {isExpired ? `Expired ${expiry} — signing disabled` : `Expires ${expiry}`}
                </p>
                {chainNames.length > 0 && (
                  <p className={styles.expiry}>Chains: {chainNames.join(', ')}</p>
                )}
              </div>
            </div>
            <button
              className={styles.revokeBtn}
              onClick={() => handleDisconnect(s.topic)}
              disabled={disconnecting === s.topic}
            >
              {disconnecting === s.topic ? '…' : 'Revoke'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
