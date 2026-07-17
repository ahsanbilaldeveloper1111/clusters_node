import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext.js';

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('admin@enterprise.local');
  const [password, setPassword] = useState('Password123!');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (mode === 'register') {
        await register(email, password, fullName);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Enterprise Portal</h1>
        <p className="subtitle">Node cluster · Worker threads · PostgreSQL · AI</p>
        <div className="toolbar" style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            className={mode === 'login' ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setMode('login')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'btn-primary' : 'btn-ghost'}
            onClick={() => {
              setMode('register');
              setEmail('');
              setPassword('');
            }}
          >
            Register
          </button>
        </div>
        {error && <div className="alert error">{error}</div>}
        {mode === 'register' && (
          <label>
            Full name
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={2}
            />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
        </button>
        {mode === 'login' && (
          <p className="hint">Default: admin@enterprise.local / Password123!</p>
        )}
      </form>
    </div>
  );
}
