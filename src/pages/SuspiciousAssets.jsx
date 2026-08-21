// @ts-nocheck
import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ShieldAlert, Sparkles, ScanSearch, Image as ImageIcon, ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import Spinner from '@/components/Spinner';
import { buildSuspiciousAssetSnapshot } from '@/lib/suspiciousAssets';
import { openAdvisor, publishAdvisorContext } from '@/lib/advisorBridge';
import { safeNftImageUrl } from '@/lib/nftImageUrl';

function SeverityChip({ severity, children }) {
  const cls = severity === 'high'
    ? 'bg-destructive/10 text-destructive'
    : severity === 'medium'
      ? 'bg-caution/10 text-caution'
      : 'bg-secondary text-muted-foreground';
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cls}`}>{children}</span>;
}

export default function SuspiciousAssets() {
  const { data: tokenRows = [], isLoading: loadingTokens, isError: errorTokens } = useQuery({
    queryKey: ['wallet-tokens'],
    queryFn: () => base44.entities.WalletToken.list('-created_date'),
  });
  const { data: nftRows = [], isLoading: loadingNfts, isError: errorNfts } = useQuery({
    queryKey: ['nft-assets'],
    queryFn: () => base44.entities.NFTAsset.list('-created_date'),
  });

  const snapshot = useMemo(
    () => buildSuspiciousAssetSnapshot({ tokens: tokenRows, nfts: nftRows }),
    [tokenRows, nftRows]
  );

  useEffect(() => {
    publishAdvisorContext({
      suspicious_asset_total: snapshot.totals.total,
      suspicious_token_total: snapshot.totals.suspiciousTokens,
      suspicious_nft_total: snapshot.totals.suspiciousNfts,
      risky_contract_total: snapshot.totals.riskyContracts,
      suspicious_tokens: snapshot.suspiciousTokens.map((token) => ({
        symbol: token.symbol,
        name: token.name,
        token_contract: token.token_contract || null,
        severity: token.severity,
        reasons: token.reasons.map((reason) => reason.text),
        unknowns: token.contract.unknowns,
      })),
      suspicious_nfts: snapshot.suspiciousNfts.map((nft) => ({
        name: nft.name,
        collection: nft.collection,
        severity: nft.severity,
        reasons: nft.reasons.map((reason) => reason.text),
      })),
    });
    return () => publishAdvisorContext(null);
  }, [snapshot]);

  const loading = loadingTokens || loadingNfts;

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
            },
          })}
        >
          <Sparkles className="h-4 w-4" />
          Ask AI Advisor
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total flagged', value: snapshot.totals.total },
          { label: 'Suspicious tokens', value: snapshot.totals.suspiciousTokens },
          { label: 'Risky contracts', value: snapshot.totals.riskyContracts },
          { label: 'Suspicious NFTs', value: snapshot.totals.suspiciousNfts },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-2xl font-bold">{loading ? '—' : stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
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
                <Link to="/trust-score" className="text-xs text-primary hover:underline">Open Spam Screening</Link>
              </div>
              <div className="space-y-3">
                {snapshot.suspiciousTokens.map((token) => (
                  <div key={token.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{token.name || token.symbol}</p>
                          <SeverityChip severity={token.severity}>{token.severity === 'high' ? 'High' : 'Review'}</SeverityChip>
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
                    </div>

                    <ul className="space-y-1">
                      {token.reasons.map((reason) => (
                        <li key={`${token.id}-${reason.kind}`} className="text-xs text-foreground">
                          <span className={reason.severity === 'high' ? 'text-destructive' : 'text-caution'}>{reason.text}</span>
                        </li>
                      ))}
                    </ul>

                    {token.contract.unknowns.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Unknown here: {token.contract.unknowns.join(', ')}.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {snapshot.suspiciousNfts.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold">Collectibles</h2>
                <p className="text-xs text-muted-foreground">Unsolicited drops and remote-art tracking concerns.</p>
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
                      <div className="flex gap-2">
                        <Link to="/nft" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                          Review NFT portfolio <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

