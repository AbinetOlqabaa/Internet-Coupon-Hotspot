import React, { useState } from 'react';

interface AuthViewProps {
  apiBase: string;
  onAuthSuccess: (token: string, user: any) => void;
}

type AuthMode = 'login' | 'register' | 'forgot' | 'reset' | 'bootstrap';

export function AuthView({ apiBase, onAuthSuccess }: AuthViewProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [businessName, setBusinessName] = useState('My Local Hotspot');
  const [displayName, setDisplayName] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const clearForm = () => {
    setError(null);
    setSuccessMessage(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Login failed');
      onAuthSuccess(data.token, data.owner);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, businessName, displayName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Registration failed');
      onAuthSuccess(data.token, data.owner);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setSuccessMessage(data.message || 'Reset instructions sent.');
      if (data.devResetToken) {
        setResetToken(data.devResetToken);
        setSuccessMessage(`Reset token generated for testing: ${data.devResetToken}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Password reset failed');
      setSuccessMessage('Password reset successfully. You may now sign in.');
      setMode('login');
      setPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/admin/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName: displayName || 'Super Administrator' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Bootstrap failed');
      onAuthSuccess(data.token, data.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bootstrap failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '1.5rem', background: 'var(--color-bg)' }}>
      <div
        style={{
          width: 'min(100%, 460px)',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-card)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-card)',
          padding: '2rem',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div className="logo" style={{ margin: '0 auto 1rem auto' }}>◉</div>
          <small style={{ color: 'var(--color-brand-secondary)', letterSpacing: '0.08em', fontWeight: 800 }}>
            INTERNET COUPON HOTSPOT
          </small>
          <h2 style={{ margin: '0.4rem 0 0.2rem', fontSize: '1.4rem' }}>
            {mode === 'login' && 'Sign In to Operations'}
            {mode === 'register' && 'Register Hotspot Business'}
            {mode === 'forgot' && 'Reset Forgotten Password'}
            {mode === 'reset' && 'Set New Password'}
            {mode === 'bootstrap' && 'Initial Administrator Bootstrap'}
          </h2>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem', margin: 0 }}>
            {mode === 'login' && 'Enter your credentials to manage packages, coupons, and access.'}
            {mode === 'register' && 'Create your owner tenant account with full operational controls.'}
            {mode === 'forgot' && 'Enter your account email to receive recovery instructions.'}
            {mode === 'reset' && 'Enter the single-use token and choose your new password.'}
            {mode === 'bootstrap' && 'Initialize the primary SUPER_ADMIN system account.'}
          </p>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', color: 'var(--color-danger)', padding: '0.75rem 1rem', borderRadius: '0.5rem', fontSize: '0.85rem', marginBottom: '1.25rem', border: '1px solid #fee2e2' }}>
            {error}
          </div>
        )}

        {successMessage && (
          <div style={{ background: '#ecfdf5', color: 'var(--color-success)', padding: '0.75rem 1rem', borderRadius: '0.5rem', fontSize: '0.85rem', marginBottom: '1.25rem', border: '1px solid #d1fae5' }}>
            {successMessage}
          </div>
        )}

        {/* LOGIN FORM */}
        {mode === 'login' && (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">Email Address</label>
              <input
                id="login-email"
                type="email"
                className="form-input"
                placeholder="operator@hotspot.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" htmlFor="login-password">Password</label>
                <button
                  type="button"
                  onClick={() => { clearForm(); setMode('forgot'); }}
                  style={{ background: 'none', border: 'none', color: 'var(--color-brand-secondary)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}
                >
                  Forgot password?
                </button>
              </div>
              <div className="password-input-wrapper">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        )}

        {/* REGISTER FORM */}
        {mode === 'register' && (
          <form onSubmit={handleRegister}>
            <div className="form-group">
              <label className="form-label">Business Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Sunset Beach WiFi"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Operator Display Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Alex Morgan"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                placeholder="alex@sunsetwifi.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password (min 8 characters)</label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>

            <button type="submit" className="btn-secondary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
              {loading ? 'Creating Account...' : 'Complete Registration'}
            </button>
          </form>
        )}

        {/* FORGOT PASSWORD FORM */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword}>
            <div className="form-group">
              <label className="form-label">Registered Email</label>
              <input
                type="email"
                className="form-input"
                placeholder="operator@hotspot.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
              {loading ? 'Sending...' : 'Request Reset Link'}
            </button>

            {resetToken && (
              <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => { clearForm(); setMode('reset'); }}
                  style={{ width: '100%' }}
                >
                  Proceed to Reset Password
                </button>
              </div>
            )}
          </form>
        )}

        {/* RESET PASSWORD FORM */}
        {mode === 'reset' && (
          <form onSubmit={handleResetPassword}>
            <div className="form-group">
              <label className="form-label">Reset Token</label>
              <input
                type="text"
                className="form-input"
                placeholder="64-character token"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">New Password (min 8 characters)</label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
              {loading ? 'Updating Password...' : 'Save New Password'}
            </button>
          </form>
        )}

        {/* BOOTSTRAP INITIAL SUPER_ADMIN FORM */}
        {mode === 'bootstrap' && (
          <form onSubmit={handleBootstrap}>
            <div className="form-group">
              <label className="form-label">Admin Full Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="System Lead"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Admin Email</label>
              <input
                type="email"
                className="form-input"
                placeholder="admin@hotspot.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Admin Master Password (min 8 characters)</label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
              {loading ? 'Bootstrapping Admin...' : 'Initialize SUPER_ADMIN Account'}
            </button>
          </form>
        )}

        {/* Footer Navigation */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--color-border)', textAlign: 'center', fontSize: '0.85rem' }}>
          {mode === 'login' ? (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button
                type="button"
                onClick={() => { clearForm(); setMode('register'); }}
                style={{ background: 'none', border: 'none', color: 'var(--color-brand-secondary)', cursor: 'pointer', fontWeight: 600 }}
              >
                Register as Owner
              </button>
              <button
                type="button"
                onClick={() => { clearForm(); setMode('bootstrap'); }}
                style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer' }}
              >
                Admin Bootstrap
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { clearForm(); setMode('login'); }}
              style={{ background: 'none', border: 'none', color: 'var(--color-brand-secondary)', cursor: 'pointer', fontWeight: 600 }}
            >
              ← Back to Sign In
            </button>
          )}
        </div>

        {/* Security Notice */}
        <div style={{ marginTop: '1.25rem', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.72rem' }}>
          Protected by server-authoritative PBKDF2 hashing &amp; progressive anti-automation rate limiting.
        </div>
      </div>
    </div>
  );
}
