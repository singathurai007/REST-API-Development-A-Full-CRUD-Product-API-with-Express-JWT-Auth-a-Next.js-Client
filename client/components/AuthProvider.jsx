'use client';

// AuthProvider holds the signed-in user + token for the whole app.
//
// It is a plain React context (no libraries). On mount it "hydrates" from
// localStorage and, if a token is present, calls GET /auth/me to confirm the
// session is still valid. Any 401 anywhere in the app clears the token so the
// user is bounced back to /login.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(null);
  // `loading` is true until the localStorage token has been checked against
  // the API, so guards don't redirect before hydration finishes.
  const [loading, setLoading] = useState(true);

  // Persist a token in state + localStorage.
  const applyToken = useCallback((nextToken) => {
    if (nextToken) api.setToken(nextToken);
    else api.clearToken();
    setTokenState(nextToken || null);
  }, []);

  const logout = useCallback(() => {
    api.clearToken();
    setTokenState(null);
    setUser(null);
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
        if (active) setUser(res?.data?.user ?? null);
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
      const { user: nextUser, token: nextToken } = res.data;
      applyToken(nextToken);
      setUser(nextUser);
      return nextUser;
    },
    [applyToken],
  );

  const register = useCallback(
    async ({ name, email, password, role }) => {
      const res = await api.register({ name, email, password, role }); // POST /auth/register
      const { user: nextUser, token: nextToken } = res.data;
      applyToken(nextToken);
      setUser(nextUser);
      return nextUser;
    },
    [applyToken],
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
