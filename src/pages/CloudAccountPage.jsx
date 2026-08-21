// @ts-nocheck
import { Link, useLocation, useNavigate } from 'react-router';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSupabaseAuth } from '@/lib/SupabaseAuthProvider';

export default function CloudAccountPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const isSecurityView = location.pathname === '/account/security';
  const { user, signOut, updatePassword } = useSupabaseAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSignOut() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { error } = await signOut();
      if (error) throw error;
      navigate('/account/login', { replace: true });
    } catch (err) {
      setError(err?.message || 'Could not sign out.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordUpdate(event) {
    event.preventDefault();
    if (busy) return;
    if (!password || password !== confirmPassword) {
      setError('Passwords must match.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { error } = await updatePassword(password);
      if (error) throw error;
      setMessage('Password updated.');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err?.message || 'Could not update password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
      <Card className="border-border/70 bg-card/95">
        <CardHeader>
          <CardTitle>Cloud account</CardTitle>
          <CardDescription>
            Supabase-backed auth for cloud features. Wallet unlock stays local and separate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Signed in as</p>
            <p className="mt-2 font-medium">{user?.email || 'Unknown email'}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant={isSecurityView ? 'outline' : 'default'}>
              <Link to="/account">Profile</Link>
            </Button>
            <Button asChild variant={isSecurityView ? 'default' : 'outline'}>
              <Link to="/account/security">Security</Link>
            </Button>
            <Button variant="outline" onClick={handleSignOut} disabled={busy}>
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>

      {isSecurityView ? (
        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Update the password for your Supabase account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handlePasswordUpdate}>
              <div className="space-y-2">
                <Label htmlFor="cloud-account-new-password">New password</Label>
                <Input
                  id="cloud-account-new-password"
                  autoComplete="new-password"
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  value={password}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cloud-account-confirm-new-password">Confirm new password</Label>
                <Input
                  id="cloud-account-confirm-new-password"
                  autoComplete="new-password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type="password"
                  value={confirmPassword}
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {message ? <p className="text-sm text-primary">{message}</p> : null}
              <Button type="submit" disabled={busy || !password || !confirmPassword}>
                {busy ? 'Updating...' : 'Update password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle>Protected routes</CardTitle>
            <CardDescription>
              `/account` and `/account/security` now require an authenticated Supabase session.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>These routes live alongside the existing wallet gate instead of replacing it.</p>
            <p>In decoy or demo sessions, the account routes fail closed and stay unavailable.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
