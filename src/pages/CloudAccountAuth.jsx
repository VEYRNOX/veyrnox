// @ts-nocheck
import { useMemo, useState } from 'react';
import { Navigate, Link, useLocation, useSearchParams } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSupabaseAuth } from '@/lib/SupabaseAuthProvider';

const MODES = new Set(['signin', 'signup', 'reset']);

function modeTitle(mode) {
  if (mode === 'signup') return 'Create cloud account';
  if (mode === 'reset') return 'Reset cloud account password';
  return 'Sign in to cloud account';
}

function modeBody(mode) {
  if (mode === 'signup') return 'Create a separate Supabase-backed account for cloud features.';
  if (mode === 'reset') return 'Send a password reset email for your Supabase account.';
  return 'Use your Supabase email and password to access protected cloud routes.';
}

export default function CloudAccountAuth() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMode = searchParams.get('mode') || 'signin';
  const mode = MODES.has(requestedMode) ? requestedMode : 'signin';
  const from = location.state?.from || '/account';
  const {
    isAuthenticated,
    isConfigured,
    isLoading,
    suspended,
    signInWithPassword,
    signUpWithPassword,
    sendPasswordReset,
  } = useSupabaseAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const canSubmit = useMemo(() => {
    if (!email.trim()) return false;
    if (mode === 'reset') return true;
    if (!password) return false;
    if (mode === 'signup' && password !== confirmPassword) return false;
    return true;
  }, [confirmPassword, email, mode, password]);

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit || busy) return;

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');

    try {
      if (mode === 'reset') {
        const { error } = await sendPasswordReset({ email: email.trim() });
        if (error) throw error;
        setMessage('Reset email sent. Check your inbox for the Supabase password reset link.');
      } else if (mode === 'signup') {
        const { data, error } = await signUpWithPassword({ email: email.trim(), password });
        if (error) throw error;
        if (data.session) {
          setMessage('Account created and signed in.');
        } else {
          setMessage('Account created. Check your email to confirm the address before signing in.');
        }
      } else {
        const { error } = await signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err?.message || 'Cloud account request failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl justify-center p-4 md:p-6">
      <Card className="w-full border-border/70 bg-card/95">
        <CardHeader>
          <CardTitle>{modeTitle(mode)}</CardTitle>
          <CardDescription>{modeBody(mode)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!isConfigured ? (
            <div className="rounded-lg border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
              Supabase Auth is disabled in this build until `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set.
            </div>
          ) : null}
          {suspended ? (
            <div className="rounded-lg border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
              Cloud auth is unavailable in decoy and demo sessions.
            </div>
          ) : null}
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="cloud-account-email">Email</Label>
              <Input
                id="cloud-account-email"
                autoComplete="email"
                disabled={!isConfigured || suspended || busy || isLoading}
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                type="email"
                value={email}
              />
            </div>
            {mode !== 'reset' ? (
              <div className="space-y-2">
                <Label htmlFor="cloud-account-password">Password</Label>
                <Input
                  id="cloud-account-password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  disabled={!isConfigured || suspended || busy || isLoading}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter password"
                  type="password"
                  value={password}
                />
              </div>
            ) : null}
            {mode === 'signup' ? (
              <div className="space-y-2">
                <Label htmlFor="cloud-account-confirm-password">Confirm password</Label>
                <Input
                  id="cloud-account-confirm-password"
                  autoComplete="new-password"
                  disabled={!isConfigured || suspended || busy || isLoading}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter password"
                  type="password"
                  value={confirmPassword}
                />
              </div>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {message ? <p className="text-sm text-primary">{message}</p> : null}
            <Button
              className="w-full"
              disabled={!isConfigured || suspended || busy || isLoading || !canSubmit}
              type="submit"
            >
              {busy ? 'Working...' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset email' : 'Sign in'}
            </Button>
          </form>
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <Button type="button" variant="link" className="px-0" onClick={() => setSearchParams({ mode: 'signin' })}>
              Sign in
            </Button>
            <Button type="button" variant="link" className="px-0" onClick={() => setSearchParams({ mode: 'signup' })}>
              Create account
            </Button>
            <Button type="button" variant="link" className="px-0" onClick={() => setSearchParams({ mode: 'reset' })}>
              Reset password
            </Button>
            <Link className="text-primary underline-offset-4 hover:underline" to="/settings">
              Back to settings
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
