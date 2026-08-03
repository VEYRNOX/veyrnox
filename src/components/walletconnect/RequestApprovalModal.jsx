// @ts-nocheck
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ethers } from 'ethers';
import styles from './RequestApprovalModal.module.css';
import { successHaptic, errorHaptic, tapHaptic } from '@/lib/haptics';
import { useWalletConnect, resolvePersonalSignMessage } from '@/lib/WalletConnectProvider.jsx';
import { REQUEST_TYPES } from '@/wallet-core/evm/walletconnect/router.js';
// Imported from wallet-core, NOT from WalletConnectProvider: this is the same
// helper the provider uses to CAP the fee, so the ceiling shown here and the
// ceiling enforced at send time are one value (H-7).
import { resolveWcWorstCaseFeeWei } from '@/wallet-core/evm/walletconnect/fee.js';
import { checkDappDomain } from '@/risk/knownBadDapps.js';
import { score } from '@/risk/score.js';
import { buildRiskInputsFromWcRequest } from '@/risk/fromWalletConnect.js';
import RiskVerdictBanner from '@/components/RiskVerdictBanner.jsx';
import { simulateEvmTransaction } from '@/wallet-core/evm/simulate.js';
import { getNetworkByChainId } from '@/wallet-core/evm/networks.js';
import { useModalA11y } from '@/lib/useModalA11y.js';

// "eip155:11155111" -> 11155111. Returns NaN for anything unparseable.
function parseWcChainId(caip2) {
  if (typeof caip2 !== 'string') return NaN;
  return parseInt(caip2.replace(/^eip155:/, ''), 10);
}

