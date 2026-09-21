// components/SessionRevocationGuard.jsx
//
// Enforces session revocation HONESTLY and LOCALLY (see lib/sessionRevocation.js
// for the full model). Mounted once in Layout so it runs across every
// authenticated page.
//
// Behaviour: while the app is open, it watches THIS device's own session record.
// If that record becomes `revoked` (from this device's "Sign out this device",
// or from another device's revoke that this device later observes), it:
//   1. lock()s the wallet — clears the in-memory secret, so no signing / fund
//      access is possible without re-entering the password (REAL access control);
//   2. clears this device's local session token, signing it out so re-auth
//      starts a fresh session;
//   3. tells the user plainly what happened.
//
// It does NOT pretend to remotely kill other devices — there is no push channel.
// Other devices self-enforce the same way when they next see their own session
// revoked. This component performs NO crypto and touches NO key material; lock()
// is the EXISTING WalletProvider path.

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useWallet } from '@/lib/WalletProvider';
import { toast } from '@/lib/toast';
import { hydrateSecureStore } from '@/lib/secureStore';
import {
  getSessionToken,
  clearSessionToken,
  isCurrentSessionRevoked,
} from '@/lib/sessionRevocation';

export default function SessionRevocationGuard() {
  const { lock } = useWallet();
  // The session token is read LIVE on every poll, never captured at mount.
  // SEC-03 (QA 2026-09-21): it used to be captured once (useState + a single
  // post-hydrate re-read). On a fresh wallet Layout mounts this guard at
  // unlock, BEFORE Security Center mints the token (ensureSessionToken), so
  // the late token was never seen, the query stayed disabled, and revoking
  // the current device never locked this session. Awaiting the (memoised,
  // never-rejecting) hydrate first keeps the REVIEW-A guarantee: on native,
  // getSessionToken() is a synchronous read of a cache filled by an async
  // boot hydrate. No token → no store read at all.
  // Remember WHICH token was handled, so each revocation locks exactly once.
  const handledRef = useRef(/** @type {string|null} */ (null));

  // Poll only THIS device's session record. Cheap (single-token filter), backed
  // by the SAME store Security Center / Session Manager write to. Refetch on a
  // short interval and on window focus so a revoke from elsewhere lands promptly
  // the next time this device is looked at.
  const { data } = useQuery({
    queryKey: ['session-revocation-check'],
    queryFn: async () => {
      let token = getSessionToken();
      if (!token) { await hydrateSecureStore(); token = getSessionToken(); }
      if (!token) return { token: null, mine: [] };
      const mine = await base44.entities.UserSession.filter({ session_token: token });
      return { token, mine };
    },
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const token = data?.token ?? null;
  const mine = data?.mine;

  useEffect(() => {
    if (!token || handledRef.current === token) return;
    if (isCurrentSessionRevoked(mine, token)) {
      handledRef.current = token;
      /** @type {any} */ (lock)(); // real access control — drop the in-memory secret
      clearSessionToken(); // sign this device out; re-auth makes a new session
      toast.error(
        'This session was revoked. The wallet has been locked — unlock again with your password to continue.',
      );
    }
  }, [mine, token, lock]);

  return null;
}
