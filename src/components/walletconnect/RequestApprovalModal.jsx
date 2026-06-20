import { useState } from 'react';
import { ethers } from 'ethers';
import styles from './RequestApprovalModal.module.css';
import { useWalletConnect } from '@/lib/WalletConnectProvider.jsx';
import { REQUEST_TYPES } from '@/wallet-core/evm/walletconnect/router.js';

export function RequestApprovalModal({ request, onClose, onReauthNeeded }) {
  const { signPersonal, signTypedData, sendTransaction, rejectRequest, isSendReauthRequired } = useWalletConnect();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [permitAcknowledged, setPermitAcknowledged] = useState(false);
  const [txAcknowledged, setTxAcknowledged] = useState(false);

  const { topic, id, params, type, blocked, typedDataMeta } = request;
  const { request: { method, params: reqParams } } = params;

  const needsReauth = isSendReauthRequired();

  // --- Blocked methods: auto-reject UI, never show approve ---
  if (blocked) {
    return (
      <div className={styles.overlay}>
        <div className={styles.modal}>
          <h2 className={styles.title}>Request blocked</h2>
          <p className={styles.body}>
            <strong>{method}</strong> is not supported by Veyrnox.
            {method === 'eth_sign' && ' Raw byte signing (eth_sign) is disabled — it cannot show you what you are signing.'}
            {method === 'wallet_addEthereumChain' && ' Adding arbitrary chains is disabled to prevent RPC injection attacks.'}
          </p>
          <button className={styles.rejectBtn} onClick={() => { rejectRequest(topic, id); onClose(); }}>
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // --- personal_sign: decode hex message to UTF-8 where possible ---
  let personalSignMessage = null;
  if (type === REQUEST_TYPES.PERSONAL_SIGN) {
    try {
      personalSignMessage = ethers.toUtf8String(reqParams[0]);
    } catch {
      personalSignMessage = reqParams[0]; // show raw hex if not valid UTF-8
    }
  }

  const isAssetAuth = typedDataMeta?.assetAuthorising?.isAssetAuthorising;
  const approveBlocked =
    needsReauth ||
    (isAssetAuth && !permitAcknowledged) ||
    (type === REQUEST_TYPES.SEND_TRANSACTION && !txAcknowledged) ||
    type === REQUEST_TYPES.UNKNOWN;

  const sessionMeta = request.params?.proposer?.metadata ?? {};

  async function handleApprove() {
    if (needsReauth) { onReauthNeeded?.(); return; }
    if (approveBlocked) return;
    setBusy(true);
    setErr(null);
    try {
      if (type === REQUEST_TYPES.PERSONAL_SIGN) {
        await signPersonal(topic, id, reqParams);
      } else if (type === REQUEST_TYPES.SIGN_TYPED_DATA) {
        await signTypedData(topic, id, reqParams);
      } else if (type === REQUEST_TYPES.SEND_TRANSACTION) {
        await sendTransaction(topic, id, reqParams, params.chainId);
      } else {
        throw new Error(`Signing for ${type} via WalletConnect is not yet implemented.`);
      }
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    try { await rejectRequest(topic, id); } catch { /* ignore */ }
    onClose();
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.appName}>{sessionMeta.name ?? 'dApp'}</span>
          <span className={styles.methodBadge}>{method}</span>
        </div>

        {/* PERSONAL SIGN */}
        {type === REQUEST_TYPES.PERSONAL_SIGN && (
          <>
            <p className={styles.label}>Message to sign</p>
            <pre className={styles.messageBox}>{personalSignMessage}</pre>
            <p className={styles.hint}>
              Signing this message will NOT send a transaction or cost gas.
              Only sign messages from dApps you trust.
            </p>
          </>
        )}

        {/* TYPED DATA */}
        {type === REQUEST_TYPES.SIGN_TYPED_DATA && typedDataMeta && (
          <>
            <p className={styles.label}>{typedDataMeta.description.summary}</p>
            <ul className={styles.fieldList}>
              {typedDataMeta.description.fields.map((f) => (
                <li key={f.name} className={styles.field}>
                  <span className={styles.fieldName}>{f.name}</span>
                  <span className={styles.fieldValue}>{f.value}</span>
                </li>
              ))}
            </ul>

            {isAssetAuth && (
              <div className={styles.permitWarning}>
                <p className={styles.permitTitle}>⚠ Token Authorisation Warning</p>
                <p className={styles.permitBody}>{typedDataMeta.assetAuthorising.reason}</p>
                <label className={styles.permitCheck}>
                  <input
                    type="checkbox"
                    checked={permitAcknowledged}
                    onChange={(e) => setPermitAcknowledged(e.target.checked)}
                  />
                  I understand this signature authorises a spender to move my tokens
                </label>
              </div>
            )}
          </>
        )}

        {/* SEND TRANSACTION */}
        {type === REQUEST_TYPES.SEND_TRANSACTION && (
          <>
            <p className={styles.label}>Transaction</p>
            <div className={styles.txBox}>
              <div className={styles.txRow}>
                <span>To</span>
                <span className={styles.mono}>{reqParams[0]?.to ?? '—'}</span>
              </div>
              <div className={styles.txRow}>
                <span>Value</span>
                <span className={styles.mono}>
                  {reqParams[0]?.value
                    ? ethers.formatEther(BigInt(reqParams[0].value)) + ' ETH'
                    : '0 ETH'}
                </span>
              </div>
              {reqParams[0]?.data && reqParams[0].data !== '0x' && (
                <div className={styles.txRow}>
                  <span>Data</span>
                  <span className={styles.mono}>{reqParams[0].data.slice(0, 10)}…</span>
                </div>
              )}
            </div>
            <div className={styles.permitWarning}>
              <p className={styles.permitTitle}>⚠ This will broadcast a transaction</p>
              <p className={styles.permitBody}>
                Approving sends a real on-chain transaction and costs gas. Only approve
                requests from dApps you trust. This action cannot be undone.
              </p>
              <label className={styles.permitCheck}>
                <input
                  type="checkbox"
                  checked={txAcknowledged}
                  onChange={(e) => setTxAcknowledged(e.target.checked)}
                />
                I understand this will send a real transaction
              </label>
            </div>
          </>
        )}

        {/* UNKNOWN */}
        {type === REQUEST_TYPES.UNKNOWN && (
          <p className={styles.body}>
            Unknown request method <strong>{method}</strong>. Veyrnox cannot safely display or sign this.
          </p>
        )}

        {needsReauth && (
          <p className={styles.reauthNotice}>
            Your session has timed out. Please re-authenticate before signing.
          </p>
        )}

        {err && <p className={styles.error}>{err}</p>}

        <div className={styles.actions}>
          <button className={styles.rejectBtn} onClick={handleReject} disabled={busy}>
            Reject
          </button>
          {type !== REQUEST_TYPES.UNKNOWN && (
            <button
              className={styles.approveBtn}
              onClick={needsReauth ? () => onReauthNeeded?.() : handleApprove}
              disabled={busy || (approveBlocked && !needsReauth)}
            >
              {busy
                ? type === REQUEST_TYPES.SEND_TRANSACTION ? 'Sending…' : 'Signing…'
                : needsReauth ? 'Re-authenticate' : 'Approve'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
