'use client';

// Client-side route protection.
//
// While AuthProvider is still hydrating (`loading`), we render a spinner so we
// never flash the login page for an already-authenticated user. Once loading is
// done, anyone without a token is redirected to /login.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export default function AuthGuard({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="page-state">
        <div className="spinner" aria-hidden="true" />
        <p>Checking your session…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect is in flight; render nothing to avoid a flash of content.
    return (
      <div className="page-state">
        <div className="spinner" aria-hidden="true" />
        <p>Redirecting to login…</p>
      </div>
    );
  }

  return children;
}
