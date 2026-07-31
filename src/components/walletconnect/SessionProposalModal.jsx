// @ts-nocheck
import styles from './SessionProposalModal.module.css';
import { successHaptic, errorHaptic, tapHaptic } from '@/lib/haptics';
import { useWalletConnect } from '@/lib/WalletConnectProvider.jsx';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { checkDappDomain, LOCAL_KNOWN_BAD } from '@/risk/knownBadDapps.js';
import { getNetworkByChainId } from '@/wallet-core/evm/networks.js';
import { SUPPORTED_CHAIN_IDS } from '@/wallet-core/evm/walletconnect/router.js';
import { useModalA11y } from '@/lib/useModalA11y.js';
import { isSafeIconUrl, PLACEHOLDER_ICON } from '@/lib/wcIconUrl.js';

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
  const { t } = useTranslation('security');
  const { approveSession, rejectSession, evmAddress, isSendReauthRequired } = useWalletConnect();
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
  const titleId = useId();

  const dialogRef = useModalA11y({
    active: true,
    onEscape: () => { if (!busy) handleReject(); },
  });

  async function handleApprove() {
    setBusy(true);
    setErr(null);
    try {
      // L-4 (audit 2026-07-28): mirror the provider's step-up gate at the UI so
      // the user sees a clear message rather than a generic thrown error. The
      // provider's handleApproveSession enforces the same check authoritatively.
      if (isSendReauthRequired?.()) {
        throw new Error(t('wc.session_proposal.step_up_required'));
      }
      await approveSession(proposal.id);
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
    setBusy(true);
    tapHaptic();
    try {
      await rejectSession(proposal.id);
      onClose();
    } catch {
      onClose(); // always close on reject
    }
  }

  return (
    <div className={styles.overlay}>
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className={styles.title}>{t('wc.session_proposal.title')}</h2>

        {dapp.flagged && (
          <div className={styles.riskAlert}>
            <p className={styles.riskTitle}>{t('wc.session_proposal.risk_title')}</p>
            <p className={styles.riskBody}>{dapp.reason}</p>
            <p className={styles.riskDomain}>{dapp.domain}</p>
            <label className={styles.riskCheck}>
              <input
                type="checkbox"
                checked={ackKnownBad}
                onChange={(e) => setAckKnownBad(e.target.checked)}
              />
              {t('wc.session_proposal.risk_ack')}
            </label>
          </div>
        )}

        <p className={styles.honestyCaveat}>
          {t('wc.session_proposal.honesty_caveat', { count: LOCAL_KNOWN_BAD.length })}
        </p>

        <div className={styles.dappInfo}>
          {/* M-4: never fetch an attacker-controlled URL pre-consent. Icons go
              through isSafeIconUrl (https allowlist + data:image) and fall back
              to a neutral placeholder. no-referrer + anonymous CORS strip any
              cookies / Referer even for allowlisted hosts. */}
          <img
            src={isSafeIconUrl(meta.icons?.[0]) ? meta.icons[0] : PLACEHOLDER_ICON}
            alt=""
            className={styles.icon}
            width={48}
            height={48}
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
          />
          <div>
            <p className={styles.dappName}>{meta.name ?? t('wc.session_proposal.unknown_dapp')}</p>
            <p className={styles.dappUrl}>{meta.url ?? ''}</p>
          </div>
        </div>

        <p className={styles.domainCaveat}>
          {t('wc.session_proposal.domain_caveat')}
        </p>

        <p className={styles.label}>{t('wc.session_proposal.connecting_wallet_label')}</p>
        <p className={styles.address}>{evmAddress ?? t('wc.session_proposal.address_dash')}</p>

        {chains.length > 0 && (
          <>
            <p className={styles.label}>{t('wc.session_proposal.required_chains_label')}</p>
            <ul className={styles.list}>
              {chains.map((c) => <li key={c}>{chainLabel(c)}</li>)}
            </ul>
            {chains.some((c) => !SUPPORTED_CHAIN_IDS.has(chainId(c))) && (
              <p className={styles.warning}>
                {t('wc.session_proposal.unsupported_chains_warning')}
              </p>
            )}
          </>
        )}

        {optionalChains.length > 0 && (
          <>
            <p className={styles.label}>{t('wc.session_proposal.optional_requested_label')}</p>
            <ul className={`${styles.list} ${styles.optionalList}`}>
              {optionalChains.map((c) => <li key={c}>{chainLabel(c)}</li>)}
            </ul>
          </>
        )}

        {methods.length > 0 && (
          <>
            <p className={styles.label}>{t('wc.session_proposal.requested_methods_label')}</p>
            <ul className={styles.list}>
              {methods.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </>
        )}

        {(optionalChains.length > 0 || optionalMethods.length > 0) && (
          <div className={styles.optionalSection}>
            <p className={styles.label}>{t('wc.session_proposal.optional_chains_label')}</p>
            {optionalChains.length > 0 && (
              <ul className={styles.list}>
                {optionalChains.map((c) => <li key={c}>{chainLabel(c)}</li>)}
              </ul>
            )}
            {optionalMethods.length > 0 && (
              <>
                <p className={styles.label}>{t('wc.session_proposal.optional_methods_label')}</p>
                <ul className={styles.list}>
                  {optionalMethods.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </>
            )}
            <p className={styles.optionalNote}>
              {t('wc.session_proposal.optional_note')}
            </p>
          </div>
        )}

        <p className={styles.warning}>
          {t('wc.session_proposal.trust_warning')}
        </p>

        {err && <p className={styles.error}>{err}</p>}

        <div className={styles.actions}>
          <button className={styles.rejectBtn} onClick={handleReject} disabled={busy}>
            {t('wc.session_proposal.reject')}
          </button>
          <button className={styles.approveBtn} onClick={handleApprove} disabled={busy || (dapp.flagged && !ackKnownBad)}>
            {busy ? t('wc.session_proposal.connect_busy') : t('wc.session_proposal.connect')}
          </button>
        </div>
      </div>
    </div>
  );
}
