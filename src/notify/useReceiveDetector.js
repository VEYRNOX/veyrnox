// src/notify/useReceiveDetector.js
//
// In-app Notifications v1 — UNAUDITED-PROVISIONAL.
// Receive detection: polls the ACTIVE wallet's per-asset balances every 60s and
// fires emitReceiveDetected when a positive delta is found.
//
// SCOPING (I3 deniability): reads ONLY the ACTIVE wallet set's addresses via
// useWallet(). No other sets are touched. Polling is disabled in deniability mode
// (isDecoy / isHidden) — zero backend calls per I3. Baseline is wiped on lock /
// deniability-mode entry so a resuming session never sees stale deltas.
//
// FAIL CLOSED (I4): fetchAssetAmount returns null when the read FAILS (not an
// empty wallet). A null is never treated as 0, so a flaky RPC can never produce a
// spurious receive notification by making a balance "appear" to jump from null.
// A receive is only emitted when BOTH the prior and current reads are good numbers
// and the current is strictly larger by at least MIN_DELTA.

import { useEffect, useRef } from 'react';
import { useWallet } from '@/lib/WalletProvider';
import { fetchAssetAmount } from '@/lib/portfolioBalances.js';
import { getAsset } from '@/wallet-core/assets.js';
import { emitReceiveDetected } from './events.js';

const POLL_MS = 60_000;
const MIN_DELTA = 1e-9; // noise / rounding floor

export function useReceiveDetector() {
  const {
    isUnlocked,
    wallets,
    activeWalletId,
    accounts,
    btcAccount,
    solAccount,
    isDecoy,
    isHidden,
  } = useWallet();

  const priorRef = useRef(null); // Record<symbol, number> | null

  useEffect(() => {
    if (!isUnlocked || isDecoy || isHidden) {
      priorRef.current = null;
      return;
    }

    const activeWallet = (wallets || []).find((w) => w.id === activeWalletId);
    if (!activeWallet) return;

    const addr = {
      evm: accounts?.[0]?.address ?? null,
      btc: btcAccount?.address ?? null,
      sol: solAccount?.address ?? null,
    };

    const enabledAssets = activeWallet.enabledAssets || [];

    async function poll() {
      const current = {};
      await Promise.all(
        enabledAssets.map(async (symbol) => {
          const asset = getAsset(symbol);
          if (!asset) return;
          const amount = await fetchAssetAmount(asset, addr);
          current[symbol] = amount; // null = indeterminate (failed read)
        }),
      );

      const prior = priorRef.current;
      if (prior !== null) {
        for (const symbol of enabledAssets) {
          const prev = prior[symbol];
          const curr = current[symbol];
          // I4: skip any pair where either value is indeterminate (null).
          if (prev == null || curr == null) continue;
          const delta = curr - prev;
          if (delta > MIN_DELTA) {
            try {
              emitReceiveDetected({ ts: Date.now(), amount: `${delta.toFixed(6)} ${symbol}` });
            } catch { /* I4: a notification failure is never propagated */ }
          }
        }
      }

      priorRef.current = current;
    }

    poll(); // first poll establishes baseline; no emit on this run
    const id = setInterval(poll, POLL_MS);
    return () => {
      clearInterval(id);
      // Intentionally do NOT clear priorRef here — a re-render with same deps
      // should resume from the last known baseline, not re-baseline. Only a
      // genuine session change (lock / deniability) clears it above.
    };
  }, [isUnlocked, isDecoy, isHidden, activeWalletId, accounts, btcAccount, solAccount, wallets]);
}
