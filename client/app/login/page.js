 'use client';

// Login / Register page (route: "/login").
//
// Demonstrates AUTHENTICATION:
//   * POST /auth/login    -> 200 with { user, token }
//   * POST /auth/register -> 201 with { user, token }
// Credentials go in the JSON REQUEST BODY; the returned bearer token is stored
// by AuthProvider and attached to every later request.
//
// Auth errors are rendered with their exact HTTP status code (401 / 409 / 422).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import Alert from '@/components/Alert';
import { ApiClientError } from '@/lib/api';

const DEMO_ACCOUNTS = [
  { label: 'Admin demo', email: 'admin@example.com', password: 'Admin@123' },
  { label: 'User demo', email: 'user@example.com', password: 'User@123' },
];

export default function LoginPage() {
  const { login, register, isAuthenticated, loading } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in? Go straight to the dashboard.
  useEffect(() => {
    if (!loading && isAuthenticated) router.replace('/');
  }, [loading, isAuthenticated, router]);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  function switchMode(next) {
    setMode(next);
    setError(null);
  }

  function fillDemo(account) {
    setMode('login');
    setError(null);
    setForm((prev) => ({ ...prev, email: account.email, password: account.password }));
  }

  function validate() {
    if (mode === 'register' && !form.name.trim()) return 'Name is required.';
    if (!form.email.trim()) return 'Email is required.';
    if (!form.password) return 'Password is required.';
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const validationMessage = validate();
    if (validationMessage) {
      setError(new ApiClientError({ status: 0, code: 'CLIENT_VALIDATION', message: validationMessage }));
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login({ email: form.email.trim(), password: form.password });
      } else {
        await register({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
        });
      }
      router.replace('/');
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  // Friendly hint per status code, on top of the raw code we always show.
  function hintFor(err) {
    if (!(err instanceof ApiClientError)) return null;
    if (err.status === 401) return 'Wrong email or password. Try the demo accounts below.';
    if (err.status === 409) return 'That email is already registered — try logging in instead.';
    if (err.status === 422) return 'Some fields failed validation. See the details below.';
    if (err.status === 0) return 'The API does not seem to be running.';
    return null;
  }

  return (
    <div className="auth-wrap">
      <div className="card">
        <h1 style={{ fontSize: '1.35rem' }}>
          {mode === 'login' ? 'Sign in' : 'Create an account'}
        </h1>
        <p className="muted" style={{ marginTop: 0 }}>
          {mode === 'login'
            ? 'Authenticate to receive a bearer token.'
            : 'Register to receive a bearer token immediately.'}
        </p>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => switchMode('login')}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => switchMode('register')}
          >
            Register
          </button>
        </div>

        {error ? (
          <div style={{ marginBottom: '1rem' }}>
            <Alert variant="error" title="Authentication failed" onDismiss={() => setError(null)}>
              {/* Raw status code, e.g. "401 INVALID_CREDENTIALS - …" */}
              <div>{error.toDisplayString ? error.toDisplayString() : error.message}</div>
              {hintFor(error) ? <div style={{ marginTop: '0.25rem' }}>{hintFor(error)}</div> : null}
              {Array.isArray(error.details) && error.details.length > 0 ? (
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                  {error.details.map((d, i) => (
                    <li key={`${d.field}-${i}`}>
                      <code>{d.field}</code>: {d.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Alert>
          </div>
        ) : null}

        <form className="form" onSubmit={handleSubmit} noValidate>
          {mode === 'register' ? (
            <label className="field">
              <span className="field__label">
                Name <span className="req">*</span>
              </span>
              <input
                className="input"
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="Ada Lovelace"
                autoComplete="name"
              />
            </label>
          ) : null}

          <label className="field">
            <span className="field__label">
              Email <span className="req">*</span>
            </span>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <label className="field">
            <span className="field__label">
              Password <span className="req">*</span>
            </span>
            <input
              type="password"
              className="input"
              value={form.password}
              onChange={(e) => set({ password: e.target.value })}
              placeholder="••••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {mode === 'register' ? (
            <label className="field">
              <span className="field__label">Role (optional)</span>
              <select
                className="input"
                value={form.role}
                onChange={(e) => set({ role: e.target.value })}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </label>
          ) : null}

          <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
            {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="demo-creds">
          <div className="field__label">Demo credentials (one click to fill)</div>
          <div className="demo-creds__row">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => fillDemo(account)}
              >
                {account.label}
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: '0.78rem', marginBottom: 0 }}>
            <code>admin@example.com</code> / <code>Admin@123</code> ·{' '}
            <code>user@example.com</code> / <code>User@123</code>
          </p>
        </div>
      </div>
    </div>
  );
}
