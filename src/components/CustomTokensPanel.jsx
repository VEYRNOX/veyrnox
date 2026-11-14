// @ts-nocheck
// components/CustomTokensPanel.jsx — read-only custom ERC-20 import surface.
// The outer component contains the deniability gate and renders no inner hooks,
// storage reads, RPC reads, token names, or wallet identifiers when gated.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listEnabledNetworks, getNetworkInfo } from '@/wallet-core/evm/networks.js';
import { inspectCustomToken, readCustomTokenBalance } from '@/wallet-core/evm/customTokens.js';
import {
  listCustomTokens,
  removeCustomToken,
  saveCustomToken,
} from '@/lib/customTokenStore.js';
import { CUSTOM_TOKEN_PAGE_SIZE, nextCustomTokenCount, pageCustomTokens } from '@/lib/customTokenPaging.js';
import { capturePendingWorkGen, isPendingWorkCurrent } from '@/wallet-core/wipeEpoch.js';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';

function privateSession() {
  try {
    return isDeniabilityOrDemoActive() !== false;
  } catch {
    return true;
  }
}

const DISPLAY_FRACTION_DIGITS = 8;
const BALANCE_REFRESH_MS = 60_000;
export const BELOW_PRECISION_LABEL = '<0.00000001';

export function displayBalance(value) {
  if (typeof value !== 'string') return '—';
  const [whole, fraction = ''] = value.split('.');
  const kept = fraction.slice(0, DISPLAY_FRACTION_DIGITS).replace(/0+$/, '');
  // A positive balance smaller than the display precision must not read as 0.
  if (!kept && /^0*$/.test(whole) && /[1-9]/.test(fraction)) return BELOW_PRECISION_LABEL;
  const rendered = kept ? `${whole}.${kept}` : whole;
  return rendered.length > 24 ? `${rendered.slice(0, 21)}…` : rendered;
}

