import styles from './ActiveSessions.module.css';
import { useWalletConnect } from '@/lib/WalletConnectProvider.jsx';
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
        const expiry = new Date(s.expiry * 1000).toLocaleDateString();
        return (
          <li key={s.topic} className={styles.item}>
            <div className={styles.info}>
              {meta.icons?.[0] && <img src={meta.icons[0]} alt="" className={styles.icon} width={32} height={32} />}
              <div>
                <p className={styles.name}>{meta.name ?? 'Unknown dApp'}</p>
                <p className={styles.url}>{meta.url ?? s.topic.slice(0, 16) + '…'}</p>
                <p className={styles.expiry}>Expires {expiry}</p>
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
