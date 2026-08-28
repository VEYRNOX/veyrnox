// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Sparkles, ScanSearch, Image as ImageIcon, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import Spinner from '@/components/Spinner';
import { buildSuspiciousAssetSnapshot } from '@/lib/suspiciousAssets';
import { openAdvisor, publishAdvisorContext } from '@/lib/advisorBridge';
import { safeNftImageUrl } from '@/lib/nftImageUrl';
import { screenAssetContract } from '@/api/tipScreen';
import {
  cacheContractIntel,
  clearContractIntelConsent,
  clearCachedContractIntel,
  clearDismissedSuspiciousNfts,
  dismissSuspiciousNft,
  getContractIntelConsentState,
  hasContractIntelConsent,
  isContractIntelConfigured,
  readCachedContractIntelEntry,
  readDismissedSuspiciousNfts,
  setContractIntelConsent,
} from '@/lib/suspiciousAssetPrefs';
import {
  readSpamTokenOverrides,
  setSpamTokenOverride,
} from '@/lib/spamTokenIntel';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

function SeverityChip({ severity, children }) {
  const cls = severity === 'high'
    ? 'bg-destructive/10 text-destructive'
    : severity === 'medium'
      ? 'bg-caution/10 text-caution'
      : 'bg-secondary text-muted-foreground';
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cls}`}>{children}</span>;
}

function ContractConfidenceChip({ confidence }) {
  const copy = confidence === 'strong_warning'
    ? { label: 'Strong warning', cls: 'bg-destructive/10 text-destructive' }
    : confidence === 'partial_evidence'
      ? { label: 'Partial evidence', cls: 'bg-caution/10 text-caution' }
      : { label: 'Mostly unknown', cls: 'bg-secondary text-muted-foreground' };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${copy.cls}`}>{copy.label}</span>;
}

