'use client';

import { Suspense, useEffect, useState } from 'react';
import { useAuth, useUser, SignIn } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';

export default function CliAuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    }>
      <CliAuthContent />
    </Suspense>
  );
}

/**
 * CLI Auth page — handles the browser-based OAuth redirect flow for the Rust CLI.
 */
function CliAuthContent() {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const searchParams = useSearchParams();
  const redirectUri = searchParams.get('redirect_uri');
  const [status, setStatus] = useState<'signing-in' | 'redirecting' | 'error' | 'no-redirect'>('signing-in');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSignedIn) return;
    if (!redirectUri) {
      setStatus('no-redirect');
      return;
    }

    // Validate redirect URI — must be localhost
    try {
      const url = new URL(redirectUri);
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
        setStatus('error');
        setError('Invalid redirect URI: must be localhost');
        return;
      }
    } catch {
      setStatus('error');
      setError('Invalid redirect URI format');
      return;
    }

    async function redirectWithToken() {
      try {
        const token = await getToken();
        if (!token) {
          setStatus('error');
          setError('Failed to get session token');
          return;
        }

        setStatus('redirecting');
        const callbackUrl = `${redirectUri}?token=${encodeURIComponent(token)}`;
        window.location.href = callbackUrl;
      } catch (e) {
        setStatus('error');
        setError(e instanceof Error ? e.message : 'Unknown error');
      }
    }

    redirectWithToken();
  }, [isSignedIn, redirectUri, getToken]);

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6">
        <div className="text-center mb-4">
          <h1 className="text-2xl font-bold">Pajama Hive CLI</h1>
          <p className="text-muted-foreground mt-1">Sign in to authenticate the CLI</p>
        </div>
        <SignIn />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center max-w-md">
        {status === 'redirecting' && (
          <>
            <h1 className="text-2xl font-bold text-green-400">Authenticated!</h1>
            <p className="text-muted-foreground mt-2">
              Redirecting to CLI... You can close this window.
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              Signed in as {user?.primaryEmailAddress?.emailAddress}
            </p>
          </>
        )}

        {status === 'no-redirect' && (
          <>
            <h1 className="text-2xl font-bold">Signed In</h1>
            <p className="text-muted-foreground mt-2">
              No redirect URI provided. If you're trying to use the CLI, run:
            </p>
            <code className="block mt-4 bg-muted p-3 rounded text-sm">hive login</code>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="text-2xl font-bold text-red-400">Authentication Error</h1>
            <p className="text-muted-foreground mt-2">{error}</p>
          </>
        )}
      </div>
    </div>
  );
}
