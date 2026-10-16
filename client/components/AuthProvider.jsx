'use client';

// AuthProvider holds the signed-in user + token pair for the whole app.
//
// It is a plain React context (no libraries). On mount it "hydrates" from
// localStorage and, if an access token is present, calls GET /auth/me to confirm
// the session is still valid. An expired access token is renewed transparently
// with the stored refresh token (see lib/api.js), and a session that cannot be
// renewed - or any 401 anywhere in the app - clears the tokens so the user is
// bounced back to /login. Logging out calls POST /auth/logout so the server
// revokes both tokens before the local copy is dropped.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(null);
  // `loading` is true until the localStorage token has been checked against
  // the API, so guards don't redirect before hydration finishes.
  const [loading, setLoading] = useState(true);

  // Persist the access + refresh pair in state + localStorage.
  const applyTokens = useCallback(({ token: nextToken, refreshToken: nextRefreshToken }) => {
    if (nextToken) api.setTokens({ token: nextToken, refreshToken: nextRefreshToken });
    else api.clearTokens();
    setTokenState(nextToken || null);
  }, []);

  // Revokes the pair server-side (best effort) and always clears it locally.
  const logout = useCallback(async () => {
    try {
      await api.logout(); // POST /auth/logout
    } finally {
      setTokenState(null);
      setUser(null);
    }
  }, []);

  // Hydrate the session once on the client.
  useEffect(() => {
    let active = true;
    const stored = api.getToken();

    if (!stored) {
      setLoading(false);
      return undefined;
    }

    setTokenState(stored);
    api
      .me() // GET /auth/me -> validates the bearer token
      .then((res) => {
        if (!active) return;
        setUser(res?.data?.user ?? null);
        // `api.me()` may have silently renewed the access token on a 401.
        setTokenState(api.getToken());
      })
      .catch((err) => {
        // A dead/invalid token should not keep the user "logged in".
        if (active && err instanceof ApiClientError && err.status === 401) {
          logout();
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [logout]);

  // Keep multiple tabs in sync (optional nicety).
  useEffect(() => {
    function onStorage(e) {
      if (e.key === 'rest_api_token' && !e.newValue) logout();
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [logout]);

  const login = useCallback(
    async ({ email, password }) => {
      const res = await api.login({ email, password }); // POST /auth/login
      const { user: nextUser, token: nextToken, refreshToken: nextRefreshToken } = res.data;
      applyTokens({ token: nextToken, refreshToken: nextRefreshToken });
      setUser(nextUser);
      return nextUser;
    },
    [applyTokens],
  );

  const register = useCallback(
    async ({ name, email, password, role }) => {
      const res = await api.register({ name, email, password, role }); // POST /auth/register
      const { user: nextUser, token: nextToken, refreshToken: nextRefreshToken } = res.data;
      applyTokens({ token: nextToken, refreshToken: nextRefreshToken });
      setUser(nextUser);
      return nextUser;
    },
    [applyTokens],
  );

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(token),
      isAdmin: user?.role === 'admin',
      login,
      register,
      logout,
      setUser,
    }),
    [user, token, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook for consuming the auth context. Throws if used outside the provider. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

export default AuthProvider;