function formatIssueKind(kind) {
  return String(kind || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function SuspiciousAssets() {
  const localReviewEnabled = (() => {
    try { return !isDeniabilityOrDemoActive(); } catch { return false; }
  })();
  const [spamOverrides, setSpamOverrides] = useState(() => readSpamTokenOverrides());
  const [dismissedNftIds, setDismissedNftIds] = useState(() => readDismissedSuspiciousNfts());
  const [contractIntelConsentState, setContractIntelConsentState] = useState(() => getContractIntelConsentState());
  const [expandedContractRows, setExpandedContractRows] = useState({});
  const [remoteContractIntel, setRemoteContractIntel] = useState({});
  const [remoteContractIntelLoading, setRemoteContractIntelLoading] = useState({});
  const [remoteContractIntelMeta, setRemoteContractIntelMeta] = useState({});
  const { data: tokenRowsRaw = [], isLoading: loadingTokens, isError: errorTokens } = useQuery({
    queryKey: ['wallet-tokens'],
    queryFn: () => base44.entities.WalletToken.list('-created_date'),
    enabled: localReviewEnabled,
  });
  const { data: nftRowsRaw = [], isLoading: loadingNfts, isError: errorNfts } = useQuery({
    queryKey: ['nft-assets'],
    queryFn: () => base44.entities.NFTAsset.list('-created_date'),
    enabled: localReviewEnabled,
  });
  const tokenRows = localReviewEnabled ? tokenRowsRaw : [];
  const nftRows = localReviewEnabled ? nftRowsRaw : [];

  const snapshot = useMemo(
    () => buildSuspiciousAssetSnapshot({ tokens: tokenRows, nfts: nftRows, spamOverrides, dismissedNftIds }),
    [tokenRows, nftRows, spamOverrides, dismissedNftIds]
  );
  const contractIntelConfigured = isContractIntelConfigured();
  const contractIntelEnabled = hasContractIntelConsent();

  const refreshSpamOverrides = () => setSpamOverrides(readSpamTokenOverrides());
  const hideAllFlaggedTokens = () => {
    for (const token of snapshot.suspiciousTokens) setSpamTokenOverride(token.id, 'hide');
    refreshSpamOverrides();
  };
  const showAllHiddenTokens = () => {
    for (const token of snapshot.suspiciousTokens.filter((row) => row.hidden)) setSpamTokenOverride(token.id, 'show');
    refreshSpamOverrides();
  };
  const toggleTokenHidden = (token) => {
    setSpamTokenOverride(token.id, token.hidden ? 'show' : 'hide');
    refreshSpamOverrides();
  };
  const dismissCollectible = (id) => {
    dismissSuspiciousNft(id);
    setDismissedNftIds(readDismissedSuspiciousNfts());
  };
  const restoreDismissedCollectibles = () => {
    clearDismissedSuspiciousNfts();
    setDismissedNftIds([]);
  };
  const chooseContractIntelConsent = (granted) => {
    setContractIntelConsent(granted);
    setContractIntelConsentState(getContractIntelConsentState());
  };
  const resetContractIntelConsent = () => {
    clearContractIntelConsent();
    setContractIntelConsentState(getContractIntelConsentState());
  };
  const fetchRemoteContractIntel = async (token, { force = false } = {}) => {
    if (!localReviewEnabled || !token?.id || remoteContractIntelLoading[token.id] || !contractIntelConfigured || !contractIntelEnabled) return;
    if (!force && remoteContractIntel[token.id]) return;
    if (!force) {
      const cached = readCachedContractIntelEntry(token.id);
      if (cached?.value) {
        setRemoteContractIntel((prev) => ({ ...prev, [token.id]: cached.value }));
        setRemoteContractIntelMeta((prev) => ({
          ...prev,
          [token.id]: { source: 'cache', cachedAt: cached.cachedAt, expiresAt: cached.expiresAt },
        }));
        return;
      }
    } else {
      clearCachedContractIntel(token.id);
      setRemoteContractIntel((prev) => ({ ...prev, [token.id]: null }));
      setRemoteContractIntelMeta((prev) => ({ ...prev, [token.id]: null }));
    }
    setRemoteContractIntelLoading((prev) => ({ ...prev, [token.id]: true }));
    try {
      const now = Date.now();
      const result = await screenAssetContract({
        chain: token.chain,
        contractAddress: token.token_contract,
        tokenAddress: token.token_contract,
      });
      if (result) {
        cacheContractIntel(token.id, result, now);
        setRemoteContractIntelMeta((prev) => ({
          ...prev,
          [token.id]: { source: 'live', cachedAt: now, expiresAt: now + 6 * 60 * 60 * 1000 },
        }));
      }
      setRemoteContractIntel((prev) => ({ ...prev, [token.id]: result }));
      return;
    }
    finally {
      setRemoteContractIntelLoading((prev) => ({ ...prev, [token.id]: false }));
    }
  };
  const handleContractDetailToggle = (token, isOpen) => {
    setExpandedContractRows((prev) => ({ ...prev, [token.id]: isOpen }));
    if (isOpen) fetchRemoteContractIntel(token);
  };
  const formatCacheTime = (value) => {
    if (!value) return null;
    try {
      return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!localReviewEnabled) {
      publishAdvisorContext(null);
      return () => publishAdvisorContext(null);
    }
    publishAdvisorContext({
      suspicious_asset_total: snapshot.totals.total,
      suspicious_token_total: snapshot.totals.suspiciousTokens,
      suspicious_nft_total: snapshot.totals.suspiciousNfts,
      risky_contract_total: snapshot.totals.riskyContracts,
      hidden_suspicious_token_total: snapshot.totals.hiddenTokens,
      dismissed_suspicious_nft_total: dismissedNftIds.length,
      contract_intel_opt_in: contractIntelConsentState,
      contract_intel_configured: contractIntelConfigured,
      suspicious_tokens: snapshot.suspiciousTokens.map((token) => ({
        symbol: token.symbol,
        name: token.name,
        token_contract: token.token_contract || null,
        severity: token.severity,
        reasons: token.reasons.map((reason) => reason.text),
        unknowns: token.contract.unknowns,
        hidden: !!token.hidden,
      })),
      suspicious_nfts: snapshot.suspiciousNfts.map((nft) => ({
        name: nft.name,
        collection: nft.collection,
        severity: nft.severity,
        reasons: nft.reasons.map((reason) => reason.text),
      })),
    });
    return () => publishAdvisorContext(null);
  }, [snapshot, dismissedNftIds.length, contractIntelConsentState, contractIntelConfigured, localReviewEnabled]);

  const loading = loadingTokens || loadingNfts;
  const visibleTokenCount = snapshot.totals.visibleTokens;
  const hiddenTokenCount = snapshot.totals.hiddenTokens;
  const visibleCollectibleCount = snapshot.totals.suspiciousNfts;
  const dismissedCollectibleCount = dismissedNftIds.length;

  if (!localReviewEnabled) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center text-sm text-muted-foreground">
        This page isn&apos;t available right now.
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suspicious Assets</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            One review queue for spam tokens, risky contract hints, and unsolicited collectibles.
          </p>
        </div>
        <Button
          type="button"
          className="gap-2"
          onClick={() => openAdvisor({
            question: 'Which suspicious assets need my attention first, and why?',
            context: {
              suspicious_asset_total: snapshot.totals.total,
              suspicious_token_total: snapshot.totals.suspiciousTokens,
              suspicious_nft_total: snapshot.totals.suspiciousNfts,
              risky_contract_total: snapshot.totals.riskyContracts,
              hidden_suspicious_token_total: snapshot.totals.hiddenTokens,
              contract_intel_opt_in: contractIntelConsentState,
              contract_intel_configured: contractIntelConfigured,
            },
          })}
        >
          <Sparkles className="h-4 w-4" />
          Ask AI Advisor
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total flagged', value: snapshot.totals.total },
          { label: 'Suspicious tokens', value: snapshot.totals.suspiciousTokens },
          { label: 'Risky contracts', value: snapshot.totals.riskyContracts },
          { label: 'Suspicious NFTs', value: snapshot.totals.suspiciousNfts },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-4 text-center min-w-0">
            <p className="text-2xl font-bold break-words">{loading ? '—' : stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1 break-words">{stat.label}</p>
          </div>
        ))}
      </div>

      {(errorTokens || errorNfts) && (
        <div className="rounded-xl border border-caution/30 bg-caution/5 p-3 text-xs text-caution">
          {errorTokens && <p>Wallet-token risk data could not be loaded, so the queue may be incomplete.</p>}
          {errorNfts && <p>NFT risk data could not be loaded, so the queue may be incomplete.</p>}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card/50 p-3 text-xs text-muted-foreground flex items-start gap-2">
        <ScanSearch className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p>
          This queue is local evidence, not a safety guarantee. Contract concerns only appear when the app actually has those metadata fields; missing fields stay unknown rather than being guessed.
        </p>
      </div>

      {!loading && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Review lanes</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Veyrnox separates active review items from things you have already hidden or deferred, so this page stays honest about what still needs attention.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-background/60 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">Active review</p>
                <SeverityChip severity={(visibleTokenCount + visibleCollectibleCount) > 0 ? 'medium' : 'ok'}>
                  {visibleTokenCount + visibleCollectibleCount}
                </SeverityChip>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {visibleTokenCount} visible suspicious token{visibleTokenCount === 1 ? '' : 's'} and {visibleCollectibleCount} suspicious collectible{visibleCollectibleCount === 1 ? '' : 's'} still shown here.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">Hidden spam</p>
                <SeverityChip severity={hiddenTokenCount > 0 ? 'ok' : 'ok'}>
                  {hiddenTokenCount}
                </SeverityChip>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Hidden tokens stay out of normal portfolio views until you show them again. This is cleanup, not a declaration that they are safe.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">Deferred collectibles</p>
                <SeverityChip severity={dismissedCollectibleCount > 0 ? 'ok' : 'ok'}>
                  {dismissedCollectibleCount}
                </SeverityChip>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Dismissed collectibles are removed from this queue only. You can restore them later if you want to review them again.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Deeper contract intel</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Off by default. If enabled and configured in this build, deeper contract reviews can ask the Veyrnox TIP service for extra intelligence about token contract addresses and chain ids. Seed, PIN, balances, and wallet addresses stay out of scope.
            </p>
          </div>
          <SeverityChip severity={contractIntelEnabled ? 'medium' : 'ok'}>
            {contractIntelEnabled ? 'Opted in' : 'Local only'}
          </SeverityChip>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {contractIntelConfigured
            ? 'This build can support TIP-backed contract-intelligence checks once you opt in.'
            : 'TIP contract-intelligence screening is not configured in this build yet, so this preference is stored for future availability only.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => chooseContractIntelConsent(true)}>Allow deeper checks</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => chooseContractIntelConsent(false)}>Keep reviews local</Button>
          {contractIntelConsentState && (
            <Button type="button" size="sm" variant="ghost" onClick={resetContractIntelConsent}>Reset choice</Button>
          )}
        </div>
      </div>

      {loading ? (
        <Spinner className="py-12" />
      ) : snapshot.totals.total === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-2">
          <p className="text-sm font-semibold">No suspicious assets are known on this device right now.</p>
          <p className="text-xs text-muted-foreground">That means nothing here matched the local rules. It does not prove that every asset is safe.</p>
        </div>
      ) : (
        <>
          {snapshot.suspiciousTokens.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Tokens</h2>
                  <p className="text-xs text-muted-foreground">Spam-lure metadata and contract-level cautions where available.</p>
                </div>
                <div className="flex items-center gap-3">
                  <Link to="/trust-score" className="text-xs text-primary hover:underline">Open Spam Screening</Link>
                  <Button type="button" size="sm" variant="secondary" onClick={hideAllFlaggedTokens}>Hide all flagged tokens</Button>
                  {snapshot.totals.hiddenTokens > 0 && (
                    <Button type="button" size="sm" variant="ghost" onClick={showAllHiddenTokens}>Show hidden tokens</Button>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                {snapshot.suspiciousTokens.map((token) => (
                  <div key={token.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{token.name || token.symbol}</p>
                          <SeverityChip severity={token.severity}>{token.severity === 'high' ? 'High' : 'Review'}</SeverityChip>
                          {token.contract.score > 0 && <ContractConfidenceChip confidence={token.contract.confidence} />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {token.symbol}
                          {token.token_contract ? ` · ${token.token_contract}` : ''}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="gap-2"
                        onClick={() => openAdvisor({
                          question: `Explain why ${token.symbol || token.name} is in my suspicious-assets queue.`,
                          context: {
                            asset_type: 'token',
                            symbol: token.symbol,
                            name: token.name,
                            token_contract: token.token_contract || null,
                            reasons: token.reasons.map((reason) => reason.text),
                            unknowns: token.contract.unknowns,
                          },
                        })}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Ask Advisor
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                        onClick={() => toggleTokenHidden(token)}
                      >
                        {token.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        {token.hidden ? 'Show elsewhere' : 'Hide elsewhere'}
                      </Button>
                    </div>

                    <ul className="space-y-1">
                      {token.reasons.map((reason) => (
                        <li key={`${token.id}-${reason.kind}`} className="text-xs text-foreground">
                          <span className={reason.severity === 'high' ? 'text-destructive' : 'text-caution'}>{reason.text}</span>
                        </li>
                      ))}
                    </ul>

                    <p className="text-[11px] text-muted-foreground">
                      {token.hidden
                        ? 'Hidden elsewhere: this token is suppressed in normal portfolio views until you show it again.'
                        : 'Active review: this token still appears in your suspicious-assets queue and may need manual verification before any interaction.'}
                    </p>

                    {token.contract.score > 0 && (
                      <details
                        className="rounded-xl border border-border/70 bg-background/40 p-3"
                        open={!!expandedContractRows[token.id]}
                        onToggle={(event) => handleContractDetailToggle(token, event.currentTarget.open)}
                      >
                        <summary className="cursor-pointer list-none text-[11px] text-muted-foreground">
                          {token.contract.confidence === 'strong_warning'
                            ? `Contract review confidence: strong warning. ${token.contract.knownChecks} of ${token.contract.totalChecks} local checks resolved with concrete risk signals.`
                            : token.contract.confidence === 'partial_evidence'
                              ? `Contract review confidence: partial evidence. ${token.contract.knownChecks} of ${token.contract.totalChecks} local checks resolved, but some conclusions still depend on missing fields.`
                              : `Contract review confidence: mostly unknown. Only ${token.contract.knownChecks} of ${token.contract.totalChecks} local checks resolved, so this row stays cautious without pretending the contract is fully understood.`}
                        </summary>
                        <div className="mt-3 space-y-3">
                          {token.contract.issues.length > 0 && (
                            <div>
                              <p className="text-[11px] font-medium text-foreground">Concrete warning signals</p>
                              <ul className="mt-1 space-y-1">
                                {token.contract.issues.map((issue) => (
                                  <li key={`${token.id}-contract-${issue.kind}`} className="text-[11px] text-muted-foreground">
                                    <span className="text-foreground">{formatIssueKind(issue.kind)}:</span> {issue.text}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {token.contract.unknowns.length > 0 && (
                            <div>
                              <p className="text-[11px] font-medium text-foreground">Still unknown here</p>
                              <ul className="mt-1 space-y-1">
                                {token.contract.unknowns.map((unknown) => (
                                  <li key={`${token.id}-unknown-${unknown}`} className="text-[11px] text-muted-foreground">
                                    {unknown}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div>
                            <p className="text-[11px] font-medium text-foreground">TIP deeper review</p>
                            {contractIntelEnabled && contractIntelConfigured ? (
                              remoteContractIntelLoading[token.id] ? (
                                <p className="mt-1 text-[11px] text-muted-foreground">Checking this contract through TIP now…</p>
                              ) : remoteContractIntel[token.id] ? (
                                <div className="mt-1 space-y-1">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="text-[11px] text-muted-foreground">
                                      {remoteContractIntelMeta[token.id]?.source === 'cache'
                                        ? `Cached TIP review${formatCacheTime(remoteContractIntelMeta[token.id]?.expiresAt) ? ` until ${formatCacheTime(remoteContractIntelMeta[token.id]?.expiresAt)}` : ''}.`
                                        : `Fresh TIP review${formatCacheTime(remoteContractIntelMeta[token.id]?.cachedAt) ? ` at ${formatCacheTime(remoteContractIntelMeta[token.id]?.cachedAt)}` : ''}.`}
                                    </p>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => fetchRemoteContractIntel(token, { force: true })}
                                    >
                                      Refresh
                                    </Button>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground">
                                    TIP verdict: <span className="text-foreground">{String(remoteContractIntel[token.id].verdict || 'unknown').toUpperCase()}</span>
                                    {remoteContractIntel[token.id].sourcesConsulted?.length ? ` · ${remoteContractIntel[token.id].sourcesConsulted.length} source${remoteContractIntel[token.id].sourcesConsulted.length === 1 ? '' : 's'} answered` : ''}
                                  </p>
                                  {remoteContractIntel[token.id].reviewSummary && (
                                    <p className="text-[11px] text-muted-foreground">
                                      {remoteContractIntel[token.id].reviewSummary}
                                    </p>
                                  )}
                                  {remoteContractIntel[token.id].findings?.length > 0 ? (
                                    <ul className="space-y-1">
                                      {remoteContractIntel[token.id].findings.slice(0, 3).map((finding, index) => (
                                        <li key={`${token.id}-tip-finding-${index}`} className="text-[11px] text-muted-foreground">
                                          <span className="text-foreground">{finding.title}:</span> {finding.detail}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : null}
                                  {remoteContractIntel[token.id].risks?.length > 0 ? (
                                    <ul className="space-y-1">
                                      {remoteContractIntel[token.id].risks.slice(0, 3).map((risk, index) => (
                                        <li key={`${token.id}-tip-risk-${index}`} className="text-[11px] text-muted-foreground">
                                          <span className="text-foreground">{risk.title}:</span> {risk.detail}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="text-[11px] text-muted-foreground">TIP did not add any extra risk rows for this contract.</p>
                                  )}
                                </div>
                              ) : (
                                <div className="mt-1 flex items-center justify-between gap-3">
                                  <p className="text-[11px] text-muted-foreground">
                                    No TIP review has been cached for this contract yet. Open this section to request one through the existing opt-in gate.
                                  </p>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => fetchRemoteContractIntel(token, { force: true })}
                                  >
                                    Fetch now
                                  </Button>
                                </div>
                              )
                            ) : (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {contractIntelConfigured
                                  ? 'Enable deeper contract intel above if you want this row to ask TIP for extra contract review.'
                                  : 'TIP contract-intelligence review is not configured in this build yet.'}
                              </p>
                            )}
                          </div>
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {snapshot.suspiciousNfts.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Collectibles</h2>
                  <p className="text-xs text-muted-foreground">Unsolicited drops and remote-art tracking concerns.</p>
                </div>
                {dismissedNftIds.length > 0 && (
                  <Button type="button" size="sm" variant="ghost" onClick={restoreDismissedCollectibles}>
                    Restore dismissed collectibles
                  </Button>
                )}
              </div>
              <div className="space-y-3">
                {snapshot.suspiciousNfts.map((nft) => (
                  <div key={nft.id} className="rounded-2xl border border-border bg-card p-4 flex gap-3">
                    <div className="h-16 w-16 rounded-xl bg-secondary overflow-hidden shrink-0 flex items-center justify-center">
                      {nft.image_url ? (
                        <img src={safeNftImageUrl(nft.image_url)} alt={nft.name} referrerPolicy="no-referrer" crossOrigin="anonymous" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground opacity-40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">{nft.name}</p>
                        <SeverityChip severity={nft.severity}>Review</SeverityChip>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{nft.collection || 'Unknown collection'}</p>
                      <ul className="space-y-1">
                        {nft.reasons.map((reason) => (
                          <li key={`${nft.id}-${reason.kind}`} className="text-xs text-caution">{reason.text}</li>
                        ))}
                      </ul>
                      <p className="text-[11px] text-muted-foreground">
                        Active review: dismissing this collectible removes it from this queue only. It does not mark the NFT safe or trusted.
                      </p>
                      <div className="flex gap-2">
                        <Link to="/nft" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                          Review NFT portfolio <ExternalLink className="h-3 w-3" />
                        </Link>
                        <Button type="button" size="sm" variant="ghost" onClick={() => dismissCollectible(nft.id)}>
                          Dismiss collectible
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {!loading && dismissedNftIds.length > 0 && snapshot.suspiciousNfts.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {dismissedNftIds.length} suspicious collectible{dismissedNftIds.length === 1 ? '' : 's'} dismissed from this queue.
          </p>
          <Button type="button" size="sm" variant="ghost" onClick={restoreDismissedCollectibles}>Restore</Button>
        </div>
      )}
    </div>
  );
}
