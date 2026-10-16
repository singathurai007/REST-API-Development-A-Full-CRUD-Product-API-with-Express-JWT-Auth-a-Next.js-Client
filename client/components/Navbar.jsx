'use client';

// Top navigation. Shows the signed-in user's name plus a role badge, and a
// logout button. The role badge makes the authorization story visible: an
// `admin` sees admin affordances, a `user` does not.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout(); // POST /auth/logout, then clears the local token pair
    router.push('/login');
  }

  return (
    <header className="navbar">
      <div className="navbar__inner">
        <Link href="/" className="navbar__brand">
          <span className="navbar__logo" aria-hidden="true">
            ⌗
          </span>
          <span>Products API Demo</span>
        </Link>

        <nav className="navbar__links">
          <Link href="/">Dashboard</Link>
          {!isAuthenticated ? <Link href="/login">Login</Link> : null}
        </nav>

        <div className="navbar__user">
          {isAuthenticated && user ? (
            <>
              <span className="navbar__name">{user.name}</span>
              <span className={`badge badge--role badge--${user.role}`}>{user.role}</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <Link href="/login" className="btn btn--primary btn--sm">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
