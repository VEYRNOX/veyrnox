// @ts-nocheck
import { Navigate, Outlet, useLocation } from 'react-router';
import Spinner from '@/components/Spinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSupabaseAuth } from '@/lib/SupabaseAuthProvider';

function CloudRouteMessage({ title, body, action }) {
  return (
    <div className="mx-auto flex max-w-2xl justify-center p-4 md:p-6">
      <Card className="w-full border-border/70 bg-card/95">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{body}</CardDescription>
        </CardHeader>
        {action ? <CardContent>{action}</CardContent> : null}
      </Card>
    </div>
  );
}

export default function ProtectedCloudRoute() {
  const location = useLocation();
  const { isAuthenticated, isConfigured, isLoading, suspended } = useSupabaseAuth();

  if (!isConfigured) {
    return (
      <CloudRouteMessage
        title="Cloud account not configured"
        body="Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable Supabase Auth for account routes."
      />
    );
  }

  if (suspended) {
    return (
      <CloudRouteMessage
        title="Unavailable in this session"
        body="Cloud account routes are disabled in decoy and demo sessions so they cannot create backend egress."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner size="lg" label="Checking account session..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/account/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