export function RequestApprovalModal({ request, onClose, onReauthNeeded }) {
  const { t } = useTranslation('security');
  const { signPersonal, signTypedData, sendTransaction, rejectRequest, isSendReauthRequired, evmAddress, sessions } = useWalletConnect();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [permitAcknowledged, setPermitAcknowledged] = useState(false);
  const [txAcknowledged, setTxAcknowledged] = useState(false);
  const [riskVerdict, setRiskVerdict] = useState(null);
  const [codePending, setCodePending] = useState(false);
  const [riskAck, setRiskAck] = useState(false);

  const { topic, id, params, type, blocked, typedDataMeta } = request;
  const { request: { method, params: reqParams } } = params;

  const titleId = useId();
  const descId = useId();

  // Resolve the request's network once: it drives the native symbol, the network
  // NAME shown to the user, and the mainnet "real funds" warning. A chain we cannot
  // identify is treated as real-funds (fail loud), never silently as testnet.
  const wcChainIdNum = parseWcChainId(params.chainId);
  const wcNetwork = (() => {
    try { return getNetworkByChainId(wcChainIdNum) ?? null; } catch { return null; }
  })();
  const nativeSymbol = wcNetwork?.symbol ?? 'ETH';
  const networkLabel = wcNetwork?.name
    ?? (Number.isFinite(wcChainIdNum)
      ? t('wc.request_approval.unknown_network_with_id', { id: wcChainIdNum })
      : t('wc.request_approval.unknown_network'));
  const realFundsWarning = wcNetwork ? wcNetwork.isTestnet === false : true;

  // H-7 — the MOST this request can cost in fees. M9/F-02-GASCAP already bound
  // it; the bug was that the bound was invisible, so a `value: 0x0` request with
  // the fee pinned at the ceiling read as harmless. null when it cannot be
  // derived honestly (no dApp-supplied fee, or an unparseable one) — in that case
  // we render no row at all rather than a fabricated number (I4).
  const worstCaseFeeWei = (() => {
    try { return resolveWcWorstCaseFeeWei(reqParams?.[0], wcNetwork?.key); } catch { return null; }
  })();
  const worstCaseFeeText = worstCaseFeeWei == null ? null : ethers.formatEther(worstCaseFeeWei);

  const needsReauth = isSendReauthRequired();

  // eth_sendTransaction risk scoring. Fetch recipientCode via the SAME simulation
  // the Send flow runs, feed score(), and render the verdict. Fail closed: any
  // simulation error -> recipientCode undefined -> S7 CAUTION; a throwing score()
  // -> a blocking RISK verdict. Corpus is empty in this build (S2/S7 need none).
  useEffect(() => {
    if (type !== REQUEST_TYPES.SEND_TRANSACTION) return undefined;
    const txParam = reqParams?.[0] || {};
    const chainId = parseWcChainId(params.chainId);
    let cancelled = false;
    setCodePending(true);
    setRiskVerdict(null);
    (async () => {
      let recipientCode;
      try {
        const net = getNetworkByChainId(chainId);
        if (net?.key && txParam.to) {
          const sim = await simulateEvmTransaction({
            networkKey: net.key,
            from: evmAddress,
            to: txParam.to,
            valueWei: txParam.value ? BigInt(txParam.value) : 0n,
            data: txParam.data ?? '0x',
          });
          recipientCode = sim?.recipientCode ?? undefined;
        }
      } catch {
        recipientCode = undefined; // fail closed -> S7 CAUTION
      }
      if (cancelled) return;
      const inputs = buildRiskInputsFromWcRequest({ txParam, chainId, recipientCode });
      let verdict;
      try {
        verdict = score(inputs.unsignedTx, inputs.activeSetLocalState, inputs.chainData);
      } catch {
        // score() should never throw (it catches its signals), but if it does we
        // must not read "safe" — synthesize a blocking RISK verdict.
        verdict = {
          level: 'RISK',
          sentence: 'A risk check could not complete. Treat this request as unsafe.',
          evidence: null,
          signalId: null,
          requiresConfirmation: true,
          signals: [],
        };
      }
      setRiskVerdict(verdict);
      setCodePending(false);
    })();
    return () => { cancelled = true; };
  }, [type, reqParams, params.chainId, evmAddress]);

  const blockedRef = useModalA11y({
    active: !!blocked,
    onEscape: () => { rejectRequest(topic, id); onClose(); },
  });

  const activeRef = useModalA11y({
    active: !blocked,
    onEscape: () => { if (!busy) handleReject(); },
  });

  // --- Blocked methods: auto-reject UI, never show approve ---
  if (blocked) {
    return (
      <div className={styles.overlay}>
        <div
          ref={blockedRef}
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
        >
          <h2 id={titleId} className={styles.title}>{t('wc.request_approval.blocked_title')}</h2>
          <p id={descId} className={styles.body}>
            <strong>{method}</strong> {t('wc.request_approval.not_supported')}
            {method === 'eth_sign' && ` ${t('wc.request_approval.eth_sign_note')}`}
            {method === 'wallet_addEthereumChain' && ` ${t('wc.request_approval.add_chain_note')}`}
          </p>
          <button className={styles.rejectBtn} onClick={() => { rejectRequest(topic, id); onClose(); }}>
            {t('wc.request_approval.dismiss')}
          </button>
        </div>
      </div>
    );
  }

  // --- personal_sign: decode hex message to UTF-8 where possible ---
  // H-NEW-C — use resolvePersonalSignMessage() to handle both EIP-1474 [message,
  // address] and MetaMask-legacy [address, message] param ordering. Previously
  // this decoded reqParams[0] directly, which would show garbage (the address
  // bytes) to the user while the signing handler correctly signed the real message
  // — a display/sign divergence. Now both paths use the same resolution logic.
  let personalSignMessage = null;
  if (type === REQUEST_TYPES.PERSONAL_SIGN) {
    const resolved = resolvePersonalSignMessage(reqParams, evmAddress);
    const hexMsg = resolved.ok ? resolved.message : reqParams[0];
    try {
      personalSignMessage = ethers.toUtf8String(hexMsg);
    } catch {
      personalSignMessage = hexMsg; // show raw hex if not valid UTF-8
    }
  }

  const isAssetAuth = typedDataMeta?.assetAuthorising?.isAssetAuthorising;

  const riskBlocks =
    type === REQUEST_TYPES.SEND_TRANSACTION &&
    (codePending || (riskVerdict?.requiresConfirmation && !riskAck));

  const approveBlocked =
    needsReauth ||
    (isAssetAuth && !permitAcknowledged) ||
    (type === REQUEST_TYPES.SEND_TRANSACTION && !txAcknowledged) ||
    type === REQUEST_TYPES.UNKNOWN ||
    riskBlocks;

  // C4: session_request events carry NO proposer field — the dApp identity lives on
  // the live session, keyed by topic, at session.peer.metadata. Read it from there,
  // never from request.params.proposer (which is always absent here). Fail closed
  // (I4): a request whose session we cannot resolve is treated as suspicious so the
  // phishing banner shows, rather than silently suppressed.
  const liveSession = (Array.isArray(sessions) ? sessions : []).find((s) => s?.topic === topic);
  const sessionMeta = liveSession?.peer?.metadata ?? {};
  const sessionUnresolved = !liveSession;
  const dappCheck = checkDappDomain(sessionMeta.url);
  const dapp = sessionUnresolved
    ? {
        domain: sessionMeta.url ? dappCheck.domain : t('wc.request_approval.unresolved_domain_fallback'),
        flagged: true,
        reason: t('wc.request_approval.unresolved_reason'),
      }
    : dappCheck;

  async function handleApprove() {
    if (needsReauth) { onReauthNeeded?.(); return; }
    if (approveBlocked) return;
    setBusy(true);
    setErr(null);
    try {
      if (type === REQUEST_TYPES.PERSONAL_SIGN) {
        await signPersonal(topic, id, reqParams);
      } else if (type === REQUEST_TYPES.SIGN_TYPED_DATA) {
        await signTypedData(topic, id, reqParams, params.chainId); // audit-H7: pass session chain for domain.chainId validation
      } else if (type === REQUEST_TYPES.SEND_TRANSACTION) {
        await sendTransaction(topic, id, reqParams, params.chainId);
      } else {
        throw new Error(`Signing for ${type} via the dApp Connector is not yet implemented.`);
      }
      successHaptic();
      onClose();
    } catch (e) {
      errorHaptic();
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    tapHaptic();
    try { await rejectRequest(topic, id); } catch { /* ignore */ }
    onClose();
  }

  return (
    <div className={styles.overlay}>
      <div
        ref={activeRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <span id={titleId} className={styles.appName}>{sessionMeta.name ?? t('wc.request_approval.fallback_dapp_name')}</span>
          <span className={styles.methodBadge}>{method}</span>
        </div>

        {dapp.flagged && (
          <div className={styles.permitWarning}>
            <p className={styles.permitTitle}>{t('wc.request_approval.scam_title')}</p>
            <p className={styles.permitBody}>
              {t('wc.request_approval.scam_body', {
                name: sessionMeta.name ?? t('wc.request_approval.fallback_dapp_name'),
                domain: dapp.domain,
                reason: dapp.reason,
              })}
            </p>
          </div>
        )}

        {/* PERSONAL SIGN */}
        {type === REQUEST_TYPES.PERSONAL_SIGN && (
          <>
            <p className={styles.label}>{t('wc.request_approval.message_to_sign_label')}</p>
            <pre className={styles.messageBox}>{personalSignMessage}</pre>
            <p className={styles.hint}>
              {t('wc.request_approval.personal_sign_hint')}
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
                <p className={styles.permitTitle}>{t('wc.request_approval.permit_title')}</p>
                <p className={styles.permitBody}>{typedDataMeta.assetAuthorising.reason}</p>
                <label className={styles.permitCheck}>
                  <input
                    type="checkbox"
                    checked={permitAcknowledged}
                    onChange={(e) => setPermitAcknowledged(e.target.checked)}
                  />
                  {t('wc.request_approval.permit_ack')}
                </label>
              </div>
            )}
          </>
        )}

        {/* SEND TRANSACTION */}
        {type === REQUEST_TYPES.SEND_TRANSACTION && (
          <>
            <p className={styles.label}>{t('wc.request_approval.transaction_label')}</p>
            <div className={styles.txBox}>
              <div className={styles.txRow}>
                <span>{t('wc.request_approval.network_row_label')}</span>
                <span className={realFundsWarning ? styles.networkMainnet : styles.mono}>{networkLabel}</span>
              </div>
              <div className={styles.txRow}>
                <span>{t('wc.request_approval.to_row_label')}</span>
                <span className={styles.mono}>{reqParams[0]?.to ?? '—'}</span>
              </div>
              <div className={styles.txRow}>
                <span>{t('wc.request_approval.value_row_label')}</span>
                <span className={styles.mono}>
                  {reqParams[0]?.value
                    ? ethers.formatEther(BigInt(reqParams[0].value)) + ' ' + nativeSymbol
                    : '0 ' + nativeSymbol}
                </span>
              </div>
              {worstCaseFeeText != null && (
                <div className={styles.txRow}>
                  <span>{t('wc.request_approval.max_fee_row_label')}</span>
                  <span className={styles.mono} data-testid="wc-max-fee">
                    {t('wc.request_approval.max_fee_row_value', {
                      amount: worstCaseFeeText,
                      symbol: nativeSymbol,
                    })}
                  </span>
                </div>
              )}
              {reqParams[0]?.data && reqParams[0].data !== '0x' && (
                <div className={styles.txRow}>
                  <span>{t('wc.request_approval.data_row_label')}</span>
                  <span className={styles.mono}>{reqParams[0].data.slice(0, 10)}…</span>
                </div>
              )}
            </div>
            {worstCaseFeeText != null && (
              <p className={styles.feeNote}>{t('wc.request_approval.max_fee_note')}</p>
            )}
            {realFundsWarning && (
              <p className={styles.mainnetFlag}>
                {t('wc.request_approval.mainnet_flag')}
              </p>
            )}
            <div className={styles.permitWarning}>
              <p className={styles.permitTitle}>{t('wc.request_approval.broadcast_title')}</p>
              <p className={styles.permitBody}>
                {t('wc.request_approval.broadcast_body')}
              </p>
              <label className={styles.permitCheck}>
                <input
                  type="checkbox"
                  checked={txAcknowledged}
                  onChange={(e) => setTxAcknowledged(e.target.checked)}
                />
                {t('wc.request_approval.broadcast_ack')}
              </label>
            </div>
            <RiskVerdictBanner
              verdict={riskVerdict}
              pending={codePending}
              acknowledged={riskAck}
              onAcknowledge={setRiskAck}
            />
          </>
        )}

        {/* UNKNOWN */}
        {type === REQUEST_TYPES.UNKNOWN && (
          <p className={styles.body}>
            {t('wc.request_approval.unknown_method_lead')} <strong>{method}</strong>{t('wc.request_approval.unknown_method_tail')}
          </p>
        )}

        {needsReauth && (
          <p className={styles.reauthNotice}>
            {t('wc.request_approval.reauth_notice')}
          </p>
        )}

        {err && <p className={styles.error}>{err}</p>}

        <div className={styles.actions}>
          <button className={styles.rejectBtn} onClick={handleReject} disabled={busy}>
            {t('wc.request_approval.reject')}
          </button>
          {type !== REQUEST_TYPES.UNKNOWN && (
            <button
              className={styles.approveBtn}
              onClick={needsReauth ? () => onReauthNeeded?.() : handleApprove}
              disabled={busy || (approveBlocked && !needsReauth)}
            >
              {busy
                ? type === REQUEST_TYPES.SEND_TRANSACTION ? t('wc.request_approval.sending_busy') : t('wc.request_approval.signing_busy')
                : needsReauth ? t('wc.request_approval.approve_reauth') : t('wc.request_approval.approve')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
