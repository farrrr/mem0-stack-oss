import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KeyRound, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

export default function LoginPage() {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoChecking, setAutoChecking] = useState(true);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  // On mount, check if server requires auth. If not, auto-login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // First check if server is reachable
        const healthRes = await fetch('/api/health');
        if (!healthRes.ok || cancelled) return;
        // Then check if auth is required by hitting an endpoint that needs X-API-Key
        const authRes = await fetch('/api/taxonomy');
        if (authRes.ok && !cancelled) {
          // No auth required — auto-login with empty key
          login('');
          navigate('/');
        }
        // If 401, server requires auth — show login form
      } catch {
        // Server unreachable — show login form
      } finally {
        if (!cancelled) setAutoChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [login, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError('');

    // Temporarily store key to test connection
    const keyValue = apiKey.trim();
    if (keyValue) {
      localStorage.setItem('admin_api_key', keyValue);
    }
    try {
      await api.health();
      login(keyValue);
      navigate('/');
    } catch {
      if (keyValue) localStorage.removeItem('admin_api_key');
      setError(t('login.error'));
    } finally {
      setLoading(false);
    }
  };

  if (autoChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {t('login.checking_server')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
      <div
        className="w-full max-w-sm rounded-xl p-8 shadow-lg"
        style={{ backgroundColor: 'var(--color-bg-primary)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex flex-col items-center gap-3 mb-8">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            <KeyRound size={24} />
          </div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {t('login.title')}
          </h1>
          <p className="text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
            {t('login.subtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            placeholder={t('login.placeholder')}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoFocus
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          />

          <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
            {t('login.key_optional')}
          </p>

          {error && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-danger)' }}>
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : t('login.connect')}
          </button>
        </form>
      </div>
    </div>
  );
}