function CustomTokenRow({ token, ownerAddress, onRemove }) {
  const network = getNetworkInfo(token.networkKey);
  const balance = useQuery({
    // token.id is network+address; decimals is included so a re-import with
    // changed decimals never reuses a stale cached balance.
    queryKey: ['custom-token-balance', token.networkKey, token.address, token.decimals, ownerAddress],
    queryFn: () => readCustomTokenBalance({ token, owner: ownerAddress }),
    enabled: Boolean(ownerAddress),
    staleTime: 30_000,
    refetchInterval: () => (typeof document !== 'undefined' && document.hidden ? false : BALANCE_REFRESH_MS),
    refetchIntervalInBackground: false,
    retry: false,
  });
  const shortAddress = `${token.address.slice(0, 8)}…${token.address.slice(-6)}`;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Coins className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{token.symbol}</p>
        <p className="truncate text-xs text-muted-foreground">
          {network?.name || token.networkKey} · <span className="font-mono">{shortAddress}</span>
        </p>
        {balance.isError && (
          <p className="mt-1 text-xs text-caution">{balance.error?.message || 'Balance unavailable.'}</p>
        )}
      </div>
      <div className="shrink-0 text-end">
        <p className="font-mono text-sm" title={balance.data || undefined}>
          {balance.isPending ? '…' : balance.isError ? '—' : displayBalance(balance.data)}
        </p>
        <p className="text-xs text-muted-foreground">{token.symbol}</p>
      </div>
      <button
        type="button"
        className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-destructive"
        aria-label={`Remove ${token.symbol} custom token`}
        onClick={() => onRemove(token.id)}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function ActiveCustomTokensPanel({ ownerAddress }) {
  const networks = useMemo(() => listEnabledNetworks(), []);
  const initialNetwork = networks.some((network) => network.key === 'mainnet')
    ? 'mainnet'
    : (networks[0]?.key || '');
  const [tokens, setTokens] = useState(() => listCustomTokens());
  const [networkKey, setNetworkKey] = useState(initialNetwork);
  const [address, setAddress] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [visibleCount, setVisibleCount] = useState(CUSTOM_TOKEN_PAGE_SIZE);
  const queryClient = useQueryClient();
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refreshBalances = () => {
    queryClient.refetchQueries({ queryKey: ['custom-token-balance'] });
  };

  const addToken = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    // A wipe or lock while the RPC is pending invalidates this import, so it can
    // never re-create the storage key afterwards. Unmount is checked as well.
    const gen = capturePendingWorkGen();
    try {
      const token = await inspectCustomToken({ networkKey, address });
      if (!mountedRef.current || !isPendingWorkCurrent(gen)) return;
      saveCustomToken(token);
      setTokens(listCustomTokens());
      setAddress('');
      setFormOpen(false);
      setNotice(`${token.symbol} was added from ${getNetworkInfo(token.networkKey)?.name || token.networkKey}.`);
    } catch (err) {
      if (mountedRef.current && isPendingWorkCurrent(gen)) setError(err?.message || 'The token could not be added.');
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const remove = (id) => {
    setError('');
    try {
      removeCustomToken(id);
      setTokens(listCustomTokens());
      setNotice('Custom token removed.');
    } catch (err) {
      setError(err?.message || 'The custom token could not be removed.');
    }
  };

  return (
    <section className="mt-4 space-y-3 rounded-2xl border border-border bg-card/40 p-3" aria-labelledby="custom-token-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="custom-token-heading" className="text-sm font-semibold">Custom tokens</h3>
          <p className="text-xs text-muted-foreground">Read-only ERC-20 balances for the active wallet.</p>
        </div>
        <div className="flex items-center gap-2">
        {tokens.length > 0 && (
          <Button type="button" size="sm" variant="ghost" className="px-2" aria-label="Refresh custom token balances" onClick={refreshBalances}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => { setFormOpen((open) => !open); setError(''); }}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add token
        </Button>
        </div>
      </div>

      {formOpen && (
        <form className="space-y-3 rounded-xl border border-border bg-background/50 p-3" onSubmit={addToken}>
          <div className="space-y-1.5">
            <Label htmlFor="custom-token-network">Active EVM network</Label>
            <select
              id="custom-token-network"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={networkKey}
              onChange={(event) => setNetworkKey(event.target.value)}
              disabled={busy}
            >
              {networks.map((network) => <option key={network.key} value={network.key}>{network.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custom-token-address">Token contract address</Label>
            <Input
              id="custom-token-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="0x…"
              maxLength={42}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Adding reads bytecode, symbol, and decimals from this network’s configured RPC. Balances are read from the same RPC while this section is visible. No wallet backend is used.
          </p>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <Button type="submit" className="w-full gap-2" disabled={busy || address.trim().length !== 42 || !networkKey}>
            {busy && <RefreshCw className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
            {busy ? 'Reading contract…' : 'Read contract and add'}
          </Button>
        </form>
      )}

      {notice && <p role="status" className="text-xs text-success">{notice}</p>}
      {!formOpen && error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {tokens.length > 0 && (() => {
        const { shown, hidden } = pageCustomTokens(tokens, visibleCount);
        const showMore = () => setVisibleCount(nextCustomTokenCount(visibleCount, tokens.length));
        return (
          <>
            <div
              className="max-h-[32rem] space-y-2 overflow-y-auto overscroll-contain pe-1"
              role="region"
              aria-label="Custom tokens list"
              tabIndex={0}
              onScroll={(event) => {
                const el = event.currentTarget;
                if (hidden > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 24) showMore();
              }}
            >
              {shown.map((token) => (
                <CustomTokenRow key={token.id} token={token} ownerAddress={ownerAddress} onRemove={remove} />
              ))}
            </div>
            {hidden > 0 && (
              <Button type="button" variant="outline" className="w-full" onClick={showMore}>
                Show next {Math.min(CUSTOM_TOKEN_PAGE_SIZE, hidden)} ({hidden} more)
              </Button>
            )}
          </>
        );
      })()}
    </section>
  );
}

export default function CustomTokensPanel({ ownerAddress, visible }) {
  // Do not mount the stateful inner component: that is what guarantees no list
  // read, balance query, or visible token/wallet metadata in a deniable session.
  if (!visible || privateSession()) return null;
  return <ActiveCustomTokensPanel ownerAddress={ownerAddress} />;
}
