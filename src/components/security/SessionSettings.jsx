// components/security/SessionSettings.jsx
//
// "Session & Auto-lock" settings card. Shows the current lock status, lets the
// user pick the idle auto-lock timeout (persisted via lib/session.js), offers a
// "Lock now" action, and surfaces recent session info if cheaply available.
//
// SCOPE: session lifetime + UI only. Locking routes through the EXISTING
// WalletProvider.lock() (via `lock` and `setAutoLockTimeout`); this file never
// touches the vault, keystore, or any key material.

import { Lock, LockOpen, Clock, Monitor, Smartphone, Globe } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useWallet } from '@/lib/WalletProvider';
import { AUTO_LOCK_OPTIONS } from '@/lib/session';

function deviceIcon(ua) {
  if (ua && /iPhone|Android|Mobile/i.test(ua)) return <Smartphone className="h-4 w-4" />;
  if (ua) return <Monitor className="h-4 w-4" />;
  return <Globe className="h-4 w-4" />;
}

export default function SessionSettings() {
  const { isUnlocked, lock, autoLockValue, setAutoLockTimeout } = useWallet();

  // Recent session info — cheap, best-effort. Demo mode seeds one UserSession
  // (api/demoClient.js); a real backend returns the user's device sessions.
  // Failure is non-fatal: the card still shows lock status + the timeout picker.
  const { data: sessions = [] } = useQuery({
    queryKey: ['user-sessions'],
    queryFn: () => base44.entities.UserSession.list('-created_date', 5),
    retry: false,
  });
  const recent = sessions.filter((s) => s.status !== 'revoked');

  return (
    <div className="p-5 rounded-xl border border-border bg-card space-y-5">
      {/* Header + live lock status */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
          {isUnlocked ? (
            <LockOpen className="h-5 w-5 text-primary" />
          ) : (
            <Lock className="h-5 w-5 text-primary" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Session &amp; Auto-lock</p>
          <p className="text-xs text-muted-foreground">
            Clears the in-memory key on idle or when the app is backgrounded
          </p>
        </div>
        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            isUnlocked
              ? 'bg-green-500/10 text-green-500'
              : 'bg-secondary text-muted-foreground'
          }`}
        >
          {isUnlocked ? 'Unlocked' : 'Locked'}
        </span>
      </div>

      {/* Auto-lock timeout picker */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Auto-lock after</p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {AUTO_LOCK_OPTIONS.map((opt) => {
            const active = opt.value === autoLockValue;
            return (
              <button
                key={opt.value}
                onClick={() => setAutoLockTimeout(opt.value)}
                aria-pressed={active}
                className={`min-h-[44px] px-2 py-2 rounded-lg border text-sm font-medium transition-colors select-none ${
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {autoLockValue === 'never'
            ? 'The wallet will not auto-lock on idle. It still locks when the app is backgrounded.'
            : 'Resets whenever you interact with the app. Also locks when the app is backgrounded.'}
        </p>
      </div>

      {/* Lock now — only meaningful while unlocked */}
      {isUnlocked && (
        <button
          onClick={lock}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg border border-border bg-background text-sm font-semibold hover:bg-secondary transition-colors select-none"
        >
          <Lock className="h-4 w-4" />
          Lock now
        </button>
      )}

      {/* Recent session/activity — cheap, best-effort */}
      {recent.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Recent activity</p>
            <Link to="/session-manager" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          {recent.slice(0, 2).map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background">
              <div className="h-8 w-8 rounded-full bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                {deviceIcon(s.user_agent || s.device)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{s.device || s.user_agent || 'This device'}</p>
                <p className="text-xs text-muted-foreground">
                  {s.last_active || s.created_date
                    ? new Date(s.last_active || s.created_date).toLocaleString('en-GB')
                    : 'Active now'}
                </p>
              </div>
              {s.current && (
                <span className="text-[10px] font-semibold text-green-500 shrink-0">This device</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
